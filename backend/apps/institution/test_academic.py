import io
from datetime import datetime, timezone as dt_timezone

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from openpyxl import Workbook
from rest_framework.test import APITestCase

from apps.calendar_app.feed import build_feed
from apps.calendar_app.models import CalendarEvent
from apps.reports.builders import _pct

from . import academic
from .models import UniversityProfile

User = get_user_model()
ACADEMIC = "/api/v1/master-admin/university/academic/"
HOLIDAYS = "/api/v1/master-admin/university/holidays/"
PUBLIC = "/api/v1/institution/university/"


def set_academic(**groups):
    profile = UniversityProfile.load()
    profile.academic = groups
    profile.save()


class GradingTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def put(self, body):
        return self.client.put(ACADEMIC, body, format="json")

    def test_the_default_shows_plain_percentages(self):
        body = self.client.get(PUBLIC).json()["academic"]
        self.assertEqual((body["grading"]["scale"], body["grading"]["bands"], body["grading"]["pass_mark"]), ("percentage", [], 40))
        self.assertEqual(body["calendar"]["week_starts"], "sunday")
        self.assertIsNone(academic.grade_for(None, academic.merged({})["grading"]))
        grade = academic.grade_for(72, academic.merged({})["grading"])
        self.assertEqual((grade["label"], grade["passed"]), (None, True))

    def test_the_ready_made_letter_scale_grades_every_mark(self):
        grading = academic.merged({"grading": {"scale": "letters"}})["grading"]
        expected = {100: "O", 90: "O", 89.9: "A+", 80: "A+", 70: "A", 60: "B+", 55: "B", 50: "C", 40: "P", 39.9: "F", 0: "F"}
        for percent, label in expected.items():
            self.assertEqual(academic.grade_for(percent, grading)["label"], label, percent)
        self.assertEqual((academic.grade_for(95, grading)["points"], academic.grade_for(39, grading)["passed"]), (10, False))

    def test_grade_points_show_the_number(self):
        grading = academic.merged({"grading": {"scale": "grade_points"}})["grading"]
        self.assertEqual([academic.grade_for(p, grading)["label"] for p in (95, 82, 41, 10)], ["10", "9", "4", "0"])

    def test_a_scale_and_pass_mark_are_saved_audited_and_public(self):
        response = self.put({"grading": {"scale": "letters", "pass_mark": 35}})
        self.assertEqual(response.status_code, 200, response.content)
        self.client.force_authenticate(None)
        grading = self.client.get(PUBLIC).json()["academic"]["grading"]
        self.assertEqual((grading["scale"], grading["pass_mark"], grading["bands"][0]["label"]), ("letters", 35, "O"))

    def test_custom_bands_are_validated_and_sorted(self):
        bands = [{"min": 0, "label": "Fail", "points": 0}, {"min": 75, "label": "Dist", "points": 4}, {"min": 40, "label": "Pass", "points": 2}]
        response = self.put({"grading": {"scale": "custom", "custom_bands": bands}})
        self.assertEqual(response.status_code, 200, response.content)
        grading = self.client.get(PUBLIC).json()["academic"]["grading"]
        self.assertEqual([b["label"] for b in grading["bands"]], ["Dist", "Pass", "Fail"])
        self.assertEqual(academic.grade_for(80, academic.merged(UniversityProfile.load().academic)["grading"])["label"], "Dist")

    def test_wrong_grading_values_are_refused_naming_the_field(self):
        good = {"min": 0, "label": "F", "points": 0}
        for body, field in (
            ({"grading": {"scale": "stars"}}, "grading.scale"),
            ({"grading": {"pass_mark": 120}}, "grading.pass_mark"),
            ({"grading": {"pass_mark": "high"}}, "grading.pass_mark"),
            ({"grading": {"custom_bands": [good]}}, "grading.custom_bands"),
            ({"grading": {"custom_bands": [{"min": 50, "label": "P", "points": 1}, {"min": 40, "label": "F", "points": 0}]}}, "grading.custom_bands"),
            ({"grading": {"custom_bands": [good, {"min": 0, "label": "G", "points": 1}]}}, "grading.custom_bands"),
            ({"grading": {"custom_bands": [good, {"min": 50, "label": "F", "points": 1}]}}, "grading.custom_bands"),
            ({"grading": {"custom_bands": [good, {"min": 50, "label": "Way too long", "points": 1}]}}, "grading.custom_bands"),
            ({"grading": {"custom_bands": [good, {"min": 50, "label": "P", "points": 11}]}}, "grading.custom_bands"),
        ):
            response = self.put(body)
            self.assertEqual((response.status_code, response.json()["field"]), (400, field), body)
        self.assertEqual(UniversityProfile.load().academic, {})

    def test_only_a_master_admin_can_change_it(self):
        self.client.force_authenticate(User.objects.create_user(email="t@x.com", password="pw", role="TEACHER"))
        self.assertEqual(self.put({"grading": {"scale": "letters"}}).status_code, 403)

    def test_written_reports_carry_the_grade_only_when_the_scale_has_one(self):
        self.assertEqual(_pct(72.5), "72.5%")
        set_academic(grading={"scale": "letters"})
        self.assertEqual(_pct(72.5), "72.5% (A)")
        self.assertEqual(_pct(None), "Not recorded")


class CalendarSettingsTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.client.force_authenticate(self.master)

    def put(self, body):
        return self.client.put(ACADEMIC, body, format="json")

    def test_settings_are_saved_and_the_current_term_is_worked_out(self):
        response = self.put({"calendar": {"year_start_month": 6, "term_name": "Trimester", "terms_per_year": 3, "timezone": "Europe/London", "date_format": "DD/MM/YYYY", "week_starts": "monday"}})
        self.assertEqual(response.status_code, 200, response.content)
        calendar = self.client.get(PUBLIC).json()["academic"]["calendar"]
        self.assertEqual((calendar["timezone"], calendar["week_starts"], calendar["date_format"]), ("Europe/London", "monday", "DD/MM/YYYY"))
        january = datetime(2027, 1, 15, 12, tzinfo=dt_timezone.utc)
        self.assertEqual(academic.current_period(calendar, january), {"year_label": "2026-27", "term_label": "Trimester 2"})
        march = datetime(2027, 3, 10, tzinfo=dt_timezone.utc)
        self.assertEqual(academic.current_period(calendar, march)["term_label"], "Trimester 3")
        august = datetime(2026, 8, 1, tzinfo=dt_timezone.utc)
        self.assertEqual(academic.current_period(calendar, august), {"year_label": "2026-27", "term_label": "Trimester 1"})
        default = academic.merged({})["calendar"]
        self.assertEqual(academic.current_period(default, january)["year_label"], "2027")

    def test_a_year_with_one_term_has_no_number(self):
        calendar = {**academic.merged({})["calendar"], "terms_per_year": 1, "term_name": "Year"}
        self.assertEqual(academic.current_period(calendar)["term_label"], "Year")

    def test_wrong_calendar_values_are_refused_naming_the_field(self):
        for body, field in (
            ({"calendar": {"year_start_month": 13}}, "calendar.year_start_month"),
            ({"calendar": {"term_name": ""}}, "calendar.term_name"),
            ({"calendar": {"terms_per_year": 5}}, "calendar.terms_per_year"),
            ({"calendar": {"timezone": "Mars/Olympus"}}, "calendar.timezone"),
            ({"calendar": {"date_format": "YY.MM.DD"}}, "calendar.date_format"),
            ({"calendar": {"week_starts": "friday"}}, "calendar.week_starts"),
        ):
            response = self.put(body)
            self.assertEqual((response.status_code, response.json()["field"]), (400, field), body)

    def test_the_universitys_time_zone_decides_what_local_time_is(self):
        self.put({"calendar": {"timezone": "America/New_York"}})
        self.client.get(PUBLIC)  # any request activates the zone while it runs
        events = CalendarEvent.objects.create(title="Class", start_time=datetime(2026, 12, 1, 3, 0, tzinfo=dt_timezone.utc))
        self.assertEqual(academic.university_zone().key, "America/New_York")
        self.assertIsNotNone(events.pk)


class HolidayTests(APITestCase):
    def setUp(self):
        self.master = User.objects.create_user(email="m@x.com", password="pw", role="MASTER_ADMIN")
        self.student = User.objects.create_user(email="s@x.com", password="pw", role="STUDENT")
        self.client.force_authenticate(self.master)

    def sheet(self, rows, name="holidays.xlsx"):
        workbook = Workbook()
        for row in rows:
            workbook.active.append(row)
        buffer = io.BytesIO()
        workbook.save(buffer)
        return SimpleUploadedFile(name, buffer.getvalue())

    def test_a_sheet_adds_holidays_that_appear_in_everyones_calendar(self):
        file = self.sheet([["Date", "Name"], ["2027-01-26", "Republic Day"], ["15/08/2027", "Independence Day"], ["bad date", "Oops"], ["2027-12-25", ""]])
        response = self.client.post(HOLIDAYS, {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual((body["created"], [e["row"] for e in body["errors"]]), (2, [4, 5]))
        listed = self.client.get(HOLIDAYS).json()["results"]
        self.assertEqual([(h["date"], h["name"]) for h in listed], [("2027-01-26", "Republic Day"), ("2027-08-15", "Independence Day")])
        feed = build_feed(self.student)
        holiday = next(e for e in feed if e["title"] == "Republic Day")
        self.assertEqual((holiday["is_all_day"], holiday["type"]), (True, "holiday"))

    def test_uploading_the_same_sheet_again_adds_nothing(self):
        for _ in range(2):
            response = self.client.post(HOLIDAYS, {"file": self.sheet([["Date", "Name"], ["2027-01-26", "Republic Day"]])}, format="multipart")
        self.assertEqual((response.json()["created"], response.json()["skipped"]), (0, 1))
        self.assertEqual(CalendarEvent.objects.filter(event_type="holiday").count(), 1)

    def test_one_holiday_can_be_added_and_removed_by_hand(self):
        response = self.client.post(HOLIDAYS, {"date": "2027-11-01", "name": "Founders Day"}, format="json")
        self.assertEqual(response.json()["created"], 1)
        holiday = self.client.get(HOLIDAYS).json()["results"][0]
        self.assertEqual(self.client.delete(f"{HOLIDAYS}{holiday['id']}/").status_code, 200)
        self.assertEqual(self.client.get(HOLIDAYS).json()["results"], [])

    def test_a_sheet_without_the_right_headings_is_explained(self):
        response = self.client.post(HOLIDAYS, {"file": self.sheet([["When", "What"], ["2027-01-26", "x"]])}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Date and Name", response.json()["detail"])
        self.assertEqual(self.client.post(HOLIDAYS, {"file": SimpleUploadedFile("h.pdf", b"x")}, format="multipart").status_code, 400)

    def test_only_a_master_admin_can_manage_holidays_and_only_holidays_can_be_deleted(self):
        personal = CalendarEvent.objects.create(title="Mine", start_time=timezone.now(), created_by=self.master)
        self.assertEqual(self.client.delete(f"{HOLIDAYS}{personal.pk}/").status_code, 404)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(HOLIDAYS).status_code, 403)
        self.assertEqual(self.client.post(HOLIDAYS, {"date": "2027-11-01", "name": "x"}, format="json").status_code, 403)
