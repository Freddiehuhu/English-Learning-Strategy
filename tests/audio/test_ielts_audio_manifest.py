from __future__ import annotations

import copy
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
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

    @staticmethod
    def load_rescue_vocabulary() -> list[dict[str, object]]:
        extractor = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), context);
process.stdout.write(JSON.stringify(context.window.IELTS_RESCUE_VOCABULARY));
"""
        result = subprocess.run(
            [
                "node",
                "-e",
                extractor,
                str(audio_manifest.RESCUE_VOCABULARY_FILE),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)

    def test_exact_98_by_2_by_2_coverage(self) -> None:
        self.assertEqual(
            self.manifest["coverage"],
            {
                "accents": 2,
                "assets": 392,
                "kinds_per_word": 2,
                "words": 98,
            },
        )
        self.assertEqual(len(self.entries), 392)
        self.assertEqual(len(self.by_path), 392)

        word_ids = {entry["word_id"] for entry in self.entries}
        self.assertEqual(len(word_ids), 98)
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

    def test_rescue_vocabulary_contract_and_sensitive_senses_are_locked(self) -> None:
        rescue = self.load_rescue_vocabulary()
        lint = subprocess.run(
            [
                str(ROOT / "node_modules" / ".bin" / "eslint"),
                "--no-ignore",
                "--no-config-lookup",
                "--rule",
                "no-dupe-keys:error",
                str(audio_manifest.RESCUE_VOCABULARY_FILE),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            lint.returncode,
            0,
            lint.stdout + lint.stderr,
        )
        self.assertEqual(len(rescue), 12)
        self.assertEqual(Counter(entry["round"] for entry in rescue), {1: 6, 2: 6})
        self.assertEqual(
            {entry["id"] for entry in rescue},
            {
                "controversial",
                "fountain",
                "pronunciation",
                "instant",
                "certificate",
                "squeeze",
                "botanical",
                "ridiculous",
                "alcohol",
                "architecture",
                "distinguish",
                "sculpture",
            },
        )

        needs_by_code = {
            1: ["pronunciation"],
            2: ["meaning"],
            3: ["pronunciation", "meaning"],
        }
        by_id = {entry["id"]: entry for entry in rescue}
        for entry in rescue:
            entry_id = entry["id"]
            self.assertEqual(entry["reportedUnknownCode"], entry["difficulty"])
            self.assertEqual(
                entry["reportedNeeds"],
                needs_by_code[entry["difficulty"]],
                entry_id,
            )
            self.assertIn(
                entry["blockType"],
                {"pronunciation_chunks", "spelling_blocks"},
                entry_id,
            )
            self.assertTrue(entry["blocks"], entry_id)
            self.assertGreaterEqual(entry["stress"], 0, entry_id)
            self.assertLess(entry["stress"], len(entry["blocks"]), entry_id)
            self.assertTrue(entry["chunks"], entry_id)
            self.assertTrue(entry["meaningTask"]["prompt"], entry_id)
            self.assertIsInstance(
                entry["meaningTask"]["masteryEligible"], bool, entry_id
            )
            self.assertTrue(entry["sourceUrls"], entry_id)
            self.assertEqual(
                len(entry["sourceUrls"]),
                len(set(entry["sourceUrls"])),
                f"{entry_id}: duplicate source URL",
            )
            for source_url in entry["sourceUrls"]:
                self.assertTrue(
                    source_url.startswith(
                        (
                            "https://dictionary.cambridge.org/",
                            "https://www.oxfordlearnersdictionaries.com/",
                        )
                    ),
                    f"{entry_id}: {source_url}",
                )

            pronunciation = entry["pronunciation"]
            self.assertEqual(pronunciation["blocks"], entry["blocks"], entry_id)
            self.assertEqual(
                pronunciation["primaryStressIndex"], entry["stress"], entry_id
            )
            for accent, voice in audio_manifest.VOICES.items():
                accent_data = pronunciation[accent]
                self.assertEqual(accent_data["voice"], voice, entry_id)
                self.assertEqual(accent_data["text"], entry["word"], entry_id)
                self.assertEqual(
                    accent_data["wordAudio"],
                    f"./audio/{accent}/{entry_id}.mp3",
                    entry_id,
                )
                self.assertEqual(
                    accent_data["sentenceAudio"],
                    f"./audio/{accent}/{entry_id}_sentence.mp3",
                    entry_id,
                )
                self.assertEqual(entry["audio"][accent], accent_data, entry_id)

            decode_task = entry["decodeTask"]
            self.assertTrue(decode_task["prompt"], entry_id)
            self.assertGreaterEqual(decode_task["answerIndex"], 0, entry_id)
            self.assertLess(
                decode_task["answerIndex"], len(decode_task["choices"]), entry_id
            )
            if decode_task["kind"] == "primary_stress":
                self.assertTrue(
                    all(choice == choice.lower() for choice in decode_task["choices"]),
                    f"{entry_id}: answer must not be leaked by all-caps styling",
                )

        instant = by_id["instant"]
        self.assertEqual(instant["senseStatus"], "pending_context")
        self.assertTrue(instant["meaningTask"]["unscored"])
        self.assertFalse(instant["meaningTask"]["masteryEligible"])
        self.assertIsNone(instant["meaningTask"]["answer"])
        self.assertFalse(
            {"即时或立刻相关", "速溶产品相关", "一瞬间"}
            & set(instant["meaningTask"]["choices"]),
            "pending-context choices must collect evidence, not suggest a sense",
        )

        certificate = by_id["certificate"]
        self.assertEqual(certificate["senseStatus"], "locked_noun_sense")
        self.assertEqual(
            certificate["senseId"], "certificate-noun-official-document"
        )
        self.assertTrue(certificate["pos"].startswith("n."))
        self.assertTrue(certificate["ipaUk"].endswith("kət/"))
        self.assertTrue(certificate["ipaUs"].endswith("kət/"))
        self.assertIn("/eɪt/", certificate["pronunciationNote"])
        self.assertEqual(certificate["decodeTask"]["kind"], "noun_ending")
        self.assertEqual(
            certificate["decodeTask"]["choices"][
                certificate["decodeTask"]["answerIndex"]
            ],
            "/kət/",
        )

        squeeze = by_id["squeeze"]
        self.assertEqual(squeeze["blockType"], "spelling_blocks")
        self.assertEqual(squeeze["blocks"], ["squ", "ee", "ze"])
        self.assertEqual(squeeze["decodeTask"]["kind"], "grapheme_sound")
        self.assertEqual(
            squeeze["decodeTask"]["choices"][
                squeeze["decodeTask"]["answerIndex"]
            ],
            "ee",
        )

        for accent in ("uk", "us"):
            certificate_word = self.specs_by_path[f"{accent}/certificate.mp3"]
            certificate_sentence = self.specs_by_path[
                f"{accent}/certificate_sentence.mp3"
            ]
            self.assertEqual(certificate_word["text"], "certificate")
            self.assertIn("birth certificate", certificate_sentence["text"])

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
        self.assertEqual(len(measured), 392)
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

    def test_independently_manifested_audio_subtrees_do_not_pollute_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            audio_root = Path(directory)
            for accent in audio_manifest.VOICES:
                (audio_root / accent).mkdir(parents=True)
                (audio_root / accent / "owned.mp3").write_bytes(b"owned")
            foreign = audio_root / "hard-words" / "uk" / "foreign.mp3"
            foreign.parent.mkdir(parents=True)
            foreign.write_bytes(b"foreign")
            self.assertEqual(
                audio_manifest.repository_audio_paths(audio_root),
                {"uk/owned.mp3", "us/owned.mp3"},
            )

    @unittest.skipUnless(
        shutil.which("ffprobe") and shutil.which("ffmpeg"),
        "ffprobe and ffmpeg are required for the full drift gate",
    )
    def test_committed_manifest_has_no_drift(self) -> None:
        messages = audio_manifest.compare_manifest()
        self.assertFalse(messages, "\n".join(messages[:6]))

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

    def test_probe_measurements_allow_small_cross_ffmpeg_drift(self) -> None:
        measured = copy.deepcopy(self.manifest)
        measured["entries"][0]["duration_seconds"] += 0.06
        measured["entries"][0]["integrated_lufs"] += 0.4
        self.assertEqual(
            audio_manifest.manifest_drift_messages(self.manifest, measured),
            [],
        )

    def test_probe_measurements_reject_material_drift(self) -> None:
        measured = copy.deepcopy(self.manifest)
        measured["entries"][0]["duration_seconds"] += 0.2
        measured["entries"][1]["integrated_lufs"] += 2.0
        messages = audio_manifest.manifest_drift_messages(self.manifest, measured)
        self.assertTrue(
            any("duration_seconds" in message for message in messages),
            messages,
        )
        self.assertTrue(
            any("integrated_lufs" in message for message in messages),
            messages,
        )


if __name__ == "__main__":
    unittest.main()
