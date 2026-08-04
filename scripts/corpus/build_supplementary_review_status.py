#!/usr/bin/env python3
"""Build an honest per-source review ledger for supplementary materials.

Registration, extraction, visual sampling and editorial completion are
different states. This script keeps them separate so a source cannot be marked
"complete" merely because its file exists or an extractor produced rows.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


DEFAULT_PENDING_STATUS = {
    "candidate_only": "registered_extraction_pending",
    "enrich_only": "registered_extraction_pending",
    "methods_only": "registered_method_review_pending",
}

ALLOWED_STATUSES = {
    "registered_extraction_pending",
    "registered_method_review_pending",
    "candidate_extracted_audit_pending",
    "candidate_extracted_needs_editorial_review",
    "candidate_extracted_source_pages_missing",
    "extraction_quality_review_required",
    "relation_extraction_needs_editorial_review",
    "content_reviewed_no_lexical_targets",
    "method_reviewed",
    "complete",
}

FULLY_EVALUATED_STATUSES = {
    "content_reviewed_no_lexical_targets",
    "method_reviewed",
    "complete",
}

SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")

STATUS_LABELS_ZH = {
    "registered_extraction_pending": "已登记，词汇抽取尚未开始",
    "registered_method_review_pending": "已登记，教学法评估尚未开始",
    "candidate_extracted_audit_pending": "候选词已抽取，来源审计待补",
    "candidate_extracted_needs_editorial_review": "候选词已抽取，逐词编辑复核待完成",
    "candidate_extracted_source_pages_missing": "可见候选词已抽取，但来源文件缺页",
    "extraction_quality_review_required": "来源质量阻塞，需人工复核后再抽取",
    "relation_extraction_needs_editorial_review": "词汇关系已抽取，编辑复核待完成",
    "content_reviewed_no_lexical_targets": "内容已评估，无可纳入词汇目标",
    "method_reviewed": "教学法内容已评估",
    "complete": "词汇内容与编辑复核均已完成",
}

EVIDENCE_FAILURE_LABELS_ZH = {
    "source_sha256_missing_or_invalid": "来源哈希缺失或格式错误",
    "pdf_page_count_missing": "PDF 总页数缺失",
    "exact_parsed_page_numbers_required": "缺少逐页可核查页码",
    "all_source_pages_must_be_parsed": "尚未逐页覆盖整份来源",
    "visual_sample_pages_required": "缺少视觉抽查页",
    "visual_sample_not_in_parsed_pages": "视觉抽查页不在已解析页中",
    "render_evidence_manifest_missing": "缺少渲染证据清单",
    "render_evidence_source_format_mismatch": "渲染证据格式不匹配",
    "render_evidence_source_sha256_mismatch": "渲染证据与来源哈希不匹配",
    "render_evidence_page_count_mismatch": "渲染证据总页数不匹配",
    "render_evidence_missing_for_parsed_pages": "已解析页缺少渲染哈希",
    "render_evidence_missing_for_visual_samples": "视觉抽查页缺少渲染哈希",
}


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return payload


def load_inventory(path: Path) -> dict[str, dict[str, Any]]:
    payload = load_json(path)
    sources = payload.get("sources")
    if not isinstance(sources, list):
        raise ValueError(f"{path}: sources must be a list")
    inventory: dict[str, dict[str, Any]] = {}
    for source in sources:
        if not isinstance(source, dict) or not source.get("id"):
            raise ValueError(f"{path}: invalid source entry")
        source_id = str(source["id"])
        if source_id in inventory:
            raise ValueError(f"{path}: duplicate source id {source_id}")
        inventory[source_id] = source
    return inventory


def load_audits(paths: list[Path]) -> dict[str, dict[str, Any]]:
    audits: dict[str, dict[str, Any]] = {}
    for path in sorted(paths):
        payload = load_json(path)
        sources = payload.get("sources")
        if not isinstance(sources, list):
            raise ValueError(f"{path}: audit sources must be a list")
        for audit in sources:
            if not isinstance(audit, dict) or not audit.get("id"):
                raise ValueError(f"{path}: invalid audit source")
            source_id = str(audit["id"])
            if source_id in audits:
                raise ValueError(
                    f"{path}: duplicate audit for source {source_id}"
                )
            status = str(audit.get("status") or "")
            if status not in ALLOWED_STATUSES:
                raise ValueError(
                    f"{path}: unsupported status {status!r} for {source_id}"
                )
            audits[source_id] = audit
    return audits


def validate_sha256(value: object) -> bool:
    return isinstance(value, str) and SHA256_PATTERN.fullmatch(value) is not None


def load_render_evidence(paths: list[Path]) -> dict[str, dict[str, Any]]:
    """Load path-free PDF render manifests used by the completion gate.

    A manifest is generated from an actual source file by
    ``build_pdf_render_evidence.py``. It binds exact PDF page numbers and
    rendered PNG hashes to the source SHA-256 without committing the private
    source path or copyrighted page images.
    """

    manifests: dict[str, dict[str, Any]] = {}
    for path in sorted(paths):
        raw = path.read_bytes()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError(f"{path}: invalid render evidence JSON") from error
        if not isinstance(payload, dict):
            raise ValueError(f"{path}: expected a JSON object")
        if payload.get("schema_version") != 1:
            raise ValueError(f"{path}: render evidence schema_version must be 1")
        source_id = payload.get("source_id")
        if not isinstance(source_id, str) or not source_id:
            raise ValueError(f"{path}: render evidence source_id is required")
        if source_id in manifests:
            raise ValueError(
                f"{path}: duplicate render evidence for source {source_id}"
            )
        if payload.get("source_format") != "pdf":
            raise ValueError(
                f"{path}: render evidence source_format must be 'pdf'"
            )
        if not validate_sha256(payload.get("source_sha256")):
            raise ValueError(
                f"{path}: render evidence source_sha256 is invalid"
            )
        source_page_count = payload.get("source_page_count")
        if (
            not isinstance(source_page_count, int)
            or isinstance(source_page_count, bool)
            or source_page_count < 1
        ):
            raise ValueError(
                f"{path}: render evidence source_page_count is invalid"
            )
        renderer = payload.get("renderer")
        if (
            not isinstance(renderer, dict)
            or not isinstance(renderer.get("name"), str)
            or not renderer.get("name")
            or not isinstance(renderer.get("version"), str)
            or not renderer.get("version")
        ):
            raise ValueError(f"{path}: renderer name and version are required")
        settings = payload.get("render_settings")
        if (
            not isinstance(settings, dict)
            or settings.get("format") != "png"
            or not isinstance(settings.get("dpi"), int)
            or isinstance(settings.get("dpi"), bool)
            or settings.get("dpi") < 36
        ):
            raise ValueError(f"{path}: invalid render_settings")
        pages = payload.get("rendered_pages")
        if not isinstance(pages, list) or not pages:
            raise ValueError(f"{path}: rendered_pages must be a non-empty list")
        page_numbers: set[int] = set()
        normalized_pages: list[dict[str, Any]] = []
        for entry in pages:
            if not isinstance(entry, dict):
                raise ValueError(f"{path}: rendered page must be an object")
            page = entry.get("page")
            byte_size = entry.get("byte_size")
            width_px = entry.get("width_px")
            height_px = entry.get("height_px")
            if (
                not isinstance(page, int)
                or isinstance(page, bool)
                or page < 1
                or page > source_page_count
            ):
                raise ValueError(f"{path}: invalid rendered page number")
            if page in page_numbers:
                raise ValueError(f"{path}: duplicate rendered page {page}")
            if not validate_sha256(entry.get("sha256")):
                raise ValueError(f"{path}: invalid rendered page SHA-256")
            if any(
                not isinstance(value, int)
                or isinstance(value, bool)
                or value < 1
                for value in (byte_size, width_px, height_px)
            ):
                raise ValueError(
                    f"{path}: rendered page dimensions/size are invalid"
                )
            page_numbers.add(page)
            normalized_pages.append(
                {
                    "page": page,
                    "sha256": entry["sha256"],
                    "byte_size": byte_size,
                    "width_px": width_px,
                    "height_px": height_px,
                }
            )
        manifest = dict(payload)
        manifest["rendered_pages"] = sorted(
            normalized_pages,
            key=lambda entry: entry["page"],
        )
        manifest["_manifest_sha256"] = hashlib.sha256(raw).hexdigest()
        manifests[source_id] = manifest
    return manifests


def count_evidence(paths: list[Path]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for path in sorted(paths):
        with path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            fields = set(reader.fieldnames or [])
            if "registry_source_id" not in fields:
                raise ValueError(
                    f"{path}: missing registry_source_id column"
                )
            for row in reader:
                source_id = str(row.get("registry_source_id") or "").strip()
                if not source_id:
                    raise ValueError(
                        f"{path}: evidence row is missing registry_source_id"
                    )
                counts[source_id] += 1
    return counts


def evidence_file_provenance(paths: list[Path]) -> dict[str, dict[str, Any]]:
    """Bind a dedicated evidence TSV to its exact bytes and row makeup.

    Multi-source TSVs remain count-validated as before. An audit that declares
    exact candidate provenance is intentionally stricter: its source must have
    one dedicated evidence file so a same-row-count or same-byte-size content
    substitution cannot pass the review-ledger check.
    """

    provenance: dict[str, dict[str, Any]] = {}
    ambiguous: set[str] = set()
    for path in sorted(paths):
        source_counts: Counter[str] = Counter()
        page_counts: Counter[str] = Counter()
        row_count = 0
        with path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            fields = set(reader.fieldnames or [])
            if "registry_source_id" not in fields:
                raise ValueError(
                    f"{path}: missing registry_source_id column"
                )
            for row in reader:
                source_id = str(row.get("registry_source_id") or "").strip()
                if not source_id:
                    raise ValueError(
                        f"{path}: evidence row is missing registry_source_id"
                    )
                source_counts[source_id] += 1
                row_count += 1
                page = str(row.get("pdf_page") or "").strip()
                if page:
                    page_counts[page] += 1
        if len(source_counts) != 1:
            continue
        source_id = next(iter(source_counts))
        if source_id in ambiguous:
            continue
        if source_id in provenance:
            del provenance[source_id]
            ambiguous.add(source_id)
            continue
        raw = path.read_bytes()
        provenance[source_id] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "byte_size": len(raw),
            "row_count": row_count,
            "source_counts": dict(sorted(source_counts.items())),
            "page_row_counts": dict(
                sorted(page_counts.items(), key=lambda item: item[0])
            ),
        }
    return provenance


def evidence_file_digests(paths: list[Path]) -> dict[str, str]:
    """Return the legacy digest-only view of dedicated evidence TSVs."""

    return {
        source_id: str(details["sha256"])
        for source_id, details in evidence_file_provenance(paths).items()
    }


def page_count(source: dict[str, Any]) -> int:
    metadata = source.get("metadata")
    if not isinstance(metadata, dict):
        return 0
    return int(metadata.get("page_count") or 0)


def parsed_page_state(
    source_id: str,
    audit: dict[str, Any],
) -> tuple[int, list[int]]:
    raw = audit.get("pages_parsed", 0)
    if isinstance(raw, list):
        if any(
            not isinstance(value, int) or isinstance(value, bool) or value < 1
            for value in raw
        ):
            raise ValueError(f"{source_id}: invalid pages_parsed list")
        if len(set(raw)) != len(raw):
            raise ValueError(f"{source_id}: duplicate parsed page number")
        pages = sorted(raw)
        return len(pages), pages
    if not isinstance(raw, int) or isinstance(raw, bool) or raw < 0:
        raise ValueError(f"{source_id}: invalid pages_parsed value")

    exact = audit.get("parsed_page_numbers", [])
    if exact is None:
        exact = []
    if not isinstance(exact, list) or any(
        not isinstance(value, int) or isinstance(value, bool) or value < 1
        for value in exact
    ):
        raise ValueError(f"{source_id}: invalid parsed_page_numbers")
    if len(set(exact)) != len(exact):
        raise ValueError(f"{source_id}: duplicate parsed page number")
    pages = sorted(exact)
    if pages and len(pages) != raw:
        raise ValueError(
            f"{source_id}: pages_parsed={raw} does not match "
            f"parsed_page_numbers={len(pages)}"
        )
    return raw, pages


def validate_audit(
    source_id: str,
    source: dict[str, Any],
    audit: dict[str, Any],
    evidence_count: int,
    evidence_file_sha256: str = "",
    evidence_provenance: dict[str, Any] | None = None,
    render_manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    audit_count = int(audit.get("extracted_row_count") or 0)
    if audit_count != evidence_count:
        raise ValueError(
            f"{source_id}: audit extracted_row_count={audit_count} does not "
            f"match evidence rows={evidence_count}"
        )
    audited_source_sha256 = audit.get("source_sha256")
    if audited_source_sha256 is not None:
        if not validate_sha256(audited_source_sha256):
            raise ValueError(f"{source_id}: audit source_sha256 is invalid")
        if audited_source_sha256 != source.get("sha256"):
            raise ValueError(
                f"{source_id}: audit source_sha256 does not match inventory"
            )
    audited_source_byte_size = audit.get("source_byte_size")
    if audited_source_byte_size is not None:
        if (
            not isinstance(audited_source_byte_size, int)
            or isinstance(audited_source_byte_size, bool)
            or audited_source_byte_size < 1
        ):
            raise ValueError(f"{source_id}: audit source_byte_size is invalid")
        if audited_source_byte_size != source.get("byte_size"):
            raise ValueError(
                f"{source_id}: audit source_byte_size does not match inventory"
            )
    audited_source_page_count = audit.get("source_page_count")
    if audited_source_page_count is not None:
        if (
            not isinstance(audited_source_page_count, int)
            or isinstance(audited_source_page_count, bool)
            or audited_source_page_count < 1
        ):
            raise ValueError(
                f"{source_id}: audit source_page_count is invalid"
            )
        if audited_source_page_count != page_count(source):
            raise ValueError(
                f"{source_id}: audit source_page_count does not match inventory"
            )
    audited_candidate_sha256 = audit.get("candidate_tsv_sha256")
    if audited_candidate_sha256 is not None:
        if not validate_sha256(audited_candidate_sha256):
            raise ValueError(
                f"{source_id}: audit candidate_tsv_sha256 is invalid"
            )
        if not evidence_file_sha256:
            raise ValueError(
                f"{source_id}: candidate digest requires one dedicated "
                "evidence TSV"
            )
        if audited_candidate_sha256 != evidence_file_sha256:
            raise ValueError(
                f"{source_id}: audit candidate_tsv_sha256 does not match "
                "evidence TSV"
            )
    candidate_field_names = {
        "candidate_tsv_byte_size",
        "candidate_tsv_row_count",
        "candidate_tsv_source_counts",
        "page_row_counts",
    }
    if any(field in audit for field in candidate_field_names):
        if evidence_provenance is None:
            raise ValueError(
                f"{source_id}: exact candidate provenance requires one "
                "dedicated evidence TSV"
            )
        candidate_byte_size = audit.get("candidate_tsv_byte_size")
        if candidate_byte_size is not None:
            if (
                not isinstance(candidate_byte_size, int)
                or isinstance(candidate_byte_size, bool)
                or candidate_byte_size < 1
            ):
                raise ValueError(
                    f"{source_id}: candidate_tsv_byte_size is invalid"
                )
            if candidate_byte_size != evidence_provenance.get("byte_size"):
                raise ValueError(
                    f"{source_id}: candidate_tsv_byte_size does not match "
                    "evidence TSV"
                )
        candidate_row_count = audit.get("candidate_tsv_row_count")
        if candidate_row_count is not None:
            if (
                not isinstance(candidate_row_count, int)
                or isinstance(candidate_row_count, bool)
                or candidate_row_count < 0
            ):
                raise ValueError(
                    f"{source_id}: candidate_tsv_row_count is invalid"
                )
            if candidate_row_count != evidence_provenance.get("row_count"):
                raise ValueError(
                    f"{source_id}: candidate_tsv_row_count does not match "
                    "evidence TSV"
                )
        candidate_source_counts = audit.get("candidate_tsv_source_counts")
        if candidate_source_counts is not None:
            if not isinstance(candidate_source_counts, dict) or any(
                not isinstance(key, str)
                or not key
                or not isinstance(value, int)
                or isinstance(value, bool)
                or value < 0
                for key, value in candidate_source_counts.items()
            ):
                raise ValueError(
                    f"{source_id}: candidate_tsv_source_counts is invalid"
                )
            if candidate_source_counts != evidence_provenance.get(
                "source_counts"
            ):
                raise ValueError(
                    f"{source_id}: candidate_tsv_source_counts does not "
                    "match evidence TSV"
                )
        audited_page_counts = audit.get("page_row_counts")
        if audited_page_counts is not None:
            if not isinstance(audited_page_counts, dict) or any(
                not isinstance(key, str)
                or not key
                or not isinstance(value, int)
                or isinstance(value, bool)
                or value < 0
                for key, value in audited_page_counts.items()
            ):
                raise ValueError(f"{source_id}: page_row_counts is invalid")
            if audited_page_counts != evidence_provenance.get(
                "page_row_counts"
            ):
                raise ValueError(
                    f"{source_id}: page_row_counts does not match evidence TSV"
                )

    provenance_schema_version = audit.get("provenance_schema_version")
    audited_manifest_sha256 = audit.get("render_manifest_sha256")
    if audited_manifest_sha256 is not None:
        if not validate_sha256(audited_manifest_sha256):
            raise ValueError(
                f"{source_id}: audit render_manifest_sha256 is invalid"
            )
        if render_manifest is None:
            raise ValueError(
                f"{source_id}: render_manifest_sha256 requires render evidence"
            )
        if audited_manifest_sha256 != render_manifest.get("_manifest_sha256"):
            raise ValueError(
                f"{source_id}: audit render_manifest_sha256 does not match "
                "render evidence"
            )
    if render_manifest is not None and (
        audited_manifest_sha256 is not None
        or provenance_schema_version is not None
    ):
        if render_manifest.get("source_format") != source.get("format"):
            raise ValueError(
                f"{source_id}: render evidence source_format does not match "
                "inventory"
            )
        if render_manifest.get("source_sha256") != source.get("sha256"):
            raise ValueError(
                f"{source_id}: render evidence source_sha256 does not match "
                "inventory"
            )
        if render_manifest.get("source_page_count") != page_count(source):
            raise ValueError(
                f"{source_id}: render evidence source_page_count does not "
                "match inventory"
            )

    if provenance_schema_version is not None:
        if provenance_schema_version != 1:
            raise ValueError(
                f"{source_id}: provenance_schema_version must be 1"
            )
        required_provenance_fields = {
            "source_sha256",
            "source_byte_size",
            "source_page_count",
            "candidate_tsv_sha256",
            "candidate_tsv_byte_size",
            "candidate_tsv_row_count",
            "candidate_tsv_source_counts",
            "render_manifest_sha256",
        }
        missing_fields = sorted(required_provenance_fields - set(audit))
        if missing_fields:
            raise ValueError(
                f"{source_id}: provenance schema is missing fields "
                f"{missing_fields}"
            )
    parsed, parsed_page_numbers = parsed_page_state(source_id, audit)
    available_pages = page_count(source)
    if parsed < 0 or (available_pages and parsed > available_pages):
        raise ValueError(
            f"{source_id}: invalid pages_parsed={parsed} for "
            f"page_count={available_pages}"
        )
    if available_pages and any(
        value > available_pages for value in parsed_page_numbers
    ):
        raise ValueError(
            f"{source_id}: parsed page exceeds page count"
        )
    samples = audit.get("visual_sample_pages", [])
    if not isinstance(samples, list) or any(
        not isinstance(value, int)
        or isinstance(value, bool)
        or value < 1
        for value in samples
    ):
        raise ValueError(f"{source_id}: invalid visual_sample_pages")
    if len(set(samples)) != len(samples):
        raise ValueError(f"{source_id}: duplicate visual sample page")
    if available_pages and any(value > available_pages for value in samples):
        raise ValueError(
            f"{source_id}: visual sample exceeds page count"
        )
    if provenance_schema_version == 1:
        rendered_page_numbers = {
            int(entry["page"])
            for entry in (render_manifest or {}).get("rendered_pages", [])
        }
        missing_parsed_pages = sorted(
            set(parsed_page_numbers) - rendered_page_numbers
        )
        if missing_parsed_pages:
            raise ValueError(
                f"{source_id}: render evidence is missing parsed pages "
                f"{missing_parsed_pages}"
            )
        missing_visual_sample_pages = sorted(
            set(samples) - rendered_page_numbers
        )
        if missing_visual_sample_pages:
            raise ValueError(
                f"{source_id}: render evidence is missing visual sample pages "
                f"{missing_visual_sample_pages}"
            )
    status = str(audit["status"])
    if status == "complete":
        if audit.get("editorial_review_complete") is not True:
            raise ValueError(
                f"{source_id}: complete requires editorial_review_complete=true"
            )
        if available_pages and parsed != available_pages:
            raise ValueError(
                f"{source_id}: complete requires all pages parsed"
            )
        if not samples:
            raise ValueError(
                f"{source_id}: complete requires visual page samples"
            )
    return {
        "declared": provenance_schema_version == 1,
        "passed": provenance_schema_version == 1,
        "schema_version": provenance_schema_version or 0,
        "source_sha256": str(audited_source_sha256 or ""),
        "candidate_tsv_sha256": str(audited_candidate_sha256 or ""),
        "candidate_tsv_byte_size": int(
            audit.get("candidate_tsv_byte_size") or 0
        ),
        "candidate_tsv_row_count": int(
            audit.get("candidate_tsv_row_count") or 0
        ),
        "candidate_tsv_source_counts": audit.get(
            "candidate_tsv_source_counts", {}
        ),
        "render_manifest_sha256": str(audited_manifest_sha256 or ""),
    }


def completion_evidence_state(
    source: dict[str, Any],
    audit: dict[str, Any] | None,
    render_manifest: dict[str, Any] | None,
    *,
    required: bool,
) -> dict[str, Any]:
    """Evaluate the fail-closed evidence chain for completion claims."""

    source_sha256 = source.get("sha256")
    rendered_pages = (
        render_manifest.get("rendered_pages", [])
        if isinstance(render_manifest, dict)
        else []
    )
    rendered_page_numbers = [
        int(entry["page"]) for entry in rendered_pages
    ]
    state: dict[str, Any] = {
        "required": required,
        "passed": False,
        "failure_codes": [],
        "source_sha256": source_sha256
        if validate_sha256(source_sha256)
        else "",
        "manifest_sha256": str(
            render_manifest.get("_manifest_sha256") or ""
        )
        if render_manifest
        else "",
        "rendered_page_numbers": rendered_page_numbers,
        "rendered_page_hashes": [
            {"page": int(entry["page"]), "sha256": str(entry["sha256"])}
            for entry in rendered_pages
        ],
    }
    if not required:
        return state

    failures: list[str] = []
    if not validate_sha256(source_sha256):
        failures.append("source_sha256_missing_or_invalid")

    available_pages = page_count(source)
    if str(source.get("format") or "") != "pdf" or available_pages < 1:
        failures.append("pdf_page_count_missing")

    raw_pages = audit.get("pages_parsed") if audit else None
    parsed_page_numbers: list[int] = []
    if not isinstance(raw_pages, list):
        failures.append("exact_parsed_page_numbers_required")
    else:
        _, parsed_page_numbers = parsed_page_state(
            str(source.get("id") or ""),
            audit or {},
        )
        expected_pages = list(range(1, available_pages + 1))
        if parsed_page_numbers != expected_pages:
            failures.append("all_source_pages_must_be_parsed")

    visual_samples = (
        audit.get("visual_sample_pages", []) if audit else []
    )
    if not visual_samples:
        failures.append("visual_sample_pages_required")
    if not set(visual_samples).issubset(parsed_page_numbers):
        failures.append("visual_sample_not_in_parsed_pages")

    if render_manifest is None:
        failures.append("render_evidence_manifest_missing")
    else:
        if render_manifest.get("source_format") != source.get("format"):
            failures.append("render_evidence_source_format_mismatch")
        if render_manifest.get("source_sha256") != source_sha256:
            failures.append("render_evidence_source_sha256_mismatch")
        if render_manifest.get("source_page_count") != available_pages:
            failures.append("render_evidence_page_count_mismatch")
        rendered_page_set = set(rendered_page_numbers)
        if not set(parsed_page_numbers).issubset(rendered_page_set):
            failures.append("render_evidence_missing_for_parsed_pages")
        if not set(visual_samples).issubset(rendered_page_set):
            failures.append("render_evidence_missing_for_visual_samples")

    state["failure_codes"] = failures
    state["passed"] = not failures
    return state


def build_status(
    inventory: dict[str, dict[str, Any]],
    audits: dict[str, dict[str, Any]],
    evidence_counts: Counter[str],
    render_evidence: dict[str, dict[str, Any]] | None = None,
    evidence_digests: dict[str, str] | None = None,
    evidence_provenance: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    render_evidence = render_evidence or {}
    evidence_digests = evidence_digests or {}
    evidence_provenance = evidence_provenance or {}
    unknown_audits = set(audits) - set(inventory)
    unknown_evidence = set(evidence_counts) - set(inventory)
    unknown_render_evidence = set(render_evidence) - set(inventory)
    unknown_evidence_digests = set(evidence_digests) - set(inventory)
    unknown_evidence_provenance = set(evidence_provenance) - set(inventory)
    if unknown_audits:
        raise ValueError(f"Unknown audit source ids: {sorted(unknown_audits)}")
    if unknown_evidence:
        raise ValueError(
            f"Unknown evidence source ids: {sorted(unknown_evidence)}"
        )
    if unknown_render_evidence:
        raise ValueError(
            "Unknown render evidence source ids: "
            f"{sorted(unknown_render_evidence)}"
        )
    if unknown_evidence_digests:
        raise ValueError(
            "Unknown evidence digest source ids: "
            f"{sorted(unknown_evidence_digests)}"
        )
    if unknown_evidence_provenance:
        raise ValueError(
            "Unknown evidence provenance source ids: "
            f"{sorted(unknown_evidence_provenance)}"
        )

    rows: list[dict[str, Any]] = []
    for source_id, source in inventory.items():
        policy = str(source.get("corpus_policy") or "")
        if policy not in DEFAULT_PENDING_STATUS:
            raise ValueError(f"{source_id}: unsupported corpus policy {policy}")
        count = int(evidence_counts[source_id])
        audit = audits.get(source_id)
        provenance_evidence = {
            "declared": False,
            "passed": False,
            "schema_version": 0,
        }
        if audit is not None:
            source_evidence_provenance = evidence_provenance.get(source_id)
            evidence_file_sha256 = evidence_digests.get(source_id, "")
            if source_evidence_provenance is not None:
                evidence_file_sha256 = str(
                    source_evidence_provenance.get("sha256") or ""
                )
            provenance_evidence = validate_audit(
                source_id,
                source,
                audit,
                count,
                evidence_file_sha256,
                source_evidence_provenance,
                render_evidence.get(source_id),
            )
            status = str(audit["status"])
        elif count:
            status = "candidate_extracted_audit_pending"
        else:
            status = DEFAULT_PENDING_STATUS[policy]

        text_route = source.get("text_route")
        route = (
            str(text_route.get("route") or "")
            if isinstance(text_route, dict)
            else ""
        )
        parsed_count, parsed_page_numbers = (
            parsed_page_state(source_id, audit) if audit else (0, [])
        )
        completion_status_claimed = status in FULLY_EVALUATED_STATUSES
        completion_evidence = completion_evidence_state(
            source,
            audit,
            render_evidence.get(source_id),
            required=completion_status_claimed,
        )
        row: dict[str, Any] = {
            "id": source_id,
            "display_name": str(source.get("display_name") or ""),
            "format": str(source.get("format") or ""),
            "source_role": str(source.get("source_role") or ""),
            "corpus_policy": policy,
            "text_route": route,
            "page_count": page_count(source),
            "review_status": status,
            "fully_evaluated": (
                completion_status_claimed
                and completion_evidence["passed"]
            ),
            "completion_evidence": completion_evidence,
            "provenance_evidence": provenance_evidence,
            "extracted_row_count": count,
            "pages_parsed": parsed_count,
            "parsed_page_numbers": parsed_page_numbers,
            "visual_sample_pages": audit.get("visual_sample_pages", [])
            if audit
            else [],
            "editorial_review_complete": bool(
                audit and audit.get("editorial_review_complete") is True
            ),
        }
        if audit:
            if audit.get("source_sha256"):
                row["audit_source_sha256"] = str(audit["source_sha256"])
            if audit.get("candidate_tsv_sha256"):
                row["candidate_tsv_sha256"] = str(
                    audit["candidate_tsv_sha256"]
                )
            if audit.get("render_manifest_sha256"):
                row["render_manifest_sha256"] = str(
                    audit["render_manifest_sha256"]
                )
            row["extraction_method"] = str(
                audit.get("extraction_method") or ""
            )
            row["rights_boundary"] = str(
                audit.get("rights_boundary") or ""
            )
        rows.append(row)

    status_counts = Counter(row["review_status"] for row in rows)
    statistics = {
        "registered_source_count": len(rows),
        "fully_evaluated_source_count": sum(
            row["fully_evaluated"] for row in rows
        ),
        "editorial_review_complete_source_count": sum(
            row["editorial_review_complete"] for row in rows
        ),
        "provenance_evidence_gate_declared_source_count": sum(
            row["provenance_evidence"]["declared"] for row in rows
        ),
        "provenance_evidence_gate_passed_source_count": sum(
            row["provenance_evidence"]["passed"] for row in rows
        ),
        "completion_evidence_gate_required_source_count": sum(
            row["completion_evidence"]["required"] for row in rows
        ),
        "completion_evidence_gate_passed_source_count": sum(
            row["completion_evidence"]["passed"] for row in rows
        ),
        "completion_claim_blocked_by_evidence_source_count": sum(
            row["completion_evidence"]["required"]
            and not row["completion_evidence"]["passed"]
            for row in rows
        ),
        "sources_with_extracted_rows": sum(
            row["extracted_row_count"] > 0 for row in rows
        ),
        "extracted_row_count": sum(
            row["extracted_row_count"] for row in rows
        ),
        "sources_with_missing_pages": status_counts.get(
            "candidate_extracted_source_pages_missing", 0
        ),
        "sources_with_quality_blocker": status_counts.get(
            "extraction_quality_review_required", 0
        ),
        "review_status_counts": dict(sorted(status_counts.items())),
    }
    return {
        "schema_version": 2,
        "candidate_provenance_rule": (
            "A declared candidate-provenance gate passes only when the "
            "inventory source profile, exact evidence-TSV bytes and row "
            "counts, audit fields, and source-bound render manifest all "
            "match. Partial page evidence proves only the declared pages and "
            "never implies full-source review."
        ),
        "completion_rule": (
            "A source is fully evaluated only after its review status is "
            "complete and a fail-closed evidence chain passes: exact full-page "
            "coverage, a verified source SHA-256, and a source-bound manifest "
            "of rendered page SHA-256 hashes. Lexical sources additionally "
            "require completed editorial review. Registration, extraction, or "
            "an audit JSON claim alone is never completion."
        ),
        "statistics": statistics,
        "sources": rows,
    }


def compact_pages(pages: list[int]) -> str:
    if not pages:
        return "—"
    ranges: list[str] = []
    start = previous = pages[0]
    for value in pages[1:]:
        if value == previous + 1:
            previous = value
            continue
        ranges.append(
            str(start) if start == previous else f"{start}–{previous}"
        )
        start = previous = value
    ranges.append(str(start) if start == previous else f"{start}–{previous}")
    return "、".join(ranges)


def render_markdown(payload: dict[str, Any]) -> str:
    statistics = payload["statistics"]
    lines = [
        "# 补充词汇资料评估状态",
        "",
        (
            "> 严格口径：文件已登记、能读取、已经抽出候选词或仅在审计 JSON "
            "中声明看过页面，都不等于“整份资料已仔细评估”。完成标记还必须通过"
            "来源哈希、逐页页码和渲染页哈希清单组成的证据门禁。"
        ),
        "",
        "## 总览",
        "",
        "| 指标 | 数量 |",
        "|---|---:|",
        f"| 已登记来源 | {statistics['registered_source_count']} |",
        f"| 严格意义上已完成评估 | {statistics['fully_evaluated_source_count']} |",
        (
            "| 声称完成但被证据门禁阻断 | "
            f"{statistics['completion_claim_blocked_by_evidence_source_count']} |"
        ),
        (
            "| 已声明候选来源证据门禁 | "
            f"{statistics['provenance_evidence_gate_declared_source_count']} |"
        ),
        (
            "| 已通过候选来源证据门禁 | "
            f"{statistics['provenance_evidence_gate_passed_source_count']} |"
        ),
        f"| 已通过完成证据门禁 | {statistics['completion_evidence_gate_passed_source_count']} |",
        f"| 已产生候选词的来源 | {statistics['sources_with_extracted_rows']} |",
        f"| 候选来源行 | {statistics['extracted_row_count']} |",
        f"| 来源文件缺页 | {statistics['sources_with_missing_pages']} |",
        f"| 抽取质量阻塞 | {statistics['sources_with_quality_blocker']} |",
        f"| 已完成逐词编辑复核 | {statistics['editorial_review_complete_source_count']} |",
        "",
    ]
    status_order = [
        "complete",
        "content_reviewed_no_lexical_targets",
        "method_reviewed",
        "candidate_extracted_needs_editorial_review",
        "relation_extraction_needs_editorial_review",
        "candidate_extracted_source_pages_missing",
        "candidate_extracted_audit_pending",
        "extraction_quality_review_required",
        "registered_extraction_pending",
        "registered_method_review_pending",
    ]
    rows_by_status: dict[str, list[dict[str, Any]]] = {
        status: [] for status in status_order
    }
    for row in payload["sources"]:
        rows_by_status.setdefault(row["review_status"], []).append(row)
    for status in status_order:
        rows = rows_by_status.get(status, [])
        if not rows:
            continue
        lines.extend(
            [
                f"## {STATUS_LABELS_ZH[status]}（{len(rows)}）",
                "",
                "| 来源 | 候选行 | 实际解析页 | 视觉抽查页 | 渲染证据页 | 候选来源证据 | 完成证据门禁 |",
                "|---|---:|---|---|---|---|---|",
            ]
        )
        for row in rows:
            gate = row["completion_evidence"]
            provenance = row["provenance_evidence"]
            if provenance["passed"]:
                provenance_label = "通过"
            elif provenance["declared"]:
                provenance_label = "阻断"
            else:
                provenance_label = "未声明（旧批次）"
            if gate["passed"]:
                gate_label = "通过"
            elif gate["required"]:
                gate_label = "阻断：" + "；".join(
                    EVIDENCE_FAILURE_LABELS_ZH.get(code, code)
                    for code in gate["failure_codes"]
                )
            else:
                gate_label = "未触发"
            lines.append(
                "| "
                + " | ".join(
                    [
                        str(row["display_name"]).replace("|", "\\|"),
                        str(row["extracted_row_count"]),
                        compact_pages(row["parsed_page_numbers"]),
                        compact_pages(row["visual_sample_pages"]),
                        compact_pages(gate["rendered_page_numbers"]),
                        provenance_label,
                        gate_label,
                    ]
                )
                + " |"
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def collect_paths(
    explicit: list[Path],
    directory: Path | None,
    pattern: str,
    *,
    label: str,
) -> list[Path]:
    """Combine explicit inputs with a fail-closed, convention-bound directory."""

    paths = list(explicit)
    if directory is not None:
        if not directory.is_dir():
            raise ValueError(f"{label} directory does not exist: {directory}")
        discovered = sorted(
            path for path in directory.glob(pattern) if path.is_file()
        )
        if not discovered:
            raise ValueError(
                f"{label} directory contains no files matching {pattern}: "
                f"{directory}"
            )
        paths.extend(discovered)
    unique: dict[Path, Path] = {}
    for path in paths:
        unique[path.resolve()] = path
    return [unique[key] for key in sorted(unique, key=lambda item: str(item))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--inventory",
        type=Path,
        default=Path(
            "data/ielts-corpus/supplemental-source-inventory.json"
        ),
    )
    parser.add_argument("--audit", action="append", type=Path, default=[])
    parser.add_argument(
        "--audit-directory",
        type=Path,
        help=(
            "Load every *-batch.json supplementary audit in this directory. "
            "Target-batch metadata without a sources array is intentionally "
            "excluded by the naming convention."
        ),
    )
    parser.add_argument(
        "--evidence",
        action="append",
        type=Path,
        default=[],
    )
    parser.add_argument(
        "--evidence-directory",
        type=Path,
        help="Load every candidate/enrichment TSV in this directory.",
    )
    parser.add_argument(
        "--render-evidence",
        action="append",
        type=Path,
        default=[],
        help=(
            "Path to a source-bound PDF render evidence manifest; repeat for "
            "multiple manifests."
        ),
    )
    parser.add_argument(
        "--render-evidence-directory",
        type=Path,
        help="Load every source-bound render-evidence JSON in this directory.",
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--markdown-output", type=Path)
    args = parser.parse_args()

    audit_paths = collect_paths(
        args.audit,
        args.audit_directory,
        "*-batch.json",
        label="audit",
    )
    evidence_paths = collect_paths(
        args.evidence,
        args.evidence_directory,
        "*.tsv",
        label="evidence",
    )
    render_paths = collect_paths(
        args.render_evidence,
        args.render_evidence_directory,
        "*.json",
        label="render evidence",
    )
    evidence_provenance = evidence_file_provenance(evidence_paths)
    payload = build_status(
        load_inventory(args.inventory),
        load_audits(audit_paths),
        count_evidence(evidence_paths),
        load_render_evidence(render_paths),
        {
            source_id: str(details["sha256"])
            for source_id, details in evidence_provenance.items()
        },
        evidence_provenance,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if args.markdown_output:
        args.markdown_output.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_output.write_text(
            render_markdown(payload),
            encoding="utf-8",
        )
    print(json.dumps(payload["statistics"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
