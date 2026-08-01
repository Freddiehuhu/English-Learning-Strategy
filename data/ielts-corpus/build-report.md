# IELTS corpus build report

- Generated: 2026-08-01T05:17:46+00:00
- Input TSV files: 28
- Extracted source rows: 27360
- Target-reference rows: 12352
- Candidate-only rows: 15008
- Enrichment-only rows: 0
- Methods-only rows ignored by the lexical merge: 0
- Deduplicated entries before proper-noun exclusion: 14213
- Active lexical entries: 7242
- Supplementary target candidates awaiting approval: 6909
- Supplementary support-only entries: 0
- Proper-noun-only entries excluded from public learning data: 62
- Proper-noun source senses excluded: 87
- Active lexemes retaining a non-proper sense after removal: 4
- Image-eligible entries: 6604

## Primary four-skill index

- listening: 888
- speaking: 511
- reading: 4392
- writing: 1451

## Coverage and review queues

- Entries without a confirmed part of speech: 369
- Skill profiles requiring teacher review: 1785
- Source corrections retained for audit: 14

### Content-word coverage

- noun: 3903
- verb: 1817
- adjective: 1417
- adverb: 420

### Game editorial candidates

- image guessing: 6604
- synonym/antonym: 6604
- homophone: 6107
- homograph: 872
- analogy: 6604
- category/taxonomy: 3903
- collocation: 3509

## Method notes

- Entries are deduplicated by Unicode-normalized lowercase lexical form.
- Only rows with `corpus_policy=target` can create or change an active IELTS learning entry.
- New TSVs fail closed when policy fields are missing; legacy target defaults apply only to explicitly named inputs.
- Every supplementary row is linked to an inventoried source hash by `registry_source_id`, with role, policy and format checked before merging.
- Candidate-only and enrichment-only rows are written to separate review outputs and never alter target CEFR, part of speech or four-skill labels.
- Parenthetical source sense labels and short glosses are removed from the public lexical form.
- Different parts of speech and source attestations remain attached as senses/evidence; they are not discarded.
- Audited days, months, continents, countries and languages are removed as proper-noun source senses before public queues are built.
- Listening, speaking, reading and writing are multi-label scores. `primary` is only a navigation index.
- Skill labels are rule-derived from source, CEFR, phrase status and part of speech; `review` confidence items need teacher review.
- Source definitions, example sentences and IPA notes are counted or retained locally but omitted from public outputs.
- Every image candidate requires a teacher-approved sense before image generation.
