"""Admitted-student roster: the list of students the university has admitted.

A student can only create an account if their email is on this list, and the
campus / school / department / program / class / section on the account always
come from the roster, never from what the student types.
"""

import csv
import io
from dataclasses import dataclass, field

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from openpyxl import Workbook, load_workbook

from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import AdmittedStudent
from apps.institution import fields as university_fields
from apps.institution import terms as university_terms

TEMPLATE_COLUMNS = (
    "Register No", "Student Name", "Student Email",
    "Campus Code", "School Code", "Department Code", "Program Code", "Class", "Section",
)
DATA_SHEET = "Admitted students"
GUIDE_SHEET = "How to fill this in"
NOT_LISTED_MESSAGE = (
    "Your email is not on the admitted-students list. Please contact your department office."
)


def normalise_email(value):
    return str(value or "").strip().lower()


def entry_for_email(email):
    email = normalise_email(email)
    return AdmittedStudent.objects.select_related(
        "section__batch__program__department__school__campus", "user"
    ).filter(email__iexact=email).first() if email else None


def hierarchy_for(section):
    batch = section.batch
    program = batch.program
    department = program.department
    school = department.school
    return {
        "campus": school.campus, "school": school, "department": department,
        "program": program, "batch": batch, "section": section,
    }


def apply_entry_to_user(user, entry):
    """Copy identity and placement from the roster onto the account and link them."""
    for attribute, value in hierarchy_for(entry.section).items():
        setattr(user, attribute, value)
    user.register_no = entry.register_no
    if entry.name and not (user.first_name or user.last_name):
        first, _, last = entry.name.strip().partition(" ")
        user.first_name, user.last_name = first, last.strip()
    user.role = user.Role.STUDENT
    if entry.user_id != user.pk:
        entry.user = user
        entry.save(update_fields=["user", "updated_at"])


def link_existing_account(entry):
    """Connect an unlinked roster entry to the student account that already uses its email.

    Accounts made before their roster entry was uploaded (an earlier sign-in, or an entry
    removed and uploaded again) are otherwise never connected, and the roster keeps
    showing them as not signed up. Nothing is linked when the account is not a student,
    already belongs to another entry, or carries a different register number.
    """
    if entry.user_id:
        return entry.user
    User = get_user_model()
    user = User.objects.filter(email__iexact=entry.email).first()
    if user is None or user.role != User.Role.STUDENT:
        return None
    if AdmittedStudent.objects.filter(user=user).exclude(pk=entry.pk).exists():
        return None
    if user.register_no and user.register_no.strip().lower() != entry.register_no.strip().lower():
        return None
    if User.all_objects.filter(register_no__iexact=entry.register_no).exclude(pk=user.pk).exists():
        return None
    apply_entry_to_user(user, entry)
    user.save()
    return user


def link_account_to_roster(user):
    """On sign-in: connect a student to their roster entry if that never happened."""
    if user.role != user.Role.STUDENT or AdmittedStudent.objects.filter(user=user).exists():
        return
    entry = entry_for_email(user.email)
    if entry is not None and not entry.user_id:
        link_existing_account(entry)


def provision_student(entry):
    """Create (or return) the account for a roster entry; the student finishes sign-up later."""
    if entry.user_id:
        return entry.user
    User = get_user_model()
    user = User.objects.create_user(email=entry.email, role=User.Role.STUDENT, is_profile_complete=False)
    apply_entry_to_user(user, entry)
    user.save()
    return user


def entry_for_identifiers(email, register_no):
    """Roster entry that matches an email and/or register number; raises on a contradiction."""
    by_email = entry_for_email(email)
    by_register = (
        AdmittedStudent.objects.select_related("section__batch__program__department__school__campus", "user")
        .filter(register_no__iexact=str(register_no).strip()).first()
        if str(register_no or "").strip() else None
    )
    if by_email and by_register and by_email.pk != by_register.pk:
        raise ValueError(f"The email and {university_terms.get('register_no', lower=True)} belong to different {university_terms.get('student', plural=True, lower=True)} on the admitted list.")
    return by_email or by_register


# ---- import --------------------------------------------------------------

@dataclass
class RosterImportResult:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    errors: list = field(default_factory=list)

    def as_dict(self):
        return {"created": self.created, "updated": self.updated, "unchanged": self.unchanged, "errors": self.errors}


def _normalise_header(value):
    return " ".join(str(value or "").strip().lower().split())


def rows_from_file(uploaded_file, columns=None, data_sheet=None):
    columns = columns or TEMPLATE_COLUMNS
    data_sheet = data_sheet or DATA_SHEET
    name = uploaded_file.name.lower()
    if name.endswith(".csv"):
        text = uploaded_file.read().decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        headers = [_normalise_header(h) for h in next(reader, ())]
        raw = list(reader)
    elif name.endswith(".xlsx"):
        workbook = load_workbook(uploaded_file, read_only=True, data_only=True)
        sheet = workbook[data_sheet] if data_sheet in workbook.sheetnames else workbook.worksheets[0]
        rows = sheet.iter_rows(values_only=True)
        headers = [_normalise_header(h) for h in next(rows, ())]
        raw = list(rows)
    else:
        raise ValueError("Only .csv and .xlsx files are supported.")
    missing = [col for col in columns if col.lower() not in headers]
    if missing:
        raise ValueError("Missing column(s): " + ", ".join(missing) + ". Download the template to see the expected layout.")
    return [
        {headers[i]: (values[i] if i < len(values) and values[i] is not None else "") for i in range(len(headers))}
        for values in raw
        if any(str(v or "").strip() for v in values)
    ]


