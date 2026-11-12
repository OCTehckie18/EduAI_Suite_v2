"""One search box (Ctrl+K) across what a Master Admin looks after: people, the structure, both rosters and recent actions.

Each group returns only a few matches, so the browser never loads whole tables. Pages and settings are searched in the
browser from the menu itself.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AdmittedStaff, AdmittedStudent
from apps.core.models import ActionHistory
from apps.core.permissions import IsMasterAdmin
from apps.institution.models import Campus, Department, Program, School

PER_GROUP = 5
MIN_LENGTH = 2
MAX_LENGTH = 80


def action_words(action):
    return str(action or "").replace("_", " ")


class MasterAdminSearchView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        query = str(request.query_params.get("q", "")).strip()[:MAX_LENGTH]
        if len(query) < MIN_LENGTH:
            return Response({"query": query, "groups": []})
        groups = [
            self.users(query),
            self.structure(query),
            self.student_roster(query),
            self.teacher_roster(query),
            self.actions(query),
        ]
        return Response({"query": query, "groups": [group for group in groups if group["results"]]})

    @staticmethod
    def users(query):
        User = get_user_model()
        rows = User.objects.filter(
            Q(email__icontains=query) | Q(first_name__icontains=query) | Q(last_name__icontains=query)
            | Q(register_no__icontains=query) | Q(emp_no__icontains=query)
        ).order_by("first_name", "email")[:PER_GROUP]
        return {"key": "users", "label": "Users", "results": [
            {"id": f"user-{u.pk}", "title": u.full_name or u.email, "subtitle": " · ".join(x for x in (u.email, u.role.title().replace("_", " "), u.register_no or u.emp_no) if x),
             "tab": "users", "query": u.email}
            for u in rows
        ]}

    @staticmethod
    def structure(query):
        results = []
        for kind, model, tab in (("Campus", Campus, "structure"), ("School", School, "structure"), ("Department", Department, "structure"), ("Program", Program, "structure")):
            for row in model.objects.filter(Q(name__icontains=query) | Q(code__icontains=query)).order_by("name")[:PER_GROUP]:
                results.append({"id": f"{kind.lower()}-{row.pk}", "title": row.name, "subtitle": f"{kind} · {row.code}", "tab": tab, "query": row.name})
        return {"key": "structure", "label": "Structure", "results": results[:PER_GROUP * 2]}

    @staticmethod
    def student_roster(query):
        rows = AdmittedStudent.objects.filter(Q(register_no__icontains=query) | Q(email__icontains=query) | Q(name__icontains=query)).order_by("register_no")[:PER_GROUP]
        return {"key": "roster", "label": "Student roster", "results": [
            {"id": f"student-{r.pk}", "title": r.name or r.email, "subtitle": f"{r.register_no} · {r.email}", "tab": "roster", "query": r.register_no}
            for r in rows
        ]}

    @staticmethod
    def teacher_roster(query):
        rows = AdmittedStaff.objects.filter(Q(emp_no__icontains=query) | Q(email__icontains=query) | Q(name__icontains=query)).order_by("emp_no")[:PER_GROUP]
        return {"key": "teachers", "label": "Teacher roster", "results": [
            {"id": f"staff-{r.pk}", "title": r.name or r.email, "subtitle": f"{r.emp_no} · {r.email}", "tab": "approvals", "query": r.emp_no}
            for r in rows
        ]}

    @staticmethod
    def actions(query):
        rows = ActionHistory.objects.filter(feature="master_admin").filter(action__icontains=query.replace(" ", "_")).order_by("-timestamp")[:PER_GROUP]
        return {"key": "actions", "label": "Recent admin actions", "results": [
            {"id": f"action-{r.pk}", "title": action_words(r.action).capitalize(), "subtitle": r.timestamp.strftime("%d %b %Y %H:%M"), "tab": None, "query": ""}
            for r in rows
        ]}
