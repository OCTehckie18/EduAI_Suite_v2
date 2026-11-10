from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import staff_roster
from apps.accounts.models import AdmittedStaff
from apps.core.permissions import IsMasterAdmin

from .views import _record_admin_action

MAX_ROWS = 200


def _status(entry):
    user = entry.user
    if user is None:
        return "not_signed_up"
    if not user.is_active:
        return "deactivated"
    return "signed_up" if user.is_profile_complete else "not_signed_up"


def _entry_payload(entry):
    department = entry.department
    school = department.school
    return {
        "id": entry.pk, "emp_no": entry.emp_no, "name": entry.name, "email": entry.email,
        "campus": school.campus.name, "school": school.name, "department": department.name,
        "designation": entry.designation, "status": _status(entry), "account_created": bool(entry.user_id),
    }


class StaffRosterListView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        entries = AdmittedStaff.objects.select_related("department__school__campus", "user")
        total = entries.count()
        signed_up = entries.filter(user__is_profile_complete=True, user__is_active=True).count()
        wanted = request.query_params.get("status", "all")
        if wanted == "signed_up":
            entries = entries.filter(user__is_profile_complete=True, user__is_active=True)
        elif wanted == "deactivated":
            entries = entries.filter(user__is_active=False)
        elif wanted == "not_signed_up":
            entries = entries.exclude(user__is_profile_complete=True, user__is_active=True).exclude(user__is_active=False)
        search = request.query_params.get("search", "").strip()
        if search:
            entries = entries.filter(Q(emp_no__icontains=search) | Q(email__icontains=search) | Q(name__icontains=search))
        matching = entries.count()
        return Response({
            "total": total, "signed_up": signed_up, "count": matching,
            "results": [_entry_payload(entry) for entry in entries[:MAX_ROWS]],
        })


class StaffRosterImportView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Choose a CSV or XLSX file to upload."}, status=400)
        try:
            result = staff_roster.import_staff_roster(uploaded)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        _record_admin_action(
            request, "import_staff_roster", "accounts.admittedstaff",
            {"created": result.created, "updated": result.updated, "errors": len(result.errors)},
        )
        return Response(result.as_dict())


class StaffRosterTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response["Content-Disposition"] = f'attachment; filename="teachers_{timezone.localdate().isoformat()}.xlsx"'
        workbook, count = staff_roster.staff_workbook()
        workbook.save(response)
        _record_admin_action(request, "download_staff_roster", "accounts.admittedstaff", {"rows": count})
        return response


class StaffRosterDetailView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def delete(self, request, pk):
        entry = get_object_or_404(AdmittedStaff, pk=pk)
        if entry.user_id:
            return Response(
                {"detail": "This teacher already has an account, so they cannot be removed from the roster."},
                status=409,
            )
        entry.delete()
        _record_admin_action(request, "remove_staff_roster_entry", f"accounts.admittedstaff:{pk}")
        return Response({"success": True, "id": pk})
