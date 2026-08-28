"""Everyday tools: strong passwords, big ASCII text, random picks, timers."""

from __future__ import annotations

import math
import secrets
import string
import time
from typing import Dict, List, Sequence, Tuple

from . import ui

# ── passwords ────────────────────────────────────────────────────────────────

# Short, easy-to-type words for passphrases like "otter-galaxy-marble-42".
WORDS: Tuple[str, ...] = (
    "acorn", "amber", "anchor", "apple", "arrow", "atlas", "aurora", "badger",
    "bagel", "bamboo", "banjo", "basil", "beacon", "beetle", "berry", "bison",
    "blossom", "bobcat", "bolt", "bonsai", "boulder", "brave", "breeze", "bronze",
    "bubble", "cactus", "camel", "candle", "canyon", "cargo", "carrot", "castle",
    "cedar", "cello", "cherry", "chess", "chili", "cinder", "cobra", "cocoa",
    "comet", "compass", "copper", "coral", "cosmic", "cotton", "cougar", "crater",
    "crayon", "cricket", "crystal", "cyclone", "daisy", "dazzle", "delta", "denim",
    "diamond", "dingo", "dolphin", "domino", "donut", "dragon", "dune", "eagle",
    "echo", "ember", "emerald", "engine", "falcon", "feather", "fiddle", "fjord",
    "flamingo", "flint", "forest", "fossil", "fountain", "fox", "galaxy", "garden",
    "gecko", "geyser", "ginger", "glacier", "gnome", "granite", "gravity", "guitar",
    "hammock", "harbor", "hazel", "hedgehog", "helium", "hickory", "honey", "hornet",
    "iceberg", "igloo", "indigo", "island", "ivory", "jaguar", "jasmine", "jelly",
    "jigsaw", "juniper", "kayak", "kelp", "kestrel", "kite", "koala", "lagoon",
    "lantern", "lava", "lemon", "lentil", "lighthouse", "lilac", "lizard", "llama",
    "lobster", "lotus", "lunar", "lynx", "magnet", "mango", "maple", "marble",
    "meadow", "meteor", "mint", "mirror", "molten", "monsoon", "moss", "muffin",
    "nebula", "nectar", "needle", "neon", "nickel", "noodle", "nutmeg", "oasis",
    "ocean", "octopus", "olive", "onyx", "opal", "orbit", "orchid", "otter",
    "outpost", "oyster", "paddle", "panda", "papaya", "parrot", "peach", "pebble",
    "pelican", "penguin", "pepper", "pewter", "phoenix", "pickle", "pigeon", "pine",
    "pixel", "planet", "plasma", "plum", "pocket", "polar", "pony", "poppy",
    "portal", "prairie", "pretzel", "prism", "pudding", "puffin", "pumpkin", "quartz",
    "quasar", "quiver", "rabbit", "radar", "raft", "rain", "raven", "reef",
    "ripple", "river", "robin", "rocket", "rope", "rubble", "ruby", "rune",
    "saffron", "sage", "salmon", "sandal", "sapphire", "satin", "scooter", "seal",
    "shadow", "shark", "shell", "sherbet", "shovel", "silver", "sketch", "sled",
    "sloth", "smoke", "snapper", "socket", "solar", "sparrow", "spice", "spiral",
    "spruce", "squid", "stallion", "stone", "storm", "sugar", "summit", "sunset",
    "sushi", "swamp", "swift", "syrup", "talon", "tangerine", "teapot", "tempo",
    "thicket", "thistle", "thunder", "tiger", "timber", "toast", "toffee", "topaz",
    "tornado", "torch", "totem", "trail", "tulip", "tundra", "turtle", "twig",
    "umbrella", "unicorn", "valley", "velvet", "vinyl", "violet", "volcano", "waffle",
    "walnut", "walrus", "wasabi", "waterfall", "wombat", "yak", "yarn", "zebra",
    "zephyr", "zigzag", "zinc", "zipper",
)

SYMBOLS = "!@#$%^&*?-_=+"


def make_password(length: int = 20, symbols: bool = True, digits: bool = True) -> str:
    """A random password. Guaranteed to include one of each kind you asked for."""
    length = max(6, length)
    pools = [string.ascii_lowercase, string.ascii_uppercase]
    if digits:
        pools.append(string.digits)
    if symbols:
        pools.append(SYMBOLS)
    alphabet = "".join(pools)
    # Start with one character from each pool, then fill the rest randomly.
    chars = [secrets.choice(pool) for pool in pools]
    chars += [secrets.choice(alphabet) for _ in range(length - len(chars))]
    # secrets-backed shuffle so the guaranteed characters aren't always in front.
    for index in range(len(chars) - 1, 0, -1):
        swap = secrets.randbelow(index + 1)
        chars[index], chars[swap] = chars[swap], chars[index]
    return "".join(chars)


