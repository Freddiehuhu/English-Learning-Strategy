from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path


SOURCE_SHA256 = "a" * 64
RENDER_SHA256 = "b" * 64
MANIFEST_SHA256 = "c" * 64
SOURCE_BYTE_SIZE = 1000


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
        "byte_size": SOURCE_BYTE_SIZE,
        "metadata": {"page_count": pages},
        "text_route": {"route": "pdf_native_text"},
    }


def render_evidence(
    source_id: str,
    *,
    pages: list[int],
    page_count: int,
    source_sha256: str = SOURCE_SHA256,
    manifest_sha256: str = MANIFEST_SHA256,
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
        "_manifest_sha256": manifest_sha256,
    }


def candidate_provenance(
    source_id: str,
    *,
    sha256: str = "d" * 64,
    byte_size: int = 200,
    row_count: int = 2,
    page_row_counts: dict[str, int] | None = None,
) -> dict:
    return {
        "sha256": sha256,
        "byte_size": byte_size,
        "row_count": row_count,
        "source_counts": {source_id: row_count},
        "page_row_counts": page_row_counts or {},
    }


def provenance_audit(
    source_id: str,
    *,
    row_count: int = 2,
    candidate_sha256: str = "d" * 64,
    candidate_byte_size: int = 200,
    pages_parsed: list[int] | None = None,
    page_row_counts: dict[str, int] | None = None,
) -> dict:
    return {
        "id": source_id,
        "status": "candidate_extracted_needs_editorial_review",
        "provenance_schema_version": 1,
        "source_sha256": SOURCE_SHA256,
        "source_byte_size": SOURCE_BYTE_SIZE,
        "source_page_count": 256,
        "candidate_tsv_sha256": candidate_sha256,
        "candidate_tsv_byte_size": candidate_byte_size,
        "candidate_tsv_row_count": row_count,
        "candidate_tsv_source_counts": {source_id: row_count},
        "render_manifest_sha256": MANIFEST_SHA256,
        "extracted_row_count": row_count,
        "pages_parsed": pages_parsed or [250, 251, 252, 253, 254, 255],
        "visual_sample_pages": pages_parsed
        or [250, 251, 252, 253, 254, 255],
        **(
            {"page_row_counts": page_row_counts}
            if page_row_counts is not None
            else {}
        ),
    }


