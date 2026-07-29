from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = (
    REPOSITORY_ROOT
    / "scripts"
    / "corpus"
    / "inventory_supplementary_sources.py"
)
REGISTRY_PATH = (
    REPOSITORY_ROOT
    / "data"
    / "ielts-corpus"
    / "supplemental-source-registry.json"
)
INVENTORY_PATH = (
    REPOSITORY_ROOT
    / "data"
    / "ielts-corpus"
    / "supplemental-source-inventory.json"
)
SPEC = importlib.util.spec_from_file_location(
    "inventory_supplementary_sources",
    MODULE_PATH,
)
assert SPEC and SPEC.loader
inventory = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = inventory
SPEC.loader.exec_module(inventory)


def minimal_source(
    *,
    source_id: str,
    source_format: str,
    expected_sha256: str = "0" * 64,
    expected_byte_size: int = 1,
) -> dict[str, str]:
    return {
        "id": source_id,
        "display_name": source_id,
        "search_root_key": "fixtures",
        "expected_sha256": expected_sha256,
        "expected_byte_size": expected_byte_size,
        "format": source_format,
        "source_role": "lexical_candidate",
        "corpus_policy": "candidate_only",
        "target_scope": "test",
        "public_policy": "metadata_only",
    }


def registry_for(sources: list[dict[str, str]]) -> dict:
    counts: dict[str, int] = {}
    for source in sources:
        source_format = source["format"]
        counts[source_format] = counts.get(source_format, 0) + 1
    return {
        "schema_version": 2,
        "registered_source_count": len(sources),
        "expected_format_counts": dict(sorted(counts.items())),
        "rights_policy": "copyrighted_reference_private_processing",
        "ielts_authority_policy": "no_supplementary_source_can_auto_promote_an_active_ielts_target",
        "root_keys": ["fixtures"],
        "sources": sources,
    }


def write_docx_fixture(path: Path, secret_text: str) -> None:
    word_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="{inventory.WORD_NS['w']}">
  <w:body><w:p><w:r><w:t>{secret_text}</w:t></w:r></w:p></w:body>
</w:document>
"""
    core_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties
 xmlns:cp="{inventory.CORE_PROPERTIES_NS['cp']}"
 xmlns:dc="{inventory.CORE_PROPERTIES_NS['dc']}">
  <dc:title>Fixture title</dc:title>
  <dc:creator>Fixture author</dc:creator>
</cp:coreProperties>
"""
    app_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="{inventory.EXTENDED_PROPERTIES_NS['ep']}">
  <Pages>2</Pages><Words>7</Words><Paragraphs>1</Paragraphs>
</Properties>
"""
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("word/document.xml", word_xml)
        archive.writestr("docProps/core.xml", core_xml)
        archive.writestr("docProps/app.xml", app_xml)


def write_epub_fixture(path: Path) -> None:
    (path / "META-INF").mkdir(parents=True)
    (path / "images").mkdir()
    (path / "META-INF" / "container.xml").write_text(
        f"""<?xml version="1.0"?>
<container xmlns="{inventory.EPUB_CONTAINER_NS['container']}">
  <rootfiles>
    <rootfile full-path="content.opf"
      media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
""",
        encoding="utf-8",
    )
    (path / "content.opf").write_text(
        f"""<?xml version="1.0"?>
<package xmlns="{inventory.OPF_NS['opf']}" version="2.0">
  <metadata xmlns:dc="{inventory.OPF_NS['dc']}">
    <dc:title>Picture vocabulary fixture</dc:title>
    <dc:creator>Fixture author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="image" href="images/001.jpg" media-type="image/jpeg"/>
  </manifest>
