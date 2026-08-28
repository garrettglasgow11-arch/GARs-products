"""Text and data tools: convert CSV/JSON, analyse writing, count code."""

from __future__ import annotations

import csv
import io
import json
import os
import re
from collections import Counter
from typing import Dict, List, Sequence, Tuple

from .files import extension, walk_files

# Words too common to be interesting in a "top words" list.
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by",
    "for", "with", "from", "as", "is", "are", "was", "were", "be", "been", "being",
    "it", "its", "this", "that", "these", "those", "i", "you", "he", "she", "we",
    "they", "them", "his", "her", "their", "our", "my", "your", "me", "him", "us",
    "not", "no", "so", "than", "then", "there", "here", "what", "which", "who",
    "when", "where", "how", "why", "all", "any", "some", "can", "will", "just",
    "do", "does", "did", "have", "has", "had", "would", "could", "should", "up",
    "out", "about", "into", "over", "after", "also", "very", "too", "s", "t",
}

# Extensions that count as source code for the code counter.
CODE_EXTENSIONS = {
    "py", "js", "jsx", "ts", "tsx", "html", "css", "scss", "java", "c", "h", "cpp",
    "hpp", "cs", "go", "rb", "rs", "sh", "bash", "lua", "php", "swift", "kt", "sql",
    "json", "yml", "yaml", "toml", "md", "vue", "svelte", "r", "m", "pl", "dart",
}


# ── converting between CSV and JSON ──────────────────────────────────────────

def csv_to_json(text: str) -> str:
    """Turn a CSV table into a JSON list of objects."""
    reader = csv.DictReader(io.StringIO(text))
    rows = [{key: value for key, value in row.items() if key is not None}
            for row in reader]
    return json.dumps(rows, indent=2, ensure_ascii=False)


def json_to_csv(text: str) -> str:
    """Turn a JSON list of objects into a CSV table."""
    data = json.loads(text)
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        raise ValueError("JSON must be a list of objects (or one object).")
    rows = []
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("Every item in the JSON list must be an object.")
        rows.append({key: _flatten(value) for key, value in item.items()})

    columns: List[str] = []
    for row in rows:
        for key in row:
            if key not in columns:
                columns.append(key)

    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: row.get(column, "") for column in columns})
    return out.getvalue()


def _flatten(value) -> str:
    """Lists and objects inside a cell get written back as compact JSON."""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if value is None:
        return ""
    return str(value)


def convert_file(path: str, out_path: str = "") -> str:
    """Convert a .csv to .json or a .json to .csv. Returns the new file path."""
    ext = extension(path)
    with open(path, encoding="utf-8-sig") as handle:
        text = handle.read()
    if ext == "csv":
        result, new_ext = csv_to_json(text), ".json"
    elif ext == "json":
        result, new_ext = json_to_csv(text), ".csv"
    else:
        raise ValueError("I can only convert .csv and .json files.")
    target = out_path or os.path.splitext(path)[0] + new_ext
    with open(target, "w", encoding="utf-8") as handle:
        handle.write(result)
    return target


# ── analysing writing ────────────────────────────────────────────────────────

def analyse_text(text: str, top: int = 12) -> Dict[str, object]:
    """Stats about a piece of writing: length, reading time, common words."""
    words = re.findall(r"[a-zA-Z']+", text.lower())
    sentences = [part for part in re.split(r"[.!?]+", text) if part.strip()]
    paragraphs = [part for part in text.split("\n\n") if part.strip()]
    interesting = [word for word in words if word not in STOPWORDS and len(word) > 2]
    counts = Counter(interesting)
    longest = max(words, key=len) if words else ""
    return {
        "characters": len(text),
        "words": len(words),
        "unique_words": len(set(words)),
        "sentences": len(sentences),
        "paragraphs": len(paragraphs),
        "lines": len(text.splitlines()),
        # 200 words per minute is a normal reading speed.
        "reading_seconds": round(len(words) / 200 * 60),
        "average_word_length": round(sum(len(w) for w in words) / len(words), 1) if words else 0.0,
        "average_sentence_words": round(len(words) / len(sentences), 1) if sentences else 0.0,
        "longest_word": longest,
        "top_words": counts.most_common(top),
    }


# ── counting code ────────────────────────────────────────────────────────────

def count_code(folder: str) -> Tuple[List[Tuple[str, int, int]], int, int]:
    """Count files and lines per language.

    Returns (rows, total_files, total_lines) where each row is
    (extension, file count, line count), biggest first.
    """
    files: Counter = Counter()
    lines: Counter = Counter()
    for path in walk_files(folder):
        ext = extension(path)
        if ext not in CODE_EXTENSIONS:
            continue
        try:
            with open(path, encoding="utf-8", errors="ignore") as handle:
                count = sum(1 for line in handle if line.strip())
        except OSError:
            continue
        files[ext] += 1
        lines[ext] += count
    rows = [(ext, files[ext], lines[ext]) for ext in lines]
    rows.sort(key=lambda row: -row[2])
    return rows, sum(files.values()), sum(lines.values())


__all__ = ["CODE_EXTENSIONS", "STOPWORDS", "analyse_text", "convert_file",
           "count_code", "csv_to_json", "json_to_csv"]
