"""Read a photographed or scanned answer sheet.

Steps: decode the image, find the four corner squares, warp the sheet to its
printed geometry, then measure how much of each bubble is filled. Nothing is
guessed: a blank, a double mark or an unreadable sheet is reported as such.
"""
from dataclasses import dataclass, field

import cv2
import numpy as np

from . import layout as L

SCALE = 8  # warped pixels per millimetre
WARP_W, WARP_H = int(L.PAGE_W * SCALE), int(L.PAGE_H * SCALE)
MAX_SIDE = 4000

FILLED = 0.45  # share of a bubble's inside that must be dark to count as marked
CLEAR_GAP = 0.20  # the marked bubble must beat the next best by this much to be certain

CORNERS_NOT_FOUND = "The four black corner squares were not all found. Photograph the whole sheet, flat and well lit."


class SheetError(Exception):
    """The image could not be read as an answer sheet. The message is safe to show."""


@dataclass
class QuestionReading:
    answer: str | None  # "A".."D", or None when blank or ambiguous
    state: str  # "ok", "blank" or "multiple"
    confidence: float  # 0 to 1
    fills: list = field(default_factory=list)


@dataclass
class SheetReading:
    register: str  # digits read; empty when it could not be read cleanly
    register_ok: bool
    questions: dict


def decode_image(data: bytes, filename: str = "") -> np.ndarray:
    """Bytes of a photo (JPG/PNG) or the first page of a PDF scan, as a BGR image."""
    if filename.lower().endswith(".pdf") or data[:4] == b"%PDF":
        import fitz  # PyMuPDF

        try:
            doc = fitz.open(stream=data, filetype="pdf")
            if doc.page_count < 1:
                raise SheetError("That PDF has no pages.")
            pix = doc[0].get_pixmap(dpi=200)
        except SheetError:
            raise
        except Exception:
            raise SheetError("That PDF could not be opened.")
        image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        code = {4: cv2.COLOR_RGBA2BGR, 3: cv2.COLOR_RGB2BGR, 1: cv2.COLOR_GRAY2BGR}[pix.n]
        return cv2.cvtColor(image, code)
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise SheetError("That file is not an image that can be read.")
    return image


def _find_markers(gray: np.ndarray):
    """The four corner squares as (TL, TR, BR, BL) centres, or raise."""
    h, w = gray.shape
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15)
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    # The squares are 8 mm on a 210 mm wide sheet; the sheet is somewhere between a third and all of the frame.
    side_hi = (L.MARKER_SIZE / L.PAGE_W) * max(w, h) * 1.3
    side_lo = side_hi * 0.2
    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if not side_lo**2 <= area <= side_hi**2:
            continue
        x, y, bw, bh = cv2.boundingRect(c)
        if not 0.7 <= bw / bh <= 1.3:
            continue
        if area / (bw * bh) < 0.8:  # solid, not a ring or a letter
            continue
        candidates.append((x + bw / 2, y + bh / 2))
    if len(candidates) < 4:
        raise SheetError(CORNERS_NOT_FOUND)

    chosen = []
    for corner in [(0, 0), (w, 0), (w, h), (0, h)]:
        chosen.append(min(candidates, key=lambda c: (c[0] - corner[0]) ** 2 + (c[1] - corner[1]) ** 2))
    pts = np.array(chosen, dtype=np.float32)
    if len({(round(float(p[0])), round(float(p[1]))) for p in pts}) < 4:
        raise SheetError(CORNERS_NOT_FOUND)
    if cv2.contourArea(pts.reshape(-1, 1, 2)) < 0.25 * w * h:
        raise SheetError("The sheet fills too little of the photo. Move closer so the whole sheet is in frame.")
    return pts


def _warp(image: np.ndarray) -> np.ndarray:
    h, w = image.shape[:2]
    longest = max(h, w)
    if longest > MAX_SIDE:
        factor = MAX_SIDE / longest
        image = cv2.resize(image, (int(w * factor), int(h * factor)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    src = _find_markers(gray)
    dst = np.array([(cx * SCALE, cy * SCALE) for cx, cy in L.MARKER_CENTERS], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(gray, matrix, (WARP_W, WARP_H), flags=cv2.INTER_LINEAR, borderValue=255)


def _ink(warped: np.ndarray) -> np.ndarray:
    """Binary image where ink is 1."""
    blur = cv2.GaussianBlur(warped, (3, 3), 0)
    _, binary = cv2.threshold(blur, 0, 1, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return binary


def _fill(ink: np.ndarray, cx_mm: float, cy_mm: float) -> float:
    """Share of the bubble inside that is dark, 0 to 1. The printed ring is left out."""
    cx, cy = int(round(cx_mm * SCALE)), int(round(cy_mm * SCALE))
    r = int(round(L.BUBBLE_R * SCALE * 0.62))
    mask = np.zeros(ink.shape, dtype=np.uint8)
    cv2.circle(mask, (cx, cy), r, 1, -1)
    area = int(mask.sum())
    return float((ink * mask).sum()) / area if area else 0.0


def _decide(fills: list) -> QuestionReading:
    order = sorted(range(len(fills)), key=lambda i: fills[i], reverse=True)
    best, second = fills[order[0]], fills[order[1]]
    if best < FILLED:
        return QuestionReading(None, "blank", round(1 - best, 2), fills)
    if second >= FILLED or best - second < CLEAR_GAP:
        return QuestionReading(None, "multiple", round(max(0.0, best - second), 2), fills)
    return QuestionReading(L.OPTIONS[order[0]], "ok", round(min(1.0, best - second), 2), fills)


def read_sheet(image: np.ndarray, n_questions: int) -> SheetReading:
    ink = _ink(_warp(image))

    digits = []
    for pos in range(L.REG_DIGITS):
        fills = [_fill(ink, *L.register_bubble(pos, d)) for d in range(10)]
        order = sorted(range(10), key=lambda i: fills[i], reverse=True)
        if fills[order[0]] < FILLED:
            digits.append("-")  # column left blank
        elif fills[order[1]] < FILLED and fills[order[0]] - fills[order[1]] >= CLEAR_GAP:
            digits.append(str(order[0]))
        else:
            digits.append("?")  # doubled or unclear
    raw = "".join(digits)
    # Shorter register numbers leave blank columns at the start; a gap or a double inside is a problem.
    trimmed = raw.lstrip("-")
    register_ok = bool(trimmed) and trimmed.isdigit()

    questions = {}
    for q in range(1, n_questions + 1):
        fills = [_fill(ink, *L.answer_bubble(q, i)) for i in range(len(L.OPTIONS))]
        questions[q] = _decide(fills)
    return SheetReading(register=trimmed if register_ok else "", register_ok=register_ok, questions=questions)
