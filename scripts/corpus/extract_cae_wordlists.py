#!/usr/bin/env python3
"""Extract Complete CAE extended wordlist PDFs into auditable TSV files."""

from __future__ import annotations

import argparse
import csv
import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber


ENTRY_RE = re.compile(
    r"^(?P<head>.+?)\s+"
    r"(?P<pos>adv\+adj|adj\+n|v\+adv|idiom|n|np|v|vp|adj|adjp|adv|advp|pp)"
    r"(?:\s+\[(?P<grammar>[^\]]+)\])?\s+"
    r"\((?P<ref>(?:U\d+\s*,\s*)?(?:\d+|RS))\)\s*"
    r"(?P<definition>.*)$",
    re.IGNORECASE,
)

FOOTER_PREFIXES = (
    "Complete CAE by ",
    "Extended wordlist",
    "Phrasal verbs wordlist",
    "Abbreviations:",
    "The numbers indicate",
    "or phrase appears",
    "www.cambridge.org/",
)

POS_LABELS = {
    "n": "noun",
    "np": "noun phrase",
    "v": "verb",
    "vp": "verb phrase",
    "adj": "adjective",
    "adjp": "adjective phrase",
    "adv": "adverb",
    "advp": "adverb phrase",
    "pp": "prepositional phrase",
    "adj+n": "adjective + noun",
    "adv+adj": "adverb + adjective",
    "v+adv": "verb + adverb",
    "idiom": "idiom",
}
EXPECTED_COUNTS = {
    **{
        f"CompleteCAE_WLM_ExtendedUnit{unit:02d}": count
        for unit, count in enumerate(
            (62, 73, 67, 64, 64, 68, 41, 66, 65, 74, 72, 62, 53, 75),
            start=1,
        )
    },
    "CompleteCAE_WLM_PhrasalVerbs": 54,
}


@dataclass
class Entry:
    raw_term: str
    pos: str
    grammar: str
    source_ref: str
    definition: str
    pdf_page: int
    notes: str = ""


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def is_header_or_footer(line: str) -> bool:
    if not line:
        return True
    if line.startswith(FOOTER_PREFIXES):
        return True
    if "Cambridge University Press" in line or "PHOTOCOPIABLE" in line:
        return True
    if re.fullmatch(r"Unit \d+", line):
        return True
    return False


def column_lines(page: pdfplumber.page.Page, page_number: int) -> list[list[str]]:
    top = 116 if page_number == 1 else 24
    bottom = page.height - 24
    midpoint = page.width / 2
    boxes = (
        (16, top, midpoint - 2, bottom),
        (midpoint + 2, top, page.width - 16, bottom),
    )
    columns: list[list[str]] = []
    for box in boxes:
        text = page.crop(box).extract_text(x_tolerance=2, y_tolerance=3) or ""
        columns.append([clean_line(line) for line in text.splitlines()])
    return columns


def parse_page(page: pdfplumber.page.Page, page_number: int) -> list[Entry]:
    entries: list[Entry] = []
    for lines in column_lines(page, page_number):
        current: Entry | None = None
        pending_head = ""
        started = False

        for index, line in enumerate(lines):
            match = ENTRY_RE.match(line)
            if not started and not match:
                continue
            if is_header_or_footer(line):
                continue
            if match:
                started = True
                matched_head = match.group("head")
                if (
                    current
                    and not pending_head
                    and re.fullmatch(r"\d+", matched_head.strip())
                ):
                    previous_sense = re.match(r"^(.*?)\s+\d+$", current.raw_term)
                    if previous_sense:
                        pending_head = previous_sense.group(1)
                if current:
                    entries.append(current)
                raw_head = clean_line(
                    f"{pending_head} {matched_head}"
                    if pending_head
                    else matched_head
                )
                pending_head = ""
                current = Entry(
                    raw_term=raw_head,
                    pos=match.group("pos").lower(),
                    grammar=clean_line(match.group("grammar") or ""),
                    source_ref=clean_line(match.group("ref")),
                    definition=clean_line(match.group("definition")),
                    pdf_page=page_number,
                )
                continue

            next_match = ENTRY_RE.match(lines[index + 1]) if index + 1 < len(lines) else None
            if (
                current
                and next_match
                and re.fullmatch(r"\d+", next_match.group("head").strip())
                and len(line.split()) <= 4
            ):
                entries.append(current)
                current = None
                pending_head = line
                continue

            if current:
                current.definition = clean_line(f"{current.definition} {line}")

        if current:
            entries.append(current)
    return entries


def source_metadata(path: Path) -> tuple[str, str]:
    unit_match = re.search(r"Unit(\d+)", path.stem, re.IGNORECASE)
    if unit_match:
        unit_number = int(unit_match.group(1))
        return f"Complete CAE Extended Unit {unit_number:02d}", f"Unit {unit_number:02d}"
    return "Complete CAE Phrasal Verbs", "Phrasal verbs"


def normalise_headword(raw_term: str) -> tuple[str, str]:
    sense_match = re.match(r"^(.*?)\s+(\d+)$", raw_term)
    if sense_match:
        return sense_match.group(1), f"sense={sense_match.group(2)}"
    return raw_term, ""


def extract_pdf(path: Path) -> list[Entry]:
    entries: list[Entry] = []
    with pdfplumber.open(path) as document:
        for page_number, page in enumerate(document.pages, start=1):
            entries.extend(parse_page(page, page_number))
    return repair_known_wrapped_headwords(path, entries)


