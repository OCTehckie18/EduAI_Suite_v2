import io
import json
import logging
import pandas as pd
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.core.models import ActionHistory
from apps.core.utils.email_utils import send_email
from services.groq_service import GroqService, DEFAULT_MODEL
from .models import MailDraft, MailHistory
from .serializers import MailDraftSerializer, MailHistorySerializer

logger = logging.getLogger(__name__)


class MailGenerateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        students = request.data.get("students", [])
        conditions = request.data.get("conditions", [])

        if not students:
            return Response({"detail": "No students provided to generate context."}, status=status.HTTP_400_BAD_REQUEST)

        cond_desc = []
        for c in conditions:
            cond_desc.append(f"{c.get('field')} {c.get('operator')} {c.get('value')}")
        conditions_str = ", ".join(cond_desc) if cond_desc else "General performance check"

        sample_students = students[:3]
        sample_str = ", ".join([s.get("name", "Student") for s in sample_students])

        prompt = f"""You are an automated academic mailing assistant for university teachers.
Generate a concise, professional, yet supportive email draft targeting students matching criteria: [{conditions_str}].
Examples of targeted students: {sample_str}.

You MUST return a JSON object with strictly two keys:
"subject": A clear, professional subject line.
"body": The body of the email. You may use placeholders like {{name}} if appropriate, but keep it directly usable as a broad notification or personal check-in. Keep it encouraging and actionable.

Return ONLY the raw JSON string."""

        client = GroqService.get_client()
        if client:
            try:
                response = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=DEFAULT_MODEL,
                    temperature=0.5,
                    response_format={"type": "json_object"},
                )
                content = response.choices[0].message.content
                return Response(json.loads(content))
            except Exception as e:
                logger.warning("Groq mail generation failed: %s", e)

        return Response({
            "subject": f"Notice Regarding Academic Performance - {conditions_str}",
            "body": f"Dear Student,\n\nThis is a notification regarding your recent standing ({conditions_str}). Please reach out during office hours to discuss how we can improve your progress.\n\nBest regards,\nFaculty",
        })


class MailFilterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        conditions = request.data.get("conditions", [])
        students = User.objects.filter(role=User.Role.STUDENT)
        results = []

        for s in students:
            match = True
            # Mock or check attributes
            for c in conditions:
                field = c.get("field", "")
                op = c.get("operator", "")
                val = float(c.get("value", 0))
                # For demonstration/compatibility with old backend:
                current_val = 80.0
                if op == "<" and not (current_val < val): match = False
                elif op == "<=" and not (current_val <= val): match = False
                elif op == ">" and not (current_val > val): match = False
                elif op == ">=" and not (current_val >= val): match = False
                elif op == "==" and not (current_val == val): match = False

            if match:
                results.append({
                    "id": s.id,
                    "name": s.full_name,
                    "email": s.email,
                    "registration_number": s.register_no or f"REG-{s.id}",
                    "attendance": 85.0,
                    "avg_score": 75.0,
                })

        return Response(results)


class MailParseExcelView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        filename = file_obj.name.lower()
        content = file_obj.read()

        try:
            if filename.endswith((".xlsx", ".xls")):
                df = pd.read_excel(io.BytesIO(content))
            elif filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            else:
                return Response({"detail": "File must be Excel or CSV"}, status=status.HTTP_400_BAD_REQUEST)

            df.columns = [str(c).lower().strip() for c in df.columns]
            students = []
            for idx, row in df.iterrows():
                students.append({
                    "id": idx + 1,
                    "name": str(row.get("name") or row.get("student_name") or f"Student {idx + 1}"),
                    "email": str(row.get("email") or ""),
                    "registration_number": str(row.get("registration_number") or row.get("reg_no") or f"R-{idx+1}"),
                    "attendance": float(row.get("attendance", 85.0)),
                    "avg_score": float(row.get("avg_score", row.get("score", 75.0))),
                })

            return Response(students)
        except Exception as e:
            return Response({"detail": f"Failed to parse file: {e}"}, status=status.HTTP_400_BAD_REQUEST)


class MailDraftListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        drafts = MailDraft.objects.all()
        return Response(MailDraftSerializer(drafts, many=True).data)

    def post(self, request):
        data = request.data
        draft = MailDraft.objects.create(
            subject=data.get("subject", ""),
            body=data.get("body", ""),
            student_ids=data.get("student_ids", []),
            conditions=data.get("conditions", []),
        )
        return Response(MailDraftSerializer(draft).data, status=status.HTTP_201_CREATED)


class MailDraftDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, draft_id):
        draft = get_object_or_404(MailDraft, pk=draft_id)
        return Response(MailDraftSerializer(draft).data)

    def delete(self, request, draft_id):
        draft = get_object_or_404(MailDraft, pk=draft_id)
        draft.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MailSendView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        subject = data.get("subject", "Notice")
        body = data.get("body", "")
        student_ids = data.get("student_ids", [])
        temp_students = data.get("temporary_students", [])

        recipients = []
        if student_ids:
            users = User.objects.filter(pk__in=student_ids)
            recipients.extend([u.email for u in users if u.email])

        if temp_students:
            recipients.extend([s.get("email") for s in temp_students if s.get("email")])

        recipients = list(set(recipients))

        for email in recipients:
            send_email(to_email=email, subject=subject, body=body)

        history = MailHistory.objects.create(
            subject=subject,
            body=body,
            recipients=recipients,
            recipient_count=len(recipients),
        )

        ActionHistory.objects.create(
            feature="mail",
            action="send_mail",
            reaction="teacher_triggered",
            result="success",
            metadata_json={
                "subject": subject,
                "recipient_count": len(recipients),
            },
        )

        return Response(MailHistorySerializer(history).data, status=status.HTTP_201_CREATED)


class MailGmailLogView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        subject = data.get("subject", "")
        body = data.get("body", "")
        recipients = data.get("recipients", [])

        history = MailHistory.objects.create(
            subject=subject,
            body=body,
            recipients=recipients,
            recipient_count=len(recipients),
        )

        ActionHistory.objects.create(
            feature="mail",
            action="send_via_gmail",
            reaction="teacher_triggered",
            result="success",
            metadata_json={
                "subject": subject,
                "recipient_count": len(recipients),
            },
        )

        return Response(MailHistorySerializer(history).data, status=status.HTTP_201_CREATED)


class MailHistoryListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        histories = MailHistory.objects.all()
        return Response(MailHistorySerializer(histories, many=True).data)


class MailHistoryDetailView(APIView):
    permission_classes = [AllowAny]

    def delete(self, request, history_id):
        history = get_object_or_404(MailHistory, pk=history_id)
        history.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
