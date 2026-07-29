from __future__ import annotations

import csv
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "corpus"
    / "extract_edge_vocabulary_pdfs.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_edge_vocabulary_pdfs",
    MODULE_PATH,
)
assert SPEC and SPEC.loader
extractor = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = extractor
SPEC.loader.exec_module(extractor)


EXPECTED_STATS = {
    "edge-vocabulary-book-1a": (140, 139, 1),
    "edge-vocabulary-book-1b": (177, 175, 2),
    "edge-vocabulary-booster-2a": (134, 134, 0),
    "edge-vocabulary-booster-2b": (168, 168, 0),
    "edge-vocabulary-booster-3a": (179, 179, 0),
    "edge-vocabulary-3b": (162, 162, 0),
}


class EdgePdfExtractorTests(unittest.TestCase):
    def test_rows_are_fail_closed_candidate_evidence(self):
        rows = extractor.build_rows()
        self.assertEqual(len(rows), 960)
        self.assertEqual(
            {row["registry_source_id"] for row in rows},
            set(EXPECTED_STATS),
        )
        for row in rows:
            self.assertEqual(row["source_role"], "lexical_candidate")
            self.assertEqual(row["corpus_policy"], "candidate_only")
            self.assertEqual(row["source_format"], "pdf")
            self.assertEqual(row["definition"], "")
            self.assertIn("visible-even-pages-only", row["notes"])
            self.assertIn("source-missing-alternate-pages", row["notes"])
            self.assertIn(
                "scope=visible-even-pages-only",
                row["locator"],
            )
            self.assertIn(
                "source-missing-alternate-pages=true",
                row["locator"],
            )
            self.assertNotRegex(row["headword"], r"[\u3400-\u9fff]")
            self.assertNotIn("/Users/", row["source_ref"])

    def test_counts_and_visible_page_allowlist_are_stable(self):
        rows = extractor.build_rows()
        stats = extractor.source_statistics(rows)
        actual = {
            source_id: (
                values["extracted_row_count"],
                values["unique_normalized_term_count"],
                values["duplicate_evidence_row_count"],
            )
            for source_id, values in stats.items()
        }
        self.assertEqual(actual, EXPECTED_STATS)
        for row in rows:
            profile = extractor.PROFILES[row["registry_source_id"]]
            self.assertIn(int(row["pdf_page"]), profile.pages_parsed)

    def test_audit_never_claims_complete(self):
        rows = extractor.build_rows()
        audit = extractor.build_audit(
            rows,
            Path(
                "data/ielts-corpus/supplementary-input/"
                "edge-pdf-candidates.tsv"
            ),
        )
        self.assertEqual(audit["schema_version"], 1)
        self.assertEqual(len(audit["sources"]), 6)
        self.assertEqual(
            audit["scope"]["source_limitation"],
            "visible-even-pages-only; source-missing-alternate-pages",
        )
        for source in audit["sources"]:
            self.assertEqual(
                source["status"],
                "candidate_extracted_source_pages_missing",
            )
            self.assertGreater(source["extracted_row_count"], 0)
            self.assertTrue(source["pages_parsed"])
            self.assertTrue(source["visual_sample_pages"])
            self.assertIn("no definitions", source["rights_boundary"])

    def test_writers_emit_public_safe_tsv_and_json(self):
        rows = extractor.build_rows()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tsv_path = root / "edge.tsv"
            audit_path = root / "audit.json"
            extractor.write_tsv(tsv_path, rows)
            extractor.write_audit(audit_path, rows, tsv_path)
            with tsv_path.open(encoding="utf-8", newline="") as handle:
                written = list(csv.DictReader(handle, delimiter="\t"))
            audit = json.loads(audit_path.read_text(encoding="utf-8"))
        self.assertEqual(len(written), 960)
        self.assertEqual(written[0]["definition"], "")
        self.assertEqual(audit["schema_version"], 1)
        self.assertNotIn("/Users/", json.dumps(audit))

    def test_unknown_source_fingerprint_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "unknown.pdf"
            path.write_bytes(b"not an Edge PDF")
            with self.assertRaisesRegex(ValueError, "Unrecognised"):
                extractor.verify_sources([path])


if __name__ == "__main__":
    unittest.main()
