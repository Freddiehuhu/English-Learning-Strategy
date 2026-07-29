# IELTS vocabulary corpus

This directory contains auditable outputs for 21 teacher-supplied target
wordlist PDFs plus a gated supplementary-resource layer. It does not republish
book definitions, example sentences, IPA notes, exercises or illustrations.

## Current build

- 12,316 extracted source rows
- 7,229 deduplicated public learning entries
- 6,590 noun, verb, adjective or adverb entries queued for sense review and
  possible image generation
- 62 proper-noun-only entries and 87 proper-noun source senses removed from
  public learning data
- 21 input TSVs, corresponding to all 21 supplied PDFs
- 46 supplementary resources registered and inventoried: 42 PDFs, 3 DOCX
  files and 1 unpacked EPUB
- 24 supplementary PDFs routed to native-text extraction; 18 routed to OCR
- 30 supplementary resources may nominate review candidates, 8 may only enrich
  relations and 8 may only inform teaching design
- The first DOCX pilot retains 14 printed word-box rows as review evidence:
  11 new normalized candidates and 3 overlaps with active target entries

The 7,229 active learning entries have deliberately not increased. Registration
and inventory are complete; full lexical extraction and editorial review of
all 42 supplementary PDFs are still in progress.

The four-skill primary browsing index currently contains:

| Primary index | Entries |
| ------------- | ------: |
| Listening     |     853 |
| Speaking      |     511 |
| Reading       |   4,409 |
| Writing       |   1,456 |

Listening, speaking, reading and writing are overlapping labels. The primary
index is navigation metadata, not a claim that a word belongs to only one
skill.

## Files

- `master-vocabulary.tsv`: one row per normalized lexical entry.
- `source-evidence.tsv`: public provenance rows without source definitions.
- `source-manifest.json`: source-level counts and PDF filenames.
- `supplemental-source-registry.json`: the 46-item allowlist, source role,
  corpus policy and integrity fingerprints; it contains no local filename or
  directory.
- `supplemental-source-inventory.json`: verified hashes, format metadata and
  extraction/OCR routes, without body text, filenames, local paths or embedded
  author/title metadata.
- `supplementary-input/edge-unit7-candidates.tsv`: the first source-specific
  DOCX candidate extraction.
- `supplementary-candidate-queue.tsv`: normalized target candidates and active
  overlaps awaiting teacher review.
- `supplementary-source-evidence.tsv`: sanitized candidate/enrichment
  provenance.
- `image-generation-queue.tsv`: image candidates; every row remains blocked
  until its intended sense has been approved.
- `game-editorial-queue.tsv`: candidate rows for image guessing,
  synonym/antonym, homophone, homograph, analogy, taxonomy and collocation
  games. Candidate status is not an answer key.
- `build-report.md`: build statistics and method notes.

The website consumes the smaller, minified
`public/ielts/corpus/catalog.json` only when the learner opens the corpus map.

## Editorial safeguards

- `raw_term` preserves the extracted source form in local intermediate data
  but is omitted from public outputs.
- Candidate-only evidence cannot create an active IELTS target and cannot alter
  an active target's POS, CEFR or four-skill labels.
- New TSV files are fail-closed: missing policy columns or an incompatible
  role/policy pair stops the build. Only seven explicitly named legacy target
  inputs may use historical defaults.
- Every supplementary evidence row carries a `registry_source_id`; the build
  verifies its role, policy and format against the corresponding inventoried
  hash record.
- Relation and teaching-method resources cannot nominate target words.
- Confirmed source typos or layout breaks are recorded as corrections rather
  than silently changed.
- Deduplication keeps all source and part-of-speech attestations.
- Audited days, months, continents, countries and languages are removed as
  proper-noun source senses; lowercase common senses such as `march`, `may` and
  `turkey` remain.
- Homophones require pronunciation evidence.
- Synonyms, antonyms, analogies and taxonomic relations require editorial
  approval.
- An image is generated only after the target sense is approved.
- Book pages, original illustrations and fixed-layout EPUB images remain local;
  the website uses newly created illustrations rather than copied assets.
