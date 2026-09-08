from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.utils.file_uploads import save_optional_upload
from .models import OMRJob, OMRSubmission
from .serializers import OMRJobSerializer, OMRSubmissionSerializer


class OMRJobListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        jobs = OMRJob.objects.all()
        return Response(OMRJobSerializer(jobs, many=True).data)

    def post(self, request):
        data = request.data
        job = OMRJob.objects.create(
            title=data.get("title", "Untitled OMR Exam"),
            answer_key=data.get("answer_key", {}),
        )
        return Response(OMRJobSerializer(job).data, status=status.HTTP_201_CREATED)


class OMRJobDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, job_id):
        job = get_object_or_404(OMRJob, pk=job_id)
        return Response(OMRJobSerializer(job).data)


class OMRSubmissionListCreateView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, job_id):
        subs = OMRSubmission.objects.filter(job_id=job_id)
        return Response(OMRSubmissionSerializer(subs, many=True).data)

    def post(self, request, job_id):
        job = get_object_or_404(OMRJob, pk=job_id)
        file_obj = request.FILES.get("file") or request.FILES.get("image")
        image_url = save_optional_upload(file_obj, "omr") if file_obj else None

        detected = request.data.get("detected_answers") or {}
        if isinstance(detected, str):
            import json
            try:
                detected = json.loads(detected)
            except Exception:
                detected = {}

        # Compute score against answer_key
        answer_key = job.answer_key or {}
        correct_count = 0
        total_questions = len(answer_key) if answer_key else 1

        for q_num, correct_ans in answer_key.items():
            if str(detected.get(q_num, "")).strip().upper() == str(correct_ans).strip().upper():
                correct_count += 1

        score = round((correct_count / total_questions) * 100, 1) if total_questions > 0 else 0.0

        sub = OMRSubmission.objects.create(
            job=job,
            student_id=request.data.get("student_id", "ST-001"),
            image_url=image_url,
            detected_answers=detected,
            score=score,
            status="verified",
        )
        return Response(OMRSubmissionSerializer(sub).data, status=status.HTTP_201_CREATED)


class OMRSubmissionDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, submission_id):
        sub = get_object_or_404(OMRSubmission, pk=submission_id)
        return Response(OMRSubmissionSerializer(sub).data)
