#!/usr/bin/env python3
"""Build a path-free, source-bound PDF render evidence manifest.

The manifest records exact PDF page numbers and hashes of PNG renderings. It
does not retain the private source path or copyrighted page images. The review
status builder uses this independently generated evidence as a fail-closed
completion gate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path
from typing import Any


SOURCE_ID_PATTERN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class RenderEvidenceError(RuntimeError):
    """Raised when source integrity or PDF rendering cannot be verified."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def command_output(command: list[str]) -> str:
    completed = subprocess.run(
        command,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return completed.stdout


def pdf_page_count(source: Path, pdfinfo: str) -> int:
    try:
        output = command_output([pdfinfo, str(source)])
    except (OSError, subprocess.CalledProcessError) as error:
        raise RenderEvidenceError("pdfinfo_failed") from error
    match = re.search(r"^Pages:\s+(\d+)\s*$", output, flags=re.MULTILINE)
    if not match:
        raise RenderEvidenceError("pdfinfo_page_count_missing")
    count = int(match.group(1))
    if count < 1:
        raise RenderEvidenceError("pdf_page_count_invalid")
    return count


def renderer_version(pdftoppm: str) -> str:
    try:
        output = command_output([pdftoppm, "-v"])
    except (OSError, subprocess.CalledProcessError) as error:
        raise RenderEvidenceError("pdftoppm_version_failed") from error
    first_line = next(
        (line.strip() for line in output.splitlines() if line.strip()),
        "",
    )
    match = re.search(r"\bversion\s+([^\s]+)", first_line)
    if not match:
        raise RenderEvidenceError("pdftoppm_version_missing")
    return match.group(1)


def normalize_pages(
    values: list[int],
    *,
    page_count: int,
    all_pages: bool,
) -> list[int]:
    if all_pages and values:
        raise RenderEvidenceError("choose_pages_or_all_pages")
    if all_pages:
        return list(range(1, page_count + 1))
    if not values:
        raise RenderEvidenceError("at_least_one_page_required")
    if any(
        not isinstance(value, int)
        or isinstance(value, bool)
        or value < 1
        or value > page_count
        for value in values
    ):
        raise RenderEvidenceError("render_page_out_of_range")
    if len(set(values)) != len(values):
        raise RenderEvidenceError("duplicate_render_page")
    return sorted(values)


def png_dimensions(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if (
        len(header) != 24
        or header[:8] != PNG_SIGNATURE
        or header[12:16] != b"IHDR"
    ):
        raise RenderEvidenceError("rendered_png_invalid")
    width, height = struct.unpack(">II", header[16:24])
    if width < 1 or height < 1:
        raise RenderEvidenceError("rendered_png_dimensions_invalid")
    return width, height


def render_page(
    source: Path,
    *,
    page: int,
    dpi: int,
    pdftoppm: str,
    directory: Path,
) -> dict[str, Any]:
    prefix = directory / f"page-{page:06d}"
    try:
        subprocess.run(
            [
                pdftoppm,
                "-f",
                str(page),
                "-l",
                str(page),
                "-singlefile",
                "-png",
                "-r",
                str(dpi),
                str(source),
                str(prefix),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise RenderEvidenceError(f"pdftoppm_failed_page_{page}") from error
    output = prefix.with_suffix(".png")
    if not output.is_file():
        raise RenderEvidenceError(f"rendered_png_missing_page_{page}")
    width, height = png_dimensions(output)
    return {
        "page": page,
        "sha256": sha256_file(output),
        "byte_size": output.stat().st_size,
        "width_px": width,
        "height_px": height,
    }


def build_manifest(
    *,
    source: Path,
    source_id: str,
    expected_source_sha256: str,
    pages: list[int],
    all_pages: bool,
    dpi: int,
    pdftoppm: str,
    pdfinfo: str,
) -> dict[str, Any]:
    if not SOURCE_ID_PATTERN.fullmatch(source_id):
        raise RenderEvidenceError("source_id_invalid")
    if not SHA256_PATTERN.fullmatch(expected_source_sha256):
        raise RenderEvidenceError("expected_source_sha256_invalid")
    if dpi < 36 or dpi > 600:
        raise RenderEvidenceError("dpi_out_of_range")
    if not source.is_file():
        raise RenderEvidenceError("source_file_missing")

    actual_source_sha256 = sha256_file(source)
    if actual_source_sha256 != expected_source_sha256:
        raise RenderEvidenceError("source_sha256_mismatch")

    page_count = pdf_page_count(source, pdfinfo)
    selected_pages = normalize_pages(
        pages,
        page_count=page_count,
        all_pages=all_pages,
    )
    version = renderer_version(pdftoppm)
    with tempfile.TemporaryDirectory(prefix="pdf-render-evidence-") as raw_dir:
        directory = Path(raw_dir)
        rendered_pages = [
            render_page(
                source,
                page=page,
                dpi=dpi,
                pdftoppm=pdftoppm,
                directory=directory,
            )
            for page in selected_pages
        ]
    return {
        "schema_version": 1,
        "source_id": source_id,
        "source_format": "pdf",
        "source_sha256": actual_source_sha256,
        "source_page_count": page_count,
        "renderer": {
            "name": "pdftoppm",
            "version": version,
        },
        "render_settings": {
            "format": "png",
            "dpi": dpi,
            "single_file_per_page": True,
        },
        "rendered_pages": rendered_pages,
    }


def executable(value: str) -> str:
    resolved = shutil.which(value)
    if not resolved:
        raise RenderEvidenceError(f"required_executable_missing:{value}")
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--expected-source-sha256", required=True)
    parser.add_argument("--page", action="append", type=int, default=[])
    parser.add_argument("--all-pages", action="store_true")
    parser.add_argument("--dpi", type=int, default=144)
    parser.add_argument("--pdftoppm", default="pdftoppm")
    parser.add_argument("--pdfinfo", default="pdfinfo")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    manifest = build_manifest(
        source=args.source.resolve(),
        source_id=args.source_id,
        expected_source_sha256=args.expected_source_sha256,
        pages=args.page,
        all_pages=args.all_pages,
        dpi=args.dpi,
        pdftoppm=executable(args.pdftoppm),
        pdfinfo=executable(args.pdfinfo),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "source_id": manifest["source_id"],
                "source_page_count": manifest["source_page_count"],
                "rendered_page_count": len(manifest["rendered_pages"]),
                "source_sha256": manifest["source_sha256"],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
