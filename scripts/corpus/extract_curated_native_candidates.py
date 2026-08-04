#!/usr/bin/env python3
"""Extract review-only vocabulary from the small curated native-PDF batch.

The source PDFs stay local. The exported TSV contains only lexical forms,
sanitized source locators and corpus-policy metadata. Definitions, examples,
exercise text and page images are never copied.

This extractor is intentionally source-specific. It accepts only PDFs whose
size and SHA-256 match the public supplementary registry.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


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
    "c1-vocabulary-pack-cae",
    "oef-1bu5-vocabulary-writing-book",
    "js-vocabulary-starter-pack",
}

# OEF now has its own full-source, editorially reviewed extractor and exact
# provenance bundle.  Keep its parsing helpers here for reuse, but never mix
# its dedicated evidence TSV back into this legacy multi-source batch.
CURATED_BATCH_SOURCE_IDS = {
    "c1-vocabulary-pack-cae",
    "js-vocabulary-starter-pack",
}

C1_UNITS = (
    (5, 6, "Unit 1 | Social issues"),
    (7, 8, "Unit 2 | Employment and the economy"),
    (9, 10, "Unit 3 | Communication and technology"),
    (11, 12, "Unit 4 | People and relationships"),
    (13, 14, "Unit 5 | Our time and how we use it"),
    (15, 16, "Unit 6 | Health, fitness and our diet"),
    (17, 18, "Unit 7 | The natural environment"),
    (19, 20, "Unit 8 | The way we learn"),
)

SECTION_POS = {
    "unit_vocabulary": "",
    "word_patterns": "phrase",
    "phrasal_verbs": "phrasal verb",
    "word_formation": "",
    "fixed_phrases": "phrase",
    "idioms": "idiom",
}

PREPOSITION_SUFFIXES = {
    "about",
    "at",
    "for",
    "from",
    "in",
    "into",
    "of",
    "on",
    "to",
    "with",
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
        .replace("´", "'")
        .replace("–", "–")
        .replace("—", "–")
    )
    return re.sub(r"\s+", " ", text).strip()


def clean_candidate(value: str) -> str:
    text = clean_text(value)
    text = re.sub(r"^[\s•·▪◦*]+", "", text)
    text = text.strip(" \t\r\n,;:.!?\"'“”‘’")
    text = re.sub(r"\s+\((?:v|n|adj|adv)(?:\s*,\s*(?:v|n|adj|adv))*\)$", "", text, flags=re.I)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


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


def identify_source(path: Path, registry: dict[str, RegistrySource]) -> RegistrySource:
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


def split_definition(line: str) -> tuple[str, str] | None:
    match = re.match(r"^(.*?)\s+(?:–|—|-)\s+(.*)$", clean_text(line))
    if not match:
        return None
    return match.group(1).strip(), match.group(2).strip()


def expand_slash_alternatives(value: str) -> list[str]:
    text = clean_candidate(value)
    if "/" not in text:
        return [text] if text else []
    parts = [clean_candidate(part) for part in re.split(r"\s*/\s*", text)]
    parts = [part for part in parts if part]
    if len(parts) < 2:
        return parts

    # Preserve a shared parenthetical complement, e.g.
    # "pass/fail/take/do (an exam)".
    suffix_match = re.search(r"\s+(\([^()]+\))$", parts[-1])
    if suffix_match:
        suffix = suffix_match.group(1)
        parts[-1] = parts[-1][: suffix_match.start()].strip()
        parts = [
            part if part.endswith(suffix) else f"{part} {suffix}"
            for part in parts
        ]

    if len(parts) == 2:
        first_tokens = parts[0].split()
        second_tokens = parts[1].split()
        if (
            len(first_tokens) >= 2
            and len(second_tokens) == 1
            and first_tokens[0].casefold()
            in {"be", "come", "get", "give", "go", "have", "make", "take"}
        ):
            prefix = " ".join(first_tokens[:-1])
            parts[1] = f"{prefix} {parts[1]}"
        if (
            second_tokens
            and second_tokens[-1].casefold() in PREPOSITION_SUFFIXES
            and (
                not first_tokens
                or first_tokens[-1].casefold() not in PREPOSITION_SUFFIXES
            )
        ):
            parts[0] = f"{parts[0]} {second_tokens[-1]}"
        if (
            first_tokens
            and first_tokens[0].casefold() == "be"
            and second_tokens
            and second_tokens[0].casefold() != "be"
        ):
            parts[1] = f"Be {parts[1]}"

    if (
        len(parts) > 2
        and len(parts[0].split()) >= 2
        and all(
            len(part.split()) == 1
            and part.casefold() in PREPOSITION_SUFFIXES
            for part in parts[1:]
        )
    ):
        prefix = " ".join(parts[0].split()[:-1])
        parts = [parts[0], *[f"{prefix} {part}" for part in parts[1:]]]

    return [clean_candidate(part) for part in parts if clean_candidate(part)]


def split_comma_groups(value: str) -> list[str]:
    text = clean_candidate(value)
    if "," not in text:
        return [text] if text else []
    depth = 0
    current: list[str] = []
    groups: list[str] = []
    for character in text:
        if character == "(":
            depth += 1
        elif character == ")" and depth:
            depth -= 1
        if character == "," and depth == 0:
            group = clean_candidate("".join(current))
            if group:
                groups.append(group)
            current = []
            continue
        current.append(character)
    final = clean_candidate("".join(current))
    if final:
        groups.append(final)
    return groups


def valid_candidate(value: str) -> bool:
    text = clean_candidate(value)
    if not text or len(text) > 100:
        return False
    if any(marker in text for marker in (" + ", "=", "→")):
        return False
    if re.search(r"\b(?:bare )?infinitive\b", text, re.I):
        return False
    return re.fullmatch(r"[A-Za-z][A-Za-z0-9'(). -]*", text) is not None


def parse_section_cell(text: str, section: str) -> list[tuple[str, str]]:
    lines = [clean_text(line) for line in str(text or "").splitlines()]
    lines = [line for line in lines if line]
    results: list[tuple[str, str]] = []

    if section in {"unit_vocabulary", "fixed_phrases"}:
        for line in lines:
            for candidate in expand_slash_alternatives(line):
                if valid_candidate(candidate):
                    results.append((candidate, line))
        return results

    if section == "word_patterns":
        for line in lines:
            for comma_group in split_comma_groups(line):
                for candidate in expand_slash_alternatives(comma_group):
                    if valid_candidate(candidate):
                        results.append((candidate, line))
        return results

    if section in {"phrasal_verbs", "idioms"}:
        for line in lines:
            split = split_definition(line)
            if split is None:
                continue
            candidate = clean_candidate(split[0])
            if valid_candidate(candidate):
                results.append((candidate, split[0]))
        return results

    if section == "word_formation":
        records: list[str] = []
        for line in lines:
            if split_definition(line):
                records.append(line)
            elif records:
                records[-1] = f"{records[-1]}, {line}"
        for record in records:
            split = split_definition(record)
            if split is None:
                continue
            base, family = split
            forms = [clean_candidate(base)]
            forms.extend(split_comma_groups(family))
            for candidate in forms:
                candidate = clean_candidate(candidate)
                if valid_candidate(candidate):
                    results.append((candidate, record))
        return results

    raise ValueError(f"Unknown section: {section}")


def make_row(
    source: RegistrySource,
    *,
    headword: str,
    raw_term: str,
    topic: str,
    page_number: int,
    section: str,
    pos: str | None = None,
    note: str = "",
) -> dict[str, str]:
    locator = f"pdf:page={page_number},section={section.replace('_', '-')}"
    return {
        "source": source.display_name,
        "registry_source_id": source.id,
        "raw_term": clean_text(raw_term),
        "headword": clean_candidate(headword),
        "pos": SECTION_POS.get(section, "") if pos is None else pos,
        "cefr": "",
        "topic_or_section": topic,
        "pdf_page": str(page_number),
        "source_ref": f"registry:{source.id}",
        "definition": "",
        "notes": note
        or "Candidate-only lexical evidence; teacher review required before promotion.",
        "source_role": source.source_role,
        "corpus_policy": source.corpus_policy,
        "source_format": source.source_format,
        "locator": locator,
    }


def require_single_table(page: Any, page_number: int) -> list[list[str | None]]:
    tables = page.extract_tables()
    if len(tables) != 1:
        raise ValueError(
            f"C1 source page {page_number}: expected one vocabulary table, "
            f"found {len(tables)}"
        )
    return tables[0]


def extract_c1(pdf: Any, source: RegistrySource) -> list[dict[str, str]]:
    if len(pdf.pages) != 20:
        raise ValueError(f"C1 source: expected 20 pages, found {len(pdf.pages)}")
    rows: list[dict[str, str]] = []
    for first_page, second_page, topic in C1_UNITS:
        first_table = require_single_table(pdf.pages[first_page - 1], first_page)
        second_table = require_single_table(pdf.pages[second_page - 1], second_page)
        if len(first_table) != 4 or len(first_table[0]) != 2:
            raise ValueError(f"C1 source page {first_page}: unexpected table shape")
        if [clean_text(cell) for cell in first_table[0]] != [
            "Unit Vocabulary",
            "Word Patterns",
        ]:
            raise ValueError(f"C1 source page {first_page}: missing top headers")
        if [clean_text(cell) for cell in first_table[2]] != [
            "Phrasal verbs",
            "Word formation",
        ]:
            raise ValueError(f"C1 source page {first_page}: missing lower headers")
        if len(second_table) != 3 or len(second_table[0]) != 2:
            raise ValueError(f"C1 source page {second_page}: unexpected table shape")
        if [clean_text(cell) for cell in second_table[1]] != [
            "Fixed phrases",
            "Idioms",
        ]:
            raise ValueError(f"C1 source page {second_page}: missing continuation headers")

        cells = (
            (first_page, "unit_vocabulary", first_table[1][0]),
            (first_page, "word_patterns", first_table[1][1]),
            (first_page, "phrasal_verbs", first_table[3][0]),
            (first_page, "word_formation", first_table[3][1]),
            (second_page, "phrasal_verbs", second_table[0][0]),
            (second_page, "word_formation", second_table[0][1]),
            (second_page, "fixed_phrases", second_table[2][0]),
            (second_page, "idioms", second_table[2][1]),
        )
        for page_number, section, text in cells:
            for headword, raw_term in parse_section_cell(text or "", section):
                rows.append(
                    make_row(
                        source,
                        headword=headword,
                        raw_term=raw_term,
                        topic=topic,
                        page_number=page_number,
                        section=section,
                    )
                )
    return deduplicate_rows(rows)


def word_is_bold_target(word: dict[str, Any]) -> bool:
    return (
        clean_text(word.get("fontname")).endswith("+F3")
        and round(float(word.get("size") or 0), 1) == 9.0
    )


def group_caption_targets(
    words: Iterable[dict[str, Any]],
    *,
    page_width: float,
    row_thresholds: tuple[float, float, float],
) -> list[str]:
    groups: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for word in words:
        if not word_is_bold_target(word) or float(word["top"]) < 100:
            continue
        x0 = float(word["x0"])
        if x0 < page_width / 3:
            column = 0
        elif x0 < page_width * 0.64:
            column = 1
        else:
            column = 2
        top = float(word["top"])
        row = sum(top >= threshold for threshold in row_thresholds)
        groups[(row, column)].append(word)

    targets: list[str] = []
    for key in sorted(groups):
        ordered = sorted(groups[key], key=lambda item: (float(item["top"]), float(item["x0"])))
        phrase = clean_candidate(" ".join(clean_text(item["text"]) for item in ordered))
        if phrase:
            targets.append(phrase)
    return targets


def group_suffix_targets(words: Iterable[dict[str, Any]]) -> list[str]:
    lines: dict[tuple[float, int], list[dict[str, Any]]] = defaultdict(list)
    for word in words:
        top = float(word["top"])
        x0 = float(word["x0"])
        if not (80 <= x0 <= 150 or 280 <= x0 <= 330):
            continue
        column = 0 if x0 < 200 else 1
        if column == 0 and not (150 <= top <= 250):
            continue
        if column == 1 and not (150 <= top <= 205):
            continue
        lines[(round(top, 1), column)].append(word)
    targets = []
    for top in sorted(lines):
        ordered = sorted(lines[top], key=lambda item: float(item["x0"]))
        target = clean_candidate("".join(clean_text(item["text"]) for item in ordered))
        if valid_candidate(target):
            targets.append(target)
    return targets


def group_numbered_bold_targets(words: list[dict[str, Any]]) -> list[str]:
    number_tops = sorted(
        float(word["top"])
        for word in words
        if str(word.get("text", "")).isdigit()
        and 1 <= int(word["text"]) <= 10
        and float(word["x0"]) < 50
        and 60 <= float(word["top"]) <= 300
    )
    if len(number_tops) != 10:
        raise ValueError(
            f"OEF useful-expressions page: expected 10 numbered items, found {len(number_tops)}"
        )
    targets: list[str] = []
    for index, top in enumerate(number_tops):
        next_top = number_tops[index + 1] if index + 1 < len(number_tops) else 310
        selected = [
            word
            for word in words
            if word_is_bold_target(word)
            and top <= float(word["top"]) < next_top
        ]
        ordered = sorted(selected, key=lambda item: (float(item["top"]), float(item["x0"])))
        phrase = clean_candidate(" ".join(clean_text(item["text"]) for item in ordered))
        if not phrase:
            raise ValueError(f"OEF useful-expressions item {index + 1}: no bold target")
        targets.append(phrase)
    return targets


def extract_oef(pdf: Any, source: RegistrySource) -> list[dict[str, str]]:
    if len(pdf.pages) != 8:
        raise ValueError(f"OEF source: expected 8 pages, found {len(pdf.pages)}")
    rows: list[dict[str, str]] = []

    caption_configs = (
        (1, (250.0, 380.0, 480.0), "Describing festivals"),
        (2, (220.0, 350.0, 470.0), "Festivities"),
    )
    for page_number, thresholds, topic in caption_configs:
        page = pdf.pages[page_number - 1]
        words = page.extract_words(extra_attrs=["fontname", "size"])
        targets = group_caption_targets(
            words,
            page_width=float(page.width),
            row_thresholds=thresholds,
        )
        if len(targets) != 12:
            raise ValueError(
                f"OEF source page {page_number}: expected 12 bold targets, "
                f"found {len(targets)}"
            )
        for target in targets:
            rows.append(
                make_row(
                    source,
                    headword=target,
                    raw_term=target,
                    topic=topic,
                    page_number=page_number,
                    section="caption_target",
                    pos="",
                    note=(
                        "Printed target form preserved; lemma and phrase-boundary "
                        "review required before promotion."
                    ),
                )
            )

    suffix_page_number = 5
    suffix_words = pdf.pages[suffix_page_number - 1].extract_words(
        extra_attrs=["fontname", "size"]
    )
    suffix_targets = group_suffix_targets(suffix_words)
    if len(suffix_targets) != 12:
        raise ValueError(
            f"OEF source page {suffix_page_number}: expected 12 suffix targets, "
            f"found {len(suffix_targets)}"
        )
    for target in suffix_targets:
        rows.append(
            make_row(
                source,
                headword=target,
                raw_term=target,
                topic="Word endings -al and -le",
                page_number=suffix_page_number,
                section="word_formation",
                pos="",
            )
        )

    expression_page_number = 7
    expression_words = pdf.pages[expression_page_number - 1].extract_words(
        extra_attrs=["fontname", "size"]
    )
    expressions = group_numbered_bold_targets(expression_words)
    for target in expressions:
        rows.append(
            make_row(
                source,
                headword=target,
                raw_term=target,
                topic="Useful festival expressions",
                page_number=expression_page_number,
                section="fixed_phrases",
                pos="phrase" if " " in target else "",
            )
        )
    return deduplicate_rows(rows)


def extract_js_overview(pdf: Any, source: RegistrySource) -> list[dict[str, str]]:
    if len(pdf.pages) != 1:
        raise ValueError(f"JS overview: expected 1 page, found {len(pdf.pages)}")
    # This source contains only a contents overview. Topic headings are useful
    # for curriculum planning but are not lexical target evidence.
    return []


def deduplicate_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    deduplicated: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for row in rows:
        key = (
            row["registry_source_id"],
            clean_candidate(row["headword"]).casefold(),
        )
        if key in seen:
            continue
        seen.add(key)
        deduplicated.append(row)
    return deduplicated


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

    with pdfplumber.open(path) as pdf:
        if source.id == "c1-vocabulary-pack-cae":
            rows = extract_c1(pdf, source)
            sampled_pages = [5, 6, 19, 20]
            parsed_pages = list(range(5, 21))
            method = "pdfplumber_table_cells"
            status = "candidate_extracted_needs_editorial_review"
        elif source.id == "oef-1bu5-vocabulary-writing-book":
            rows = extract_oef(pdf, source)
            sampled_pages = [1, 2, 5, 7]
            parsed_pages = [1, 2, 5, 7]
            method = "pdfplumber_font_and_position"
            status = "candidate_extracted_needs_editorial_review"
        elif source.id == "js-vocabulary-starter-pack":
            rows = extract_js_overview(pdf, source)
            sampled_pages = [1]
            parsed_pages = [1]
            method = "visual_and_text_contents_review"
            status = "content_reviewed_no_lexical_targets"
        else:
            raise AssertionError(source.id)
        audit = {
            "id": source.id,
            "status": status,
            "extracted_row_count": len(rows),
            "extraction_method": method,
            "pages_parsed": parsed_pages,
            "visual_sample_pages": sampled_pages,
            "rights_boundary": "lexical_forms_only_no_book_body_content",
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
        "scope": "curated_native_pdf_batch",
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
        if source.id not in CURATED_BATCH_SOURCE_IDS:
            raise ValueError(
                f"{source.id} has a dedicated extractor and must not be "
                "written to curated-native-candidates.tsv"
            )
        if source.id in seen_sources:
            raise ValueError(f"Duplicate source input: {source.id}")
        seen_sources.add(source.id)
        rows.extend(extracted)
        audits.append(audit)
    if seen_sources != CURATED_BATCH_SOURCE_IDS:
        missing = CURATED_BATCH_SOURCE_IDS - seen_sources
        raise ValueError(f"Missing supported source inputs: {sorted(missing)}")

    write_tsv(args.output, deduplicate_rows(rows))
    write_audit(args.audit_output, audits)
    print(
        f"Wrote {len(rows)} candidate rows from {len(audits)} audited sources "
        f"to {args.output}"
    )


if __name__ == "__main__":
    main()
