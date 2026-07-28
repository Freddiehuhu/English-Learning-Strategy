#!/usr/bin/env python3
"""Extract the four-column Cambridge First wordlist without cross-column joins.

The source PDF has usable embedded text, but its internal flow order interleaves
columns.  This extractor uses Poppler's word coordinates, restores page/column
reading order, joins only indented source wraps, and keeps IPA out of headwords.
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import shutil
import subprocess
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


HEADER = [
    "source",
    "raw_term",
    "headword",
    "pos",
    "cefr",
    "topic_or_section",
    "pdf_page",
    "source_ref",
    "definition",
    "notes",
]

SOURCE = "Grammar and Vocabulary for First and First for Schools wordlist (2015)"
SOURCE_FILENAME = "Grammar--Vocabulary-First-and-First-for-Schools-wordlist.pdf"
EXPECTED_RECORD_COUNT = 744
EXPECTED_SOURCE_ANOMALIES = {
    "page 3: IPA lacks closing slash for 'partner': /pɑːtnə",
    "page 5: IPA lacks closing slash for 'nursery school': /ˈnɜːsəri skuːl",
}

# The PDF alternates its inner/outer margins on odd and even pages.
ODD_COLUMN_BASES = (195.646, 313.992, 432.339, 550.685)
EVEN_COLUMN_BASES = (189.101, 308.585, 428.069, 547.553)

POS_LABELS = {
    "Nouns": "n.",
    "Verbs": "v.",
    "Adjectives": "adj.",
    "Adverbs": "adv.",
    "Verb phrases": "verb phrase",
    "Phrasal verbs": "phrasal verb",
    "Nouns and verbs": "n./v.",
    "Verb phrases with take": "verb phrase",
    "Verb phrases with think": "verb phrase",
    "Phrasal verbs with wear": "phrasal verb",
}
WRAPPED_POS_STARTS = {"Verb phrases with", "Phrasal verbs with"}
HEADWORD_NORMALIZATIONS = {
    # Poppler separates this word because of unusual letter positioning in the PDF.
    # The rendered source visibly prints "technology" as one word.
    "te chnology": "technology",
    # The PDF wraps immediately after the alternative separator; the space is
    # a layout artifact, not part of the parenthesised alternatives.
    "original (song/number/ version)": "original (song/number/version)",
}


@dataclass
class SourceLine:
    page: int
    left: float
    top: float
    height: float
    text: str
    column: int = 0
    column_base: float = 0.0


@dataclass
class EntryBuffer:
    lines: list[SourceLine] = field(default_factory=list)
    forced_reason: str = ""

    @property
    def text(self) -> str:
        return clean_space(" ".join(line.text for line in self.lines))


def clean_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def find_poppler(name: str) -> str:
    candidates = [
        shutil.which(name),
        f"/usr/local/bin/{name}",
        f"/opt/homebrew/bin/{name}",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise RuntimeError(f"Required Poppler command not found: {name}")


def extract_lines(pdf: Path) -> list[SourceLine]:
    pdftotext = find_poppler("pdftotext")
    completed = subprocess.run(
        [pdftotext, "-tsv", str(pdf), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    rows = csv.DictReader(io.StringIO(completed.stdout), delimiter="\t")

    lines: list[SourceLine] = []
    current: SourceLine | None = None
    words: list[tuple[int, str]] = []

    def finish_line() -> None:
        nonlocal current, words
        if current is not None:
            current.text = clean_space(
                " ".join(text for _, text in sorted(words, key=lambda item: item[0]))
            )
            if current.text:
                lines.append(current)
        current = None
        words = []

    for row in rows:
        level = row["level"]
        if level == "4":
            finish_line()
            current = SourceLine(
                page=int(row["page_num"]),
                left=float(row["left"]),
                top=float(row["top"]),
                height=float(row["height"]),
                text="",
            )
        elif level == "5" and current is not None:
            words.append((int(row["word_num"]), row["text"]))
        elif current is not None:
            finish_line()
    finish_line()

    content: list[SourceLine] = []
    for line in lines:
        # Exclude the title, crop marks, running footer, page number and timestamp.
        if not (290.0 < line.top < 905.0 and line.left > 175.0):
            continue
        bases = ODD_COLUMN_BASES if line.page % 2 else EVEN_COLUMN_BASES
        line.column = min(range(4), key=lambda idx: abs(line.left - bases[idx]))
        line.column_base = bases[line.column]
        content.append(line)
    return sorted(content, key=lambda line: (line.page, line.column, line.top, line.left))


def has_ipa_delimiter(text: str) -> bool:
    return re.search(r"(?:(?<=\s)|^)/", text) is not None


def entry_complete(text: str) -> bool:
    _, ipa = split_entry(text)
    # A few wrapped entries put only the IPA opening slash on the first line.
    return ipa.count("/") >= 2 and ipa.rstrip().endswith("/")


def split_entry(text: str) -> tuple[str, str]:
    match = re.search(r"(?:(?<=\s)|^)/", text)
    if not match:
        return clean_space(text), ""
    return clean_space(text[: match.start()]), clean_space(text[match.start() :])


def normalize_ipa(ipa: str) -> str:
    """Remove spacing introduced immediately after a wrapped opening slash."""
    return re.sub(r"^/\s+", "/", clean_space(ipa))


def extract_entries(lines: list[SourceLine]) -> tuple[list[dict[str, str]], list[str]]:
    records: list[dict[str, str]] = []
    anomalies: list[str] = []
    current_unit = ""
    current_topic = ""
    current_pos = ""
    topic_parts: list[str] = []
    pending_pos = ""
    buffer: EntryBuffer | None = None

    def finish_topic() -> None:
        nonlocal current_topic, topic_parts
        if topic_parts:
            current_topic = clean_space(" ".join(topic_parts))
            topic_parts = []

    def finish_buffer(reason: str = "") -> None:
        nonlocal buffer
        if buffer is None or not buffer.lines:
            buffer = None
            return
        if reason:
            buffer.forced_reason = reason
        text = buffer.text
        raw_headword, raw_ipa = split_entry(text)
        ipa = normalize_ipa(raw_ipa)
        headword = HEADWORD_NORMALIZATIONS.get(raw_headword, raw_headword)
        page = buffer.lines[0].page
        details: list[str] = []
        if ipa:
            details.append(f"IPA: {ipa}")
        else:
            details.append("IPA: [not extracted]")
        if len(buffer.lines) > 1:
            details.append(f"joined {len(buffer.lines)} source lines")
        if headword != raw_headword:
            details.append(
                f"normalized PDF text spacing from {raw_headword!r} after visual check"
            )
        if ipa != raw_ipa:
            details.append("normalized IPA boundary spacing")
        if buffer.forced_reason:
            details.append(buffer.forced_reason)

        if not headword:
            anomalies.append(f"page {page}: empty headword from {text!r}")
            buffer = None
            return
        if not ipa:
            anomalies.append(f"page {page}: no IPA delimiter for {headword!r}")
        elif not ipa.endswith("/"):
            details.append("source IPA appears to lack closing slash")
            anomalies.append(f"page {page}: IPA lacks closing slash for {headword!r}: {ipa}")
        if headword.startswith("/") or re.search(
            r"/[ˈˌɑɒæəɛɪʊʌɔθðʃʒŋ]", headword
        ):
            anomalies.append(f"page {page}: suspected IPA in headword {headword!r}")
        if not current_unit or not current_topic or not current_pos:
            anomalies.append(
                f"page {page}: incomplete context for {headword!r} "
                f"(unit={current_unit!r}, topic={current_topic!r}, pos={current_pos!r})"
            )

        section = " | ".join(part for part in (current_unit, current_topic) if part)
        records.append(
            {
                "source": SOURCE,
                "raw_term": headword,
                "headword": headword,
                "pos": current_pos,
                "cefr": "B2",
                "topic_or_section": section,
                "pdf_page": str(page),
                "source_ref": f"{SOURCE_FILENAME}#page={page}",
                "definition": "",
                "notes": "; ".join(details),
            }
        )
        buffer = None

    for line in lines:
        text = line.text

        unit_match = re.fullmatch(r"Unit\s+(\d+)", text)
        if unit_match:
            finish_buffer("terminated at unit heading before closing IPA")
            finish_topic()
            pending_pos = ""
            current_unit = f"Unit {unit_match.group(1)}"
            current_topic = ""
            current_pos = ""
            continue

        # Topic headings use a visibly larger font; wrapped titles are consecutive.
        if line.height >= 12.0:
            finish_buffer("terminated at topic heading before closing IPA")
            if pending_pos:
                anomalies.append(
                    f"page {line.page}: unfinished POS heading {pending_pos!r}"
                )
                pending_pos = ""
            topic_parts.append(text)
            continue

        # POS headings use a medium font. Two labels wrap in the source PDF.
        if line.height >= 9.5:
            finish_buffer("terminated at POS heading before closing IPA")
            finish_topic()
            combined = clean_space(f"{pending_pos} {text}") if pending_pos else text
            if combined in POS_LABELS:
                current_pos = POS_LABELS[combined]
                pending_pos = ""
            elif text in WRAPPED_POS_STARTS:
                pending_pos = text
            else:
                anomalies.append(
                    f"page {line.page}: unrecognised POS heading {combined!r}"
                )
                current_pos = combined
                pending_pos = ""
            continue

        finish_topic()
        if pending_pos:
            anomalies.append(
                f"page {line.page}: POS heading {pending_pos!r} not completed"
            )
            current_pos = pending_pos
            pending_pos = ""

        starts_at_column_base = line.left <= line.column_base + 2.5
        if buffer is not None and entry_complete(buffer.text):
            finish_buffer()
        elif buffer is not None and starts_at_column_base:
            # IPA-only continuations can align with the column base in this PDF.
            _, buffered_ipa = split_entry(buffer.text)
            ipa_continuation = (
                text.startswith("/")
                or (
                    bool(buffered_ipa)
                    and text.endswith("/")
                    and not has_ipa_delimiter(text)
                )
            )
            if not ipa_continuation:
                finish_buffer("next source entry began before closing IPA")

        if buffer is None:
            buffer = EntryBuffer()
            if not starts_at_column_base:
                buffer.forced_reason = "orphan indented line"
        buffer.lines.append(line)
        if entry_complete(buffer.text):
            finish_buffer()

    finish_topic()
    finish_buffer("end of document before closing IPA")
    if pending_pos:
        anomalies.append(f"end of document: unfinished POS heading {pending_pos!r}")
    return records, anomalies


def scan_records(records: list[dict[str, str]]) -> list[str]:
    issues: list[str] = []
    for number, record in enumerate(records, start=2):
        headword = record["headword"]
        if not headword:
            issues.append(f"TSV line {number}: blank headword")
        if headword.startswith("/") or re.search(
            r"/[ˈˌɑɒæəɛɪʊʌɔθðʃʒŋ]", headword
        ):
            issues.append(f"TSV line {number}: IPA-like headword {headword!r}")
        if "\t" in headword or "\n" in headword:
            issues.append(f"TSV line {number}: forbidden whitespace in headword")
        if "IPA:" not in record["notes"]:
            issues.append(f"TSV line {number}: missing IPA note for {headword!r}")
        if not record["pos"]:
            issues.append(f"TSV line {number}: blank POS for {headword!r}")
        if not re.fullmatch(r"Unit \d+ \| .+", record["topic_or_section"]):
            issues.append(
                f"TSV line {number}: incomplete unit/topic "
                f"{record['topic_or_section']!r} for {headword!r}"
            )
    return issues


def write_tsv(path: Path, records: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=HEADER,
            delimiter="\t",
            lineterminator="\n",
            extrasaction="raise",
        )
        writer.writeheader()
        writer.writerows(records)


def write_report(
    path: Path,
    pdf: Path,
    output: Path,
    records: list[dict[str, str]],
    extraction_anomalies: list[str],
    scan_issues: list[str],
) -> None:
    page_counts = Counter(record["pdf_page"] for record in records)
    unit_counts = Counter(
        record["topic_or_section"].split(" | ", 1)[0] for record in records
    )
    wrapped_count = sum("joined " in record["notes"] for record in records)
    missing_close = [
        record
        for record in records
        if "source IPA appears to lack closing slash" in record["notes"]
    ]

    lines = [
        "# Cambridge First wordlist extraction report",
        "",
        "## Inputs and method",
        "",
        f"- Source PDF: `{pdf}`",
        "- PDF pages: 6",
        "- Extraction: Poppler `pdftotext -tsv`, followed by coordinate-based "
        "page/column ordering.",
        "- Wrapped terms and IPA are joined only when the following physical line "
        "is indented within the same column.",
        "- IPA is retained in `notes`; `headword` and `raw_term` contain term text only.",
        "- `topic_or_section` preserves both source unit and topic as "
        "`Unit NN | Topic`.",
        "- CEFR is retained as B2 from the prior corpus record for this First-level "
        "wordlist; it is corpus metadata rather than a printed per-entry field.",
        "",
        "## Output",
        "",
        f"- TSV: `{output}`",
        f"- Data rows: {len(records)}",
        f"- Physical source wraps joined: {wrapped_count}",
        f"- Structural scan issues: {len(scan_issues)}",
        "",
        "### Rows by PDF page",
        "",
    ]
    lines.extend(f"- Page {page}: {page_counts[str(page)]}" for page in range(1, 7))
    lines.extend(["", "### Rows by unit", ""])
    for unit in sorted(unit_counts, key=lambda item: int(item.split()[1])):
        lines.append(f"- {unit}: {unit_counts[unit]}")

    lines.extend(
        [
            "",
            "## Visual verification",
            "",
            "- Page 1 was rendered and checked against the extracted reading order. "
            "It confirms Unit 25 spans columns 1-2, Unit 26 spans columns 2-3, and "
            "Unit 27 occupies column 4.",
            "- Page 3 was rendered and checked for cross-column continuations and "
            "parenthesised phrases, including Unit 32 -> Unit 36 transitions.",
            "- Page 5 was rendered and checked for the wrapped heading `Phrasal verbs "
            "with wear`, multi-line IPA, and Unit 40 -> Unit 43 transitions.",
            "- Page 6 was rendered and checked for Unit 43/44 continuation, the "
            "visually printed spelling `technology`, and the wrapped "
            "`Verb phrases with think` heading.",
            "- Rendered PNGs are under `tmp/pdfs/first_fixed/rendered/`.",
            "",
            "## Structure and anomaly scans",
            "",
            "- Header has exactly 10 fields.",
            "- Every emitted row has exactly 10 TSV fields.",
            "- No emitted headword begins with IPA or contains an IPA-looking slash sequence.",
            "- No emitted headword contains tabs or newlines.",
            "- Every emitted row has unit, topic, POS, page, source reference and an IPA note.",
            "- Duplicate headwords are retained when the source prints them in different "
            "units, topics or POS sections.",
            "",
            "## Uncertain source items",
            "",
        ]
    )
    if missing_close:
        for record in missing_close:
            lines.append(
                f"- Page {record['pdf_page']}: `{record['headword']}` is printed/extracted "
                f"with IPA `{record['notes'].split(';', 1)[0][5:]}` lacking a closing "
                "slash. The term is retained and explicitly flagged rather than repaired."
            )
    else:
        lines.append("- None.")

    lines.extend(["", "## Extraction diagnostics", ""])
    if extraction_anomalies:
        lines.extend(f"- {item}" for item in extraction_anomalies)
    else:
        lines.append("- No extraction anomalies.")
    lines.extend(["", "## Post-write scan", ""])
    if scan_issues:
        lines.extend(f"- {item}" for item in scan_issues)
    else:
        lines.append("- Passed with zero structural issues.")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pdf",
        type=Path,
        default=Path(
            "/Users/huhu/Downloads/"
            "Grammar--Vocabulary-First-and-First-for-Schools-wordlist.pdf"
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tmp/pdfs/first_fixed/first_first_for_schools.tsv"),
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("tmp/pdfs/first_fixed/extraction_report.md"),
    )
    args = parser.parse_args()

    lines = extract_lines(args.pdf)
    records, extraction_anomalies = extract_entries(lines)
    scan_issues = scan_records(records)
    if len(records) != EXPECTED_RECORD_COUNT:
        raise ValueError(
            f"Expected {EXPECTED_RECORD_COUNT} records, found {len(records)}"
        )
    if set(extraction_anomalies) != EXPECTED_SOURCE_ANOMALIES:
        raise ValueError(
            "First wordlist anomaly set changed: "
            f"{sorted(extraction_anomalies)}"
        )
    if scan_issues:
        raise ValueError(f"First wordlist structural scan failed: {scan_issues}")
    write_tsv(args.output, records)
    write_report(
        args.report,
        args.pdf,
        args.output,
        records,
        extraction_anomalies,
        scan_issues,
    )

    print(f"rows={len(records)}")
    print(f"extraction_anomalies={len(extraction_anomalies)}")
    print(f"scan_issues={len(scan_issues)}")
    print(f"output={args.output}")
    print(f"report={args.report}")


if __name__ == "__main__":
    main()
