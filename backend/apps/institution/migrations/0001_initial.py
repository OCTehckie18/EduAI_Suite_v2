from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Campus",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(db_index=True, default=True, help_text="Soft-delete status flag: False indicates deleted/inactive")),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("name", models.CharField(max_length=150)),
                ("code", models.CharField(max_length=30, unique=True)),
                ("city", models.CharField(max_length=100)),
                ("state", models.CharField(default="Karnataka", max_length=100)),
                ("address", models.TextField(blank=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="School",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(db_index=True, default=True, help_text="Soft-delete status flag: False indicates deleted/inactive")),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("name", models.CharField(max_length=150)),
                ("code", models.CharField(max_length=30)),
                ("campus", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="schools", to="institution.campus")),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="Department",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(db_index=True, default=True, help_text="Soft-delete status flag: False indicates deleted/inactive")),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("name", models.CharField(max_length=150)),
                ("code", models.CharField(max_length=30)),
                ("school", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="departments", to="institution.school")),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="Program",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(db_index=True, default=True, help_text="Soft-delete status flag: False indicates deleted/inactive")),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("name", models.CharField(max_length=150)),
                ("code", models.CharField(max_length=30)),
                ("degree_level", models.CharField(choices=[("UG", "Undergraduate"), ("PG", "Postgraduate"), ("PHD", "Doctorate")], max_length=3)),
                ("duration_years", models.PositiveSmallIntegerField()),
                ("department", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="programs", to="institution.department")),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="Batch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(db_index=True, default=True, help_text="Soft-delete status flag: False indicates deleted/inactive")),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("name", models.CharField(max_length=30)),
                ("start_year", models.PositiveSmallIntegerField()),
                ("end_year", models.PositiveSmallIntegerField()),
                ("academic_year", models.CharField(max_length=20)),
                ("program", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="batches", to="institution.program")),
            ],
            options={"ordering": ["-start_year", "name"]},
        ),
        migrations.CreateModel(
            name="Section",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(db_index=True, default=True, help_text="Soft-delete status flag: False indicates deleted/inactive")),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("name", models.CharField(max_length=30)),
                ("max_capacity", models.PositiveIntegerField(default=60)),
                ("batch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sections", to="institution.batch")),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.AddConstraint(
            model_name="school",
            constraint=models.UniqueConstraint(fields=("campus", "code"), name="unique_school_code_per_campus"),
        ),
        migrations.AddConstraint(
            model_name="department",
            constraint=models.UniqueConstraint(fields=("school", "code"), name="unique_department_code_per_school"),
        ),
        migrations.AddConstraint(
            model_name="program",
            constraint=models.UniqueConstraint(fields=("department", "code"), name="unique_program_code_per_department"),
        ),
        migrations.AddConstraint(
            model_name="batch",
            constraint=models.UniqueConstraint(fields=("program", "name"), name="unique_batch_name_per_program"),
        ),
        migrations.AddConstraint(
            model_name="section",
            constraint=models.UniqueConstraint(fields=("batch", "name"), name="unique_section_name_per_batch"),
        ),
    ]
