from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "corpus"
    / "extract_scholastic_success_candidates.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_scholastic_success_candidates",
    MODULE_PATH,
)
assert SPEC and SPEC.loader
extractor = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = extractor
SPEC.loader.exec_module(extractor)


class ScholasticSuccessCandidateTests(unittest.TestCase):
    def test_profiles_cover_all_five_hash_gated_sources(self):
        self.assertEqual(
            {profile.registry_source_id for profile in extractor.PROFILES},
            extractor.SUPPORTED_SOURCE_IDS,
        )
        self.assertEqual(len(extractor.PROFILES_BY_SHA), 5)
        self.assertTrue(
            all(len(profile.sha256) == 64 for profile in extractor.PROFILES)
        )

    def test_curated_candidate_counts_are_stable_and_nonempty(self):
        expected = {
            "scholastic-success-vocabulary-grade-1": 112,
            "scholastic-success-vocabulary-grade-2": 201,
            "scholastic-success-vocabulary-grade-3": 301,
            "scholastic-success-vocabulary-grade-4": 257,
            "scholastic-success-vocabulary-grade-5": 494,
        }
        actual = {}
        for profile in extractor.PROFILES:
            unique = {
                target.casefold()
                for plan in profile.plans
                for target in plan.targets
            }
            actual[profile.registry_source_id] = len(unique)
        self.assertEqual(actual, expected)

    def test_plans_use_only_short_lexical_forms_not_sentences(self):
        for profile in extractor.PROFILES:
            for plan in profile.plans:
                self.assertGreater(len(plan.targets), 0)
                for target in plan.targets:
                    extractor.validate_target(target)
                    self.assertNotIn("\n", target)
                    self.assertLessEqual(len(target), 48)

    def test_term_visibility_normalizes_case_spaces_and_apostrophes(self):
        page_text = "Word Bank\nO’CLOCK   Blue whale\nNITTY-GRITTY"
        self.assertTrue(extractor.term_is_visible(page_text, "o'clock"))
        self.assertTrue(extractor.term_is_visible(page_text, "blue whale"))
        self.assertTrue(extractor.term_is_visible(page_text, "nitty-gritty"))
        self.assertFalse(extractor.term_is_visible(page_text, "whale shark"))

    def test_rows_are_candidate_only_and_have_no_book_body_content(self):
        source = extractor.RegistrySource(
            id="scholastic-success-vocabulary-grade-3",
            display_name="Scholastic Success with Vocabulary, Grade 3",
            expected_sha256="0" * 64,
            expected_byte_size=0,
            source_role="lexical_candidate",
            corpus_policy="candidate_only",
            source_format="pdf",
        )
        plan = extractor.PagePlan(
            page=66,
            topic="Weather vocabulary",
            section="explicit_word_box",
            targets=("gale",),
            pos="noun",
        )
        row = extractor.make_row(source, plan, "gale")
        self.assertEqual(row["corpus_policy"], "candidate_only")
        self.assertEqual(row["source_role"], "lexical_candidate")
        self.assertEqual(row["definition"], "")
        self.assertEqual(
            row["source_ref"],
            "registry:scholastic-success-vocabulary-grade-3",
        )
        self.assertNotIn("/", row["source_ref"])
        self.assertNotIn("\\", row["locator"])

    def test_identification_requires_both_size_and_sha256(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf = root / "arbitrary-name.pdf"
            pdf.write_bytes(b"known-pdf")
            digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
            profile = extractor.SourceProfile(
                registry_source_id="fake-source",
                sha256=digest,
                byte_size=pdf.stat().st_size,
                page_count=1,
                plans=(),
                visual_sample_pages=(),
            )
            source = extractor.RegistrySource(
                id="fake-source",
                display_name="Fake",
                expected_sha256=digest,
                expected_byte_size=pdf.stat().st_size,
                source_role="lexical_candidate",
                corpus_policy="candidate_only",
                source_format="pdf",
            )
            with mock.patch.object(extractor, "PROFILES", (profile,)):
                with mock.patch.object(
                    extractor,
                    "PROFILES_BY_SHA",
                    {digest: profile},
                ):
                    identified, identified_profile = extractor.identify_source(
                        pdf,
                        {"fake-source": source},
                    )
                    self.assertEqual(identified.id, "fake-source")
                    self.assertEqual(identified_profile, profile)
                    pdf.write_bytes(b"wrong-pdf")
                    with self.assertRaisesRegex(ValueError, "SHA-256"):
                        extractor.identify_source(pdf, {"fake-source": source})

    def test_registry_rejects_policy_or_hash_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "registry.json"
            sources = []
            for profile in extractor.PROFILES:
                sources.append(
                    {
                        "id": profile.registry_source_id,
                        "display_name": profile.registry_source_id,
                        "expected_sha256": profile.sha256,
                        "expected_byte_size": profile.byte_size,
                        "source_role": "lexical_candidate",
                        "corpus_policy": "candidate_only",
                        "format": "pdf",
                    }
                )
            sources[0]["corpus_policy"] = "active_target"
            path.write_text(
                json.dumps({"sources": sources}),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "does not match profile"):
                extractor.load_registry(path)


if __name__ == "__main__":
    unittest.main()
