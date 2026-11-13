from django.urls import path
from rest_framework.routers import DefaultRouter

from .staff_views import (
    ActionLogView, AllAdminsView, CampusAdminActionView, CampusAdminsView, StaffLoginView, StaffLogoutView, StaffMeView,
    TestConnectionView,
)
from .views import DemoRequestCreateView, HealthView, StaffCampusViewSet, StaffDemoRequestViewSet

router = DefaultRouter(trailing_slash=True)
router.include_root_view = False
router.register("staff/demo-requests", StaffDemoRequestViewSet, basename="staff-demo-request")
router.register("staff/campuses", StaffCampusViewSet, basename="staff-campus")

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("demo-requests/", DemoRequestCreateView.as_view(), name="demo-request-create"),
    path("staff/login/", StaffLoginView.as_view()),
    path("staff/logout/", StaffLogoutView.as_view()),
    path("staff/me/", StaffMeView.as_view()),
    path("staff/admins/", AllAdminsView.as_view()),
    path("staff/actions/", ActionLogView.as_view()),
    path("staff/campuses/<slug:slug>/admins/", CampusAdminsView.as_view()),
    path("staff/campuses/<slug:slug>/admins/<int:admin_id>/<str:action>/", CampusAdminActionView.as_view()),
    path("staff/campuses/<slug:slug>/test-connection/", TestConnectionView.as_view()),
    *router.urls,
]
