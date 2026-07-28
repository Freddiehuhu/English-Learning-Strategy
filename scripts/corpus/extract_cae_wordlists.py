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
    r"(?P<pos>adv\+adj|adj\+n|idiom|n|np|v|vp|adj|adjp|adv|advp|pp)"
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
    "idiom": "idiom",
}


@dataclass
class Entry:
    raw_term: str
    pos: str
    grammar: str
    source_ref: str
    definition: str
    pdf_page: int


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
                if current:
                    entries.append(current)
                raw_head = clean_line(
                    f"{pending_head} {match.group('head')}"
                    if pending_head
                    else match.group("head")
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
            notes = "; ".join(note for note in (grammar_note, sense_note) if note)
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
        output_path = args.output_dir / f"{pdf_path.stem}.tsv"
        write_tsv(output_path, pdf_path, entries)
        print(f"{pdf_path.name}\t{len(entries)}\t{output_path}")


if __name__ == "__main__":
    main()
