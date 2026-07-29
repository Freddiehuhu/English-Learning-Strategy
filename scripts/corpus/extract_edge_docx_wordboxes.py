#!/usr/bin/env python3
"""Extract the repeated vocabulary word boxes from two Edge Unit 7 DOCX files.

Only the word-box cells are exported. Exercise instructions, answers and marks
are intentionally ignored. The printed inflected form is preserved for teacher
review instead of being silently converted to a lemma.
"""

from __future__ import annotations

import argparse
import csv
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree


WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": WORD_NAMESPACE}
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


@dataclass(frozen=True)
class EdgeDocumentProfile:
    source: str
    registry_source_id: str
    topic: str
    part_of_speech: str


PROFILES = {
    "Edge_2E_1BU7_Graded_vocabulary_01.docx": EdgeDocumentProfile(
        source="Edge 2E 1B Unit 7 Vocabulary 1",
        registry_source_id="edge-2e-1bu7-vocabulary-moves",
        topic="Moves in games",
        part_of_speech="verb phrase",
    ),
    "Edge_2E_1BU7_Graded_vocabulary_02.docx": EdgeDocumentProfile(
        source="Edge 2E 1B Unit 7 Vocabulary 2",
        registry_source_id="edge-2e-1bu7-vocabulary-adjectives",
        topic="Adjectives to describe games",
        part_of_speech="adjective",
    ),
}


def clean_cell_text(cell: ElementTree.Element) -> str:
    text = "".join(
        node.text or ""
        for node in cell.findall(".//w:t", NS)
    )
    return re.sub(r"\s+", " ", text).strip()


def is_word_box(table_rows: list[list[str]]) -> bool:
    populated = [value for row in table_rows for value in row if value]
    if len(populated) < 5:
        return False
    if any("marks" in value.casefold() for value in populated):
        return False
    return all(
        re.fullmatch(r"[A-Za-z][A-Za-z' -]*", value) is not None
        for value in populated
    )


def extract_wordboxes(path: Path) -> list[dict[str, str]]:
    try:
        profile = PROFILES[path.name]
    except KeyError as error:
        raise ValueError(
            f"Unsupported Edge vocabulary file: {path.name}"
        ) from error

    with zipfile.ZipFile(path) as archive:
        document_xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(document_xml)

    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for table_index, table in enumerate(root.findall(".//w:tbl", NS)):
        table_rows: list[list[str]] = []
        table_cells: list[list[ElementTree.Element]] = []
        for row in table.findall("./w:tr", NS):
            cells = row.findall("./w:tc", NS)
            table_cells.append(cells)
            table_rows.append([clean_cell_text(cell) for cell in cells])
        if not is_word_box(table_rows):
            continue
        for row_index, cells in enumerate(table_cells):
            for column_index, cell in enumerate(cells):
                raw_term = clean_cell_text(cell)
                key = raw_term.casefold()
                if not raw_term or key in seen:
                    continue
                seen.add(key)
                rows.append(
                    {
                        "source": profile.source,
                        "registry_source_id": profile.registry_source_id,
                        "raw_term": raw_term,
                        "headword": raw_term,
                        "pos": profile.part_of_speech,
                        "cefr": "",
                        "topic_or_section": profile.topic,
                        "pdf_page": "",
                        "source_ref": path.name,
                        "definition": "",
                        "notes": (
                            "Printed form preserved; lemma review required "
                            "before target promotion."
                        ),
                        "source_role": "lexical_candidate",
                        "corpus_policy": "candidate_only",
                        "source_format": "docx",
                        "locator": (
                            f"docx:table={table_index},row={row_index},"
                            f"col={column_index}"
                        ),
                    }
                )
    if len(rows) != 7:
        raise ValueError(
            f"{path.name}: expected 7 unique word-box items, found {len(rows)}"
        )
    return rows


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("docx_files", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    rows = [
        row
        for path in args.docx_files
        for row in extract_wordboxes(path)
    ]
    write_tsv(args.output, rows)
    print(f"Wrote {len(rows)} candidate rows to {args.output}")


if __name__ == "__main__":
    main()
