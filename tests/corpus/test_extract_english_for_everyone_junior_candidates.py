from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from collections import Counter, defaultdict
from dataclasses import replace
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = (
    REPO_ROOT
    / "scripts"
    / "corpus"
    / "extract_english_for_everyone_junior_candidates.py"
)
BUILDER_PATH = REPO_ROOT / "scripts" / "corpus" / "build_master_corpus.py"
OUTPUT_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "supplementary-input"
    / "english-for-everyone-junior-candidates.tsv"
)
AUDIT_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "supplementary-audits"
    / "english-for-everyone-junior-batch.json"
)
RENDER_EVIDENCE_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "supplementary-render-evidence"
    / "english-for-everyone-junior-beginners.json"
)
REGISTRY_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "supplemental-source-registry.json"
)
INVENTORY_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "supplemental-source-inventory.json"
)
REVIEW_STATUS_PATH = (
    REPO_ROOT / "data" / "ielts-corpus" / "supplementary-review-status.json"
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


extractor = load_module(
    "extract_english_for_everyone_junior_candidates",
    MODULE_PATH,
)
corpus_builder = load_module("efe_test_build_master_corpus", BUILDER_PATH)


def synthetic_xml(*, extra_fragment: str = "", pos_color: str = "#70706e") -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<pdf2xml producer="poppler" version="test">
  <page number="250" height="990" width="829">
    <fontspec id="0" size="20" family="ABCDEF+JuliusPrimaryStd" color="#1c1c1b"/>
    <fontspec id="1" size="20" family="ABCDEF+JuliusPrimaryStd" color="{pos_color}"/>
    <fontspec id="2" size="18" family="ABCDEF+MundoSansPro-Medium" color="#7c7c7b"/>
    <fontspec id="3" size="53" family="ABCDEF+JuliusPrimaryStd" color="#1c1c1b"/>
    <text top="30" left="54" width="170" height="59" font="3">Word list</text>
    <text top="100" left="54" width="72" height="22" font="0">moon, the</text>
    <text top="99" left="126" width="29" height="22" font="1"><i> n </i></text>
    <text top="99" left="155" width="20" height="21" font="2">18</text>
    <text top="125" left="54" width="40" height="22" font="0">what?</text>
    <text top="124" left="94" width="38" height="22" font="1"><i> int </i></text>
    <text top="124" left="132" width="38" height="21" font="2">1, G6</text>
    <text top="150" left="54" width="22" height="22" font="0">big</text>
    <text top="149" left="76" width="42" height="22" font="1"><i> adj </i></text>
    <text top="150" left="118" width="5" height="22" font="0">1</text>
    <text top="149" left="124" width="38" height="21" font="2">0, 21</text>
    <text top="200" left="54" width="21" height="22" font="1"><i>adj</i></text>
    <text top="201" left="75" width="93" height="22" font="0">adjective</text>
    {extra_fragment}
  </page>
</pdf2xml>
"""


def read_committed_rows() -> list[dict[str, str]]:
    with OUTPUT_PATH.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


class EnglishForEveryoneJuniorExtractorTests(unittest.TestCase):
    def test_synthetic_layout_keeps_only_explicit_entries(self):
        entries = extractor.parse_word_list_xml(
            synthetic_xml(),
            enforce_source_gates=False,
        )
        self.assertEqual([entry.raw_term for entry in entries], [
            "moon, the",
            "what?",
            "big",
        ])
        self.assertEqual(entries[0].headword, "the moon")
        self.assertEqual(entries[1].raw_term, "what?")
        self.assertEqual(entries[1].headword, "what")
        self.assertEqual(entries[1].pos_code, "int")
        self.assertEqual(entries[1].pos, "question word")
        self.assertEqual(entries[2].printed_locators, ("10", "21"))
        self.assertEqual(
            entries[2].locator_fragment_texts,
            ("1", "0, 21"),
        )

    def test_unassigned_word_list_font_fragment_fails_closed(self):
        extra = (
            '<text top="250" left="54" width="120" height="22" '
            'font="0">unreviewed fragment</text>'
        )
        with self.assertRaisesRegex(ValueError, "unassigned"):
            extractor.parse_word_list_xml(
                synthetic_xml(extra_fragment=extra),
                enforce_source_gates=False,
            )

    def test_changed_pos_font_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "unassigned"):
            extractor.parse_word_list_xml(
                synthetic_xml(pos_color="#1c1c1b"),
                enforce_source_gates=False,
            )

    def test_changed_page_dimensions_or_column_start_fail_closed(self):
        changed_width = synthetic_xml().replace(
            'height="990" width="829"',
            'height="990" width="830"',
        )
        with self.assertRaisesRegex(ValueError, "dimensions"):
            extractor.parse_word_list_xml(
                changed_width,
                enforce_source_gates=False,
            )
        shifted_headword = synthetic_xml().replace(
            '<text top="100" left="54"',
            '<text top="100" left="60"',
        )
        with self.assertRaisesRegex(ValueError, "shifted headword column"):
            extractor.parse_word_list_xml(
                shifted_headword,
                enforce_source_gates=False,
            )

    def test_ordered_sequence_gate_catches_equal_count_noise_replacement(self):
        entries = extractor.parse_word_list_xml(
            synthetic_xml(),
            enforce_source_gates=False,
        )
        expected = extractor.entry_sequence_sha256(entries)
        extractor.validate_entry_sequence(
            entries,
            expected_sha256=expected,
        )

        mutated = list(entries)
        mutated[0] = replace(
            mutated[0],
            raw_term="moon noise",
        )
        self.assertEqual(len(mutated), len(entries))
        self.assertEqual(
            Counter(entry.pos for entry in mutated),
            Counter(entry.pos for entry in entries),
        )
        with self.assertRaisesRegex(ValueError, "ordered entry sequence"):
            extractor.validate_entry_sequence(
                mutated,
                expected_sha256=expected,
            )

    def test_private_use_glyph_and_out_of_range_locator_are_rejected(self):
        private_glyph = synthetic_xml().replace("moon, the", "moon\ue055")
        with self.assertRaisesRegex(ValueError, "private-use"):
            extractor.parse_word_list_xml(
                private_glyph,
                enforce_source_gates=False,
            )
        invalid_locator = synthetic_xml().replace(">18</text>", ">26</text>")
        with self.assertRaisesRegex(ValueError, "out of range"):
            extractor.parse_word_list_xml(
                invalid_locator,
                enforce_source_gates=False,
            )

    def test_registry_profile_is_exact_and_path_free(self):
        source = extractor.load_registry(REGISTRY_PATH)
        self.assertEqual(source.id, extractor.SOURCE_ID)
        self.assertEqual(source.expected_sha256, extractor.EXPECTED_SHA256)
        self.assertEqual(source.expected_byte_size, 111_955_857)
        self.assertEqual(source.source_role, "lexical_candidate")
        self.assertEqual(source.corpus_policy, "candidate_only")
        self.assertEqual(source.source_format, "pdf")

        with tempfile.TemporaryDirectory() as directory:
            altered = Path(directory) / "registry.json"
            payload = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
            for item in payload["sources"]:
                if item["id"] == extractor.SOURCE_ID:
                    item["expected_sha256"] = "0" * 64
            altered.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "profile mismatch"):
                extractor.load_registry(altered)

    def test_source_verifier_requires_size_sha256_and_page_count(self):
        source = extractor.load_registry(REGISTRY_PATH)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wrong_size = root / "source-a"
            wrong_size.write_bytes(b"x")
            with self.assertRaisesRegex(ValueError, "byte size mismatch"):
                extractor.verify_source(
                    wrong_size,
                    source,
                    pdfinfo="pdfinfo",
                )

            exact_size = root / "source-b"
            with exact_size.open("wb") as handle:
                handle.seek(extractor.EXPECTED_BYTE_SIZE - 1)
                handle.write(b"\0")
            with mock.patch.object(
                extractor,
                "sha256_file",
                return_value="0" * 64,
            ):
                with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                    extractor.verify_source(
                        exact_size,
                        source,
                        pdfinfo="pdfinfo",
                    )
            with mock.patch.object(
                extractor,
                "sha256_file",
                return_value=extractor.EXPECTED_SHA256,
            ), mock.patch.object(
                extractor,
                "pdf_page_count",
                return_value=255,
            ):
                with self.assertRaisesRegex(ValueError, "expected 256"):
                    extractor.verify_source(
                        exact_size,
                        source,
                        pdfinfo="pdfinfo",
                    )

    def test_committed_batch_locks_counts_pos_and_normalization(self):
        rows = read_committed_rows()
        self.assertEqual(len(rows), 515)
        self.assertEqual(
            dict(sorted(Counter(int(row["pdf_page"]) for row in rows).items())),
            extractor.EXPECTED_PAGE_ROW_COUNTS,
        )
        self.assertEqual(
            dict(sorted(Counter(row["pos"] for row in rows).items())),
            extractor.EXPECTED_POS_COUNTS,
        )
        normalized = {
            corpus_builder.normalise_key(row["headword"]) for row in rows
        }
        self.assertEqual(len(normalized), 504)

        aliases = {
            row["raw_term"]: row["headword"]
            for row in rows
            if row["raw_term"] != row["headword"]
        }
        self.assertEqual(
            aliases,
            {
                **extractor.INVERTED_HEADWORDS,
                **extractor.QUESTION_WORD_HEADWORD_REPAIRS,
            },
        )
        self.assertEqual(len(extractor.INVERTED_HEADWORDS), 5)

    def test_committed_question_forms_preserve_print_and_teaching_policy(self):
        rows = read_committed_rows()
        question_words = {
            row["raw_term"]: row
            for row in rows
            if row["pos"] == "question word"
        }
        self.assertEqual(
            set(question_words),
            extractor.EXPECTED_QUESTION_WORD_RAW_TERMS,
        )
        self.assertEqual(
            {
                raw_term: row["headword"]
                for raw_term, row in question_words.items()
            },
            {
                raw_term: extractor.QUESTION_WORD_HEADWORD_REPAIRS.get(
                    raw_term,
                    raw_term,
                )
                for raw_term in extractor.EXPECTED_QUESTION_WORD_RAW_TERMS
            },
        )
        self.assertEqual(question_words["pardon?"]["headword"], "pardon?")

        expression_questions = {
            row["raw_term"]: row["headword"]
            for row in rows
            if row["pos"] == "expression" and row["raw_term"].endswith("?")
        }
        self.assertEqual(
            expression_questions,
            {
                raw_term: raw_term
                for raw_term in extractor.EXPECTED_EXPRESSION_QUESTION_FORMS
            },
        )
        self.assertNotIn("unspecified", {row["pos"] for row in rows})
        self.assertNotIn("interjection", {row["pos"] for row in rows})
        for source_label in ("question word", "expression"):
            canonical = set(corpus_builder.canonical_pos(source_label))
            self.assertNotIn("unspecified", canonical)
            self.assertNotIn("exclamation", canonical)

    def test_committed_weekdays_keep_printed_noun_and_hit_proper_noun_gate(self):
        rows = read_committed_rows()
        expected = {
            "Friday": (
                "Friday",
                "noun",
                "251",
                "pdf:page=251;section=word-list;column=3;entry=88;"
                "printed-locators=25",
            ),
            "Monday": (
                "Monday",
                "noun",
                "253",
                "pdf:page=253;section=word-list;column=1;entry=4;"
                "printed-locators=25",
            ),
            "Saturday": (
                "Saturday",
                "noun",
                "254",
                "pdf:page=254;section=word-list;column=1;entry=10;"
                "printed-locators=25",
            ),
            "Sunday": (
                "Sunday",
                "noun",
                "254",
                "pdf:page=254;section=word-list;column=2;entry=57;"
                "printed-locators=25",
            ),
            "Thursday": (
                "Thursday",
                "noun",
                "254",
                "pdf:page=254;section=word-list;column=3;entry=89;"
                "printed-locators=25",
            ),
            "Tuesday": (
                "Tuesday",
                "noun",
                "255",
                "pdf:page=255;section=word-list;column=1;entry=6;"
                "printed-locators=25",
            ),
            "Wednesday": (
                "Wednesday",
                "noun",
                "255",
                "pdf:page=255;section=word-list;column=2;entry=28;"
                "printed-locators=25",
            ),
        }
        weekday_rows = {
            row["raw_term"]: (
                row["headword"],
                row["pos"],
                row["pdf_page"],
                row["locator"],
            )
            for row in rows
            if row["raw_term"] in extractor.DAYS_OF_WEEK
        }
        self.assertEqual(weekday_rows, expected)

        source_rows = corpus_builder.read_tsv(OUTPUT_PATH)
        builder_weekdays = {
            row.raw_term: row
            for row in source_rows
            if row.raw_term in extractor.DAYS_OF_WEEK
        }
        self.assertEqual(set(builder_weekdays), set(extractor.DAYS_OF_WEEK))
        for weekday, row in builder_weekdays.items():
            with self.subTest(weekday=weekday):
                entry = corpus_builder.build_entry(
                    corpus_builder.EntryGroup(
                        corpus_builder.normalise_key(weekday),
                        [row],
                    )
                )
                self.assertEqual(entry["status"], "excluded_proper_noun")
                self.assertTrue(
                    entry["review_flags"]["proper_noun_sense_candidate"]
                )

    def test_committed_batch_locks_numeric_repairs_and_multi_pos_groups(self):
        rows = read_committed_rows()
        by_page_term = {
            (int(row["pdf_page"]), row["raw_term"]): row for row in rows
        }
        self.assertTrue(
            by_page_term[(250, "big")]["locator"].endswith(
                "printed-locators=10,21"
            )
        )
        self.assertTrue(
            by_page_term[(252, "go home")]["locator"].endswith(
                "printed-locators=25"
            )
        )
        self.assertTrue(
            by_page_term[(250, "be (is/are)")]["locator"].endswith(
                "printed-locators=1,4,5,6,9,15,21,22,25,G1"
            )
        )
        self.assertTrue(
            by_page_term[(253, "play a musical instrument")]["locator"].endswith(
                "printed-locators=19"
            )
        )

        positions: dict[str, set[str]] = defaultdict(set)
        for row in rows:
            positions[corpus_builder.normalise_key(row["headword"])].add(
                row["pos"]
            )
        multi_pos = {
            key: value for key, value in positions.items() if len(value) > 1
        }
        self.assertEqual(multi_pos, extractor.EXPECTED_MULTI_POS)
        self.assertEqual(len(extractor.EXPECTED_MULTI_FRAGMENT_LOCATORS), 7)
        self.assertEqual(len(extractor.EXPECTED_NUMERIC_FRAGMENT_REPAIRS), 2)
        self.assertTrue(
            set(extractor.EXPECTED_NUMERIC_FRAGMENT_REPAIRS).issubset(
                extractor.EXPECTED_MULTI_FRAGMENT_LOCATORS
            )
        )

    def test_committed_rows_enforce_policy_copyright_and_privacy_boundary(self):
        rows = read_committed_rows()
        self.assertEqual(tuple(rows[0]), extractor.OUTPUT_COLUMNS)
        self.assertTrue(all(row["definition"] == "" for row in rows))
        self.assertTrue(all(row["cefr"] == "" for row in rows))
        self.assertTrue(
            all(row["topic_or_section"] == "Alphabetical Word list" for row in rows)
        )
        self.assertTrue(all(row["notes"] == extractor.ROW_NOTE for row in rows))
        self.assertTrue(
            all(row["source_role"] == "lexical_candidate" for row in rows)
        )
        self.assertTrue(
            all(row["corpus_policy"] == "candidate_only" for row in rows)
        )
        self.assertTrue(all(row["source_format"] == "pdf" for row in rows))
        self.assertTrue(
            all(
                row["source_ref"] == f"registry:{extractor.SOURCE_ID}"
                for row in rows
            )
        )
        self.assertTrue(
            all(
                re.fullmatch(
                    r"pdf:page=25[0-5];section=word-list;column=[1-3];"
                    r"entry=\d+;printed-locators=(?:G?\d{1,2})(?:,G?\d{1,2})*",
                    row["locator"],
                )
                for row in rows
            )
        )
        serialized = "\n".join("\t".join(row.values()) for row in rows)
        for forbidden in ("/Users/", "Downloads/", "z-lib.org", ".pdf"):
            self.assertNotIn(forbidden, serialized)

    def test_audit_binds_source_and_candidate_digests(self):
        rows = read_committed_rows()
        audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
        source = audit["sources"][0]
        self.assertEqual(audit["schema_version"], 1)
        self.assertEqual(source["id"], extractor.SOURCE_ID)
        self.assertEqual(source["source_sha256"], extractor.EXPECTED_SHA256)
        self.assertEqual(source["source_byte_size"], 111_955_857)
        self.assertEqual(source["source_page_count"], 256)
        self.assertEqual(source["provenance_schema_version"], 1)
        self.assertEqual(source["extracted_row_count"], len(rows))
        self.assertEqual(source["candidate_tsv_row_count"], len(rows))
        self.assertEqual(
            source["candidate_tsv_byte_size"],
            OUTPUT_PATH.stat().st_size,
        )
        self.assertEqual(
            source["candidate_tsv_source_counts"],
            {extractor.SOURCE_ID: len(rows)},
        )
        self.assertEqual(source["normalized_key_count"], 504)
        self.assertEqual(source["pages_parsed"], [250, 251, 252, 253, 254, 255])
        self.assertEqual(
            source["candidate_tsv_sha256"],
            hashlib.sha256(OUTPUT_PATH.read_bytes()).hexdigest(),
        )
        self.assertEqual(
            source["render_manifest_sha256"],
            hashlib.sha256(RENDER_EVIDENCE_PATH.read_bytes()).hexdigest(),
        )
        self.assertFalse(source["editorial_review_complete"])
        self.assertEqual(
            source["status"],
            "candidate_extracted_needs_editorial_review",
        )

    def test_render_evidence_binds_all_six_reviewed_pages(self):
        manifest = json.loads(
            RENDER_EVIDENCE_PATH.read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["source_id"], extractor.SOURCE_ID)
        self.assertEqual(manifest["source_sha256"], extractor.EXPECTED_SHA256)
        self.assertEqual(manifest["source_page_count"], 256)
        self.assertEqual(
            [entry["page"] for entry in manifest["rendered_pages"]],
            [250, 251, 252, 253, 254, 255],
        )
        self.assertTrue(
            all(
                re.fullmatch(r"[0-9a-f]{64}", entry["sha256"])
                for entry in manifest["rendered_pages"]
            )
        )
        self.assertEqual(
            extractor.render_manifest_sha256(
                RENDER_EVIDENCE_PATH,
                source_sha256=extractor.EXPECTED_SHA256,
            ),
            hashlib.sha256(RENDER_EVIDENCE_PATH.read_bytes()).hexdigest(),
        )

    def test_render_evidence_profile_and_exact_page_set_fail_closed(self):
        payload = json.loads(RENDER_EVIDENCE_PATH.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as directory:
            render_path = Path(directory) / "render.json"
            for mutation, message in (
                ({**payload, "source_sha256": "0" * 64}, "profile mismatch"),
                (
                    {
                        **payload,
                        "rendered_pages": payload["rendered_pages"][:-1],
                    },
                    "cover pages 250-255 exactly",
                ),
            ):
                with self.subTest(message=message):
                    render_path.write_text(
                        json.dumps(mutation),
                        encoding="utf-8",
                    )
                    with self.assertRaisesRegex(ValueError, message):
                        extractor.render_manifest_sha256(
                            render_path,
                            source_sha256=extractor.EXPECTED_SHA256,
                        )

    def test_review_ledger_binds_audit_tsv_and_render_evidence(self):
        payload = json.loads(REVIEW_STATUS_PATH.read_text(encoding="utf-8"))
        source = next(
            item
            for item in payload["sources"]
            if item["id"] == extractor.SOURCE_ID
        )
        self.assertEqual(
            source["review_status"],
            "candidate_extracted_needs_editorial_review",
        )
        self.assertEqual(source["extracted_row_count"], 515)
        self.assertEqual(source["audit_source_sha256"], extractor.EXPECTED_SHA256)
        self.assertEqual(
            source["candidate_tsv_sha256"],
            hashlib.sha256(OUTPUT_PATH.read_bytes()).hexdigest(),
        )
        self.assertEqual(
            source["completion_evidence"]["rendered_page_numbers"],
            [250, 251, 252, 253, 254, 255],
        )
        self.assertFalse(source["fully_evaluated"])

    def test_inventory_page_count_and_hash_match_extractor_profile(self):
        inventory = json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))
        source = next(
            item
            for item in inventory["sources"]
            if item["id"] == extractor.SOURCE_ID
        )
        self.assertEqual(source["status"], "ok")
        self.assertEqual(source["sha256"], extractor.EXPECTED_SHA256)
        self.assertEqual(source["byte_size"], extractor.EXPECTED_BYTE_SIZE)
        self.assertEqual(source["metadata"]["page_count"], 256)
        self.assertEqual(source["text_route"]["route"], "pdf_native_text")


if __name__ == "__main__":
    unittest.main()