class SupplementaryReviewStatusTests(unittest.TestCase):
    def test_directory_collection_is_sorted_deduplicated_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as raw_dir:
            directory = Path(raw_dir)
            first = directory / "a-batch.json"
            second = directory / "b-batch.json"
            ignored = directory / "target-metadata.json"
            for path in (first, second, ignored):
                path.write_text("{}", encoding="utf-8")
            collected = status_builder.collect_paths(
                [second],
                directory,
                "*-batch.json",
                label="audit",
            )
            self.assertEqual(collected, [first, second])

        with self.assertRaisesRegex(ValueError, "does not exist"):
            status_builder.collect_paths(
                [],
                Path(raw_dir) / "missing",
                "*.json",
                label="audit",
            )

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

    def test_declared_source_and_candidate_digests_are_verified(self):
        source = inventory_source("lexical")
        candidate_sha256 = "d" * 64
        audit = {
            "id": "lexical",
            "status": "candidate_extracted_needs_editorial_review",
            "source_sha256": SOURCE_SHA256,
            "candidate_tsv_sha256": candidate_sha256,
            "extracted_row_count": 2,
            "pages_parsed": [2],
            "visual_sample_pages": [2],
        }
        payload = status_builder.build_status(
            {"lexical": source},
            {"lexical": audit},
            Counter({"lexical": 2}),
            evidence_digests={"lexical": candidate_sha256},
        )
        row = payload["sources"][0]
        self.assertEqual(row["audit_source_sha256"], SOURCE_SHA256)
        self.assertEqual(row["candidate_tsv_sha256"], candidate_sha256)

        with self.assertRaisesRegex(ValueError, "candidate_tsv_sha256"):
            status_builder.build_status(
                {"lexical": source},
                {"lexical": audit},
                Counter({"lexical": 2}),
                evidence_digests={"lexical": "e" * 64},
            )
        with self.assertRaisesRegex(ValueError, "source_sha256"):
            status_builder.build_status(
                {"lexical": source},
                {"lexical": {**audit, "source_sha256": "e" * 64}},
                Counter({"lexical": 2}),
                evidence_digests={"lexical": candidate_sha256},
            )

    def test_dedicated_evidence_file_digest_uses_exact_tsv_bytes(self):
        with tempfile.TemporaryDirectory() as raw_dir:
            path = Path(raw_dir) / "evidence.tsv"
            path.write_text(
                "registry_source_id\traw_term\nlexical\talpha\n",
                encoding="utf-8",
            )
            expected = hashlib.sha256(path.read_bytes()).hexdigest()
            digests = status_builder.evidence_file_digests([path])
        self.assertEqual(
            digests,
            {"lexical": expected},
        )

    def test_same_length_single_byte_candidate_change_fails_provenance(self):
        with tempfile.TemporaryDirectory() as raw_dir:
            path = Path(raw_dir) / "evidence.tsv"
            original = (
                "registry_source_id\traw_term\n"
                "lexical\talpha\n"
                "lexical\tbravo\n"
            )
            path.write_text(original, encoding="utf-8")
            original_provenance = status_builder.evidence_file_provenance(
                [path]
            )["lexical"]
            path.write_text(
                original.replace("alpha", "alpHa"),
                encoding="utf-8",
            )
            changed_provenance = status_builder.evidence_file_provenance(
                [path]
            )["lexical"]

        self.assertEqual(
            original_provenance["byte_size"],
            changed_provenance["byte_size"],
        )
        self.assertEqual(
            original_provenance["row_count"],
            changed_provenance["row_count"],
        )
        audit = provenance_audit(
            "lexical",
            candidate_sha256=original_provenance["sha256"],
            candidate_byte_size=original_provenance["byte_size"],
        )
        with self.assertRaisesRegex(ValueError, "candidate_tsv_sha256"):
            status_builder.build_status(
                {"lexical": inventory_source("lexical", pages=256)},
                {"lexical": audit},
                Counter({"lexical": 2}),
                {
                    "lexical": render_evidence(
                        "lexical",
                        pages=[250, 251, 252, 253, 254, 255],
                        page_count=256,
                    )
                },
                evidence_provenance={"lexical": changed_provenance},
            )

    def test_candidate_bytes_rows_and_source_counts_are_exact(self):
        source = inventory_source("lexical", pages=256)
        provenance = candidate_provenance("lexical")
        manifest = render_evidence(
            "lexical",
            pages=[250, 251, 252, 253, 254, 255],
            page_count=256,
        )
        mutations = {
            "candidate_tsv_byte_size": 201,
            "candidate_tsv_row_count": 3,
            "candidate_tsv_source_counts": {"lexical": 1, "other": 1},
        }
        for field, value in mutations.items():
            with self.subTest(field=field):
                audit = {**provenance_audit("lexical"), field: value}
                with self.assertRaisesRegex(ValueError, field):
                    status_builder.build_status(
                        {"lexical": source},
                        {"lexical": audit},
                        Counter({"lexical": 2}),
                        {"lexical": manifest},
                        evidence_provenance={"lexical": provenance},
                    )

    def test_pending_candidate_rejects_wrong_render_source_or_page_count(self):
        source = inventory_source("lexical", pages=256)
        audit = provenance_audit("lexical")
        provenance = candidate_provenance("lexical")
        wrong_manifests = {
            "source_sha256": render_evidence(
                "lexical",
                pages=[250, 251, 252, 253, 254, 255],
                page_count=256,
                source_sha256="e" * 64,
            ),
            "source_page_count": render_evidence(
                "lexical",
                pages=[250, 251, 252, 253, 254, 255],
                page_count=255,
            ),
        }
        for field, manifest in wrong_manifests.items():
            with self.subTest(field=field):
                with self.assertRaisesRegex(ValueError, field):
                    status_builder.build_status(
                        {"lexical": source},
                        {"lexical": audit},
                        Counter({"lexical": 2}),
                        {"lexical": manifest},
                        evidence_provenance={"lexical": provenance},
                    )

    def test_pending_candidate_rejects_wrong_render_manifest_digest(self):
        with self.assertRaisesRegex(ValueError, "render_manifest_sha256"):
            status_builder.build_status(
                {"lexical": inventory_source("lexical", pages=256)},
                {
                    "lexical": {
                        **provenance_audit("lexical"),
                        "render_manifest_sha256": "e" * 64,
                    }
                },
                Counter({"lexical": 2}),
                {
                    "lexical": render_evidence(
                        "lexical",
                        pages=[250, 251, 252, 253, 254, 255],
                        page_count=256,
                    )
                },
                evidence_provenance={
                    "lexical": candidate_provenance("lexical")
                },
            )

    def test_pending_candidate_requires_render_for_every_parsed_page(self):
        with self.assertRaisesRegex(
            ValueError,
            r"missing parsed pages \[255\]",
        ):
            status_builder.build_status(
                {"lexical": inventory_source("lexical", pages=256)},
                {"lexical": provenance_audit("lexical")},
                Counter({"lexical": 2}),
                {
                    "lexical": render_evidence(
                        "lexical",
                        pages=[250, 251, 252, 253, 254],
                        page_count=256,
                    )
                },
                evidence_provenance={
                    "lexical": candidate_provenance("lexical")
                },
            )

    def test_strict_source_sha_size_and_page_count_are_exact(self):
        source = inventory_source("lexical", pages=256)
        manifest = render_evidence(
            "lexical",
            pages=[250, 251, 252, 253, 254, 255],
            page_count=256,
        )
        mutations = {
            "source_sha256": "e" * 64,
            "source_byte_size": SOURCE_BYTE_SIZE + 1,
            "source_page_count": 255,
        }
        for field, value in mutations.items():
            with self.subTest(field=field):
                with self.assertRaisesRegex(ValueError, field):
                    status_builder.build_status(
                        {"lexical": source},
                        {
                            "lexical": {
                                **provenance_audit("lexical"),
                                field: value,
                            }
                        },
                        Counter({"lexical": 2}),
                        {"lexical": manifest},
                        evidence_provenance={
                            "lexical": candidate_provenance("lexical")
                        },
                    )

    def test_partial_pages_can_pass_provenance_without_claiming_completion(self):
        source = inventory_source("lexical", pages=256)
        audit = provenance_audit("lexical")
        provenance = candidate_provenance("lexical")
        payload = status_builder.build_status(
            {"lexical": source},
            {"lexical": audit},
            Counter({"lexical": 2}),
            {
                "lexical": render_evidence(
                    "lexical",
                    pages=[250, 251, 252, 253, 254, 255],
                    page_count=256,
                )
            },
            evidence_provenance={"lexical": provenance},
        )
        row = payload["sources"][0]
        self.assertTrue(row["provenance_evidence"]["passed"])
        self.assertFalse(row["completion_evidence"]["required"])
        self.assertFalse(row["fully_evaluated"])
        self.assertEqual(
            row["parsed_page_numbers"],
            [250, 251, 252, 253, 254, 255],
        )

    def test_real_efe_partial_batch_passes_exact_provenance(self):
        root = Path(__file__).resolve().parents[2]
        inventory = status_builder.load_inventory(
            root / "data/ielts-corpus/supplemental-source-inventory.json"
        )
        audit_path = (
            root
            / "data/ielts-corpus/supplementary-audits"
            / "english-for-everyone-junior-batch.json"
        )
        evidence_path = (
            root
            / "data/ielts-corpus/supplementary-input"
            / "english-for-everyone-junior-candidates.tsv"
        )
        manifest_path = (
            root
            / "data/ielts-corpus/supplementary-render-evidence"
            / "english-for-everyone-junior-beginners.json"
        )
        evidence_provenance = status_builder.evidence_file_provenance(
            [evidence_path]
        )
        payload = status_builder.build_status(
            inventory,
            status_builder.load_audits([audit_path]),
            status_builder.count_evidence([evidence_path]),
            status_builder.load_render_evidence([manifest_path]),
            evidence_provenance=evidence_provenance,
        )
        row = next(
            row
            for row in payload["sources"]
            if row["id"] == "english-for-everyone-junior-beginners"
        )
        self.assertTrue(row["provenance_evidence"]["passed"])
        self.assertFalse(row["fully_evaluated"])
        self.assertEqual(row["pages_parsed"], 6)

    def test_legacy_audit_without_provenance_schema_is_compatible(self):
        source = inventory_source("legacy", pages=10)
        audit = {
            "id": "legacy",
            "status": "candidate_extracted_needs_editorial_review",
            "extracted_row_count": 1,
            "pages_parsed": [2],
            "visual_sample_pages": [2],
        }
        payload = status_builder.build_status(
            {"legacy": source},
            {"legacy": audit},
            Counter({"legacy": 1}),
        )
        row = payload["sources"][0]
        self.assertFalse(row["provenance_evidence"]["declared"])
        self.assertFalse(row["fully_evaluated"])

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
