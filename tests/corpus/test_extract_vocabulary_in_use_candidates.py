from __future__ import annotations

import csv
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = (
    REPO_ROOT
    / "scripts"
    / "corpus"
    / "extract_vocabulary_in_use_candidates.py"
)
OUTPUT_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "supplementary-input"
    / "vocabulary-in-use-candidates.tsv"
)
AUDIT_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "supplementary-audits"
    / "vocabulary-in-use-batch.json"
)

SPEC = importlib.util.spec_from_file_location(
    "extract_vocabulary_in_use_candidates",
    MODULE_PATH,
)
assert SPEC and SPEC.loader
extractor = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = extractor
SPEC.loader.exec_module(extractor)


def fixture_profile():
    return extractor.SourceProfile(
        registry_source_id="fixture-vocabulary-index",
        display_name="Fixture Vocabulary Index",
        sha256="0" * 64,
        byte_size=1,
        index_first_page=1,
        index_last_page=1,
        max_unit=100,
        cefr="B1",
        first_page_body_top=70,
        regular_page_body_top=70,
        column_starts=(100, 400, 700),
        black_colors=frozenset({"#000000"}),
        min_candidates=0,
        max_candidates=100,
        required_headwords=(),
    )


def synthetic_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<pdf2xml>
  <page number="1" height="1000" width="900">
    <fontspec id="0" size="17" family="SourceSansPro" color="#000000"/>
    <fontspec id="1" size="17" family="Times-PhoneticIPA" color="#00a3ad"/>
    <text top="100" left="100" font="0">accept [say yes]</text>
    <text top="104" left="220" font="1">/əkˈsept/</text>
    <text top="100" left="320" font="0">1, 2</text>
    <text top="130" left="100" font="0">accept [receive]</text>
    <text top="134" left="220" font="1">/əkˈsept/</text>
    <text top="130" left="320" font="0">3</text>
    <text top="160" left="100" font="0">book v</text>
    <text top="164" left="190" font="1">/bʊk/</text>
    <text top="160" left="300" font="0">4</text>
    <text top="190" left="100" font="0">do/work /</text>
    <text top="194" left="210" font="1">/duː wɜːk/</text>
    <text top="190" left="320" font="0">5</text>
    <text top="850" left="100" font="0">carry across columns</text>
    <text top="100" left="400" font="0">6</text>
  </page>
</pdf2xml>
"""


class VocabularyInUseExtractorTests(unittest.TestCase):
    def test_extracts_only_headwords_and_merges_duplicate_senses(self):
        result = extractor.extract_candidates_from_xml(
            synthetic_xml(),
            fixture_profile(),
            enforce_profile_gates=False,
        )
        by_headword = {row["headword"]: row for row in result.rows}

        self.assertEqual(len(result.rows), 4)
        self.assertEqual(result.raw_entry_count, 5)
        self.assertEqual(result.duplicate_entry_count, 1)
        self.assertEqual(result.rejected, [])
        self.assertEqual(
            by_headword["accept"]["locator"],
            "pdf:index;pdf_pages=1;units=1,2,3",
        )
        self.assertEqual(by_headword["book"]["pos"], "verb")
        self.assertIn("do/work", by_headword)
        self.assertIn("carry across columns", by_headword)
        self.assertTrue(
            all(row["definition"] == "" for row in result.rows)
        )
        self.assertTrue(
            all(row["corpus_policy"] == "candidate_only" for row in result.rows)
        )
        self.assertTrue(
            all("[" not in row["headword"] for row in result.rows)
        )

    def test_rejects_unmapped_private_use_glyph_instead_of_guessing(self):
        headword, positions, reason = extractor.clean_headword("bad\ue055word")
        self.assertEqual(headword, "bad\ue055word")
        self.assertEqual(positions, [])
        self.assertEqual(reason, "unmapped_private_use_glyph")

    def test_preserves_internal_slashes_but_removes_pronunciation_slash_tokens(self):
        headword, _, reason = extractor.clean_headword(
            "businessman/woman / /"
        )
        self.assertEqual(headword, "businessman/woman")
        self.assertIsNone(reason)

    def test_position_parser_does_not_read_the_n_in_and_as_a_noun(self):
        headword, positions, reason = extractor.clean_headword(
            "ambush (n. and v.)"
        )
        self.assertEqual(headword, "ambush")
        self.assertEqual(positions, ["noun", "verb"])
        self.assertIsNone(reason)

    def test_rejects_unregistered_pdf_before_reading_layout(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "unknown.pdf"
            path.write_bytes(b"x")
            with self.assertRaisesRegex(ValueError, "Unregistered PDF"):
                extractor.identify_profile(path)

    def test_committed_batch_is_candidate_only_and_audit_counts_match(self):
        with OUTPUT_PATH.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle, delimiter="\t"))
        audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))

        self.assertEqual(len(rows), 10_638)
        self.assertTrue(all(row["definition"] == "" for row in rows))
        self.assertTrue(
            all(row["source_role"] == "lexical_candidate" for row in rows)
        )
        self.assertTrue(
            all(row["corpus_policy"] == "candidate_only" for row in rows)
        )
        self.assertTrue(all(row["source_format"] == "pdf" for row in rows))
        self.assertFalse(
            any(
                private_text in "\t".join(row.values())
                for row in rows
                for private_text in ("/Users/", "z-lib.org", "Freddie&Nelson")
            )
        )

        counts: dict[str, int] = {}
        for row in rows:
            source_id = row["registry_source_id"]
            counts[source_id] = counts.get(source_id, 0) + 1
        audited_counts = {
            source["id"]: source["extracted_row_count"]
            for source in audit["sources"]
        }
        self.assertEqual(audit["schema_version"], 1)
        self.assertEqual(counts, audited_counts)
        self.assertTrue(
            all(
                source["status"]
                == "candidate_extracted_needs_editorial_review"
                for source in audit["sources"]
            )
        )


if __name__ == "__main__":
    unittest.main()