def _text(row, column):
    return str(row.get(column.lower(), "")).strip()


def _lookup(model, label, **filters):
    try:
        return model.objects.get(**filters)
    except model.DoesNotExist:
        raise ValueError(f"{label} not found.")


def section_for_row(row):
    campus = _lookup(Campus, f"Campus code '{_text(row, 'Campus Code')}'", code__iexact=_text(row, "Campus Code"))
    school = _lookup(School, f"School code '{_text(row, 'School Code')}' in {campus.code}", campus=campus, code__iexact=_text(row, "School Code"))
    department = _lookup(Department, f"Department code '{_text(row, 'Department Code')}' in {school.code}", school=school, code__iexact=_text(row, "Department Code"))
    program = _lookup(Program, f"Program code '{_text(row, 'Program Code')}' in {department.code}", department=department, code__iexact=_text(row, "Program Code"))
    batch = _lookup(Batch, f"Class '{_text(row, 'Class')}' in {program.code}", program=program, name__iexact=_text(row, "Class"))
    return _lookup(Section, f"Section '{_text(row, 'Section')}' in {batch.name}", batch=batch, name__iexact=_text(row, "Section"))


def import_roster(uploaded_file):
    result = RosterImportResult()
    rows = rows_from_file(uploaded_file)
    for number, row in enumerate(rows, start=2):
        try:
            with transaction.atomic():
                _import_row(row, result)
        except ValueError as exc:
            result.errors.append({"row": number, "error": str(exc)})
        except IntegrityError:
            result.errors.append({"row": number, "error": f"This {university_terms.get('register_no', lower=True)} or email is already used by another roster entry."})
    return result


def _import_row(row, result):
    register_no = _text(row, "Register No")
    email = normalise_email(_text(row, "Student Email"))
    name = _text(row, "Student Name")
    if not register_no or not email:
        raise ValueError("Register No and Student Email are required.")
    try:
        validate_email(email)
    except ValidationError:
        raise ValueError(f"'{email}' is not a valid email address.")
    section = section_for_row(row)
    format_error = university_fields.check_register(register_no, section)
    if format_error:
        raise ValueError(format_error)

    entry = entry_for_identifiers(email, register_no)
    if entry is None:
        entry = AdmittedStudent.objects.create(register_no=register_no, email=email, name=name, section=section)
        link_existing_account(entry)
        result.created += 1
        return
    if entry.user_id:
        same = (entry.register_no.lower(), entry.email, entry.section_id) == (register_no.lower(), email, section.pk)
        if not same:
            raise ValueError("This student has already signed up, so their details cannot be changed from the roster.")
        result.unchanged += 1
        return
    if (entry.register_no, entry.email, entry.name, entry.section_id) == (register_no, email, name, section.pk):
        link_existing_account(entry)
        result.unchanged += 1
        return
    entry.register_no, entry.email, entry.name, entry.section = register_no, email, name, section
    entry.save()
    link_existing_account(entry)
    result.updated += 1


def _entry_row(entry):
    section = entry.section
    batch = section.batch
    program = batch.program
    department = program.department
    school = department.school
    return [entry.register_no, entry.name, entry.email, school.campus.code, school.code,
            department.code, program.code, batch.name, section.name]


def _guide_rows():
    yield ["How to add students"]
    yield ["1. Add new students below the last row on the first sheet, using the same columns."]
    yield ["2. Editing a row updates that student. Students who have already signed up cannot be changed from here."]
    yield ["3. Deleting a row does not remove the student. Use the delete button on the roster screen for that."]
    yield ["4. Upload this same file. Students already listed stay unchanged."]
    yield []
    yield ["Example row"]
    yield list(TEMPLATE_COLUMNS)
    yield ["2641001", "Asha Rao", "asha.rao@example.com", "CEN", "SOS", "CSE", "BCA", "2026-29", "A"]
    yield []
    yield ["Valid values"]
    yield ["Campus Code", "School Code", "Department Code", "Program Code", "Class", "Section"]
    sections = Section.objects.select_related("batch__program__department__school__campus").order_by(
        "batch__program__department__school__campus__code", "batch__program__department__school__code",
        "batch__program__department__code", "batch__program__code", "batch__name", "name")
    for section in sections.iterator():
        batch = section.batch
        program = batch.program
        department = program.department
        school = department.school
        yield [school.campus.code, school.code, department.code, program.code, batch.name, section.name]


def roster_workbook():
    """Every student already on the roster, ready to have new rows added below, plus a guide sheet."""
    workbook = Workbook(write_only=True)
    data = workbook.create_sheet(DATA_SHEET)
    data.append(list(TEMPLATE_COLUMNS))
    entries = AdmittedStudent.objects.select_related(
        "section__batch__program__department__school__campus"
    ).order_by("register_no")
    count = 0
    for entry in entries.iterator():
        data.append(_entry_row(entry))
        count += 1
    guide = workbook.create_sheet(GUIDE_SHEET)
    for row in _guide_rows():
        guide.append(row)
    return workbook, count


def template_workbook():
    return roster_workbook()[0]
