#!/usr/bin/env python3
"""GAR Toolbox — run me with:  python3 toolbox.py

With no arguments you get a friendly menu. If you already know what you want,
you can go straight to it:  python3 toolbox.py password --phrase

Nothing here needs installing. Python on its own is enough.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gartools import files, fun, share, textdata, ui  # noqa: E402

VERSION = "1.0.0"

LOGO = r"""
  ___   _   ___   _____         _ _
 / __| /_\ | _ \ |_   _|__  ___| | |__  _____ __
| (_ |/ _ \|   /   | |/ _ \/ _ \ | '_ \/ _ \ \ /
 \___/_/ \_\_|_\   |_|\___/\___/_|_.__/\___/_\_\
"""


# ── the tools ────────────────────────────────────────────────────────────────

def tidy(folder: str, go: bool = False) -> None:
    """Sort loose files in a folder into Images / Videos / Documents / ..."""
    ui.title(f"Tidy up: {folder}")
    moves = files.plan_organize(folder)
    if not moves:
        ui.ok("Already tidy — there are no loose files to move.")
        return

    ui.info(f"{len(moves)} files would be moved into these folders:")
    ui.rows(files.summarize(moves, folder))
    print()
    for source, target in moves[:8]:
        print(f"  {os.path.basename(source)}  {ui.dim('→')}  "
              f"{os.path.basename(os.path.dirname(target))}/")
    if len(moves) > 8:
        ui.info(f"...and {len(moves) - 8} more")
    print()

    if not go:
        if not ui.can_ask():
            ui.warn("Nothing changed — nobody is here to say yes. Add --go to do it.")
            return
        go = ui.ask_yes_no("Move them now?", default=True)
    if not go:
        ui.info("Nothing changed. (Add --go to skip this question next time.)")
        return

    moved = files.apply_moves(moves, folder, "organize")
    ui.ok(f"Moved {moved} files.")
    ui.info("Changed your mind? Run:  python3 toolbox.py undo " + folder)


def duplicates(folder: str, move: bool = False, delete: bool = False,
               assume_yes: bool = False) -> None:
    """Find files that are exact copies of each other."""
    ui.title(f"Duplicate hunt: {folder}")
    ui.info("Reading files... (big folders take a moment)")
    groups = files.find_duplicates(folder)
    if not groups:
        ui.ok("No duplicates found. Nice and clean.")
        return

    wasted = files.wasted_space(groups)
    plural = "set" if len(groups) == 1 else "sets"
    ui.warn(f"Found {len(groups)} {plural} of identical files, "
            f"wasting {ui.human_size(wasted)}.")
    print()
    for group in groups[:10]:
        size = ui.human_size(os.path.getsize(group[0]))
        print(f"  {ui.bold(os.path.basename(group[0]))}  {ui.dim(size + ' each')}")
        for path in group:
            print(f"      {files.short(path, folder)}")
    if len(groups) > 10:
        ui.info(f"...and {len(groups) - 10} more sets")
    print()

    if not (move or delete):
        if not ui.can_ask():
            ui.info("Nothing changed. Add --move to tidy the extra copies away.")
            return
        if not ui.ask_yes_no("Tidy the extra copies away into a 'duplicates-found' "
                             "folder?", default=False):
            ui.info("Left everything alone.")
            return
        move = True

    # The oldest file in each set is the one we keep.
    extras = []
    for group in groups:
        keeper = min(group, key=lambda path: os.path.getmtime(path))
        extras.extend(path for path in group if path != keeper)

    if delete:
        if not assume_yes:
            if not ui.can_ask():
                ui.error("Refusing to delete without a confirmation. Add --yes.")
                return
            typed = ui.ask(f"Type DELETE to permanently remove {len(extras)} files")
            if typed != "DELETE":
                ui.info("Cancelled. Nothing was deleted.")
                return
        removed = 0
        for path in extras:
            try:
                os.remove(path)
                removed += 1
            except OSError as exc:
                ui.error(f"Could not delete {path}: {exc}")
        ui.ok(f"Deleted {removed} files, freeing {ui.human_size(wasted)}.")
        return

    quarantine = os.path.join(folder, "duplicates-found")
    plan = [(path, os.path.join(quarantine, os.path.basename(path))) for path in extras]
    moved = files.apply_moves(plan, folder, "duplicates")
    ui.ok(f"Moved {moved} extra copies into {quarantine}")
    ui.info("Check that folder, then delete it yourself when you're happy.")
    ui.info("Want them back? Run:  python3 toolbox.py undo " + folder)


def rename(folder: str, mode: str, find: str = "", replace: str = "", text: str = "",
           pattern: str = "", start: int = 1, go: bool = False) -> None:
    """Rename a whole folder of files in one go."""
    ui.title(f"Bulk rename: {folder}")
    moves = files.plan_rename(folder, mode, find=find, replace=replace, text=text,
                              start=start, pattern=pattern)
    if not moves:
        ui.ok("Nothing to rename — no file names would change.")
        return

    for source, target in moves[:10]:
        print(f"  {os.path.basename(source)}  {ui.dim('→')}  "
              f"{ui.bold(os.path.basename(target))}")
    if len(moves) > 10:
        ui.info(f"...and {len(moves) - 10} more")
    print()

    if not go:
        if not ui.can_ask():
            ui.warn("Nothing changed — nobody is here to say yes. Add --go to do it.")
            return
        go = ui.ask_yes_no(f"Rename {len(moves)} files?", default=True)
    if not go:
        ui.info("Nothing changed.")
        return

    files.apply_moves(moves, folder, "rename")
    ui.ok(f"Renamed {len(moves)} files.")
    ui.info("Changed your mind? Run:  python3 toolbox.py undo " + folder)


def space(folder: str, top: int = 12) -> None:
    """Show what is eating your disk space."""
    ui.title(f"Space check: {folder}")
    folders = files.biggest_folders(folder, limit=top)
    if folders:
        print(ui.bold("  Biggest folders"))
        ui.rows((f"{name}/", ui.human_size(size)) for name, size in folders)
        print()
    biggest = files.biggest_files(folder, limit=top)
    if biggest:
        print(ui.bold("  Biggest files"))
        ui.rows((files.short(path, folder), ui.human_size(size)) for path, size in biggest)
    total = sum(size for _, size in files_sizes(folder))
    print()
    ui.ok(f"Everything here adds up to {ui.human_size(total)}.")


def files_sizes(folder: str):
    """Every file under a folder with its size — used for the grand total."""
    for path in files.walk_files(folder):
        try:
            yield path, os.path.getsize(path)
        except OSError:
            continue


def undo(folder: str) -> None:
    """Put back whatever the last file tool moved."""
    ui.title(f"Undo: {folder}")
    count, action = files.undo_last(folder)
    if not count:
        ui.warn("There is nothing to undo in this folder.")
        return
    ui.ok(f"Put {count} files back where they were (undid: {action}).")


def convert(path: str, out: str = "") -> None:
    """Convert a spreadsheet-style CSV into JSON, or JSON back into CSV."""
    ui.title(f"Convert: {os.path.basename(path)}")
    try:
        target = textdata.convert_file(path, out)
    except (ValueError, UnicodeDecodeError) as exc:
        ui.error(str(exc))
        return
    ui.ok(f"Wrote {target}")


def words(path: str) -> None:
    """Stats about a piece of writing."""
    ui.title(f"Writing report: {os.path.basename(path)}")
    with open(path, encoding="utf-8", errors="ignore") as handle:
        stats = textdata.analyse_text(handle.read())
    ui.rows([
        ("Words", f"{stats['words']:,}"),
        ("Different words", f"{stats['unique_words']:,}"),
        ("Characters", f"{stats['characters']:,}"),
        ("Sentences", f"{stats['sentences']:,}"),
        ("Paragraphs", f"{stats['paragraphs']:,}"),
        ("Reading time", ui.human_time(stats["reading_seconds"])),
        ("Average word length", f"{stats['average_word_length']} letters"),
        ("Average sentence", f"{stats['average_sentence_words']} words"),
        ("Longest word", stats["longest_word"]),
    ])
    if stats["top_words"]:
        print()
        print(ui.bold("  Words you use most"))
        biggest = stats["top_words"][0][1]
        for word, count in stats["top_words"]:
            print(f"  {word.ljust(16)}{ui.bar(count / biggest, 20)} {ui.dim(str(count))}")


def code(folder: str) -> None:
    """Count how much code is in a project."""
    ui.title(f"Code count: {folder}")
    rows, total_files, total_lines = textdata.count_code(folder)
    if not rows:
        ui.warn("No code files found here.")
        return
    biggest = rows[0][2]
    for ext, count, lines in rows[:15]:
        label = f".{ext}".ljust(8)
        print(f"  {label}{ui.bar(lines / biggest, 20)} {str(lines).rjust(7)} lines "
              f"{ui.dim(f'({count} files)')}")
    print()
    ui.ok(f"{total_lines:,} lines of code across {total_files:,} files.")


def password(length: int = 20, phrase: bool = False, count: int = 5,
             word_count: int = 6) -> None:
    """Make passwords nobody can guess."""
    ui.title("Password maker")
    for _ in range(max(1, count)):
        if phrase:
            secret = fun.make_passphrase(word_count)
            bits = fun.passphrase_entropy(word_count)
        else:
            secret = fun.make_password(length)
            bits = fun.entropy_bits(secret)
        print(f"  {ui.bold(ui.green(secret))}")
    print()
    ui.info(f"Strength: {fun.strength_label(bits)} ({bits:.0f} bits of randomness)")
    ui.info(f"A fast attacker would need {fun.crack_time(bits)} to guess one.")
    if bits < 70:
        ui.warn("Want it stronger? Use more words: "
                "python3 toolbox.py password --phrase --words 8")
    if phrase:
        ui.info("Word passwords are for things you have to type from memory.")
    else:
        ui.info("Random passwords are for things your browser remembers for you.")


def big_text(text: str) -> None:
    """Print a word in giant letters."""
    print()
    print(ui.cyan(fun.banner(text)))
    print()


def pick(items, dice: str = "", teams: int = 0) -> None:
    """Random picker: choose one, shuffle, roll dice, or split into teams."""
    ui.title("Random picker")
    if dice:
        count, _, sides = dice.lower().partition("d")
        rolls = fun.roll_dice(int(count or 1), int(sides or 6))
        ui.ok("Rolled: " + "  ".join(str(roll) for roll in rolls))
        if len(rolls) > 1:
            ui.info(f"Total: {sum(rolls)}")
        return
    if not items:
        ui.error("Give me some things to pick from.")
        return
    if teams:
        for index, team in enumerate(fun.make_teams(items, teams), start=1):
            ui.ok(f"Team {index}: " + ", ".join(team))
        return
    ui.ok(f"I pick: {ui.bold(fun.pick_one(items))}")
    if len(items) > 2:
        ui.info("Full order: " + ", ".join(fun.shuffle(items)))


def timer(duration: str, label: str = "Timer") -> None:
    """Count down and beep at the end."""
    try:
        seconds = fun.parse_duration(duration)
    except ValueError as exc:
        ui.error(str(exc))
        return
    ui.title(f"{label} — {ui.human_time(seconds)}")
    try:
        fun.countdown(seconds, label)
    except KeyboardInterrupt:
        print()
        ui.warn("Timer stopped early.")


# ── the menu, for people who don't want to type commands ─────────────────────

MENU = [
    ("Tidy up a messy folder", "organize"),
    ("Find duplicate files", "duplicates"),
    ("Rename lots of files at once", "rename"),
    ("See what's eating my disk space", "space"),
    ("Share a folder over wi-fi", "share"),
    ("Convert CSV to JSON (or back)", "convert"),
    ("Report on a piece of writing", "words"),
    ("Count the code in a project", "code"),
    ("Make a strong password", "password"),
    ("Write something in giant letters", "banner"),
    ("Pick randomly / roll dice / make teams", "pick"),
    ("Start a countdown timer", "timer"),
    ("Undo my last file change", "undo"),
]


def run_menu_choice(key: str) -> None:
    """Ask the questions a tool needs, then run it."""
    if key == "organize":
        tidy(ui.ask_folder("Which folder is messy?", "."))
    elif key == "duplicates":
        duplicates(ui.ask_folder("Which folder should I search?", "."))
    elif key == "rename":
        folder = ui.ask_folder("Which folder?", ".")
        print()
        modes = [
            ("replace", "swap some text in every name"),
            ("number", "rename to 'Holiday 001', 'Holiday 002', ..."),
            ("prefix", "add something to the front"),
            ("suffix", "add something to the end"),
            ("clean", "make names tidy and web-safe"),
            ("lower", "make everything lowercase"),
        ]
        for index, (name, blurb) in enumerate(modes, start=1):
            print(f"  {ui.bold(str(index))}. {name.ljust(9)} {ui.dim(blurb)}")
        print()
        mode = modes[ui.ask_int("Which one?", 1, 1, len(modes)) - 1][0]
        find = replace = text = pattern = ""
        start = 1
        if mode == "replace":
            find = ui.ask("Text to look for")
            replace = ui.ask("Replace it with (blank deletes it)")
        elif mode == "number":
            pattern = ui.ask("Name to use", "file")
            start = ui.ask_int("Start counting at", 1, 0)
        elif mode in ("prefix", "suffix"):
            text = ui.ask("Text to add")
        rename(folder, mode, find=find, replace=replace, text=text,
               pattern=pattern, start=start)
    elif key == "space":
        space(ui.ask_folder("Which folder should I measure?", "."))
    elif key == "share":
        share.serve(ui.ask_folder("Which folder do you want to share?", "."))
    elif key == "convert":
        convert(ui.ask_file("Which .csv or .json file?"))
    elif key == "words":
        words(ui.ask_file("Which text file?"))
    elif key == "code":
        code(ui.ask_folder("Which project folder?", "."))
    elif key == "password":
        phrase = ui.ask_yes_no("Do you need to remember it yourself?", default=False)
        if phrase:
            password(phrase=True, word_count=ui.ask_int("How many words?", 6, 3, 12))
        else:
            password(length=ui.ask_int("How many characters?", 20, 8, 128))
    elif key == "banner":
        big_text(ui.ask("What should I write?", "HELLO"))
    elif key == "pick":
        raw = ui.ask("List your options, separated by commas "
                     "(or type something like 2d20 to roll dice)")
        if raw and "," not in raw and raw.lower().replace("d", "").isdigit() and "d" in raw.lower():
            pick([], dice=raw)
            return
        items = [part.strip() for part in raw.split(",") if part.strip()]
        teams = 0
        if len(items) > 3 and ui.ask_yes_no("Split these into teams?", default=False):
            teams = ui.ask_int("How many teams?", 2, 2, len(items))
        pick(items, teams=teams)
    elif key == "timer":
        timer(ui.ask("How long? (like 10m, 90s, 1h30m)", "5m"),
              ui.ask("What is it for?", "Timer"))
    elif key == "undo":
        undo(ui.ask_folder("Which folder should I undo?", "."))


def menu() -> None:
    """The friendly front door: a numbered list of everything the toolbox does."""
    print(ui.cyan(LOGO))
    print(f"  {ui.dim('version ' + VERSION + ' — nothing to install, nothing to break')}")
    while True:
        ui.title("What would you like to do?")
        for index, (label, _) in enumerate(MENU, start=1):
            print(f"  {ui.bold(str(index).rjust(2))}. {label}")
        print(f"  {ui.bold(' 0')}. Quit")
        print()
        choice = ui.ask_int("Pick a number", 0, 0, len(MENU))
        if choice == 0:
            ui.ok("Bye!")
            return
        try:
            run_menu_choice(MENU[choice - 1][1])
        except KeyboardInterrupt:
            print()
            ui.warn("Stopped.")
        except (OSError, ValueError) as exc:
            ui.error(str(exc))
        print()
        ui.ask("Press Enter for the menu")


# ── command line ─────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="toolbox",
        description="A box of small, useful tools. Run with no arguments for a menu.",
    )
    parser.add_argument("--version", action="version", version=f"GAR Toolbox {VERSION}")
    subs = parser.add_subparsers(dest="command")

    p = subs.add_parser("organize", help="tidy loose files into folders by type")
    p.add_argument("folder", nargs="?", default=".")
    p.add_argument("--go", action="store_true", help="do it without asking first")

    p = subs.add_parser("duplicates", help="find files that are exact copies")
    p.add_argument("folder", nargs="?", default=".")
    p.add_argument("--move", action="store_true", help="move extras to duplicates-found/")
    p.add_argument("--delete", action="store_true", help="permanently delete extras")
    p.add_argument("--yes", action="store_true", help="skip the delete confirmation")

    p = subs.add_parser("rename", help="rename many files at once")
    p.add_argument("folder", nargs="?", default=".")
    p.add_argument("--mode", default="clean",
                   choices=["replace", "prefix", "suffix", "number", "clean", "lower"])
    p.add_argument("--find", default="", help="text to look for (replace mode)")
    p.add_argument("--replace", default="", help="text to swap in (replace mode)")
    p.add_argument("--text", default="", help="text to add (prefix/suffix mode)")
    p.add_argument("--pattern", default="file", help="base name (number mode)")
    p.add_argument("--start", type=int, default=1, help="first number (number mode)")
    p.add_argument("--go", action="store_true", help="do it without asking first")

    p = subs.add_parser("space", help="show what is using your disk space")
    p.add_argument("folder", nargs="?", default=".")
    p.add_argument("--top", type=int, default=12)

    p = subs.add_parser("share", help="share a folder with devices on your wi-fi")
    p.add_argument("folder", nargs="?", default=".")
    p.add_argument("--port", type=int, default=0)

    p = subs.add_parser("convert", help="CSV to JSON, or JSON to CSV")
    p.add_argument("file")
    p.add_argument("-o", "--out", default="")

    p = subs.add_parser("words", help="report on a piece of writing")
    p.add_argument("file")

    p = subs.add_parser("code", help="count the code in a project")
    p.add_argument("folder", nargs="?", default=".")

    p = subs.add_parser("password", help="make strong passwords")
    p.add_argument("--length", type=int, default=20)
    p.add_argument("--phrase", action="store_true", help="use real words instead")
    p.add_argument("--words", type=int, default=6, help="how many words (with --phrase)")
    p.add_argument("--count", type=int, default=5, help="how many to show")

    p = subs.add_parser("banner", help="write something in giant letters")
    p.add_argument("text", nargs="+")

    p = subs.add_parser("pick", help="pick randomly, roll dice, or make teams")
    p.add_argument("items", nargs="*")
    p.add_argument("--dice", default="", help="like 2d6 or 1d20")
    p.add_argument("--teams", type=int, default=0)

    p = subs.add_parser("timer", help="count down and beep")
    p.add_argument("duration", help="like 10m, 90s or 1h30m")
    p.add_argument("--label", default="Timer")

    subs.add_parser("undo", help="undo the last file change").add_argument(
        "folder", nargs="?", default=".")

    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.command:
        menu()
        return 0

    folder = os.path.abspath(os.path.expanduser(getattr(args, "folder", ".")))
    if hasattr(args, "folder") and not os.path.isdir(folder):
        ui.error(f"There is no folder called {folder!r}.")
        return 1

    if args.command == "organize":
        tidy(folder, args.go)
    elif args.command == "duplicates":
        duplicates(folder, args.move, args.delete, args.yes)
    elif args.command == "rename":
        rename(folder, args.mode, find=args.find, replace=args.replace, text=args.text,
               pattern=args.pattern, start=args.start, go=args.go)
    elif args.command == "space":
        space(folder, args.top)
    elif args.command == "share":
        share.serve(folder, args.port)
    elif args.command == "convert":
        convert(os.path.expanduser(args.file), args.out)
    elif args.command == "words":
        words(os.path.expanduser(args.file))
    elif args.command == "code":
        code(folder)
    elif args.command == "password":
        password(args.length, args.phrase, args.count, args.words)
    elif args.command == "banner":
        big_text(" ".join(args.text))
    elif args.command == "pick":
        pick(args.items, args.dice, args.teams)
    elif args.command == "timer":
        timer(args.duration, args.label)
    elif args.command == "undo":
        undo(folder)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        ui.warn("Stopped.")
        sys.exit(130)
