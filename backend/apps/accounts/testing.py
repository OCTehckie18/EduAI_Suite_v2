"""Test helpers: students must be on the admission roster before they can sign up."""

from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import AdmittedStudent


def default_section():
    """A small Campus > School > Department > Program > Class > Section chain, created once."""
    campus, _ = Campus.objects.get_or_create(code="TST", defaults={"name": "Test Campus", "city": "Bengaluru"})
    school, _ = School.objects.get_or_create(campus=campus, code="TS", defaults={"name": "Test School"})
    department, _ = Department.objects.get_or_create(school=school, code="TD", defaults={"name": "Test Department"})
    program, _ = Program.objects.get_or_create(
        department=department, code="TP",
        defaults={"name": "Test Program", "degree_level": Program.DegreeLevel.UG, "duration_years": 3},
    )
    batch, _ = Batch.objects.get_or_create(
        program=program, name="2026-29", defaults={"start_year": 2026, "end_year": 2029, "academic_year": "2026-27"}
    )
    section, _ = Section.objects.get_or_create(batch=batch, name="A")
    return section


def admit(email, register_no, name="Test Student", section=None):
    return AdmittedStudent.objects.create(
        email=email, register_no=register_no, name=name, section=section or default_section()
    )
