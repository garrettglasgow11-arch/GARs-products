"""Tests for the toolbox. Run them with:  python3 -m unittest discover tests"""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import toolbox  # noqa: E402
from gartools import files, fun, share, textdata, ui  # noqa: E402


def silently(function, *args, **kwargs) -> str:
    """Run something and capture what it printed, so tests stay quiet."""
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        function(*args, **kwargs)
    return buffer.getvalue()


class TempFolder(unittest.TestCase):
    """Every test gets its own throwaway folder."""

    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.folder = self._temp.name
        self.addCleanup(self._temp.cleanup)

    def write(self, name: str, text: str = "hello") -> str:
        path = os.path.join(self.folder, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        return path


class TestUi(unittest.TestCase):
    def test_human_size(self):
        self.assertEqual(ui.human_size(512), "512 B")
        self.assertEqual(ui.human_size(1536), "1.5 KB")
        self.assertEqual(ui.human_size(5 * 1024 ** 3), "5.0 GB")

    def test_human_time(self):
        self.assertEqual(ui.human_time(45), "45s")
        self.assertEqual(ui.human_time(3725), "1h 2m 5s")

    def test_bar_is_clamped(self):
        self.assertEqual(len(ui.bar(2.0, 10).replace("\033[32m", "").replace("\033[0m", "")), 10)
        self.assertEqual(len(ui.bar(-1.0, 10).replace("\033[2m", "").replace("\033[0m", "")), 10)


class TestCategories(unittest.TestCase):
    def test_known_types(self):
        self.assertEqual(files.category_for("holiday.JPG"), "Images")
        self.assertEqual(files.category_for("mix.mp3"), "Music")
        self.assertEqual(files.category_for("report.pdf"), "PDFs")

    def test_unknown_type_falls_back(self):
        self.assertEqual(files.category_for("mystery.qzx"), "Other")
        self.assertEqual(files.category_for("no-extension"), "Other")

    def test_clean_name(self):
        self.assertEqual(files.clean_name("My  Cool   File!.TXT"), "my-cool-file.txt")
        self.assertEqual(files.clean_name("!!!.png"), "file.png")


class TestOrganize(TempFolder):
    def test_plan_and_apply_and_undo(self):
        self.write("cat.png")
        self.write("song.mp3")
        self.write(".hidden")

        moves = files.plan_organize(self.folder)
        self.assertEqual(len(moves), 2)  # the hidden file is left alone

        files.apply_moves(moves, self.folder, "organize")
        self.assertTrue(os.path.isfile(os.path.join(self.folder, "Images", "cat.png")))
        self.assertTrue(os.path.isfile(os.path.join(self.folder, "Music", "song.mp3")))

        restored, action = files.undo_last(self.folder)
        self.assertEqual((restored, action), (2, "organize"))
        self.assertTrue(os.path.isfile(os.path.join(self.folder, "cat.png")))
        self.assertFalse(os.path.exists(os.path.join(self.folder, "Images")))

    def test_undo_with_no_log_is_harmless(self):
        self.assertEqual(files.undo_last(self.folder)[0], 0)

    def test_existing_names_are_never_overwritten(self):
        self.write("note.txt", "first")
        os.makedirs(os.path.join(self.folder, "Documents"))
        self.write("Documents/note.txt", "second")

        files.apply_moves(files.plan_organize(self.folder), self.folder, "organize")
        docs = sorted(os.listdir(os.path.join(self.folder, "Documents")))
        self.assertEqual(docs, ["note (2).txt", "note.txt"])
        with open(os.path.join(self.folder, "Documents", "note.txt"), encoding="utf-8") as f:
            self.assertEqual(f.read(), "second")  # the original survived untouched


class TestDuplicates(TempFolder):
    def test_finds_identical_files_only(self):
        self.write("one.txt", "same content")
        self.write("two.txt", "same content")
        self.write("sub/three.txt", "same content")
        self.write("different.txt", "not the same")

        groups = files.find_duplicates(self.folder)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(groups[0]), 3)
        self.assertEqual(files.wasted_space(groups), len("same content") * 2)

    def test_empty_files_are_ignored(self):
        self.write("a.txt", "")
        self.write("b.txt", "")
        self.assertEqual(files.find_duplicates(self.folder), [])

    def test_same_size_different_content_is_not_a_duplicate(self):
        self.write("a.txt", "aaaa")
        self.write("b.txt", "bbbb")
        self.assertEqual(files.find_duplicates(self.folder), [])


