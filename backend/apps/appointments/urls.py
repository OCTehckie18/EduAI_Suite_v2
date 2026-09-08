from django.urls import path
from .views import (
    AppointmentListCreateView,
    TeacherAppointmentListView,
    StudentAppointmentListView,
    AppointmentStatusUpdateView,
)

urlpatterns = [
    path("", AppointmentListCreateView.as_view(), name="appointment-list-create"),
    path("teacher/<str:teacher_name>", TeacherAppointmentListView.as_view(), name="appointment-teacher"),
    path("student/<str:student_name>", StudentAppointmentListView.as_view(), name="appointment-student"),
    path("<int:appointment_id>/status", AppointmentStatusUpdateView.as_view(), name="appointment-status"),
]
