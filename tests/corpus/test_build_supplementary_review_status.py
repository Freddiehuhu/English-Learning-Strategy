from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path


SOURCE_SHA256 = "a" * 64
RENDER_SHA256 = "b" * 64


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "corpus"
    / "build_supplementary_review_status.py"
)
SPEC = importlib.util.spec_from_file_location(
    "build_supplementary_review_status",
    MODULE_PATH,
)
assert SPEC and SPEC.loader
status_builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = status_builder
SPEC.loader.exec_module(status_builder)


def inventory_source(
    source_id: str,
    *,
    policy: str = "candidate_only",
    pages: int = 10,
) -> dict:
    return {
        "id": source_id,
        "display_name": source_id,
        "format": "pdf",
        "source_role": (
            "lexical_candidate"
            if policy == "candidate_only"
            else "pedagogy_reference"
        ),
        "corpus_policy": policy,
        "sha256": SOURCE_SHA256,
        "metadata": {"page_count": pages},
        "text_route": {"route": "pdf_native_text"},
    }


def render_evidence(
    source_id: str,
    *,
    pages: list[int],
    page_count: int,
    source_sha256: str = SOURCE_SHA256,
) -> dict:
    return {
        "schema_version": 1,
        "source_id": source_id,
        "source_format": "pdf",
        "source_sha256": source_sha256,
        "source_page_count": page_count,
        "renderer": {"name": "pdftoppm", "version": "test"},
        "render_settings": {"format": "png", "dpi": 144},
        "rendered_pages": [
            {
                "page": page,
                "sha256": RENDER_SHA256,
                "byte_size": 100,
                "width_px": 100,
                "height_px": 100,
            }
            for page in pages
        ],
    }


