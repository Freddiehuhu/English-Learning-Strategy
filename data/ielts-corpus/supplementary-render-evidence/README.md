# Supplementary PDF render evidence

This directory stores path-free evidence manifests, not source PDFs or rendered
page images. Each manifest binds:

- the registered source ID and source SHA-256;
- the PDF page count;
- the renderer name, version and settings;
- every evidenced PDF page number to the SHA-256, byte size and dimensions of
  its PNG rendering.

Generate a manifest from the verified private source:

```bash
python3 scripts/corpus/build_pdf_render_evidence.py \
  --source "/private/path/source.pdf" \
  --source-id source-id \
  --expected-source-sha256 REGISTERED_SHA256 \
  --all-pages \
  --output \
  data/ielts-corpus/supplementary-render-evidence/source-id.json
```

Pass each manifest to the review-status builder with `--render-evidence`. A
source whose audit status claims completion is still reported as
`fully_evaluated: false` unless all of these conditions hold:

1. the inventory contains a valid source SHA-256;
2. the audit lists every source page explicitly, not just a page count;
3. the listed pages cover the complete registered PDF;
4. visual sample pages are included in the parsed pages;
5. the render manifest source hash and page count match the inventory;
6. every parsed page has a source-bound rendered PNG hash.

The hashes prove that concrete page renderings were produced from the
registered source version. They do not prove human attention by themselves, so
the audit's content/editorial review status remains a separate requirement.
Never commit private source paths, source PDFs or copyrighted page renders.
