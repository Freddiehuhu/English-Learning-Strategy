from __future__ import annotations

import csv
import json
import unittest
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TARGET_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "target-input"
    / "student-listening-unknowns-2026-08-01.tsv"
)
AUDIT_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "supplementary-audits"
    / "student-listening-unknowns-2026-08-01.json"
)
CATALOG_PATH = REPO_ROOT / "public" / "ielts" / "corpus" / "catalog.json"
CORPUS_DIR = REPO_ROOT / "data" / "ielts-corpus"
CANDIDATE_QUEUE_PATH = CORPUS_DIR / "supplementary-candidate-queue.tsv"
CANDIDATE_EVIDENCE_PATH = CORPUS_DIR / "supplementary-source-evidence.tsv"
SOURCE_NAME = "Student IELTS Listening Unknowns 2026-08-01"


class StudentListeningTargetTests(unittest.TestCase):
    def load_rows(self) -> list[dict[str, str]]:
        with TARGET_PATH.open(encoding="utf-8", newline="") as handle:
            return list(csv.DictReader(handle, delimiter="\t"))

    def test_target_rows_match_the_audited_36_word_batch(self):
        rows = self.load_rows()
        audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))

        self.assertEqual(len(rows), 36)
        self.assertEqual([row["headword"] for row in rows], audit["words"])
        self.assertEqual(len({row["headword"] for row in rows}), 36)
        self.assertTrue(
            all(row["headword"] == row["headword"].casefold() for row in rows)
        )
        self.assertTrue(all(row["source"] == SOURCE_NAME for row in rows))
        self.assertTrue(all(row["source_role"] == "target_reference" for row in rows))
        self.assertTrue(all(row["corpus_policy"] == "target" for row in rows))
        self.assertTrue(all(row["source_format"] == "other" for row in rows))
        self.assertTrue(all(row["definition"] == "" for row in rows))
        self.assertTrue(all(row["pos"] and row["topic_or_section"] for row in rows))
        self.assertTrue(all(row["cefr"] == "" for row in rows))
        self.assertFalse(any("/Users/" in "\t".join(row.values()) for row in rows))

    def test_public_catalog_merges_all_36_as_listening_targets(self):
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
        source = next(item for item in catalog["sources"] if item["name"] == SOURCE_NAME)
        entries = {entry["headword"]: entry for entry in catalog["entries"]}

        self.assertEqual(source["extracted_rows"], 36)
        self.assertEqual(catalog["statistics"]["active_entries"], 7_242)
        for word in audit["words"]:
            entry = entries[word]
            self.assertEqual(entry["status"], "active")
            self.assertEqual(entry["primary_skill"], "listening")
            self.assertIn("listening", entry["skill_labels"])
            self.assertIn(source["id"], entry["source_ids"])

        self.assertEqual(entries["actual"]["pos"], ["adjective"])

    def test_new_lemmas_do_not_publish_unsourced_cefr_claims(self):
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
        entries = {entry["headword"]: entry for entry in catalog["entries"]}

        for word in audit["master_merge"]["new_lemmas"]:
            self.assertEqual(entries[word]["cefr"], [])

    def test_all_extracted_supplementary_batches_share_one_blocked_review_queue(self):
        with CANDIDATE_QUEUE_PATH.open(encoding="utf-8", newline="") as handle:
            queue_rows = list(csv.DictReader(handle, delimiter="\t"))
        with CANDIDATE_EVIDENCE_PATH.open(encoding="utf-8", newline="") as handle:
            evidence_rows = list(csv.DictReader(handle, delimiter="\t"))
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

        self.assertEqual(len(queue_rows), 11_092)
        self.assertEqual(
            Counter(row["candidate_status"] for row in queue_rows),
            Counter(
                {
                    "target_candidate": 6_964,
                    "excluded_proper_noun": 46,
                    "support_for_active_target": 4_082,
                }
            ),
        )
        self.assertEqual(len(evidence_rows), 15_513)
        self.assertEqual(len({row["registry_source_id"] for row in evidence_rows}), 23)
        self.assertTrue(
            all(row["corpus_policy"] == "candidate_only" for row in evidence_rows)
        )
        self.assertTrue(
            all(row["source_role"] == "lexical_candidate" for row in evidence_rows)
        )

        candidate_source_names = {row["source"] for row in evidence_rows}
        public_source_names = {source["name"] for source in catalog["sources"]}
        self.assertTrue(candidate_source_names.isdisjoint(public_source_names))


if __name__ == "__main__":
    unittest.main()
