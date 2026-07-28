# IELTS corpus pipeline

This folder turns the teacher-provided PDF wordlists into an auditable,
deduplicated vocabulary corpus. Source PDFs and extracted definitions stay
local; the repository publishes only the minimum lexical metadata needed by
the learning app.

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

## Scripts

- `extract_cae_wordlists.py`: two-column Complete CAE unit and phrasal-verb
  lists.
- `extract_ielts_listening_wordlist.py`: comma-delimited IELTS listening list,
  including audited source-layout and source-typo repairs.
- `extract_first_wordlist.py`: coordinate-based extraction for the four-column
  First/First for Schools wordlist.
- `extract_foundation_wordlists.py`: Oxford 3000/5000 and Cambridge KET/B1
  foundation lists.
- `build_master_corpus.py`: quality gate, normalization, deduplication,
  four-skill labels, image queue and public catalog.

Each extractor writes the same tab-separated columns:

`source`, `raw_term`, `headword`, `pos`, `cefr`, `topic_or_section`,
`pdf_page`, `source_ref`, `definition`, `notes`.

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
  --output-dir tmp/pdfs/master-final
```

The four foundation files are listed explicitly so a stale experimental TSV
in the local output directory can never enter the build by accident.

The builder stops instead of producing a corpus when it detects a likely
alphabetical-section mismatch, wrapped example fragment or accidental
headword corruption. Run the corpus unit tests before accepting a build:

```sh
python3 -m unittest discover -s tests/corpus -v
```
