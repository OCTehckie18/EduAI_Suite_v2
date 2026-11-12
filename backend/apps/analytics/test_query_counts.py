from django.core.cache import caches
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext

from apps.analytics import risk as engine
from apps.reports.builders import build_class_report, build_student_report

from apps.institution.test_cache import LOCMEM

from .test_risk import RiskBase


@override_settings(CACHES=LOCMEM)  # the university settings are cached in production (not while testing)
class AnalyticsQueryCountTests(RiskBase):
    """Reports and a student's own progress take a fixed number of queries, however much work the class has."""

    def setUp(self):
        super().setUp()
        caches["settings"].clear()

    def tearDown(self):
        caches["settings"].clear()

    def add_work(self, n):
        for i in range(n):
            a = self.assignment(f"Task {i}", days_ago=3 + i)
            self.hand_in(a, self.good, grade=80)
            self.hand_in(a, self.weak, grade=40)

    def count(self, fn):
        with CaptureQueriesContext(connection) as captured:
            fn()
        return len(captured)

    def test_the_class_report_does_not_grow_with_the_number_of_assignments(self):
        self.add_work(2)
        build_class_report(self.course)  # warms the settings cache
        few = self.count(lambda: build_class_report(self.course))
        self.add_work(10)
        self.assertEqual(few, self.count(lambda: build_class_report(self.course)))

    def test_the_student_report_does_not_grow_with_the_number_of_courses(self):
        build_student_report(self.good, [self.course])  # warms the settings cache
        one = self.count(lambda: build_student_report(self.good, [self.course]))
        self.assertEqual(one, self.count(lambda: build_student_report(self.good, [self.course, self.course2])))

    def test_one_students_analysis_matches_the_class_analysis_for_them(self):
        a = self.assignment("Quiz", days_ago=2)
        self.hand_in(a, self.good, grade=90)
        self.hand_in(a, self.weak, grade=30)
        whole = engine.analyse([self.course])[self.weak.pk]
        alone = engine.analyse([self.course], only_student=self.weak.pk)
        self.assertEqual(list(alone), [self.weak.pk])
        self.assertEqual((alone[self.weak.pk].score, alone[self.weak.pk].level), (whole.score, whole.level))
