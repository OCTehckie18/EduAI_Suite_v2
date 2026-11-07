"""Trello boards.

Identity always comes from the signed-in account. A board is visible to its
active members; only its owner may rename it, delete it, or decide who is on it.
Any active member may work on the columns and cards.
"""
import datetime

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.classrooms.models import Classroom, Enrollment
from apps.core.access import is_master_admin
from apps.core.services import notify

from .models import Board, BoardCard, BoardColumn, BoardMember

User = get_user_model()

DEFAULT_COLUMNS = ["To Do", "Doing", "Done"]
MAX_LABELS = 12
MAX_CHECKLIST = 100


# ---- shaping ------------------------------------------------------------------

def _name(user):
    return user.full_name or user.email


def board_json(board, viewer, memberships):
    """`memberships` is every membership row of this board."""
    active = [m for m in memberships if m.status == BoardMember.Status.ACTIVE]
    pending = [m for m in memberships if m.status == BoardMember.Status.PENDING]
    mine = next((m for m in memberships if m.user_id == viewer.id), None)
    is_owner = board.owner_id == viewer.id
    return {
        "id": str(board.pk),
        "name": board.name,
        "background": board.background,
        "owner_email": board.owner.email,
        "owner_name": _name(board.owner),
        "join_code": board.join_code,
        "starred": bool(mine and mine.starred),
        "is_owner": is_owner,
        "members": [m.user.email for m in active if m.user_id != board.owner_id],
        "member_details": [{"email": m.user.email, "name": _name(m.user)} for m in active if m.user_id != board.owner_id],
        # Only the owner decides on requests, so only the owner is told who is waiting.
        "join_requests": [m.user.email for m in pending] if is_owner else [],
        "my_status": mine.status if mine else None,
        "created_at": board.created_at.isoformat(),
    }


def column_json(column):
    return {"id": str(column.pk), "board_id": str(column.board_id), "title": column.title, "sequence": column.sequence}


def card_json(card):
    return {
        "id": str(card.pk),
        "column_id": str(card.column_id),
        "board_id": str(card.column.board_id),
        "title": card.title,
        "description": card.description,
        "due_date": card.due_date.isoformat() if card.due_date else None,
        "sequence": card.sequence,
        "labels": card.labels,
        "checklist": card.checklist,
        "created_at": card.created_at.isoformat(),
    }


# ---- access -------------------------------------------------------------------

def _board_or_404(board_id):
    try:
        return Board.objects.select_related("owner").get(pk=int(board_id))
    except (ValueError, Board.DoesNotExist):
        raise NotFound("Board not found.")


def _member_board(user, board_id):
    """A board the user is an active member of. Anyone else is told it does not exist."""
    board = _board_or_404(board_id)
    if not BoardMember.objects.filter(board=board, user=user, status=BoardMember.Status.ACTIVE).exists():
        raise NotFound("Board not found.")
    return board


def _owned_board(user, board_id):
    board = _member_board(user, board_id)
    if board.owner_id != user.id:
        raise PermissionDenied("Only the board owner can do this.")
    return board


def _clean_title(value, what):
    title = (value or "").strip() if isinstance(value, str) else ""
    if not title:
        raise ValidationError({"detail": f"{what} cannot be empty."})
    if len(title) > 255:
        raise ValidationError({"detail": f"{what} is too long (255 characters at most)."})
    return title


def _user_by_email(email):
    email = (email or "").strip() if isinstance(email, str) else ""
    if not email:
        raise ValidationError({"detail": "An email address is required."})
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None:
        raise NotFound("No account with that email.")
    return user


def classmates_of(user):
    """People who share a classroom with `user`: a teacher's students, a student's teachers and classmates."""
    ids = set()
    taught = Classroom.objects.filter(teacher=user).values_list("pk", flat=True)
    ids.update(Enrollment.objects.filter(classroom_id__in=taught).values_list("student_id", flat=True))
    joined = list(Enrollment.objects.filter(student=user).values_list("classroom_id", flat=True))
    ids.update(Classroom.objects.filter(pk__in=joined).values_list("teacher_id", flat=True))
    ids.update(Enrollment.objects.filter(classroom_id__in=joined).values_list("student_id", flat=True))
    ids.discard(user.id)
    return User.objects.filter(pk__in=ids, is_active=True).order_by("first_name", "last_name", "email")


