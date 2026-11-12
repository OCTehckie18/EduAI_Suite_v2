"""The letterhead the university's official documents carry (reports, printed answer sheets).

Stored in ``UniversityProfile.documents`` (JSON), validated here. Off by default, so documents look exactly
as they always did until a Master Admin turns the letterhead on.
"""

import io

DEFAULT_DOCUMENTS = {
    "enabled": False,
    "show_logo": True,
    "show_name": True,
    "show_address": True,
    "footer": "",
    "signatory_name": "",
    "signatory_title": "",
}
LIMITS = {"footer": 200, "signatory_name": 80, "signatory_title": 80}
FLAGS = ("enabled", "show_logo", "show_name", "show_address")


def merged(stored):
    documents = dict(DEFAULT_DOCUMENTS)
    if isinstance(stored, dict):
        documents.update({k: v for k, v in stored.items() if k in documents})
    return documents


def clean_documents(data, stored):
    """(documents, errors): ``data`` validated and laid over the stored settings."""
    documents = merged(stored)
    errors = {}
    if not isinstance(data, dict):
        return documents, {"documents": "Send the settings as an object."}
    for key in FLAGS:
        if key in data:
            if not isinstance(data[key], bool):
                errors[key] = "Use true or false."
            else:
                documents[key] = data[key]
    for key, limit in LIMITS.items():
        if key in data:
            value = str(data[key] or "").strip()
            if len(value) > limit:
                errors[key] = f"Keep this under {limit} characters."
            else:
                documents[key] = value
    if documents["signatory_title"] and not documents["signatory_name"] and "signatory_title" not in errors:
        errors["signatory_name"] = "Give the signatory's name, or clear the title."
    return documents, errors


def public_documents(stored):
    """What the portals need to print a letterhead (the university's name, address and logo come from the profile)."""
    return merged(stored)


def letterhead(profile):
    """Everything a document renderer needs, or None while the letterhead is off."""
    documents = merged(profile.documents)
    if not documents["enabled"]:
        return None
    from .models import UniversityProfile

    full = UniversityProfile.objects.filter(pk=profile.pk).only("logo_data", "logo_content_type").first()
    logo = bytes(full.logo_data) if documents["show_logo"] and full and full.logo_data else None
    return {
        "name": profile.name if documents["show_name"] else "",
        "address": profile.address if documents["show_address"] else "",
        "logo": logo,
        "footer": documents["footer"],
        "signatory_name": documents["signatory_name"],
        "signatory_title": documents["signatory_title"],
    }


def current_letterhead():
    from .models import UniversityProfile

    profile = UniversityProfile.objects.defer("logo_data", "logo_dark_data").filter(pk=1).first()
    return letterhead(profile) if profile else None


def apply_to_docx(document, head):
    """Add the letterhead to the page header and the footer line to the page footer of a python-docx document."""
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Mm, Pt

    section = document.sections[0]
    header = section.header
    first = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
    first.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if head["logo"]:
        try:
            first.add_run().add_picture(io.BytesIO(head["logo"]), height=Mm(16))
        except Exception:  # an unreadable logo must never stop the document from being made
            pass
    if head["name"]:
        paragraph = header.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run(head["name"])
        run.bold = True
        run.font.size = Pt(14)
    if head["address"]:
        paragraph = header.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.add_run(" ".join(head["address"].split())).font.size = Pt(9)
    if head["footer"]:
        footer = section.footer
        paragraph = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.add_run(head["footer"]).font.size = Pt(8)


def add_signature_block(document, head):
    """The signatory's line at the end of the document (a rule to sign above, then name and title)."""
    if not head["signatory_name"]:
        return
    document.add_paragraph()
    document.add_paragraph("______________________________")
    name = document.add_paragraph()
    name.add_run(head["signatory_name"]).bold = True
    if head["signatory_title"]:
        document.add_paragraph(head["signatory_title"])
