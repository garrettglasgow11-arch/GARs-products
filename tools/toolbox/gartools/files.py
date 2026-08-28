"""File tools: tidy a folder, find duplicates, rename in bulk, find big files.

Every tool that moves files writes an undo log first, so nothing you do here
is permanent by accident.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import time
from typing import Dict, Iterable, List, Sequence, Tuple

UNDO_FILE = ".toolbox-undo.json"

# Which folder each kind of file gets moved into.
CATEGORIES: Dict[str, Sequence[str]] = {
    "Images": ("jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "svg", "tiff", "ico"),
    "Videos": ("mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "m4v"),
    "Music": ("mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "mid"),
    "PDFs": ("pdf",),
    "Documents": ("doc", "docx", "txt", "rtf", "odt", "md", "pages", "epub"),
    "Spreadsheets": ("xls", "xlsx", "csv", "tsv", "ods", "numbers"),
    "Slideshows": ("ppt", "pptx", "odp", "key"),
    "Archives": ("zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"),
    "Code": ("py", "js", "ts", "html", "css", "json", "java", "c", "cpp", "cs",
             "go", "rb", "rs", "sh", "lua", "php", "swift", "kt", "yml", "yaml"),
    "Installers": ("exe", "msi", "dmg", "pkg", "deb", "rpm", "appimage", "apk"),
    "Fonts": ("ttf", "otf", "woff", "woff2"),
}

# Folders that are never worth walking into.
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".idea",
             ".vscode", "dist", "build", ".next", "target"}


def extension(path: str) -> str:
    """'photo.JPG' -> 'jpg'. No extension -> ''."""
    return os.path.splitext(path)[1].lstrip(".").lower()


def category_for(path: str) -> str:
    """Which folder name this file belongs in."""
    ext = extension(path)
    for name, extensions in CATEGORIES.items():
        if ext in extensions:
            return name
    return "Other"


def walk_files(folder: str, recursive: bool = True, include_hidden: bool = False) -> List[str]:
    """List every file under a folder, skipping junk folders."""
    found: List[str] = []
    for root, dirs, names in os.walk(folder):
        dirs[:] = [d for d in dirs
                   if d not in SKIP_DIRS and (include_hidden or not d.startswith("."))]
        for name in names:
            if not include_hidden and name.startswith("."):
                continue
            found.append(os.path.join(root, name))
        if not recursive:
            break
    return found


def unique_path(path: str) -> str:
    """If 'cat.png' exists, return 'cat (2).png' instead of overwriting it."""
    if not os.path.exists(path):
        return path
    stem, ext = os.path.splitext(path)
    counter = 2
    while os.path.exists(f"{stem} ({counter}){ext}"):
        counter += 1
    return f"{stem} ({counter}){ext}"


# ── moving files, with an undo log ────────────────────────────────────────────

def apply_moves(moves: Sequence[Tuple[str, str]], undo_dir: str, action: str) -> int:
    """Move files and record what happened so it can be undone."""
    done: List[Tuple[str, str]] = []
    for source, target in moves:
        if not os.path.exists(source):
            continue
        os.makedirs(os.path.dirname(target) or ".", exist_ok=True)
        final = unique_path(target)
        shutil.move(source, final)
        done.append((source, final))
    if done:
        write_undo_log(undo_dir, action, done)
    return len(done)


def write_undo_log(folder: str, action: str, moves: Sequence[Tuple[str, str]]) -> str:
    """Save an undo log inside the folder we just changed."""
    path = os.path.join(folder, UNDO_FILE)
    payload = {
        "action": action,
        "when": time.strftime("%Y-%m-%d %H:%M:%S"),
        "moves": [{"from": src, "to": dst} for src, dst in moves],
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return path


def undo_last(folder: str) -> Tuple[int, str]:
    """Put every file from the last run back where it came from."""
    path = os.path.join(folder, UNDO_FILE)
    if not os.path.isfile(path):
        return 0, "no undo log"
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
    restored = 0
    for move in reversed(payload.get("moves", [])):
        current, original = move["to"], move["from"]
        if not os.path.exists(current):
            continue
        os.makedirs(os.path.dirname(original) or ".", exist_ok=True)
        shutil.move(current, unique_path(original))
        restored += 1
    os.remove(path)
    # Clean up folders the tidy-up created and then emptied.
    for root, dirs, _ in os.walk(folder, topdown=False):
        for name in dirs:
            candidate = os.path.join(root, name)
            try:
                if not os.listdir(candidate):
                    os.rmdir(candidate)
            except OSError:
                pass
    return restored, payload.get("action", "unknown")


# ── tool 1: organize ─────────────────────────────────────────────────────────

def plan_organize(folder: str) -> List[Tuple[str, str]]:
    """Work out where every loose file in a folder should go."""
    moves = []
    for name in sorted(os.listdir(folder)):
        source = os.path.join(folder, name)
        if not os.path.isfile(source) or name.startswith("."):
            continue
        target = os.path.join(folder, category_for(name), name)
        if os.path.abspath(source) != os.path.abspath(target):
            moves.append((source, target))
    return moves


def summarize(moves: Sequence[Tuple[str, str]], folder: str) -> List[Tuple[str, str]]:
    """Count how many files land in each new folder."""
    counts: Dict[str, int] = {}
    for _, target in moves:
        bucket = os.path.basename(os.path.dirname(target))
        counts[bucket] = counts.get(bucket, 0) + 1
    return [(name, f"{count} file{'s' if count != 1 else ''}")
            for name, count in sorted(counts.items(), key=lambda item: -item[1])]


# ── tool 2: duplicates ───────────────────────────────────────────────────────

def file_hash(path: str, chunk: int = 1 << 20) -> str:
    """A short fingerprint of a file's contents."""
    digest = hashlib.blake2b(digest_size=16)
    with open(path, "rb") as handle:
        while True:
            block = handle.read(chunk)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def find_duplicates(folder: str, recursive: bool = True) -> List[List[str]]:
    """Find groups of files that are byte-for-byte identical."""
    by_size: Dict[int, List[str]] = {}
    for path in walk_files(folder, recursive=recursive):
        try:
            size = os.path.getsize(path)
        except OSError:
            continue
        if size == 0:
            continue
        by_size.setdefault(size, []).append(path)

    groups: List[List[str]] = []
    for paths in by_size.values():
        if len(paths) < 2:
            continue  # A unique size can't have a twin.
        by_hash: Dict[str, List[str]] = {}
        for path in paths:
            try:
                by_hash.setdefault(file_hash(path), []).append(path)
            except OSError:
                continue
        groups.extend(sorted(group) for group in by_hash.values() if len(group) > 1)
    groups.sort(key=lambda group: -os.path.getsize(group[0]))
    return groups