# ---- views --------------------------------------------------------------------

class StateView(APIView):
    """Everything the signed-in user can see: their boards, with columns and cards."""

    def get(self, request):
        boards = list(
            Board.objects.filter(memberships__user=request.user, memberships__status=BoardMember.Status.ACTIVE)
            .select_related("owner").distinct()
        )
        ids = [b.pk for b in boards]
        by_board = {}
        for m in BoardMember.objects.filter(board_id__in=ids).select_related("user"):
            by_board.setdefault(m.board_id, []).append(m)
        columns = BoardColumn.objects.filter(board_id__in=ids)
        cards = BoardCard.objects.filter(column__board_id__in=ids).select_related("column")
        return Response({
            "boards": [board_json(b, request.user, by_board.get(b.pk, [])) for b in boards],
            "columns": [column_json(c) for c in columns],
            "cards": [card_json(c) for c in cards],
        })


class BoardListView(APIView):
    def post(self, request):
        name = _clean_title(request.data.get("name") or "Untitled board", "The board name")
        background = request.data.get("background")
        with transaction.atomic():
            board = Board.objects.create(
                name=name,
                owner=request.user,
                **({"background": background[:255]} if isinstance(background, str) and background else {}),
            )
            BoardMember.objects.create(board=board, user=request.user, role=BoardMember.Role.OWNER)
            for index, title in enumerate(DEFAULT_COLUMNS):
                BoardColumn.objects.create(board=board, title=title, sequence=index)
        memberships = list(BoardMember.objects.filter(board=board).select_related("user"))
        return Response(board_json(board, request.user, memberships), status=status.HTTP_201_CREATED)


class BoardDetailView(APIView):
    def get(self, request, board_id):
        board = _member_board(request.user, board_id)
        memberships = list(BoardMember.objects.filter(board=board).select_related("user"))
        return Response({
            "board": board_json(board, request.user, memberships),
            "columns": [column_json(c) for c in board.columns.all()],
            "cards": [card_json(c) for c in BoardCard.objects.filter(column__board=board).select_related("column")],
        })

    def patch(self, request, board_id):
        board = _owned_board(request.user, board_id)
        if "name" in request.data:
            board.name = _clean_title(request.data.get("name"), "The board name")
        if "background" in request.data:
            background = request.data.get("background")
            if not isinstance(background, str) or not background.strip():
                raise ValidationError({"detail": "The background is not valid."})
            board.background = background[:255]
        board.save()
        memberships = list(BoardMember.objects.filter(board=board).select_related("user"))
        return Response(board_json(board, request.user, memberships))

    def delete(self, request, board_id):
        board = _owned_board(request.user, board_id)
        board.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BoardStarView(APIView):
    def post(self, request, board_id):
        board = _member_board(request.user, board_id)
        membership = BoardMember.objects.get(board=board, user=request.user)
        membership.starred = not membership.starred
        membership.save(update_fields=["starred"])
        return Response({"starred": membership.starred})


class BoardJoinView(APIView):
    """Ask to join a board by its code. The owner decides."""

    def post(self, request):
        code = request.data.get("code")
        code = code.strip().upper() if isinstance(code, str) else ""
        board = Board.objects.filter(join_code=code).first() if code else None
        if board is None:
            raise NotFound("No board has that code. Check it and try again.")
        membership = BoardMember.objects.filter(board=board, user=request.user).first()
        if membership and membership.status == BoardMember.Status.ACTIVE:
            return Response({"detail": "You are already on this board."}, status=status.HTTP_409_CONFLICT)
        if membership:
            return Response({"detail": "You have already asked to join. Wait for the owner to answer."}, status=status.HTTP_409_CONFLICT)
        BoardMember.objects.create(board=board, user=request.user, status=BoardMember.Status.PENDING)
        notify([board.owner_id], "board", f"{_name(request.user)} asked to join {board.name}", "Approve or reject the request on the board.", "/games/trello")
        return Response({"detail": "Request sent.", "board_name": board.name}, status=status.HTTP_201_CREATED)


