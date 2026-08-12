#!/usr/bin/env python3
"""Build and validate the 2026-08-12 learner difficulty archive.

The learner's numeric marks describe learning gaps only. This script links an
item to an existing lexical entry when possible, but deliberately does not copy
definitions, parts of speech, CEFR labels or pronunciation data into the
learner archive.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = (
    REPO_ROOT
    / "data"
    / "ielts-corpus"
    / "learner-difficulty"
    / "student-hard-words-2026-08-12.json"
)
DEFAULT_PUBLIC_OUTPUT = (
    REPO_ROOT / "public" / "ielts" / "corpus" / "student-hard-words.json"
)
MASTER_PATH = REPO_ROOT / "data" / "ielts-corpus" / "master-vocabulary.tsv"
CANDIDATE_PATH = (
    REPO_ROOT / "data" / "ielts-corpus" / "supplementary-candidate-queue.tsv"
)

RAW_BATCH = """loss
attain 3
examine2
full3
representative3
eastward
contradict2
anecdote2
demand2
accuse3
cosy3
spray2
statue3
crowd3
confident2
pronunciation2
expect3
starve3
chest
expose2
controversial
fare3
certificate3
squeeze3
celebrate2
anchor3
disturbing3
convey3
handful2
continue2
application3
identification2
accept2
defeat3
astonish3
relay3
owe2
abolish3
evidence3
imagine3
harmony2
abandon2
breakthrough3
confirm3
bachelor3
organize2
decorate2
wage2
facial2
target3
conservative3
jog2
gallon2
congratulation2
edition3
import2
gallery1
seize2
occur3
dash3
shot1
accountany3
bent3
trick2
rate2
catastrophe3
nationality3
symptom3
indeed2
sculptur3
prove3
burst3
origin1
advance2
gym1
agency2
wise3
companion2
bond2
flashlight3
honest2
offshore2
consult3
discrimination3
chemical3
grill2
widespread3
hook2
exhibition3
inspect2
alternative2
discourage3
conflict2
intention3
petrol2
gravity2
flood3
explicit3
fountai
oral3
bound2
pretend3
departure3
draft3
careless1
scold3
perfume3
wheel1
gain3
caution3
referee3
supply2
appropriate3
deserve3
canal3
absolute3
tolerate3
sneeze3
district2
relevant2
profit2
agricultural3
worthy3
adapt2
enterprise2
plain3
brunch2
coincidence3
aspect2
musical1
worn2
signature2
prayer3
damp3
ridiculou
convenience2
transparent2
absorb3
pluse3
clerk3
souvenir3
quarrel2
silent2
furniture1
condemn3
consist2
roast2
cover1
twist2
expectation3
allowance3
cast3
unwilling2
case2
compromise2
patient3
favour2
trap2
punctuation3
unique1
adore2
superior3
precious3
authority3
vain3
presentation3
instead3
ashamed3
fantasy2
ripe2
fetch3
authentic3
drag2
swell2
subscribe3
swift2
choke3
assessment2
arithmetic3
entire2
awesome3
Arctic3
dust2
sword3
beg2
surgeon3
architecture2
systematic3
sensitive2
arbitrary3
splendid2
brand3
assumption3
due2
spiritual3
measure3
punishment2
roll2
procedure3
confidential2
explode3
remote2
tune2
solid1
energetic3
altitude3
spirit3
admit2
discount2
reflect2
concentrate3
conductor2
choice1
research1
technical1
pyramid3
category3
legal3
spin3
curious3
sharpen3
adaptation2
secure3
orbit2
bedding3
annual1
promise2
noble2
compulsory2
iron1
mature2
recover3
cassette3
liberation2
contemporary3
enlarge3
load2
carriage3
swallow3
barber2
lounge2
cure3
accelerate3
interval2
acid3
dormitory2
inspire2
adjust2
hurricane3
comedy2
hydrogen1
liberty3
belly3
casual2
brilliant3
flexible2
rank2
fierce3
fortunate2
addicted3
furnished3
changeable3
deposit3
failure3
bride3
institute3
enquiry3
grain2
helmet2
dustinguish3
wedding3
via3
fingernail2
graph1
instant2alcohol
memorial
crazy
sure
component
accuracy
illegal
biography
satisfaction
memory
suitable
botabical
telescope
accident
portable
change
howl
float
minority
conventional
occupy
enthusiastic
passive
motivation
fry
thorough
normal
sincerely
dull
defend
potential
rid
entry
analyse
fragile
adolescence
extreme
retell
suspect
sacrifice
partly
punctual
valid
tailor
donate
especially
scare
numb
praise
diagram
or
pure
duty
routine
resemble
anniversary
fuel
considerate
purchase
starvation
straightforward
guilty
Antarctic
currency
hall
freeway
available
experiment
steady
apparent
comb
curriculum
assess
troublesome
previous
length
specialist
rigid
allergic
cuisine
privilege
foreign
carve
front
socket
appearance
alley
compensate
audience
cruel
strengthen
afford
official
intelligence
appendix
ruin
stewardess
chaos
style
apron
fill
pardon
stout
political
fasten
journey
merciful
immigration
bend
cycle
mind
fiction
announce
persuade
balcony
decision
circumstance
bakery
challenge
frost
shock
bless
advocate
consequence
incident
attempt
nutrition
betray
offence
constant
committee
fellow
count
strength
bench
record
downstairs
both
agriculture
permanent
security
experience
grocer
recommend
attractive
oilfield
evolution
instruction
behaviour
pedestrian
apologise
reception
excellent
claw
gesture
arrest
slice
stare
majority
cafeteria
bravery
approval
oppose
stainless
visual
concept
fragrant
attitude"""

FOLLOWUP_BATCH = """spite3
purpose1
mature3
maturity3
bullying3
stress-free3
bills1
satisfaction2
compare2
model1
candidates3
experts3
present1
reference3
previous3
eliminate3
familiarity3
hindrance3
distracted2
hesitate3
critically3
get carried away3"""

SOURCE_BATCHES = (
    {
        "batch_id": "student-hard-words-2026-08-12-initial",
        "received_at": "2026-08-12",
        "raw_batch": RAW_BATCH,
    },
    {
        "batch_id": "student-hard-words-2026-08-12-followup-1",
        "received_at": "2026-08-12",
        "raw_batch": FOLLOWUP_BATCH,
    },
)

RESCUE_TRAINING_HEADWORDS = {
    "alcohol",
    "architecture",
    "botanical",
    "certificate",
    "controversial",
    "distinguish",
    "fountain",
    "instant",
    "pronunciation",
    "ridiculous",
    "sculpture",
    "squeeze",
}

# These corrections were confirmed by the user. Each tuple is
# (normalized headword, difficulty code, correction note).
CONFIRMED_CORRECTIONS = {
    "accountany3": [("account", 3, "student-confirmed typo: accountany -> account")],
    "sculptur3": [("sculpture", 3, "student-confirmed typo: sculptur -> sculpture")],
    "fountai": [("fountain", 1, "student-confirmed typo: fountai -> fountain")],
    "ridiculou": [("ridiculous", 1, "student-confirmed typo: ridiculou -> ridiculous")],
    "pluse3": [("pulse", 3, "student-confirmed typo: pluse -> pulse")],
    "dustinguish3": [
        ("distinguish", 3, "student-confirmed typo: dustinguish -> distinguish")
    ],
    "botabical": [("botanical", 1, "student-confirmed typo: botabical -> botanical")],
    "instant2alcohol": [
        ("instant", 2, "student-confirmed joined-token split: instant2 + alcohol"),
        ("alcohol", 1, "student-confirmed joined-token split: instant2 + alcohol"),
    ],
}

EXPECTED_STATISTICS = {
    "raw_nonempty_lines": 464,
    "normalized_reports": 465,
    "unique_headwords": 462,
    "duplicate_report_count": 3,
    "difficulty_counts": {"1": 194, "2": 111, "3": 157},
    "correction_event_count": 8,
    "corrected_output_count": 9,
    "corpus_match_counts": {
        "active": 388,
        "candidate_only": 34,
        "unmatched": 40,
    },
}


def read_index(path: Path, key: str) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def difficulty_code_for(needs_pronunciation: bool, needs_meaning: bool) -> int:
    if needs_pronunciation and needs_meaning:
        return 3
    if needs_meaning:
        return 2
    return 1


def public_id(headword: str) -> str:
    suffix = hashlib.sha256(headword.encode("utf-8")).hexdigest()[:8]
    slug = "-".join(headword.casefold().split())
    return f"hard-word-{slug}-{suffix}"


def build_archive() -> dict:
    master = {
        row["headword"].casefold(): row
        for row in read_index(MASTER_PATH, "headword")
        if row["status"] == "active"
    }
    candidates = {
        row["normalized_key"].casefold(): row
        for row in read_index(CANDIDATE_PATH, "normalized_key")
        if row["candidate_status"] == "target_candidate"
    }
    raw_line_count = 0
    report_count = 0
    corrected_output_count = 0
    reports_by_headword: dict[str, list[dict]] = {}

    for source_batch in SOURCE_BATCHES:
        raw_lines = [
            line.strip()
            for line in source_batch["raw_batch"].splitlines()
            if line.strip()
        ]
        for batch_line_index, raw_token in enumerate(raw_lines, start=1):
            raw_line_count += 1
            compact = "".join(raw_token.split())
            if compact in CONFIRMED_CORRECTIONS:
                outputs = CONFIRMED_CORRECTIONS[compact]
            else:
                raw_code = int(raw_token[-1]) if raw_token[-1] in "123" else 1
                source_headword = (
                    raw_token[:-1].strip() if raw_token[-1] in "123" else raw_token
                )
                outputs = [(source_headword.casefold(), raw_code, None)]

            split_group_id = (
                f"{source_batch['batch_id']}-split-{batch_line_index:03d}"
                if len(outputs) > 1
                else None
            )
            for headword, reported_code, correction_note in outputs:
                report_count += 1
                normalized = headword.casefold()
                corrected_output_count += correction_note is not None
                reports_by_headword.setdefault(normalized, []).append(
                    {
                        "raw_line_index": raw_line_count,
                        "batch_line_index": batch_line_index,
                        "raw_token": raw_token,
                        "reported_difficulty_code": reported_code,
                        "needs_pronunciation": reported_code in (1, 3),
                        "needs_meaning": reported_code in (2, 3),
                        "correction_status": (
                            "confirmed" if correction_note is not None else "not_needed"
                        ),
                        "correction_note": correction_note,
                        "split_group_id": split_group_id,
                        "batch_id": source_batch["batch_id"],
                        "received_at": source_batch["received_at"],
                    }
                )

    items: list[dict] = []
    for normalized, reports in reports_by_headword.items():
        needs_pronunciation = any(report["needs_pronunciation"] for report in reports)
        needs_meaning = any(report["needs_meaning"] for report in reports)
        effective_code = difficulty_code_for(needs_pronunciation, needs_meaning)

        if normalized in master:
            corpus_status = "active"
            lexical_entry_id = master[normalized]["id"]
            teacher_status = "needs_sense_confirmation"
        elif normalized in candidates:
            corpus_status = "candidate_only"
            lexical_entry_id = None
            teacher_status = "needs_lexical_approval"
        else:
            corpus_status = "unmatched"
            lexical_entry_id = None
            teacher_status = "needs_lexical_source"

        proper_status = "not_flagged"
        if normalized in {"arctic", "antarctic"}:
            proper_status = "mixed_or_context_dependent"
            teacher_status = "needs_proper_noun_and_sense_review"

        items.append(
            {
                "item_index": len(items) + 1,
                "normalized_headword": normalized,
                "display_word": normalized,
                "difficulty_code": effective_code,
                "needs_pronunciation": needs_pronunciation,
                "needs_meaning": needs_meaning,
                "report_count": len(reports),
                "reports": reports,
                "corpus_match_status": corpus_status,
                "lexical_entry_id": lexical_entry_id,
                "source_sentence": None,
                "sense_id": None,
                "sense_status": "needs_context_confirmation",
                "proper_noun_status": proper_status,
                "teacher_review_status": teacher_status,
                "practice_status": (
                    "in_rescue_training"
                    if normalized in RESCUE_TRAINING_HEADWORDS
                    else "awaiting_exercise_authoring"
                ),
                "introduced_at": reports[0]["received_at"],
                "last_reported_at": reports[-1]["received_at"],
            }
        )

    difficulty_counts = Counter(item["difficulty_code"] for item in items)
    match_counts = Counter(item["corpus_match_status"] for item in items)
    statistics = {
        "raw_nonempty_lines": raw_line_count,
        "normalized_reports": report_count,
        "unique_headwords": len(items),
        "duplicate_report_count": report_count - len(items),
        "difficulty_counts": {
            str(code): difficulty_counts[code] for code in (1, 2, 3)
        },
        "correction_event_count": len(CONFIRMED_CORRECTIONS),
        "corrected_output_count": corrected_output_count,
        "corpus_match_counts": {
            status: match_counts[status]
            for status in ("active", "candidate_only", "unmatched")
        },
    }
    if statistics != EXPECTED_STATISTICS:
        raise ValueError(
            "learner archive counts changed unexpectedly: "
            + json.dumps(statistics, ensure_ascii=False, sort_keys=True)
        )

    return {
        "schema_version": 2,
        "batch_id": "student-hard-words-2026-08-12",
        "received_at": "2026-08-12",
        "source_type": "learner-reported-vocabulary-review-difficulties",
        "provenance_note": (
            "Teacher-supplied learner report. Difficulty codes describe learner "
            "gaps only and are not evidence for pronunciation, meaning, part of "
            "speech or CEFR."
        ),
        "difficulty_code_legend": {
            "1": "pronunciation unknown; also used when no number was supplied",
            "2": "meaning unknown",
            "3": "pronunciation and meaning both unknown",
        },
        "statistics": statistics,
        "editorial_policy": {
            "lexical_fields_withheld": ["definition", "part_of_speech", "cefr", "ipa"],
            "candidate_only_rule": (
                "Candidate-only matches remain unapproved and contribute no lexical "
                "answer data to this archive."
            ),
            "sense_rule": (
                "No source sentence was supplied; every item needs context "
                "confirmation before a sense-specific answer is authored."
            ),
            "proper_noun_rule": (
                "Arctic and Antarctic remain mixed/context-dependent until their "
                "source contexts confirm adjectival or proper-name use."
            ),
        },
        "items": items,
    }


def build_public_catalog(archive: dict | None = None) -> dict:
    archive = archive or build_archive()
    entries = []
    for item in archive["items"]:
        review_status = item["teacher_review_status"]
        if item["practice_status"] == "in_rescue_training":
            review_status = "source_audited_for_rescue"
        entries.append(
            {
                "id": public_id(item["normalized_headword"]),
                "displayWord": item["display_word"],
                "normalizedHeadword": item["normalized_headword"],
                "difficultyCode": item["difficulty_code"],
                "needsPronunciation": item["needs_pronunciation"],
                "needsMeaning": item["needs_meaning"],
                "abilityTags": [
                    tag
                    for tag, needed in (
                        ("pronunciation", item["needs_pronunciation"]),
                        ("meaning", item["needs_meaning"]),
                    )
                    if needed
                ],
                "reportCount": item["report_count"],
                "corpusMatchStatus": item["corpus_match_status"],
                "reviewStatus": review_status,
                "practiceStatus": item["practice_status"],
            }
        )

    return {
        "schemaVersion": 1,
        "catalogId": "student-hard-words-2026-08-12",
        "generatedAt": "2026-08-12",
        "privacy": {
            "containsLearnerIdentity": False,
            "omittedFields": [
                "learner_name",
                "raw_token",
                "raw_line_index",
                "received_at",
                "batch_id",
                "lexical_definition",
                "part_of_speech",
                "cefr",
                "ipa",
            ],
        },
        "difficultyLegend": archive["difficulty_code_legend"],
        "statistics": archive["statistics"],
        "entries": entries,
    }


def serialized_archive() -> str:
    return json.dumps(build_archive(), ensure_ascii=False, indent=2) + "\n"


def serialized_public_catalog() -> str:
    return json.dumps(
        build_public_catalog(), ensure_ascii=False, separators=(",", ":")
    ) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--public-output", type=Path, default=DEFAULT_PUBLIC_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = serialized_archive()
    public_expected = serialized_public_catalog()
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != expected:
            raise SystemExit(f"learner difficulty archive is stale: {args.output}")
        if (
            not args.public_output.exists()
            or args.public_output.read_text(encoding="utf-8") != public_expected
        ):
            raise SystemExit(
                f"public learner difficulty catalog is stale: {args.public_output}"
            )
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(expected, encoding="utf-8")
    args.public_output.parent.mkdir(parents=True, exist_ok=True)
    args.public_output.write_text(public_expected, encoding="utf-8")


if __name__ == "__main__":
    main()
