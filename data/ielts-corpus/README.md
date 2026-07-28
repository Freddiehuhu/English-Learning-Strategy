# IELTS vocabulary corpus

This directory contains the public, auditable outputs built from the 21
teacher-supplied vocabulary PDFs. It does not republish the PDFs' definitions,
example sentences or IPA notes.

## Current build

- 12,316 extracted source rows
- 7,229 deduplicated public learning entries
- 6,590 noun, verb, adjective or adverb entries queued for sense review and
  possible image generation
- 62 proper-noun-only entries and 87 proper-noun source senses removed from
  public learning data
- 21 input TSVs, corresponding to all 21 supplied PDFs

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
