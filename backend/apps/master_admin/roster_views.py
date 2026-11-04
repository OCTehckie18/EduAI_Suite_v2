from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import roster
from apps.accounts.models import AdmittedStudent
from apps.core.permissions import IsMasterAdmin

from .views import _record_admin_action

MAX_ROWS = 200


def _entry_payload(entry):
    section = entry.section
    batch = section.batch
    program = batch.program
    department = program.department
    school = department.school
    user = entry.user
    return {
        "id": entry.pk,
        "register_no": entry.register_no,
        "name": entry.name,
        "email": entry.email,
        "campus": school.campus.name,
        "school": school.name,
        "department": department.name,
        "program": program.name,
        "class_name": batch.name,
        "section": section.name,
        "status": "signed_up" if user and user.is_profile_complete else "not_signed_up",
        "account_created": bool(user),
    }


class RosterListView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        entries = AdmittedStudent.objects.select_related(
            "section__batch__program__department__school__campus", "user"
        )
        total = entries.count()
        signed_up = entries.filter(user__is_profile_complete=True).count()
        wanted = request.query_params.get("status", "all")
        if wanted == "signed_up":
            entries = entries.filter(user__is_profile_complete=True)
        elif wanted == "not_signed_up":
            entries = entries.exclude(user__is_profile_complete=True)
        search = request.query_params.get("search", "").strip()
        if search:
            from django.db.models import Q
            entries = entries.filter(
                Q(register_no__icontains=search) | Q(email__icontains=search) | Q(name__icontains=search)
            )
        batch_id = request.query_params.get("class_id")
        if batch_id:
            entries = entries.filter(section__batch_id=batch_id)
        matching = entries.count()
        return Response({
            "total": total,
            "signed_up": signed_up,
            "count": matching,
            "results": [_entry_payload(entry) for entry in entries[:MAX_ROWS]],
        })


class RosterImportView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Choose a CSV or XLSX file to upload."}, status=400)
        try:
            result = roster.import_roster(uploaded)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        _record_admin_action(
            request, "import_student_roster", "accounts.admittedstudent",
            {"created": result.created, "updated": result.updated, "errors": len(result.errors)},
        )
        return Response(result.as_dict())


class RosterTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="admitted_students_template.xlsx"'
        roster.template_workbook().save(response)
        return response


class RosterDetailView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def delete(self, request, pk):
        entry = get_object_or_404(AdmittedStudent, pk=pk)
        if entry.user_id:
            return Response(
                {"detail": "This student already has an account, so they cannot be removed from the roster."},
                status=409,
            )
        entry.delete()
        _record_admin_action(request, "remove_roster_entry", f"accounts.admittedstudent:{pk}")
        return Response({"success": True, "id": pk})
