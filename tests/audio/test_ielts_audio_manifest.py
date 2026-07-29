from __future__ import annotations

import copy
import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import ielts_audio_manifest as audio_manifest


class IeltsAudioManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = audio_manifest.load_manifest()
        cls.entries = cls.manifest["entries"]
        cls.by_path = {entry["path"]: entry for entry in cls.entries}
        cls.specs = audio_manifest.expected_assets()
        cls.specs_by_path = {spec["path"]: spec for spec in cls.specs}

    def test_exact_50_by_2_by_2_coverage(self) -> None:
        self.assertEqual(
            self.manifest["coverage"],
            {
                "accents": 2,
                "assets": 200,
                "kinds_per_word": 2,
                "words": 50,
            },
        )
        self.assertEqual(len(self.entries), 200)
        self.assertEqual(len(self.by_path), 200)

        word_ids = {entry["word_id"] for entry in self.entries}
        self.assertEqual(len(word_ids), 50)
        expected_combinations = {
            (word_id, accent, kind)
            for word_id in word_ids
            for accent in ("uk", "us")
            for kind in ("word", "sentence")
        }
        actual_combinations = {
            (entry["word_id"], entry["accent"], entry["kind"])
            for entry in self.entries
        }
        self.assertEqual(actual_combinations, expected_combinations)

    def test_every_entry_is_bound_to_current_exact_text_voice_and_profile(self) -> None:
        self.assertEqual(set(self.by_path), set(self.specs_by_path))
        binding_fields = {
            "accent",
            "binding_sha256",
            "generation_profile",
            "generation_profile_sha256",
            "kind",
            "path",
            "pipeline_version",
            "synthesis_engine_version",
            "text",
            "text_sha256",
            "text_utf8_bytes",
            "voice",
            "word_id",
        }
        for path, spec in self.specs_by_path.items():
            entry = self.by_path[path]
            self.assertEqual(
                {field: entry[field] for field in binding_fields},
                {field: spec[field] for field in binding_fields},
                path,
            )
            self.assertEqual(
                entry["text_sha256"],
                hashlib.sha256(entry["text"].encode("utf-8")).hexdigest(),
                path,
            )

    def test_audio_hash_size_duration_and_optional_lufs_are_valid(self) -> None:
        for entry in self.entries:
            path = audio_manifest.AUDIO_ROOT / entry["path"]
            self.assertTrue(path.is_file(), entry["path"])
            self.assertEqual(entry["bytes"], path.stat().st_size, entry["path"])
            self.assertEqual(
                entry["audio_sha256"],
                audio_manifest.sha256_file(path),
                entry["path"],
            )
            parameters = audio_manifest.PROFILE_PARAMETERS[entry["kind"]]
            self.assertEqual(entry["codec"], parameters["codec"], entry["path"])
            self.assertEqual(
                entry["channels"], parameters["channels"], entry["path"]
            )
            self.assertEqual(
                entry["sample_rate_hz"],
                parameters["sample_rate_hz"],
                entry["path"],
            )
            self.assertGreater(entry["duration_seconds"], 0, entry["path"])
            if entry["integrated_lufs"] is not None:
                self.assertIsInstance(entry["integrated_lufs"], (int, float))

    def test_measured_loudness_stays_inside_a_broad_playback_envelope(self) -> None:
        measured = [
            entry for entry in self.entries if entry["integrated_lufs"] is not None
        ]
        if not measured:
            self.skipTest("ffmpeg loudness measurements are not available")
        self.assertEqual(len(measured), 200)
        for entry in measured:
            self.assertGreaterEqual(
                entry["integrated_lufs"], -26.0, entry["path"]
            )
            self.assertLessEqual(
                entry["integrated_lufs"], -15.0, entry["path"]
            )

    def test_repository_has_no_missing_or_unexpected_mp3(self) -> None:
        self.assertEqual(
            audio_manifest.repository_audio_paths(),
            audio_manifest.expected_asset_paths(),
        )
        audio_manifest.require_exact_coverage()

    @unittest.skipUnless(
        shutil.which("ffprobe") and shutil.which("ffmpeg"),
        "ffprobe and ffmpeg are required for the full drift gate",
    )
    def test_committed_manifest_has_no_drift(self) -> None:
        self.assertEqual(audio_manifest.compare_manifest(), [])

    def test_reuse_requires_binding_and_audio_hash_match(self) -> None:
        spec = self.specs_by_path["uk/ecologist.mp3"]
        entry = self.by_path["uk/ecologist.mp3"]
        source = audio_manifest.AUDIO_ROOT / spec["path"]

        self.assertTrue(audio_manifest.reusable_asset(spec, entry, source))
        for field, replacement in (
            ("text_sha256", "0" * 64),
            ("voice", "different-voice"),
            ("generation_profile_sha256", "f" * 64),
            ("pipeline_version", "future-version"),
        ):
            changed = {**spec, field: replacement}
            self.assertFalse(
                audio_manifest.reusable_asset(changed, entry, source),
                field,
            )

        with tempfile.TemporaryDirectory() as directory:
            changed_audio = Path(directory) / "ecologist.mp3"
            changed_audio.write_bytes(source.read_bytes() + b"changed")
            self.assertFalse(
                audio_manifest.reusable_asset(spec, entry, changed_audio)
            )

    def test_vocabulary_text_change_makes_existing_audio_stale(self) -> None:
        original = audio_manifest.VOCABULARY_FILE.read_text(encoding="utf-8")
        changed = original.replace(
            "word: 'ecologist'",
            "word: 'ecologist changed'",
            1,
        )
        self.assertNotEqual(original, changed)
        with tempfile.TemporaryDirectory() as directory:
            vocabulary_file = Path(directory) / "vocabulary.js"
            vocabulary_file.write_text(changed, encoding="utf-8")
            changed_specs = {
                spec["path"]: spec
                for spec in audio_manifest.expected_assets(vocabulary_file)
            }

        path = "uk/ecologist.mp3"
        self.assertNotEqual(
            changed_specs[path]["text_sha256"],
            self.specs_by_path[path]["text_sha256"],
        )
        self.assertFalse(
            audio_manifest.reusable_asset(
                changed_specs[path],
                self.by_path[path],
                audio_manifest.AUDIO_ROOT / path,
            )
        )

    def test_manifest_json_is_deterministically_rendered(self) -> None:
        raw = audio_manifest.MANIFEST_FILE.read_text(encoding="utf-8")
        loaded = json.loads(raw)
        self.assertEqual(raw, audio_manifest.render_manifest(loaded))

    def test_bootstrap_cannot_replace_an_existing_binding(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest_file = Path(directory) / "manifest.json"
            manifest_file.write_text("{}\n", encoding="utf-8")
            with self.assertRaisesRegex(
                audio_manifest.AudioManifestError,
                "Refusing to replace existing manifest",
            ):
                audio_manifest.bootstrap_manifest(
                    self.manifest,
                    manifest_file,
                )
            self.assertEqual(
                manifest_file.read_text(encoding="utf-8"),
                "{}\n",
            )

    def test_generation_contract_limitation_does_not_claim_human_judgment(self) -> None:
        limitation = self.manifest["provenance"]["limitation"]
        self.assertIn("do not acoustically certify", limitation)
        self.assertIn("naturalness", limitation)

    def test_manifest_entry_mutation_is_detected(self) -> None:
        mutated = copy.deepcopy(self.manifest)
        mutated["entries"][0]["text_sha256"] = "0" * 64
        messages = audio_manifest.manifest_drift_messages(mutated, self.manifest)
        self.assertTrue(messages)
        self.assertTrue(
            any("text_sha256" in message for message in messages),
            messages,
        )


if __name__ == "__main__":
    unittest.main()
