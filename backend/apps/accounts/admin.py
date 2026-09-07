from django.contrib import admin

from .models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("email", "role", "is_profile_complete", "is_active", "is_staff")
    list_filter = ("role", "is_profile_complete", "is_active", "is_staff")
    search_fields = ("email", "register_no", "emp_no", "first_name", "last_name")