</package>
""",
        encoding="utf-8",
    )
    (path / "images" / "001.jpg").write_bytes(b"fixture-image")


class SupplementalRegistryTests(unittest.TestCase):
    def test_committed_registry_has_all_46_sources_and_expected_formats(self):
        registry = inventory.load_registry(REGISTRY_PATH)
        self.assertEqual(registry["registered_source_count"], 46)
        self.assertEqual(
            registry["expected_format_counts"],
            {"docx": 3, "epub": 1, "pdf": 42},
        )
        self.assertEqual(
            registry["rights_policy"],
            "copyrighted_reference_private_processing",
        )
        self.assertEqual(
            registry["ielts_authority_policy"],
            "no_supplementary_source_can_auto_promote_an_active_ielts_target",
        )
        self.assertEqual(len({row["id"] for row in registry["sources"]}), 46)
        self.assertTrue(
            all(
                row["public_policy"] == "metadata_only"
                and len(row["expected_sha256"]) == 64
                and row["expected_byte_size"] > 0
                and not {
                    "root_key",
                    "relative_path",
                    "absolute_path",
                    "resolved_path",
                    "filename",
                }.intersection(row)
                for row in registry["sources"]
            )
        )

    def test_registry_rejects_private_locator_fields(self):
        for field, value in (
            ("relative_path", "private/source.pdf"),
            ("absolute_path", "/private/source.pdf"),
            ("filename", "source.pdf"),
        ):
            source = {
                **minimal_source(
                    source_id="unsafe-source",
                    source_format="pdf",
                ),
                field: value,
            }
            with self.subTest(field=field):
                with self.assertRaises(inventory.RegistryError):
                    inventory.validate_registry(registry_for([source]))

    def test_registry_rejects_incompatible_role_policy_pair(self):
        source = {
            **minimal_source(
                source_id="unsafe-source",
                source_format="pdf",
            ),
            "corpus_policy": "target",
        }
        with self.assertRaisesRegex(
            inventory.RegistryError,
            "role requires corpus_policy 'candidate_only'",
        ):
            inventory.validate_registry(registry_for([source]))

    def test_committed_inventory_omits_private_paths_and_authored_metadata(self):
        payload = json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))
        self.assertEqual(payload["schema_version"], 2)
        self.assertEqual(payload["statistics"]["inventoried_source_count"], 46)
        self.assertEqual(payload["statistics"]["error_source_count"], 0)
        private_fields = {
            "root_key",
            "search_root_key",
            "relative_path",
            "absolute_path",
            "resolved_path",
            "filename",
        }
        authored_metadata = {
            "document_title",
            "document_author",
            "creator",
            "publisher",
            "created",
            "modified",
        }
        for source in payload["sources"]:
            self.assertFalse(private_fields.intersection(source))
            self.assertFalse(
                authored_metadata.intersection(source.get("metadata", {}))
            )

    def test_root_resolution_rejects_symlink_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "root"
            outside = Path(directory) / "outside"
            root.mkdir()
            outside.mkdir()
            outside_source = outside / "source.pdf"
            outside_source.write_bytes(b"%PDF-")
            (root / "escape").symlink_to(outside, target_is_directory=True)
            digest, byte_size = inventory.sha256_file(outside_source)
            source = minimal_source(
                source_id="escaped-source",
                source_format="pdf",
                expected_sha256=digest,
                expected_byte_size=byte_size,
            )
            with self.assertRaises(inventory.InventoryError) as context:
                inventory.resolve_source_path(source, {"fixtures": root})
        self.assertEqual(
            context.exception.code,
            "source_not_found_by_integrity",
        )

    def test_docx_inventory_omits_absolute_path_and_document_text(self):
        secret_text = "DO-NOT-PUBLISH-THIS-SOURCE-SENTENCE"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            document = root / "fixture.docx"
            write_docx_fixture(document, secret_text)
            digest, byte_size = inventory.sha256_file(document)
            source = minimal_source(
                source_id="docx-fixture",
                source_format="docx",
                expected_sha256=digest,
                expected_byte_size=byte_size,
            )
            payload = inventory.build_inventory(
                registry_for([source]),
                {"fixtures": root},
            )
            serialized = json.dumps(payload, ensure_ascii=False)

        result = payload["sources"][0]
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["text_route"]["route"], "docx_ooxml")
        self.assertEqual(result["metadata"]["declared_word_count"], 7)
        self.assertNotIn("document_title", result["metadata"])
        self.assertNotIn("document_author", result["metadata"])
        self.assertEqual(len(result["sha256"]), 64)
        self.assertNotIn(secret_text, serialized)
        self.assertNotIn(str(root), serialized)

    def test_unpacked_image_epub_routes_to_ocr_and_hashes_tree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            epub = root / "fixture.epub"
            write_epub_fixture(epub)
            digest, byte_size, _ = inventory.sha256_directory(epub)
            source = minimal_source(
                source_id="epub-fixture",
                source_format="epub",
                expected_sha256=digest,
                expected_byte_size=byte_size,
            )
            payload = inventory.build_inventory(
                registry_for([source]),
                {"fixtures": root},
            )

        result = payload["sources"][0]
        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            result["text_route"]["route"],
            "epub_image_ocr_required",
        )
        self.assertEqual(result["metadata"]["image_item_count"], 1)
        self.assertEqual(result["metadata"]["text_document_count"], 0)
        self.assertEqual(result["file_count"], 3)
        self.assertEqual(len(result["sha256"]), 64)

    def test_pdf_inventory_uses_metadata_and_route_without_emitting_text(self):
        secret_text = "PRIVATE PDF BODY TEXT"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf = root / "fixture.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture")
            digest, byte_size = inventory.sha256_file(pdf)
            source = minimal_source(
                source_id="pdf-fixture",
                source_format="pdf",
                expected_sha256=digest,
                expected_byte_size=byte_size,
            )
            with mock.patch.object(
                inventory,
                "inspect_pdf",
                return_value=(
                    {"page_count": 4, "document_title": "Fixture PDF"},
                    {
                        "route": "pdf_native_text",
                        "probe_method": "pdftotext",
                        "probed_pages": 4,
                        "probe_character_count": len(secret_text),
                    },
                ),
            ):
                payload = inventory.build_inventory(
                    registry_for([source]),
                    {"fixtures": root},
                )
            serialized = json.dumps(payload, ensure_ascii=False)

        result = payload["sources"][0]
        self.assertEqual(result["metadata"]["page_count"], 4)
        self.assertNotIn("document_title", result["metadata"])
        self.assertEqual(result["text_route"]["route"], "pdf_native_text")
        self.assertNotIn(secret_text, serialized)
        self.assertNotIn(str(root), serialized)

    def test_inventory_marks_missing_pdf_tools_as_incomplete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf = root / "fixture.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture")
            digest, byte_size = inventory.sha256_file(pdf)
            source = minimal_source(
                source_id="pdf-fixture",
                source_format="pdf",
                expected_sha256=digest,
                expected_byte_size=byte_size,
            )
            with mock.patch.object(
                inventory,
                "inspect_pdf",
                return_value=(
                    {"metadata_probe": "pdfinfo_unavailable"},
                    {
                        "route": "pdf_text_tool_unavailable",
                        "probe_method": "none",
                        "probed_pages": 0,
                        "probe_character_count": 0,
                    },
                ),
            ):
                payload = inventory.build_inventory(
                    registry_for([source]),
                    {"fixtures": root},
                )
        self.assertEqual(
            payload["statistics"]["tool_unavailable_source_count"],
            1,
        )

    def test_missing_root_is_reported_without_resolved_path(self):
        source = minimal_source(
            source_id="missing-root",
            source_format="pdf",
        )
        payload = inventory.build_inventory(registry_for([source]), {})
        result = payload["sources"][0]
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error_code"], "root_not_provided")
        self.assertEqual(payload["statistics"]["error_source_count"], 1)

    def test_pdfinfo_and_text_route_parsers_return_metadata_only(self):
        metadata = inventory.parse_pdfinfo_output(
            "\n".join(
                (
                    "Title:          Sample",
                    "Author:         Teacher",
                    "Pages:          12",
                    "Encrypted:      no",
                    "PDF version:    1.7",
                )
            )
        )
        route = inventory.pdf_text_route(
            "Letters and numbers 123 " * 8,
            probed_pages=3,
        )
        self.assertEqual(metadata["page_count"], 12)
        self.assertNotIn("document_title", metadata)
        self.assertNotIn("document_author", metadata)
        self.assertEqual(route["route"], "pdf_native_text")
        self.assertNotIn("Letters and numbers", json.dumps(route))


if __name__ == "__main__":
    unittest.main()
