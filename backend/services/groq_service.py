"""
Groq Service for Chain Answer Game, Lesson Generation, and Chat
Handles word generation, validation, and AI completions using Groq Cloud API.
"""
import logging
import os
from typing import List, Optional
from groq import Groq

logger = logging.getLogger(__name__)

AVAILABLE_MODELS = [
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
]

DEFAULT_MODEL = os.getenv("GROQ_MODEL", AVAILABLE_MODELS[0])
VISION_MODELS = [
    "llama-3.2-11b-vision-preview",
    "llama-3.2-90b-vision-preview",
    "llama-3.2-11b-vision",
    "llama-3.2-90b-vision",
    "llava-v1.5-7b-4096-preview" 
]


class GroqService:
    """Service to interact with Groq Cloud API for word generation, validation, lessons, and chat."""

    _initialized = False
    _available = False
    _client = None

    @classmethod
    def initialize(cls):
        """Initialize Groq service."""
        if cls._initialized and cls._client is not None:
            return

        cls._initialized = True
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            logger.warning("GROQ_API_KEY not set in environment")
            cls._available = False
            return

        try:
            cls._client = Groq(api_key=groq_api_key)
            cls._available = True
            logger.info("Groq Service Connected and Ready")
        except Exception as e:
            logger.error(f"Failed to initialize Groq: {e}")
            cls._available = False

    @classmethod
    def get_client(cls):
        if not cls._initialized or cls._client is None:
            cls.initialize()
        return cls._client

    @classmethod
    def is_groq_available(cls) -> bool:
        client = cls.get_client()
        if not client:
            return False
        try:
            client.chat.completions.create(
                messages=[{"role": "user", "content": "Say 'OK'"}],
                model=DEFAULT_MODEL,
                max_tokens=10,
            )
            return True
        except Exception as e:
            logger.warning(f"Groq availability check failed: {e}")
            return False

    @staticmethod
    def _build_fallback_lesson_plan(topic: str, syllabus_context: Optional[str] = None) -> dict:
        context_line = (
            f"Use the syllabus context as a guide: {syllabus_context}."
            if syllabus_context
            else "Adapt the lesson to the learner's level and classroom pace."
        )

        return {
            "success": True,
            "error": None,
            "lecture_flow": (
                f"1. Introduce {topic} and state the learning goals.\n"
                f"2. Explain the core idea of {topic} with a simple definition.\n"
                f"3. Demonstrate one worked example step by step.\n"
                f"4. Give students guided practice with feedback.\n"
                f"5. End with a recap and a quick check for understanding.\n"
                f"Note: {context_line}"
            ),
            "examples": (
                f"1. A basic example showing how {topic} works in practice.\n"
                f"2. A second example with a small variation or edge case.\n"
                f"3. A common mistake example to help students avoid errors.\n"
                f"4. A real-world example that connects {topic} to classwork or exams."
            ),
            "activities": (
                f"1. Think-pair-share: explain {topic} in pairs.\n"
                f"2. Guided problem solving: complete one example together.\n"
                f"3. Small-group challenge: solve a similar question independently.\n"
                f"4. Exit ticket: write one takeaway and one question."
            ),
            "quiz_questions": (
                f"1. What is {topic}?\n"
                f"2. What is the first step when approaching {topic} problems?\n"
                f"3. Which example best illustrates {topic}?\n"
                f"4. What common mistake should students avoid?\n"
                f"5. How would you explain {topic} in one sentence?"
            ),
        }

    @classmethod
    def generate_lesson_plan(cls, topic: str, syllabus_context: Optional[str] = None) -> dict:
        client = cls.get_client()
        if not client:
            return cls._build_fallback_lesson_plan(topic, syllabus_context)

        try:
            context_text = f"\nContext: {syllabus_context}" if syllabus_context else ""
            prompt = f"""Create a detailed and comprehensive lesson plan for the topic: "{topic}"{context_text}

You MUST format your response EXACTLY as follows. Do not deviate from this structure:

LECTURE FLOW:
[Provide detailed lecture flow with introduction, core concepts, practical application, and summary]

EXAMPLES:
[Provide 3-5 concrete, practical examples relevant to the topic with explanations]

ACTIVITIES:
[Provide 3-4 interactive classroom activities that engage students and reinforce learning]

QUIZ QUESTIONS:
[Provide 5-10 multiple choice questions to test understanding of the topic]

Important: Each section must have real, detailed content below its header. Do not leave sections empty."""

            response_text = ""
            for model_name in [DEFAULT_MODEL] + AVAILABLE_MODELS:
                try:
                    message = client.chat.completions.create(
                        messages=[{"role": "user", "content": prompt}],
                        model=model_name,
                        temperature=0.7,
                        max_tokens=2000,
                    )
                    response_text = message.choices[0].message.content or ""
                    if response_text:
                        break
                except Exception as ex:
                    logger.warning(f"Groq lesson plan generation failed for model {model_name}: {ex}")
                    continue

            if not response_text:
                return cls._build_fallback_lesson_plan(topic, syllabus_context)

            sections = {
                "lecture_flow": "",
                "examples": "",
                "activities": "",
                "quiz_questions": ""
            }
            current_section = None
            section_markers = {
                "LECTURE FLOW": "lecture_flow",
                "EXAMPLES": "examples",
                "ACTIVITIES": "activities",
                "QUIZ QUESTIONS": "quiz_questions"
            }

            for line in response_text.split('\n'):
                stripped_line = line.strip()
                if not stripped_line:
                    continue

                section_found = False
                for marker, section_key in section_markers.items():
                    if marker in stripped_line.upper():
                        current_section = section_key
                        section_found = True
                        break

                if current_section and not section_found:
                    sections[current_section] += line + "\n"

            for key in sections:
                sections[key] = sections[key].strip()

            fallback = cls._build_fallback_lesson_plan(topic, syllabus_context)
            for key in sections:
                if not sections[key]:
                    sections[key] = fallback[key]

            return {
                "success": True,
                "error": None,
                **sections
            }
        except Exception as e:
            logger.error(f"Error generating lesson plan: {e}")
            return cls._build_fallback_lesson_plan(topic, syllabus_context)

    @classmethod
    def generate_word_suggestions(
        cls,
        subject: str,
        difficulty: str,
        count: int = 5,
        chain_variation: str = "standard",
        starting_word: str = "apple"
    ) -> List[str]:
        client = cls.get_client()
        if not client:
            return []

        try:
            difficulty_hint = {
                "easy": "common, simple words",
                "medium": "moderate difficulty words",
                "hard": "challenging, uncommon words"
            }.get(difficulty, "common words")

            prompt = f"""Generate exactly {count} English words related to "{subject}" that are {difficulty_hint}.
These words will be used in a word chain game starting with "{starting_word}".
For a {chain_variation} chain game.
Return ONLY the words, one per line, no numbering, no explanations."""

            generated_text = ""
            for model_name in [DEFAULT_MODEL] + AVAILABLE_MODELS:
                try:
                    message = client.chat.completions.create(
                        messages=[{"role": "user", "content": prompt}],
                        model=model_name,
                        temperature=0.7,
                        max_tokens=200,
                    )
                    generated_text = message.choices[0].message.content or ""
                    if generated_text:
                        break
                except Exception:
                    continue

            words = [w.strip().lower() for w in generated_text.split('\n') if w.strip()]
            valid_words = [w for w in words if w.isalpha() and 2 <= len(w) <= 15]
            return valid_words[:count]
        except Exception as e:
            logger.error(f"Error generating words: {e}")
            return []

    @classmethod
    def validate_word_semantic(
        cls,
        word: str,
        subject: str,
        previous_word: str,
        chain_context: List[str]
    ) -> tuple:
        client = cls.get_client()
        if not client:
            return False, "Validation service unavailable"

        try:
            chain_summary = ", ".join(chain_context[-3:]) if chain_context else previous_word
            prompt = f"""Is the word "{word}" semantically related to "{subject}"?
Context: This is part of a word chain about {subject}, following: {previous_word}
Chain so far: {chain_summary}

Answer with ONLY "yes" or "no", followed by a brief reason (max 10 words)."""

            generated_text = ""
            for model_name in [DEFAULT_MODEL] + AVAILABLE_MODELS:
                try:
                    message = client.chat.completions.create(
                        messages=[{"role": "user", "content": prompt}],
                        model=model_name,
                        temperature=0.3,
                        max_tokens=50,
                    )
                    generated_text = (message.choices[0].message.content or "").lower().strip()
                    if generated_text:
                        break
                except Exception:
                    continue

            is_valid = generated_text.startswith("yes")
            reason = generated_text.split('\n')[0] if '\n' in generated_text else generated_text
            return is_valid, reason
        except Exception as e:
            return False, f"Validation error: {e}"
