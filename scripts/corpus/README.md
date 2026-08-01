# IELTS corpus pipeline

This folder turns teacher-approved target wordlists and supplementary
PDF/DOCX/EPUB references into an auditable vocabulary corpus. Source documents,
OCR text and extracted definitions stay local; the repository publishes only
the minimum lexical metadata needed by the learning app.

## Data rules

- Preserve the printed form in `raw_term`.
- Put a corrected teaching form in `headword` only when the source has a
  confirmed typo or layout break, and record that correction in local notes.
- Deduplicate by normalized lexical form, while retaining every source and
  part-of-speech attestation.
- Do not infer from capitalization alone. Days, months, continents, countries
  and languages from their audited source sections are removed as proper-noun
  senses, and matching capitalized attestations are removed with them.
  Lowercase common senses such as `march`, `may` and `turkey` remain.
- Treat listening, speaking, reading and writing as overlapping skills.
  `primary_skill` is a browsing index, not a claim that the word belongs to
  only one skill.
- Do not generate an image until a teacher has approved the intended sense.
- Do not publish `raw_term`, source definitions, example sentences or IPA notes
  from the PDFs. Parenthetical source glosses are also removed from public
  headwords.
- Only `corpus_policy=target` rows may create or change an active IELTS entry.
  `candidate_only` and `enrich_only` rows are written to separate review
  outputs. `methods_only` resources never enter the lexical merge.
- A book title containing “IELTS” or “Official” is not authority evidence.
  Supplementary sources require explicit teacher approval before target
  promotion.

## Scripts

- `extract_cae_wordlists.py`: two-column Complete CAE unit and phrasal-verb
  lists.
- `extract_ielts_listening_wordlist.py`: comma-delimited IELTS listening list,
  including audited source-layout and source-typo repairs.
- `extract_first_wordlist.py`: coordinate-based extraction for the four-column
  First/First for Schools wordlist.
- `extract_foundation_wordlists.py`: Oxford 3000/5000 and Cambridge KET/B1
  foundation lists.
- `inventory_supplementary_sources.py`: path-safe registry validation, hashes,
  format metadata and native-text/OCR routing for the 46 supplementary
  resources.
- `extract_edge_docx_wordboxes.py`: source-specific extraction of the two Edge
  Unit 7 word boxes, with repeated graded copies deduplicated.
- `build_master_corpus.py`: quality gate, normalization, deduplication,
  target-promotion gate, four-skill labels, supplementary review queues, image
  queue and public catalog.

The original extractors write these required/legacy columns:

`source`, `raw_term`, `headword`, `pos`, `cefr`, `topic_or_section`,
`pdf_page`, `source_ref`, `definition`, `notes`.

Supplementary extractors also write:

`registry_source_id`, `source_role`, `corpus_policy`, `source_format`,
`locator`.

Legacy rows default to `target_reference`, `target`, `pdf` only when their
input is explicitly named with `--legacy-target-input`. Every new source must
set the policy fields; missing or incompatible role/policy values stop the
build. `registry_source_id` is checked against the public integrity registry so
each candidate row links back to the exact inventoried source. `locator`
supports a sanitized page, DOCX table cell or EPUB chapter location without
exposing a local path.

## Supplementary inventory

The committed registry contains canonical titles, broad search-root keys, byte
sizes and SHA-256 fingerprints. It contains no local filename or directory.
Run the inventory by supplying local roots at runtime; matching uses format,
size and hash:

```sh
python3 scripts/corpus/inventory_supplementary_sources.py \
  --root desktop=/local/Desktop \
  --root downloads=/local/Downloads \
  --root ibooks=/local/iBooks/Documents \
  --output data/ielts-corpus/supplemental-source-inventory.json \
  --summary-only \
  --check
```

The output contains hashes, technical page/structure counts and
extraction routes, never document body text, filenames, local paths or embedded
author/title metadata. `pdf_native_text` can enter a source-specific parser;
`pdf_ocr_required` must be processed page by page with OCR and sampled visual
QA. The inventory requires Poppler's `pdfinfo` and `pdftotext`; `--check`
fails when either probe is unavailable so a partial inventory cannot be
accepted as complete.

## Build

After extracting the local PDFs:

```sh
python3 scripts/corpus/build_master_corpus.py \
  tmp/pdfs/batch_foundation/oxford_3000.tsv \
  tmp/pdfs/batch_foundation/oxford_5000.tsv \
  tmp/pdfs/batch_foundation/ket_schools.tsv \
  tmp/pdfs/batch_foundation/b1_preliminary.tsv \
  tmp/pdfs/first_fixed/first_first_for_schools.tsv \
  tmp/pdfs/batch_listening/ielts_listening_1200.tsv \
  tmp/pdfs/cae-all \
  data/ielts-corpus/target-input/student-listening-unknowns-2026-08-01.tsv \
  data/ielts-corpus/supplementary-input/curated-native-candidates.tsv \
  data/ielts-corpus/supplementary-input/edge-pdf-candidates.tsv \
  data/ielts-corpus/supplementary-input/edge-unit7-candidates.tsv \
  data/ielts-corpus/supplementary-input/scholastic-240-candidates.tsv \
  data/ielts-corpus/supplementary-input/scholastic-success-candidates.tsv \
  data/ielts-corpus/supplementary-input/vocabulary-in-use-candidates.tsv \
  --legacy-target-input tmp/pdfs/batch_foundation/oxford_3000.tsv \
  --legacy-target-input tmp/pdfs/batch_foundation/oxford_5000.tsv \
  --legacy-target-input tmp/pdfs/batch_foundation/ket_schools.tsv \
  --legacy-target-input tmp/pdfs/batch_foundation/b1_preliminary.tsv \
  --legacy-target-input tmp/pdfs/first_fixed/first_first_for_schools.tsv \
  --legacy-target-input tmp/pdfs/batch_listening/ielts_listening_1200.tsv \
  --legacy-target-input tmp/pdfs/cae-all \
  --output-dir data/ielts-corpus \
  --public-catalog public/ielts/corpus/catalog.json \
  --omit-local-json
```

The four foundation files are listed explicitly so a stale experimental TSV
in the local output directory can never enter the build by accident. The seven
legacy target inputs are also named again as trusted legacy sources. The
committed student batch is an explicit `target_reference`; every supplementary
candidate file remains fail-closed and must carry `lexical_candidate` +
`candidate_only` on every row.

The builder stops instead of producing a corpus when it detects a likely
alphabetical-section mismatch, wrapped example fragment or accidental
headword corruption. Run the corpus unit tests before accepting a build:

```sh
python3 -m unittest discover -s tests/corpus -v
```

The build is considered safe only when adding supplementary rows leaves the
active entry count, target POS/CEFR labels and target skill distribution
unchanged unless a separate, reviewed promotion explicitly authorizes a
change.
