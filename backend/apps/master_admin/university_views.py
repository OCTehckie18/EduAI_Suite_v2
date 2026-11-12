from datetime import datetime, time

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.calendar_app.models import CalendarEvent
from apps.core.permissions import IsMasterAdmin
from apps.institution import look as look_rules
from apps.institution import academic as academic_rules
from apps.institution import documents as document_rules
from apps.institution import terms as term_rules
from apps.institution import modules as module_rules
from apps.institution import notice as notice_rules
from apps.institution import rules as rule_book
from apps.institution.models import UniversityAsset, UniversityProfile
from apps.institution.university import clean_details, clear_logo, save_logo, university_payload

from .views import _record_admin_action


class UniversityDetailView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        return Response(university_payload(UniversityProfile.load()))

    def put(self, request):
        cleaned, errors = clean_details(request.data)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        profile = UniversityProfile.load()
        for field, value in cleaned.items():
            setattr(profile, field, value)
        with transaction.atomic():
            profile.save(update_fields=[*cleaned.keys(), "updated_at"] if cleaned else ["updated_at"])
            _record_admin_action(request, "update_university", "institution.universityprofile:1", {"fields": sorted(cleaned)})
        return Response(university_payload(profile))


class UniversityLogoUploadView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Choose an image file to upload."}, status=400)
        variant = request.data.get("variant") or request.query_params.get("variant") or "light"
        profile = UniversityProfile.load()
        try:
            save_logo(profile, uploaded, variant)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        _record_admin_action(request, "upload_university_logo", "institution.universityprofile:1", {"variant": variant})
        return Response(university_payload(profile))

    def delete(self, request):
        variant = request.query_params.get("variant") or "light"
        profile = UniversityProfile.load()
        try:
            clear_logo(profile, variant)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        _record_admin_action(request, "remove_university_logo", "institution.universityprofile:1", {"variant": variant})
        return Response(university_payload(profile))


class UniversityLookView(APIView):
    """The look beyond colours: fonts, corners, density, portal names, sign-in pages and the landing page."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        return Response(look_rules.look_payload(UniversityProfile.load()))

    def put(self, request):
        profile = UniversityProfile.load()
        cleaned, errors = look_rules.clean_look(request.data, profile.look)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        profile.look = cleaned
        with transaction.atomic():
            profile.save(update_fields=["look", "updated_at"])
            _record_admin_action(request, "update_university_look", "institution.universityprofile:1", {"groups": sorted(k for k in request.data if isinstance(request.data, dict))})
        return Response(university_payload(profile))


class UniversityLookResetView(APIView):
    """Back to the default look: removes every uploaded font, icon and background."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def post(self, request):
        profile = UniversityProfile.load()
        with transaction.atomic():
            profile.look = {}
            profile.save(update_fields=["look", "updated_at"])
            UniversityAsset.objects.all().delete()
            _record_admin_action(request, "reset_university_look", "institution.universityprofile:1")
        return Response(university_payload(profile))


class UniversityLookAssetView(APIView):
    """Upload or remove the file in one slot: heading_font, body_font, favicon, signin_background:<portal>."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, slot):
        if slot not in look_rules.SLOTS:
            return Response({"detail": "Unknown upload slot."}, status=404)
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Choose a file to upload."}, status=400)
        try:
            content, content_type = look_rules.process_upload(slot, uploaded)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        profile = UniversityProfile.load()
        look = look_rules._merged(profile.look)
        if slot in ("heading_font", "body_font"):
            family = str(request.data.get("family") or "").strip() or look_rules.font_family_name(uploaded.name)
            look[slot] = {"kind": "upload", "family": look_rules.font_family_name(family)}
        elif slot.startswith("signin_background:"):
            portal = slot.split(":", 1)[1]
            look["signin"][portal]["background"] = {"kind": "image", "colour": ""}
        with transaction.atomic():
            UniversityAsset.objects.update_or_create(
                slot=slot, defaults={"filename": uploaded.name[:150], "content_type": content_type, "data": content},
            )
            profile.look = look
            profile.save(update_fields=["look", "updated_at"])
            _record_admin_action(request, "upload_university_asset", "institution.universityprofile:1", {"slot": slot})
        return Response(university_payload(profile))

    def delete(self, request, slot):
        if slot not in look_rules.SLOTS:
            return Response({"detail": "Unknown upload slot."}, status=404)
        profile = UniversityProfile.load()
        look = look_rules._merged(profile.look)
        if slot in ("heading_font", "body_font") and look[slot].get("kind") == "upload":
            look[slot] = {"kind": "default", "family": ""}
        elif slot.startswith("signin_background:"):
            portal = slot.split(":", 1)[1]
            if look["signin"][portal]["background"].get("kind") == "image":
                look["signin"][portal]["background"] = {"kind": "brand", "colour": ""}
        with transaction.atomic():
            UniversityAsset.objects.filter(slot=slot).delete()
            profile.look = look
            profile.save(update_fields=["look", "updated_at"])
            _record_admin_action(request, "remove_university_asset", "institution.universityprofile:1", {"slot": slot})
        return Response(university_payload(profile))


class UniversityModulesView(APIView):
    """Switch modules on or off for the whole university."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        return Response({"modules": module_rules.module_catalog(UniversityProfile.load().modules)})

    def put(self, request):
        profile = UniversityProfile.load()
        states, errors = module_rules.clean_modules(request.data, profile.modules)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        before = module_rules.module_states(profile.modules)
        profile.modules = states
        with transaction.atomic():
            profile.save(update_fields=["modules", "updated_at"])
            changed = {key: states[key] for key in states if states[key] != before[key]}
            _record_admin_action(request, "update_university_modules", "institution.universityprofile:1", {"changed": changed})
        module_rules.forget_cache()
        return Response({"modules": module_rules.module_catalog(states), "university": university_payload(profile)})


