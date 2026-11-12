from django.test import SimpleTestCase

from .consumers import COUNT_STEPS, should_announce_count


class AnswerCountAnnouncementTests(SimpleTestCase):
    def test_small_rooms_hear_every_answer(self):
        self.assertTrue(all(should_announce_count(n, 12) for n in range(1, 13)))

    def test_large_rooms_hear_about_twenty_updates_and_always_the_last(self):
        total = 150
        announced = [n for n in range(1, total + 1) if should_announce_count(n, total)]
        self.assertLessEqual(len(announced), COUNT_STEPS + 1)
        self.assertEqual(announced[-1], total)