class _MemberAction(APIView):
    def post(self, request, board_id):
        board = _owned_board(request.user, board_id)
        target = _user_by_email(request.data.get("email"))
        return self.act(request, board, target)


class BoardApproveView(_MemberAction):
    def act(self, request, board, target):
        membership = BoardMember.objects.filter(board=board, user=target, status=BoardMember.Status.PENDING).first()
        if membership is None:
            raise NotFound("That person has no pending request.")
        membership.status = BoardMember.Status.ACTIVE
        membership.save(update_fields=["status"])
        notify([target.pk], "board", f"You can now open {board.name}", "", f"/games/trello/{board.pk}")
        return Response({"detail": "Approved."})


class BoardRejectView(_MemberAction):
    def act(self, request, board, target):
        deleted, _ = BoardMember.objects.filter(board=board, user=target, status=BoardMember.Status.PENDING).delete()
        if not deleted:
            raise NotFound("That person has no pending request.")
        return Response({"detail": "Rejected."})


class BoardAddMemberView(_MemberAction):
    """The owner adds someone straight away. Only people from their own classrooms (or any user, for a master admin)."""

    def act(self, request, board, target):
        if target.pk == board.owner_id:
            raise ValidationError({"detail": "That person already owns this board."})
        if not is_master_admin(request.user) and not classmates_of(request.user).filter(pk=target.pk).exists():
            raise PermissionDenied("You can only add people you share a classroom with.")
        membership, created = BoardMember.objects.get_or_create(board=board, user=target)
        newly_in = created or membership.status != BoardMember.Status.ACTIVE
        if membership.status != BoardMember.Status.ACTIVE:
            membership.status = BoardMember.Status.ACTIVE
            membership.save(update_fields=["status"])
        if newly_in:
            notify([target.pk], "board", f"{_name(request.user)} added you to {board.name}", "", f"/games/trello/{board.pk}")
        return Response({"detail": "Added."}, status=status.HTTP_201_CREATED)


class BoardRemoveMemberView(_MemberAction):
    def act(self, request, board, target):
        if target.pk == board.owner_id:
            raise ValidationError({"detail": "The owner cannot be removed from their own board."})
        deleted, _ = BoardMember.objects.filter(board=board, user=target).delete()
        if not deleted:
            raise NotFound("That person is not on this board.")
        return Response({"detail": "Removed."})


class BoardLeaveView(APIView):
    def post(self, request, board_id):
        board = _member_board(request.user, board_id)
        if board.owner_id == request.user.id:
            raise ValidationError({"detail": "The owner cannot leave. Delete the board instead."})
        BoardMember.objects.filter(board=board, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SuggestedMembersView(APIView):
    def get(self, request):
        return Response([
            {"email": u.email, "name": _name(u), "role": u.role}
            for u in classmates_of(request.user)
        ])


# ---- columns ------------------------------------------------------------------

def _next_sequence(queryset):
    top = queryset.aggregate(top=Max("sequence"))["top"]
    return 0 if top is None else top + 1


class ColumnListView(APIView):
    def post(self, request, board_id):
        board = _member_board(request.user, board_id)
        column = BoardColumn.objects.create(
            board=board,
            title=_clean_title(request.data.get("title"), "The column title"),
            sequence=_next_sequence(board.columns),
        )
        return Response(column_json(column), status=status.HTTP_201_CREATED)


class ColumnReorderView(APIView):
    def post(self, request, board_id):
        board = _member_board(request.user, board_id)
        ids = request.data.get("ids")
        current = {c.pk for c in board.columns.all()}
        try:
            ordered = [int(i) for i in ids]
        except (TypeError, ValueError):
            raise ValidationError({"detail": "ids must be a list of column ids."})
        if set(ordered) != current or len(ordered) != len(current):
            raise ValidationError({"detail": "ids must list every column on the board once."})
        with transaction.atomic():
            for index, pk in enumerate(ordered):
                BoardColumn.objects.filter(pk=pk).update(sequence=index)
        return Response([column_json(c) for c in board.columns.all()])


def _column_for(user, column_id):
    try:
        column = BoardColumn.objects.select_related("board").get(pk=int(column_id))
    except (ValueError, BoardColumn.DoesNotExist):
        raise NotFound("Column not found.")
    _member_board(user, column.board_id)
    return column


class ColumnDetailView(APIView):
    def patch(self, request, column_id):
        column = _column_for(request.user, column_id)
        column.title = _clean_title(request.data.get("title"), "The column title")
        column.save(update_fields=["title"])
        return Response(column_json(column))

    def delete(self, request, column_id):
        column = _column_for(request.user, column_id)
        column.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---- cards --------------------------------------------------------------------

def _clean_labels(value):
    if not isinstance(value, list) or len(value) > MAX_LABELS:
        raise ValidationError({"detail": f"labels must be a list of at most {MAX_LABELS}."})
    out = []
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("text"), str):
            raise ValidationError({"detail": "Each label needs text."})
        out.append({
            "id": str(item.get("id", ""))[:40],
            "text": item["text"][:40],
            "color": str(item.get("color", "#64748b"))[:20],
        })
    return out


