#!/usr/bin/env python3
"""Extract Oxford 3000/5000 and Cambridge KET/B1 lists into unified TSV."""
from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

from pypdf import PdfReader


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPOSITORY_ROOT / "tmp" / "pdfs" / "batch_foundation"
FIELDS = [
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
]

SOURCES = {
    "oxford_3000": {
        "source": "Oxford 3000 by CEFR level",
        "path": Path(
            "/Users/huhu/Desktop/工作相关/Freddie&Nelson乐学善用工作室/下载/"
            "The Oxford 3000_by CEFR level.pdf"
        ),
        "output": "oxford_3000.tsv",
    },
    "oxford_5000": {
        "source": "Oxford 5000 by CEFR level",
        "path": Path(
            "/Users/huhu/Desktop/工作相关/Freddie&Nelson乐学善用工作室/下载/"
            "The Oxford 5000_by CEFR level.pdf"
        ),
        "output": "oxford_5000.tsv",
    },
    "ket_schools": {
        "source": "Cambridge KET and KET for Schools Vocabulary List (2009)",
        "path": Path(
            "/Users/huhu/Desktop/乔钇茗备考规划课程/"
            "23387-ket-schools-vocabulary-list.pdf"
        ),
        "output": "ket_schools.tsv",
    },
    "b1_preliminary": {
        "source": "Cambridge B1 Preliminary and Preliminary for Schools Vocabulary List (2025)",
        "path": Path(
            "/Users/huhu/Desktop/乔钇茗备考规划课程/"
            "506887-b1-preliminary-vocabulary-list.pdf"
        ),
        "output": "b1_preliminary.tsv",
    },
}
EXPECTED_OUTPUT_COUNTS = {
    "oxford_3000": 3307,
    "oxford_5000": 2015,
    "ket_schools": 1244,
    "b1_preliminary": 3119,
}


