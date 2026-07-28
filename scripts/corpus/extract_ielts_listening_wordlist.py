#!/usr/bin/env python3
"""Extract and conservatively repair the supplied IELTS listening wordlist."""

from __future__ import annotations

import argparse
import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Optional

import fitz


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PDF = Path("/Users/huhu/Desktop/雅思听力1200高频词.pdf")
DEFAULT_OUTPUT = (
    REPOSITORY_ROOT
    / "tmp"
    / "pdfs"
    / "batch_listening"
    / "ielts_listening_1200.tsv"
)
FIELDS = (
    "source",
    "raw_term",
    "headword",
    "pos",
    "cefr",
    "topic_or_section",
    "pdf_page",
    "source_ref",
    "definition",
    "notes",
)

# These repairs are limited to forms visibly printed as a single comma-delimited
# item in the source PDF. `raw_term` remains untouched for auditability.
SOURCE_CORRECTIONS = {
    ("月份 Months", "July August"): (
        ("July", "August"),
        "source layout: missing comma between two month names",
    ),
    ("旅游 Touring", "tourist guided tour"): (
        ("tourist", "guided tour"),
        "source layout: missing comma between two vocabulary items",
    ),
    ("旅游 Touring", "single double bedded room"): (
        ("single/double-bedded room",),
        "source layout: missing slash and compound-word hyphens",
    ),
    ("环境 Environment", "burring fossil"): (
        ("burning fossil fuels",),
        "source typo: corrected to the standard environmental phrase",
    ),
    ("环境 Environment", "soar power"): (
        ("solar power",),
        "source typo: corrected to the standard energy term",
    ),
    ("大洲 Continents", "Australia and Antarctica ."): (
        ("Australia", "Antarctica"),
        "source layout: two continent names joined as one item",
    ),
    ("交通 Vehicles", "stream train"): (
        ("steam train",),
        "source typo: corrected to the standard transport term",
    ),
    ("装备 Equipment", "breaks"): (
        ("brakes",),
        "source typo: corrected to the vehicle-equipment noun",
    ),
}


def clean_inline(text: str) -> str:
    return " ".join(text.replace("\x07", " ").split())


def append_note(row: dict[str, str], note: str) -> None:
    row["notes"] = "; ".join(part for part in (row["notes"], note) if part)


def generic_headword(raw: str) -> tuple[str, list[str]]:
    notes: list[str] = []
    headword = unicodedata.normalize("NFKC", raw)
    repaired = re.sub(r"(?<=\w)-\s+(?=\w)", "-", headword)
    if repaired != headword:
        notes.append("line-wrap hyphen normalized in headword")
    headword = repaired
    if headword.endswith("."):
        headword = headword[:-1].rstrip()
        notes.append("terminal source period omitted from headword")
    if "ﬁ" in raw:
        notes.append("source ligature normalized in headword")
    return headword, notes


def section_pos(section: str) -> str:
    if section == "动词 Verbs":
        return "verb"
    if section == "形容词 Adjectives":
        return "adjective"
    return ""


