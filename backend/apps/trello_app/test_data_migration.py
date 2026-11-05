from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class OldBoardsCarryOver(TransactionTestCase):
    """Boards made before real relations: kept when the creator has an account, left behind when not."""

    migrate_from = [("trello_app", "0001_initial")]
    migrate_to = [("trello_app", "0002_real_relations")]

    def setUp(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old = executor.loader.project_state(self.migrate_from).apps
        from apps.accounts.models import User

        self.owner = User.objects.create_user(email="Owner@x.com", password="x")
        self.member = User.objects.create_user(email="m@x.com", password="x")
        Board = old.get_model("trello_app", "TrelloBoard")
        Column = old.get_model("trello_app", "TrelloColumn")
        Card = old.get_model("trello_app", "TrelloCard")
        Board.objects.create(id="b1", name="Kept", creator_email="owner@x.com", starred=True,
                             members=["m@x.com", "ghost@x.com"], join_requests=["nobody@x.com"])
        Board.objects.create(id="b2", name="Orphan", creator_email="ghost@x.com")
        Column.objects.create(id="c1", board_id="b1", title="Todo", sequence=0)
        Card.objects.create(id="k1", column_id="c1", board_id="b1", title="Task", due_date="2026-05-04T00:00:00Z",
                            checklist=[{"id": "1", "text": "x", "completed": False}])

    def test_boards_with_a_real_owner_are_carried_over(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(self.migrate_to)
        new = executor.loader.project_state(self.migrate_to).apps
        Board = new.get_model("trello_app", "Board")
        BoardMember = new.get_model("trello_app", "BoardMember")
        BoardCard = new.get_model("trello_app", "BoardCard")

        self.assertEqual(list(Board.objects.values_list("name", flat=True)), ["Kept"])
        board = Board.objects.get()
        self.assertEqual(board.owner_id, self.owner.pk)
        owner_row = BoardMember.objects.get(board=board, user_id=self.owner.pk)
        self.assertEqual((owner_row.role, owner_row.starred), ("OWNER", True))
        self.assertEqual(
            sorted(BoardMember.objects.filter(board=board).values_list("user__email", "status")),
            [("m@x.com", "ACTIVE"), ("owner@x.com", "ACTIVE")],
        )
        card = BoardCard.objects.get()
        self.assertEqual((card.title, str(card.due_date), card.column.title), ("Task", "2026-05-04", "Todo"))

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
