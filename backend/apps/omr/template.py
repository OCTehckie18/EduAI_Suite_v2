"""The printable answer sheet (a PDF) for an OMR job."""
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from . import layout as L

PT = 72 / 25.4  # points per millimetre


def build_template_pdf(title: str, n_questions: int) -> bytes:
    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    height = A4[1]

    def x(mm):
        return mm * PT

    def y(mm):
        return height - mm * PT

    for cx, cy in L.MARKER_CENTERS:
        half = L.MARKER_SIZE / 2
        pdf.rect(x(cx - half), y(cy + half), x(L.MARKER_SIZE), x(L.MARKER_SIZE), stroke=0, fill=1)

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(x(26), y(30), (title or "Answer sheet")[:60])
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(x(26), y(38), "Fill circles fully with a dark pen. One answer per question.")
    pdf.drawString(x(26), y(43), "Do not fold or crop the sheet.")
    pdf.drawString(x(26), y(54), "Name: ______________________")
    pdf.drawString(x(26), y(64), "Date: ______________________")

    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(x(L.REG_X0 - 4), y(L.REG_Y0 - 8), "REGISTER NUMBER (digits)")
    pdf.setFont("Helvetica", 6)
    for pos in range(L.REG_DIGITS):
        for digit in range(10):
            bx, by = L.register_bubble(pos, digit)
            pdf.setLineWidth(0.5)
            pdf.circle(x(bx), y(by), x(L.BUBBLE_R), stroke=1, fill=0)
            if pos == 0:
                pdf.drawString(x(bx - 6), y(by - 0.8), str(digit))

    pdf.setFont("Helvetica-Bold", 7)
    for col in range(L.columns_needed(n_questions)):
        for i, letter in enumerate(L.OPTIONS):
            hx = L.ANS_X0 + col * L.ANS_COL_PITCH + i * L.OPTION_PITCH
            pdf.drawCentredString(x(hx), y(L.ANS_Y0 - 6.0), letter)
    pdf.setFont("Helvetica", 7)
    for q in range(1, n_questions + 1):
        bx0, by = L.answer_bubble(q, 0)
        pdf.drawRightString(x(bx0 + L.NUMBER_OFFSET + 5), y(by - 0.8), f"{q}")
        for i in range(len(L.OPTIONS)):
            bx, _ = L.answer_bubble(q, i)
            pdf.setLineWidth(0.5)
            pdf.circle(x(bx), y(by), x(L.BUBBLE_R), stroke=1, fill=0)
    pdf.showPage()
    pdf.save()
    return buf.getvalue()
