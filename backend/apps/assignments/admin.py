from django.contrib import admin

from .models import FeedbackTemplate, RubricCriterion

admin.site.register(RubricCriterion)
admin.site.register(FeedbackTemplate)