def make_passphrase(words: int = 6, separator: str = "-", number: bool = True) -> str:
    """A password made of real words — easy to remember, still very strong."""
    words = max(2, words)
    parts = [secrets.choice(WORDS) for _ in range(words)]
    if number:
        parts.append(str(secrets.randbelow(90) + 10))
    return separator.join(parts)


def passphrase_entropy(word_count: int, number: bool = True) -> float:
    """Real strength of a word-based password.

    Counting letters would badly overrate a passphrase, because the secret is
    the choice of words, not the choice of letters. Each word is one pick out
    of the whole list, and the trailing number is one pick out of 90.
    """
    bits = word_count * math.log2(len(WORDS))
    if number:
        bits += math.log2(90)
    return bits


def entropy_bits(password: str) -> float:
    """Roughly how many bits of randomness a password has."""
    pool = 0
    if any(c.islower() for c in password):
        pool += 26
    if any(c.isupper() for c in password):
        pool += 26
    if any(c.isdigit() for c in password):
        pool += 10
    if any(not c.isalnum() for c in password):
        pool += len(SYMBOLS)
    if pool == 0:
        return 0.0
    return len(password) * math.log2(pool)


def crack_time(bits: float, guesses_per_second: float = 1e11) -> str:
    """A friendly 'how long would this take to guess' estimate."""
    if bits <= 0:
        return "instantly"
    seconds = (2 ** (bits - 1)) / guesses_per_second
    units = (
        ("seconds", 1), ("minutes", 60), ("hours", 3600), ("days", 86400),
        ("years", 31_557_600), ("thousand years", 31_557_600 * 1_000),
        ("million years", 31_557_600 * 1_000_000),
    )
    if seconds < 1:
        return "instantly"
    name, size = units[0]
    for unit_name, unit_size in units:
        if seconds / unit_size < 1000:
            name, size = unit_name, unit_size
            break
        name, size = unit_name, unit_size
    value = seconds / size
    if value > 1000:
        return "longer than the universe has existed"
    return f"about {value:,.0f} {name}"


def strength_label(bits: float) -> str:
    """Turn bits of entropy into words a person understands."""
    if bits < 40:
        return "weak"
    if bits < 60:
        return "okay"
    if bits < 80:
        return "strong"
    return "very strong"


# ── big ASCII text ───────────────────────────────────────────────────────────

_FONT_SOURCE: Dict[str, Sequence[str]] = {
    "A": (".###.", "#...#", "#####", "#...#", "#...#"),
    "B": ("####.", "#...#", "####.", "#...#", "####."),
    "C": (".####", "#....", "#....", "#....", ".####"),
    "D": ("####.", "#...#", "#...#", "#...#", "####."),
    "E": ("#####", "#....", "####.", "#....", "#####"),
    "F": ("#####", "#....", "####.", "#....", "#...."),
    "G": (".####", "#....", "#..##", "#...#", ".###."),
    "H": ("#...#", "#...#", "#####", "#...#", "#...#"),
    "I": ("#####", "..#..", "..#..", "..#..", "#####"),
    "J": ("..###", "...#.", "...#.", "#..#.", ".##.."),
    "K": ("#...#", "#..#.", "###..", "#..#.", "#...#"),
    "L": ("#....", "#....", "#....", "#....", "#####"),
    "M": ("#...#", "##.##", "#.#.#", "#...#", "#...#"),
    "N": ("#...#", "##..#", "#.#.#", "#..##", "#...#"),
    "O": (".###.", "#...#", "#...#", "#...#", ".###."),
    "P": ("####.", "#...#", "####.", "#....", "#...."),
    "Q": (".###.", "#...#", "#.#.#", "#..#.", ".##.#"),
    "R": ("####.", "#...#", "####.", "#..#.", "#...#"),
    "S": (".####", "#....", ".###.", "....#", "####."),
    "T": ("#####", "..#..", "..#..", "..#..", "..#.."),
    "U": ("#...#", "#...#", "#...#", "#...#", ".###."),
    "V": ("#...#", "#...#", "#...#", ".#.#.", "..#.."),
    "W": ("#...#", "#...#", "#.#.#", "##.##", "#...#"),
    "X": ("#...#", ".#.#.", "..#..", ".#.#.", "#...#"),
    "Y": ("#...#", ".#.#.", "..#..", "..#..", "..#.."),
    "Z": ("#####", "...#.", "..#..", ".#...", "#####"),
    "0": (".###.", "#..##", "#.#.#", "##..#", ".###."),
    "1": ("..#..", ".##..", "..#..", "..#..", ".###."),
    "2": (".###.", "#...#", "..##.", ".#...", "#####"),
    "3": ("####.", "....#", ".###.", "....#", "####."),
    "4": ("#..#.", "#..#.", "#####", "...#.", "...#."),
    "5": ("#####", "#....", "####.", "....#", "####."),
    "6": (".###.", "#....", "####.", "#...#", ".###."),
    "7": ("#####", "....#", "...#.", "..#..", "..#.."),
    "8": (".###.", "#...#", ".###.", "#...#", ".###."),
    "9": (".###.", "#...#", ".####", "....#", ".###."),
    " ": ("..", "..", "..", "..", ".."),
    "!": ("#", "#", "#", ".", "#"),
    "?": (".###.", "#...#", "..##.", ".....", "..#.."),
    ".": (".", ".", ".", ".", "#"),
    ",": (".", ".", ".", "#", "#"),
    "-": ("...", "...", "###", "...", "..."),
    "+": (".....", "..#..", ".###.", "..#..", "....."),
    "'": ("#", "#", ".", ".", "."),
    ":": (".", "#", ".", "#", "."),
    "/": ("....#", "...#.", "..#..", ".#...", "#...."),
}

