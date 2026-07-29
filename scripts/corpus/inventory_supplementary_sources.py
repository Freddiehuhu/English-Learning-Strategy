#!/usr/bin/env python3
"""Inventory supplementary sources without publishing paths or source text.

The committed registry stores public metadata plus an integrity fingerprint,
never a local filename or directory. Callers provide broad search roots at
runtime. Files are matched by format, byte size and SHA-256. The resulting JSON
contains no resolved paths, filenames or extracted document text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any
from xml.etree import ElementTree


SCRIPT_PATH = Path(__file__).resolve()
REPOSITORY_ROOT = SCRIPT_PATH.parents[2]
DEFAULT_REGISTRY = (
    REPOSITORY_ROOT
    / "data"
    / "ielts-corpus"
    / "supplemental-source-registry.json"
)

FORMATS = {"pdf", "docx", "epub"}
SOURCE_ROLES = {
    "target_reference",
    "lexical_candidate",
    "relation_reference",
    "activity_reference",
    "linguistic_reference",
    "pedagogy_reference",
}
CORPUS_POLICIES = {
    "target",
    "candidate_only",
    "enrich_only",
    "methods_only",
}
SOURCE_ROLE_POLICIES = {
    "target_reference": "target",
    "lexical_candidate": "candidate_only",
    "relation_reference": "enrich_only",
    "linguistic_reference": "enrich_only",
    "activity_reference": "methods_only",
    "pedagogy_reference": "methods_only",
}
PUBLIC_POLICIES = {"metadata_only"}
PUBLIC_METADATA_FIELDS = {
    "page_count",
    "pdf_version",
    "encrypted",
    "page_size",
    "metadata_probe",
    "package_entry_count",
    "text_character_count",
    "declared_page_count",
    "declared_word_count",
    "declared_paragraph_count",
    "language",
    "manifest_item_count",
    "image_item_count",
    "text_document_count",
}
REQUIRED_SOURCE_FIELDS = {
    "id",
    "display_name",
    "search_root_key",
    "expected_sha256",
    "expected_byte_size",
    "format",
    "source_role",
    "corpus_policy",
    "target_scope",
    "public_policy",
}

CORE_PROPERTIES_NS = {
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
}
WORD_NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
}
EXTENDED_PROPERTIES_NS = {
    "ep": "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
}
EPUB_CONTAINER_NS = {
    "container": "urn:oasis:names:tc:opendocument:xmlns:container"
}
OPF_NS = {
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}


class RegistryError(ValueError):
    """Raised when committed registry data is invalid."""


class InventoryError(RuntimeError):
    """A path-safe error with a stable machine-readable code."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def clean_metadata(value: object, *, limit: int = 500) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or ""))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def load_registry(path: Path = DEFAULT_REGISTRY) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    validate_registry(payload)
    return payload


