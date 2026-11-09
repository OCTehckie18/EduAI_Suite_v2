from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DemoRequestCreateView, HealthView, StaffCampusViewSet, StaffDemoRequestViewSet

router = DefaultRouter(trailing_slash=True)
router.include_root_view = False
router.register("staff/demo-requests", StaffDemoRequestViewSet, basename="staff-demo-request")
router.register("staff/campuses", StaffCampusViewSet, basename="staff-campus")

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("demo-requests/", DemoRequestCreateView.as_view(), name="demo-request-create"),
    *router.urls,
]
