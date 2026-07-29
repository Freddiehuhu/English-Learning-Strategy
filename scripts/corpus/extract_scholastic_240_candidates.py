#!/usr/bin/env python3
"""Extract candidate-only targets from three Scholastic 240 word lists.

Only the explicit alphabetical word-list entries and their printed lesson-page
locators are retained. The source PDFs stay local; definitions, examples,
exercise body text, answers and page images are never exported.

The three PDFs contain a small number of broken text-layer glyphs and
multi-line index entries. Every repair below is exact, source-specific and
visually verified against the rendered word-list or lesson target box. The
extractor refuses any file whose size or SHA-256 differs from the public
supplementary registry.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


OUTPUT_COLUMNS = (
    "source",
    "registry_source_id",
    "raw_term",
    "headword",
    "pos",
    "cefr",
    "topic_or_section",
    "pdf_page",
    "source_ref",
    "definition",
    "notes",
    "source_role",
    "corpus_policy",
    "source_format",
    "locator",
)

SUPPORTED_SOURCE_IDS = {
    "scholastic-240-vocabulary-grade-1",
    "scholastic-240-vocabulary-grade-3",
    "scholastic-240-vocabulary-grade-4",
}

WORD_LIST_PDF_PAGE = {
    "scholastic-240-vocabulary-grade-1": 80,
    "scholastic-240-vocabulary-grade-3": 80,
    "scholastic-240-vocabulary-grade-4": 79,
}

VISUAL_SAMPLE_PAGES = {
    "scholastic-240-vocabulary-grade-1": [80],
    "scholastic-240-vocabulary-grade-3": [80],
    "scholastic-240-vocabulary-grade-4": [7, 31, 61, 76, 79],
}

EXPECTED_PRINTED_PAGES = tuple(range(6, 76, 3))

ENTRY_PATTERN = re.compile(
    r"([A-Za-z][A-Za-z' -]*?),\s*p\.\s*([0-9A-Za-z]+)",
    flags=re.IGNORECASE,
)

# Broken glyphs from the PDF text layer. Keys are (raw term, raw page token).
EXACT_FIXES: dict[str, dict[tuple[str, str], tuple[str, int]]] = {
    "scholastic-240-vocabulary-grade-1": {
        ("inger", "66"): ("finger", 66),
        ("ive", "6"): ("five", 6),
        ("lashlight", "39"): ("flashlight", 39),
        ("lour", "45"): ("flour", 45),
        ("lower", "75"): ("flower", 75),
        ("luffy", "27"): ("fluffy", 27),
        ("ly", "30"): ("fly", 30),
    },
    "scholastic-240-vocabulary-grade-3": {
        ("Word List cub", "51"): ("cub", 51),
    },
    "scholastic-240-vocabulary-grade-4": {
        ("Word List corps", "48"): ("corps", 48),
        ("trmsplant", "72"): ("transplant", 72),
        ("trmsport", "51"): ("transport", 51),
        ("quicksand", "1B"): ("quicksand", 18),
        ("phy", "9"): ("trophy", 9),
        ("rl", "39"): ("twirl", 39),
        ("in", "21"): ("vain", 21),
        ("ndalism", "60"): ("vandalism", 60),
        ("nish", "12"): ("vanish", 12),
        ("st", "9"): ("vast", 9),
        ("neighborhood scoop", "63"): ("scoop", 63),
        ("dow", "63"): ("widow", 63),
        ("I semicircle", "69"): ("semicircle", 69),
        ("slwscraper", "57"): ("skyscraper", 57),
        ("igh", "30"): ("sleigh", 30),
        ("h", "39"): ("smash", 39),
    },
}

# Entries whose term and page reference are split across extraction lines, plus
# a repeated lesson target omitted as a duplicate from the Grade 1 index.
VERIFIED_ADDITIONS: dict[str, tuple[tuple[str, int], ...]] = {
    "scholastic-240-vocabulary-grade-1": (
        ("orange", 9),
        ("strawberry", 69),
        ("watermelon", 69),
        ("green beans", 72),
    ),
    "scholastic-240-vocabulary-grade-3": (
        ("grandchildren", 36),
        ("kindergarten", 42),
        ("arrangement", 75),
        ("contentment", 75),
    ),
    "scholastic-240-vocabulary-grade-4": (
        ("autobiography", 54),
        ("automatic", 54),
        ("gobbledygook", 66),
        ("multipurpose", 72),
        ("transcontinental", 72),
        ("neighborhood", 75),
        ("remarkable", 75),
    ),
}


@dataclass(frozen=True)
class RegistrySource:
    id: str
    display_name: str
    expected_sha256: str
    expected_byte_size: int
    source_role: str
    corpus_policy: str
    source_format: str


def clean_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = (
        text.replace("\u00a0", " ")
        .replace("’", "'")
        .replace("‘", "'")
        .replace("–", "-")
        .replace("—", "-")
    )
    return re.sub(r"\s+", " ", text).strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_registry(path: Path) -> dict[str, RegistrySource]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    sources: dict[str, RegistrySource] = {}
    for item in payload.get("sources", []):
        source_id = clean_text(item.get("id"))
        if source_id not in SUPPORTED_SOURCE_IDS:
            continue
        sources[source_id] = RegistrySource(
            id=source_id,
            display_name=clean_text(item.get("display_name")),
            expected_sha256=clean_text(item.get("expected_sha256")),
            expected_byte_size=int(item.get("expected_byte_size") or 0),
            source_role=clean_text(item.get("source_role")),
            corpus_policy=clean_text(item.get("corpus_policy")),
            source_format=clean_text(item.get("format")),
        )
    missing = SUPPORTED_SOURCE_IDS - set(sources)
    if missing:
        raise ValueError(f"Registry is missing supported sources: {sorted(missing)}")
    return sources


def identify_source(
    path: Path,
    registry: dict[str, RegistrySource],
) -> RegistrySource:
    byte_size = path.stat().st_size
    candidates = [
        source
        for source in registry.values()
        if source.expected_byte_size == byte_size
    ]
    if not candidates:
        raise ValueError(f"{path.name}: byte size does not match a supported source")
    digest = sha256_file(path)
    for source in candidates:
        if source.expected_sha256 == digest:
            return source
    raise ValueError(f"{path.name}: SHA-256 does not match a supported source")


def parse_word_list_text(
    source_id: str,
    text: str,
) -> list[tuple[str, int]]:
    if source_id not in SUPPORTED_SOURCE_IDS:
        raise ValueError(f"Unsupported source: {source_id}")
    fixes = EXACT_FIXES[source_id]
    entries: list[tuple[str, int]] = []
    applied_fixes: set[tuple[str, str]] = set()
    for match in ENTRY_PATTERN.finditer(clean_text(text)):
        raw_term = clean_text(match.group(1))
        raw_page = clean_text(match.group(2))
        key = (raw_term, raw_page)
        if key in fixes:
            term, printed_page = fixes[key]
            applied_fixes.add(key)
        else:
            if not raw_page.isdigit():
                raise ValueError(
                    f"{source_id}: unreviewed page token {raw_page!r} "
                    f"for {raw_term!r}"
                )
            term, printed_page = raw_term, int(raw_page)
        entries.append((clean_text(term), printed_page))

    missing_fixes = set(fixes) - applied_fixes
    if missing_fixes:
        raise ValueError(
            f"{source_id}: expected text-layer repairs were not encountered: "
            f"{sorted(missing_fixes)}"
        )
    entries.extend(VERIFIED_ADDITIONS[source_id])
    validate_entries(source_id, entries)
    return entries


def validate_entries(source_id: str, entries: list[tuple[str, int]]) -> None:
    if len(entries) != 240:
        raise ValueError(
            f"{source_id}: expected 240 source targets, found {len(entries)}"
        )
    page_counts = Counter(page for _, page in entries)
    expected_counts = {page: 10 for page in EXPECTED_PRINTED_PAGES}
    if dict(sorted(page_counts.items())) != expected_counts:
        raise ValueError(
            f"{source_id}: expected 10 targets on each printed lesson page; "
            f"found {dict(sorted(page_counts.items()))}"
        )
    invalid = [
        term
        for term, _ in entries
        if not re.fullmatch(r"[A-Za-z][A-Za-z' -]*", term)
    ]
    if invalid:
        raise ValueError(f"{source_id}: invalid target forms: {invalid}")


def make_row(
    source: RegistrySource,
    term: str,
    printed_page: int,
    word_list_page: int,
) -> dict[str, str]:
    lesson = ((printed_page - 6) // 3) + 1
    return {
        "source": source.display_name,
        "registry_source_id": source.id,
        "raw_term": term,
        "headword": term,
        "pos": "",
        "cefr": "",
        "topic_or_section": (
            f"Lesson {lesson:02d} | printed page {printed_page}"
        ),
        "pdf_page": str(word_list_page),
        "source_ref": f"registry:{source.id}",
        "definition": "",
        "notes": (
            "Candidate-only explicit source target; spelling, sense, proper-name "
            "and IELTS relevance review required before promotion."
        ),
        "source_role": source.source_role,
        "corpus_policy": source.corpus_policy,
        "source_format": source.source_format,
        "locator": (
            f"pdf:page={word_list_page},section=word-list,"
            f"target-printed-page={printed_page}"
        ),
    }


def extract_path(
    path: Path,
    registry: dict[str, RegistrySource],
) -> tuple[RegistrySource, list[dict[str, str]], dict[str, Any]]:
    source = identify_source(path, registry)
    try:
        import pdfplumber  # type: ignore
    except ImportError as error:
        raise RuntimeError(
            "pdfplumber is required; use the bundled workspace Python runtime"
        ) from error

    word_list_page = WORD_LIST_PDF_PAGE[source.id]
    with pdfplumber.open(path) as pdf:
        if word_list_page > len(pdf.pages):
            raise ValueError(
                f"{source.id}: word-list page {word_list_page} exceeds "
                f"{len(pdf.pages)} pages"
            )
        text = pdf.pages[word_list_page - 1].extract_text() or ""
        entries = parse_word_list_text(source.id, text)
    rows = [
        make_row(source, term, printed_page, word_list_page)
        for term, printed_page in entries
    ]
    audit = {
        "id": source.id,
        "status": "candidate_extracted_needs_editorial_review",
        "extracted_row_count": len(rows),
        "extraction_method": (
            "sha256_gated_explicit_word_list_with_visual_exact_repairs"
        ),
        "pages_parsed": [word_list_page],
        "visual_sample_pages": VISUAL_SAMPLE_PAGES[source.id],
        "editorial_review_complete": False,
        "rights_boundary": (
            "Explicit lexical targets and sanitized lesson locators only; "
            "definitions, examples, exercises, answers and images excluded."
        ),
    }
    return source, rows, audit


def write_tsv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=OUTPUT_COLUMNS,
            delimiter="\t",
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)


def write_audit(path: Path, audits: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 1,
        "scope": (
            "Explicit Scholastic 240 word-list targets; all rows remain "
            "candidate-only pending editorial review."
        ),
        "sources": sorted(audits, key=lambda item: item["id"]),
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_files", nargs="+", type=Path)
    parser.add_argument(
        "--registry",
        type=Path,
        default=Path("data/ielts-corpus/supplemental-source-registry.json"),
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--audit-output", required=True, type=Path)
    args = parser.parse_args()

    registry = load_registry(args.registry)
    rows: list[dict[str, str]] = []
    audits: list[dict[str, Any]] = []
    seen_sources: set[str] = set()
    for path in args.pdf_files:
        source, extracted, audit = extract_path(path, registry)
        if source.id in seen_sources:
            raise ValueError(f"Duplicate source input: {source.id}")
        seen_sources.add(source.id)
        rows.extend(extracted)
        audits.append(audit)
    if seen_sources != SUPPORTED_SOURCE_IDS:
        missing = SUPPORTED_SOURCE_IDS - seen_sources
        raise ValueError(f"Missing supported source inputs: {sorted(missing)}")

    write_tsv(args.output, rows)
    write_audit(args.audit_output, audits)
    print(
        f"Wrote {len(rows)} candidate-only rows from {len(audits)} "
        f"Scholastic 240 sources to {args.output}"
    )


if __name__ == "__main__":
    main()
