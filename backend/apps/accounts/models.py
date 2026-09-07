from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from apps.core.models import SoftDeleteModel
from apps.institution.models import Batch, Campus, Department, Program, School, Section


class UserManager(BaseUserManager):
    def get_queryset(self):
        return super().get_queryset().filter(is_active=True)

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.MASTER_ADMIN)
        extra_fields.setdefault("is_profile_complete", True)
        if extra_fields.get("is_staff") is not True or extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_staff=True and is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, SoftDeleteModel):
    class Role(models.TextChoices):
        MASTER_ADMIN = "MASTER_ADMIN", "Master Admin"
        CAMPUS_ADMIN = "CAMPUS_ADMIN", "Campus Admin"
        TEACHER = "TEACHER", "Teacher"
        STUDENT = "STUDENT", "Student"

    email = models.EmailField(unique=True, db_index=True)
    register_no = models.CharField(max_length=50, unique=True, null=True, blank=True)
    emp_no = models.CharField(max_length=50, unique=True, null=True, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    avatar_url = models.URLField(blank=True)
    phone_number = models.CharField(max_length=30, blank=True)

    campus = models.ForeignKey(Campus, null=True, blank=True, on_delete=models.SET_NULL, related_name="users")
    school = models.ForeignKey(School, null=True, blank=True, on_delete=models.SET_NULL, related_name="users")
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.SET_NULL, related_name="users")
    program = models.ForeignKey(Program, null=True, blank=True, on_delete=models.SET_NULL, related_name="students")
    batch = models.ForeignKey(Batch, null=True, blank=True, on_delete=models.SET_NULL, related_name="students")
    section = models.ForeignKey(Section, null=True, blank=True, on_delete=models.SET_NULL, related_name="students")
    teaching_programs = models.ManyToManyField(Program, blank=True, related_name="teachers")
    teaching_batches = models.ManyToManyField(Batch, blank=True, related_name="teachers")

    is_profile_complete = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["email"]

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.email.split("@", 1)[0]
