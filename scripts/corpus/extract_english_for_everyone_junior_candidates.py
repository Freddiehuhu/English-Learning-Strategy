#!/usr/bin/env python3
"""Extract candidate-only entries from the explicit six-page Word list.

The private source PDF is accepted only when its public-registry SHA-256 and
byte size match this source-specific profile and ``pdfinfo`` reports exactly
256 pages. Only PDF pages 250-255 are parsed. The exported TSV retains the
printed lexical form, a teaching headword, the printed part-of-speech meaning,
and sanitized page/column/unit locators.

Definitions, examples, exercises, answers, illustrations, IPA, local paths and
local filenames are never exported. No entry-level CEFR value is inferred.
Every row remains ``candidate_only`` until editorial review explicitly
promotes it through a separate workflow.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import subprocess
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any
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

SOURCE_ID = "english-for-everyone-junior-beginners"
EXPECTED_SHA256 = (
    "3f1c62b724582a0987e35e8d8940106f0929d198c0630a3cbbe1beb4928f2e49"
)
EXPECTED_BYTE_SIZE = 111_955_857
EXPECTED_PAGE_COUNT = 256
WORD_LIST_PAGES = tuple(range(250, 256))
EXPECTED_XML_WIDTH = 829
EXPECTED_XML_HEIGHT = 990
COLUMN_STARTS = (54, 306, 557)
COLUMN_BOUNDARIES = (280, 531)

SOURCE_ROLE = "lexical_candidate"
CORPUS_POLICY = "candidate_only"
SOURCE_FORMAT = "pdf"

POS_LABELS = {
    "adj": "adjective",
    "adv": "adverb",
    "conj": "conjunction",
    "exp": "expression",
    # The source's own legend defines ``int`` as "question word". Mapping it
    # to "interjection" or inferring a different grammatical label would be
    # an unsupported change to the printed evidence.
    "int": "question word",
    "n": "noun",
    "num": "number",
    "prep": "preposition",
    "pron": "pronoun",
    "v": "verb",
}

LEGEND_LABELS = {
    "adj": "adjective",
    "exp": "expression",
    "int": "question word",
    "n": "noun",
    "num": "number",
    "pl": "plural",
    "prep": "preposition",
    "pron": "pronoun",
    "v": "verb",
}

INVERTED_HEADWORDS = {
    "moon, the": "the moon",
    "sun, the": "the sun",
    "sleep, go to": "go to sleep",
    "sorry, I’m": "I’m sorry",
    "worry, don’t": "don’t worry",
}

# The printed form remains in ``raw_term``. A teaching headword drops the
# terminal question mark only for the source's true ``int`` / question-word
# entries. Complete conversational expressions such as ``do you know?`` keep
# their punctuation. ``pardon?`` is the sole explicit question-word exception:
# here the punctuation is part of the short conversational formula rather than
# merely index typography.
EXPECTED_QUESTION_WORD_RAW_TERMS = {
    "how?",
    "how many?",
    "pardon?",
    "what?",
    "what time?",
    "when?",
    "where?",
    "which?",
    "who?",
    "whose?",
    "why?",
}
QUESTION_WORD_HEADWORD_EXCEPTIONS = {"pardon?"}
QUESTION_WORD_HEADWORD_REPAIRS = {
    raw_term: raw_term[:-1]
    for raw_term in EXPECTED_QUESTION_WORD_RAW_TERMS
    if raw_term not in QUESTION_WORD_HEADWORD_EXCEPTIONS
}
EXPECTED_EXPRESSION_QUESTION_FORMS = {
    "do you know?",
    "do you want?",
}

DAYS_OF_WEEK = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)
EXPECTED_DAY_OF_WEEK_EVIDENCE = {
    "Friday": (251, 3, ("25",)),
    "Monday": (253, 1, ("25",)),
    "Saturday": (254, 1, ("25",)),
    "Sunday": (254, 2, ("25",)),
    "Thursday": (254, 3, ("25",)),
    "Tuesday": (255, 1, ("25",)),
    "Wednesday": (255, 2, ("25",)),
}

EXPECTED_PAGE_ROW_COUNTS = {
    250: 79,
    251: 96,
    252: 94,
    253: 91,
    254: 102,
    255: 53,
}

EXPECTED_POS_COUNTS = {
    "adjective": 38,
    "adverb": 4,
    "conjunction": 3,
    "expression": 24,
    "noun": 311,
    "number": 20,
    "preposition": 7,
    "pronoun": 14,
    "question word": 11,
    "verb": 83,
}

EXPECTED_MULTI_POS = {
    "answer": {"noun", "verb"},
    "fish": {"noun", "verb"},
    "his": {"adjective", "pronoun"},
    "one": {"number", "pronoun"},
    "orange": {"adjective", "noun"},
    "skateboard": {"noun", "verb"},
}

EXPECTED_NUMERIC_FRAGMENT_REPAIRS = {
    (250, "big"): ("1", "0, 21"),
    (252, "go home"): ("2", "5"),
}

EXPECTED_MULTI_FRAGMENT_LOCATORS = {
    (250, "be (is/are)"): (
        "1, 4, 5, 6,",
        "9, 15, 21, 22, 25, G1",
    ),
    (250, "between"): ("12", ",", "G8"),
    (250, "big"): ("1", "0, 21"),
    (252, "go home"): ("2", "5"),
    (252, "how many?"): ("15,", "G6"),
    (253, "my"): (
        "1, 4, 5, 6, 7, 11, 13,",
        "21, 25, G10",
    ),
    (255, "yes, please"): ("23,", "G14"),
}

EXPECTED_EXPLANATORY_LOCATORS = {
    (250, 1, 204, 154, "G"),
    (250, 1, 228, 154, "G3"),
}

EXPECTED_ROW_COUNT = 515
EXPECTED_NORMALIZED_KEY_COUNT = 504
EXPECTED_RAW_CASEFOLD_KEY_COUNT = 510

# SHA-256 of the complete ordered source-evidence sequence. The payload covers
# page, column, vertical position, printed lexical form, printed POS code,
# normalized locator tokens and the original Poppler locator fragments. Count
# and distribution checks alone cannot catch an equal-size lexical replacement.
EXPECTED_ENTRY_SEQUENCE_SHA256 = (
    "a55832ab62f2f996d483bd0e1837aa8b0121fded049603eb01f6ca6885645ac2"
)

ROW_NOTE = (
    "Candidate-only explicit Word list entry; printed POS and unit locator "
    "only; no entry-level CEFR inferred; editorial review required."
)

RIGHTS_BOUNDARY = (
    "Retained printed lexical forms, teaching headwords, printed parts of "
    "speech and sanitized page/column/unit locators only; excluded "
    "definitions, examples, exercises, answers, illustrations, IPA, local "
    "paths and local filenames."
)

LOCATOR_TOKEN_PATTERN = re.compile(r"(?:G\d{1,2}|\d{1,2})")
LOCATOR_PATTERN = re.compile(
    rf"{LOCATOR_TOKEN_PATTERN.pattern}(?:,{LOCATOR_TOKEN_PATTERN.pattern})*"
)


@dataclass(frozen=True)
class RegistrySource:
    id: str
    display_name: str
    expected_sha256: str
    expected_byte_size: int
    source_role: str
    corpus_policy: str
    source_format: str


@dataclass(frozen=True)
class FontSpec:
    family: str
    size: int
    color: str


@dataclass(frozen=True)
class TextFragment:
    fragment_id: int
    page: int
    column: int
    top: int
    left: int
    width: int
    text: str
    role: str


@dataclass(frozen=True)
class ParsedEntry:
    raw_term: str
    headword: str
    pos_code: str
    pos: str
    page: int
    column: int
    top: int
    printed_locators: tuple[str, ...]
    locator_fragment_texts: tuple[str, ...]


def clean_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("\u00a0", " ").replace("\u200b", "")
    return re.sub(r"\s+", " ", text).strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_registry(path: Path) -> RegistrySource:
    payload = json.loads(path.read_text(encoding="utf-8"))
    matches = [
        item
        for item in payload.get("sources", [])
        if isinstance(item, dict) and item.get("id") == SOURCE_ID
    ]
    if len(matches) != 1:
        raise ValueError(f"Registry must contain exactly one {SOURCE_ID} entry")
    item = matches[0]
    source = RegistrySource(
        id=SOURCE_ID,
        display_name=clean_text(item.get("display_name")),
        expected_sha256=clean_text(item.get("expected_sha256")),
        expected_byte_size=int(item.get("expected_byte_size") or 0),
        source_role=clean_text(item.get("source_role")),
        corpus_policy=clean_text(item.get("corpus_policy")),
        source_format=clean_text(item.get("format")),
    )
    expected = {
        "expected_sha256": EXPECTED_SHA256,
        "expected_byte_size": EXPECTED_BYTE_SIZE,
        "source_role": SOURCE_ROLE,
        "corpus_policy": CORPUS_POLICY,
        "source_format": SOURCE_FORMAT,
    }
    actual = {
        "expected_sha256": source.expected_sha256,
        "expected_byte_size": source.expected_byte_size,
        "source_role": source.source_role,
        "corpus_policy": source.corpus_policy,
        "source_format": source.source_format,
    }
    if actual != expected:
        raise ValueError(f"{SOURCE_ID}: public registry profile mismatch")
    if not source.display_name:
        raise ValueError(f"{SOURCE_ID}: public display name is required")
    return source


def executable(value: str) -> str:
    resolved = shutil.which(value)
    if resolved is None:
        raise RuntimeError(f"Required executable is unavailable: {value}")
    return resolved


def command_output(command: list[str], *, failure_code: str) -> str:
    try:
        completed = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError(f"{SOURCE_ID}: {failure_code}") from error
    return completed.stdout


def pdf_page_count(path: Path, pdfinfo: str) -> int:
    output = command_output(
        [pdfinfo, str(path)],
        failure_code="pdfinfo_failed",
    )
    match = re.search(r"^Pages:\s+(\d+)\s*$", output, flags=re.MULTILINE)
    if match is None:
        raise ValueError(f"{SOURCE_ID}: pdfinfo page count is missing")
    return int(match.group(1))


def verify_source(
    path: Path,
    source: RegistrySource,
    *,
    pdfinfo: str,
) -> str:
    if not path.is_file():
        raise ValueError(f"{SOURCE_ID}: registered source file is unavailable")
    byte_size = path.stat().st_size
    if byte_size != source.expected_byte_size:
        raise ValueError(f"{SOURCE_ID}: source byte size mismatch")
    digest = sha256_file(path)
    if digest != source.expected_sha256:
        raise ValueError(f"{SOURCE_ID}: source SHA-256 mismatch")
    pages = pdf_page_count(path, pdfinfo)
    if pages != EXPECTED_PAGE_COUNT:
        raise ValueError(
            f"{SOURCE_ID}: expected {EXPECTED_PAGE_COUNT} PDF pages, "
            f"found {pages}"
        )
    return digest


def pdf_to_xml(path: Path, pdftohtml: str) -> str:
    return command_output(
        [
            pdftohtml,
            "-i",
            "-f",
            str(WORD_LIST_PAGES[0]),
            "-l",
            str(WORD_LIST_PAGES[-1]),
            "-xml",
            "-stdout",
            str(path),
        ],
        failure_code="pdftohtml_failed",
    )


def font_family(value: str) -> str:
    return re.sub(r"^[A-Z]{6}\+", "", value)


def classify_font(spec: FontSpec) -> str:
    family = font_family(spec.family)
    if (
        family == "JuliusPrimaryStd"
        and spec.color == "#1c1c1b"
        and spec.size in {19, 20}
    ):
        return "headword"
    if (
        family == "JuliusPrimaryStd"
        and spec.color == "#70706e"
        and spec.size in {19, 20}
    ):
        return "pos"
    if (
        family == "MundoSansPro-Medium"
        and spec.color == "#7c7c7b"
        and spec.size in {18, 19, 20}
    ):
        return "locator"
    return "other"


def column_for(left: int) -> int:
    if left < COLUMN_BOUNDARIES[0]:
        return 1
    if left < COLUMN_BOUNDARIES[1]:
        return 2
    return 3


def inner_text(element: ElementTree.Element) -> str:
    return "".join(element.itertext())


def parse_fragments(
    xml_text: str,
    *,
    enforce_source_gates: bool,
) -> dict[int, list[TextFragment]]:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as error:
        raise ValueError(f"{SOURCE_ID}: invalid Poppler XML") from error
    if root.tag != "pdf2xml" or root.attrib.get("producer") != "poppler":
        raise ValueError(f"{SOURCE_ID}: unexpected XML producer")

    fonts: dict[str, FontSpec] = {}
    for element in root.iter("fontspec"):
        font_id = element.attrib.get("id", "")
        if not font_id or font_id in fonts:
            raise ValueError(f"{SOURCE_ID}: duplicate or missing font ID")
        try:
            size = int(element.attrib.get("size", ""))
        except ValueError as error:
            raise ValueError(f"{SOURCE_ID}: invalid font size") from error
        fonts[font_id] = FontSpec(
            family=element.attrib.get("family", ""),
            size=size,
            color=element.attrib.get("color", "").lower(),
        )

    pages: dict[int, list[TextFragment]] = {}
    fragment_id = 0
    for page_element in root.findall("page"):
        try:
            page = int(page_element.attrib["number"])
            width = int(page_element.attrib["width"])
            height = int(page_element.attrib["height"])
        except (KeyError, ValueError) as error:
            raise ValueError(f"{SOURCE_ID}: invalid XML page metadata") from error
        if page in pages:
            raise ValueError(f"{SOURCE_ID}: duplicate XML page {page}")
        if width != EXPECTED_XML_WIDTH or height != EXPECTED_XML_HEIGHT:
            raise ValueError(
                f"{SOURCE_ID}: unexpected XML dimensions on page {page}"
            )
        fragments: list[TextFragment] = []
        for text_element in page_element.findall("text"):
            font_id = text_element.attrib.get("font", "")
            if font_id not in fonts:
                raise ValueError(f"{SOURCE_ID}: undeclared XML font ID")
            role = classify_font(fonts[font_id])
            if role == "other":
                continue
            text = clean_text(inner_text(text_element))
            if not text:
                continue
            try:
                top = int(text_element.attrib["top"])
                left = int(text_element.attrib["left"])
                fragment_width = int(text_element.attrib["width"])
            except (KeyError, ValueError) as error:
                raise ValueError(
                    f"{SOURCE_ID}: invalid XML text coordinates"
                ) from error
            fragment_id += 1
            fragments.append(
                TextFragment(
                    fragment_id=fragment_id,
                    page=page,
                    column=column_for(left),
                    top=top,
                    left=left,
                    width=fragment_width,
                    text=text,
                    role=role,
                )
            )
        pages[page] = fragments

    if enforce_source_gates and set(pages) != set(WORD_LIST_PAGES):
        raise ValueError(
            f"{SOURCE_ID}: expected Word list pages "
            f"{WORD_LIST_PAGES[0]}-{WORD_LIST_PAGES[-1]}, got "
            f"{sorted(pages)}"
        )
    if not pages:
        raise ValueError(f"{SOURCE_ID}: no XML pages were parsed")
    return pages


def same_line(first: TextFragment, second: TextFragment) -> bool:
    return abs(first.top - second.top) <= 2


def clean_raw_term(value: str) -> str:
    value = clean_text(value)
    if not value or len(value) > 80 or not any(char.isalpha() for char in value):
        raise ValueError(f"{SOURCE_ID}: invalid Word list lexical form")
    if any(0xE000 <= ord(char) <= 0xF8FF for char in value):
        raise ValueError(f"{SOURCE_ID}: private-use glyph in lexical form")
    if any(unicodedata.category(char).startswith("C") for char in value):
        raise ValueError(f"{SOURCE_ID}: control character in lexical form")
    if re.search(r"[^A-Za-z0-9 '’(),/!?-]", value):
        raise ValueError(f"{SOURCE_ID}: unexpected lexical-form character")
    return value


def teaching_headword(raw_term: str, pos_code: str) -> str:
    """Return the explicit teaching form without losing printed evidence."""

    headword = INVERTED_HEADWORDS.get(raw_term, raw_term)
    if pos_code == "int":
        headword = QUESTION_WORD_HEADWORD_REPAIRS.get(headword, headword)
    return headword


def parse_locator(fragments: list[TextFragment]) -> tuple[str, ...]:
    compact = "".join(fragment.text for fragment in fragments)
    compact = re.sub(r"\s+", "", compact)
    if LOCATOR_PATTERN.fullmatch(compact) is None:
        raise ValueError(
            f"{SOURCE_ID}: invalid printed Word list locator {compact!r}"
        )
    tokens = tuple(compact.split(","))
    for token in tokens:
        if token.startswith("G"):
            value = int(token[1:])
            if not 1 <= value <= 14:
                raise ValueError(f"{SOURCE_ID}: grammar locator out of range")
        else:
            value = int(token)
            if not 1 <= value <= 25:
                raise ValueError(f"{SOURCE_ID}: unit locator out of range")
    return tokens


def normalized_gate_key(value: str) -> str:
    text = clean_text(value).replace("’", "'").casefold()
    while True:
        match = re.fullmatch(r"(.*?)\s+\(([^()]*)\)", text)
        if match is None:
            break
        text = match.group(1).strip()
    text = re.sub(r"\s*/\s*", "/", text)
    text = re.sub(r"\s*-\s*", "-", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" ,;:.")


def entry_sequence_sha256(entries: list[ParsedEntry]) -> str:
    """Hash the complete ordered source-evidence sequence deterministically."""

    payload = [
        [
            entry.page,
            entry.column,
            entry.top,
            entry.raw_term,
            entry.pos_code,
            list(entry.printed_locators),
            list(entry.locator_fragment_texts),
        ]
        for entry in entries
    ]
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def validate_entry_sequence(
    entries: list[ParsedEntry],
    *,
    expected_sha256: str = EXPECTED_ENTRY_SEQUENCE_SHA256,
) -> None:
    if entry_sequence_sha256(entries) != expected_sha256:
        raise ValueError(f"{SOURCE_ID}: ordered entry sequence changed")


def validate_entries(entries: list[ParsedEntry]) -> None:
    if len(entries) != EXPECTED_ROW_COUNT:
        raise ValueError(
            f"{SOURCE_ID}: expected {EXPECTED_ROW_COUNT} Word list rows, "
            f"found {len(entries)}"
        )
    page_counts = Counter(entry.page for entry in entries)
    if dict(sorted(page_counts.items())) != EXPECTED_PAGE_ROW_COUNTS:
        raise ValueError(
            f"{SOURCE_ID}: unexpected per-page Word list row counts"
        )
    pos_counts = Counter(entry.pos for entry in entries)
    if dict(sorted(pos_counts.items())) != EXPECTED_POS_COUNTS:
        raise ValueError(f"{SOURCE_ID}: unexpected printed POS distribution")

    aliases = {
        entry.raw_term: entry.headword
        for entry in entries
        if entry.raw_term != entry.headword
    }
    expected_aliases = {
        **INVERTED_HEADWORDS,
        **QUESTION_WORD_HEADWORD_REPAIRS,
    }
    if aliases != expected_aliases:
        raise ValueError(f"{SOURCE_ID}: teaching-headword repairs changed")

    question_word_entries = {
        entry.raw_term: entry.headword
        for entry in entries
        if entry.pos_code == "int"
    }
    expected_question_word_entries = {
        raw_term: QUESTION_WORD_HEADWORD_REPAIRS.get(raw_term, raw_term)
        for raw_term in EXPECTED_QUESTION_WORD_RAW_TERMS
    }
    if question_word_entries != expected_question_word_entries:
        raise ValueError(f"{SOURCE_ID}: question-word evidence changed")
    expression_questions = {
        entry.raw_term: entry.headword
        for entry in entries
        if entry.pos_code == "exp" and entry.raw_term.endswith("?")
    }
    if expression_questions != {
        raw_term: raw_term for raw_term in EXPECTED_EXPRESSION_QUESTION_FORMS
    }:
        raise ValueError(
            f"{SOURCE_ID}: conversational-expression punctuation changed"
        )

    day_of_week_evidence = {
        entry.raw_term: (entry.page, entry.column, entry.printed_locators)
        for entry in entries
        if entry.raw_term in DAYS_OF_WEEK
        and entry.headword == entry.raw_term
        and entry.pos_code == "n"
        and entry.pos == "noun"
    }
    if day_of_week_evidence != EXPECTED_DAY_OF_WEEK_EVIDENCE:
        raise ValueError(f"{SOURCE_ID}: day-of-week evidence changed")

    repairs = {
        (entry.page, entry.raw_term): entry.locator_fragment_texts
        for entry in entries
        if (entry.page, entry.raw_term) in EXPECTED_NUMERIC_FRAGMENT_REPAIRS
    }
    if repairs != EXPECTED_NUMERIC_FRAGMENT_REPAIRS:
        raise ValueError(f"{SOURCE_ID}: locator fragment repairs changed")

    multi_fragment_locators = {
        (entry.page, entry.raw_term): entry.locator_fragment_texts
        for entry in entries
        if len(entry.locator_fragment_texts) > 1
    }
    if multi_fragment_locators != EXPECTED_MULTI_FRAGMENT_LOCATORS:
        raise ValueError(f"{SOURCE_ID}: multi-fragment locators changed")

    raw_keys = {entry.raw_term.casefold() for entry in entries}
    if len(raw_keys) != EXPECTED_RAW_CASEFOLD_KEY_COUNT:
        raise ValueError(f"{SOURCE_ID}: unexpected raw-term key count")
    normalized_keys = {
        normalized_gate_key(entry.headword) for entry in entries
    }
    if len(normalized_keys) != EXPECTED_NORMALIZED_KEY_COUNT:
        raise ValueError(f"{SOURCE_ID}: unexpected normalized key count")

    positions: dict[str, set[str]] = defaultdict(set)
    for entry in entries:
        positions[normalized_gate_key(entry.headword)].add(entry.pos)
    multi_pos = {
        key: value for key, value in positions.items() if len(value) > 1
    }
    if multi_pos != EXPECTED_MULTI_POS:
        raise ValueError(f"{SOURCE_ID}: unexpected multi-POS groups")

    validate_entry_sequence(entries)


def parse_word_list_xml(
    xml_text: str,
    *,
    enforce_source_gates: bool = True,
) -> list[ParsedEntry]:
    pages = parse_fragments(
        xml_text,
        enforce_source_gates=enforce_source_gates,
    )
    assigned: set[int] = set()
    legend_pairs: set[tuple[str, str]] = set()
    parsed: list[ParsedEntry] = []

    for page in sorted(pages):
        page_fragments = pages[page]
        candidate_anchors: list[
            tuple[TextFragment, list[TextFragment], str]
        ] = []
        for pos_fragment in page_fragments:
            if pos_fragment.role != "pos":
                continue
            code = pos_fragment.text.casefold()
            headword_fragments = sorted(
                (
                    fragment
                    for fragment in page_fragments
                    if fragment.role == "headword"
                    and fragment.column == pos_fragment.column
                    and same_line(fragment, pos_fragment)
                    and fragment.left < pos_fragment.left
                ),
                key=lambda fragment: fragment.left,
            )
            if code in POS_LABELS and headword_fragments:
                column_start = COLUMN_STARTS[pos_fragment.column - 1]
                if abs(headword_fragments[0].left - column_start) > 2:
                    raise ValueError(
                        f"{SOURCE_ID}: shifted headword column on page {page}"
                    )
                candidate_anchors.append(
                    (pos_fragment, headword_fragments, code)
                )
                continue

            if page == 250 and pos_fragment.column == 1:
                label_fragments = sorted(
                    (
                        fragment
                        for fragment in page_fragments
                        if fragment.role == "headword"
                        and fragment.column == 1
                        and same_line(fragment, pos_fragment)
                        and fragment.left > pos_fragment.left
                    ),
                    key=lambda fragment: fragment.left,
                )
                label = clean_text(" ".join(
                    fragment.text for fragment in label_fragments
                ))
                if LEGEND_LABELS.get(code) == label:
                    assigned.add(pos_fragment.fragment_id)
                    assigned.update(
                        fragment.fragment_id for fragment in label_fragments
                    )
                    legend_pairs.add((code, label))

        anchors_by_column: dict[
            int, list[tuple[TextFragment, list[TextFragment], str]]
        ] = defaultdict(list)
        for anchor in candidate_anchors:
            anchors_by_column[anchor[0].column].append(anchor)

        for column in (1, 2, 3):
            anchors = sorted(
                anchors_by_column[column],
                key=lambda item: item[0].top,
            )
            for index, (pos_fragment, headword_fragments, code) in enumerate(
                anchors
            ):
                next_top = (
                    anchors[index + 1][0].top
                    if index + 1 < len(anchors)
                    else EXPECTED_XML_HEIGHT
                )
                continuation_limit = min(pos_fragment.top + 27, next_top - 3)
                pos_end = pos_fragment.left + pos_fragment.width
                locator_fragments = sorted(
                    (
                        fragment
                        for fragment in page_fragments
                        if fragment.column == column
                        and (
                            (
                                same_line(fragment, pos_fragment)
                                and fragment.left >= pos_end - 1
                                and fragment.role in {"headword", "locator"}
                            )
                            or (
                                pos_fragment.top + 3 <= fragment.top
                                <= continuation_limit
                                and fragment.role == "locator"
                            )
                        )
                    ),
                    key=lambda fragment: (
                        0 if same_line(fragment, pos_fragment) else 1,
                        fragment.left
                        if same_line(fragment, pos_fragment)
                        else fragment.top * 1000 + fragment.left,
                    ),
                )
                if not locator_fragments:
                    raise ValueError(
                        f"{SOURCE_ID}: missing locator on page {page}"
                    )
                raw_term = clean_raw_term(
                    " ".join(fragment.text for fragment in headword_fragments)
                )
                printed_locators = parse_locator(locator_fragments)
                headword = teaching_headword(raw_term, code)
                parsed.append(
                    ParsedEntry(
                        raw_term=raw_term,
                        headword=headword,
                        pos_code=code,
                        pos=POS_LABELS[code],
                        page=page,
                        column=column,
                        top=pos_fragment.top,
                        printed_locators=printed_locators,
                        locator_fragment_texts=tuple(
                            fragment.text for fragment in locator_fragments
                        ),
                    )
                )
                assigned.add(pos_fragment.fragment_id)
                assigned.update(
                    fragment.fragment_id for fragment in headword_fragments
                )
                assigned.update(
                    fragment.fragment_id for fragment in locator_fragments
                )

    expected_legend = set(LEGEND_LABELS.items())
    if enforce_source_gates and legend_pairs != expected_legend:
        raise ValueError(f"{SOURCE_ID}: Word list POS legend changed")

    explanatory_locators: set[tuple[int, int, int, int, str]] = set()
    for page_fragments in pages.values():
        for fragment in page_fragments:
            signature = (
                fragment.page,
                fragment.column,
                fragment.top,
                fragment.left,
                fragment.text,
            )
            if (
                fragment.role == "locator"
                and signature in EXPECTED_EXPLANATORY_LOCATORS
            ):
                assigned.add(fragment.fragment_id)
                explanatory_locators.add(signature)
    if (
        enforce_source_gates
        and explanatory_locators != EXPECTED_EXPLANATORY_LOCATORS
    ):
        raise ValueError(f"{SOURCE_ID}: Word list locator key changed")

    unassigned = [
        fragment
        for page_fragments in pages.values()
        for fragment in page_fragments
        if fragment.fragment_id not in assigned
    ]
    if unassigned:
        summary = Counter(fragment.role for fragment in unassigned)
        raise ValueError(
            f"{SOURCE_ID}: unassigned Word list layout fragments "
            f"{dict(sorted(summary.items()))}"
        )

    parsed.sort(key=lambda entry: (entry.page, entry.column, entry.top))
    if enforce_source_gates:
        validate_entries(parsed)
    return parsed


def make_rows(
    source: RegistrySource,
    entries: list[ParsedEntry],
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    page_entry_counts: Counter[int] = Counter()
    for entry in entries:
        page_entry_counts[entry.page] += 1
        printed = ",".join(entry.printed_locators)
        rows.append(
            {
                "source": source.display_name,
                "registry_source_id": source.id,
                "raw_term": entry.raw_term,
                "headword": entry.headword,
                "pos": entry.pos,
                "cefr": "",
                "topic_or_section": "Alphabetical Word list",
                "pdf_page": str(entry.page),
                "source_ref": f"registry:{source.id}",
                "definition": "",
                "notes": ROW_NOTE,
                "source_role": source.source_role,
                "corpus_policy": source.corpus_policy,
                "source_format": source.source_format,
                "locator": (
                    f"pdf:page={entry.page};section=word-list;"
                    f"column={entry.column};entry={page_entry_counts[entry.page]};"
                    f"printed-locators={printed}"
                ),
            }
        )
    return rows


def extract_pdf(
    path: Path,
    registry_path: Path,
    *,
    pdftohtml: str = "pdftohtml",
    pdfinfo: str = "pdfinfo",
) -> tuple[RegistrySource, list[ParsedEntry], str]:
    source = load_registry(registry_path)
    resolved_pdfinfo = executable(pdfinfo)
    resolved_pdftohtml = executable(pdftohtml)
    digest = verify_source(
        path,
        source,
        pdfinfo=resolved_pdfinfo,
    )
    xml_text = pdf_to_xml(path, resolved_pdftohtml)
    entries = parse_word_list_xml(xml_text)
    return source, entries, digest


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


def render_manifest_sha256(
    path: Path,
    *,
    source_sha256: str,
) -> str:
    """Validate and bind the exact six-page render-evidence manifest."""

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(
            f"{SOURCE_ID}: render evidence is unavailable or invalid"
        ) from error
    if not isinstance(payload, dict):
        raise ValueError(f"{SOURCE_ID}: render evidence must be an object")
    expected_profile = {
        "schema_version": 1,
        "source_id": SOURCE_ID,
        "source_format": SOURCE_FORMAT,
        "source_sha256": source_sha256,
        "source_page_count": EXPECTED_PAGE_COUNT,
    }
    actual_profile = {
        key: payload.get(key) for key in expected_profile
    }
    if actual_profile != expected_profile:
        raise ValueError(f"{SOURCE_ID}: render evidence source profile mismatch")
    rendered_pages = payload.get("rendered_pages")
    if not isinstance(rendered_pages, list):
        raise ValueError(f"{SOURCE_ID}: rendered_pages must be a list")
    page_numbers: list[int] = []
    for entry in rendered_pages:
        if not isinstance(entry, dict):
            raise ValueError(f"{SOURCE_ID}: invalid rendered-page evidence")
        page = entry.get("page")
        digest = str(entry.get("sha256") or "")
        byte_size = entry.get("byte_size")
        width = entry.get("width_px")
        height = entry.get("height_px")
        if (
            not isinstance(page, int)
            or isinstance(page, bool)
            or re.fullmatch(r"[0-9a-f]{64}", digest) is None
            or not isinstance(byte_size, int)
            or isinstance(byte_size, bool)
            or byte_size < 1
            or not isinstance(width, int)
            or isinstance(width, bool)
            or width < 1
            or not isinstance(height, int)
            or isinstance(height, bool)
            or height < 1
        ):
            raise ValueError(f"{SOURCE_ID}: invalid rendered-page evidence")
        page_numbers.append(page)
    if page_numbers != list(WORD_LIST_PAGES):
        raise ValueError(
            f"{SOURCE_ID}: render evidence must cover pages "
            f"{WORD_LIST_PAGES[0]}-{WORD_LIST_PAGES[-1]} exactly"
        )
    return sha256_file(path)


def build_audit(
    entries: list[ParsedEntry],
    *,
    source_sha256: str,
    candidate_tsv_sha256: str,
    candidate_tsv_byte_size: int,
    render_manifest_sha256_value: str,
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "scope": (
            "Explicit entries from PDF pages 250-255 labelled Word list; all "
            "rows remain candidate-only pending editorial review."
        ),
        "sources": [
            {
                "id": SOURCE_ID,
                "status": "candidate_extracted_needs_editorial_review",
                "provenance_schema_version": 1,
                "source_sha256": source_sha256,
                "source_byte_size": EXPECTED_BYTE_SIZE,
                "source_page_count": EXPECTED_PAGE_COUNT,
                "candidate_tsv_sha256": candidate_tsv_sha256,
                "candidate_tsv_byte_size": candidate_tsv_byte_size,
                "candidate_tsv_row_count": len(entries),
                "candidate_tsv_source_counts": {SOURCE_ID: len(entries)},
                "render_manifest_sha256": render_manifest_sha256_value,
                "extracted_row_count": len(entries),
                "normalized_key_count": len(
                    {normalized_gate_key(entry.headword) for entry in entries}
                ),
                "page_row_counts": {
                    str(page): count
                    for page, count in sorted(
                        Counter(entry.page for entry in entries).items()
                    )
                },
                "pos_counts": dict(
                    sorted(Counter(entry.pos for entry in entries).items())
                ),
                "extraction_method": (
                    "sha256_size_page_count_gated_poppler_xml_explicit_word_list"
                ),
                "pages_parsed": list(WORD_LIST_PAGES),
                "visual_sample_pages": list(WORD_LIST_PAGES),
                "editorial_review_complete": False,
                "rights_boundary": RIGHTS_BOUNDARY,
            }
        ],
    }


def write_audit(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_file", type=Path)
    parser.add_argument(
        "--registry",
        type=Path,
        default=Path("data/ielts-corpus/supplemental-source-registry.json"),
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--audit-output", required=True, type=Path)
    parser.add_argument("--render-evidence", required=True, type=Path)
    parser.add_argument("--pdftohtml", default="pdftohtml")
    parser.add_argument("--pdfinfo", default="pdfinfo")
    args = parser.parse_args()

    source, entries, digest = extract_pdf(
        args.pdf_file,
        args.registry,
        pdftohtml=args.pdftohtml,
        pdfinfo=args.pdfinfo,
    )
    rows = make_rows(source, entries)
    write_tsv(args.output, rows)
    manifest_sha256 = render_manifest_sha256(
        args.render_evidence,
        source_sha256=digest,
    )
    audit = build_audit(
        entries,
        source_sha256=digest,
        candidate_tsv_sha256=sha256_file(args.output),
        candidate_tsv_byte_size=args.output.stat().st_size,
        render_manifest_sha256_value=manifest_sha256,
    )
    write_audit(args.audit_output, audit)
    print(
        f"{SOURCE_ID}: wrote {len(rows)} candidate-only Word list rows "
        f"from pages {WORD_LIST_PAGES[0]}-{WORD_LIST_PAGES[-1]}"
    )


if __name__ == "__main__":
    main()