class UniversityRulesView(APIView):
    """Exam, sign-in, account and risk rules for the whole university."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        return Response({"rules": rule_book.merged(UniversityProfile.load().rules), "defaults": rule_book.DEFAULT_RULES})

    def put(self, request):
        profile = UniversityProfile.load()
        rules, errors = rule_book.clean_rules(request.data, profile.rules)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        before = rule_book.merged(profile.rules)
        profile.rules = rules
        with transaction.atomic():
            profile.save(update_fields=["rules", "updated_at"])
            _record_admin_action(request, "update_university_rules", "institution.universityprofile:1", {"before": before, "after": rules})
        return Response({"rules": rules, "defaults": rule_book.DEFAULT_RULES, "university": university_payload(profile)})


class UniversityNoticeView(APIView):
    """The institution-wide notice banner and the help-desk details."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def _payload(self, profile):
        return {"notice": notice_rules.merged_notice(profile.notice), "help": notice_rules.merged_help(profile.help),
                "showing_now": notice_rules.active_notice(profile.notice) is not None}

    def get(self, request):
        return Response(self._payload(UniversityProfile.load()))

    def put(self, request):
        profile = UniversityProfile.load()
        data = request.data if isinstance(request.data, dict) else {}
        errors = {}
        notice = notice_rules.merged_notice(profile.notice)
        help_ = notice_rules.merged_help(profile.help)
        if "notice" in data:
            notice, found = notice_rules.clean_notice(data["notice"], profile.notice)
            errors.update(found)
        if "help" in data:
            help_, found = notice_rules.clean_help(data["help"], profile.help)
            errors.update({f"help.{k}": v for k, v in found.items()})
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        profile.notice, profile.help = notice, help_
        with transaction.atomic():
            profile.save(update_fields=["notice", "help", "updated_at"])
            _record_admin_action(request, "update_university_notice", "institution.universityprofile:1", {"groups": sorted(k for k in data if k in ("notice", "help"))})
        return Response({**self._payload(profile), "university": university_payload(profile)})


class UniversityAcademicView(APIView):
    """The grading scale and the academic calendar conventions."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def _payload(self, profile):
        academic = academic_rules.merged(profile.academic)
        return {
            "academic": academic,
            "presets": {"letters": academic_rules._bands(academic_rules.LETTERS), "grade_points": academic_rules._bands(academic_rules.GRADE_POINTS)},
            "timezones": sorted(academic_rules.available_timezones()),
            "months": list(academic_rules.MONTHS),
            "current": academic_rules.current_period(academic["calendar"]),
        }

    def get(self, request):
        return Response(self._payload(UniversityProfile.load()))

    def put(self, request):
        profile = UniversityProfile.load()
        academic, errors = academic_rules.clean_academic(request.data, profile.academic)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        before = academic_rules.merged(profile.academic)
        profile.academic = academic
        with transaction.atomic():
            profile.save(update_fields=["academic", "updated_at"])
            _record_admin_action(request, "update_university_academic", "institution.universityprofile:1", {"before": before, "after": academic})
        return Response({**self._payload(profile), "university": university_payload(profile)})


HOLIDAY_COLOUR = "#0f766e"


def _holiday_payload(event):
    return {"id": event.pk, "date": event.start_time.astimezone(academic_rules.university_zone()).date().isoformat(), "name": event.title}


class UniversityHolidaysView(APIView):
    """Institution-wide holidays: they appear as all-day events in every calendar (and in Google Calendar sync)."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        events = CalendarEvent.objects.filter(event_type="holiday", created_by__isnull=True).order_by("start_time")
        return Response({"results": [_holiday_payload(e) for e in events]})

    def post(self, request):
        """Add holidays from a sheet (``file``: columns Date and Name) or one at a time (``date`` and ``name``)."""
        rows = []
        uploaded = request.FILES.get("file")
        if uploaded:
            try:
                rows = _holiday_rows(uploaded)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)
        else:
            rows = [(2, request.data.get("date"), request.data.get("name"))]
        created, skipped, errors = 0, 0, []
        zone = academic_rules.university_zone()
        for number, raw_date, name in rows:
            day = academic_rules.parse_holiday_date(raw_date)
            name = str(name or "").strip()
            if day is None:
                errors.append({"row": number, "error": "The date is not valid (use 2026-12-25 or 25/12/2026)."})
                continue
            if not name or len(name) > 120:
                errors.append({"row": number, "error": "Give the holiday a name of up to 120 characters."})
                continue
            start = datetime.combine(day, time.min, tzinfo=zone)
            if CalendarEvent.objects.filter(event_type="holiday", created_by__isnull=True, title__iexact=name, start_time=start).exists():
                skipped += 1
                continue
            CalendarEvent.objects.create(title=name, start_time=start, end_time=start, is_all_day=True, event_type="holiday", color=HOLIDAY_COLOUR)
            created += 1
        if created:
            _record_admin_action(request, "add_university_holidays", "calendar_app.calendarevent", {"created": created})
        status_code = 400 if errors and not created and not skipped else 200
        return Response({"created": created, "skipped": skipped, "errors": errors}, status=status_code)


