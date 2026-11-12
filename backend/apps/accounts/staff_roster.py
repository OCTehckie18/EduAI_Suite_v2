"""Teacher roster: the list of teachers the university has listed.

A teacher whose email is on this list is approved as soon as they sign in on TeacherBuddy,
with their department and employee number taken from the list. A teacher who is not listed
can still apply and waits for the master admin, exactly as before.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone
from openpyxl import Workbook

from apps.institution.models import Campus, Department, School

from .models import AdmittedStaff
from .roster import RosterImportResult, _lookup, _text, normalise_email, rows_from_file
from apps.institution import fields as university_fields
from apps.institution import terms as university_terms

DATA_SHEET = "Teachers"
GUIDE_SHEET = "How to fill this in"
TEMPLATE_COLUMNS = ("Employee No", "Name", "Email", "Campus Code", "School Code", "Department Code", "Designation")
SELECT = ("department__school__campus", "user")


def entry_for_email(email):
    email = normalise_email(email)
    return AdmittedStaff.objects.select_related(*SELECT).filter(email__iexact=email).first() if email else None


def entry_for_user(user):
    """The staff entry of a teacher: the one already linked, else the one with their email."""
    linked = AdmittedStaff.objects.select_related(*SELECT).filter(user=user).first()
    return linked or entry_for_email(user.email)


def entry_for_identifiers(email, emp_no):
    by_email = entry_for_email(email)
    emp_no = str(emp_no or "").strip()
    by_emp = AdmittedStaff.objects.select_related(*SELECT).filter(emp_no__iexact=emp_no).first() if emp_no else None
    if by_email and by_emp and by_email.pk != by_emp.pk:
        raise ValueError(f"The email and {university_terms.get('employee_no', lower=True)} belong to different {university_terms.get('teacher', plural=True, lower=True)} on the teacher roster.")
    return by_email or by_emp


def apply_entry_to_user(user, entry):
    """Copy identity and placement from the roster onto a teacher account, approve it and link it."""
    department = entry.department
    user.department = department
    user.school = department.school
    user.campus = department.school.campus
    user.emp_no = entry.emp_no
    if entry.name and not (user.first_name or user.last_name):
        first, _, last = entry.name.strip().partition(" ")
        user.first_name, user.last_name = first, last.strip()
    user.role = user.Role.TEACHER
    if user.approval_status != user.ApprovalStatus.APPROVED:
        user.approval_status = user.ApprovalStatus.APPROVED
        user.rejection_reason = ""
        user.approval_reviewed_at = timezone.now()
        user.approval_reviewed_by = None  # approved by the roster, not by a person
    if entry.user_id != user.pk:
        entry.user = user
        entry.save(update_fields=["user", "updated_at"])


def link_existing_account(entry):
    """Connect an unlinked entry to the teacher account that already uses its email.

    A teacher who applied before being listed is approved by this. Nothing is linked when the
    account is not a teacher, already belongs to another entry, or has a different employee number.
    """
    if entry.user_id:
        return entry.user
    User = get_user_model()
    user = User.objects.filter(email__iexact=entry.email).first()
    if user is None or user.role != User.Role.TEACHER:
        return None
    if AdmittedStaff.objects.filter(user=user).exclude(pk=entry.pk).exists():
        return None
    if user.emp_no and user.emp_no.strip().lower() != entry.emp_no.strip().lower():
        return None
    if User.all_objects.filter(emp_no__iexact=entry.emp_no).exclude(pk=user.pk).exists():
        return None
    apply_entry_to_user(user, entry)
    user.save()
    return user


def link_account_to_roster(user):
    """On sign-in: connect (and approve) a teacher who is on the roster but was never linked."""
    if user.role != user.Role.TEACHER or AdmittedStaff.objects.filter(user=user).exists():
        return
    entry = entry_for_email(user.email)
    if entry is not None and not entry.user_id:
        link_existing_account(entry)
        user.refresh_from_db()


def provision_teacher(entry):
    """Create (or return) the approved teacher account for a listed email."""
    if entry.user_id:
        return entry.user
    User = get_user_model()
    try:
        with transaction.atomic():  # all or nothing: a conflict must not leave a half-made account
            user = User.objects.create_user(email=entry.email, role=User.Role.TEACHER, approval_status=User.ApprovalStatus.APPROVED)
            apply_entry_to_user(user, entry)
            user.save()
    except IntegrityError as exc:
        from .roster import IdentifierConflict

        raise IdentifierConflict(f"This {university_terms.get('employee_no', lower=True)} is already linked to another account. Please contact the administration.") from exc
    return user


def add_teacher_to_roster(user):
    """Put an existing teacher (for example one just approved by hand) on the roster. None if they cannot be added."""
    if AdmittedStaff.objects.filter(user=user).exists() or not user.emp_no or not user.department_id:
        return None
    if AdmittedStaff.objects.filter(email__iexact=user.email).exists() or AdmittedStaff.objects.filter(emp_no__iexact=user.emp_no).exists():
        return None
    return AdmittedStaff.objects.create(
        emp_no=user.emp_no, email=user.email, name=user.full_name if (user.first_name or user.last_name) else "",
        department=user.department, user=user,
    )


# ---- import --------------------------------------------------------------

def department_for_row(row):
    campus = _lookup(Campus, f"Campus code '{_text(row, 'Campus Code')}'", code__iexact=_text(row, "Campus Code"))
    school = _lookup(School, f"School code '{_text(row, 'School Code')}' in {campus.code}", campus=campus, code__iexact=_text(row, "School Code"))
    return _lookup(Department, f"Department code '{_text(row, 'Department Code')}' in {school.code}", school=school, code__iexact=_text(row, "Department Code"))


def import_staff_roster(uploaded_file):
    result = RosterImportResult()
    rows = rows_from_file(uploaded_file, TEMPLATE_COLUMNS, DATA_SHEET)
    for number, row in enumerate(rows, start=2):
        try:
            with transaction.atomic():
                _import_row(row, result)
        except ValueError as exc:
            result.errors.append({"row": number, "error": str(exc)})
        except IntegrityError:
            result.errors.append({"row": number, "error": f"This {university_terms.get('employee_no', lower=True)} or email is already used by another {university_terms.get('teacher', lower=True)} on the roster."})
    return result


def _import_row(row, result):
    emp_no = _text(row, "Employee No")
    email = normalise_email(_text(row, "Email"))
    name = _text(row, "Name")
    designation = _text(row, "Designation")
    if not emp_no or not email:
        raise ValueError("Employee No and Email are required.")
    format_error = university_fields.check_id("employee_no", emp_no)
    if format_error:
        raise ValueError(format_error)
    try:
        validate_email(email)
    except ValidationError:
        raise ValueError(f"'{email}' is not a valid email address.")
    department = department_for_row(row)

    entry = entry_for_identifiers(email, emp_no)
    if entry is None:
        entry = AdmittedStaff.objects.create(emp_no=emp_no, email=email, name=name, department=department, designation=designation)
        link_existing_account(entry)
        result.created += 1
        return
    if entry.user_id:
        same = (entry.emp_no.lower(), entry.email, entry.department_id) == (emp_no.lower(), email, department.pk)
        if not same:
            raise ValueError("This teacher has already signed up, so their details cannot be changed from the roster.")
        result.unchanged += 1
        return
    if (entry.emp_no, entry.email, entry.name, entry.department_id, entry.designation) == (emp_no, email, name, department.pk, designation):
        link_existing_account(entry)
        result.unchanged += 1
        return
    entry.emp_no, entry.email, entry.name, entry.department, entry.designation = emp_no, email, name, department, designation
    entry.save()
    link_existing_account(entry)
    result.updated += 1


# ---- download ------------------------------------------------------------

def _guide_rows():
    yield ["How to add teachers"]
    yield ["1. Add new teachers below the last row on the first sheet, using the same columns."]
    yield ["2. Editing a row updates that teacher. Teachers who have already signed up cannot be changed from here."]
    yield ["3. Deleting a row does not remove the teacher. Use the delete button on the roster screen for that."]
    yield ["4. Upload this same file. Teachers already listed stay unchanged."]
    yield ["5. A listed teacher is approved automatically when they sign in on TeacherBuddy."]
    yield []
    yield ["Example row"]
    yield list(TEMPLATE_COLUMNS)
    yield ["EMP1001", "Dr. Meera Nair", "meera.nair@example.com", "CEN", "SOS", "CSE", "Associate Professor"]
    yield []
    yield ["Valid values"]
    yield ["Campus Code", "School Code", "Department Code"]
    departments = Department.objects.select_related("school__campus").order_by("school__campus__code", "school__code", "code")
    for department in departments.iterator():
        yield [department.school.campus.code, department.school.code, department.code]


def staff_workbook():
    """Every teacher already listed, ready to have new rows added below, plus a guide sheet."""
    workbook = Workbook(write_only=True)
    data = workbook.create_sheet(DATA_SHEET)
    data.append(list(TEMPLATE_COLUMNS))
    count = 0
    for entry in AdmittedStaff.objects.select_related("department__school__campus").order_by("emp_no").iterator():
        department = entry.department
        data.append([entry.emp_no, entry.name, entry.email, department.school.campus.code, department.school.code, department.code, entry.designation])
        count += 1
    guide = workbook.create_sheet(GUIDE_SHEET)
    for row in _guide_rows():
        guide.append(row)
    return workbook, count
