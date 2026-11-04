from datetime import datetime
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom
from apps.core.access import can_manage_course, can_view_course
from apps.core.permissions import IsTeacher
from apps.core.utils.file_uploads import save_optional_upload
from .models import Announcement
from .serializers import AnnouncementSerializer


class AnnouncementListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        return [IsTeacher()] if self.request.method == "POST" else super().get_permissions()

    def get(self, request, course_id):
        classroom = get_object_or_404(Classroom, pk=course_id)
        if not can_view_course(request.user, classroom):
            return Response({"detail": "You do not have permission to do that for this course."}, status=status.HTTP_403_FORBIDDEN)
        announcements = Announcement.objects.filter(course_id=course_id).order_by("-pinned", "-created_at")
        serializer = AnnouncementSerializer(announcements, many=True)
        return Response(serializer.data)

    def post(self, request, course_id):
        classroom = get_object_or_404(Classroom, pk=course_id)
        if not can_manage_course(request.user, classroom):
            return Response({"detail": "You do not have permission to do that for this course."}, status=status.HTTP_403_FORBIDDEN)
        data = request.data

        title = data.get("title", "")
        body = data.get("body", "")
        time_str = data.get("time", "Just now")
        pinned_raw = data.get("pinned", False)
        pinned = str(pinned_raw).lower() in ("true", "1", "t")

        if time_str == "Just now" or not time_str:
            time_str = datetime.now().strftime("%I:%M %p, %d %b")

        file_obj = request.FILES.get("file")
        attachment_path = save_optional_upload(file_obj, "announcements") if file_obj else None

        announcement = Announcement.objects.create(
            course=classroom,
            title=title,
            body=body,
            time=time_str,
            pinned=pinned,
            attachment_path=attachment_path,
        )

        serializer = AnnouncementSerializer(announcement)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AnnouncementDetailView(APIView):
    permission_classes = [IsTeacher]

    def delete(self, request, announcement_id):
        announcement = get_object_or_404(Announcement.objects.select_related("course"), pk=announcement_id)
        if not can_manage_course(request.user, announcement.course):
            return Response({"detail": "You do not have permission to do that for this course."}, status=status.HTTP_403_FORBIDDEN)
        announcement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
