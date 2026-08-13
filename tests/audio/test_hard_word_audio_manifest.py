from __future__ import annotations

import json
import copy
import sys
import tempfile
import unittest
from collections import Counter
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import hard_word_audio_manifest as hard_audio
import generate_hard_word_audio as generator


class HardWordAudioManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = hard_audio.load_catalog()
        cls.manifest = hard_audio.load_manifest()

    def test_every_catalog_headword_has_loader_friendly_uk_and_us_audio(self) -> None:
        catalog_count = len(self.catalog["entries"])
        shared_headwords = sum(
            1
            for entry in self.manifest["entries"]
            if all(
                audio["assetSource"] == "shared_reviewed_word"
                for audio in entry["audio"].values()
            )
        )
        generated_headwords = catalog_count - shared_headwords
        self.assertEqual(self.manifest["schemaVersion"], 1)
        self.assertEqual(
            self.manifest["coverage"],
            {
                "accents": len(hard_audio.REVIEWED_VOICES),
                "audioLinks": catalog_count * len(hard_audio.REVIEWED_VOICES),
                "generatedFiles": generated_headwords
                * len(hard_audio.REVIEWED_VOICES),
                "generatedHeadwords": generated_headwords,
                "headwords": catalog_count,
                "sharedAudioLinks": shared_headwords
                * len(hard_audio.REVIEWED_VOICES),
                "sharedHeadwords": shared_headwords,
                "sourceAuditedHeadwords": sum(
                    entry["reviewStatus"] == "source_audited_for_rescue"
                    for entry in self.catalog["entries"]
                ),
            },
        )
        self.assertEqual(len(self.manifest["entries"]), catalog_count)
        by_id = {entry["entryId"]: entry for entry in self.manifest["entries"]}
        self.assertEqual(len(by_id), catalog_count)
        for catalog_entry in self.catalog["entries"]:
            entry = by_id[catalog_entry["id"]]
            self.assertEqual(entry["headword"], catalog_entry["displayWord"])
            self.assertEqual(set(entry["audio"]), {"uk", "us"})
            for accent in hard_audio.REVIEWED_VOICES:
                audio = entry["audio"][accent]
                self.assertEqual(audio["kind"], "word")
                self.assertEqual(audio["accent"], accent)
                expected_voice = (
                    hard_audio.REVIEWED_VOICES[accent]
                    if audio["assetSource"] == "shared_reviewed_word"
                    else hard_audio.GENERATED_VOICES[accent]
                )
                self.assertEqual(audio["voice"], expected_voice)
                self.assertTrue(audio["src"].startswith("./audio/"))
                self.assertEqual(audio["src"], f"./audio/{audio['path']}")
                self.assertTrue((ROOT / "public" / "ielts" / audio["src"][2:]).is_file())

    def test_exactly_12_entries_carry_catalog_lexical_audit_metadata(self) -> None:
        audited = [
            entry
            for entry in self.manifest["entries"]
            if entry["lexicalReview"]["sourceAudited"]
        ]
        self.assertEqual(len(audited), 12)
        self.assertTrue(
            all(
                entry["lexicalReview"]["status"] == "source_audited_for_rescue"
                for entry in audited
            )
        )
        self.assertEqual(
            {entry["headword"] for entry in audited},
            {
                "alcohol",
                "architecture",
                "botanical",
                "certificate",
                "controversial",
                "distinguish",
                "fountain",
                "instant",
                "pronunciation",
                "ridiculous",
                "sculpture",
                "squeeze",
            },
        )

    def test_manifest_is_pronunciation_only_and_contains_no_lexical_answers(self) -> None:
        self.assertFalse(self.manifest["privacy"]["containsLearnerIdentity"])
        self.assertFalse(self.manifest["privacy"]["lexicalAnswerFieldsIncluded"])
        forbidden = {
            "definition",
            "meaning",
            "zh",
            "pos",
            "partOfSpeech",
            "ipa",
            "cefr",
            "sentence",
            "example",
            "raw",
            "learner",
        }
        for entry in self.manifest["entries"]:
            self.assertTrue(forbidden.isdisjoint(entry))
            for audio in entry["audio"].values():
                self.assertTrue(forbidden.isdisjoint(audio))
                self.assertEqual(audio["kind"], "word")

    def test_source_split_is_derived_from_exact_reviewed_headword_matches(self) -> None:
        expected_links = hard_audio.expected_audio_links()
        expected_shared = {
            link["entry_id"]
            for link in expected_links
            if link["asset_source"] == "shared_reviewed_word"
        }
        expected_generated = {
            link["entry_id"]
            for link in expected_links
            if link["asset_source"] == "hard_word_generated"
        }
        patterns = Counter(
            tuple(sorted(audio["assetSource"] for audio in entry["audio"].values()))
            for entry in self.manifest["entries"]
        )
        self.assertEqual(
            patterns,
            Counter(
                {
                    ("hard_word_generated", "hard_word_generated"): len(
                        expected_generated
                    ),
                    ("shared_reviewed_word", "shared_reviewed_word"): len(
                        expected_shared
                    ),
                }
            ),
        )
        self.assertEqual(
            expected_shared | expected_generated,
            {entry["id"] for entry in self.catalog["entries"]},
        )
        self.assertFalse(expected_shared & expected_generated)

        for entry in self.manifest["entries"]:
            for accent, audio in entry["audio"].items():
                if audio["assetSource"] == "shared_reviewed_word":
                    self.assertEqual(audio["voice"], hard_audio.REVIEWED_VOICES[accent])
                    self.assertEqual(
                        audio["generationProfile"], hard_audio.REVIEWED_WORD_PROFILE_ID
                    )
                    self.assertEqual(
                        audio["generationProfileSha256"],
                        hard_audio.REVIEWED_WORD_PROFILE_SHA256,
                    )
                else:
                    self.assertEqual(audio["voice"], hard_audio.GENERATED_VOICES[accent])
                    self.assertEqual(audio["generationProfile"], hard_audio.PROFILE_ID)

    def test_generated_profile_is_local_only_and_shared_assets_keep_original_profile(self) -> None:
        profile = self.manifest["generationProfile"]
        self.assertEqual(profile["appliesToAssetSource"], "hard_word_generated")
        self.assertEqual(profile["synthesisEngine"], "macos-say")
        self.assertEqual(profile["id"], "macos-say-hard-word-2026-08-13.2")
        self.assertEqual(profile["parameters"]["speech_rate_wpm"], 175)
        self.assertEqual(profile["parameters"]["repeat_count"], 3)
        self.assertFalse(
            self.manifest["privacy"]["generatedTextSentToExternalService"]
        )
        self.assertIn(
            "no hard-word text is sent",
            self.manifest["provenance"]["generatedAudioOrigin"],
        )

    def test_generated_tree_has_only_expected_isolated_word_mp3_files(self) -> None:
        actual = hard_audio.repository_generated_paths()
        expected = hard_audio.expected_generated_paths()
        self.assertEqual(actual, expected)
        self.assertEqual(len(actual), len(hard_audio.generated_specs()))
        self.assertFalse(any(path.endswith("_sentence.mp3") for path in actual))
        hard_audio.require_exact_generated_coverage()

    def test_manifest_binds_catalog_and_every_audio_file(self) -> None:
        self.assertEqual(
            self.manifest["catalog"]["sha256"],
            hard_audio.catalog_sha256(),
        )
        self.assertEqual(self.manifest["catalog"]["catalogId"], hard_audio.CATALOG_ID)
        for entry in self.manifest["entries"]:
            for audio in entry["audio"].values():
                path = ROOT / "public" / "ielts" / audio["src"][2:]
                self.assertEqual(audio["bytes"], path.stat().st_size)
                self.assertEqual(audio["audioSha256"], hard_audio.sha256_file(path))
                self.assertEqual(audio["channels"], 1)
                self.assertEqual(audio["codec"], "mp3")
                self.assertEqual(audio["sampleRateHz"], 24_000)
                self.assertGreater(audio["durationSeconds"], 0)

    def test_text_hash_binds_every_audio_to_the_exact_catalog_headword(self) -> None:
        for entry in self.manifest["entries"]:
            expected = hard_audio.sha256_text(entry["headword"])
            for audio in entry["audio"].values():
                self.assertEqual(audio["textSha256"], expected)

    def test_committed_manifest_is_deterministic_and_current(self) -> None:
        raw = hard_audio.HARD_WORD_AUDIO_MANIFEST_FILE.read_text(encoding="utf-8")
        self.assertEqual(raw, hard_audio.render_manifest(json.loads(raw)))
        hard_audio.validate_manifest_schema(self.manifest)
        self.assertEqual(hard_audio.compare_manifest(), [])

    def test_manifest_comparison_tolerates_only_small_ffprobe_duration_drift(
        self,
    ) -> None:
        for drift in (-0.1, 0.05, 0.1):
            rebuilt = copy.deepcopy(self.manifest)
            original = rebuilt["entries"][0]["audio"]["uk"]["durationSeconds"]
            rebuilt["entries"][0]["audio"]["uk"]["durationSeconds"] = float(
                Decimal(str(original)) + Decimal(str(drift))
            )
            self.assertEqual(
                hard_audio.manifest_drift_messages(self.manifest, rebuilt), []
            )

        for drift in (-0.100001, 0.100001):
            rebuilt = copy.deepcopy(self.manifest)
            original = rebuilt["entries"][0]["audio"]["uk"]["durationSeconds"]
            rebuilt["entries"][0]["audio"]["uk"]["durationSeconds"] = float(
                Decimal(str(original)) + Decimal(str(drift))
            )
            self.assertTrue(
                hard_audio.manifest_drift_messages(self.manifest, rebuilt)
            )

        reordered = copy.deepcopy(self.manifest)
        reordered["entries"][0], reordered["entries"][1] = (
            reordered["entries"][1],
            reordered["entries"][0],
        )
        self.assertTrue(hard_audio.manifest_drift_messages(self.manifest, reordered))

        for field, value in (
            ("bytes", self.manifest["entries"][0]["audio"]["uk"]["bytes"] + 1),
            ("voice", "Different voice"),
            ("audioSha256", "0" * 64),
        ):
            rebuilt = copy.deepcopy(self.manifest)
            rebuilt["entries"][0]["audio"]["uk"][field] = value
            self.assertTrue(
                hard_audio.manifest_drift_messages(self.manifest, rebuilt), field
            )

    def test_duration_contract_rejects_boolean_nan_and_infinity(self) -> None:
        for value in (
            True,
            float("nan"),
            float("inf"),
            float("-inf"),
            10**400,
        ):
            mutated = copy.deepcopy(self.manifest)
            mutated["entries"][0]["audio"]["uk"]["durationSeconds"] = value
            with self.assertRaises(hard_audio.HardWordAudioError):
                hard_audio.validate_manifest_schema(mutated)

    def test_manifest_schema_uses_type_strict_numeric_and_boolean_contracts(
        self,
    ) -> None:
        mutations = (
            (("schemaVersion",), True),
            (("catalog", "entryCount"), True),
            (("coverage", "accents"), True),
            (("generationProfile", "parameters", "channels"), True),
            (("privacy", "containsLearnerIdentity"), 0),
            (("entries", 0, "audio", "uk", "channels"), True),
            (("entries", 0, "audio", "uk", "sampleRateHz"), True),
            (("entries", 0, "audio", "uk", "bytes"), True),
        )
        for path, value in mutations:
            mutated = copy.deepcopy(self.manifest)
            target = mutated
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
            with self.subTest(path=path):
                with self.assertRaises(hard_audio.HardWordAudioError):
                    hard_audio.validate_manifest_schema(mutated)
                self.assertTrue(
                    hard_audio.manifest_drift_messages(self.manifest, mutated)
                )

    def test_loader_schema_fails_closed_on_unknown_fields_and_bad_counts(self) -> None:
        mutated = copy.deepcopy(self.manifest)
        mutated["entries"][0]["unexpected"] = True
        with self.assertRaises(hard_audio.HardWordAudioError):
            hard_audio.validate_manifest_schema(mutated)
        mutated = copy.deepcopy(self.manifest)
        mutated["coverage"]["headwords"] -= 1
        with self.assertRaises(hard_audio.HardWordAudioError):
            hard_audio.validate_manifest_schema(mutated)

    def test_catalog_scale_and_statistics_are_derived_but_fail_closed(self) -> None:
        self.assertEqual(
            self.catalog["statistics"]["unique_headwords"],
            len(self.catalog["entries"]),
        )
        mutations = []
        changed_unique = copy.deepcopy(self.catalog)
        changed_unique["statistics"]["unique_headwords"] += 1
        mutations.append(changed_unique)
        changed_difficulty = copy.deepcopy(self.catalog)
        changed_difficulty["statistics"]["difficulty_counts"]["1"] += 1
        mutations.append(changed_difficulty)
        changed_reports = copy.deepcopy(self.catalog)
        changed_reports["statistics"]["normalized_reports"] += 1
        mutations.append(changed_reports)
        injected = copy.deepcopy(self.catalog)
        injected["statistics"]["unexpected"] = 1
        mutations.append(injected)

        with tempfile.TemporaryDirectory() as directory:
            catalog_file = Path(directory) / "catalog.json"
            for mutated in mutations:
                catalog_file.write_text(json.dumps(mutated), encoding="utf-8")
                with self.assertRaises(hard_audio.HardWordAudioError):
                    hard_audio.load_catalog(catalog_file)

    def test_previous_manifest_can_supply_only_hash_verified_reuse_candidates(self) -> None:
        current_specs = hard_audio.generated_specs()
        previous_index = hard_audio.flattened_manifest_audio_index(self.manifest)
        reusable = [
            spec
            for spec in current_specs
            if hard_audio.reusable_generated_asset(
                spec,
                previous_index.get((str(spec["entry_id"]), str(spec["accent"]))),
            )
        ]
        self.assertGreater(len(reusable), 0)
        candidate = reusable[0]
        key = (str(candidate["entry_id"]), str(candidate["accent"]))
        forged = copy.deepcopy(previous_index[key])
        forged["audioSha256"] = "0" * 64
        self.assertFalse(hard_audio.reusable_generated_asset(candidate, forged))
        forged = copy.deepcopy(previous_index[key])
        forged["bindingSha256"] = "0" * 64
        self.assertFalse(hard_audio.reusable_generated_asset(candidate, forged))

    def test_loader_schema_rejects_answer_and_identity_injection(self) -> None:
        for key, value in (("meaning", "答案"), ("learner", "private")):
            mutated = copy.deepcopy(self.manifest)
            mutated["entries"][0][key] = value
            with self.assertRaises(hard_audio.HardWordAudioError):
                hard_audio.validate_manifest_schema(mutated)

