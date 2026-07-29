from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "corpus"
    / "extract_edge_docx_wordboxes.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_edge_docx_wordboxes",
    MODULE_PATH,
)
assert SPEC and SPEC.loader
extractor = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = extractor
SPEC.loader.exec_module(extractor)


def document_xml(tables: list[list[list[str]]]) -> str:
    table_xml = []
    for table in tables:
        rows_xml = []
        for row in table:
            cells = "".join(
                (
                    "<w:tc><w:p><w:r><w:t>"
                    f"{value}"
                    "</w:t></w:r></w:p></w:tc>"
                )
                for value in row
            )
            rows_xml.append(f"<w:tr>{cells}</w:tr>")
        table_xml.append(f"<w:tbl>{''.join(rows_xml)}</w:tbl>")
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document '
        'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{''.join(table_xml)}</w:body>"
        "</w:document>"
    )


class EdgeDocxExtractorTests(unittest.TestCase):
    def fixture(self, directory: Path, filename: str) -> Path:
        path = directory / filename
        word_box = [
            ["addictive", "best-selling", "challenging", "classic"],
            ["entertaining", "family-friendly", "multi-player", ""],
        ]
        xml = document_xml(
            [
                word_box,
                [["Marks /7"]],
                word_box,
            ]
        )
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("word/document.xml", xml)
        return path

    def test_extracts_first_occurrence_and_deduplicates_repeated_box(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.fixture(
                Path(directory),
                "Edge_2E_1BU7_Graded_vocabulary_02.docx",
            )
            rows = extractor.extract_wordboxes(path)
        self.assertEqual(len(rows), 7)
        self.assertEqual(rows[0]["headword"], "addictive")
        self.assertEqual(rows[-1]["headword"], "multi-player")
        self.assertEqual(rows[0]["corpus_policy"], "candidate_only")
        self.assertEqual(rows[0]["source_format"], "docx")
        self.assertEqual(
            rows[0]["registry_source_id"],
            "edge-2e-1bu7-vocabulary-adjectives",
        )
        self.assertEqual(rows[0]["locator"], "docx:table=0,row=0,col=0")
        self.assertTrue(all("Marks" not in row["headword"] for row in rows))

    def test_rejects_unknown_docx_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.fixture(Path(directory), "unknown.docx")
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                extractor.extract_wordboxes(path)


if __name__ == "__main__":
    unittest.main()