def wasted_space(groups: Iterable[Sequence[str]]) -> int:
    """How many bytes the extra copies are using up."""
    total = 0
    for group in groups:
        try:
            total += os.path.getsize(group[0]) * (len(group) - 1)
        except OSError:
            pass
    return total


# ── tool 3: bulk rename ──────────────────────────────────────────────────────

def clean_name(name: str) -> str:
    """'My  Cool   File!.txt' -> 'my-cool-file.txt'"""
    stem, ext = os.path.splitext(name)
    stem = stem.strip().lower()
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return f"{stem or 'file'}{ext.lower()}"


def plan_rename(folder: str, mode: str, find: str = "", replace: str = "",
                text: str = "", start: int = 1, pattern: str = "") -> List[Tuple[str, str]]:
    """Build the list of renames without doing any of them yet.

    Modes: replace, prefix, suffix, number, clean, lower
    """
    names = sorted(name for name in os.listdir(folder)
                   if os.path.isfile(os.path.join(folder, name)) and not name.startswith("."))
    moves: List[Tuple[str, str]] = []
    counter = start
    for name in names:
        stem, ext = os.path.splitext(name)
        if mode == "replace":
            new = name.replace(find, replace)
        elif mode == "prefix":
            new = f"{text}{name}"
        elif mode == "suffix":
            new = f"{stem}{text}{ext}"
        elif mode == "number":
            base = pattern or "file"
            new = f"{base} {counter:03d}{ext}"
            counter += 1
        elif mode == "clean":
            new = clean_name(name)
        elif mode == "lower":
            new = name.lower()
        else:
            raise ValueError(f"unknown rename mode: {mode}")
        if new and new != name:
            moves.append((os.path.join(folder, name), os.path.join(folder, new)))
    return moves


# ── tool 4: big files ────────────────────────────────────────────────────────

def biggest_files(folder: str, limit: int = 15) -> List[Tuple[str, int]]:
    """The largest files under a folder, biggest first."""
    sizes: List[Tuple[str, int]] = []
    for path in walk_files(folder):
        try:
            sizes.append((path, os.path.getsize(path)))
        except OSError:
            continue
    sizes.sort(key=lambda item: -item[1])
    return sizes[:limit]


def biggest_folders(folder: str, limit: int = 10) -> List[Tuple[str, int]]:
    """The heaviest direct sub-folders, biggest first."""
    totals: List[Tuple[str, int]] = []
    for name in sorted(os.listdir(folder)):
        path = os.path.join(folder, name)
        if not os.path.isdir(path) or name.startswith("."):
            continue
        total = 0
        for child in walk_files(path):
            try:
                total += os.path.getsize(child)
            except OSError:
                continue
        totals.append((name, total))
    totals.sort(key=lambda item: -item[1])
    return totals[:limit]


def short(path: str, root: str) -> str:
    """Show a path relative to the folder we searched, so lines stay narrow."""
    try:
        return os.path.relpath(path, root)
    except ValueError:  # pragma: no cover - different drives on Windows
        return path


__all__ = [
    "CATEGORIES", "apply_moves", "biggest_files", "biggest_folders", "category_for",
    "clean_name", "extension", "file_hash", "find_duplicates", "plan_organize",
    "plan_rename", "short", "summarize", "undo_last", "unique_path", "walk_files",
    "wasted_space", "write_undo_log",
]