def validate_registry(payload: dict[str, Any]) -> None:
    if payload.get("schema_version") != 2:
        raise RegistryError("registry schema_version must be 2")
    sources = payload.get("sources")
    if not isinstance(sources, list):
        raise RegistryError("registry sources must be a list")
    if payload.get("registered_source_count") != len(sources):
        raise RegistryError("registered_source_count does not match sources")
    if (
        payload.get("rights_policy")
        != "copyrighted_reference_private_processing"
    ):
        raise RegistryError("registry rights_policy is missing or unsafe")
    if (
        payload.get("ielts_authority_policy")
        != "no_supplementary_source_can_auto_promote_an_active_ielts_target"
    ):
        raise RegistryError(
            "registry ielts_authority_policy is missing or unsafe"
        )

    root_keys = payload.get("root_keys")
    if (
        not isinstance(root_keys, list)
        or not root_keys
        or len(root_keys) != len(set(root_keys))
        or not all(isinstance(key, str) and key for key in root_keys)
    ):
        raise RegistryError("root_keys must contain unique non-empty strings")

    source_ids: set[str] = set()
    format_counts: Counter[str] = Counter()
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            raise RegistryError(f"source {index} must be an object")
        missing = REQUIRED_SOURCE_FIELDS - set(source)
        if missing:
            raise RegistryError(
                f"source {index} missing fields: {sorted(missing)}"
            )
        source_id = source["id"]
        if not isinstance(source_id, str) or not re.fullmatch(
            r"[a-z0-9]+(?:-[a-z0-9]+)*",
            source_id,
        ):
            raise RegistryError(f"source {index} has invalid id")
        if source_id in source_ids:
            raise RegistryError(f"duplicate source id: {source_id}")
        source_ids.add(source_id)

        private_fields = {
            "root_key",
            "relative_path",
            "absolute_path",
            "resolved_path",
            "filename",
        }.intersection(source)
        if private_fields:
            raise RegistryError(
                f"source {source_id} contains private locator fields"
            )

        search_root_key = source["search_root_key"]
        if search_root_key not in root_keys:
            raise RegistryError(
                f"source {source_id} uses unknown search root "
                f"{search_root_key!r}"
            )
        expected_sha256 = source["expected_sha256"]
        if not isinstance(expected_sha256, str) or not re.fullmatch(
            r"[0-9a-f]{64}",
            expected_sha256,
        ):
            raise RegistryError(
                f"source {source_id} has invalid expected_sha256"
            )
        expected_byte_size = source["expected_byte_size"]
        if (
            not isinstance(expected_byte_size, int)
            or isinstance(expected_byte_size, bool)
            or expected_byte_size <= 0
        ):
            raise RegistryError(
                f"source {source_id} has invalid expected_byte_size"
            )

        source_format = source["format"]
        if source_format not in FORMATS:
            raise RegistryError(
                f"source {source_id} has unsupported format {source_format!r}"
            )
        format_counts[source_format] += 1
        if source["source_role"] not in SOURCE_ROLES:
            raise RegistryError(
                f"source {source_id} has unsupported source_role"
            )
        if source["corpus_policy"] not in CORPUS_POLICIES:
            raise RegistryError(
                f"source {source_id} has unsupported corpus_policy"
            )
        expected_policy = SOURCE_ROLE_POLICIES[source["source_role"]]
        if source["corpus_policy"] != expected_policy:
            raise RegistryError(
                f"source {source_id} role requires corpus_policy "
                f"{expected_policy!r}"
            )
        if source["public_policy"] not in PUBLIC_POLICIES:
            raise RegistryError(
                f"source {source_id} has unsupported public_policy"
            )
        for text_field in ("display_name", "target_scope"):
            if (
                not isinstance(source[text_field], str)
                or not source[text_field].strip()
            ):
                raise RegistryError(
                    f"source {source_id} has invalid {text_field}"
                )

    expected_counts = payload.get("expected_format_counts")
    if expected_counts != dict(sorted(format_counts.items())):
        raise RegistryError(
            "expected_format_counts does not match registered sources"
        )


def parse_root_arguments(values: list[str]) -> dict[str, Path]:
    roots: dict[str, Path] = {}
    for value in values:
        key, separator, raw_path = value.partition("=")
        if not separator or not key or not raw_path:
            raise RegistryError(
                "each --root must use the form ROOT_KEY=/local/directory"
            )
        if key in roots:
            raise RegistryError(f"duplicate --root key: {key}")
        roots[key] = Path(raw_path).expanduser()
    return roots


def resolve_source_path(
    source: dict[str, Any],
    roots: dict[str, Path],
    candidate_cache: dict[tuple[str, str], list[Path]] | None = None,
    digest_cache: dict[str, tuple[str, int, int]] | None = None,
) -> Path:
    root_key = source["search_root_key"]
    if root_key not in roots:
        raise InventoryError("root_not_provided")
    root = roots[root_key].resolve()
    if not root.is_dir():
        raise InventoryError("root_not_directory")
    source_format = source["format"]
    cache_key = (str(root), source_format)
    candidate_cache = candidate_cache if candidate_cache is not None else {}
    digest_cache = digest_cache if digest_cache is not None else {}

    if cache_key not in candidate_cache:
        suffix = "." + source_format
        candidates: list[Path] = []
        for directory, directory_names, file_names in os.walk(
            root,
            followlinks=False,
            onerror=lambda _error: None,
        ):
            directory_path = Path(directory)
            safe_directories: list[str] = []
            for name in directory_names:
                path = directory_path / name
                if path.is_symlink():
                    continue
                if source_format == "epub" and path.suffix.casefold() == suffix:
                    try:
                        resolved = path.resolve()
                        resolved.relative_to(root)
                    except (OSError, ValueError):
                        continue
                    candidates.append(resolved)
                    continue
                safe_directories.append(name)
            directory_names[:] = safe_directories
            if source_format == "epub":
                continue
            for name in file_names:
                path = directory_path / name
                if path.is_symlink() or path.suffix.casefold() != suffix:
                    continue
                try:
                    resolved = path.resolve()
                    resolved.relative_to(root)
                except (OSError, ValueError):
                    continue
                candidates.append(resolved)
        candidate_cache[cache_key] = candidates

    expected_size = source["expected_byte_size"]
    expected_digest = source["expected_sha256"]
    matches: list[Path] = []
    for candidate in candidate_cache[cache_key]:
        digest_key = str(candidate)
        if source_format == "epub":
            if digest_key not in digest_cache:
                try:
                    digest, byte_size, file_count = sha256_directory(
                        candidate
                    )
                except (InventoryError, OSError):
                    continue
                digest_cache[digest_key] = (
                    digest,
                    byte_size,
                    file_count,
                )
            digest, byte_size, _ = digest_cache[digest_key]
        else:
            try:
                byte_size = candidate.stat().st_size
            except OSError:
                continue
            if byte_size != expected_size:
                continue
            if digest_key not in digest_cache:
                digest, hashed_size = sha256_file(candidate)
                digest_cache[digest_key] = (digest, hashed_size, 1)
            digest, byte_size, _ = digest_cache[digest_key]
        if byte_size == expected_size and digest == expected_digest:
            matches.append(candidate)
    if not matches:
        raise InventoryError("source_not_found_by_integrity")
    return sorted(matches, key=lambda item: item.as_posix())[0]


