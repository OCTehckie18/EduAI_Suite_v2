from django.contrib import admin

from .models import Campus, DemoRequest


@admin.register(DemoRequest)
class DemoRequestAdmin(admin.ModelAdmin):
    list_display = ["institution", "name", "role", "work_email", "approx_students", "status", "created_at"]
    list_filter = ["status", "created_at"]
    list_editable = ["status"]
    search_fields = ["institution", "name", "work_email", "city"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Campus)
class CampusAdmin(admin.ModelAdmin):
    list_display = ["college_name", "slug", "plan", "status", "seat_limit", "renewal_date"]
    list_filter = ["plan", "status"]
    search_fields = ["college_name", "slug", "contact_email"]
    prepopulated_fields = {"slug": ["college_name"]}
    readonly_fields = ["created_at", "updated_at"]