class TestRename(TempFolder):
    def setUp(self):
        super().setUp()
        for name in ("IMG_01.jpg", "IMG_02.jpg", "IMG_03.jpg"):
            self.write(name)

    def test_replace(self):
        moves = files.plan_rename(self.folder, "replace", find="IMG_", replace="Beach ")
        self.assertEqual(os.path.basename(moves[0][1]), "Beach 01.jpg")

    def test_numbering_starts_where_asked(self):
        moves = files.plan_rename(self.folder, "number", pattern="Trip", start=7)
        self.assertEqual([os.path.basename(t) for _, t in moves],
                         ["Trip 007.jpg", "Trip 008.jpg", "Trip 009.jpg"])

    def test_prefix_and_suffix(self):
        prefix = files.plan_rename(self.folder, "prefix", text="2026-")
        self.assertEqual(os.path.basename(prefix[0][1]), "2026-IMG_01.jpg")
        suffix = files.plan_rename(self.folder, "suffix", text="-edited")
        self.assertEqual(os.path.basename(suffix[0][1]), "IMG_01-edited.jpg")

    def test_unchanged_names_are_skipped(self):
        self.assertEqual(files.plan_rename(self.folder, "replace", find="zzz", replace="x"), [])

    def test_unknown_mode_is_rejected(self):
        with self.assertRaises(ValueError):
            files.plan_rename(self.folder, "nonsense")

    def test_rename_can_be_undone(self):
        moves = files.plan_rename(self.folder, "number", pattern="Trip")
        files.apply_moves(moves, self.folder, "rename")
        self.assertIn("Trip 001.jpg", os.listdir(self.folder))
        files.undo_last(self.folder)
        self.assertIn("IMG_01.jpg", os.listdir(self.folder))


class TestSpace(TempFolder):
    def test_biggest_first(self):
        self.write("small.txt", "x")
        self.write("large.txt", "x" * 5000)
        biggest = files.biggest_files(self.folder)
        self.assertEqual(os.path.basename(biggest[0][0]), "large.txt")

    def test_junk_folders_are_skipped(self):
        self.write("__pycache__/junk.txt", "x" * 100)
        self.write("real.txt", "x")
        found = [os.path.basename(path) for path in files.walk_files(self.folder)]
        self.assertEqual(found, ["real.txt"])


class TestConvert(unittest.TestCase):
    def test_csv_to_json(self):
        rows = json.loads(textdata.csv_to_json("name,age\nAda,36\nGrace,45\n"))
        self.assertEqual(rows, [{"name": "Ada", "age": "36"},
                                {"name": "Grace", "age": "45"}])

    def test_round_trip(self):
        original = "name,age\nAda,36\nGrace,45\n"
        self.assertEqual(textdata.json_to_csv(textdata.csv_to_json(original)), original)

    def test_missing_keys_become_empty_cells(self):
        csv_text = textdata.json_to_csv('[{"a": 1, "b": 2}, {"a": 3}]')
        self.assertEqual(csv_text, "a,b\n1,2\n3,\n")

    def test_nested_values_survive_as_json(self):
        self.assertIn('""x"": 1', textdata.json_to_csv('[{"a": {"x": 1}}]'))

    def test_bad_json_shape_is_rejected(self):
        with self.assertRaises(ValueError):
            textdata.json_to_csv("[1, 2, 3]")


class TestWriting(unittest.TestCase):
    def test_counts(self):
        stats = textdata.analyse_text("One two three. Four five!\n\nSecond paragraph.")
        self.assertEqual(stats["words"], 7)
        self.assertEqual(stats["sentences"], 3)
        self.assertEqual(stats["paragraphs"], 2)

    def test_common_words_are_ignored(self):
        top = dict(textdata.analyse_text("the the the badger badger")["top_words"])
        self.assertNotIn("the", top)
        self.assertEqual(top["badger"], 2)

    def test_empty_text_does_not_crash(self):
        self.assertEqual(textdata.analyse_text("")["words"], 0)


class TestCodeCount(TempFolder):
    def test_counts_non_blank_lines(self):
        self.write("app.py", "import os\n\nprint(1)\n")
        self.write("notes.unknownext", "ignored\n")
        rows, total_files, total_lines = textdata.count_code(self.folder)
        self.assertEqual(rows, [("py", 1, 2)])
        self.assertEqual((total_files, total_lines), (1, 2))


class TestPasswords(unittest.TestCase):
    def test_length_and_variety(self):
        secret = fun.make_password(24)
        self.assertEqual(len(secret), 24)
        self.assertTrue(any(c.islower() for c in secret))
        self.assertTrue(any(c.isupper() for c in secret))
        self.assertTrue(any(c.isdigit() for c in secret))
        self.assertTrue(any(c in fun.SYMBOLS for c in secret))

    def test_very_short_lengths_still_work(self):
        self.assertGreaterEqual(len(fun.make_password(1)), 4)

    def test_passwords_are_not_repeated(self):
        self.assertNotEqual(fun.make_password(20), fun.make_password(20))

    def test_passphrase_shape(self):
        phrase = fun.make_passphrase(4)
        parts = phrase.split("-")
        self.assertEqual(len(parts), 5)  # four words plus a number
        self.assertTrue(parts[-1].isdigit())
        for word in parts[:-1]:
            self.assertIn(word, fun.WORDS)

    def test_passphrase_entropy_counts_words_not_letters(self):
        # A word password must never be scored as if its letters were random.
        bits = fun.passphrase_entropy(4)
        self.assertLess(bits, fun.entropy_bits(fun.make_passphrase(4)))
        self.assertLess(bits, 50)

    def test_strength_labels(self):
        self.assertEqual(fun.strength_label(20), "weak")
        self.assertEqual(fun.strength_label(90), "very strong")

    def test_crack_time_is_readable(self):
        self.assertIn("universe", fun.crack_time(200))
        self.assertEqual(fun.crack_time(0), "instantly")