class SupplementaryReviewStatusTests(unittest.TestCase):
    def test_registration_is_not_reported_as_evaluation(self):
        payload = status_builder.build_status(
            {"source-a": inventory_source("source-a")},
            {},
            Counter(),
        )
        row = payload["sources"][0]
        self.assertEqual(
            row["review_status"],
            "registered_extraction_pending",
        )
        self.assertFalse(row["fully_evaluated"])
        self.assertEqual(
            payload["statistics"]["fully_evaluated_source_count"],
            0,
        )

    def test_extracted_rows_without_audit_remain_pending(self):
        payload = status_builder.build_status(
            {"source-a": inventory_source("source-a")},
            {},
            Counter({"source-a": 7}),
        )
        row = payload["sources"][0]
        self.assertEqual(
            row["review_status"],
            "candidate_extracted_audit_pending",
        )
        self.assertFalse(row["fully_evaluated"])

    def test_content_reviewed_empty_overview_can_be_fully_evaluated(self):
        source = inventory_source("overview", pages=1)
        audit = {
            "id": "overview",
            "status": "content_reviewed_no_lexical_targets",
            "extracted_row_count": 0,
            "pages_parsed": [1],
            "visual_sample_pages": [1],
        }
        payload = status_builder.build_status(
            {"overview": source},
            {"overview": audit},
            Counter(),
            {
                "overview": render_evidence(
                    "overview",
                    pages=[1],
                    page_count=1,
                )
            },
        )
        self.assertTrue(payload["sources"][0]["fully_evaluated"])
        self.assertTrue(
            payload["sources"][0]["completion_evidence"]["passed"]
        )

    def test_manual_audit_without_render_evidence_is_blocked(self):
        source = inventory_source("overview", pages=1)
        audit = {
            "id": "overview",
            "status": "content_reviewed_no_lexical_targets",
            "extracted_row_count": 0,
            "pages_parsed": [1],
            "visual_sample_pages": [1],
        }
        payload = status_builder.build_status(
            {"overview": source},
            {"overview": audit},
            Counter(),
        )
        row = payload["sources"][0]
        self.assertFalse(row["fully_evaluated"])
        self.assertIn(
            "render_evidence_manifest_missing",
            row["completion_evidence"]["failure_codes"],
        )
        self.assertEqual(
            payload["statistics"][
                "completion_claim_blocked_by_evidence_source_count"
            ],
            1,
        )

    def test_completion_requires_exact_full_page_and_render_coverage(self):
        source = inventory_source("method", policy="methods_only", pages=3)
        audit = {
            "id": "method",
            "status": "method_reviewed",
            "extracted_row_count": 0,
            "pages_parsed": [1, 3],
            "visual_sample_pages": [1],
        }
        payload = status_builder.build_status(
            {"method": source},
            {"method": audit},
            Counter(),
            {
                "method": render_evidence(
                    "method",
                    pages=[1],
                    page_count=3,
                )
            },
        )
        gate = payload["sources"][0]["completion_evidence"]
        self.assertFalse(gate["passed"])
        self.assertIn("all_source_pages_must_be_parsed", gate["failure_codes"])
        self.assertIn(
            "render_evidence_missing_for_parsed_pages",
            gate["failure_codes"],
        )

    def test_count_only_page_claim_cannot_pass_completion_gate(self):
        source = inventory_source("method", policy="methods_only", pages=2)
        audit = {
            "id": "method",
            "status": "method_reviewed",
            "extracted_row_count": 0,
            "pages_parsed": 2,
            "visual_sample_pages": [1],
        }
        payload = status_builder.build_status(
            {"method": source},
            {"method": audit},
            Counter(),
            {
                "method": render_evidence(
                    "method",
                    pages=[1, 2],
                    page_count=2,
                )
            },
        )
        gate = payload["sources"][0]["completion_evidence"]
        self.assertFalse(gate["passed"])
        self.assertIn(
            "exact_parsed_page_numbers_required",
            gate["failure_codes"],
        )

    def test_render_manifest_must_bind_to_inventory_source_hash(self):
        source = inventory_source("overview", pages=1)
        audit = {
            "id": "overview",
            "status": "content_reviewed_no_lexical_targets",
            "extracted_row_count": 0,
            "pages_parsed": [1],
            "visual_sample_pages": [1],
        }
        payload = status_builder.build_status(
            {"overview": source},
            {"overview": audit},
            Counter(),
            {
                "overview": render_evidence(
                    "overview",
                    pages=[1],
                    page_count=1,
                    source_sha256="c" * 64,
                )
            },
        )
        gate = payload["sources"][0]["completion_evidence"]
        self.assertFalse(gate["passed"])
        self.assertIn(
            "render_evidence_source_sha256_mismatch",
            gate["failure_codes"],
        )

    def test_complete_requires_explicit_editorial_review(self):
        source = inventory_source("lexical")
        audit = {
            "id": "lexical",
            "status": "complete",
            "extracted_row_count": 2,
            "pages_parsed": 10,
            "visual_sample_pages": [1, 10],
        }
        with self.assertRaisesRegex(
            ValueError,
            "editorial_review_complete",
        ):
            status_builder.build_status(
                {"lexical": source},
                {"lexical": audit},
                Counter({"lexical": 2}),
            )

    def test_audit_count_must_match_evidence(self):
        source = inventory_source("lexical")
        audit = {
            "id": "lexical",
            "status": "candidate_extracted_needs_editorial_review",
            "extracted_row_count": 3,
            "pages_parsed": 10,
            "visual_sample_pages": [1],
        }
        with self.assertRaisesRegex(ValueError, "does not match"):
            status_builder.build_status(
                {"lexical": source},
                {"lexical": audit},
                Counter({"lexical": 2}),
            )

    def test_methods_sources_have_a_distinct_pending_state(self):
        payload = status_builder.build_status(
            {
                "method": inventory_source(
                    "method",
                    policy="methods_only",
                )
            },
            {},
            Counter(),
        )
        self.assertEqual(
            payload["sources"][0]["review_status"],
            "registered_method_review_pending",
        )

    def test_exact_parsed_page_lists_are_counted_without_claiming_full_book(self):
        source = inventory_source("lexical", pages=100)
        audit = {
            "id": "lexical",
            "status": "candidate_extracted_needs_editorial_review",
            "extracted_row_count": 2,
            "pages_parsed": [91, 92, 93],
            "visual_sample_pages": [91, 93],
        }
        payload = status_builder.build_status(
            {"lexical": source},
            {"lexical": audit},
            Counter({"lexical": 2}),
        )
        row = payload["sources"][0]
        self.assertEqual(row["pages_parsed"], 3)
        self.assertEqual(row["parsed_page_numbers"], [91, 92, 93])
        self.assertFalse(row["fully_evaluated"])

    def test_duplicate_or_out_of_range_parsed_pages_are_rejected(self):
        source = inventory_source("lexical", pages=10)
        duplicate = {
            "id": "lexical",
            "status": "candidate_extracted_needs_editorial_review",
            "extracted_row_count": 1,
            "pages_parsed": [2, 2],
            "visual_sample_pages": [2],
        }
        with self.assertRaisesRegex(ValueError, "duplicate"):
            status_builder.build_status(
                {"lexical": source},
                {"lexical": duplicate},
                Counter({"lexical": 1}),
            )
        out_of_range = {
            **duplicate,
            "pages_parsed": [11],
            "visual_sample_pages": [10],
        }
        with self.assertRaisesRegex(ValueError, "exceeds|invalid"):
            status_builder.build_status(
                {"lexical": source},
                {"lexical": out_of_range},
                Counter({"lexical": 1}),
            )

    def test_duplicate_visual_sample_pages_are_rejected(self):
        source = inventory_source("lexical", pages=10)
        audit = {
            "id": "lexical",
            "status": "candidate_extracted_needs_editorial_review",
            "extracted_row_count": 1,
            "pages_parsed": [2],
            "visual_sample_pages": [2, 2],
        }
        with self.assertRaisesRegex(ValueError, "duplicate visual sample"):
            status_builder.build_status(
                {"lexical": source},
                {"lexical": audit},
                Counter({"lexical": 1}),
            )

    def test_quality_blocker_is_never_fully_evaluated(self):
        source = inventory_source("lexical", pages=10)
        audit = {
            "id": "lexical",
            "status": "extraction_quality_review_required",
            "extracted_row_count": 0,
            "pages_parsed": [1],
            "visual_sample_pages": [1],
        }
        payload = status_builder.build_status(
            {"lexical": source},
            {"lexical": audit},
            Counter(),
        )
        self.assertFalse(payload["sources"][0]["fully_evaluated"])
        self.assertEqual(
            payload["statistics"]["sources_with_quality_blocker"],
            1,
        )

    def test_markdown_report_states_strict_completion_rule(self):
        payload = status_builder.build_status(
            {
                "pending": inventory_source("pending"),
                "overview": inventory_source("overview", pages=1),
            },
            {
                "overview": {
                    "id": "overview",
                    "status": "content_reviewed_no_lexical_targets",
                    "extracted_row_count": 0,
                    "pages_parsed": [1],
                    "visual_sample_pages": [1],
                }
            },
            Counter(),
        )
        report = status_builder.render_markdown(payload)
        self.assertIn("不等于“整份资料已仔细评估”", report)
        self.assertIn("严格意义上已完成评估 | 0", report)
        self.assertIn("声称完成但被证据门禁阻断 | 1", report)
        self.assertIn("缺少渲染证据清单", report)
        self.assertIn("已登记，词汇抽取尚未开始（1）", report)
        self.assertIn("内容已评估，无可纳入词汇目标（1）", report)

    def test_render_evidence_loader_rejects_duplicate_page_numbers(self):
        manifest = render_evidence(
            "overview",
            pages=[1, 1],
            page_count=1,
        )
        with tempfile.TemporaryDirectory() as raw_dir:
            path = Path(raw_dir) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate rendered page"):
                status_builder.load_render_evidence([path])

    def test_render_evidence_loader_records_manifest_hash(self):
        manifest = render_evidence(
            "overview",
            pages=[1],
            page_count=1,
        )
        with tempfile.TemporaryDirectory() as raw_dir:
            path = Path(raw_dir) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            loaded = status_builder.load_render_evidence([path])
        self.assertRegex(
            loaded["overview"]["_manifest_sha256"],
            r"^[0-9a-f]{64}$",
        )


if __name__ == "__main__":
    unittest.main()
