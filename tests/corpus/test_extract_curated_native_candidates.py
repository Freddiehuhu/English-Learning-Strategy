from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "corpus"
    / "extract_curated_native_candidates.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_curated_native_candidates",
    MODULE_PATH,
)
assert SPEC and SPEC.loader
extractor = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = extractor
SPEC.loader.exec_module(extractor)


class CuratedNativeCandidateTests(unittest.TestCase):
    def test_oef_is_excluded_from_the_legacy_multi_source_batch(self):
        self.assertIn(
            "oef-1bu5-vocabulary-writing-book",
            extractor.SUPPORTED_SOURCE_IDS,
        )
        self.assertNotIn(
            "oef-1bu5-vocabulary-writing-book",
            extractor.CURATED_BATCH_SOURCE_IDS,
        )

    def test_expands_common_slash_alternative_shapes(self):
        self.assertEqual(
            extractor.expand_slash_alternatives("law/rule/regulation"),
            ["law", "rule", "regulation"],
        )
        self.assertEqual(
            extractor.expand_slash_alternatives("escape/flee from"),
            ["escape from", "flee from"],
        )
        self.assertEqual(
            extractor.expand_slash_alternatives("be scared/afraid of"),
            ["be scared of", "Be afraid of"],
        )
        self.assertEqual(
            extractor.expand_slash_alternatives("pass/fail/do (an exam)"),
            ["pass (an exam)", "fail (an exam)", "do (an exam)"],
        )

    def test_parses_phrasal_verbs_without_definitions(self):
        parsed = extractor.parse_section_cell(
            "Back down – admit defeat\n"
            "Get away with – escape without punishment\n"
            "WRAPPED DEFINITION",
            "phrasal_verbs",
        )
        self.assertEqual(
            parsed,
            [
                ("Back down", "Back down"),
                ("Get away with", "Get away with"),
            ],
        )

    def test_parses_word_family_continuations(self):
        parsed = extractor.parse_section_cell(
            "Employ – employee, employer, employed,\n"
            "employment\n"
            "Threaten – threat, threatening",
            "word_formation",
        )
        self.assertEqual(
            [item[0] for item in parsed],
            [
                "Employ",
                "employee",
                "employer",
                "employed",
                "employment",
                "Threaten",
                "threat",
                "threatening",
            ],
        )

    def test_groups_oef_caption_targets_by_grid_cell(self):
        words = [
            {"text": "attend", "fontname": "CIDFont+F3", "size": 9, "x0": 90, "top": 140},
            {"text": "a", "fontname": "CIDFont+F3", "size": 9, "x0": 125, "top": 140},
            {"text": "parade", "fontname": "CIDFont+F3", "size": 9, "x0": 45, "top": 154},
            {"text": "display", "fontname": "CIDFont+F3", "size": 9, "x0": 220, "top": 140},
            {"text": "lanterns", "fontname": "CIDFont+F3", "size": 9, "x0": 165, "top": 154},
        ]
        targets = extractor.group_caption_targets(
            words,
            page_width=420,
            row_thresholds=(220, 350, 470),
        )
        self.assertEqual(targets, ["attend a parade", "display lanterns"])

    def test_groups_split_suffix_forms_without_copying_examples(self):
        words = [
            {"text": "capit", "x0": 105, "top": 157.2},
            {"text": "al", "x0": 124, "top": 157.2},
            {"text": "bott", "x0": 289, "top": 157.2},
            {"text": "le", "x0": 304, "top": 157.2},
            {"text": "Example", "x0": 36, "top": 322.7},
        ]
        self.assertEqual(
            extractor.group_suffix_targets(words),
            ["capital", "bottle"],
        )

    def test_identifies_only_hash_and_size_matched_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf = root / "arbitrary-name.pdf"
            pdf.write_bytes(b"test-pdf")
            digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
            registry_path = root / "registry.json"
            sources = []
            for source_id in sorted(extractor.SUPPORTED_SOURCE_IDS):
                sources.append(
                    {
                        "id": source_id,
                        "display_name": source_id,
                        "expected_sha256": (
                            digest if source_id == "c1-vocabulary-pack-cae" else "0" * 64
                        ),
                        "expected_byte_size": (
                            len(pdf.read_bytes())
                            if source_id == "c1-vocabulary-pack-cae"
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
        self.assertEqual(source.id, "c1-vocabulary-pack-cae")

    def test_rows_are_candidate_only_and_never_contain_definitions(self):
        source = extractor.RegistrySource(
            id="c1-vocabulary-pack-cae",
            display_name="C1 Vocabulary Pack for CAE",
            expected_sha256="",
            expected_byte_size=0,
            source_role="lexical_candidate",
            corpus_policy="candidate_only",
            source_format="pdf",
        )
        row = extractor.make_row(
            source,
            headword="back down",
            raw_term="back down",
            topic="Unit 1",
            page_number=5,
            section="phrasal_verbs",
        )
        self.assertEqual(row["corpus_policy"], "candidate_only")
        self.assertEqual(row["source_role"], "lexical_candidate")
        self.assertEqual(row["definition"], "")
        self.assertEqual(row["source_ref"], "registry:c1-vocabulary-pack-cae")
        self.assertNotIn("/", row["source_ref"])


if __name__ == "__main__":
    unittest.main()
