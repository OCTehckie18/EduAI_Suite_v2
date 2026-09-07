from rest_framework.routers import DefaultRouter

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

urlpatterns = router.urls
