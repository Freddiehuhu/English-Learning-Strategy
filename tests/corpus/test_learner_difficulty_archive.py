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
PUBLIC_CATALOG_PATH = (
    REPO_ROOT / "public" / "ielts" / "corpus" / "student-hard-words.json"
)
SPEC = importlib.util.spec_from_file_location("build_learner_difficulty_archive", MODULE_PATH)
assert SPEC and SPEC.loader
archive_builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = archive_builder
SPEC.loader.exec_module(archive_builder)


class LearnerDifficultyArchiveTests(unittest.TestCase):
    def load_archive(self) -> dict:
        return json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))

    def load_public_catalog(self) -> dict:
        return json.loads(PUBLIC_CATALOG_PATH.read_text(encoding="utf-8"))

    def test_archive_is_exactly_reproducible(self):
        committed = ARCHIVE_PATH.read_text(encoding="utf-8")
        self.assertEqual(committed, archive_builder.serialized_archive())
        public_committed = PUBLIC_CATALOG_PATH.read_text(encoding="utf-8")
        self.assertEqual(
            public_committed, archive_builder.serialized_public_catalog()
        )

    def test_batch_counts_and_difficulty_mapping_are_locked(self):
        archive = self.load_archive()
        items = archive["items"]

        self.assertEqual(archive["schema_version"], 3)
        self.assertEqual(archive["source_batch_count"], 4)
        self.assertEqual(archive["first_received_at"], "2026-08-12")
        self.assertEqual(archive["last_received_at"], "2026-08-13")
        self.assertEqual(archive["statistics"], archive_builder.EXPECTED_STATISTICS)
        self.assertEqual(len(items), 1064)
        self.assertEqual(
            Counter(item["difficulty_code"] for item in items),
            Counter({1: 241, 2: 336, 3: 487}),
        )
        self.assertEqual(
            Counter(item["corpus_match_status"] for item in items),
            Counter({"active": 889, "candidate_only": 75, "unmatched": 100}),
        )
        self.assertEqual(len({item["normalized_headword"] for item in items}), 1064)
        self.assertEqual(
            [item["item_index"] for item in items],
            list(range(1, 1065)),
        )
        for item in items:
            self.assertEqual(
                item["needs_pronunciation"], item["difficulty_code"] in (1, 3)
            )
            self.assertEqual(item["needs_meaning"], item["difficulty_code"] in (2, 3))

    def test_confirmed_corrections_keep_raw_evidence(self):
        archive = self.load_archive()
        corrected = []
        for item in archive["items"]:
            corrected.extend(
                (item, report)
                for report in item["reports"]
                if report["correction_status"] == "confirmed"
            )
        by_raw: dict[str, list[tuple[str, int]]] = {}
        for item, report in corrected:
            by_raw.setdefault(report["raw_token"], []).append(
                (item["normalized_headword"], report["reported_difficulty_code"])
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
                "consritution3": [("constitution", 3)],
                "bridgeroom3": [("bridegroom", 3)],
            },
        )
        for item, report in corrected:
            self.assertEqual(
                report["correction_source"], "user_confirmation_2026-08-12"
            )
        pulse = next(
            item for item, _report in corrected if item["normalized_headword"] == "pulse"
        )
        self.assertEqual(pulse["corpus_match_status"], "active")
        self.assertIsNotNone(pulse["lexical_entry_id"])
        self.assertIn(
            "student-confirmed typo",
            next(
                report["correction_note"]
                for report in pulse["reports"]
                if report["correction_status"] == "confirmed"
            ),
        )

    def test_duplicate_reports_are_preserved_and_capability_gaps_are_unioned(self):
        archive = self.load_archive()
        by_word = {item["normalized_headword"]: item for item in archive["items"]}
        expected = {
            "mature": [("mature2", 2), ("mature3", 3)],
            "satisfaction": [("satisfaction", 1), ("satisfaction2", 2)],
            "previous": [("previous", 1), ("previous3", 3)],
        }
        for word, raw_reports in expected.items():
            item = by_word[word]
            self.assertEqual(item["difficulty_code"], 3)
            self.assertTrue(item["needs_pronunciation"])
            self.assertTrue(item["needs_meaning"])
            self.assertEqual(item["report_count"], 2)
            self.assertEqual(
                [
                    (report["raw_token"], report["reported_difficulty_code"])
                    for report in item["reports"]
                ],
                raw_reports,
            )

        followup_words = {
            "spite",
            "purpose",
            "mature",
            "maturity",
            "bullying",
            "stress-free",
            "bills",
            "satisfaction",
            "compare",
            "model",
            "candidates",
            "experts",
            "present",
            "reference",
            "previous",
            "eliminate",
            "familiarity",
            "hindrance",
            "distracted",
            "hesitate",
            "critically",
            "get carried away",
        }
        self.assertTrue(followup_words.issubset(by_word))

        second_followup_words = {
            "blanket",
            "constitution",
            "bridegroom",
            "cheque",
            "sceptical",
            "ambassadress",
            "chain store",
            "panic",
        }
        self.assertTrue(second_followup_words.issubset(by_word))
        self.assertNotIn("consritution", by_word)
        self.assertNotIn("bridgeroom", by_word)
        self.assertEqual(by_word["scare"]["report_count"], 2)
        self.assertEqual(by_word["hesitate"]["report_count"], 2)

    def test_third_followup_batch_is_complete_and_preserves_ambiguity(self):
        archive = self.load_archive()
        items = {item["normalized_headword"]: item for item in archive["items"]}
        raw_batch = [
            line.strip()
            for line in archive_builder.FOLLOWUP_BATCH_3.splitlines()
            if line.strip()
        ]
        latest_reports = [
            report
            for item in archive["items"]
            for report in item["reports"]
            if report["batch_id"] == "student-hard-words-2026-08-13-followup-3"
        ]

        self.assertEqual(len(raw_batch), 314)
        self.assertEqual(len(set(raw_batch)), 314)
        self.assertTrue(all(raw[-1] in "123" for raw in raw_batch))
        self.assertEqual(
            Counter(int(raw[-1]) for raw in raw_batch),
            Counter({1: 26, 2: 114, 3: 174}),
        )
        self.assertEqual(
            Counter(report["raw_token"] for report in latest_reports),
            Counter(raw_batch),
        )
        self.assertTrue(
            all(report["correction_status"] == "not_needed" for report in latest_reports)
        )

        self.assertEqual(items["expect"]["report_count"], 2)
        self.assertEqual(
            [
                (report["raw_token"], report["reported_difficulty_code"])
                for report in items["expect"]["reports"]
            ],
            [("expect3", 3), ("expect2", 2)],
        )
        self.assertEqual(items["expect"]["difficulty_code"], 3)

        pacific = items["pacific"]
        self.assertEqual(pacific["display_word"], "Pacific")
        self.assertEqual(pacific["reports"][0]["raw_token"], "Pacific3")
        self.assertEqual(pacific["proper_noun_status"], "mixed_or_context_dependent")
        self.assertEqual(
            pacific["teacher_review_status"],
            "needs_proper_noun_and_sense_review",
        )

        ambiguous_headwords = {
            "abuse",
            "conduct",
            "content",
            "digest",
            "forecast",
            "found",
            "herb",
            "permit",
            "progress",
            "schedule",
            "sow",
            "wound",
        }
        self.assertTrue(ambiguous_headwords.issubset(items))
        self.assertTrue(
            all(items[word]["sense_status"] == "needs_context_confirmation" for word in ambiguous_headwords)
        )
        self.assertTrue(
            all(items[word]["source_sentence"] is None for word in ambiguous_headwords)
        )

    def test_public_catalog_is_anonymous_minimal_and_complete(self):
        catalog = self.load_public_catalog()
        entries = catalog["entries"]
        self.assertEqual(catalog["schemaVersion"], 1)
        self.assertFalse(catalog["privacy"]["containsLearnerIdentity"])
        self.assertEqual(len(entries), 1064)
        self.assertEqual(
            Counter(entry["difficultyCode"] for entry in entries),
            Counter({1: 241, 2: 336, 3: 487}),
        )
        self.assertEqual(
            Counter(entry["practiceStatus"] for entry in entries),
            Counter({"awaiting_exercise_authoring": 1052, "in_rescue_training": 12}),
        )
        exact_public_fields = {
            "id",
            "displayWord",
            "normalizedHeadword",
            "difficultyCode",
            "needsPronunciation",
            "needsMeaning",
            "abilityTags",
            "reportCount",
            "corpusMatchStatus",
            "reviewStatus",
            "practiceStatus",
        }
        forbidden = {
            "learnerName",
            "learnerId",
            "rawReports",
            "rawToken",
            "receivedAt",
            "batchId",
            "rawLineIndex",
            "definition",
            "partOfSpeech",
            "cefr",
            "ipa",
            "lexicalEntryId",
        }
        ids = set()
        for entry in entries:
            self.assertEqual(set(entry), exact_public_fields)
            self.assertTrue(forbidden.isdisjoint(entry))
            self.assertEqual(
                entry["difficultyCode"],
                archive_builder.difficulty_code_for(
                    entry["needsPronunciation"], entry["needsMeaning"]
                ),
            )
            self.assertGreaterEqual(entry["reportCount"], 1)
            ids.add(entry["id"])
        self.assertEqual(len(ids), 1064)
        self.assertEqual(sum(entry["reportCount"] for entry in entries), 1070)

        serialized = json.dumps(catalog, ensure_ascii=False)
        self.assertNotIn("pluse3", serialized)
        self.assertNotIn("student-hard-words-2026-08-12-followup-1", serialized)
        self.assertNotIn("consritution3", serialized)
        self.assertNotIn("bridgeroom3", serialized)
        self.assertNotIn("student-hard-words-2026-08-12-followup-2", serialized)
        self.assertNotIn("Pacific3", serialized)
        self.assertNotIn("student-hard-words-2026-08-13-followup-3", serialized)

    def test_archive_contains_no_unapproved_lexical_answers(self):
        archive = self.load_archive()
        forbidden = {"definition", "part_of_speech", "pos", "cefr", "ipa"}
        for item in archive["items"]:
            self.assertTrue(forbidden.isdisjoint(item))
            self.assertIsNone(item["source_sentence"])
            self.assertIsNone(item["sense_id"])
            if item["corpus_match_status"] != "active":
                self.assertIsNone(item["lexical_entry_id"])

        geography = {
            item["normalized_headword"]: item
            for item in archive["items"]
            if item["normalized_headword"] in {"arctic", "antarctic", "pacific"}
        }
        self.assertEqual(set(geography), {"arctic", "antarctic", "pacific"})
        self.assertTrue(
            all(
                item["proper_noun_status"] == "mixed_or_context_dependent"
                and item["teacher_review_status"]
                == "needs_proper_noun_and_sense_review"
                for item in geography.values()
            )
        )


if __name__ == "__main__":
    unittest.main()
