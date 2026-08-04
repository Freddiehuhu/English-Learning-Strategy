#!/usr/bin/env python3
"""Build the fully reviewed OEF 1B Unit 5 candidate evidence bundle.

The eight-page source is hash-gated and every page has been visually reviewed.
Only the explicitly printed bold lexical targets are exported.  Definitions,
examples, exercises, answer text and page images stay out of the repository.

This remains a ``candidate_only`` source: completing source/editorial review
does not promote any item into the public IELTS target corpus.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import tempfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from scripts.corpus import extract_curated_native_candidates as base
except ModuleNotFoundError:  # Direct ``python scripts/corpus/...`` execution.
    import extract_curated_native_candidates as base  # type: ignore


SOURCE_ID = "oef-1bu5-vocabulary-writing-book"
EXPECTED_SOURCE_SHA256 = (
    "d2a23c2ad9e1b203879a3f1ee667cd233eddcd7d74c1b94c237025f7ca0557d6"
)
EXPECTED_SOURCE_BYTE_SIZE = 1_278_408
EXPECTED_SOURCE_PAGE_COUNT = 8
EXPECTED_PAGE_TARGET_COUNTS = {
    "1": 12,
    "2": 12,
    "3": 0,
    "4": 0,
    "5": 12,
    "6": 0,
    "7": 10,
    "8": 0,
}
ZERO_TARGET_PAGES = (3, 4, 6, 8)
ROW_NOTE = (
    "Editorially reviewed against the complete 8-page source; printed target "
    "wording preserved; source-supplied CEFR and POS are absent, so neither "
    "is inferred."
)
NORMALIZED_ROW_NOTE = (
    "Editorially reviewed against the complete 8-page source; only mechanical "
    "case or quotation-mark normalization applied to the headword; "
    "source-supplied CEFR and POS are absent, so neither is inferred."
)
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")


@dataclass(frozen=True)
class TargetSpec:
    page: int
    section: str
    topic: str
    extracted_form: str
    raw_term: str
    headword: str
    pos: str


def targets(
    page: int,
    section: str,
    topic: str,
    values: tuple[tuple[str, str], ...],
) -> tuple[TargetSpec, ...]:
    return tuple(
        TargetSpec(
            page=page,
            section=section,
            topic=topic,
            extracted_form=raw_term,
            raw_term=raw_term,
            headword=headword,
            pos="",
        )
        for raw_term, headword in values
    )


EXPECTED_OCCURRENCES = (
    *targets(
        1,
        "caption_target",
        "Describing festivals",
        (
            ("annual", "annual"),
            ("atmosphere", "atmosphere"),
            ("carnival", "carnival"),
            ("commemorate", "commemorate"),
            ("cultural", "cultural"),
            ("decorations", "decorations"),
            ("in honour of", "in honour of"),
            ("international", "international"),
            ("major", "major"),
            ("occasion", "occasion"),
            ("originate", "originate"),
            ("Religious", "religious"),
        ),
    ),
    *targets(
        2,
        "caption_target",
        "Festivities",
        (
            ("attend a parade", "attend a parade"),
            ("display lanterns", "display lanterns"),
            ("exchange pleasantries", "exchange pleasantries"),
            ("feast on delicacies", "feast on delicacies"),
            ("gather with family", "gather with family"),
            ("go 'trick or treating'", "go trick or treating"),
            ("offer gifts", "offer gifts"),
            ("paint eggs", "paint eggs"),
            ("sings carols", "sings carols"),
            ("sweep family graves", "sweep family graves"),
            (
                "watched a fireworks display",
                "watched a fireworks display",
            ),
            ("wear traditional clothing", "wear traditional clothing"),
        ),
    ),
    *targets(
        5,
        "word_formation",
        "Word endings -al and -le",
        (
            ("capital", "capital"),
            ("bottle", "bottle"),
            ("cultural", "cultural"),
            ("candle", "candle"),
            ("musical", "musical"),
            ("purple", "purple"),
            ("natural", "natural"),
            ("temple", "temple"),
            ("ritual", "ritual"),
            ("seasonal", "seasonal"),
            ("special", "special"),
            ("traditional", "traditional"),
        ),
    ),
    *targets(
        7,
        "fixed_phrases",
        "Useful festival expressions",
        (
            ("flock to", "flock to"),
            ("famous for", "famous for"),
            ("to try our hand at", "to try our hand at"),
            (
                "an enlightening experience",
                "an enlightening experience",
            ),
            ("symbolize", "symbolize"),
            ("must-see", "must-see"),
            ("get a taste of", "get a taste of"),
            ("legendary", "legendary"),
            ("the time of their lives", "the time of their lives"),
            ("feasting together", "feasting together"),
        ),
    ),
)


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sequence_sha256(values: list[dict[str, object]]) -> str:
    raw = json.dumps(
        values,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return sha256_bytes(raw)


def extract_observed_occurrences(pdf: Any) -> list[tuple[int, str]]:
    if len(pdf.pages) != EXPECTED_SOURCE_PAGE_COUNT:
        raise ValueError(
            f"OEF source: expected {EXPECTED_SOURCE_PAGE_COUNT} pages, "
            f"found {len(pdf.pages)}"
        )

    observed: list[tuple[int, str]] = []
    caption_configs = (
        (1, (250.0, 380.0, 480.0)),
        (2, (220.0, 350.0, 470.0)),
    )
    for page_number, thresholds in caption_configs:
        page = pdf.pages[page_number - 1]
        found = base.group_caption_targets(
            page.extract_words(extra_attrs=["fontname", "size"]),
            page_width=float(page.width),
            row_thresholds=thresholds,
        )
        if len(found) != 12:
            raise ValueError(
                f"OEF source page {page_number}: expected 12 bold targets, "
                f"found {len(found)}"
            )
        observed.extend((page_number, value) for value in found)

    suffix_words = pdf.pages[4].extract_words(extra_attrs=["fontname", "size"])
    suffixes = base.group_suffix_targets(suffix_words)
    if len(suffixes) != 12:
        raise ValueError(
            f"OEF source page 5: expected 12 suffix targets, found {len(suffixes)}"
        )
    observed.extend((5, value) for value in suffixes)

    expression_words = pdf.pages[6].extract_words(
        extra_attrs=["fontname", "size"]
    )
    expressions = base.group_numbered_bold_targets(expression_words)
    if len(expressions) != 10:
        raise ValueError(
            f"OEF source page 7: expected 10 expressions, found {len(expressions)}"
        )
    observed.extend((7, value) for value in expressions)
    return observed


def validate_observed_occurrences(observed: list[tuple[int, str]]) -> None:
    # The legacy cleaner strips the final quotation mark from this one target.
    # Repair only that source-confirmed punctuation loss before exact matching.
    repaired = [
        (
            page,
            "go 'trick or treating'"
            if value == "go 'trick or treating"
            else value,
        )
        for page, value in observed
    ]
    expected = [
        (target.page, target.extracted_form) for target in EXPECTED_OCCURRENCES
    ]
    if repaired != expected:
        for index, (actual, wanted) in enumerate(zip(repaired, expected), start=1):
            if actual != wanted:
                raise ValueError(
                    f"OEF target sequence changed at occurrence {index}: "
                    f"found {actual!r}, expected {wanted!r}"
                )
        raise ValueError(
            f"OEF target occurrence count changed: found {len(repaired)}, "
            f"expected {len(expected)}"
        )


def build_candidate_rows(source: base.RegistrySource) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for target in EXPECTED_OCCURRENCES:
        key = base.clean_candidate(target.headword).casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized = target.raw_term != target.headword
        rows.append(
            base.make_row(
                source,
                headword=target.headword,
                raw_term=target.raw_term,
                topic=target.topic,
                page_number=target.page,
                section=target.section,
                pos=target.pos,
                note=NORMALIZED_ROW_NOTE if normalized else ROW_NOTE,
            )
        )
    if len(rows) != 45:
        raise ValueError(f"OEF candidate row count changed: found {len(rows)}")
    if len({row["headword"].casefold() for row in rows}) != len(rows):
        raise ValueError("OEF candidate headwords are not deduplicated")
    return rows


def serialize_tsv(rows: list[dict[str, str]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(
        output,
        fieldnames=base.OUTPUT_COLUMNS,
        delimiter="\t",
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


def render_manifest_sha256(path: Path) -> str:
    raw = path.read_bytes()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("OEF render evidence is invalid JSON") from error
    if not isinstance(payload, dict):
        raise ValueError("OEF render evidence must be an object")
    expected_profile = {
        "schema_version": 1,
        "source_id": SOURCE_ID,
        "source_format": "pdf",
        "source_sha256": EXPECTED_SOURCE_SHA256,
        "source_page_count": EXPECTED_SOURCE_PAGE_COUNT,
    }
    for field, expected in expected_profile.items():
        if payload.get(field) != expected:
            raise ValueError(f"OEF render evidence {field} profile mismatch")
    pages = payload.get("rendered_pages")
    if not isinstance(pages, list):
        raise ValueError("OEF render evidence rendered_pages must be a list")
    if [entry.get("page") for entry in pages if isinstance(entry, dict)] != list(
        range(1, EXPECTED_SOURCE_PAGE_COUNT + 1)
    ):
        raise ValueError("OEF render evidence must cover pages 1-8 exactly")
    for entry in pages:
        if (
            not isinstance(entry, dict)
            or not SHA256_PATTERN.fullmatch(str(entry.get("sha256") or ""))
            or any(
                not isinstance(entry.get(field), int)
                or isinstance(entry.get(field), bool)
                or int(entry[field]) < 1
                for field in ("byte_size", "width_px", "height_px")
            )
        ):
            raise ValueError("OEF render evidence page metadata is invalid")
    return sha256_bytes(raw)


def build_audit(
    *,
    rows: list[dict[str, str]],
    candidate_tsv: bytes,
    render_digest: str,
) -> dict[str, object]:
    page_row_counts = Counter(row["pdf_page"] for row in rows)
    occurrence_sequence = [
        {
            "page": target.page,
            "raw_term": target.raw_term,
            "headword": target.headword,
            "pos": target.pos,
        }
        for target in EXPECTED_OCCURRENCES
    ]
    candidate_sequence = [
        {
            "page": int(row["pdf_page"]),
            "raw_term": row["raw_term"],
            "headword": row["headword"],
            "pos": row["pos"],
        }
        for row in rows
    ]
    return {
        "schema_version": 1,
        "scope": "oef_1bu5_full_source_editorial_batch",
        "sources": [
            {
                "id": SOURCE_ID,
                "status": "complete",
                "provenance_schema_version": 1,
                "source_sha256": EXPECTED_SOURCE_SHA256,
                "source_byte_size": EXPECTED_SOURCE_BYTE_SIZE,
                "source_page_count": EXPECTED_SOURCE_PAGE_COUNT,
                "candidate_tsv_sha256": sha256_bytes(candidate_tsv),
                "candidate_tsv_byte_size": len(candidate_tsv),
                "candidate_tsv_row_count": len(rows),
                "candidate_tsv_source_counts": {SOURCE_ID: len(rows)},
                "render_manifest_sha256": render_digest,
                "extracted_row_count": len(rows),
                "target_occurrence_count": len(EXPECTED_OCCURRENCES),
                "normalized_headword_count": sum(
                    row["raw_term"] != row["headword"] for row in rows
                ),
                "ordered_occurrence_sha256": sequence_sha256(
                    occurrence_sequence
                ),
                "ordered_candidate_sha256": sequence_sha256(
                    candidate_sequence
                ),
                "page_target_occurrence_counts": EXPECTED_PAGE_TARGET_COUNTS,
                "page_row_counts": dict(sorted(page_row_counts.items())),
                "duplicate_target_occurrences": [
                    {"headword": "cultural", "pages": [1, 5]}
                ],
                "zero_target_pages": list(ZERO_TARGET_PAGES),
                "extraction_method": (
                    "pdfplumber_font_and_position_plus_full_page_visual_"
                    "editorial_review"
                ),
                "pages_parsed": list(
                    range(1, EXPECTED_SOURCE_PAGE_COUNT + 1)
                ),
                "visual_sample_pages": list(
                    range(1, EXPECTED_SOURCE_PAGE_COUNT + 1)
                ),
                "editorial_review_complete": True,
                "cefr_policy": "blank_source_does_not_supply_cefr",
                "pos_policy": "blank_source_does_not_supply_pos",
                "promotion_result": "reviewed_candidate_only_not_promoted",
                "rights_boundary": (
                    "lexical_forms_and_sanitized_locators_only_no_book_"
                    "body_content"
                ),
            }
        ],
    }


def serialize_json(payload: dict[str, object]) -> bytes:
    return (
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    ).encode("utf-8")


def stage_bytes(path: Path, raw: bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        Path(temp_name).unlink(missing_ok=True)
        raise
    return Path(temp_name)


def write_bundle(
    output: Path,
    audit_output: Path,
    candidate_tsv: bytes,
    audit_json: bytes,
) -> None:
    staged_output = stage_bytes(output, candidate_tsv)
    try:
        staged_audit = stage_bytes(audit_output, audit_json)
    except BaseException:
        staged_output.unlink(missing_ok=True)
        raise
    try:
        staged_output.replace(output)
        staged_audit.replace(audit_output)
    finally:
        staged_output.unlink(missing_ok=True)
        staged_audit.unlink(missing_ok=True)


def extract_bundle(
    source_path: Path,
    *,
    registry_path: Path,
    render_evidence_path: Path,
) -> tuple[bytes, bytes]:
    registry = base.load_registry(registry_path)
    source = base.identify_source(source_path, registry)
    if source.id != SOURCE_ID:
        raise ValueError(f"Expected {SOURCE_ID}, found {source.id}")
    if (
        source.expected_sha256 != EXPECTED_SOURCE_SHA256
        or source.expected_byte_size != EXPECTED_SOURCE_BYTE_SIZE
        or source.source_role != "lexical_candidate"
        or source.corpus_policy != "candidate_only"
        or source.source_format != "pdf"
    ):
        raise ValueError("OEF registry profile mismatch")

    try:
        import pdfplumber  # type: ignore
    except ImportError as error:
        raise RuntimeError(
            "pdfplumber is required; use the bundled workspace Python runtime"
        ) from error
    with pdfplumber.open(source_path) as pdf:
        observed = extract_observed_occurrences(pdf)
    validate_observed_occurrences(observed)

    rows = build_candidate_rows(source)
    candidate_tsv = serialize_tsv(rows)
    render_digest = render_manifest_sha256(render_evidence_path)
    audit = build_audit(
        rows=rows,
        candidate_tsv=candidate_tsv,
        render_digest=render_digest,
    )
    return candidate_tsv, serialize_json(audit)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument(
        "--registry",
        type=Path,
        default=Path("data/ielts-corpus/supplemental-source-registry.json"),
    )
    parser.add_argument("--render-evidence", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--audit-output", required=True, type=Path)
    args = parser.parse_args()

    candidate_tsv, audit_json = extract_bundle(
        args.source,
        registry_path=args.registry,
        render_evidence_path=args.render_evidence,
    )
    write_bundle(args.output, args.audit_output, candidate_tsv, audit_json)
    print(
        json.dumps(
            {
                "source_id": SOURCE_ID,
                "source_pages_reviewed": EXPECTED_SOURCE_PAGE_COUNT,
                "target_occurrences": len(EXPECTED_OCCURRENCES),
                "candidate_rows": 45,
                "editorial_review_complete": True,
                "promotion_result": "candidate_only",
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
