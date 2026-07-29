from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "corpus"
    / "extract_scholastic_240_candidates.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_scholastic_240_candidates",
    MODULE_PATH,
)
assert SPEC and SPEC.loader
extractor = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = extractor
SPEC.loader.exec_module(extractor)


class Scholastic240CandidateTests(unittest.TestCase):
    def test_grade_one_exact_repairs_are_visually_bounded(self):
        text = "\n".join(
            f"{raw}, p. {page}"
            for raw, page in extractor.EXACT_FIXES[
                "scholastic-240-vocabulary-grade-1"
            ]
        )
        parsed = []
        for match in extractor.ENTRY_PATTERN.finditer(text):
            key = (match.group(1), match.group(2))
            parsed.append(
                extractor.EXACT_FIXES[
                    "scholastic-240-vocabulary-grade-1"
                ][key]
            )
        self.assertEqual(
            [term for term, _ in parsed],
            [
                "finger",
                "five",
                "flashlight",
                "flour",
                "flower",
                "fluffy",
                "fly",
            ],
        )

    def test_grade_four_repairs_corrupt_text_layer_tokens(self):
        fixes = extractor.EXACT_FIXES[
            "scholastic-240-vocabulary-grade-4"
        ]
        self.assertEqual(fixes[("quicksand", "1B")], ("quicksand", 18))
        self.assertEqual(fixes[("phy", "9")], ("trophy", 9))
        self.assertEqual(fixes[("ndalism", "60")], ("vandalism", 60))
        self.assertEqual(
            fixes[("neighborhood scoop", "63")],
            ("scoop", 63),
        )
        self.assertEqual(fixes[("slwscraper", "57")], ("skyscraper", 57))

    def test_each_source_has_only_explicit_verified_additions(self):
        self.assertEqual(
            len(
                extractor.VERIFIED_ADDITIONS[
                    "scholastic-240-vocabulary-grade-1"
                ]
            ),
            4,
        )
        self.assertEqual(
            len(
                extractor.VERIFIED_ADDITIONS[
                    "scholastic-240-vocabulary-grade-3"
                ]
            ),
            4,
        )
        self.assertEqual(
            len(
                extractor.VERIFIED_ADDITIONS[
                    "scholastic-240-vocabulary-grade-4"
                ]
            ),
            7,
        )

    def test_validation_requires_240_and_ten_per_lesson(self):
        entries = [
            (f"word{page}{offset}", page)
            for page in extractor.EXPECTED_PRINTED_PAGES
            for offset in range(10)
        ]
        with self.assertRaisesRegex(ValueError, "invalid target forms"):
            extractor.validate_entries("sample", entries)
        valid_entries = [
            (f"word{chr(97 + offset)}", page)
            for page in extractor.EXPECTED_PRINTED_PAGES
            for offset in range(10)
        ]
        extractor.validate_entries("sample", valid_entries)
        with self.assertRaisesRegex(ValueError, "expected 240"):
            extractor.validate_entries("sample", valid_entries[:-1])

    def test_rows_are_candidate_only_and_copy_no_book_body(self):
        source = extractor.RegistrySource(
            id="scholastic-240-vocabulary-grade-4",
            display_name="Grade 4",
            expected_sha256="",
            expected_byte_size=0,
            source_role="lexical_candidate",
            corpus_policy="candidate_only",
            source_format="pdf",
        )
        row = extractor.make_row(source, "gargantuan", 60, 79)
        self.assertEqual(row["corpus_policy"], "candidate_only")
        self.assertEqual(row["definition"], "")
        self.assertEqual(
            row["source_ref"],
            "registry:scholastic-240-vocabulary-grade-4",
        )
        self.assertEqual(
            row["locator"],
            "pdf:page=79,section=word-list,target-printed-page=60",
        )
        self.assertNotIn("/", row["source_ref"])

    def test_identifies_only_hash_and_size_matched_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf = root / "arbitrary-name.pdf"
            pdf.write_bytes(b"scholastic-test")
            digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
            registry_path = root / "registry.json"
            sources = []
            for source_id in sorted(extractor.SUPPORTED_SOURCE_IDS):
                sources.append(
                    {
                        "id": source_id,
                        "display_name": source_id,
                        "expected_sha256": (
                            digest
                            if source_id
                            == "scholastic-240-vocabulary-grade-1"
                            else "0" * 64
                        ),
                        "expected_byte_size": (
                            len(pdf.read_bytes())
                            if source_id
                            == "scholastic-240-vocabulary-grade-1"
                            else 1
                        ),
                        "source_role": "lexical_candidate",
                        "corpus_policy": "candidate_only",
                        "format": "pdf",
                    }
                )
            registry_path.write_text(
                json.dumps({"sources": sources}),
                encoding="utf-8",
            )
            registry = extractor.load_registry(registry_path)
            source = extractor.identify_source(pdf, registry)
        self.assertEqual(
            source.id,
            "scholastic-240-vocabulary-grade-1",
        )

    def test_expected_lesson_distribution_is_24_by_10(self):
        counts = Counter(
            page
            for page in extractor.EXPECTED_PRINTED_PAGES
            for _ in range(10)
        )
        self.assertEqual(len(counts), 24)
        self.assertTrue(all(value == 10 for value in counts.values()))


if __name__ == "__main__":
    unittest.main()
