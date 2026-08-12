from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "scripts" / "corpus" / "build_learner_difficulty_archive.py"
ARCHIVE_PATH = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "learner-difficulty"
    / "student-hard-words-2026-08-12.json"
)
SPEC = importlib.util.spec_from_file_location("build_learner_difficulty_archive", MODULE_PATH)
assert SPEC and SPEC.loader
archive_builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = archive_builder
SPEC.loader.exec_module(archive_builder)


class LearnerDifficultyArchiveTests(unittest.TestCase):
    def load_archive(self) -> dict:
        return json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))

    def test_archive_is_exactly_reproducible(self):
        committed = ARCHIVE_PATH.read_text(encoding="utf-8")
        self.assertEqual(committed, archive_builder.serialized_archive())

    def test_batch_counts_and_difficulty_mapping_are_locked(self):
        archive = self.load_archive()
        items = archive["items"]

        self.assertEqual(archive["statistics"], archive_builder.EXPECTED_STATISTICS)
        self.assertEqual(len(items), 443)
        self.assertEqual(
            Counter(item["difficulty_code"] for item in items),
            Counter({1: 192, 2: 110, 3: 141}),
        )
        self.assertEqual(
            Counter(item["corpus_match_status"] for item in items),
            Counter({"active": 378, "candidate_only": 31, "unmatched": 34}),
        )
        self.assertEqual(len({item["normalized_headword"] for item in items}), 443)
        self.assertEqual(
            [item["item_index"] for item in items],
            list(range(1, 444)),
        )
        for item in items:
            self.assertEqual(
                item["needs_pronunciation"], item["difficulty_code"] in (1, 3)
            )
            self.assertEqual(item["needs_meaning"], item["difficulty_code"] in (2, 3))

    def test_confirmed_corrections_keep_raw_evidence(self):
        archive = self.load_archive()
        corrected = [
            item for item in archive["items"] if item["correction_status"] == "confirmed"
        ]
        by_raw: dict[str, list[tuple[str, int]]] = {}
        for item in corrected:
            by_raw.setdefault(item["raw_token"], []).append(
                (item["normalized_headword"], item["difficulty_code"])
            )

        self.assertEqual(
            by_raw,
            {
                "accountany3": [("account", 3)],
                "sculptur3": [("sculpture", 3)],
                "fountai": [("fountain", 1)],
                "ridiculou": [("ridiculous", 1)],
                "pluse3": [("pulse", 3)],
                "dustinguish3": [("distinguish", 3)],
                "botabical": [("botanical", 1)],
                "instant2alcohol": [("instant", 2), ("alcohol", 1)],
            },
        )
        pulse = next(item for item in corrected if item["normalized_headword"] == "pulse")
        self.assertEqual(pulse["corpus_match_status"], "active")
        self.assertIsNotNone(pulse["lexical_entry_id"])
        self.assertIn("student-confirmed typo", pulse["correction_note"])

    def test_archive_contains_no_unapproved_lexical_answers(self):
        archive = self.load_archive()
        forbidden = {"definition", "part_of_speech", "pos", "cefr", "ipa"}
        for item in archive["items"]:
            self.assertTrue(forbidden.isdisjoint(item))
            self.assertIsNone(item["source_sentence"])
            self.assertIsNone(item["sense_id"])
            if item["corpus_match_status"] != "active":
                self.assertIsNone(item["lexical_entry_id"])

        polar = {
            item["normalized_headword"]: item
            for item in archive["items"]
            if item["normalized_headword"] in {"arctic", "antarctic"}
        }
        self.assertEqual(set(polar), {"arctic", "antarctic"})
        self.assertTrue(
            all(
                item["proper_noun_status"] == "mixed_or_context_dependent"
                and item["teacher_review_status"]
                == "needs_proper_noun_and_sense_review"
                for item in polar.values()
            )
        )


if __name__ == "__main__":
    unittest.main()