def extract(pdf_path: Path) -> tuple[list[dict[str, str]], dict]:
    document = fitz.open(pdf_path)
    rows: list[dict[str, str]] = []
    correction_counts: Counter[str] = Counter()
    current_section = ""
    term_buffer = ""
    term_page: Optional[int] = None

    def emit(raw_value: str, page_number: Optional[int]) -> None:
        raw = clean_inline(raw_value).strip()
        if not raw:
            if rows:
                append_note(rows[-1], "source contains an extra comma after this item")
            return

        correction = SOURCE_CORRECTIONS.get((current_section, raw))
        if correction:
            headwords, correction_note = correction
            correction_counts[f"{current_section}\t{raw}"] += 1
            variants = [
                (headword, [correction_note])
                for headword in headwords
            ]
        else:
            headword, notes = generic_headword(raw)
            variants = [(headword, notes)]

        for headword, notes in variants:
            rows.append(
                {
                    "source": "IELTS Listening 1200 High-Frequency Wordlist",
                    "raw_term": raw,
                    "headword": headword,
                    "pos": section_pos(current_section),
                    "cefr": "",
                    "topic_or_section": current_section,
                    "pdf_page": str(page_number or ""),
                    "source_ref": (
                        f"{pdf_path.name}#page={page_number}"
                        if page_number
                        else pdf_path.name
                    ),
                    "definition": "",
                    "notes": "; ".join(notes),
                }
            )

    def flush_term() -> None:
        nonlocal term_buffer, term_page
        if term_buffer.strip():
            emit(term_buffer, term_page)
        term_buffer = ""
        term_page = None

    def feed_content(text: str, page_number: int) -> None:
        nonlocal term_buffer, term_page
        text = clean_inline(text)
        if not text:
            return
        if term_buffer:
            term_buffer += " "
        elif term_page is None:
            term_page = page_number
        term_buffer += text
        while "," in term_buffer:
            item, remainder = term_buffer.split(",", 1)
            emit(item, term_page)
            term_buffer = remainder.lstrip()
            term_page = page_number if term_buffer else None

    for page_number, page in enumerate(document, start=1):
        for block in page.get_text("blocks", sort=True):
            text = clean_inline(block[4])
            if not text or text.startswith("雅思听"):
                continue
            if text.endswith(":") and "," not in text:
                flush_term()
                heading = unicodedata.normalize("NFKC", text[:-1]).strip()
                current_section = re.sub(
                    r"(?<=[\u4e00-\u9fff])(?=[A-Za-z])",
                    " ",
                    heading,
                )
                continue
            feed_content(text, page_number)
    flush_term()
    page_count = len(document)
    document.close()

    expected_correction_keys = {
        f"{section}\t{raw}" for section, raw in SOURCE_CORRECTIONS
    }
    observed_correction_keys = set(correction_counts)
    if observed_correction_keys != expected_correction_keys:
        missing = sorted(expected_correction_keys - observed_correction_keys)
        unexpected = sorted(observed_correction_keys - expected_correction_keys)
        raise ValueError(
            "Source correction audit failed. "
            f"Missing={missing}; unexpected={unexpected}"
        )
    repeated_corrections = {
        key: count for key, count in correction_counts.items() if count != 1
    }
    if repeated_corrections:
        raise ValueError(
            f"Each audited source correction must occur once: {repeated_corrections}"
        )

    seen: Counter[str] = Counter()
    for row in rows:
        key = row["headword"].casefold()
        seen[key] += 1
        if seen[key] > 1:
            append_note(row, "duplicate source listing preserved")

    return rows, {
        "pages": page_count,
        "sections": dict(Counter(row["topic_or_section"] for row in rows)),
        "duplicates": {
            key: count for key, count in seen.items() if count > 1
        },
        "source_corrections": len(correction_counts),
    }


def validate(rows: list[dict[str, str]]) -> None:
    problems: list[str] = []
    for index, row in enumerate(rows, start=2):
        if tuple(row) != FIELDS:
            problems.append(f"row {index}: field order mismatch")
        if not row["raw_term"] or not row["headword"]:
            problems.append(f"row {index}: blank term")
        for field, value in row.items():
            if any(character in value for character in ("\t", "\n", "\r")):
                problems.append(
                    f"row {index}: control character in {field}"
                )
    if problems:
        raise ValueError("\n".join(problems[:20]))


def write_tsv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=FIELDS,
            delimiter="\t",
            lineterminator="\n",
            extrasaction="raise",
        )
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows, metadata = extract(args.pdf.resolve())
    validate(rows)
    write_tsv(args.output.resolve(), rows)
    print(f"rows={len(rows)}")
    print(f"pages={metadata['pages']}")
    print(f"sections={metadata['sections']}")
    print(f"duplicates={metadata['duplicates']}")
    print(f"source_corrections={metadata['source_corrections']}")
    print(f"output={args.output.resolve()}")


if __name__ == "__main__":
    main()