class TestBanner(unittest.TestCase):
    def test_height_and_content(self):
        art = fun.banner("HI")
        self.assertEqual(len(art.splitlines()), fun.FONT_HEIGHT)
        self.assertIn("█", art)

    def test_unknown_characters_become_blanks(self):
        self.assertEqual(len(fun.banner("~").strip()), 0)

    def test_lowercase_is_accepted(self):
        self.assertEqual(fun.banner("ab"), fun.banner("AB"))


class TestRandomHelpers(unittest.TestCase):
    def test_pick_one_stays_in_the_list(self):
        options = ["a", "b", "c"]
        self.assertIn(fun.pick_one(options), options)

    def test_pick_one_needs_options(self):
        with self.assertRaises(ValueError):
            fun.pick_one([])

    def test_shuffle_keeps_every_item(self):
        items = list("abcdefgh")
        self.assertEqual(sorted(fun.shuffle(items)), items)

    def test_dice_stay_in_range(self):
        for roll in fun.roll_dice(50, 20):
            self.assertTrue(1 <= roll <= 20)

    def test_teams_are_balanced_and_complete(self):
        names = [f"p{n}" for n in range(7)]
        teams = fun.make_teams(names, 3)
        self.assertEqual(sorted(sum(teams, [])), sorted(names))
        self.assertLessEqual(max(len(t) for t in teams) - min(len(t) for t in teams), 1)

    def test_more_teams_than_people_is_handled(self):
        self.assertEqual(len(fun.make_teams(["solo"], 5)), 1)


class TestDuration(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(fun.parse_duration("90"), 90)
        self.assertEqual(fun.parse_duration("5m"), 300)
        self.assertEqual(fun.parse_duration("1h30m"), 5400)
        self.assertEqual(fun.parse_duration("2m 30s"), 150)

    def test_nonsense_is_rejected(self):
        for bad in ("", "soon", "5x"):
            with self.assertRaises(ValueError):
                fun.parse_duration(bad)

    def test_countdown_runs_without_sleeping(self):
        ticks = []
        silently(fun.countdown, 3, "Test", sleeper=ticks.append)
        self.assertEqual(ticks, [1, 1, 1])


class TestShare(unittest.TestCase):
    def test_local_ip_looks_like_an_address(self):
        self.assertEqual(len(share.local_ip().split(".")), 4)

    def test_free_port_is_usable(self):
        self.assertTrue(1 <= share.free_port(8000) <= 65535)


class TestCommandLine(TempFolder):
    """The commands people actually type should all run end to end."""

    def test_every_subcommand_is_listed_in_the_menu(self):
        menu_keys = {key for _, key in toolbox.MENU}
        parser_keys = set(toolbox.build_parser()._subparsers._group_actions[0].choices)
        self.assertEqual(menu_keys, parser_keys)

    def test_password_and_banner(self):
        self.assertIn("Strength", silently(toolbox.main, ["password", "--count", "1"]))
        self.assertIn("█", silently(toolbox.main, ["banner", "hi"]))

    def test_organize_previews_without_moving_anything(self):
        self.write("cat.png")
        output = silently(toolbox.main, ["organize", self.folder])
        self.assertIn("Images", output)
        self.assertTrue(os.path.isfile(os.path.join(self.folder, "cat.png")))

    def test_organize_with_go_moves_files(self):
        self.write("cat.png")
        silently(toolbox.main, ["organize", self.folder, "--go"])
        self.assertTrue(os.path.isfile(os.path.join(self.folder, "Images", "cat.png")))
        silently(toolbox.main, ["undo", self.folder])
        self.assertTrue(os.path.isfile(os.path.join(self.folder, "cat.png")))

    def test_delete_refuses_without_confirmation(self):
        self.write("a.txt", "twins")
        self.write("b.txt", "twins")
        output = silently(toolbox.main, ["duplicates", self.folder, "--delete"])
        self.assertIn("Refusing", output)
        self.assertEqual(len(os.listdir(self.folder)), 2)

    def test_missing_folder_reports_an_error(self):
        missing = os.path.join(self.folder, "nope")
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = toolbox.main(["code", missing])
        self.assertEqual(code, 1)
        self.assertIn("no folder", buffer.getvalue())

    def test_convert_and_word_report(self):
        path = self.write("data.csv", "name,score\nAda,9\n")
        silently(toolbox.main, ["convert", path])
        self.assertTrue(os.path.isfile(os.path.join(self.folder, "data.json")))
        text = self.write("story.txt", "A badger ran. It ran fast.")
        self.assertIn("badger", silently(toolbox.main, ["words", text]))

    def test_convert_rejects_other_file_types(self):
        path = self.write("notes.txt", "hello")
        self.assertIn("only convert", silently(toolbox.main, ["convert", path]))


if __name__ == "__main__":
    unittest.main()
