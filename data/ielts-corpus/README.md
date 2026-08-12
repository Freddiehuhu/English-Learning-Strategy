# IELTS vocabulary corpus

This directory contains auditable outputs for 21 teacher-supplied target
wordlist PDFs plus a gated supplementary-resource layer. It does not republish
book definitions, example sentences, IPA notes, exercises or illustrations.

## Current build

- 12,352 approved target-source rows: 12,316 from the 21 target PDFs plus 36
  learner-reported listening unknowns
- 7,242 deduplicated public learning entries
- 15,523 candidate-source rows from 21 supplementary PDFs and 2 DOCX files,
  deduplicated into 11,092 editorial-review rows
- 6,604 noun, verb, adjective or adverb entries queued for sense review and
  possible image generation
- 62 proper-noun-only entries and 87 proper-noun source senses removed from
  public learning data
- 22 target inputs: 21 TSVs corresponding to the 21 supplied target PDFs,
  plus one committed learner-reported listening batch
- 46 supplementary resources registered and inventoried: 42 PDFs, 3 DOCX
  files and 1 unpacked EPUB
- 24 supplementary PDFs routed to native-text extraction; 18 routed to OCR
- 30 supplementary resources may nominate review candidates, 8 may only enrich
  relations and 8 may only inform teaching design
- All currently extracted supplementary batches are connected to the unified
  candidate queue: 6,964 candidate-only lexical entries remain blocked from
  target promotion, 46 candidate-backed proper nouns stay explicitly excluded,
  and 4,082 rows provide support for existing targets

The English for Everyone Junior batch contributes 515 source rows and 504
normalized keys from its explicit Word list on PDF pages 250-255. All six pages
have source-bound render evidence, but this remains a candidate-only partial
page review rather than a claim that the full 256-page book was evaluated.

OEF 1B Unit 5 is the first lexical supplementary source to complete both the
full-source evidence gate and row-level editorial selection: all eight pages
were rendered and reviewed, 46 explicit printed target occurrences were
checked, and the repeated `cultural` attestation was deduplicated into 45
candidate rows. The source does not supply CEFR or consistent POS labels, so
both fields remain blank instead of being inferred. Every OEF row is still
`candidate_only`; completion does not mean promotion into the public corpus.

The active corpus increased by exactly 13 new lemmas from the explicitly
approved 36-word student batch; its 23 existing lemmas were merged as new
listening evidence. Supplementary candidates did not alter the active catalog.
Registration and inventory are complete; full lexical extraction and editorial
review of all 42 supplementary PDFs are still in progress.

The four-skill primary browsing index currently contains:

| Primary index | Entries |
| ------------- | ------: |
| Listening     |     888 |
| Speaking      |     511 |
| Reading       |   4,392 |
| Writing       |   1,451 |

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
- `target-input/student-listening-unknowns-2026-08-01.tsv`: the 36-item,
  teacher-approved student listening batch. It deliberately withholds CEFR
  claims that do not yet have source-specific evidence.
- `supplementary-input/*.tsv`: fail-closed candidate extracts from the 23
  supplementary sources processed so far.
- `supplementary-candidate-queue.tsv`: 11,092 normalized review rows: 6,964
  target candidates, 46 excluded proper nouns and 4,082 active-target overlaps.
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

## Learner difficulty archive

`learner-difficulty/student-hard-words-2026-08-12.json` is a separate,
learner-specific evidence archive. It contains 442 non-empty reported inputs
and 443 unique normalized headwords after one confirmed joined-token split.
The learner's code means pronunciation unknown for `1` or no suffix (192
entries), meaning unknown for `2` (110), and both unknown for `3` (141). These
labels are routing evidence only; they are not lexical or mastery evidence.

The archive preserves every raw token alongside confirmed corrections. For
example, the reported `pluse3` remains available as raw evidence while its
normalized headword is recorded as `pulse` with a student-confirmed correction
note. It withholds definitions, POS, CEFR and IPA, and every sense remains
context-pending until a source sentence or other sufficient evidence is
available.

The archive size must not be reported as published exercise coverage. The
initial sound-form rescue lesson publishes only 12 separately source-audited
words in two rounds. `instant` still lacks its original listening sentence, so
its meaning prompt is unscored and cannot supply a mastery claim.

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
- Learner-reported corrections also preserve the raw token and an explicit
  confirmation note; difficulty codes never fill lexical fields.
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