FONT_HEIGHT = 5


def banner(text: str, block: str = "█") -> str:
    """Turn 'HI' into five lines of giant letters."""
    text = text.upper()
    lines = [""] * FONT_HEIGHT
    for char in text:
        glyph = _FONT_SOURCE.get(char)
        if glyph is None:
            glyph = _FONT_SOURCE[" "]
        for row in range(FONT_HEIGHT):
            pixels = glyph[row].replace("#", block).replace(".", " ")
            lines[row] += pixels + " "
    return "\n".join(line.rstrip() for line in lines)


# ── random picks ─────────────────────────────────────────────────────────────

def pick_one(options: Sequence[str]) -> str:
    """Pick one option fairly."""
    if not options:
        raise ValueError("Give me at least one thing to pick from.")
    return secrets.choice(list(options))


def shuffle(options: Sequence[str]) -> List[str]:
    """Put a list in a random order."""
    items = list(options)
    for index in range(len(items) - 1, 0, -1):
        swap = secrets.randbelow(index + 1)
        items[index], items[swap] = items[swap], items[index]
    return items


def roll_dice(count: int = 1, sides: int = 6) -> List[int]:
    """Roll dice, e.g. roll_dice(2, 20) for two twenty-sided dice."""
    count = max(1, min(count, 1000))
    sides = max(2, min(sides, 1000))
    return [secrets.randbelow(sides) + 1 for _ in range(count)]


def make_teams(names: Sequence[str], team_count: int = 2) -> List[List[str]]:
    """Split names into fair, randomly-ordered teams."""
    team_count = max(1, min(team_count, max(1, len(names))))
    teams: List[List[str]] = [[] for _ in range(team_count)]
    for index, name in enumerate(shuffle(names)):
        teams[index % team_count].append(name)
    return teams


# ── countdown timer ──────────────────────────────────────────────────────────

def parse_duration(text: str) -> int:
    """'5m', '90', '1h30m' and '2m 30s' all become a number of seconds."""
    text = text.strip().lower().replace(" ", "")
    if not text:
        raise ValueError("Tell me how long, like '5m' or '90s'.")
    if text.isdigit():
        return int(text)
    total = 0
    number = ""
    matched = False
    for char in text:
        if char.isdigit():
            number += char
        elif char in "hms" and number:
            total += int(number) * {"h": 3600, "m": 60, "s": 1}[char]
            number = ""
            matched = True
        else:
            raise ValueError(f"I don't understand {text!r}. Try '5m' or '90s'.")
    if number:
        total += int(number)
        matched = True
    if not matched:
        raise ValueError(f"I don't understand {text!r}. Try '5m' or '90s'.")
    return total


def countdown(seconds: int, label: str = "Timer", sleeper=time.sleep) -> None:
    """Count down on one line with a progress bar, then beep."""
    total = max(1, seconds)
    for remaining in range(total, -1, -1):
        done = (total - remaining) / total
        line = f"  {label}  {ui.bar(done)}  {ui.human_time(remaining)}   "
        print("\r" + line, end="", flush=True)
        if remaining:
            sleeper(1)
    print("\r" + " " * 70, end="\r")
    ui.ok(f"{label} finished! \a")


__all__ = ["SYMBOLS", "WORDS", "banner", "countdown", "crack_time", "entropy_bits",
           "make_passphrase", "make_password", "make_teams", "parse_duration",
           "passphrase_entropy",
           "pick_one", "roll_dice", "shuffle", "strength_label"]