def _clean_checklist(value):
    if not isinstance(value, list) or len(value) > MAX_CHECKLIST:
        raise ValidationError({"detail": f"checklist must be a list of at most {MAX_CHECKLIST}."})
    out = []
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("text"), str) or not item["text"].strip():
            raise ValidationError({"detail": "Each checklist item needs text."})
        out.append({
            "id": str(item.get("id", ""))[:40],
            "text": item["text"].strip()[:255],
            "completed": bool(item.get("completed", False)),
        })
    return out


def _clean_due(value):
    if value in (None, ""):
        return None
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        raise ValidationError({"detail": "The due date is not a valid date."})


class CardListView(APIView):
    def post(self, request, column_id):
        column = _column_for(request.user, column_id)
        card = BoardCard.objects.create(
            column=column,
            title=_clean_title(request.data.get("title"), "The card title"),
            sequence=_next_sequence(column.cards),
            created_by=request.user,
        )
        return Response(card_json(card), status=status.HTTP_201_CREATED)


def _card_for(user, card_id):
    try:
        card = BoardCard.objects.select_related("column__board").get(pk=int(card_id))
    except (ValueError, BoardCard.DoesNotExist):
        raise NotFound("Card not found.")
    _member_board(user, card.column.board_id)
    return card


class CardDetailView(APIView):
    def patch(self, request, card_id):
        card = _card_for(request.user, card_id)
        data = request.data
        if "title" in data:
            card.title = _clean_title(data.get("title"), "The card title")
        if "description" in data:
            description = data.get("description")
            if not isinstance(description, str):
                raise ValidationError({"detail": "The description must be text."})
            card.description = description[:10000]
        if "due_date" in data:
            card.due_date = _clean_due(data.get("due_date"))
        if "labels" in data:
            card.labels = _clean_labels(data.get("labels"))
        if "checklist" in data:
            card.checklist = _clean_checklist(data.get("checklist"))
        card.save()
        return Response(card_json(card))

    def delete(self, request, card_id):
        _card_for(request.user, card_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CardMoveView(APIView):
    """Put a card at `index` in `column_id` (this board only) and renumber what it left and joined."""

    def post(self, request, card_id):
        card = _card_for(request.user, card_id)
        try:
            target = BoardColumn.objects.get(pk=int(request.data.get("column_id")), board_id=card.column.board_id)
            index = int(request.data.get("index", 0))
        except (TypeError, ValueError, BoardColumn.DoesNotExist):
            raise ValidationError({"detail": "Choose a column on the same board."})
        with transaction.atomic():
            source = card.column
            siblings = [c for c in target.cards.exclude(pk=card.pk)]
            index = max(0, min(index, len(siblings)))
            siblings.insert(index, card)
            card.column = target
            for position, item in enumerate(siblings):
                item.sequence = position
                item.column = target
                item.save(update_fields=["sequence", "column"])
            if source.pk != target.pk:
                for position, item in enumerate(source.cards.all()):
                    if item.sequence != position:
                        item.sequence = position
                        item.save(update_fields=["sequence"])
        card.refresh_from_db()
        return Response(card_json(card))
