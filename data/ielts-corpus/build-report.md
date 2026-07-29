# IELTS corpus build report

- Generated: 2026-07-29T12:34:55+00:00
- Input TSV files: 22
- Extracted source rows: 12330
- Target-reference rows: 12316
- Candidate-only rows: 14
- Enrichment-only rows: 0
- Methods-only rows ignored by the lexical merge: 0
- Deduplicated entries before proper-noun exclusion: 7302
- Active lexical entries: 7229
- Supplementary target candidates awaiting approval: 11
- Supplementary support-only entries: 0
- Proper-noun-only entries excluded from public learning data: 62
- Proper-noun source senses excluded: 87
- Active lexemes retaining a non-proper sense after removal: 4
- Image-eligible entries: 6590

## Primary four-skill index

- listening: 853
- speaking: 511
- reading: 4409
- writing: 1456

## Coverage and review queues

- Entries without a confirmed part of speech: 370
- Skill profiles requiring teacher review: 1790
- Source corrections retained for audit: 14

### Content-word coverage

- noun: 3891
- verb: 1814
- adjective: 1413
- adverb: 420

### Game editorial candidates

- image guessing: 6590
- synonym/antonym: 6590
- homophone: 6094
- homograph: 868
- analogy: 6590
- category/taxonomy: 3891
- collocation: 3503

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
