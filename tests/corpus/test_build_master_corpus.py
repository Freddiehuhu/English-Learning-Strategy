from __future__ import annotations

import importlib.util
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "corpus"
    / "build_master_corpus.py"
)
SPEC = importlib.util.spec_from_file_location("build_master_corpus", MODULE_PATH)
assert SPEC and SPEC.loader
corpus = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = corpus
SPEC.loader.exec_module(corpus)


class CorpusBuilderTests(unittest.TestCase):
    def row(
        self,
        *,
        source: str,
        headword: str,
        pos: str,
        cefr: str,
        definition: str = "",
    ):
        return corpus.SourceRow(
            source=source,
            raw_term=headword,
            headword=headword,
            pos=pos,
            cefr=cefr,
            topic="test",
            pdf_page="1",
            source_ref="",
            definition=definition,
            notes="",
            source_file="test.tsv",
        )

    def test_normalises_placeholders_without_losing_phrase_structure(self):
        self.assertEqual(
            corpus.normalise_key("  look after somebody  "),
            "look after sb",
        )
        self.assertEqual(corpus.normalise_key("state–of–the–art"), "state-of-the-art")
        self.assertEqual(
            corpus.canonical_source_name("CompleteCAE_WLM_ExtendedUnit7.pdf"),
            "Complete CAE Extended Unit 07",
        )
        cae_row = self.row(
            source="Complete CAE Extended Unit 07",
            headword="test",
            pos="n.",
            cefr="C1",
        )
        self.assertEqual(
            corpus.source_pdf_filename(cae_row),
            "CompleteCAE_WLM_ExtendedUnit07.pdf",
        )

    def test_keeps_multiple_parts_of_speech_in_one_deduplicated_entry(self):
        rows = [
            self.row(
                source="IELTS Listening 1200",
                headword="broadcast",
                pos="v.",
                cefr="B1",
                definition="send a programme",
            ),
            self.row(
                source="Oxford 5000",
                headword="broadcast",
                pos="n.",
                cefr="B2",
                definition="a programme",
            ),
        ]
        entry = corpus.build_entry(corpus.EntryGroup("broadcast", rows))
        self.assertEqual(entry["parts_of_speech"], ["noun", "verb"])
        self.assertTrue(entry["relation_flags"]["homograph_candidate"])
        self.assertEqual(entry["skill_profile"]["primary"], "listening")
        self.assertEqual(entry["image_plan"]["mode"], "multi-sense-panel")
        self.assertEqual(entry["source_definition_count"], 2)
        self.assertTrue(all("definition" not in row for row in entry["source_rows"]))
        self.assertTrue(all("notes" not in row for row in entry["source_rows"]))
        self.assertNotIn("send a programme", json.dumps(entry))

    def test_advanced_abstract_word_is_indexed_for_writing(self):
        entry = corpus.build_entry(
            corpus.EntryGroup(
                "accountability",
                [
                    self.row(
                        source="Oxford 5000 by CEFR level",
                        headword="accountability",
                        pos="n.",
                        cefr="C1",
                    )
                ],
            )
        )
        self.assertEqual(entry["skill_profile"]["primary"], "writing")
        self.assertIn("writing", entry["skill_profile"]["labels"])
        self.assertEqual(entry["skill_profile"]["confidence"], "review")

    def test_adjective_noun_phrase_is_not_mistaken_for_a_homograph(self):
        entry = corpus.build_entry(
            corpus.EntryGroup(
                "abstract painting",
                [
                    self.row(
                        source="Complete CAE",
                        headword="abstract painting",
                        pos="adjective + noun",
                        cefr="C1",
                    )
                ],
            )
        )
        self.assertFalse(entry["relation_flags"]["homograph_candidate"])
        self.assertEqual(entry["image_plan"]["mode"], "context-scene")

    def test_quality_gate_catches_wrapped_cambridge_example(self):
        row = self.row(
            source="Cambridge B1 Preliminary",
            headword="recently.",
            pos="n",
            cefr="B1",
        )
        row = corpus.SourceRow(
            **{
                **row.__dict__,
                "topic": "Alphabetical list: D",
                "raw_term": "recently.",
            }
        )
        issues = corpus.source_row_quality_issues(row)
        self.assertIn("headword does not match alphabetical section", issues)
        self.assertIn("sentence-like terminal period", issues)

    def test_quality_gate_catches_accidental_digit_loss(self):
        row = self.row(
            source="Cambridge KET",
            headword="MP player",
            pos="n",
            cefr="A2",
        )
        row = corpus.SourceRow(
            **{
                **row.__dict__,
                "topic": "Alphabetical list: M",
                "raw_term": "MP3 player",
            }
        )
        self.assertIn(
            "raw term and headword differ in an alphabetical source",
            corpus.source_row_quality_issues(row),
        )

    def test_only_explicit_proper_nouns_are_excluded(self):
        ordinary = corpus.build_entry(
            corpus.EntryGroup(
                "may",
                [self.row(source="Oxford", headword="May", pos="modal v.", cefr="A1")],
            )
        )
        proper = corpus.build_entry(
            corpus.EntryGroup(
                "london",
                [self.row(source="Test", headword="London", pos="proper noun", cefr="A1")],
            )
        )
        self.assertEqual(ordinary["status"], "active")
        self.assertEqual(proper["status"], "excluded_proper_noun")

    def test_topic_excludes_a_proper_noun_only_entry(self):
        row = self.row(
            source="IELTS Listening",
            headword="Africa",
            pos="",
            cefr="",
        )
        row = corpus.SourceRow(
            **{
                **row.__dict__,
                "topic": "大洲 Continents",
            }
        )
        entry = corpus.build_entry(corpus.EntryGroup("africa", [row]))
        self.assertEqual(entry["status"], "excluded_proper_noun")
        self.assertEqual(entry["source_rows"], [])
        self.assertTrue(entry["review_flags"]["proper_noun_sense_removed"])

    def test_topic_excludes_country_with_lowercase_leading_article(self):
        row = self.row(
            source="IELTS Listening",
            headword="the Philippines",
            pos="",
            cefr="",
        )
        row = corpus.SourceRow(
            **{
                **row.__dict__,
                "topic": "国家 Countries",
            }
        )
        entry = corpus.build_entry(corpus.EntryGroup("the philippines", [row]))
        self.assertEqual(entry["status"], "excluded_proper_noun")
        self.assertEqual(entry["source_rows"], [])

    def test_topic_keeps_lowercase_common_vocabulary(self):
        row = self.row(
            source="IELTS Listening",
            headword="linguistics",
            pos="",
            cefr="",
        )
        row = corpus.SourceRow(
            **{
                **row.__dict__,
                "topic": "语言 Languages",
            }
        )
        entry = corpus.build_entry(corpus.EntryGroup("linguistics", [row]))
        self.assertEqual(entry["status"], "active")

    def test_mixed_common_and_proper_senses_keep_only_common_evidence(self):
        month = self.row(
            source="IELTS Listening",
            headword="May",
            pos="",
            cefr="",
        )
        month = corpus.SourceRow(
            **{
                **month.__dict__,
                "topic": "月份 Months",
            }
        )
        modal = self.row(
            source="Oxford 3000",
            headword="may",
            pos="modal v.",
            cefr="A1",
        )
        entry = corpus.build_entry(corpus.EntryGroup("may", [month, modal]))
        self.assertEqual(entry["status"], "active")
        self.assertEqual(entry["headword"], "may")
        self.assertTrue(entry["review_flags"]["proper_noun_sense_removed"])
        self.assertEqual(len(entry["source_rows"]), 1)
        self.assertEqual(entry["source_rows"][0]["source"], "Oxford 3000")

    def test_audited_trademarks_are_removed_without_losing_common_visa(self):
        mastercard = self.row(
            source="IELTS Listening",
            headword="MasterCard",
            pos="",
            cefr="",
        )
        mastercard_entry = corpus.build_entry(
            corpus.EntryGroup("mastercard", [mastercard])
        )
        self.assertEqual(mastercard_entry["status"], "excluded_proper_noun")

        branded_visa = self.row(
            source="IELTS Listening",
            headword="VISA",
            pos="",
            cefr="",
        )
        common_visa = self.row(
            source="Oxford 5000",
            headword="visa",
            pos="n.",
            cefr="B2",
        )
        visa_entry = corpus.build_entry(
            corpus.EntryGroup("visa", [branded_visa, common_visa])
        )
        self.assertEqual(visa_entry["status"], "active")
        self.assertEqual(visa_entry["headword"], "visa")
        self.assertTrue(visa_entry["review_flags"]["proper_noun_sense_removed"])
        self.assertEqual(len(visa_entry["source_rows"]), 1)
        self.assertEqual(visa_entry["source_rows"][0]["source"], "Oxford 5000")

    def test_parenthetical_sense_labels_dedupe_without_public_glosses(self):
        self.assertEqual(corpus.normalise_key("bank (money)"), "bank")
        self.assertEqual(corpus.normalise_key("bank (river)"), "bank")
        self.assertEqual(corpus.normalise_key("wrap (up)"), "wrap up")
        self.assertEqual(corpus.normalise_key("cut down (on) (salt)"), "cut down on")
        self.assertEqual(corpus.normalise_key("(a)round"), "around")
        self.assertEqual(
            corpus.clean_lexical_form("fall in love (with sb)"),
            "fall in love with sb",
        )
        row = self.row(
            source="Oxford 3000",
            headword="like (find sb/sth pleasant)",
            pos="v.",
            cefr="A1",
        )
        entry = corpus.build_entry(corpus.EntryGroup("like", [row]))
        self.assertEqual(entry["headword"], "like")
        self.assertNotIn("raw_term", entry["source_rows"][0])
        self.assertNotIn("pleasant", json.dumps(entry))

    def test_public_outputs_omit_excluded_proper_nouns(self):
        africa = self.row(
            source="IELTS Listening",
            headword="Africa",
            pos="",
            cefr="",
        )
        africa = corpus.SourceRow(
            **{
                **africa.__dict__,
                "topic": "大洲 Continents",
            }
        )
        excluded = corpus.build_entry(corpus.EntryGroup("africa", [africa]))
        active = corpus.build_entry(
            corpus.EntryGroup(
                "word",
                [
                    self.row(
                        source="Oxford 3000",
                        headword="word",
                        pos="n.",
                        cefr="A1",
                    )
                ],
            )
        )
        payload = {
            "schema_version": 2,
            "generated_at": "test",
            "statistics": {},
            "sources": [],
            "entries": [excluded, active],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master_path = root / "master.tsv"
            catalog_path = root / "catalog.json"
            corpus.write_master_tsv(master_path, [excluded, active])
            corpus.write_public_catalog(catalog_path, payload)
            with master_path.open(encoding="utf-8", newline="") as handle:
                master_rows = list(csv.DictReader(handle, delimiter="\t"))
            catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        self.assertEqual([row["headword"] for row in master_rows], ["word"])
        self.assertEqual(
            [entry["headword"] for entry in catalog["entries"]],
            ["word"],
        )

    def test_game_editorial_queue_uses_explicit_review_statuses(self):
        entry = corpus.build_entry(
            corpus.EntryGroup(
                "beauty",
                [
                    self.row(
                        source="Oxford 3000",
                        headword="beauty",
                        pos="n.",
                        cefr="B1",
                    )
                ],
            )
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.tsv"
            corpus.write_game_editorial_queue(path, [entry])
            with path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle, delimiter="\t"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["image_guess"], "needs_approved_sense")
        self.assertEqual(
            rows[0]["synonym_antonym"],
            "needs_editorial_review",
        )
        self.assertEqual(
            rows[0]["homophone"],
            "needs_pronunciation_evidence",
        )
        self.assertEqual(
            rows[0]["category_taxonomy"],
            "needs_hypernym_review",
        )

    def test_tsv_reader_keeps_the_real_vocabulary_item_word(self):
        fields = (
            "source",
            "raw_term",
            "headword",
            "pos",
            "cefr",
            "topic_or_section",
            "pdf_page",
            "source_ref",
            "definition",
            "notes",
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.tsv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=fields,
                    delimiter="\t",
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "source": "Oxford 3000",
                        "raw_term": "word",
                        "headword": "word",
                        "pos": "n.",
                        "cefr": "A1",
                        "topic_or_section": "CEFR A1",
                        "pdf_page": "1",
                        "source_ref": "",
                        "definition": "",
                        "notes": "",
                    }
                )
            with self.assertRaisesRegex(
                ValueError,
                "supplementary TSV is missing explicit policy columns",
            ):
                corpus.read_tsv(path)
            rows = corpus.read_tsv(path, allow_legacy_target=True)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].headword, "word")

    def test_candidate_only_source_cannot_create_an_active_entry(self):
        candidate = corpus.SourceRow(
            **{
                **self.row(
                    source="Edge Vocabulary",
                    headword="addictive",
                    pos="adj.",
                    cefr="B1",
                ).__dict__,
                "source_role": "lexical_candidate",
                "corpus_policy": "candidate_only",
                "source_format": "docx",
                "locator": "docx:table=0,row=1,col=0",
            }
        )
        entry = corpus.build_entry(
            corpus.EntryGroup("addictive", [candidate])
        )
        self.assertEqual(entry["status"], "candidate_only")
        self.assertEqual(entry["skill_profile"]["labels"], [])
        self.assertFalse(entry["image_plan"]["eligible"])
        self.assertEqual(entry["source_rows"], [])
        self.assertEqual(entry["candidate_sources"], ["Edge Vocabulary"])

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master_path = root / "master.tsv"
            catalog_path = root / "catalog.json"
            corpus.write_master_tsv(master_path, [entry])
            corpus.write_public_catalog(
                catalog_path,
                {
                    "schema_version": 3,
                    "generated_at": "test",
                    "statistics": {},
                    "sources": [],
                    "entries": [entry],
                },
            )
            with master_path.open(encoding="utf-8", newline="") as handle:
                master_rows = list(csv.DictReader(handle, delimiter="\t"))
            catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        self.assertEqual(master_rows, [])
        self.assertEqual(catalog["entries"], [])

    def test_public_catalog_counts_only_target_source_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            catalog_path = Path(directory) / "catalog.json"
            corpus.write_public_catalog(
                catalog_path,
                {
                    "schema_version": 3,
                    "generated_at": "test",
                    "statistics": {
                        "source_rows": 2,
                        "target_source_rows": 1,
                        "candidate_source_rows": 1,
                        "candidate_only_entries": 1,
                    },
                    "sources": [],
                    "entries": [],
                },
            )
            catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        self.assertEqual(catalog["statistics"]["source_rows"], 1)
        self.assertNotIn(
            "candidate_source_rows",
            catalog["statistics"],
        )
        self.assertNotIn(
            "candidate_only_entries",
            catalog["statistics"],
        )

    def test_candidate_overlap_does_not_change_target_metadata(self):
        target = self.row(
            source="Oxford 3000",
            headword="classic",
            pos="n.",
            cefr="A2",
        )
        candidate = corpus.SourceRow(
            **{
                **self.row(
                    source="Edge Vocabulary",
                    headword="classic",
                    pos="adj.",
                    cefr="C1",
                ).__dict__,
                "source_role": "lexical_candidate",
                "corpus_policy": "candidate_only",
                "source_format": "docx",
            }
        )
        target_only = corpus.build_entry(
            corpus.EntryGroup("classic", [target])
        )
        combined = corpus.build_entry(
            corpus.EntryGroup("classic", [target, candidate])
        )
        self.assertEqual(combined["status"], "active")
        self.assertEqual(
            combined["parts_of_speech"],
            target_only["parts_of_speech"],
        )
        self.assertEqual(combined["cefr_levels"], target_only["cefr_levels"])
        self.assertEqual(
            combined["skill_profile"],
            target_only["skill_profile"],
        )
        self.assertEqual(combined["source_count"], 1)
        self.assertEqual(combined["sources"], ["Oxford 3000"])
        self.assertEqual(
            combined["candidate_sources"],
            ["Edge Vocabulary"],
        )

    def test_reader_validates_and_preserves_supplementary_policy(self):
        fields = (
            "source",
            "registry_source_id",
            "raw_term",
            "headword",
            "pos",
            "cefr",
            "topic_or_section",
            "pdf_page",
            "source_ref",
            "definition",
            "notes",
            "source_role",
            "corpus_policy",
            "source_format",
            "locator",
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.tsv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=fields,
                    delimiter="\t",
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "source": "Edge Vocabulary",
                        "registry_source_id": (
                            "edge-2e-1bu7-vocabulary-moves"
                        ),
                        "raw_term": "draws a card",
                        "headword": "draw a card",
                        "pos": "verb phrase",
                        "cefr": "",
                        "topic_or_section": "Moves in games",
                        "pdf_page": "",
                        "source_ref": "",
                        "definition": "",
                        "notes": "",
                        "source_role": "lexical_candidate",
                        "corpus_policy": "candidate_only",
                        "source_format": "docx",
                        "locator": "docx:table=0,row=1,col=0",
                    }
                )
            rows = corpus.read_tsv(path)
            path.write_text(
                path.read_text(encoding="utf-8").replace(
                    "candidate_only",
                    "target",
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                ValueError,
                "requires corpus_policy 'candidate_only'",
            ):
                corpus.read_tsv(path)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].corpus_policy, "candidate_only")
        self.assertEqual(rows[0].source_format, "docx")
        self.assertEqual(rows[0].locator, "docx:table=0,row=1,col=0")
        self.assertEqual(
            rows[0].registry_source_id,
            "edge-2e-1bu7-vocabulary-moves",
        )
        corpus.validate_supplementary_registry_links(
            rows,
            {
                "edge-2e-1bu7-vocabulary-moves": {
                    "source_role": "lexical_candidate",
                    "corpus_policy": "candidate_only",
                    "format": "docx",
                }
            },
        )
        with self.assertRaisesRegex(
            ValueError,
            "declares format='pdf', not 'docx'",
        ):
            corpus.validate_supplementary_registry_links(
                rows,
                {
                    "edge-2e-1bu7-vocabulary-moves": {
                        "source_role": "lexical_candidate",
                        "corpus_policy": "candidate_only",
                        "format": "pdf",
                    }
                },
            )


if __name__ == "__main__":
    unittest.main()
