import re
import io
import logging
from PyPDF2 import PdfReader
from docx import Document

logger = logging.getLogger(__name__)


class CoursePlanParser:
    @staticmethod
    def extract_text_from_pdf(file_content: bytes) -> str:
        try:
            reader = PdfReader(io.BytesIO(file_content))
            text = ""
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
            return text
        except Exception as e:
            logger.error(f"Error extracting PDF: {e}")
            return ""

    @staticmethod
    def extract_text_from_docx(file_content: bytes) -> str:
        try:
            doc = Document(io.BytesIO(file_content))
            text = ""
            for para in doc.paragraphs:
                text += para.text + "\n"
            return text
        except Exception as e:
            logger.error(f"Error extracting DOCX: {e}")
            return ""

    @staticmethod
    def parse_content(text: str) -> dict:
        if not text:
            return {"topic": "", "syllabus_context": ""}

        # Normalize text
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        lines = [line.strip() for line in text.split('\n')]
        clean_text = '\n'.join(lines)

        topic_patterns = [
            r"(?i)(?:topic|subject|course(?:\s+name)?|module(?:\s+title)?|lesson\s+title)\s*[:=-]?\s*(.*)",
            r"(?i)^#\s*(.*)",
            r"(?i)(?:lesson\s+plan\s+for)\s+(.*)"
        ]

        syllabus_patterns = [
            r"(?i)(?:course\s+content|units?|modules?|topics\s+covered|learning\s+outcomes|outline)\s*[:=-]?\s*([\s\S]*?)(?=\n\s*(?:Text\s*&\s*Reference|Essential\s*Reading|Examination|CIA|ESE|APPENDIX|PATTERN|References)|\Z)",
            r"(?i)(?:syllabus|context|objectives|content)\s*[:=-]?\s*([\s\S]*?)(?=\n\s*\n|\n\s*[A-Z\s]{5,}:?|\Z)",
            r"(?i)##\s*(?:syllabus|context|objectives|content)\s*([\s\S]*?)(?=\n#|\Z)"
        ]

        topic = ""
        for pattern in topic_patterns:
            match = re.search(pattern, clean_text, re.MULTILINE)
            if match:
                topic = match.group(1).strip()
                topic = topic.split('\n')[0].strip()
                if topic:
                    break

        syllabus = ""
        for pattern in syllabus_patterns:
            match = re.search(pattern, clean_text, re.MULTILINE)
            if match:
                content = match.group(1).strip()
                if len(content) < 15 and len(clean_text) > 200:
                    continue
                syllabus = content
                if syllabus:
                    break

        if not topic:
            for line in lines:
                if not line:
                    continue
                if line.upper() in ["SYLLABUS", "COURSE PLAN", "LESSON PLAN"]:
                    continue
                if 3 < len(line) < 100:
                    topic = line
                    break

        return {
            "topic": topic,
            "syllabus_context": syllabus
        }
