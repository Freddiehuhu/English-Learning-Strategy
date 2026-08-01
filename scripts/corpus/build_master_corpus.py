#!/usr/bin/env python3
"""Merge auditable vocabulary TSVs into a deduplicated IELTS corpus.

The public outputs intentionally omit source definitions. The source PDFs and
their extracted definition text remain local so the repository does not
republish long copyrighted glosses.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


CEFR_ORDER = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}
SKILLS = ("listening", "speaking", "reading", "writing")
CONTENT_POS = {"noun", "verb", "adjective", "adverb"}
PROPER_NOUN_TOPICS = ("days", "months", "continents", "countries", "languages")
AUDITED_PROPER_NOUN_SOURCE_FORMS = {
    "Friday",
    "MasterCard",
    "Monday",
    "Saturday",
    "Sunday",
    "Thursday",
    "Tuesday",
    "VISA",
    "Wednesday",
}
OPTIONAL_COMPLEMENTS = {
    "as",
    "by",
    "by/with",
    "for",
    "from",
    "in",
    "not",
    "of",
    "off",
    "on",
    "on/upon",
    "out",
    "over",
    "sth",
    "sth else",
    "sth/sb",
    "sb",
    "sb/sth",
    "to",
    "together",
    "up",
    "with",
    "with sb",
    "with sth",
    "with/together",
}
GAME_CANDIDATE_STATUS = {
    "image_guess": "needs_approved_sense",
    "synonym_antonym": "needs_editorial_review",
    "homophone": "needs_pronunciation_evidence",
    "homograph": "pos_evidence_candidate",
    "analogy": "needs_editorial_review",
    "category_taxonomy": "needs_hypernym_review",
    "collocation": "needs_usage_evidence",
}
ABSTRACT_SUFFIXES = (
    "acy",
    "ance",
    "ancy",
    "ation",
    "dom",
    "ence",
    "ency",
    "hood",
    "ism",
    "ity",
    "ment",
    "ness",
    "ship",
    "sion",
    "tion",
)

REQUIRED_COLUMNS = {"source", "raw_term", "headword"}
SOURCE_ROLES = {
    "target_reference",
    "lexical_candidate",
    "relation_reference",
    "activity_reference",
    "linguistic_reference",
    "pedagogy_reference",
}
CORPUS_POLICIES = {
    "target",
    "candidate_only",
    "enrich_only",
    "methods_only",
}
SOURCE_ROLE_POLICIES = {
    "target_reference": "target",
    "lexical_candidate": "candidate_only",
    "relation_reference": "enrich_only",
    "linguistic_reference": "enrich_only",
    "activity_reference": "methods_only",
    "pedagogy_reference": "methods_only",
}
SOURCE_FORMATS = {"pdf", "docx", "epub", "other"}
DEFAULT_SUPPLEMENTARY_REGISTRY = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "ielts-corpus"
    / "supplemental-source-registry.json"
)
PUBLIC_SOURCE_FIELDS = (
    "source_id",
    "source",
    "pos",
    "cefr",
    "topic_or_section",
    "pdf_page",
    "source_ref",
)
SUPPLEMENTARY_SOURCE_FIELDS = (
    *PUBLIC_SOURCE_FIELDS,
    "registry_source_id",
    "source_format",
    "locator",
    "source_role",
    "corpus_policy",
)


@dataclass(frozen=True)
class SourceRow:
    source: str
    raw_term: str
    headword: str
    pos: str
    cefr: str
    topic: str
    pdf_page: str
    source_ref: str
    definition: str
    notes: str
    source_file: str
    source_role: str = "target_reference"
    corpus_policy: str = "target"
    source_format: str = "pdf"
    locator: str = ""
    registry_source_id: str = ""

    @property
    def source_id(self) -> str:
        return stable_slug(self.source)


@dataclass
class EntryGroup:
    key: str
    rows: list[SourceRow] = field(default_factory=list)


def clean_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = (
        text.replace("\u00a0", " ")
        .replace("’", "'")
        .replace("‘", "'")
        .replace("–", "-")
        .replace("—", "-")
    )
    return re.sub(r"\s+", " ", text).strip()


def clean_lexical_form(value: str) -> str:
    """Return a public-safe lexical form without source sense glosses."""

    text = clean_text(value)
    if text.casefold() == "(a)round":
        return "around"
    if text.casefold() == "kilo(gram[me]) / kg":
        return "kilogram / kg"

    while True:
        trailing = re.fullmatch(r"(.*?)\s+\(([^()]*)\)", text)
        if not trailing:
            break
        base = trailing.group(1).strip()
        qualifier = trailing.group(2).strip()
        qualifier_key = qualifier.casefold()
        if qualifier_key in OPTIONAL_COMPLEMENTS:
            text = f"{base} {qualifier}"
        else:
            text = base

    # Keep leading combined-family forms such as "(un)healthy" visible. For
    # optional spelling suffixes and mid-phrase examples, retain only the base
    # lexical form.
    text = re.sub(
        r"(?<=\w)\((?:s|es|d|e|h|me|my|dy|graph|theque|time|wards)\)",
        "",
        text,
    )
    text = re.sub(r"(?<=\s)\((?:sb|sth)\)(?=\s)", lambda match: match.group(0)[1:-1], text)
    text = re.sub(r"\s+\([^()]+\)(?=\s)", " ", text)
    return clean_text(text)


def normalise_key(value: str) -> str:
    text = clean_lexical_form(value).casefold()
    text = re.sub(r"^[•·▪◦*-]+\s*", "", text)
    text = re.sub(r"\b(somebody|someone)\b", "sb", text)
    text = re.sub(r"\b(something)\b", "sth", text)
    text = re.sub(r"\b(somewhere)\b", "somewhere", text)
    text = re.sub(r"\s*/\s*", "/", text)
    text = re.sub(r"\s*-\s*", "-", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" ,;:.")


def stable_slug(value: str) -> str:
    key = clean_text(value).casefold()
    ascii_text = unicodedata.normalize("NFKD", key).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-") or "entry"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:8]
    return f"{slug[:54]}-{digest}"


def canonical_source_name(value: str) -> str:
    source = clean_text(value)
    unit_match = re.fullmatch(
        r"CompleteCAE_WLM_ExtendedUnit(\d+)(?:\.pdf)?",
        source,
        re.IGNORECASE,
    )
    if unit_match:
        return f"Complete CAE Extended Unit {int(unit_match.group(1)):02d}"
    if re.fullmatch(
        r"CompleteCAE_WLM_PhrasalVerbs(?:\.pdf)?",
        source,
        re.IGNORECASE,
    ):
        return "Complete CAE Phrasal Verbs"
    return source


def canonical_cefr(value: str) -> list[str]:
    levels = re.findall(r"\b[ABC][12]\b", clean_text(value).upper())
    return sorted(set(levels), key=lambda item: CEFR_ORDER[item])


def canonical_pos(value: str) -> list[str]:
    raw = clean_text(value).lower()
    found: list[str] = []
    patterns = (
        ("proper noun", (r"\bproper noun\b", r"\bproper n\b")),
        ("phrasal verb", (r"\bphrasal verb\b", r"\bphr v\b")),
        ("verb phrase", (r"\bverb phrase\b", r"\bvp\b")),
        ("noun phrase", (r"\bnoun phrase\b", r"\bnp\b")),
        ("adjective phrase", (r"\badjective phrase\b", r"\badjp\b")),
        ("adverb phrase", (r"\badverb phrase\b", r"\badvp\b")),
        ("prepositional phrase", (r"\bprepositional phrase\b", r"\bprep phr\b", r"\bpp\b")),
        ("idiom", (r"\bidiom\b",)),
        (
            "phrase",
            (
                r"^phr\.?$",
                r"\bgeneral phrase\b",
                r"\bexpression\b",
                r"^exp\.?$",
            ),
        ),
        ("question word", (r"\bquestion word\b",)),
        ("auxiliary verb", (r"\bauxiliary verb\b", r"\bav\b")),
        ("modal verb", (r"\bmodal verb\b", r"\bmv\b", r"\bmodal v\b")),
        ("noun", (r"\bnoun\b", r"(?<![a-z])n(?:\.|\b)")),
        ("verb", (r"\bverb\b", r"(?<![a-z])v(?:\.|\b)")),
        ("adjective", (r"\badjective\b", r"\badj(?:\.|\b)")),
        ("adverb", (r"\badverb\b", r"\badv(?:\.|\b)")),
        ("preposition", (r"\bpreposition\b", r"\bprep(?:\.|\b)")),
        ("conjunction", (r"\bconjunction\b", r"\bconj(?:\.|\b)")),
        ("pronoun", (r"\bpronoun\b", r"\bpron(?:\.|\b)")),
        ("determiner", (r"\bdeterminer\b", r"\bdet(?:\.|\b)")),
        ("article", (r"\barticle\b", r"\bart(?:\.|\b)")),
        ("exclamation", (r"\bexclamation\b", r"\bexclam(?:\.|\b)", r"\bint(?:\.|\b)")),
        ("number", (r"\bnumber\b",)),
    )
    for label, regexes in patterns:
        if any(re.search(pattern, raw) for pattern in regexes):
            found.append(label)
    return found or (["unspecified"] if raw else [])


def read_tsv(
    path: Path,
    *,
    allow_legacy_target: bool = False,
) -> list[SourceRow]:
    rows: list[SourceRow] = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - columns
        if missing:
            raise ValueError(f"{path}: missing columns {sorted(missing)}")
        policy_columns = {
            "registry_source_id",
            "source_role",
            "corpus_policy",
            "source_format",
        }
        missing_policy_columns = policy_columns - columns
        if missing_policy_columns and not allow_legacy_target:
            raise ValueError(
                f"{path}: supplementary TSV is missing explicit policy "
                f"columns {sorted(missing_policy_columns)}; only inputs named "
                "with --legacy-target-input may use legacy defaults"
            )
        for row in reader:
            headword = clean_text(row.get("headword"))
            raw_term = clean_text(row.get("raw_term")) or headword
            source = canonical_source_name(row.get("source")) or path.stem
            if not headword:
                continue
            source_role = clean_text(row.get("source_role"))
            corpus_policy = clean_text(row.get("corpus_policy"))
            source_format = clean_text(row.get("source_format"))
            registry_source_id = clean_text(row.get("registry_source_id"))
            if allow_legacy_target and (
                (source_role and source_role != "target_reference")
                or (corpus_policy and corpus_policy != "target")
            ):
                raise ValueError(
                    f"{path}: --legacy-target-input may contain only target "
                    f"rows; {headword!r} declares source_role="
                    f"{source_role!r}, corpus_policy={corpus_policy!r}"
                )
            if not allow_legacy_target and not all(
                (
                    registry_source_id,
                    source_role,
                    corpus_policy,
                    source_format,
                )
            ):
                raise ValueError(
                    f"{path}: supplementary row {headword!r} must set "
                    "registry_source_id, source_role, corpus_policy and "
                    "source_format"
                )
            source_role = source_role or "target_reference"
            corpus_policy = corpus_policy or "target"
            source_format = source_format or "pdf"
            if source_role not in SOURCE_ROLES:
                raise ValueError(
                    f"{path}: unknown source_role {source_role!r} for {headword!r}"
                )
            if corpus_policy not in CORPUS_POLICIES:
                raise ValueError(
                    f"{path}: unknown corpus_policy {corpus_policy!r} "
                    f"for {headword!r}"
                )
            expected_policy = SOURCE_ROLE_POLICIES[source_role]
            if corpus_policy != expected_policy:
                raise ValueError(
                    f"{path}: source_role {source_role!r} requires "
                    f"corpus_policy {expected_policy!r}, not "
                    f"{corpus_policy!r}, for {headword!r}"
                )
            if source_format not in SOURCE_FORMATS:
                raise ValueError(
                    f"{path}: unknown source_format {source_format!r} "
                    f"for {headword!r}"
                )
            rows.append(
                SourceRow(
                    source=source,
                    raw_term=raw_term,
                    headword=headword,
                    pos=clean_text(row.get("pos")),
                    cefr=clean_text(row.get("cefr")),
                    topic=clean_text(row.get("topic_or_section")),
                    pdf_page=clean_text(row.get("pdf_page")),
                    source_ref=clean_text(row.get("source_ref")),
                    definition=clean_text(row.get("definition")),
                    notes=clean_text(row.get("notes")),
                    source_file=path.name,
                    source_role=source_role,
                    corpus_policy=corpus_policy,
                    source_format=source_format,
                    locator=clean_text(row.get("locator")),
                    registry_source_id=registry_source_id,
                )
            )
    return rows


def load_supplementary_registry(path: Path) -> dict[str, dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    sources = payload.get("sources")
    if not isinstance(sources, list):
        raise ValueError(f"{path}: registry sources must be a list")
    registry: dict[str, dict] = {}
    for source in sources:
        if not isinstance(source, dict) or not source.get("id"):
            raise ValueError(f"{path}: invalid registry source")
        source_id = clean_text(source["id"])
        if source_id in registry:
            raise ValueError(f"{path}: duplicate registry id {source_id!r}")
        registry[source_id] = source
    return registry


def validate_supplementary_registry_links(
    rows: list[SourceRow],
    registry: dict[str, dict],
) -> None:
    for row in rows:
        if row.corpus_policy == "target":
            continue
        source = registry.get(row.registry_source_id)
        if source is None:
            raise ValueError(
                f"{row.source_file}: unknown registry_source_id "
                f"{row.registry_source_id!r}"
            )
        expected = {
            "source_role": row.source_role,
            "corpus_policy": row.corpus_policy,
            "format": row.source_format,
        }
        for field_name, observed in expected.items():
            registered = clean_text(source.get(field_name))
            if registered != observed:
                raise ValueError(
                    f"{row.source_file}: registry_source_id "
                    f"{row.registry_source_id!r} declares {field_name}="
                    f"{registered!r}, not {observed!r}"
                )


def source_row_quality_issues(row: SourceRow) -> list[str]:
    """Return conservative signals that an alphabetical PDF row is page noise.

    Cambridge alphabetical lists occasionally expose a wrapped example line as
    though it were a new dictionary entry. These checks deliberately apply only
    to rows whose extractor supplied an alphabetical section marker.
    """

    section_match = re.fullmatch(
        r"Alphabetical list:\s*([A-Z])",
        clean_text(row.topic),
        re.IGNORECASE,
    )
    if not section_match:
        return []

    issues: list[str] = []
    first_letter = re.search(r"[A-Za-z]", row.headword)
    if (
        first_letter
        and first_letter.group(0).upper() != section_match.group(1).upper()
    ):
        issues.append("headword does not match alphabetical section")

    headword_key = clean_text(row.headword).casefold()
    if headword_key.endswith(".") and headword_key not in {"a.m.", "p.m."}:
        issues.append("sentence-like terminal period")

    if normalise_key(row.raw_term) != normalise_key(row.headword):
        issues.append("raw term and headword differ in an alphabetical source")
    return issues


def validate_source_rows(rows: list[SourceRow]) -> list[str]:
    issues: list[str] = []
    for row in rows:
        for problem in source_row_quality_issues(row):
            issues.append(
                f"{row.source_file}: p.{row.pdf_page or '?'} "
                f"{row.headword!r}: {problem}"
            )
    return issues


def find_tsvs(inputs: Iterable[Path]) -> list[Path]:
    paths: set[Path] = set()
    for item in inputs:
        if item.is_dir():
            paths.update(item.rglob("*.tsv"))
        elif item.suffix.lower() == ".tsv":
            paths.add(item)
    return sorted(paths)


def display_headword(rows: list[SourceRow]) -> str:
    counts = Counter(clean_lexical_form(row.headword) for row in rows)
    candidates = sorted(
        counts,
        key=lambda item: (
            -counts[item],
            item != item.casefold(),
            len(item),
            item.casefold(),
        ),
    )
    return candidates[0]


def source_scores(rows: list[SourceRow], parts_of_speech: set[str], levels: set[str]) -> dict:
    scores = {skill: 0 for skill in SKILLS}
    reasons: dict[str, list[str]] = {skill: [] for skill in SKILLS}

    def add(skill: str, points: int, reason: str) -> None:
        scores[skill] += points
        if reason not in reasons[skill]:
            reasons[skill].append(reason)

    sources = " ".join(row.source.casefold() for row in rows)
    compact_sources = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", sources)
    explicit_listening = "listening" in sources or "听力" in sources
    if explicit_listening:
        add("listening", 8, "explicit IELTS listening source")
    if "oxford" in sources:
        add("reading", 4, "Oxford core/advanced vocabulary source")
    if "completecae" in compact_sources:
        add("reading", 4, "C1 CAE source")
        add("writing", 3, "C1 CAE production source")
    if "first" in sources and "cae" not in sources:
        add("speaking", 3, "B2 topic and phrase source")
        add("writing", 2, "B2 First source")
        add("reading", 2, "B2 First source")
    if "preliminary" in sources or "ket" in sources:
        add("speaking", 3, "general productive vocabulary source")
        add("listening", 2, "general receptive vocabulary source")
        add("reading", 2, "general receptive vocabulary source")

    lowest = min((CEFR_ORDER[level] for level in levels), default=0)
    highest = max((CEFR_ORDER[level] for level in levels), default=0)
    if lowest and lowest <= CEFR_ORDER["A2"]:
        add("listening", 2, "high-frequency beginner level")
        add("speaking", 2, "high-frequency beginner level")
    if CEFR_ORDER["B1"] in {CEFR_ORDER[level] for level in levels}:
        for skill in SKILLS:
            add(skill, 1, "B1 four-skill utility")
    if highest >= CEFR_ORDER["B2"]:
        add("reading", 3, "upper-intermediate or advanced level")
        add("writing", 2, "upper-intermediate or advanced level")

    phrase_like = any("phrase" in pos or pos in {"idiom", "phrasal verb"} for pos in parts_of_speech)
    if phrase_like or any(" " in normalise_key(row.headword) for row in rows):
        add("speaking", 3, "multiword production pattern")
        add("listening", 2, "multiword decoding pattern")
    if parts_of_speech & CONTENT_POS:
        for skill in SKILLS:
            add(skill, 1, "content word")
    if "noun" in parts_of_speech or "adjective" in parts_of_speech:
        add("writing", 1, "useful for precise written description")
        add("reading", 1, "information-dense content word")
    if "verb" in parts_of_speech or "adverb" in parts_of_speech:
        add("speaking", 1, "useful for clause production")

    max_score = max(scores.values())
    labels = [
        skill
        for skill in SKILLS
        if scores[skill] >= max(3, max_score - 2)
    ]
    if not labels:
        labels = [max(SKILLS, key=lambda skill: scores[skill])]

    headword_key = normalise_key(rows[0].headword)
    advanced_writing_candidate = highest >= CEFR_ORDER["B2"] and (
        "adjective" in parts_of_speech
        or "adverb" in parts_of_speech
        or (
            "noun" in parts_of_speech
            and len(headword_key) >= 6
            and headword_key.endswith(ABSTRACT_SUFFIXES)
        )
    )
    if explicit_listening:
        primary = "listening"
        primary_reason = "explicit IELTS listening source"
        confidence = "high"
    elif phrase_like and scores["speaking"] >= max_score - 1:
        primary = "speaking"
        primary_reason = "multiword productive pattern"
        confidence = "high" if scores["speaking"] == max_score else "medium"
    elif advanced_writing_candidate:
        primary = "writing"
        primary_reason = "advanced descriptive or abstract production word"
        confidence = (
            "medium" if scores["writing"] >= max_score - 2 else "review"
        )
    else:
        tie_order = ("reading", "writing", "speaking", "listening")
        primary = max(tie_order, key=lambda skill: (scores[skill], -tie_order.index(skill)))
        primary_reason = "highest evidence score"
        margin = sorted(scores.values(), reverse=True)
        confidence = (
            "high"
            if margin[0] - margin[1] >= 3
            else "medium"
            if margin[0] > margin[1]
            else "review"
        )
    if primary not in labels:
        labels.append(primary)
        labels.sort(key=SKILLS.index)
    return {
        "primary": primary,
        "primary_reason": primary_reason,
        "labels": labels,
        "scores": scores,
        "reasons": {skill: reasons[skill] for skill in SKILLS if reasons[skill]},
        "confidence": confidence,
        "method": "evidence-rules-v2",
    }


def image_plan(
    headword: str,
    parts_of_speech: set[str],
    levels: set[str],
    source_count: int,
    skill_profile: dict,
    proper_noun: bool,
    multi_sense_candidate: bool,
) -> dict:
    content = parts_of_speech & CONTENT_POS
    phrase_like = " " in normalise_key(headword) or any("phrase" in pos for pos in parts_of_speech)
    if proper_noun or not content:
        return {
            "eligible": False,
            "mode": "none",
            "priority": "none",
            "review_required": True,
            "prompt_status": "not_applicable",
        }

    if multi_sense_candidate:
        mode = "multi-sense-panel"
    elif phrase_like:
        mode = "context-scene"
    elif "adjective" in content:
        mode = "contrast-pair"
    elif "adverb" in content:
        mode = "manner-sequence"
    elif "verb" in content:
        mode = "action-scene"
    elif normalise_key(headword).endswith(ABSTRACT_SUFFIXES):
        mode = "concept-metaphor"
    else:
        mode = "object-or-context-scene"

    priority_score = source_count * 2
    if levels & {"B1", "B2"}:
        priority_score += 2
    if skill_profile["primary"] in {"listening", "speaking"}:
        priority_score += 1
    if not phrase_like:
        priority_score += 1
    priority = "high" if priority_score >= 7 else "medium" if priority_score >= 4 else "low"
    return {
        "eligible": True,
        "mode": mode,
        "priority": priority,
        "review_required": True,
        "prompt_status": "needs_teacher_approved_sense",
        "style": "warm hand-painted Japanese animation-film aesthetic; text-free; learner-safe",
    }


def source_row_to_public(
    row: SourceRow,
    *,
    include_policy: bool = False,
) -> dict:
    payload = {
        "source_id": row.source_id,
        "source": row.source,
        "registry_source_id": row.registry_source_id,
        "pos": row.pos,
        "cefr": row.cefr,
        "topic_or_section": row.topic,
        "source_format": row.source_format,
        "locator": row.locator,
        "pdf_page": row.pdf_page,
        "source_ref": row.source_ref,
        "source_role": row.source_role,
        "corpus_policy": row.corpus_policy,
    }
    fields = (
        SUPPLEMENTARY_SOURCE_FIELDS
        if include_policy
        else PUBLIC_SOURCE_FIELDS
    )
    return {key: payload[key] for key in fields if payload[key] != ""}


def is_audited_proper_noun_topic(row: SourceRow) -> bool:
    return any(token in row.topic.casefold() for token in PROPER_NOUN_TOPICS)


def is_proper_noun_source_sense(
    row: SourceRow,
    *,
    audited_group: bool = False,
) -> bool:
    explicit = "proper noun" in canonical_pos(row.pos)
    audited_exact_source_sense = clean_text(row.raw_term) in AUDITED_PROPER_NOUN_SOURCE_FORMS
    topic_headword = re.sub(
        r"^the\s+",
        "",
        clean_text(row.headword),
        flags=re.IGNORECASE,
    )
    audited_topic_sense = (
        is_audited_proper_noun_topic(row)
        and bool(re.match(r"^[A-Z]", topic_headword))
    )
    matching_capitalized_sense = audited_group and bool(
        re.match(r"^[A-Z]", clean_text(row.headword))
    )
    return (
        explicit
        or audited_exact_source_sense
        or audited_topic_sense
        or matching_capitalized_sense
    )


def has_multiple_lexical_parts_of_speech(rows: list[SourceRow]) -> bool:
    """Distinguish homographs from syntactic labels such as adjective + noun."""

    lexical_pos: set[str] = set()
    for row in rows:
        if "+" in clean_text(row.pos):
            continue
        lexical_pos.update(set(canonical_pos(row.pos)) & CONTENT_POS)
    return len(lexical_pos) > 1


def build_entry(group: EntryGroup) -> dict:
    all_rows = group.rows
    target_rows = [
        row for row in all_rows if row.corpus_policy == "target"
    ]
    candidate_rows = [
        row for row in all_rows if row.corpus_policy == "candidate_only"
    ]
    enrichment_rows = [
        row for row in all_rows if row.corpus_policy == "enrich_only"
    ]
    audited_proper_group = any(
        is_audited_proper_noun_topic(row) for row in target_rows
    )
    proper_noun_rows = [
        row
        for row in target_rows
        if is_proper_noun_source_sense(
            row,
            audited_group=audited_proper_group,
        )
    ]
    learning_rows = [
        row
        for row in target_rows
        if not is_proper_noun_source_sense(
            row,
            audited_group=audited_proper_group,
        )
    ]
    candidate_proper_noun_rows = [
        row
        for row in candidate_rows
        if is_proper_noun_source_sense(row)
    ]
    candidate_learning_rows = [
        row
        for row in candidate_rows
        if not is_proper_noun_source_sense(row)
    ]
    excluded_proper_noun = bool(target_rows) and not learning_rows
    if target_rows:
        rows = learning_rows or target_rows
        status = "excluded_proper_noun" if excluded_proper_noun else "active"
    elif candidate_rows:
        rows = candidate_learning_rows or candidate_rows
        status = (
            "candidate_only"
            if candidate_learning_rows
            else "excluded_proper_noun"
        )
    else:
        rows = enrichment_rows or all_rows
        status = "support_only"
    headword = display_headword(rows)
    pos = {label for row in rows for label in canonical_pos(row.pos)}
    pos.discard("unspecified")
    levels = {level for row in rows for level in canonical_cefr(row.cefr)}
    sources = sorted({row.source for row in rows})
    topics = sorted({row.topic for row in rows if row.topic})
    multi_sense_candidate = has_multiple_lexical_parts_of_speech(rows)
    if status in {"active", "excluded_proper_noun"}:
        skill_profile = source_scores(rows, pos, levels)
    else:
        skill_profile = {
            "primary": "",
            "primary_reason": "not classified before target approval",
            "labels": [],
            "scores": {skill: 0 for skill in SKILLS},
            "reasons": {},
            "confidence": "review",
            "method": "not-applied-to-supplementary-source",
        }
    public_rows = []
    seen_rows = set()
    for row in learning_rows:
        public = source_row_to_public(row)
        signature = json.dumps(public, ensure_ascii=False, sort_keys=True)
        if signature in seen_rows:
            continue
        seen_rows.add(signature)
        public_rows.append(public)
    public_rows.sort(
        key=lambda row: (
            row.get("source", ""),
            int(row.get("pdf_page", 0)) if str(row.get("pdf_page", "")).isdigit() else 0,
            row.get("source_ref", ""),
        )
    )
    supplementary_rows = []
    seen_supplementary_rows = set()
    for row in candidate_rows + enrichment_rows:
        public = source_row_to_public(row, include_policy=True)
        signature = json.dumps(public, ensure_ascii=False, sort_keys=True)
        if signature in seen_supplementary_rows:
            continue
        seen_supplementary_rows.add(signature)
        supplementary_rows.append(public)
    supplementary_rows.sort(
        key=lambda row: (
            row.get("source", ""),
            row.get("locator", ""),
            row.get("source_ref", ""),
        )
    )
    candidate_pos = {
        label for row in candidate_rows for label in canonical_pos(row.pos)
    }
    candidate_pos.discard("unspecified")
    candidate_levels = {
        level for row in candidate_rows for level in canonical_cefr(row.cefr)
    }
    content_pos = sorted(pos & CONTENT_POS)
    return {
        "id": stable_slug(group.key),
        "headword": headword,
        "normalized_key": group.key,
        "status": status,
        "is_phrase": " " in group.key,
        "parts_of_speech": sorted(pos) or ["unspecified"],
        "cefr_levels": sorted(levels, key=lambda item: CEFR_ORDER[item]),
        "cefr_min": min(levels, key=lambda item: CEFR_ORDER[item]) if levels else "",
        "cefr_max": max(levels, key=lambda item: CEFR_ORDER[item]) if levels else "",
        "topics": topics,
        "sources": sources,
        "source_count": len(sources),
        "source_rows": public_rows,
        "supplementary_source_rows": supplementary_rows,
        "candidate_sources": sorted({row.source for row in candidate_rows}),
        "candidate_source_count": len({row.source for row in candidate_rows}),
        "candidate_parts_of_speech": sorted(candidate_pos) or (
            ["unspecified"] if candidate_rows else []
        ),
        "candidate_cefr_levels": sorted(
            candidate_levels,
            key=lambda item: CEFR_ORDER[item],
        ),
        "enrichment_sources": sorted({row.source for row in enrichment_rows}),
        "enrichment_source_count": len(
            {row.source for row in enrichment_rows}
        ),
        "source_definition_count": len({row.definition for row in rows if row.definition}),
        "skill_profile": skill_profile,
        "image_plan": image_plan(
            headword,
            pos,
            levels,
            len(sources),
            skill_profile,
            status != "active",
            multi_sense_candidate,
        ),
        "review_flags": {
            "proper_noun_sense_candidate": bool(
                candidate_proper_noun_rows
            ),
            "proper_noun_sense_removed": bool(proper_noun_rows),
            "proper_noun_source_rows_removed": len(proper_noun_rows),
            "source_correction_present": any(
                "source typo" in row.notes.casefold()
                or "source layout" in row.notes.casefold()
                for row in target_rows
            ),
        },
        "relation_flags": {
            "homograph_candidate": multi_sense_candidate,
            "homophone_status": "pending_pronunciation_data",
            "taxonomy_candidate": "noun" in pos,
            "word_family_candidate": bool(content_pos),
            "synonym_antonym_status": "needs_editorial_review",
        },
    }


def source_pdf_filename(row: SourceRow) -> str:
    if ".pdf#page=" in row.source_ref.casefold():
        return Path(row.source_ref.split("#page=", 1)[0]).name
    if row.source.casefold().endswith(".pdf"):
        return Path(row.source).name
    unit_match = re.fullmatch(
        r"Complete CAE Extended Unit (\d+)",
        row.source,
        re.IGNORECASE,
    )
    if unit_match:
        return f"CompleteCAE_WLM_ExtendedUnit{int(unit_match.group(1)):02d}.pdf"
    if row.source.casefold() == "complete cae phrasal verbs":
        return "CompleteCAE_WLM_PhrasalVerbs.pdf"
    return ""


def build_source_manifest(rows: list[SourceRow]) -> list[dict]:
    by_source: dict[str, list[SourceRow]] = defaultdict(list)
    for row in rows:
        by_source[row.source].append(row)
    manifest = []
    for source, source_rows in sorted(by_source.items()):
        manifest.append(
            {
                "id": stable_slug(source),
                "name": source,
                "source_files": sorted({row.source_file for row in source_rows}),
                "source_formats": sorted(
                    {row.source_format for row in source_rows}
                ),
                "registry_source_ids": sorted(
                    {
                        row.registry_source_id
                        for row in source_rows
                        if row.registry_source_id
                    }
                ),
                "source_roles": sorted(
                    {row.source_role for row in source_rows}
                ),
                "corpus_policies": sorted(
                    {row.corpus_policy for row in source_rows}
                ),
                "pdf_files": sorted(
                    {
                        source_pdf_filename(row)
                        for row in source_rows
                        if source_pdf_filename(row)
                    }
                ),
                "pdf_pages": sorted(
                    {
                        int(row.pdf_page)
                        for row in source_rows
                        if row.pdf_page.isdigit()
                    }
                ),
                "extracted_rows": len(source_rows),
                "unique_normalized_terms": len(
                    {normalise_key(row.headword) for row in source_rows}
                ),
                "cefr_levels": sorted(
                    {
                        level
                        for row in source_rows
                        for level in canonical_cefr(row.cefr)
                    },
                    key=lambda item: CEFR_ORDER[item],
                ),
                "public_definition_policy": "omitted_from_public_outputs",
            }
        )
    return manifest


def write_supplementary_candidate_tsv(
    path: Path,
    entries: list[dict],
) -> None:
    columns = (
        "entry_id",
        "headword",
        "normalized_key",
        "candidate_status",
        "overlaps_active_target",
        "candidate_parts_of_speech",
        "candidate_cefr_levels",
        "candidate_source_count",
        "candidate_sources",
        "enrichment_source_count",
        "enrichment_sources",
        "review_status",
    )
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=columns,
            delimiter="\t",
            lineterminator="\n",
        )
        writer.writeheader()
        for entry in entries:
            if not (
                entry["candidate_source_count"]
                or entry["enrichment_source_count"]
            ):
                continue
            if entry["status"] == "active":
                candidate_status = "support_for_active_target"
            elif entry["status"] == "excluded_proper_noun":
                candidate_status = "excluded_proper_noun"
            elif entry["candidate_source_count"]:
                candidate_status = "target_candidate"
            else:
                candidate_status = "support_only"
            writer.writerow(
                {
                    "entry_id": entry["id"],
                    "headword": entry["headword"],
                    "normalized_key": entry["normalized_key"],
                    "candidate_status": candidate_status,
                    "overlaps_active_target": (
                        "yes" if entry["status"] == "active" else "no"
                    ),
                    "candidate_parts_of_speech": "|".join(
                        entry["candidate_parts_of_speech"]
                    ),
                    "candidate_cefr_levels": "|".join(
                        entry["candidate_cefr_levels"]
                    ),
                    "candidate_source_count": entry[
                        "candidate_source_count"
                    ],
                    "candidate_sources": "|".join(
                        entry["candidate_sources"]
                    ),
                    "enrichment_source_count": entry[
                        "enrichment_source_count"
                    ],
                    "enrichment_sources": "|".join(
                        entry["enrichment_sources"]
                    ),
                    "review_status": (
                        "not_a_target_nomination"
                        if candidate_status == "support_only"
                        else (
                            "excluded_from_target_promotion"
                            if candidate_status == "excluded_proper_noun"
                            else "needs_teacher_approval"
                        )
                    ),
                }
            )


def write_supplementary_evidence_tsv(
    path: Path,
    entries: list[dict],
) -> None:
    columns = (
        "entry_id",
        "headword",
        *SUPPLEMENTARY_SOURCE_FIELDS,
    )
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=columns,
            delimiter="\t",
            lineterminator="\n",
        )
        writer.writeheader()
        for entry in entries:
            for row in entry["supplementary_source_rows"]:
                writer.writerow(
                    {
                        "entry_id": entry["id"],
                        "headword": entry["headword"],
                        **row,
                    }
                )


def write_master_tsv(path: Path, entries: list[dict]) -> None:
    columns = (
        "id",
        "headword",
        "status",
        "parts_of_speech",
        "cefr_levels",
        "primary_skill",
        "primary_reason",
        "skill_labels",
        "skill_confidence",
        "source_count",
        "sources",
        "topics",
        "image_mode",
        "image_priority",
        "homograph_candidate",
    )
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, delimiter="\t")
        writer.writeheader()
        for entry in entries:
            if entry["status"] != "active":
                continue
            writer.writerow(
                {
                    "id": entry["id"],
                    "headword": entry["headword"],
                    "status": entry["status"],
                    "parts_of_speech": "|".join(entry["parts_of_speech"]),
                    "cefr_levels": "|".join(entry["cefr_levels"]),
                    "primary_skill": entry["skill_profile"]["primary"],
                    "primary_reason": entry["skill_profile"]["primary_reason"],
                    "skill_labels": "|".join(entry["skill_profile"]["labels"]),
                    "skill_confidence": entry["skill_profile"]["confidence"],
                    "source_count": entry["source_count"],
                    "sources": "|".join(entry["sources"]),
                    "topics": "|".join(entry["topics"]),
                    "image_mode": entry["image_plan"]["mode"],
                    "image_priority": entry["image_plan"]["priority"],
                    "homograph_candidate": str(
                        entry["relation_flags"]["homograph_candidate"]
                    ).lower(),
                }
            )


def write_image_queue(path: Path, entries: list[dict]) -> None:
    columns = (
        "id",
        "headword",
        "parts_of_speech",
        "cefr_levels",
        "primary_skill",
        "mode",
        "priority",
        "prompt_status",
        "teacher_approved_sense",
        "image_status",
        "proper_noun_sense_removed",
    )
    candidates = [
        entry
        for entry in entries
        if entry["status"] == "active" and entry["image_plan"]["eligible"]
    ]
    priority_order = {"high": 0, "medium": 1, "low": 2}
    candidates.sort(
        key=lambda entry: (
            priority_order.get(entry["image_plan"]["priority"], 9),
            -entry["source_count"],
            entry["headword"].casefold(),
        )
    )
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, delimiter="\t")
        writer.writeheader()
        for entry in candidates:
            writer.writerow(
                {
                    "id": entry["id"],
                    "headword": entry["headword"],
                    "parts_of_speech": "|".join(entry["parts_of_speech"]),
                    "cefr_levels": "|".join(entry["cefr_levels"]),
                    "primary_skill": entry["skill_profile"]["primary"],
                    "mode": entry["image_plan"]["mode"],
                    "priority": entry["image_plan"]["priority"],
                    "prompt_status": entry["image_plan"]["prompt_status"],
                    "teacher_approved_sense": "",
                    "image_status": "pending",
                    "proper_noun_sense_removed": (
                        "yes"
                        if entry["review_flags"]["proper_noun_sense_removed"]
                        else "no"
                    ),
                }
            )


def game_candidate_flags(entry: dict) -> dict[str, bool]:
    pos = set(entry["parts_of_speech"])
    single_word = not entry["is_phrase"] and bool(
        re.fullmatch(r"[A-Za-z][A-Za-z'-]*", entry["headword"])
    )
    return {
        "image_guess": bool(entry["image_plan"]["eligible"]),
        "synonym_antonym": bool(pos & CONTENT_POS),
        "homophone": single_word,
        "homograph": bool(entry["relation_flags"]["homograph_candidate"]),
        "analogy": bool(pos & CONTENT_POS),
        "category_taxonomy": "noun" in pos,
        "collocation": bool(
            pos
            & {
                "verb",
                "adjective",
                "adverb",
                "phrasal verb",
                "verb phrase",
                "phrase",
            }
        ),
    }


def write_game_editorial_queue(path: Path, entries: list[dict]) -> None:
    game_types = (
        "image_guess",
        "synonym_antonym",
        "homophone",
        "homograph",
        "analogy",
        "category_taxonomy",
        "collocation",
    )
    columns = (
        "entry_id",
        "headword",
        "parts_of_speech",
        "cefr_levels",
        "primary_skill",
        *game_types,
        "editorial_status",
        "approved_sense",
        "related_headwords",
        "teacher_notes",
    )
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, delimiter="\t")
        writer.writeheader()
        for entry in entries:
            if entry["status"] != "active":
                continue
            flags = game_candidate_flags(entry)
            if not any(flags.values()):
                continue
            writer.writerow(
                {
                    "entry_id": entry["id"],
                    "headword": entry["headword"],
                    "parts_of_speech": "|".join(entry["parts_of_speech"]),
                    "cefr_levels": "|".join(entry["cefr_levels"]),
                    "primary_skill": entry["skill_profile"]["primary"],
                    **{
                        game_type: (
                            GAME_CANDIDATE_STATUS[game_type]
                            if flags[game_type]
                            else "not_flagged"
                        )
                        for game_type in game_types
                    },
                    "editorial_status": "needs_teacher_review",
                    "approved_sense": "",
                    "related_headwords": "",
                    "teacher_notes": "",
                }
            )


def write_public_evidence_tsv(path: Path, entries: list[dict]) -> None:
    columns = (
        "entry_id",
        "headword",
        *PUBLIC_SOURCE_FIELDS,
    )
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, delimiter="\t")
        writer.writeheader()
        for entry in entries:
            if entry["status"] != "active":
                continue
            for row in entry["source_rows"]:
                writer.writerow(
                    {
                        "entry_id": entry["id"],
                        "headword": entry["headword"],
                        **row,
                    }
                )


def write_public_catalog(path: Path, payload: dict) -> None:
    target_sources = [
        source
        for source in payload["sources"]
        if source["corpus_policies"] == ["target"]
    ]
    public_statistics = dict(payload["statistics"])
    if "target_source_rows" in public_statistics:
        public_statistics["source_rows"] = public_statistics[
            "target_source_rows"
        ]
    for private_statistic in (
        "target_source_rows",
        "candidate_source_rows",
        "enrichment_source_rows",
        "methods_only_rows",
        "candidate_only_entries",
        "support_only_entries",
    ):
        public_statistics.pop(private_statistic, None)
    public_statistics["input_tsv_files"] = len(
        {
            source_file
            for source in target_sources
            for source_file in source["source_files"]
        }
    )
    if {
        "active_entries",
        "excluded_proper_nouns",
    }.issubset(public_statistics):
        public_statistics["deduplicated_entries"] = (
            public_statistics["active_entries"]
            + public_statistics["excluded_proper_nouns"]
        )
    catalog = {
        "schema_version": payload["schema_version"],
        "generated_at": payload["generated_at"],
        "statistics": public_statistics,
        "sources": [
            {
                "id": source["id"],
                "name": source["name"],
                "extracted_rows": source["extracted_rows"],
                "pdf_files": source["pdf_files"],
            }
            for source in target_sources
        ],
        "entries": [
            {
                "id": entry["id"],
                "headword": entry["headword"],
                "status": entry["status"],
                "is_phrase": entry["is_phrase"],
                "pos": entry["parts_of_speech"],
                "cefr": entry["cefr_levels"],
                "primary_skill": entry["skill_profile"]["primary"],
                "skill_labels": entry["skill_profile"]["labels"],
                "skill_confidence": entry["skill_profile"]["confidence"],
                "source_count": entry["source_count"],
                "source_ids": [stable_slug(source) for source in entry["sources"]],
                "topics": entry["topics"],
                "image_mode": entry["image_plan"]["mode"],
                "image_priority": entry["image_plan"]["priority"],
                "image_prompt_status": entry["image_plan"]["prompt_status"],
                "proper_noun_sense_removed": entry["review_flags"][
                    "proper_noun_sense_removed"
                ],
            }
            for entry in payload["entries"]
            if entry["status"] == "active"
        ],
    }
    path.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def write_report(path: Path, payload: dict) -> None:
    stats = payload["statistics"]
    lines = [
        "# IELTS corpus build report",
        "",
        f"- Generated: {payload['generated_at']}",
        f"- Input TSV files: {stats['input_tsv_files']}",
        f"- Extracted source rows: {stats['source_rows']}",
        f"- Target-reference rows: {stats['target_source_rows']}",
        f"- Candidate-only rows: {stats['candidate_source_rows']}",
        f"- Enrichment-only rows: {stats['enrichment_source_rows']}",
        f"- Methods-only rows ignored by the lexical merge: {stats['methods_only_rows']}",
        f"- Deduplicated entries before proper-noun exclusion: {stats['deduplicated_entries']}",
        f"- Active lexical entries: {stats['active_entries']}",
        f"- Supplementary target candidates awaiting approval: {stats['candidate_only_entries']}",
        f"- Supplementary support-only entries: {stats['support_only_entries']}",
        f"- Proper-noun-only entries excluded from public learning data: {stats['excluded_proper_nouns']}",
        f"- Proper-noun source senses excluded: {stats['excluded_proper_noun_source_senses']}",
        f"- Active lexemes retaining a non-proper sense after removal: {stats['mixed_entries_with_proper_noun_sense_removed']}",
        f"- Image-eligible entries: {stats['image_eligible_entries']}",
        "",
        "## Primary four-skill index",
        "",
    ]
    for skill in SKILLS:
        lines.append(f"- {skill}: {stats['primary_skill_counts'].get(skill, 0)}")
    lines.extend(
        [
            "",
            "## Coverage and review queues",
            "",
            f"- Entries without a confirmed part of speech: {stats['unspecified_pos_entries']}",
            f"- Skill profiles requiring teacher review: {stats['skill_confidence_counts'].get('review', 0)}",
            f"- Source corrections retained for audit: {stats['source_correction_entries']}",
            "",
            "### Content-word coverage",
            "",
            f"- noun: {stats['part_of_speech_counts'].get('noun', 0)}",
            f"- verb: {stats['part_of_speech_counts'].get('verb', 0)}",
            f"- adjective: {stats['part_of_speech_counts'].get('adjective', 0)}",
            f"- adverb: {stats['part_of_speech_counts'].get('adverb', 0)}",
            "",
            "### Game editorial candidates",
            "",
            f"- image guessing: {stats['game_candidate_counts'].get('image_guess', 0)}",
            f"- synonym/antonym: {stats['game_candidate_counts'].get('synonym_antonym', 0)}",
            f"- homophone: {stats['game_candidate_counts'].get('homophone', 0)}",
            f"- homograph: {stats['game_candidate_counts'].get('homograph', 0)}",
            f"- analogy: {stats['game_candidate_counts'].get('analogy', 0)}",
            f"- category/taxonomy: {stats['game_candidate_counts'].get('category_taxonomy', 0)}",
            f"- collocation: {stats['game_candidate_counts'].get('collocation', 0)}",
            "",
            "## Method notes",
            "",
            "- Entries are deduplicated by Unicode-normalized lowercase lexical form.",
            "- Only rows with `corpus_policy=target` can create or change an active IELTS learning entry.",
            "- New TSVs fail closed when policy fields are missing; legacy target defaults apply only to explicitly named inputs.",
            "- Every supplementary row is linked to an inventoried source hash by `registry_source_id`, with role, policy and format checked before merging.",
            "- Candidate-only and enrichment-only rows are written to separate review outputs and never alter target CEFR, part of speech or four-skill labels.",
            "- Parenthetical source sense labels and short glosses are removed from the public lexical form.",
            "- Different parts of speech and source attestations remain attached as senses/evidence; they are not discarded.",
            "- Audited days, months, continents, countries and languages are removed as proper-noun source senses before public queues are built.",
            "- Listening, speaking, reading and writing are multi-label scores. `primary` is only a navigation index.",
            "- Skill labels are rule-derived from source, CEFR, phrase status and part of speech; `review` confidence items need teacher review.",
            "- Source definitions, example sentences and IPA notes are counted or retained locally but omitted from public outputs.",
            "- Every image candidate requires a teacher-approved sense before image generation.",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--generated-at", default="")
    parser.add_argument(
        "--legacy-target-input",
        action="append",
        default=[],
        type=Path,
        help=(
            "Explicitly trust one legacy target TSV or directory whose rows "
            "predate source_role/corpus_policy columns. Repeat as needed."
        ),
    )
    parser.add_argument(
        "--supplementary-registry",
        type=Path,
        default=DEFAULT_SUPPLEMENTARY_REGISTRY,
        help=(
            "Registry used to verify every non-target row's source id, role, "
            "policy and format."
        ),
    )
    parser.add_argument(
        "--public-catalog",
        type=Path,
        help="Optional separate destination for the minified public catalog.",
    )
    parser.add_argument(
        "--omit-local-json",
        action="store_true",
        help="Do not write the large local master-vocabulary.json artifact.",
    )
    args = parser.parse_args()

    tsv_paths = find_tsvs(args.inputs)
    if not tsv_paths:
        raise SystemExit("No TSV files found.")
    legacy_target_paths = {
        path.resolve()
        for path in find_tsvs(args.legacy_target_input)
    }
    input_paths = {path.resolve() for path in tsv_paths}
    unbound_legacy_paths = legacy_target_paths - input_paths
    if unbound_legacy_paths:
        preview = ", ".join(
            path.name for path in sorted(unbound_legacy_paths)
        )
        raise SystemExit(
            "--legacy-target-input must also be present in positional inputs: "
            + preview
        )
    rows = [
        row
        for path in tsv_paths
        for row in read_tsv(
            path,
            allow_legacy_target=path.resolve() in legacy_target_paths,
        )
    ]
    supplementary_rows = [
        row for row in rows if row.corpus_policy != "target"
    ]
    if supplementary_rows:
        try:
            supplementary_registry = load_supplementary_registry(
                args.supplementary_registry
            )
            validate_supplementary_registry_links(
                supplementary_rows,
                supplementary_registry,
            )
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise SystemExit(
                f"Supplementary registry gate failed: {error}"
            ) from error
    quality_issues = validate_source_rows(rows)
    if quality_issues:
        preview = "\n".join(f"- {issue}" for issue in quality_issues[:20])
        remainder = len(quality_issues) - min(len(quality_issues), 20)
        suffix = f"\n- ... and {remainder} more" if remainder else ""
        raise SystemExit(
            "Source quality gate failed. Fix the extracted TSV rows before "
            f"building:\n{preview}{suffix}"
        )
    groups: dict[str, EntryGroup] = {}
    for row in rows:
        if row.corpus_policy == "methods_only":
            continue
        key = normalise_key(row.headword)
        if not key:
            continue
        groups.setdefault(key, EntryGroup(key=key)).rows.append(row)
    entries = [build_entry(group) for _, group in sorted(groups.items())]
    generated_at = (
        args.generated_at
        or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    )
    primary_counts = Counter(
        entry["skill_profile"]["primary"]
        for entry in entries
        if entry["status"] == "active"
    )
    active_entries = [entry for entry in entries if entry["status"] == "active"]
    part_of_speech_counts = Counter(
        pos for entry in active_entries for pos in entry["parts_of_speech"]
    )
    cefr_counts = Counter(
        level for entry in active_entries for level in entry["cefr_levels"]
    )
    skill_label_counts = Counter(
        skill for entry in active_entries for skill in entry["skill_profile"]["labels"]
    )
    skill_confidence_counts = Counter(
        entry["skill_profile"]["confidence"] for entry in active_entries
    )
    game_candidate_counts = Counter()
    for entry in active_entries:
        for game_type, enabled in game_candidate_flags(entry).items():
            if enabled:
                game_candidate_counts[game_type] += 1
    payload = {
        "schema_version": 3,
        "generated_at": generated_at,
        "classification_method": "evidence-rules-v2",
        "statistics": {
            "input_tsv_files": len(tsv_paths),
            "source_rows": len(rows),
            "target_source_rows": sum(
                row.corpus_policy == "target" for row in rows
            ),
            "candidate_source_rows": sum(
                row.corpus_policy == "candidate_only" for row in rows
            ),
            "enrichment_source_rows": sum(
                row.corpus_policy == "enrich_only" for row in rows
            ),
            "methods_only_rows": sum(
                row.corpus_policy == "methods_only" for row in rows
            ),
            "deduplicated_entries": len(entries),
            "active_entries": sum(entry["status"] == "active" for entry in entries),
            "candidate_only_entries": sum(
                entry["status"] == "candidate_only" for entry in entries
            ),
            "support_only_entries": sum(
                entry["status"] == "support_only" for entry in entries
            ),
            "excluded_proper_nouns": sum(
                entry["status"] == "excluded_proper_noun" for entry in entries
            ),
            "excluded_proper_noun_source_senses": sum(
                entry["review_flags"]["proper_noun_source_rows_removed"]
                for entry in entries
            ),
            "mixed_entries_with_proper_noun_sense_removed": sum(
                entry["status"] == "active"
                and entry["review_flags"]["proper_noun_sense_removed"]
                for entry in entries
            ),
            "proper_noun_review_candidates": 0,
            "image_eligible_entries": sum(
                entry["status"] == "active" and entry["image_plan"]["eligible"]
                for entry in entries
            ),
            "primary_skill_counts": dict(primary_counts),
            "skill_label_counts": dict(skill_label_counts),
            "skill_confidence_counts": dict(skill_confidence_counts),
            "part_of_speech_counts": dict(part_of_speech_counts),
            "cefr_counts": dict(cefr_counts),
            "unspecified_pos_entries": sum(
                entry["parts_of_speech"] == ["unspecified"]
                for entry in active_entries
            ),
            "source_correction_entries": sum(
                entry["review_flags"]["source_correction_present"]
                for entry in entries
            ),
            "game_candidate_counts": dict(game_candidate_counts),
        },
        "sources": build_source_manifest(rows),
        "entries": entries,
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    if not args.omit_local_json:
        (args.output_dir / "master-vocabulary.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    (args.output_dir / "source-manifest.json").write_text(
        json.dumps(payload["sources"], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    write_master_tsv(args.output_dir / "master-vocabulary.tsv", entries)
    write_public_evidence_tsv(args.output_dir / "source-evidence.tsv", entries)
    write_supplementary_candidate_tsv(
        args.output_dir / "supplementary-candidate-queue.tsv",
        entries,
    )
    write_supplementary_evidence_tsv(
        args.output_dir / "supplementary-source-evidence.tsv",
        entries,
    )
    public_catalog = args.public_catalog or (args.output_dir / "catalog.json")
    public_catalog.parent.mkdir(parents=True, exist_ok=True)
    write_public_catalog(public_catalog, payload)
    write_image_queue(args.output_dir / "image-generation-queue.tsv", entries)
    write_game_editorial_queue(args.output_dir / "game-editorial-queue.tsv", entries)
    write_report(args.output_dir / "build-report.md", payload)
    print(json.dumps(payload["statistics"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