def sha256_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def sha256_directory(path: Path) -> tuple[str, int, int]:
    digest = hashlib.sha256(b"supplemental-source-tree-v1\0")
    size = 0
    file_count = 0
    for child in sorted(path.rglob("*"), key=lambda item: item.as_posix()):
        if child.is_symlink():
            raise InventoryError("directory_contains_symlink")
        if not child.is_file():
            continue
        relative_name = child.relative_to(path).as_posix().encode("utf-8")
        digest.update(relative_name)
        digest.update(b"\0")
        child_digest, child_size = sha256_file(child)
        digest.update(child_digest.encode("ascii"))
        digest.update(b"\0")
        size += child_size
        file_count += 1
    return digest.hexdigest(), size, file_count


def parse_pdfinfo_output(output: str) -> dict[str, Any]:
    values: dict[str, str] = {}
    for line in output.splitlines():
        key, separator, value = line.partition(":")
        if separator:
            values[key.strip().casefold()] = clean_metadata(value)

    metadata: dict[str, Any] = {}
    if values.get("pages", "").isdigit():
        metadata["page_count"] = int(values["pages"])
    for source_key, output_key in (
        ("pdf version", "pdf_version"),
        ("encrypted", "encrypted"),
        ("page size", "page_size"),
    ):
        if values.get(source_key):
            metadata[output_key] = values[source_key]
    return metadata


def pdf_text_route(
    extracted_text: str,
    *,
    probed_pages: int,
) -> dict[str, Any]:
    character_count = sum(character.isalnum() for character in extracted_text)
    return {
        "route": (
            "pdf_native_text"
            if character_count >= 80
            else "pdf_ocr_required"
        ),
        "probe_method": "pdftotext",
        "probed_pages": probed_pages,
        "probe_character_count": character_count,
    }


