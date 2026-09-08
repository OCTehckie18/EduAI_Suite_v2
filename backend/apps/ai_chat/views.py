from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from services.groq_service import GroqService, DEFAULT_MODEL


class AIChatView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        message = request.data.get("message", "").strip()
        history = request.data.get("history", [])

        if not message:
            return Response({"detail": "Message cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)

        client = GroqService.get_client()
        if not client:
            return Response(
                {"content": "I am your EduAI Assistant. The Groq API key is currently not configured, but I am ready to assist as soon as it is provided."},
                status=status.HTTP_200_OK,
            )

        messages = [{
            "role": "system",
            "content": "You are EduAI Assistant. Answer using the institution's academic context when it is provided. Be concise and do not invent student, course, or performance data.",
        }]

        for item in history[-10:]:
            if isinstance(item, dict) and item.get("role") in {"user", "assistant"} and isinstance(item.get("content"), str):
                messages.append({"role": item["role"], "content": item["content"]})

        messages.append({"role": "user", "content": message})

        try:
            response = client.chat.completions.create(
                messages=messages,
                model=DEFAULT_MODEL,
                temperature=0.4,
                max_tokens=1200,
            )
            content = response.choices[0].message.content or "No response received."
            return Response({"content": content})
        except Exception as e:
            return Response({"content": f"AI service error: {str(e)}"}, status=status.HTTP_200_OK)
