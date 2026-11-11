from django.urls import path
from rest_framework.routers import DefaultRouter

from .look import UniversityAssetView
from .university import PublicUniversityView, UniversityLogoView
from .views import (
    BatchViewSet,
    CampusViewSet,
    DepartmentViewSet,
    ProgramViewSet,
    SchoolViewSet,
    SectionViewSet,
)

router = DefaultRouter()
router.register("campuses", CampusViewSet, basename="campus")
router.register("schools", SchoolViewSet, basename="school")
router.register("departments", DepartmentViewSet, basename="department")
router.register("programs", ProgramViewSet, basename="program")
router.register("batches", BatchViewSet, basename="batch")
router.register("sections", SectionViewSet, basename="section")

urlpatterns = [
    path("university/", PublicUniversityView.as_view(), name="university"),
    path("university/logo/", UniversityLogoView.as_view(), name="university-logo"),
    path("university/assets/<str:slot>/", UniversityAssetView.as_view(), name="university-asset"),
] + router.urls
