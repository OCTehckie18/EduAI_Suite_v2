"""The one sheet layout, shared by the printed template and the scanner.

All measurements are millimetres on an A4 page, origin top left. The scanner
warps a photo so the four corner squares land on their printed positions, then
looks for ink at exactly the positions computed here.
"""
import math

PAGE_W, PAGE_H = 210.0, 297.0

# Four solid squares, centred here. Their size lets the scanner tell them from other ink.
MARKER_SIZE = 8.0
MARKER_CENTERS = [(14.0, 14.0), (196.0, 14.0), (196.0, 283.0), (14.0, 283.0)]  # TL, TR, BR, BL

OPTIONS = "ABCD"
MAX_QUESTIONS = 100
PER_COLUMN = 25

BUBBLE_R = 2.4
OPTION_PITCH = 8.0

# Register number: 8 digit columns, rows 0 to 9.
REG_DIGITS = 8
REG_X0, REG_Y0 = 112.0, 52.0
REG_COL_PITCH, REG_ROW_PITCH = 8.0, 5.6

# Answers: columns of 25 questions.
ANS_X0, ANS_Y0 = 24.0, 118.0
ANS_COL_PITCH, ANS_ROW_PITCH = 45.0, 6.4
NUMBER_OFFSET = -9.0  # question number sits left of the first bubble


def columns_needed(n_questions: int) -> int:
    return max(1, math.ceil(n_questions / PER_COLUMN))


def answer_bubble(question: int, option_index: int):
    """Centre (x, y) of one answer bubble. `question` counts from 1."""
    col, row = divmod(question - 1, PER_COLUMN)
    return (ANS_X0 + col * ANS_COL_PITCH + option_index * OPTION_PITCH, ANS_Y0 + row * ANS_ROW_PITCH)


def register_bubble(position: int, digit: int):
    """Centre of one register-number bubble. `position` counts from 0 (leftmost digit)."""
    return (REG_X0 + position * REG_COL_PITCH, REG_Y0 + digit * REG_ROW_PITCH)
