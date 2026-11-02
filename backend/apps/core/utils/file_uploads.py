import os
import re
from pathlib import Path
from uuid import uuid4
from typing import Optional
from django.conf import settings
from rest_framework.exceptions import ValidationError

ALLOWED_FILE_EXTENSIONS = {
    ".pdf", ".pptx", ".docx", ".png", ".jpg", ".jpeg", ".zip", ".xlsx", ".csv", ".txt", ".md"
}
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024
MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024


def validate_upload(file, allowed_extensions=None, max_bytes=MAX_UPLOAD_BYTES) -> str:
    """Reject uploads with a disallowed extension or an oversized body; returns the extension."""
    extension = Path(getattr(file, "name", "") or "").suffix.lower()
    allowed = allowed_extensions if allowed_extensions is not None else ALLOWED_FILE_EXTENSIONS
    if extension not in allowed:
        raise ValidationError(f"File extension '{extension}' is not allowed.")
    size = getattr(file, "size", None)
    if size is not None and size > max_bytes:
        raise ValidationError(f"File is too large (limit {max_bytes // (1024 * 1024)} MB).")
    return extension


def safe_upload_name(filename: str) -> str:
    name = Path(filename).name
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name or "upload"


def save_optional_upload(file, folder: str) -> Optional[str]:
    """
    Saves an uploaded file to settings.UPLOADS_ROOT / folder and returns the relative URL.
    Works with Django UploadedFile.
    """
    if not file:
        return None

    filename = getattr(file, "name", "upload")
    validate_upload(file)

    safe_name = safe_upload_name(filename)
    saved_name = f"{uuid4().hex}_{safe_name}"

    upload_dir = Path(settings.UPLOADS_ROOT) / folder
    upload_dir.mkdir(parents=True, exist_ok=True)
    disk_path = upload_dir / saved_name

    with open(disk_path, "wb+") as destination:
        if hasattr(file, "chunks"):
            for chunk in file.chunks():
                destination.write(chunk)
        elif hasattr(file, "read"):
            destination.write(file.read())
        else:
            destination.write(file)

    return f"/uploads/{folder}/{saved_name}"
