from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.classrooms.models import Classroom, Enrollment
from apps.institution.models import Batch, Campus, Department, Program, School, Section

from .models import Board, BoardCard, BoardColumn, BoardMember


def person(email, role=User.Role.STUDENT):
    return User.objects.create_user(email=email, password="x", role=role, first_name=email.split("@")[0])


class TrelloBase(TestCase):
    def setUp(self):
        campus = Campus.objects.create(name="C", code="C", city="B")
        school = School.objects.create(name="S", code="S", campus=campus)
        dept = Department.objects.create(name="D", code="D", school=school)
        program = Program.objects.create(name="P", code="P", department=dept, degree_level=Program.DegreeLevel.PG, duration_years=2)
        batch = Batch.objects.create(name="B", program=program, start_year=2025, end_year=2027, academic_year="2025-2026")
        section = Section.objects.create(name="A", batch=batch)
        self.teacher = person("teacher@x.com", User.Role.TEACHER)
        self.pupil = person("pupil@x.com")
        self.stranger = person("stranger@x.com")
        course = Classroom.objects.create(
            name="W", subject_code="W1", teacher=self.teacher, department=dept, program=program, batch=batch, section=section
        )
        Enrollment.objects.create(classroom=course, student=self.pupil)

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def make_board(self, owner=None, name="Plan"):
        res = self.api(owner or self.teacher).post("/trello/board", {"name": name}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()


class BoardLifecycle(TrelloBase):
    def test_a_new_board_belongs_to_the_caller_and_starts_with_three_columns(self):
        # a client-sent owner is ignored
        res = self.api(self.teacher).post("/trello/board", {"name": "Plan", "creator_email": "stranger@x.com"}, format="json")
        board = res.json()
        self.assertEqual(board["owner_email"], "teacher@x.com")
        self.assertTrue(board["is_owner"])
        self.assertEqual(Board.objects.get(pk=board["id"]).owner, self.teacher)
        self.assertEqual(list(BoardColumn.objects.filter(board_id=board["id"]).values_list("title", flat=True)), ["To Do", "Doing", "Done"])

    def test_boards_are_visible_only_to_their_members(self):
        board = self.make_board()
        self.assertEqual(len(self.api(self.teacher).get("/trello/state").json()["boards"]), 1)
        self.assertEqual(self.api(self.stranger).get("/trello/state").json()["boards"], [])
        self.assertEqual(self.api(self.stranger).get(f"/trello/board/{board['id']}").status_code, 404)
        self.assertEqual(self.api(self.stranger).patch(f"/trello/board/{board['id']}", {"name": "x"}, format="json").status_code, 404)
        self.assertEqual(self.api(self.stranger).delete(f"/trello/board/{board['id']}").status_code, 404)
        self.assertEqual(Board.objects.count(), 1)

    def test_only_the_owner_renames_or_deletes(self):
        board = self.make_board()
        self.api(self.teacher).post(f"/trello/board/{board['id']}/add-member", {"email": "pupil@x.com"}, format="json")
        pupil = self.api(self.pupil)
        self.assertEqual(pupil.patch(f"/trello/board/{board['id']}", {"name": "Mine"}, format="json").status_code, 403)
        self.assertEqual(pupil.delete(f"/trello/board/{board['id']}").status_code, 403)
        renamed = self.api(self.teacher).patch(f"/trello/board/{board['id']}", {"name": "Renamed"}, format="json")
        self.assertEqual(renamed.json()["name"], "Renamed")
        self.assertEqual(self.api(self.teacher).patch(f"/trello/board/{board['id']}", {"name": "  "}, format="json").status_code, 400)
        self.assertEqual(self.api(self.teacher).delete(f"/trello/board/{board['id']}").status_code, 204)
        self.assertEqual(BoardColumn.objects.count(), 0)

    def test_a_star_belongs_to_one_person(self):
        board = self.make_board()
        self.api(self.teacher).post(f"/trello/board/{board['id']}/add-member", {"email": "pupil@x.com"}, format="json")
        self.assertTrue(self.api(self.teacher).post(f"/trello/board/{board['id']}/star").json()["starred"])
        mine = self.api(self.teacher).get("/trello/state").json()["boards"][0]
        theirs = self.api(self.pupil).get("/trello/state").json()["boards"][0]
        self.assertTrue(mine["starred"])
        self.assertFalse(theirs["starred"])
        self.assertFalse(self.api(self.teacher).post(f"/trello/board/{board['id']}/star").json()["starred"])


class Membership(TrelloBase):
    def test_join_request_is_decided_by_the_owner_only(self):
        board = self.make_board()
        code = board["join_code"]
        res = self.api(self.stranger).post("/trello/board/join", {"code": code.lower()}, format="json")
        self.assertEqual(res.status_code, 201)
        # waiting is not membership
        self.assertEqual(self.api(self.stranger).get("/trello/state").json()["boards"], [])
        self.assertEqual(self.api(self.stranger).get(f"/trello/board/{board['id']}").status_code, 404)
        # asking twice is refused
        self.assertEqual(self.api(self.stranger).post("/trello/board/join", {"code": code}, format="json").status_code, 409)
        # the owner sees it, nobody else does
        self.assertEqual(self.api(self.teacher).get("/trello/state").json()["boards"][0]["join_requests"], ["stranger@x.com"])
        # the requester cannot approve themselves
        self.assertEqual(
            self.api(self.stranger).post(f"/trello/board/{board['id']}/approve", {"email": "stranger@x.com"}, format="json").status_code, 404
        )
        self.assertEqual(BoardMember.objects.get(user=self.stranger).status, "PENDING")
        approve = self.api(self.teacher).post(f"/trello/board/{board['id']}/approve", {"email": "stranger@x.com"}, format="json")
        self.assertEqual(approve.status_code, 200)
        self.assertEqual(len(self.api(self.stranger).get("/trello/state").json()["boards"]), 1)
        self.assertEqual(self.api(self.stranger).post("/trello/board/join", {"code": code}, format="json").status_code, 409)

    def test_reject_removes_the_request(self):
        board = self.make_board()
        self.api(self.stranger).post("/trello/board/join", {"code": board["join_code"]}, format="json")
        self.assertEqual(self.api(self.teacher).post(f"/trello/board/{board['id']}/reject", {"email": "stranger@x.com"}, format="json").status_code, 200)
        self.assertFalse(BoardMember.objects.filter(user=self.stranger).exists())
        self.assertEqual(self.api(self.teacher).post(f"/trello/board/{board['id']}/reject", {"email": "stranger@x.com"}, format="json").status_code, 404)

    def test_a_wrong_code_is_not_found(self):
        self.assertEqual(self.api(self.pupil).post("/trello/board/join", {"code": "NOPE"}, format="json").status_code, 404)
        self.assertEqual(self.api(self.pupil).post("/trello/board/join", {}, format="json").status_code, 404)

    def test_add_member_is_limited_to_classroom_people(self):
        board = self.make_board()
        owner = self.api(self.teacher)
        self.assertEqual(owner.post(f"/trello/board/{board['id']}/add-member", {"email": "stranger@x.com"}, format="json").status_code, 403)
        self.assertEqual(owner.post(f"/trello/board/{board['id']}/add-member", {"email": "nobody@x.com"}, format="json").status_code, 404)
        self.assertEqual(owner.post(f"/trello/board/{board['id']}/add-member", {"email": "pupil@x.com"}, format="json").status_code, 201)
        self.assertEqual(owner.get("/trello/state").json()["boards"][0]["members"], ["pupil@x.com"])

    def test_a_member_cannot_manage_people(self):
        board = self.make_board()
        self.api(self.teacher).post(f"/trello/board/{board['id']}/add-member", {"email": "pupil@x.com"}, format="json")
        pupil = self.api(self.pupil)
        for action in ("approve", "reject", "add-member", "remove-member"):
            res = pupil.post(f"/trello/board/{board['id']}/{action}", {"email": "stranger@x.com"}, format="json")
            self.assertEqual(res.status_code, 403, action)

    def test_remove_member_and_leave(self):
        board = self.make_board()
        owner = self.api(self.teacher)
        owner.post(f"/trello/board/{board['id']}/add-member", {"email": "pupil@x.com"}, format="json")
        self.assertEqual(owner.post(f"/trello/board/{board['id']}/remove-member", {"email": "teacher@x.com"}, format="json").status_code, 400)
        self.assertEqual(owner.post(f"/trello/board/{board['id']}/remove-member", {"email": "pupil@x.com"}, format="json").status_code, 200)
        self.assertEqual(self.api(self.pupil).get("/trello/state").json()["boards"], [])
        owner.post(f"/trello/board/{board['id']}/add-member", {"email": "pupil@x.com"}, format="json")
        self.assertEqual(self.api(self.pupil).post(f"/trello/board/{board['id']}/leave").status_code, 204)
        self.assertEqual(owner.post(f"/trello/board/{board['id']}/leave").status_code, 400)

    def test_suggested_members_are_classroom_people_only(self):
        emails = lambda user: sorted(p["email"] for p in self.api(user).get("/trello/suggested-members").json())
        self.assertEqual(emails(self.teacher), ["pupil@x.com"])
        self.assertEqual(emails(self.pupil), ["teacher@x.com"])
        self.assertEqual(emails(self.stranger), [])


class ColumnsAndCards(TrelloBase):
    def setUp(self):
        super().setUp()
        self.board = self.make_board()
        self.cols = [c["id"] for c in self.api(self.teacher).get(f"/trello/board/{self.board['id']}").json()["columns"]]

    def card(self, column, title="Task", user=None):
        res = self.api(user or self.teacher).post(f"/trello/column/{column}/cards", {"title": title}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def test_members_work_on_the_board_and_strangers_cannot(self):
        self.api(self.teacher).post(f"/trello/board/{self.board['id']}/add-member", {"email": "pupil@x.com"}, format="json")
        made = self.card(self.cols[0], user=self.pupil)
        self.assertEqual(BoardCard.objects.get(pk=made["id"]).created_by, self.pupil)
        stranger = self.api(self.stranger)
        self.assertEqual(stranger.post(f"/trello/column/{self.cols[0]}/cards", {"title": "x"}, format="json").status_code, 404)
        self.assertEqual(stranger.patch(f"/trello/card/{made['id']}", {"title": "x"}, format="json").status_code, 404)
        self.assertEqual(stranger.delete(f"/trello/card/{made['id']}").status_code, 404)
        self.assertEqual(stranger.post(f"/trello/board/{self.board['id']}/columns", {"title": "x"}, format="json").status_code, 404)
        self.assertEqual(stranger.post(f"/trello/card/{made['id']}/move", {"column_id": self.cols[1], "index": 0}, format="json").status_code, 404)
        self.assertEqual(BoardCard.objects.count(), 1)

    def test_card_fields_are_validated_and_saved(self):
        made = self.card(self.cols[0])
        url = f"/trello/card/{made['id']}"
        api = self.api(self.teacher)
        res = api.patch(url, {
            "title": "Write essay", "description": "Two pages", "due_date": "2026-12-01",
            "labels": [{"id": "l1", "text": "Urgent", "color": "#ef4444"}],
            "checklist": [{"id": "c1", "text": "Outline", "completed": True}],
        }, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        saved = BoardCard.objects.get(pk=made["id"])
        self.assertEqual((saved.title, str(saved.due_date), saved.checklist[0]["completed"]), ("Write essay", "2026-12-01", True))
        self.assertEqual(api.patch(url, {"title": ""}, format="json").status_code, 400)
        self.assertEqual(api.patch(url, {"due_date": "soon"}, format="json").status_code, 400)
        self.assertEqual(api.patch(url, {"labels": "red"}, format="json").status_code, 400)
        self.assertEqual(api.patch(url, {"checklist": [{"text": " "}]}, format="json").status_code, 400)
        self.assertIsNone(api.patch(url, {"due_date": None}, format="json").json()["due_date"])
        self.assertEqual(BoardCard.objects.get(pk=made["id"]).title, "Write essay")

    def test_moving_cards_renumbers_both_columns(self):
        a, b, c = (self.card(self.cols[0], t) for t in "abc")
        d = self.card(self.cols[1], "d")
        api = self.api(self.teacher)
        titles = lambda col: list(BoardCard.objects.filter(column_id=col).order_by("sequence").values_list("title", flat=True))
        seqs = lambda col: list(BoardCard.objects.filter(column_id=col).order_by("sequence").values_list("sequence", flat=True))
        # within a column
        api.post(f"/trello/card/{c['id']}/move", {"column_id": self.cols[0], "index": 0}, format="json")
        self.assertEqual(titles(self.cols[0]), ["c", "a", "b"])
        # to another column, between its cards
        api.post(f"/trello/card/{a['id']}/move", {"column_id": self.cols[1], "index": 0}, format="json")
        self.assertEqual(titles(self.cols[0]), ["c", "b"])
        self.assertEqual(titles(self.cols[1]), ["a", "d"])
        self.assertEqual(seqs(self.cols[0]) + seqs(self.cols[1]), [0, 1, 0, 1])
        # an index past the end goes last
        api.post(f"/trello/card/{c['id']}/move", {"column_id": self.cols[1], "index": 99}, format="json")
        self.assertEqual(titles(self.cols[1]), ["a", "d", "c"])

    def test_a_card_cannot_be_moved_onto_another_boards_column(self):
        other = self.make_board(name="Other")
        other_col = self.api(self.teacher).get(f"/trello/board/{other['id']}").json()["columns"][0]["id"]
        made = self.card(self.cols[0])
        res = self.api(self.teacher).post(f"/trello/card/{made['id']}/move", {"column_id": other_col, "index": 0}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(str(BoardCard.objects.get(pk=made["id"]).column_id), self.cols[0])

    def test_columns_can_be_added_renamed_reordered_and_deleted(self):
        api = self.api(self.teacher)
        added = api.post(f"/trello/board/{self.board['id']}/columns", {"title": "Review"}, format="json").json()
        self.assertEqual(added["sequence"], 3)
        self.assertEqual(api.post(f"/trello/board/{self.board['id']}/columns", {"title": " "}, format="json").status_code, 400)
        self.assertEqual(api.patch(f"/trello/column/{added['id']}", {"title": "QA"}, format="json").json()["title"], "QA")
        order = [added["id"], *self.cols]
        res = api.post(f"/trello/board/{self.board['id']}/columns/reorder", {"ids": [int(i) for i in order]}, format="json")
        self.assertEqual([c["id"] for c in res.json()], order)
        self.assertEqual(api.post(f"/trello/board/{self.board['id']}/columns/reorder", {"ids": [int(added["id"])]}, format="json").status_code, 400)
        made = self.card(added["id"])
        self.assertEqual(api.delete(f"/trello/column/{added['id']}").status_code, 204)
        self.assertFalse(BoardCard.objects.filter(pk=made["id"]).exists())

    def test_ids_from_the_url_must_be_real(self):
        api = self.api(self.teacher)
        self.assertEqual(api.get("/trello/board/999999").status_code, 404)
        self.assertEqual(api.patch("/trello/card/999999", {"title": "x"}, format="json").status_code, 404)
        self.assertEqual(api.delete("/trello/column/999999").status_code, 404)

    def test_state_returns_columns_and_cards_only_for_my_boards(self):
        self.card(self.cols[0], "mine")
        other = self.make_board(self.stranger, "Theirs")
        other_col = self.api(self.stranger).get(f"/trello/board/{other['id']}").json()["columns"][0]["id"]
        self.card(other_col, "secret", user=self.stranger)
        state = self.api(self.teacher).get("/trello/state").json()
        self.assertEqual([c["title"] for c in state["cards"]], ["mine"])
        self.assertEqual(len(state["columns"]), 3)