class UniversityHolidayDetailView(APIView):
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def delete(self, request, pk):
        event = get_object_or_404(CalendarEvent, pk=pk, event_type="holiday", created_by__isnull=True)
        event.delete()
        _record_admin_action(request, "remove_university_holiday", f"calendar_app.calendarevent:{pk}")
        return Response({"success": True, "id": pk})


def _holiday_rows(uploaded):
    import csv
    import io

    from openpyxl import load_workbook

    name = uploaded.name.lower()
    if name.endswith(".csv"):
        table = list(csv.reader(io.StringIO(uploaded.read().decode("utf-8-sig"))))
    elif name.endswith(".xlsx"):
        table = [list(row) for row in load_workbook(uploaded, read_only=True, data_only=True).active.iter_rows(values_only=True)]
    else:
        raise ValueError("Upload a .csv or .xlsx file with the columns Date and Name.")
    if not table:
        raise ValueError("The file is empty.")
    header = [str(c or "").strip().lower() for c in table[0]]
    if "date" not in header or "name" not in header:
        raise ValueError("The first row must have the headings Date and Name.")
    date_at, name_at = header.index("date"), header.index("name")
    rows = []
    for number, row in enumerate(table[1:], start=2):
        if not any(str(c or "").strip() for c in row):
            continue
        rows.append((number, row[date_at] if date_at < len(row) else "", row[name_at] if name_at < len(row) else ""))
    if len(rows) > 500:
        raise ValueError("Upload at most 500 holidays at a time.")
    return rows


class UniversityDocumentsView(APIView):
    """The letterhead and signatory on official documents."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        return Response({"documents": document_rules.merged(UniversityProfile.load().documents)})

    def put(self, request):
        profile = UniversityProfile.load()
        documents, errors = document_rules.clean_documents(request.data, profile.documents)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        profile.documents = documents
        with transaction.atomic():
            profile.save(update_fields=["documents", "updated_at"])
            _record_admin_action(request, "update_university_documents", "institution.universityprofile:1", {"enabled": documents["enabled"]})
        return Response({"documents": documents, "university": university_payload(profile)})


class UniversityDocumentsSampleView(APIView):
    """A one-page sample Word document with the letterhead as entered (nothing is saved)."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def post(self, request):
        from django.http import HttpResponse

        from apps.reports.builders import render_docx

        profile = UniversityProfile.load()
        documents, errors = document_rules.clean_documents(request.data, profile.documents)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        profile.documents = {**documents, "enabled": True}  # a sample always shows the letterhead
        head = document_rules.letterhead(profile)
        text = chr(10).join([
            "# Class report: Data Structures", "", "## Summary", "- 13 students enrolled, 12 graded", "- Class average: 72.5%", "",
            "## Exams", "- Mid-term: 12 completed, average 68%", "", "This is a sample page so you can check the letterhead.",
        ])
        response = HttpResponse(render_docx("Sample report", text, head), content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        response["Content-Disposition"] = 'attachment; filename="letterhead_sample.docx"'
        return response


class UniversityTermsView(APIView):
    """The university's own words for campuses, students, register numbers and so on."""
    permission_classes = [IsAuthenticated, IsMasterAdmin]

    def get(self, request):
        profile = UniversityProfile.load()
        rows = [{"key": key, "label": label, "group": group, "default_singular": s, "default_plural": p}
                for key, (label, group, s, p) in term_rules.DEFAULT_TERMS.items()]
        return Response({"terms": term_rules.merged(profile.terms), "rows": rows})

    def put(self, request):
        profile = UniversityProfile.load()
        terms, errors = term_rules.clean_terms(request.data.get("terms") if isinstance(request.data, dict) else None, profile.terms)
        if errors:
            first_field, message = next(iter(errors.items()))
            return Response({"detail": message, "errors": errors, "field": first_field}, status=400)
        profile.terms = terms
        with transaction.atomic():
            profile.save(update_fields=["terms", "updated_at"])
            _record_admin_action(request, "update_university_terms", "institution.universityprofile:1", {"changed": sorted(terms)})
        return Response({"terms": term_rules.merged(terms), "university": university_payload(profile)})
