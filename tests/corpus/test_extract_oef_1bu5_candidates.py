from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = (
    REPO_ROOT / "scripts" / "corpus" / "extract_oef_1bu5_candidates.py"
)
STATUS_BUILDER_PATH = (
    REPO_ROOT / "scripts" / "corpus" / "build_supplementary_review_status.py"
)
OUTPUT_PATH = (
    REPO_ROOT
    / "data/ielts-corpus/supplementary-input/oef-1bu5-candidates.tsv"
)
AUDIT_PATH = (
    REPO_ROOT / "data/ielts-corpus/supplementary-audits/oef-1bu5-batch.json"
)
RENDER_PATH = (
    REPO_ROOT
    / "data/ielts-corpus/supplementary-render-evidence/"
    "oef-1bu5-vocabulary-writing-book.json"
)
INVENTORY_PATH = (
    REPO_ROOT / "data/ielts-corpus/supplemental-source-inventory.json"
)
REVIEW_STATUS_PATH = (
    REPO_ROOT / "data/ielts-corpus/supplementary-review-status.json"
)
CATALOG_PATH = REPO_ROOT / "public/ielts/corpus/catalog.json"
CURATED_PATH = (
    REPO_ROOT
    / "data/ielts-corpus/supplementary-input/curated-native-candidates.tsv"
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


extractor = load_module("extract_oef_1bu5_candidates", MODULE_PATH)
status_builder = load_module(
    "oef_test_build_supplementary_review_status",
    STATUS_BUILDER_PATH,
)


def read_rows(path: Path = OUTPUT_PATH) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


class OefFullSourceCandidateTests(unittest.TestCase):
    def test_registry_inventory_profile_is_exact(self):
        inventory = json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))
        source = next(
            item for item in inventory["sources"] if item["id"] == extractor.SOURCE_ID
        )
        self.assertEqual(source["sha256"], extractor.EXPECTED_SOURCE_SHA256)
        self.assertEqual(source["byte_size"], 1_278_408)
        self.assertEqual(source["metadata"]["page_count"], 8)
        self.assertEqual(source["source_role"], "lexical_candidate")
        self.assertEqual(source["corpus_policy"], "candidate_only")

    def test_editorial_map_covers_all_explicit_occurrences_and_zero_pages(self):
        occurrences = extractor.EXPECTED_OCCURRENCES
        self.assertEqual(len(occurrences), 46)
        self.assertEqual(
            Counter(str(target.page) for target in occurrences),
            Counter({"1": 12, "2": 12, "5": 12, "7": 10}),
        )
        self.assertEqual(extractor.ZERO_TARGET_PAGES, (3, 4, 6, 8))
        self.assertEqual(
            extractor.EXPECTED_PAGE_TARGET_COUNTS,
            {
                "1": 12,
                "2": 12,
                "3": 0,
                "4": 0,
                "5": 12,
                "6": 0,
                "7": 10,
                "8": 0,
            },
        )
        self.assertEqual(
            [target.page for target in occurrences if target.headword == "cultural"],
            [1, 5],
        )

    def test_observed_sequence_gate_rejects_equal_count_replacement(self):
        observed = [
            (target.page, target.extracted_form)
            for target in extractor.EXPECTED_OCCURRENCES
        ]
        extractor.validate_observed_occurrences(observed)
        changed = list(observed)
        changed[8] = (changed[8][0], "minor")
        with self.assertRaisesRegex(ValueError, "occurrence 9"):
            extractor.validate_observed_occurrences(changed)

    def test_committed_rows_are_deduplicated_editorially_reviewed_candidates(self):
        rows = read_rows()
        self.assertEqual(tuple(rows[0]), extractor.base.OUTPUT_COLUMNS)
        self.assertEqual(len(rows), 45)
        self.assertEqual(len({row["headword"].casefold() for row in rows}), 45)
        self.assertEqual(
            Counter(row["pdf_page"] for row in rows),
            Counter({"1": 12, "2": 12, "5": 11, "7": 10}),
        )
        self.assertTrue(all(row["pos"] == "" for row in rows))
        self.assertTrue(all(row["cefr"] == "" for row in rows))
        self.assertTrue(all(row["definition"] == "" for row in rows))
        self.assertTrue(
            all(row["source_role"] == "lexical_candidate" for row in rows)
        )
        self.assertTrue(
            all(row["corpus_policy"] == "candidate_only" for row in rows)
        )
        self.assertTrue(all(row["source_format"] == "pdf" for row in rows))
        self.assertTrue(
            all(row["registry_source_id"] == extractor.SOURCE_ID for row in rows)
        )

        by_raw = {row["raw_term"]: row for row in rows}
        self.assertEqual(by_raw["Religious"]["headword"], "religious")
        self.assertEqual(
            by_raw["go 'trick or treating'"]["headword"],
            "go trick or treating",
        )
        self.assertEqual(by_raw["sings carols"]["headword"], "sings carols")
        self.assertEqual(
            by_raw["watched a fireworks display"]["headword"],
            "watched a fireworks display",
        )
        self.assertNotIn("cultural", [
            row["headword"] for row in rows if row["pdf_page"] == "5"
        ])

    def test_committed_rows_respect_copyright_and_privacy_boundary(self):
        rows = read_rows()
        serialized = "\n".join("\t".join(row.values()) for row in rows)
        for forbidden in (
            "/Users/",
            "Downloads/",
            ".pdf",
            "Example sentences",
            "Complete your",
        ):
            self.assertNotIn(forbidden, serialized)
        self.assertTrue(
            all(
                re.fullmatch(
                    r"pdf:page=(?:1|2|5|7),section="
                    r"(?:caption-target|word-formation|fixed-phrases)",
                    row["locator"],
                )
                for row in rows
            )
        )

    def test_oef_rows_exist_only_in_the_dedicated_evidence_tsv(self):
        with CURATED_PATH.open(encoding="utf-8", newline="") as handle:
            curated = list(csv.DictReader(handle, delimiter="\t"))
        self.assertFalse(
            any(
                row["registry_source_id"] == extractor.SOURCE_ID
                for row in curated
            )
        )

    def test_audit_binds_exact_source_candidate_and_full_page_render_evidence(self):
        rows = read_rows()
        audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
        source = audit["sources"][0]
        self.assertEqual(audit["schema_version"], 1)
        self.assertEqual(source["id"], extractor.SOURCE_ID)
        self.assertEqual(source["status"], "complete")
        self.assertTrue(source["editorial_review_complete"])
        self.assertEqual(source["source_sha256"], extractor.EXPECTED_SOURCE_SHA256)
        self.assertEqual(source["source_byte_size"], 1_278_408)
        self.assertEqual(source["source_page_count"], 8)
        self.assertEqual(source["pages_parsed"], list(range(1, 9)))
        self.assertEqual(source["visual_sample_pages"], list(range(1, 9)))
        self.assertEqual(source["zero_target_pages"], [3, 4, 6, 8])
        self.assertEqual(source["target_occurrence_count"], 46)
        self.assertEqual(source["normalized_headword_count"], 2)
        self.assertEqual(
            source["pos_policy"], "blank_source_does_not_supply_pos"
        )
        self.assertEqual(source["extracted_row_count"], len(rows))
        self.assertEqual(source["candidate_tsv_row_count"], len(rows))
        self.assertEqual(
            source["candidate_tsv_sha256"],
            hashlib.sha256(OUTPUT_PATH.read_bytes()).hexdigest(),
        )
        self.assertEqual(
            source["candidate_tsv_byte_size"], OUTPUT_PATH.stat().st_size
        )
        self.assertEqual(
            source["candidate_tsv_source_counts"],
            {extractor.SOURCE_ID: 45},
        )
        self.assertEqual(
            source["render_manifest_sha256"],
            hashlib.sha256(RENDER_PATH.read_bytes()).hexdigest(),
        )
        self.assertEqual(
            source["ordered_occurrence_sha256"],
            "d8f0b78d37f01d7094bc029ae83dcbf6456f549640c5cf3e40f1123ca514c772",
        )
        self.assertEqual(
            source["ordered_candidate_sha256"],
            "d5f97f3950ade23e5d3c155a2e07540f27dd98920dc56f40094d5911fc181e99",
        )

    def test_render_manifest_covers_every_source_page(self):
        manifest = json.loads(RENDER_PATH.read_text(encoding="utf-8"))
        self.assertEqual(manifest["source_id"], extractor.SOURCE_ID)
        self.assertEqual(manifest["source_sha256"], extractor.EXPECTED_SOURCE_SHA256)
        self.assertEqual(manifest["source_page_count"], 8)
        self.assertEqual(
            [entry["page"] for entry in manifest["rendered_pages"]],
            list(range(1, 9)),
        )
        self.assertTrue(
            all(
                re.fullmatch(r"[0-9a-f]{64}", entry["sha256"])
                for entry in manifest["rendered_pages"]
            )
        )

    def test_render_manifest_page_or_source_mutation_fails_closed(self):
        payload = json.loads(RENDER_PATH.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "render.json"
            for mutation, message in (
                ({**payload, "source_sha256": "0" * 64}, "profile mismatch"),
                (
                    {**payload, "rendered_pages": payload["rendered_pages"][:-1]},
                    "pages 1-8 exactly",
                ),
            ):
                with self.subTest(message=message):
                    path.write_text(json.dumps(mutation), encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, message):
                        extractor.render_manifest_sha256(path)

    def test_real_ledger_marks_oef_complete_but_does_not_promote_it(self):
        inventory = status_builder.load_inventory(INVENTORY_PATH)
        audits = status_builder.load_audits([AUDIT_PATH])
        counts = status_builder.count_evidence([OUTPUT_PATH])
        provenance = status_builder.evidence_file_provenance([OUTPUT_PATH])
        render = status_builder.load_render_evidence([RENDER_PATH])
        payload = status_builder.build_status(
            inventory,
            audits,
            counts,
            render,
            evidence_provenance=provenance,
        )
        source = next(
            row for row in payload["sources"] if row["id"] == extractor.SOURCE_ID
        )
        self.assertEqual(source["review_status"], "complete")
        self.assertTrue(source["editorial_review_complete"])
        self.assertTrue(source["provenance_evidence"]["passed"])
        self.assertTrue(source["completion_evidence"]["passed"])
        self.assertTrue(source["fully_evaluated"])

    def test_committed_ledger_has_the_same_complete_evidence_state(self):
        payload = json.loads(REVIEW_STATUS_PATH.read_text(encoding="utf-8"))
        source = next(
            row for row in payload["sources"] if row["id"] == extractor.SOURCE_ID
        )
        self.assertEqual(source["review_status"], "complete")
        self.assertTrue(source["fully_evaluated"])
        self.assertTrue(source["editorial_review_complete"])
        self.assertTrue(source["provenance_evidence"]["passed"])
        self.assertTrue(source["completion_evidence"]["passed"])

    def test_public_catalog_is_unchanged_by_the_completed_candidate_review(self):
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        self.assertEqual(catalog["statistics"]["active_entries"], 7_242)
        self.assertFalse(
            any(
                source["name"] == "OEF 1B Unit 5 Vocabulary and Writing Book"
                for source in catalog["sources"]
            )
        )
        self.assertNotIn(
            extractor.SOURCE_ID,
            CATALOG_PATH.read_text(encoding="utf-8"),
        )


if __name__ == "__main__":
    unittest.main()