class HardWordAudioCheckpointTests(unittest.TestCase):
    def test_generation_checkpoint_rejects_a_stale_catalog(self) -> None:
        original = generator.CHECKPOINT_FILE
        try:
            with tempfile.TemporaryDirectory() as directory:
                generator.CHECKPOINT_FILE = Path(directory) / "checkpoint.json"
                payload = {
                    "catalogSha256": "0" * 64,
                    "entries": [],
                    "profileId": hard_audio.PROFILE_ID,
                }
                generator.CHECKPOINT_FILE.write_text(json.dumps(payload))
                with self.assertRaisesRegex(RuntimeError, "Stale or invalid"):
                    generator.load_checkpoint()
        finally:
            generator.CHECKPOINT_FILE = original

    def test_local_synthesis_command_uses_argv_without_a_shell(self) -> None:
        calls = []
        original = generator.subprocess.run
        try:
            def fake_run(command, **kwargs):
                calls.append((command, kwargs))

            generator.subprocess.run = fake_run
            generator.run_checked(
                [
                    "/usr/bin/say",
                    "-v",
                    "Daniel",
                    "-r",
                    "175",
                    "-o",
                    "/tmp/test.aiff",
                    "--",
                    "word with spaces",
                ]
            )
        finally:
            generator.subprocess.run = original
        self.assertEqual(len(calls), 1)
        command, kwargs = calls[0]
        self.assertIsInstance(command, list)
        self.assertNotIn("shell", kwargs)
        self.assertTrue(kwargs["check"])
        self.assertEqual(command[-1], "word with spaces")

    def test_local_voice_preflight_requires_exact_uk_and_us_locales(self) -> None:
        class Result:
            stdout = (
                "Daniel              en_GB    # Hello! My name is Daniel.\n"
                "Samantha            en_US    # Hello! My name is Samantha.\n"
            )

        original = generator.subprocess.run
        try:
            generator.subprocess.run = lambda *args, **kwargs: Result()
            generator.verify_local_synthesis_environment()
            Result.stdout = "Daniel              en_GB    # Hello\n"
            with self.assertRaisesRegex(RuntimeError, "Samantha en_US"):
                generator.verify_local_synthesis_environment()
        finally:
            generator.subprocess.run = original


if __name__ == "__main__":
    unittest.main()
