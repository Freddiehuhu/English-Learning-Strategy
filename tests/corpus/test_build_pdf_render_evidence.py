from __future__ import annotations

import hashlib
import importlib.util
import struct
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "corpus"
    / "build_pdf_render_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "build_pdf_render_evidence",
    MODULE_PATH,
)
assert SPEC and SPEC.loader
render_builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = render_builder
SPEC.loader.exec_module(render_builder)


class PdfRenderEvidenceTests(unittest.TestCase):
    def test_page_selection_is_exact_sorted_and_bounded(self):
        self.assertEqual(
            render_builder.normalize_pages(
                [3, 1],
                page_count=3,
                all_pages=False,
            ),
            [1, 3],
        )
        self.assertEqual(
            render_builder.normalize_pages(
                [],
                page_count=3,
                all_pages=True,
            ),
            [1, 2, 3],
        )
        with self.assertRaisesRegex(
            render_builder.RenderEvidenceError,
            "duplicate_render_page",
        ):
            render_builder.normalize_pages(
                [1, 1],
                page_count=3,
                all_pages=False,
            )
        with self.assertRaisesRegex(
            render_builder.RenderEvidenceError,
            "render_page_out_of_range",
        ):
            render_builder.normalize_pages(
                [4],
                page_count=3,
                all_pages=False,
            )

    def test_png_dimensions_reads_ihdr_without_image_dependency(self):
        header = (
            render_builder.PNG_SIGNATURE
            + struct.pack(">I", 13)
            + b"IHDR"
            + struct.pack(">II", 640, 480)
        )
        with tempfile.TemporaryDirectory() as raw_dir:
            path = Path(raw_dir) / "page.png"
            path.write_bytes(header)
            self.assertEqual(render_builder.png_dimensions(path), (640, 480))

    def test_source_hash_mismatch_stops_before_rendering(self):
        with tempfile.TemporaryDirectory() as raw_dir:
            source = Path(raw_dir) / "source.pdf"
            source.write_bytes(b"%PDF-test")
            wrong_hash = "0" * 64
            self.assertNotEqual(
                hashlib.sha256(source.read_bytes()).hexdigest(),
                wrong_hash,
            )
            with self.assertRaisesRegex(
                render_builder.RenderEvidenceError,
                "source_sha256_mismatch",
            ):
                render_builder.build_manifest(
                    source=source,
                    source_id="source-a",
                    expected_source_sha256=wrong_hash,
                    pages=[1],
                    all_pages=False,
                    dpi=144,
                    pdftoppm="pdftoppm",
                    pdfinfo="pdfinfo",
                )


if __name__ == "__main__":
    unittest.main()