def validate_entries(path: Path, entries: list[Entry]) -> None:
    expected_count = EXPECTED_COUNTS.get(path.stem)
    if expected_count is not None and len(entries) != expected_count:
        raise ValueError(
            f"{path.name}: expected {expected_count} entries, found {len(entries)}"
        )

    forbidden_definition_text = (
        "Complete CAE by ",
        "Extended wordlist",
        "Abbreviations:",
        "Cambridge University Press",
        "PHOTOCOPIABLE",
    )
    for entry in entries:
        if not entry.raw_term or not entry.definition:
            raise ValueError(
                f"{path.name}: blank headword or definition on page {entry.pdf_page}"
            )
        leaked = next(
            (
                marker
                for marker in forbidden_definition_text
                if marker in entry.definition
            ),
            "",
        )
        if leaked:
            raise ValueError(
                f"{path.name}: page furniture leaked into {entry.raw_term!r}: {leaked}"
            )

    required_headwords = {
        "CompleteCAE_WLM_ExtendedUnit02": {
            "switch between languages/from one language to another",
            "work tirelessly",
        },
        "CompleteCAE_WLM_ExtendedUnit04": {
            "kill a few birds with one stone (usually to kill two birds with one stone)",
        },
        "CompleteCAE_WLM_ExtendedUnit06": {
            "have an ear for something/have a good ear for something",
        },
        "CompleteCAE_WLM_ExtendedUnit08": {"update 1", "update 2"},
    }.get(path.stem, set())
    observed = {entry.raw_term for entry in entries}
    missing = sorted(required_headwords - observed)
    if missing:
        raise ValueError(
            f"{path.name}: required reconstructed/sense entries missing: {missing}"
        )


def repair_known_wrapped_headwords(path: Path, entries: list[Entry]) -> list[Entry]:
    """Repair three headwords visibly wrapped before their POS label.

    The PDF text layer places the first half of each headword at the end of the
    preceding definition and the second half on the following line. These
    repairs preserve the printed lexical item without trying to infer any new
    vocabulary.
    """

    unit_match = re.search(r"Unit(\d+)", path.stem, re.IGNORECASE)
    if not unit_match:
        return entries
    unit = int(unit_match.group(1))
    repairs = {
        2: {
            "previous": "sweep sth aside",
            "prefix": "switch between languages/from one language to",
            "fragment": "another",
            "headword": "switch between languages/from one language to another",
        },
        4: {
            "previous": "job-sharing",
            "prefix": "kill a few birds with one stone (usually to kill two birds",
            "fragment": "with one stone)",
            "headword": (
                "kill a few birds with one stone "
                "(usually to kill two birds with one stone)"
            ),
        },
        6: {
            "previous": "grin",
            "prefix": "have an ear for something/have a good ear for",
            "fragment": "something",
            "headword": "have an ear for something/have a good ear for something",
        },
    }
    repair = repairs.get(unit)
    if not repair:
        return entries
    if any(
        entry.raw_term.casefold() == repair["headword"].casefold()
        for entry in entries
    ):
        return entries

    previous = next(
        (
            entry
            for entry in entries
            if entry.raw_term.casefold() == repair["previous"].casefold()
        ),
        None,
    )
    fragment = next(
        (
            entry
            for entry in entries
            if entry.raw_term.casefold() == repair["fragment"].casefold()
        ),
        None,
    )
    if not previous or not fragment or repair["prefix"] not in previous.definition:
        raise ValueError(
            f"{path.name}: expected wrapped-headword layout was not found"
        )

    previous.definition = previous.definition.split(repair["prefix"], 1)[0].rstrip()
    fragment_index = entries.index(fragment)
    entries[fragment_index] = Entry(
        raw_term=repair["headword"],
        pos=fragment.pos,
        grammar=fragment.grammar,
        source_ref=fragment.source_ref,
        definition=fragment.definition,
        pdf_page=fragment.pdf_page,
        notes="source layout: wrapped headword reconstructed",
    )
    return entries


def write_tsv(path: Path, pdf_path: Path, entries: list[Entry]) -> None:
    source, section = source_metadata(pdf_path)
    columns = (
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
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, delimiter="\t")
        writer.writeheader()
        for entry in entries:
            headword, sense_note = normalise_headword(entry.raw_term)
            grammar_note = f"grammar={entry.grammar}" if entry.grammar else ""
            notes = "; ".join(
                note for note in (grammar_note, sense_note, entry.notes) if note
            )
            writer.writerow(
                {
                    "source": source,
                    "raw_term": entry.raw_term,
                    "headword": headword,
                    "pos": POS_LABELS.get(entry.pos, entry.pos),
                    "cefr": "C1",
                    "topic_or_section": section,
                    "pdf_page": entry.pdf_page,
                    "source_ref": entry.source_ref,
                    "definition": entry.definition,
                    "notes": notes,
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdfs", nargs="+", type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    for pdf_path in args.pdfs:
        entries = extract_pdf(pdf_path)
        validate_entries(pdf_path, entries)
        output_path = args.output_dir / f"{pdf_path.stem}.tsv"
        write_tsv(output_path, pdf_path, entries)
        print(f"{pdf_path.name}\t{len(entries)}\t{output_path}")


if __name__ == "__main__":
    main()
