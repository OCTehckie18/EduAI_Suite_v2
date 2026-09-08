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


def _safe_filename(filename: str) -> str:
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
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_FILE_EXTENSIONS:
        raise ValidationError(f"File extension '{extension}' is not allowed.")

    safe_name = _safe_filename(filename)
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
