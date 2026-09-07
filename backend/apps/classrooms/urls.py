from rest_framework.routers import DefaultRouter

from .views import ClassroomViewSet, EnrollmentViewSet

router = DefaultRouter()
router.register("enrollments", EnrollmentViewSet, basename="enrollment")
router.register("", ClassroomViewSet, basename="classroom")

urlpatterns = router.urls
