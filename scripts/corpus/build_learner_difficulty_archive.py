#!/usr/bin/env python3
"""Build and validate the learner difficulty archive through 2026-08-13.

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

FOLLOWUP_BATCH_2 = """blanket3
forget1
broadcast3
temple3
commercial3
zoom2
regret3
particular3
fresh2
random2
moral3
forehead2
organ3
scare
tentative3
leather3
generation2
permission3
uncertain2
vest2
civilization3
cheque
bathe1
convenient3
glory3
wipe2
bonus2
weed2
agenda2
institution2
sceptical3
classic1
violence3
diploma2
format2
allocate2
practical3
vehicle1
polite2
chapter2
regardless3
diverse3
refuse2
whistle3
competence3
accumulate3
resign2
consistent3
greet2
fortune3
guarantee3
cater3
brief3
pension3
rescue2
scream2
merely3
bounce2
optional2
advertise3
blind1
status3
theoretical3
greedy2
prevent2
unconscious3
civil3
calm2
hate2
acquaintance3
patent3
unconditional3
recipe2
though1
dynasty3
idiom3
resist2
strict2
receipt3
conversation3
brochure3
divorce3
consritution3
friction3
absurd3
latter3
whisper3
preview3
accustomed2
centigrade3
editor2
leak2
session3
disgusting2
injury3
adventure3
pride3
fluency3
drill3
adopt2
dip2
appreciate2
minus3
acquisition3
outing3
sell1
vacant2
mineral2
gymnastics2
religion2
wrestle3
frontier3
vital2
consume2
seminar3
parcel3
material1
volcano1
dynamic3
ambulance3
interpreter3
harbour3
temporary2
plot3
endless3
bridgeroom3
outspoken2
voluntary2
deny3
seaweed2
entrance1
pavement3
register3
booth2
reliable3
adequate3
tension3
unfit2
fundamental2
sick3
wrinkle3
theory3
foresee3
dive3
summary2
correct2
shelter2
justice2
fault3
reform2
continent2
pity2
adjustment2
credit3
shame2
graduate2
earn2
pile2
heap2
religious3
grasp3
violate3
desire3
shabby3
regulation3
personnel3
thriller3
poison3
struggle3
drawback2
ancestor3
vote3
straight1
contradictory3
competition2
bargain3
acknowledge3
fortnight3
defence3
influence2
flesh2
recreation2
burglar1
require2
physician3
dirt3
buffet3
aboard1
deliver2
bark3
contrary3
choir3
wrist2
breast2
shaver2
generous2
criminal3
restriction2
distant2
applaud2
immediately2
garage3
politician3
sideways2
rely3
tiresome2
polish3
aggressive3
middle1
brewery3
attack3
tissue3
clumsy2
withdraw3
campaign2
applicant3
funeral3
crash2
delay3
admirable3
least2
marry2
possess3
instruct2
educate3
comment2
statistics3
muddy2
rewind3
shuttle1
comprehension3
porter3
premier2
architect3
reserve3
track2
pregnant3
glad3
communism3
terrible3
term3
sorrow3
devote2
passage2
sniff2
accurate1
reputation2
guard3
urge3
erupt1
capsule3
pause3
universal2
bury3
tendency3
hesitate3
alcoholic1
crew2
sweat2
candidate2
burden3
devotion3
royal3
astronomer3
mercy3
ambassador3
profession2
insurance2
conscience3
ancient1
spit3
ambassadress2
chain store3
explore2
database2
consensus3
false1
anxious2
split3
brake2
stain2
urgent3
ambiguous2
outwards2
steward3
foster3
vacation2
tear2
horrible2
ample3
panic3"""

FOLLOWUP_BATCH_3 = """opposite2
slim2
forecast1
shrink3
tight2
sponsor3
diamond3
revolution2
twice1
relate2
channel3
found2
slide3
crime3
agent3
salary3
commit3
laughter1
mourn3
heat2
greeting3
bitter3
jewellery3
appetite3
painful1
cottage3
mail1
remove2
classify2
borrow2
revision3
pole2
willing3
hide2
framework3
absent2
marathon3
abnormal1
Pacific3
qualification3
depth3
blow2
obtain2
edge1
navy3
collar3
dawn3
bunch3
bacterium3
chorus3
abortion3
awkward3
invite2
acute2
fade2
respond2
anyhow2
downtown2
sense2
yawn3
wag3
guess2
caption2
sour1
voyage3
tasteless3
absence2
deed2
paddle2
unable1
outgoing2
vague3
wander2
badminton2
tablet3
sort3
racial2
saucer3
independent2
content2
permit3
desperate3
court2
possession3
sacred3
risk2
harvest3
mental3
obvious3
relief2
figure2
nationwide1
radioactive1
clear1
luggage3
govern3
maid2
abundant3
forgive2
corporation2
abuse2
embassy3
feast3
glare3
valley2
select1
basement3
laundry2
identity2
hammer3
negotiate3
independence2
embarrass2
occupation3
bite2
mass2
festival1
expect2
analysis3
evident2
destination3
deaf2
kindergarten3
dial3
repeat3
plenty2
bare2
lantern3
ballet1
request2
cause1
destroy3
forward3
distinction2
expand2
custom2
finance2
barrier3
digest3
barbershop3
rare3
gentle1
carrier3
initial3
deliberately3
prejudice3
pattern2
geometry3
league3
federal3
ceremony3
herb3
academy3
civilian3
prepare1
headmistress3
process2
insure2
achievement2
host1
awful3
contribute3
excite3
recognise3
loaf3
clay3
beneath3
murder3
clinic3
acquire2
error1
dimension3
bid3
version2
flash2
parallel3
altogether2
literary1
treasure3
represent3
queue3
recite3
disturb3
razor3
yell2
suppose3
warehouse2
lack2
race3
adolescent3
habit3
significance3
attention3
salute3
tease2
being2
steep2
ambition3
glance3
pray3
arrange3
tournament3
frighten3
insist3
visa3
terrify3
scene3
modest3
severe3
conduct3
schedule3
progress2
proper2
dictation3
phenomenon3
participate3
file2
consultant3
wound3
thirst3
apology3
receptionist3
frequent3
cautious3
brick3
microscope3
distribute3
grocery3
preparation2
artificial2
intend3
regard3
trial3
attach3
pale2
rot3
sow3
sob2
rhyme3
otherwise3
trolleybus3
construction3
preserve3
soul1
anxiety3
evaluate2
cheerful2
indicate2
support3
impossible1
dignity3
escape3
criterion3
message3
bureaucratic3
prescription3
rough3
violent3
sudden2
autonomous3
ignore2
admission2
fancy2
aid3
stubborn3
substitute3
submit3
pleased2
suck2
department2
pain2
suffering2
symphony2
suite2
rather2
harmful3
swap3
worthwhile2
sunburnt3
astronomy2
suspension2
responsibility2
quantity3
supreme2
expression2
approach2
perform2
surplus2
pump2
republic2
arch3
multiply3
tough3
colleague3
collision2
precise2
victim3
postpone3
blame2
private2
weigh1
ripen3
refer3
drawer3
sneaker2
engine1
tremble3
behalf3
narrow2
semicircle3
modem2
exit1
album2
forbid2"""

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
    {
        "batch_id": "student-hard-words-2026-08-12-followup-2",
        "received_at": "2026-08-12",
        "raw_batch": FOLLOWUP_BATCH_2,
    },
    {
        "batch_id": "student-hard-words-2026-08-13-followup-3",
        "received_at": "2026-08-13",
        "raw_batch": FOLLOWUP_BATCH_3,
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
    "consritution3": [
        ("constitution", 3, "user-confirmed typo: consritution -> constitution")
    ],
    "bridgeroom3": [
        ("bridegroom", 3, "user-confirmed typo: bridgeroom -> bridegroom")
    ],
}

EXPECTED_STATISTICS = {
    "raw_nonempty_lines": 1069,
    "normalized_reports": 1070,
    "unique_headwords": 1064,
    "duplicate_report_count": 6,
    "difficulty_counts": {"1": 241, "2": 336, "3": 487},
    "correction_event_count": 10,
    "corrected_output_count": 11,
    "corpus_match_counts": {
        "active": 889,
        "candidate_only": 75,
        "unmatched": 100,
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
                        "correction_source": (
                            "user_confirmation_2026-08-12"
                            if correction_note is not None
                            else None
                        ),
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
        if normalized in {"arctic", "antarctic", "pacific"}:
            proper_status = "mixed_or_context_dependent"
            teacher_status = "needs_proper_noun_and_sense_review"

        display_word = "Pacific" if normalized == "pacific" else normalized

        items.append(
            {
                "item_index": len(items) + 1,
                "normalized_headword": normalized,
                "display_word": display_word,
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
        "schema_version": 3,
        "archive_id": "student-hard-words-through-2026-08-13",
        "first_received_at": "2026-08-12",
        "last_received_at": "2026-08-13",
        "source_batch_count": len(SOURCE_BATCHES),
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
                "Arctic, Antarctic and Pacific remain mixed/context-dependent until "
                "their source contexts confirm adjectival, common-word or "
                "proper-name use. Pacific retains the teacher-supplied display case."
            ),
            "homograph_rule": (
                "A reported spelling may cover multiple senses, parts of speech, "
                "stress patterns or pronunciations. Without source context it is "
                "retained as one spelling-level learner report and remains pending "
                "sense confirmation rather than receiving an inferred answer."
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
        "generatedAt": "2026-08-13",
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
