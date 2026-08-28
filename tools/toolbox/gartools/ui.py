"""Small helpers for talking to the person using the toolbox.

Everything here is about printing nicely and asking questions safely.
No tool logic lives in this file.
"""

from __future__ import annotations

import os
import sys

# Turn on colour support in old Windows terminals.
if os.name == "nt":  # pragma: no cover - depends on the operating system
    os.system("")

_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOR else text


def bold(text: str) -> str:
    return _c("1", text)


def dim(text: str) -> str:
    return _c("2", text)


def cyan(text: str) -> str:
    return _c("36", text)


def green(text: str) -> str:
    return _c("32", text)


def yellow(text: str) -> str:
    return _c("33", text)


def red(text: str) -> str:
    return _c("31", text)


def title(text: str) -> None:
    """Print a heading with a line under it."""
    print()
    print(bold(cyan(text)))
    print(cyan("─" * len(text)))


def ok(text: str) -> None:
    print(green("  ✔ ") + text)


def info(text: str) -> None:
    print(dim("  · ") + text)


def warn(text: str) -> None:
    print(yellow("  ! ") + text)


def error(text: str) -> None:
    print(red("  ✖ ") + text)


def human_size(num_bytes: float) -> str:
    """Turn 1536 into '1.5 KB' so sizes are readable."""
    step = 1024.0
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < step or unit == "TB":
            if unit == "B":
                return f"{int(num_bytes)} B"
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= step
    return f"{num_bytes:.1f} TB"


def human_time(seconds: float) -> str:
    """Turn 3725 seconds into '1h 2m 5s'."""
    seconds = int(seconds)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    parts = []
    if hours:
        parts.append(f"{hours}h")
    if minutes or hours:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


def can_ask() -> bool:
    """True when a real person is at the keyboard to answer questions."""
    return sys.stdin is not None and sys.stdin.isatty()


def ask(question: str, default: str = "") -> str:
    """Ask for some text. Pressing Enter accepts the default."""
    suffix = f" [{default}]" if default else ""
    try:
        answer = input(f"{bold('?')} {question}{dim(suffix)}: ").strip()
    except EOFError:
        return default
    return answer or default


def ask_yes_no(question: str, default: bool = False) -> bool:
    """Ask a yes/no question. Anything starting with y means yes."""
    hint = "Y/n" if default else "y/N"
    try:
        answer = input(f"{bold('?')} {question} {dim('[' + hint + ']')}: ").strip().lower()
    except EOFError:
        return default
    if not answer:
        return default
    return answer.startswith("y")


def ask_int(question: str, default: int, low: int = 1, high: int = 1_000_000) -> int:
    """Ask for a whole number and keep asking until it makes sense."""
    while True:
        raw = ask(question, str(default))
        try:
            value = int(raw)
        except ValueError:
            error("That is not a number. Try again.")
            continue
        if not low <= value <= high:
            error(f"Pick a number between {low} and {high}.")
            continue
        return value


def ask_folder(question: str, default: str = ".") -> str:
    """Ask for a folder and keep asking until it actually exists."""
    while True:
        raw = os.path.expanduser(ask(question, default))
        if os.path.isdir(raw):
            return os.path.abspath(raw)
        error(f"There is no folder called {raw!r}.")


def ask_file(question: str, default: str = "") -> str:
    """Ask for a file and keep asking until it actually exists."""
    while True:
        raw = os.path.expanduser(ask(question, default))
        if raw and os.path.isfile(raw):
            return os.path.abspath(raw)
        error(f"There is no file called {raw!r}.")


def rows(pairs, gap: int = 2) -> None:
    """Print two aligned columns, e.g. a name and a size."""
    pairs = list(pairs)
    if not pairs:
        return
    width = max(len(str(left)) for left, _ in pairs)
    for left, right in pairs:
        print(f"  {str(left).ljust(width)}{' ' * gap}{dim(str(right))}")


def bar(fraction: float, width: int = 28) -> str:
    """A little progress bar: ██████░░░░░░"""
    fraction = max(0.0, min(1.0, fraction))
    filled = int(round(fraction * width))
    return green("█" * filled) + dim("░" * (width - filled))
