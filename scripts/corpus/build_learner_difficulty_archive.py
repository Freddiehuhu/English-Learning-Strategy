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
    "raw_nonempty_lines": 442,
    "normalized_entries": 443,
    "unique_headwords": 443,
    "duplicate_count": 0,
    "difficulty_counts": {"1": 192, "2": 110, "3": 141},
    "correction_event_count": 8,
    "corrected_output_count": 9,
    "corpus_match_counts": {
        "active": 378,
        "candidate_only": 31,
        "unmatched": 34,
    },
}


def read_index(path: Path, key: str) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


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
    raw_lines = [line.strip() for line in RAW_BATCH.splitlines() if line.strip()]
    items: list[dict] = []

    for raw_line_index, raw_token in enumerate(raw_lines, start=1):
        compact = "".join(raw_token.split())
        if compact in CONFIRMED_CORRECTIONS:
            outputs = CONFIRMED_CORRECTIONS[compact]
        else:
            difficulty_code = int(raw_token[-1]) if raw_token[-1] in "123" else 1
            source_headword = raw_token[:-1].strip() if raw_token[-1] in "123" else raw_token
            outputs = [(source_headword.casefold(), difficulty_code, None)]

        split_group_id = f"split-{raw_line_index:03d}" if len(outputs) > 1 else None
        for headword, difficulty_code, correction_note in outputs:
            normalized = headword.casefold()
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
                    "raw_line_index": raw_line_index,
                    "raw_token": raw_token,
                    "normalized_headword": normalized,
                    "difficulty_code": difficulty_code,
                    "needs_pronunciation": difficulty_code in (1, 3),
                    "needs_meaning": difficulty_code in (2, 3),
                    "correction_status": (
                        "confirmed" if correction_note is not None else "not_needed"
                    ),
                    "correction_note": correction_note,
                    "split_group_id": split_group_id,
                    "corpus_match_status": corpus_status,
                    "lexical_entry_id": lexical_entry_id,
                    "source_sentence": None,
                    "sense_id": None,
                    "sense_status": "needs_context_confirmation",
                    "proper_noun_status": proper_status,
                    "teacher_review_status": teacher_status,
                    "introduced_at": "2026-08-12",
                }
            )

    difficulty_counts = Counter(item["difficulty_code"] for item in items)
    match_counts = Counter(item["corpus_match_status"] for item in items)
    statistics = {
        "raw_nonempty_lines": len(raw_lines),
        "normalized_entries": len(items),
        "unique_headwords": len({item["normalized_headword"] for item in items}),
        "duplicate_count": len(items)
        - len({item["normalized_headword"] for item in items}),
        "difficulty_counts": {
            str(code): difficulty_counts[code] for code in (1, 2, 3)
        },
        "correction_event_count": len(CONFIRMED_CORRECTIONS),
        "corrected_output_count": sum(
            item["correction_status"] == "confirmed" for item in items
        ),
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
        "schema_version": 1,
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


def serialized_archive() -> str:
    return json.dumps(build_archive(), ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = serialized_archive()
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != expected:
            raise SystemExit(f"learner difficulty archive is stale: {args.output}")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(expected, encoding="utf-8")


if __name__ == "__main__":
    main()