def inspect_pdf(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    if not path.is_file() or path.suffix.casefold() != ".pdf":
        raise InventoryError("pdf_expected")
    with path.open("rb") as handle:
        if handle.read(5) != b"%PDF-":
            raise InventoryError("invalid_pdf_signature")

    metadata: dict[str, Any] = {}
    pdfinfo = shutil.which("pdfinfo")
    if pdfinfo:
        completed = subprocess.run(
            [pdfinfo, str(path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            check=False,
        )
        if completed.returncode != 0:
            raise InventoryError("pdfinfo_failed")
        metadata = parse_pdfinfo_output(completed.stdout)
    else:
        metadata["metadata_probe"] = "pdfinfo_unavailable"

    page_count = metadata.get("page_count")
    probe_pages = min(page_count, 12) if isinstance(page_count, int) else 12
    pdftotext = shutil.which("pdftotext")
    if not pdftotext:
        return metadata, {
            "route": "pdf_text_tool_unavailable",
            "probe_method": "none",
            "probed_pages": 0,
            "probe_character_count": 0,
        }
    completed = subprocess.run(
        [
            pdftotext,
            "-f",
            "1",
            "-l",
            str(max(probe_pages, 1)),
            str(path),
            "-",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        check=False,
    )
    if completed.returncode != 0:
        raise InventoryError("pdftotext_failed")
    return metadata, pdf_text_route(
        completed.stdout,
        probed_pages=max(probe_pages, 1),
    )


def xml_text(
    root: ElementTree.Element,
    path: str,
    namespaces: dict[str, str],
) -> str:
    node = root.find(path, namespaces)
    return clean_metadata(node.text if node is not None else "")


def inspect_docx(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    if not path.is_file() or path.suffix.casefold() != ".docx":
        raise InventoryError("docx_expected")
    if not zipfile.is_zipfile(path):
        raise InventoryError("invalid_docx_package")

    metadata: dict[str, Any] = {}
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        if "word/document.xml" not in names:
            raise InventoryError("docx_document_xml_missing")
        document_root = ElementTree.fromstring(
            archive.read("word/document.xml")
        )
        text_character_count = sum(
            len(node.text or "")
            for node in document_root.findall(".//w:t", WORD_NS)
        )
        metadata["package_entry_count"] = len(names)
        metadata["text_character_count"] = text_character_count

        if "docProps/app.xml" in names:
            app_root = ElementTree.fromstring(
                archive.read("docProps/app.xml")
            )
            for path_expression, output_key in (
                ("ep:Pages", "declared_page_count"),
                ("ep:Words", "declared_word_count"),
                ("ep:Paragraphs", "declared_paragraph_count"),
            ):
                value = xml_text(
                    app_root,
                    path_expression,
                    EXTENDED_PROPERTIES_NS,
                )
                if value.isdigit():
                    metadata[output_key] = int(value)

    return metadata, {
        "route": "docx_ooxml",
        "probe_method": "word/document.xml",
        "probe_character_count": text_character_count,
    }


def safe_epub_package_path(epub_root: Path, package_name: str) -> Path:
    pure_path = PurePosixPath(package_name)
    if pure_path.is_absolute() or ".." in pure_path.parts:
        raise InventoryError("epub_package_path_invalid")
    package_path = (
        epub_root / Path(*pure_path.parts)
    ).resolve()
    try:
        package_path.relative_to(epub_root.resolve())
    except ValueError as error:
        raise InventoryError("epub_package_path_invalid") from error
    if not package_path.is_file():
        raise InventoryError("epub_package_missing")
    return package_path


def inspect_epub_directory(
    path: Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not path.is_dir() or path.suffix.casefold() != ".epub":
        raise InventoryError("unpacked_epub_directory_expected")
    container_path = path / "META-INF" / "container.xml"
    if not container_path.is_file():
        raise InventoryError("epub_container_missing")
    container_root = ElementTree.fromstring(container_path.read_bytes())
    rootfile = container_root.find(
        ".//container:rootfile",
        EPUB_CONTAINER_NS,
    )
    package_name = (
        rootfile.get("full-path", "")
        if rootfile is not None
        else ""
    )
    if not package_name:
        raise InventoryError("epub_rootfile_missing")
    package_path = safe_epub_package_path(path, package_name)
    package_root = ElementTree.fromstring(package_path.read_bytes())

    metadata: dict[str, Any] = {
        "package_document": package_path.relative_to(path).as_posix(),
    }
    language = xml_text(package_root, ".//dc:language", OPF_NS)
    if language:
        metadata["language"] = language

    media_counts: Counter[str] = Counter()
    for item in package_root.findall(".//opf:manifest/opf:item", OPF_NS):
        media_type = clean_metadata(item.get("media-type", "unknown"))
        media_counts[media_type or "unknown"] += 1
    image_count = sum(
        count
        for media_type, count in media_counts.items()
        if media_type.startswith("image/")
    )
    text_document_count = sum(
        count
        for media_type, count in media_counts.items()
        if media_type in {
            "application/xhtml+xml",
            "text/html",
            "text/plain",
        }
    )
    metadata["manifest_item_count"] = sum(media_counts.values())
    metadata["image_item_count"] = image_count
    metadata["text_document_count"] = text_document_count

    if text_document_count:
        route = "epub_xhtml"
    elif image_count:
        route = "epub_image_ocr_required"
    else:
        route = "epub_no_text_content"
    return metadata, {
        "route": route,
        "probe_method": "epub_manifest",
        "manifest_text_documents": text_document_count,
        "manifest_images": image_count,
    }


def inventory_source(
    source: dict[str, Any],
    roots: dict[str, Path],
    candidate_cache: dict[tuple[str, str], list[Path]] | None = None,
    digest_cache: dict[str, tuple[str, int, int]] | None = None,
) -> dict[str, Any]:
    result = {
        key: source[key]
        for key in (
            "id",
            "display_name",
            "format",
            "source_role",
            "corpus_policy",
            "target_scope",
            "public_policy",
        )
    }
    try:
        path = resolve_source_path(
            source,
            roots,
            candidate_cache,
            digest_cache,
        )
        source_format = source["format"]
        if source_format == "pdf":
            digest, byte_size = sha256_file(path)
            metadata, text_route = inspect_pdf(path)
            file_count = 1
        elif source_format == "docx":
            digest, byte_size = sha256_file(path)
            metadata, text_route = inspect_docx(path)
            file_count = 1
        elif source_format == "epub":
            digest, byte_size, file_count = sha256_directory(path)
            metadata, text_route = inspect_epub_directory(path)
        else:
            raise InventoryError("unsupported_format")
        metadata = {
            key: value
            for key, value in metadata.items()
            if key in PUBLIC_METADATA_FIELDS
        }
    except (InventoryError, OSError, ElementTree.ParseError, zipfile.BadZipFile) as error:
        error_code = (
            error.code
            if isinstance(error, InventoryError)
            else "source_inspection_failed"
        )
        return {
            **result,
            "status": "error",
            "error_code": error_code,
        }

    return {
        **result,
        "status": "ok",
        "sha256": digest,
        "byte_size": byte_size,
        "file_count": file_count,
        "metadata": metadata,
        "text_route": text_route,
    }


def build_inventory(
    registry: dict[str, Any],
    roots: dict[str, Path],
) -> dict[str, Any]:
    validate_registry(registry)
    candidate_cache: dict[tuple[str, str], list[Path]] = {}
    digest_cache: dict[str, tuple[str, int, int]] = {}
    sources = [
        inventory_source(
            source,
            roots,
            candidate_cache,
            digest_cache,
        )
        for source in registry["sources"]
    ]
    format_counts = Counter(source["format"] for source in sources)
    role_counts = Counter(source["source_role"] for source in sources)
    policy_counts = Counter(source["corpus_policy"] for source in sources)
    route_counts = Counter(
        source["text_route"]["route"]
        for source in sources
        if source["status"] == "ok"
    )
    error_counts = Counter(
        source["error_code"]
        for source in sources
        if source["status"] == "error"
    )
    tool_unavailable_source_count = sum(
        source["status"] == "ok"
        and (
            source.get("metadata", {}).get("metadata_probe")
            == "pdfinfo_unavailable"
            or source.get("text_route", {}).get("route")
            == "pdf_text_tool_unavailable"
        )
        for source in sources
    )
    return {
        "schema_version": 2,
        "registry_schema_version": registry["schema_version"],
        "rights_policy": registry["rights_policy"],
        "ielts_authority_policy": registry["ielts_authority_policy"],
        "statistics": {
            "registered_source_count": len(sources),
            "inventoried_source_count": sum(
                source["status"] == "ok"
                for source in sources
            ),
            "error_source_count": sum(
                source["status"] == "error"
                for source in sources
            ),
            "tool_unavailable_source_count": (
                tool_unavailable_source_count
            ),
            "format_counts": dict(sorted(format_counts.items())),
            "source_role_counts": dict(sorted(role_counts.items())),
            "corpus_policy_counts": dict(sorted(policy_counts.items())),
            "text_route_counts": dict(sorted(route_counts.items())),
            "error_counts": dict(sorted(error_counts.items())),
        },
        "sources": sources,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Inventory registered supplementary sources without emitting "
            "absolute paths or document text."
        )
    )
    parser.add_argument(
        "--registry",
        type=Path,
        default=DEFAULT_REGISTRY,
    )
    parser.add_argument(
        "--root",
        action="append",
        default=[],
        metavar="KEY=PATH",
        help="Map a committed root key to a local directory.",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Print statistics only.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero when any registered source cannot be inventoried.",
    )
    args = parser.parse_args()

    try:
        registry = load_registry(args.registry)
        roots = parse_root_arguments(args.root)
    except (OSError, json.JSONDecodeError, RegistryError) as error:
        print(f"Registry error: {clean_metadata(error)}", file=sys.stderr)
        return 2

    inventory = build_inventory(registry, roots)
    if args.output:
        write_json(args.output, inventory)
    printable = (
        inventory["statistics"]
        if args.summary_only
        else inventory
    )
    print(json.dumps(printable, ensure_ascii=False, indent=2))
    if args.check and (
        inventory["statistics"]["error_source_count"]
        or inventory["statistics"]["tool_unavailable_source_count"]
    ):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