def clean_space(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u00a0", " ")).strip()


def headword_from_raw(raw: str, *, strip_oxford_sense: bool = False) -> str:
    # Oxford uses sense numbers such as can1 and lie1. Remove only those source
    # markers; retain parentheses, slashes, hyphens, and multi-word phrases.
    value = clean_space(raw)
    if strip_oxford_sense:
        value = re.sub(r"(?<=[A-Za-z])\d+(?=\s|\(|$)", "", value)
    return value


def base_row(
    *,
    source: str,
    raw_term: str,
    pos: str,
    cefr: str,
    section: str,
    page: int,
    filename: str,
    definition: str = "",
    notes: str = "",
    strip_oxford_sense: bool = False,
) -> dict[str, str | int]:
    return {
        "source": source,
        "raw_term": clean_space(raw_term),
        "headword": headword_from_raw(
            raw_term,
            strip_oxford_sense=strip_oxford_sense,
        ),
        "pos": clean_space(pos),
        "cefr": cefr,
        "topic_or_section": section,
        "pdf_page": page,
        "source_ref": f"{filename}#page={page}",
        "definition": clean_space(definition),
        "notes": clean_space(notes),
    }


OXFORD_ATOM = (
    r"(?:indefinite article|definite article|infinitive marker|modal v\.|auxiliary v\.|"
    r"n\.|v\.|adj\.|adv\.|prep\.|det\.|pron\.|conj\.|exclam\.|number)"
)
OXFORD_POS = re.compile(
    rf"^(?P<term>.+?)\s+(?P<pos>{OXFORD_ATOM}"
    rf"(?:\s*[,/]\s*{OXFORD_ATOM})*)$"
)


def parse_oxford(meta: dict[str, object]) -> tuple[list[dict], list[str]]:
    path = meta["path"]
    reader = PdfReader(str(path))
    rows: list[dict] = []
    anomalies: list[str] = []
    current_cefr = ""
    started = False

    for page_no, page in enumerate(reader.pages, 1):
        raw_lines = (page.extract_text() or "").replace("\x00", "").splitlines()
        pending = ""
        for raw_line in raw_lines:
            line = clean_space(raw_line)
            if not line:
                continue
            if (
                "© Oxford University Press" in line
                or "The Oxford 3000™ by CEFR level" in line
                or "The Oxford 5000™ by CEFR level" in line
                or line.startswith("The Oxford 3000 is ")
                or line.startswith("The Oxford 5000 is ")
                or line.startswith("3000, it includes ")
            ):
                continue
            if line in {"A1", "A2", "B1", "B2", "C1"}:
                if pending:
                    anomalies.append(f"p.{page_no}: discarded before CEFR marker: {pending}")
                    pending = ""
                current_cefr = line
                started = True
                continue
            if not started:
                continue

            candidate = clean_space(f"{pending} {line}") if pending else line
            match = OXFORD_POS.match(candidate)
            if match:
                rows.append(
                    base_row(
                        source=str(meta["source"]),
                        raw_term=match.group("term"),
                        pos=match.group("pos"),
                        cefr=current_cefr,
                        section=f"CEFR {current_cefr}",
                        page=page_no,
                        filename=Path(path).name,
                        strip_oxford_sense=True,
                    )
                )
                pending = ""
            else:
                # Wrapped entries normally end in a comma or slash, or have not
                # yet reached their POS marker.
                if pending and len(candidate) > 180:
                    anomalies.append(f"p.{page_no}: overlong unparsed text: {candidate}")
                    pending = line
                else:
                    pending = candidate
        if pending:
            anomalies.append(f"p.{page_no}: unparsed line: {pending}")
    return rows, anomalies


CAMBRIDGE_POS_ATOMS = [
    "prep phr",
    "phr v",
    "n pl",
    "n sing",
    "modal v",
    "aux v",
    "abbrev",
    "exclam",
    "number",
    "ordinal",
    "adj",
    "adv",
    "art",
    "av",
    "conj",
    "det",
    "inf",
    "mv",
    "n",
    "pl",
    "prep",
    "pron",
    "sing",
    "v",
]


def is_cambridge_pos(content: str) -> bool:
    residue = content.lower().strip()
    for atom in CAMBRIDGE_POS_ATOMS:
        residue = re.sub(rf"\b{re.escape(atom)}\b", "", residue)
    residue = re.sub(r"[\s,&/+\-.]|\band\b|\bor\b", "", residue)
    return residue == ""


def parse_cambridge_entry(line: str) -> tuple[str, str, str] | None:
    matches = list(re.finditer(r"\(([^()]*)\)", line))
    for match in matches:
        if not is_cambridge_pos(match.group(1)):
            continue
        term = clean_space(line[: match.start()])
        if not term:
            continue
        trailing = clean_space(line[match.end() :])
        return term, match.group(1), trailing
    return None


def parse_cambridge(
    meta: dict[str, object],
    *,
    first_page: int,
    last_page: int,
    cefr: str,
) -> tuple[list[dict], list[str]]:
    path = Path(meta["path"])
    reader = PdfReader(str(path))
    rows: list[dict] = []
    anomalies: list[str] = []
    current_letter = ""
    pending_example: list[str] = []

    def flush_example() -> None:
        nonlocal pending_example
        if pending_example and rows:
            value = clean_space(" ".join(pending_example))
            old = str(rows[-1]["notes"])
            rows[-1]["notes"] = clean_space(f"{old}; example: {value}".strip("; "))
        pending_example = []

    for page_no in range(first_page, last_page + 1):
        page = reader.pages[page_no - 1]
        lines = (page.extract_text() or "").replace("\uf0b7", "•").splitlines()
        for raw_line in lines:
            line = clean_space(raw_line)
            if not line:
                continue
            if (
                re.match(r"^Page \d+ of \d+", line)
                or line in {"for Schools Vocabulary", "List"}
                or "© CUPA" in line
                or "© UCLES" in line
                or line.endswith("Vocabulary List")
            ):
                continue
            if re.fullmatch(r"[A-Z]", line):
                flush_example()
                current_letter = line
                continue
            if line.startswith("•"):
                pending_example.append(clean_space(line[1:]))
                continue
            if pending_example and not parse_cambridge_entry(line):
                # Wrapped example lines have no POS marker.
                pending_example.append(line)
                continue
            flush_example()
            parsed = parse_cambridge_entry(line)
            if not parsed:
                anomalies.append(f"p.{page_no}: unparsed non-example line: {line}")
                continue
            term, pos, trailing = parsed
            rows.append(
                base_row(
                    source=str(meta["source"]),
                    raw_term=term,
                    pos=pos,
                    cefr=cefr,
                    section=f"Alphabetical list: {current_letter or '?'}",
                    page=page_no,
                    filename=path.name,
                    notes=trailing,
                )
            )
    flush_example()
    return rows, anomalies


def add_reconstructed_rows(
    rows: list[dict],
    meta: dict[str, object],
    cefr: str,
    items: list[tuple[int, str, str, str]],
) -> None:
    path = Path(meta["path"])
    existing = {(int(row["pdf_page"]), str(row["raw_term"]).casefold()) for row in rows}
    for page, term, pos, notes in items:
        if (page, term.casefold()) in existing:
            continue
        rows.append(
            base_row(
                source=str(meta["source"]),
                raw_term=term,
                pos=pos,
                cefr=cefr,
                section=f"Alphabetical list: {term[0].upper()}",
                page=page,
                filename=path.name,
                notes=notes,
            )
        )


def repair_ket_rows(rows: list[dict]) -> list[dict]:
    # These are words visibly split across text objects in the source PDF.
    fragments = {
        (5, "man"),
        (7, "internet."),
        (13, "n"),
        (14, "your right hand"),
        (15, "nt"),
        (15, "so, i think it’s right."),
        (17, "ts"),
    }
    rows = [
        row
        for row in rows
        if (int(row["pdf_page"]), str(row["raw_term"]).casefold()) not in fragments
    ]
    exact_notes = {
        ("download", 7): (
            "examples: I downloaded the songs from the internet. (v); "
            "Can you get these as a download? (n)"
        ),
        ("right", 14): (
            "examples: He swam to the right. (n); your right hand (adj); "
            "That’s the right answer. (adj); Turn right here. (adv)"
        ),
        ("so", 15): (
            "examples: So, I think it’s right. (conj); He ate too much, "
            "so he felt ill. (conj); He wanted to go but he didn’t say so. (adv)"
        ),
    }
    for row in rows:
        key = (str(row["raw_term"]).casefold(), int(row["pdf_page"]))
        if key in exact_notes:
            row["notes"] = exact_notes[key]
    add_reconstructed_rows(
        rows,
        SOURCES["ket_schools"],
        "A2",
        [
            (4, "among", "prep", "rejoined split source text"),
            (5, "businesswoman", "n", "rejoined split source text"),
            (6, "city", "n", "rejoined split source text"),
            (6, "congratulations!", "exclam", "rejoined split source text"),
            (9, "guest-house", "n", "rejoined split source text"),
            (11, "like", "v, prep & adv", "rejoined split source text"),
            (11, "many", "det, adj & pron", "rejoined split source text"),
            (12, "Mrs", "n", "rejoined split source text"),
            (13, "petrol station", "n", "rejoined split source text"),
            (15, "shop assistant", "n", "rejoined split source text"),
            (17, "traffic lights", "n pl", "rejoined split source text"),
        ],
    )
    return sorted(rows, key=lambda row: (int(row["pdf_page"]), str(row["raw_term"]).casefold()))


def repair_b1_rows(rows: list[dict]) -> list[dict]:
    extraction_fragments = {
        (8, "something"),
        (11, "(n) diploma"),
        (12, "recently."),
        (16, "australia."),
        (22, "model."),
        (24, "of the school."),
        (26, "prizes."),
        (30, "late."),
        (30, "same."),
        (34, "exams."),
    }
    rows = [
        row
        for row in rows
        if (
            int(row["pdf_page"]),
            str(row["raw_term"]).casefold(),
        )
        not in extraction_fragments
        and not (
            int(row["pdf_page"]) == 12
            and str(row["raw_term"]).casefold() == "license)"
        )
        and not (
            int(row["pdf_page"]) == 11
            and str(row["raw_term"]).casefold() == "(n) directly"
        )
    ]

    note_suffixes = {
        ("centimetre (cm)", 8): "centimeter)",
        ("kilogramme (kg)", 20): "kilogram)",
        ("kilometre (km)", 20): "kilometer)",
        ("millimetre (mm)", 22): "millimeter)",
        ("petrol station", 25): "station)",
        ("swimming costume", 34): "bathing suit)",
    }
    exact_notes = {
        ("care", 8): (
            "examples: take care of someone (n); "
            "to care (about/for) someone / something (v)"
        ),
        ("drop", 12): (
            "examples: There has been a drop in prices recently. (n); "
            "I almost dropped my cup. (n)"
        ),
        ("grant", 16): "example: He was given a grant to study in Australia. (n)",
        ("model", 22): (
            "examples: It’s cheap because it’s last year’s model. (n); "
            "She’s a fashion model. (n)"
        ),
        ("over", 24): (
            "examples: to be over (finished) (adv); Several birds were flying "
            "over the roof of the school. (prep)"
        ),
        ("present", 26): (
            "examples: to be present (adj); at the present time (adj); "
            "That will be all for the present. (n); I got some lovely birthday "
            "presents. (n); The winners were presented with prizes. (v); "
            "She presents the late-night news. (v)"
        ),
        ("second", 30): (
            "examples: She came second and won silver. (adv); This is the "
            "second time you’ve been late. (det); sixty seconds in a minute (n)"
        ),
        ("same", 30): (
            "examples: at the same time (adj); Your watch is the same as mine. "
            "(pron); You should treat everyone the same. (adv)"
        ),
        ("support", 34): (
            "examples: She gave me a lot of support during my exams. (n); "
            "to support a weight (v); to support a team (v)"
        ),
    }
    for row in rows:
        key = (str(row["raw_term"]), int(row["pdf_page"]))
        folded_key = (str(row["raw_term"]).casefold(), int(row["pdf_page"]))
        if folded_key == ("camera", 11):
            row["raw_term"] = "digital camera"
            row["headword"] = "digital camera"
            row["notes"] = "rejoined split source text"
            key = ("digital camera", 11)
            folded_key = ("digital camera", 11)
        if folded_key in {("digital", 11), ("dinner", 11)}:
            row["notes"] = ""
        if folded_key in exact_notes:
            row["notes"] = exact_notes[folded_key]
        if key in note_suffixes:
            row["notes"] = clean_space(f"{row['notes']} {note_suffixes[key]}")
        if key == ("get down", 15):
            row["notes"] = clean_space(
                f"{row['notes']}; examples: Get down at once! Did you get all the notes down?"
            )
        if key == ("look out", 21):
            row["notes"] = clean_space(f"{row['notes']}; example: Look out!")

    add_reconstructed_rows(
        rows,
        SOURCES["b1_preliminary"],
        "B1",
        [
            (5, "as long as", "phr", "source POS label is phr"),
            (8, "carefully", "adv", "rejoined/truncated source POS text"),
            (11, "direction", "n", "rejoined split source text"),
            (11, "directly", "adv", "rejoined split source text"),
            (11, "dinosaur", "n", "reconstructed from interleaved source text"),
            (11, "diploma", "n", "reconstructed from interleaved source text"),
            (12, "DJ (disc jockey)", "n", "rejoined split source text"),
            (
                12,
                "driver’s licence",
                "n",
                "Br Eng; Am Eng: driver’s license; rejoined split source text",
            ),
            (14, "film star", "", "source line supplies no POS label"),
            (15, "for sale", "phr", "source POS label is phr"),
            (
                21,
                "maths / mathematics",
                "n",
                "Br Eng; Am Eng: math; rejoined split source text",
            ),
            (35, "through", "prep", "rejoined split source text"),
            (36, "truck", "", "Am Eng; Br Eng: lorry; source line supplies no POS label"),
        ],
    )
    return sorted(rows, key=lambda row: (int(row["pdf_page"]), str(row["raw_term"]).casefold()))


def write_tsv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def validate_output(key: str, rows: list[dict]) -> None:
    expected = EXPECTED_OUTPUT_COUNTS[key]
    if len(rows) != expected:
        raise ValueError(f"{key}: expected {expected} rows, found {len(rows)}")
    if any(not str(row["headword"]).strip() for row in rows):
        raise ValueError(f"{key}: blank headword")

    headwords = {str(row["headword"]).casefold() for row in rows}
    required = {
        "oxford_3000": {
            "the",
            "theatre",
            "to",
            "today",
        },
        "ket_schools": {
            "mp3 player",
            "businesswoman",
            "petrol station",
            "traffic lights",
        },
        "b1_preliminary": {
            "digital camera",
            "dinosaur",
            "diploma",
            "driver’s licence",
        },
    }.get(key, set())
    missing = sorted(required - headwords)
    if missing:
        raise ValueError(f"{key}: required reconstructed entries missing: {missing}")

    forbidden = {
        "oxford_3000": {
            "the definite article theatre",
            "to prep., infinitive marker today",
        },
        "ket_schools": {
            "internet.",
            "your right hand",
            "so, i think it’s right.",
        },
        "b1_preliminary": {
            "recently.",
            "australia.",
            "of the school.",
            "prizes.",
            "exams.",
        },
    }.get(key, set())
    leaked = sorted(forbidden & headwords)
    if leaked:
        raise ValueError(f"{key}: wrapped example fragments leaked: {leaked}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for the four extracted TSV files.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, dict] = {}

    for key in ("oxford_3000", "oxford_5000"):
        rows, anomalies = parse_oxford(SOURCES[key])
        validate_output(key, rows)
        write_tsv(output_dir / str(SOURCES[key]["output"]), rows)
        results[key] = {"rows": rows, "anomalies": anomalies}

    rows, anomalies = parse_cambridge(
        SOURCES["ket_schools"], first_page=4, last_page=18, cefr="A2"
    )
    rows = repair_ket_rows(rows)
    validate_output("ket_schools", rows)
    write_tsv(output_dir / str(SOURCES["ket_schools"]["output"]), rows)
    results["ket_schools"] = {"rows": rows, "anomalies": anomalies}

    rows, anomalies = parse_cambridge(
        SOURCES["b1_preliminary"], first_page=4, last_page=40, cefr="B1"
    )
    rows = repair_b1_rows(rows)
    validate_output("b1_preliminary", rows)
    write_tsv(output_dir / str(SOURCES["b1_preliminary"]["output"]), rows)
    results["b1_preliminary"] = {"rows": rows, "anomalies": anomalies}

    for key, result in results.items():
        rows = result["rows"]
        print(
            key,
            "rows=", len(rows),
            "unique_headwords=", len({str(row["headword"]).casefold() for row in rows}),
            "cefr=", dict(Counter(str(row["cefr"]) for row in rows)),
            "anomalies=", len(result["anomalies"]),
        )
        for anomaly in result["anomalies"][:8]:
            print("  ", anomaly)


if __name__ == "__main__":
    main()
