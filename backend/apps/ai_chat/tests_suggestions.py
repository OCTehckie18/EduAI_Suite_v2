from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.ai_chat.models import PromptSuggestion
from apps.assignments.models import FeedbackTemplate, RubricCriterion


class DbBackedContentTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="reader@example.com", password="pw-12345-x", role="STUDENT")
        self.client.force_authenticate(self.user)

    def test_prompt_suggestions_filter_by_audience_and_active(self):
        PromptSuggestion.objects.create(audience="STUDENT", text="s1", sort_order=1)
        PromptSuggestion.objects.create(audience="TEACHER", text="t1")
        PromptSuggestion.objects.create(audience="STUDENT", text="hidden", is_active=False)
        r = self.client.get("/api/v1/ai/prompt-suggestions?audience=student")
        self.assertEqual([x["text"] for x in r.data["results"]], ["s1"])

    def test_rubric_and_feedback_templates(self):
        RubricCriterion.objects.create(key="clarity", label="Clarity", weight=20, max_score=20)
        FeedbackTemplate.objects.create(mark="A", text="Great")
        self.assertEqual(self.client.get("/api/v1/assignments/rubric-criteria").data["results"][0]["key"], "clarity")
        self.assertEqual(self.client.get("/api/v1/assignments/feedback-templates").data["results"][0]["mark"], "A")

    def test_requires_auth(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/v1/ai/prompt-suggestions").status_code, 403)
