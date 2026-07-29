#!/usr/bin/env python3
"""Extract headword-only candidates from four Vocabulary in Use indexes.

The source PDFs are copyrighted teaching references.  This extractor therefore
reads only the books' alphabetical index pages and exports headword candidates,
unit locators and source-level CEFR bands.  Pronunciations, bracketed sense
glosses, definitions, examples, exercises and page body text are deliberately
excluded.

Files are identified by SHA-256 rather than by their local filenames.  The
fixed page ranges and layout gates make the extraction fail closed if a
different edition or an unexpectedly parsed layout is supplied.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import re
import shutil
import subprocess
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree


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

REVIEW_COLUMNS = (
    "registry_source_id",
    "pdf_pages",
    "raw_text",
    "reason",
)

SOURCE_ROLE = "lexical_candidate"
CORPUS_POLICY = "candidate_only"
SOURCE_FORMAT = "pdf"


@dataclass(frozen=True)
class SourceProfile:
    registry_source_id: str
    display_name: str
    sha256: str
    byte_size: int
    index_first_page: int
    index_last_page: int
    max_unit: int
    cefr: str
    first_page_body_top: int
    regular_page_body_top: int
    column_starts: tuple[int, int, int]
    black_colors: frozenset[str]
    min_candidates: int
    max_candidates: int
    required_headwords: tuple[str, ...]


PROFILES = (
    SourceProfile(
        registry_source_id="english-vocabulary-in-use-elementary-3e",
        display_name="English Vocabulary in Use Elementary, 3rd edition",
        sha256=(
            "fe0f73c4605a10bacc6d8440facf3ea44075128bcea1b9817c07a41540c23160"
        ),
        byte_size=109_265_438,
        index_first_page=161,
        index_last_page=171,
        max_unit=60,
        cefr="A1-A2",
        first_page_body_top=145,
        regular_page_body_top=70,
        column_starts=(51, 302, 553),
        black_colors=frozenset({"#231f20"}),
        min_candidates=900,
        max_candidates=2_000,
        required_headwords=("about", "book", "young(er)"),
    ),
    SourceProfile(
        registry_source_id=(
            "english-vocabulary-in-use-pre-intermediate-intermediate"
        ),
        display_name=(
            "English Vocabulary in Use Pre-Intermediate and Intermediate"
        ),
        sha256=(
            "3a357be041df101c84867add40756ad50e7510adf8430ca3c6f403009d0e7875"
        ),
        byte_size=27_969_061,
        index_first_page=247,
        index_last_page=262,
        max_unit=100,
        cefr="A2-B1",
        first_page_body_top=235,
        regular_page_body_top=70,
        column_starts=(166, 455, 745),
        black_colors=frozenset({"#000000"}),
        min_candidates=1_500,
        max_candidates=3_500,
        required_headwords=("a bit", "ability", "work out"),
    ),
    SourceProfile(
        registry_source_id="english-vocabulary-in-use-upper-intermediate-4e",
        display_name=(
            "English Vocabulary in Use Upper-Intermediate, 4th edition"
        ),
        sha256=(
            "248c49fba278071aff52ce6a5ce816e12c277c9e67baea5cd0f9c7ef7551c080"
        ),
        byte_size=25_902_619,
        index_first_page=259,
        index_last_page=279,
        max_unit=101,
        cefr="B2",
        first_page_body_top=235,
        regular_page_body_top=70,
        column_starts=(164, 454, 745),
        black_colors=frozenset({"#231f20"}),
        min_candidates=1_800,
        max_candidates=4_000,
        required_headwords=("3D", "accomplish", "zebra crossing"),
    ),
    SourceProfile(
        registry_source_id="english-vocabulary-in-use-advanced-3e",
        display_name="English Vocabulary in Use Advanced, 3rd edition",
        sha256=(
            "96040f9bba7afa4acfee6cefa6e80e2df7abae62ca773532186dbf969ec766f0"
        ),
        byte_size=29_208_970,
        index_first_page=279,
        index_last_page=300,
        max_unit=101,
        cefr="C1-C2",
        first_page_body_top=130,
        regular_page_body_top=70,
        column_starts=(77, 318, 559),
        black_colors=frozenset({"#231f20"}),
        min_candidates=1_800,
        max_candidates=4_500,
        required_headwords=("4x4", "abhor", "zero hours contract"),
    ),
)

PROFILES_BY_SHA = {profile.sha256: profile for profile in PROFILES}

# SourceSansPro ligatures in the Upper-intermediate PDF are exposed by Poppler
# as private-use glyphs.  Only these two observed headword glyphs are decoded.
# Any other private-use character is rejected rather than guessed.
SAFE_HEADWORD_GLYPHS = {
    "\ue01d": "ft",
    "\ue01e": "ff",
}

# One Upper-intermediate index headword is encoded in a black phonetic font.
# The rendered page was visually checked (PDF page 275) before adding this
# exact, source-specific repair.  Other black phonetic-font text is ignored.
SAFE_BLACK_PHONETIC_FRAGMENTS = {
    ("english-vocabulary-in-use-upper-intermediate-4e", "smo\ue067"): "smog",
}

POS_NAMES = {
    "n": "noun",
    "v": "verb",
    "adj": "adjective",
    "adv": "adverb",
}
POS_TOKEN = r"(?:n|v|adj|adv)\.?"
POS_FIND_RE = re.compile(
    rf"(?<![A-Za-z])(?P<pos>{POS_TOKEN})(?![A-Za-z])",
    re.IGNORECASE,
)
PAREN_POS_RE = re.compile(
    rf"\s+\((?P<pos>{POS_TOKEN}(?:\s*(?:,|and|/)\s*{POS_TOKEN})*)\)\s*$",
    re.IGNORECASE,
)
PLAIN_POS_RE = re.compile(
    rf"\s+(?P<pos>{POS_TOKEN}(?:\s*(?:,|and|/)\s*{POS_TOKEN})*)\s*$",
    re.IGNORECASE,
)
SQUARE_GLOSS_RE = re.compile(r"\[[^\]]*\]")
UNIT_TAIL_RE = re.compile(
    r"(?P<units>\d{1,3}(?:\s*,\s*\d{1,3})*)\s*$"
)


@dataclass(frozen=True)
class TextFragment:
    page: int
    column: int
    top: int
    left: int
    text: str
    font_family: str
    color: str


@dataclass
class PendingEntry:
    fragments: list[str] = field(default_factory=list)
    pages: set[int] = field(default_factory=set)

    def append(self, text: str, page: int) -> None:
        if text:
            self.fragments.append(text)
        self.pages.add(page)

    def take(self) -> tuple[str, tuple[int, ...]]:
        raw = clean_spaces(" ".join(self.fragments))
        pages = tuple(sorted(self.pages))
        self.fragments.clear()
        self.pages.clear()
        return raw, pages


@dataclass(frozen=True)
class RejectedEntry:
    registry_source_id: str
    pages: tuple[int, ...]
    raw_text: str
    reason: str


@dataclass
class Candidate:
    source: str
    registry_source_id: str
    raw_term: str
    headword: str
    cefr: str
    positions: list[str]
    pages: set[int]
    units: set[int]


@dataclass
class ExtractionResult:
    rows: list[dict[str, str]]
    rejected: list[RejectedEntry]
    raw_entry_count: int
    duplicate_entry_count: int


def clean_spaces(value: str) -> str:
    value = html.unescape(value)
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("\u200b", "").replace("\ufeff", "")
    for source, replacement in SAFE_HEADWORD_GLYPHS.items():
        value = value.replace(source, replacement)
    return re.sub(r"\s+", " ", value).strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def identify_profile(path: Path) -> SourceProfile:
    if path.stat().st_size not in {profile.byte_size for profile in PROFILES}:
        raise ValueError(f"Unregistered PDF byte size: {path}")
    digest = sha256_file(path)
    try:
        profile = PROFILES_BY_SHA[digest]
    except KeyError as error:
        raise ValueError(f"Unregistered PDF SHA-256: {path}") from error
    if path.stat().st_size != profile.byte_size:
        raise ValueError(f"Registered PDF size mismatch: {path}")
    return profile


def pdf_to_xml(path: Path, profile: SourceProfile) -> str:
    executable = shutil.which("pdftohtml")
    if executable is None:
        raise RuntimeError("pdftohtml (Poppler) is required")
    command = [
        executable,
        "-i",
        "-f",
        str(profile.index_first_page),
        "-l",
        str(profile.index_last_page),
        "-xml",
        "-stdout",
        str(path),
    ]
    completed = subprocess.run(
        command,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return completed.stdout


def inner_text(element: ElementTree.Element) -> str:
    return "".join(element.itertext())


def column_for(left: int, starts: tuple[int, int, int]) -> int:
    # A fragment can sit far to the right of its column when it is the unit
    # number after a long headword/pronunciation.  Boundaries therefore use
    # the next column's left edge, not the midpoint between column starts.
    if left < starts[1] - 4:
        return 0
    if left < starts[2] - 4:
        return 1
    return 2


def eligible_fragments(
    xml_text: str,
    profile: SourceProfile,
) -> dict[int, dict[int, list[TextFragment]]]:
    root = ElementTree.fromstring(xml_text)
    # pdftohtml declares font IDs on their first page of use, then reuses the
    # same IDs on later pages without repeating the declarations.
    fonts = {
        font.attrib["id"]: (
            font.attrib.get("family", ""),
            font.attrib.get("color", "").lower(),
        )
        for font in root.iter("fontspec")
    }
    pages: dict[int, dict[int, list[TextFragment]]] = {}
    for page_element in root.findall("page"):
        page = int(page_element.attrib["number"])
        height = int(page_element.attrib["height"])
        body_top = (
            profile.first_page_body_top
            if page == profile.index_first_page
            else profile.regular_page_body_top
        )
        page_columns = {0: [], 1: [], 2: []}
        for text_element in page_element.findall("text"):
            top = int(text_element.attrib["top"])
            if top < body_top or top >= height - 75:
                continue
            left = int(text_element.attrib["left"])
            raw_text = inner_text(text_element)
            text = clean_spaces(raw_text)
            if not text:
                continue
            family, color = fonts[text_element.attrib["font"]]
            if "phonetic" in family.casefold():
                repaired = SAFE_BLACK_PHONETIC_FRAGMENTS.get(
                    (profile.registry_source_id, clean_spaces(raw_text))
                )
                if repaired is None:
                    continue
                text = repaired
            if color not in profile.black_colors:
                continue
            column = column_for(left, profile.column_starts)
            page_columns[column].append(
                TextFragment(
                    page=page,
                    column=column,
                    top=top,
                    left=left,
                    text=text,
                    font_family=family,
                    color=color,
                )
            )
        pages[page] = page_columns
    expected_pages = set(
        range(profile.index_first_page, profile.index_last_page + 1)
    )
    if set(pages) != expected_pages:
        raise ValueError(
            f"{profile.registry_source_id}: expected index pages "
            f"{min(expected_pages)}-{max(expected_pages)}, got "
            f"{sorted(pages)}"
        )
    return pages


def cluster_lines(
    fragments: list[TextFragment],
    tolerance: int = 6,
) -> list[list[TextFragment]]:
    clusters: list[list[TextFragment]] = []
    for fragment in sorted(fragments, key=lambda item: (item.top, item.left)):
        if not clusters:
            clusters.append([fragment])
            continue
        representative_top = min(item.top for item in clusters[-1])
        if fragment.top - representative_top <= tolerance:
            clusters[-1].append(fragment)
        else:
            clusters.append([fragment])
    return [
        sorted(cluster, key=lambda item: item.left)
        for cluster in clusters
    ]


def split_position(headword: str) -> tuple[str, list[str]]:
    for pattern in (PAREN_POS_RE, PLAIN_POS_RE):
        match = pattern.search(headword)
        if match is None:
            continue
        raw_labels = [
            label.group("pos")
            for label in POS_FIND_RE.finditer(match.group("pos"))
        ]
        positions = [
            POS_NAMES[label.casefold().rstrip(".")]
            for label in raw_labels
        ]
        return clean_spaces(headword[: match.start()]), positions
    return headword, []


def clean_headword(raw: str) -> tuple[str, list[str], str | None]:
    # A few slash-alternative headwords are followed by a separate slash glyph
    # from the pronunciation font.  Remove only slash tokens separated by
    # whitespace at the very end; internal lexical slashes are preserved.
    value = re.sub(r"(?:\s+/\s*)+$", "", raw)
    value = SQUARE_GLOSS_RE.sub("", value)
    value = clean_spaces(value)
    value, positions = split_position(value)
    value = clean_spaces(value)
    if not value:
        return "", positions, "empty_after_cleaning"
    if len(value) > 120 or len(value.split()) > 16:
        return value, positions, "implausibly_long"
    if not any(character.isalpha() for character in value):
        return value, positions, "no_alphabetic_character"
    if any(0xE000 <= ord(character) <= 0xF8FF for character in value):
        return value, positions, "unmapped_private_use_glyph"
    if any(
        unicodedata.category(character).startswith("C")
        for character in value
    ):
        return value, positions, "control_character"
    if value.startswith("/") or value.endswith("/"):
        return value, positions, "stray_pronunciation_delimiter"
    return value, positions, None


def parse_raw_entries(
    pages: dict[int, dict[int, list[TextFragment]]],
    profile: SourceProfile,
) -> tuple[
    list[tuple[str, tuple[int, ...], tuple[int, ...]]],
    list[RejectedEntry],
]:
    entries: list[tuple[str, tuple[int, ...], tuple[int, ...]]] = []
    rejected: list[RejectedEntry] = []
    pending = PendingEntry()
    for page in sorted(pages):
        for column in (0, 1, 2):
            for line in cluster_lines(pages[page][column]):
                text = clean_spaces(" ".join(item.text for item in line))
                match = UNIT_TAIL_RE.search(text)
                units: tuple[int, ...] = ()
                if match is not None:
                    units = tuple(
                        int(value.strip())
                        for value in match.group("units").split(",")
                    )
                    if not all(1 <= value <= profile.max_unit for value in units):
                        match = None
                        units = ()
                if match is None:
                    pending.append(text, page)
                    continue
                pending.append(text[: match.start()], page)
                raw, entry_pages = pending.take()
                if not raw:
                    rejected.append(
                        RejectedEntry(
                            registry_source_id=profile.registry_source_id,
                            pages=entry_pages,
                            raw_text=text,
                            reason="unit_without_headword",
                        )
                    )
                    continue
                entries.append((raw, entry_pages, units))
    if pending.fragments:
        raw, entry_pages = pending.take()
        rejected.append(
            RejectedEntry(
                registry_source_id=profile.registry_source_id,
                pages=entry_pages,
                raw_text=raw,
                reason="unterminated_index_text",
            )
        )
    return entries, rejected


def candidate_key(value: str) -> str:
    return clean_spaces(value).casefold()


def extract_candidates_from_xml(
    xml_text: str,
    profile: SourceProfile,
    *,
    enforce_profile_gates: bool = True,
) -> ExtractionResult:
    pages = eligible_fragments(xml_text, profile)
    raw_entries, rejected = parse_raw_entries(pages, profile)
    candidates: dict[str, Candidate] = {}
    duplicate_count = 0
    for raw, pages_for_entry, units in raw_entries:
        headword, positions, reason = clean_headword(raw)
        if reason is not None:
            rejected.append(
                RejectedEntry(
                    registry_source_id=profile.registry_source_id,
                    pages=pages_for_entry,
                    raw_text=raw,
                    reason=reason,
                )
            )
            continue
        key = candidate_key(headword)
        if key in candidates:
            duplicate_count += 1
            candidate = candidates[key]
            candidate.pages.update(pages_for_entry)
            candidate.units.update(units)
            for position in positions:
                if position not in candidate.positions:
                    candidate.positions.append(position)
            continue
        candidates[key] = Candidate(
            source=profile.display_name,
            registry_source_id=profile.registry_source_id,
            raw_term=headword,
            headword=headword,
            cefr=profile.cefr,
            positions=list(positions),
            pages=set(pages_for_entry),
            units=set(units),
        )

    if enforce_profile_gates:
        count = len(candidates)
        if not profile.min_candidates <= count <= profile.max_candidates:
            raise ValueError(
                f"{profile.registry_source_id}: candidate count {count} "
                f"outside gate {profile.min_candidates}-{profile.max_candidates}"
            )
        keys = set(candidates)
        missing = [
            required
            for required in profile.required_headwords
            if candidate_key(required) not in keys
        ]
        if missing:
            raise ValueError(
                f"{profile.registry_source_id}: missing required index "
                f"headwords {missing}"
            )
        if len(rejected) > 25:
            reasons = Counter(item.reason for item in rejected)
            raise ValueError(
                f"{profile.registry_source_id}: too many rejected index "
                f"entries ({len(rejected)}): {dict(reasons)}"
            )

    rows: list[dict[str, str]] = []
    for candidate in candidates.values():
        pages_text = ",".join(str(value) for value in sorted(candidate.pages))
        units_text = ",".join(str(value) for value in sorted(candidate.units))
        rows.append(
            {
                "source": candidate.source,
                "registry_source_id": candidate.registry_source_id,
                "raw_term": candidate.raw_term,
                "headword": candidate.headword,
                "pos": "; ".join(candidate.positions),
                "cefr": candidate.cefr,
                "topic_or_section": "Alphabetical index",
                "pdf_page": pages_text,
                "source_ref": candidate.registry_source_id,
                "definition": "",
                "notes": (
                    "Headword-only index extraction; pronunciation and "
                    "bracketed sense gloss omitted. CEFR is the source-level "
                    "band; entry-level review is required before promotion."
                ),
                "source_role": SOURCE_ROLE,
                "corpus_policy": CORPUS_POLICY,
                "source_format": SOURCE_FORMAT,
                "locator": (
                    f"pdf:index;pdf_pages={pages_text};units={units_text}"
                ),
            }
        )
    return ExtractionResult(
        rows=rows,
        rejected=rejected,
        raw_entry_count=len(raw_entries),
        duplicate_entry_count=duplicate_count,
    )


def extract_pdf(path: Path) -> tuple[SourceProfile, ExtractionResult]:
    profile = identify_profile(path)
    xml_text = pdf_to_xml(path, profile)
    result = extract_candidates_from_xml(xml_text, profile)
    return profile, result


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


def write_review_tsv(path: Path, rows: list[RejectedEntry]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=REVIEW_COLUMNS,
            delimiter="\t",
            lineterminator="\n",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "registry_source_id": row.registry_source_id,
                    "pdf_pages": ",".join(str(value) for value in row.pages),
                    "raw_text": row.raw_text,
                    "reason": row.reason,
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_files", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--review-output", type=Path)
    args = parser.parse_args()

    extracted: dict[str, tuple[SourceProfile, ExtractionResult]] = {}
    for path in args.pdf_files:
        profile, result = extract_pdf(path)
        if profile.registry_source_id in extracted:
            raise ValueError(
                f"Duplicate registered source: {profile.registry_source_id}"
            )
        extracted[profile.registry_source_id] = (profile, result)
    expected_ids = {profile.registry_source_id for profile in PROFILES}
    if set(extracted) != expected_ids:
        missing = sorted(expected_ids - set(extracted))
        extra = sorted(set(extracted) - expected_ids)
        raise ValueError(
            f"Expected all four registered sources; missing={missing}, "
            f"extra={extra}"
        )

    all_rows: list[dict[str, str]] = []
    all_rejected: list[RejectedEntry] = []
    for profile in PROFILES:
        _, result = extracted[profile.registry_source_id]
        all_rows.extend(result.rows)
        all_rejected.extend(result.rejected)
        reasons = Counter(item.reason for item in result.rejected)
        print(
            f"{profile.registry_source_id}: "
            f"{len(result.rows)} candidates, "
            f"{result.raw_entry_count} raw index entries, "
            f"{result.duplicate_entry_count} duplicate senses/forms merged, "
            f"{len(result.rejected)} rejected "
            f"{dict(sorted(reasons.items()))}"
        )
    write_tsv(args.output, all_rows)
    if args.review_output is not None:
        write_review_tsv(args.review_output, all_rejected)
    print(f"Wrote {len(all_rows)} candidate rows to {args.output}")


if __name__ == "__main__":
    main()
