#!/usr/bin/env python3
"""Extract review-only lexical candidates from five Scholastic workbooks.

These sources do not contain a consolidated alphabetical index.  The extractor
therefore uses a deliberately narrow, source-specific whitelist of explicit
word banks, labelled vocabulary lists and lesson target tables.  It never
exports definitions, example sentences, exercise prose, answer sentences or
page images.

Every input is identified by both byte size and SHA-256.  The fixed page count,
page number and on-page term checks make the extractor fail closed when a
different edition or unexpectedly parsed file is supplied.  All exported rows
remain ``candidate_only`` and require editorial review before any possible
promotion to the active IELTS corpus.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any


OUTPUT_COLUMNS = (
    "source",
    "registry_source_id",
    "raw_term",
    "headword",
    "pos",
    "cefr",
    "topic_or_section",
    "pdf_page",
    "source_ref",
    "definition",
    "notes",
    "source_role",
    "corpus_policy",
    "source_format",
    "locator",
)

SOURCE_ROLE = "lexical_candidate"
CORPUS_POLICY = "candidate_only"
SOURCE_FORMAT = "pdf"
SUPPORTED_SOURCE_IDS = {
    f"scholastic-success-vocabulary-grade-{grade}" for grade in range(1, 6)
}


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


def terms(value: str) -> tuple[str, ...]:
    """Return a compact, ordered lexical list from a pipe-separated literal."""

    result = tuple(clean_text(item) for item in value.split("|") if clean_text(item))
    if len(result) != len({item.casefold() for item in result}):
        raise ValueError("A page plan contains duplicate terms")
    return result


@dataclass(frozen=True)
class PagePlan:
    page: int
    topic: str
    section: str
    targets: tuple[str, ...]
    pos: str = ""


@dataclass(frozen=True)
class SourceProfile:
    registry_source_id: str
    sha256: str
    byte_size: int
    page_count: int
    plans: tuple[PagePlan, ...]
    visual_sample_pages: tuple[int, ...]


@dataclass(frozen=True)
class RegistrySource:
    id: str
    display_name: str
    expected_sha256: str
    expected_byte_size: int
    source_role: str
    corpus_policy: str
    source_format: str


PROFILES = (
    SourceProfile(
        registry_source_id="scholastic-success-vocabulary-grade-1",
        sha256="a91461d7adcb3e39462c643359e2d4e87d45c6570b53b52f85c96f420853cdce",
        byte_size=2_568_376,
        page_count=87,
        plans=(
            PagePlan(2, "Days of the week", "explicit_color_key", terms(
                "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday"
            )),
            PagePlan(4, "Months of the year", "explicit_month_chart", terms(
                "January|February|March|April|May|June|July|August|"
                "September|October|November|December"
            )),
            PagePlan(16, "Geometric shapes", "explicit_shape_list", terms(
                "diamond|square|octagon|triangle|rectangle|circle"
            ), "noun"),
            PagePlan(22, "Metric measurement", "explicit_unit_list", terms(
                "meter|centimeter|kilometer|decimeter"
            ), "noun"),
            PagePlan(24, "Seasons", "explicit_diagram_labels", terms(
                "spring|summer|fall|winter"
            ), "noun"),
            PagePlan(30, "Animals", "explicit_crossword_bank", terms(
                "penguin|dolphin|alligator|lion|octopus|bear|pig"
            ), "noun"),
            PagePlan(32, "Insects", "explicit_word_box", terms(
                "leg|antenna|wing|head|abdomen|thorax"
            ), "noun"),
            PagePlan(40, "Community helpers", "explicit_word_bank", terms(
                "bus driver|doctor|dentist|librarian|firefighter|teacher"
            ), "noun"),
            PagePlan(42, "Transportation", "explicit_picture_labels", terms(
                "canoe|airplane|train|sailboat|helicopter|van|truck|car|bus|bike|ship"
            ), "noun"),
            PagePlan(46, "Directional words", "explicit_map_key", terms(
                "north|south|east|west"
            )),
            PagePlan(48, "Economics", "explicit_word_bank", terms(
                "quarter|penny|nickel|dime|dollar"
            ), "noun"),
            PagePlan(52, "Character traits", "explicit_word_box", terms(
                "polite|cooperative|helpful|honest|responsible|kind"
            ), "adjective"),
            PagePlan(54, "Short-a words", "explicit_word_bank", terms(
                "bat|bag|black|cab|calf|cat|glad|hat|lad|snack"
            )),
            PagePlan(68, "Nouns", "explicit_sorting_targets", terms(
                "boy|school|banana|restaurant|envelope|teacher|doctor|library|"
                "car|desk|lady|store|box|nurse|post office|toy|"
                "hospital|shirt|clerk|vet|theater|book"
            ), "noun"),
            PagePlan(82, "Analogies", "explicit_word_bank", terms(
                "bake|yellow|hard|arm|driver"
            )),
        ),
        visual_sample_pages=(2, 32, 52, 82),
    ),
    SourceProfile(
        registry_source_id="scholastic-success-vocabulary-grade-2",
        sha256="3e782cc3d544d84df2a9c4c35786072052074ce5ea9fd241417856eba9377eb4",
        byte_size=2_389_764,
        page_count=87,
        plans=(
            PagePlan(2, "Days of the week", "explicit_balloon_labels", terms(
                "Monday|Tuesday|Thursday|Friday|Saturday|Sunday"
            )),
            PagePlan(4, "Months and holidays", "explicit_month_grid", terms(
                "January|February|March|April|May|June|July|August|"
                "September|October|November|December"
            )),
            PagePlan(8, "Antonyms", "explicit_word_bank", terms(
                "tall|over|smooth|left|dirty|across|first|north|happy|old|"
                "open|remember|stop|frown|narrow|little|found"
            )),
            PagePlan(14, "Compound words", "explicit_word_bank", terms(
                "walk|finger|cake|farm|lid|knob|bath|brush|ball|plane|hive|"
                "flower|down|shelf|bed|ground"
            )),
            PagePlan(22, "Context-clue targets", "explicit_word_bank", terms(
                "agree|value|burst|gain|graph|duty|cure|split|elect"
            )),
            PagePlan(24, "Geometry vocabulary", "explicit_word_box", terms(
                "circle|rectangle|cylinder|cube|oval|square|triangle|cone|"
                "diamond|hexagon"
            ), "noun"),
            PagePlan(30, "Insect parts", "explicit_word_box", terms(
                "stinger|wings|head|antennae|thorax|eyes|legs|abdomen"
            ), "noun"),
            PagePlan(32, "Dinosaurs", "explicit_dinosaur_list", terms(
                "velociraptor|allosaurus|stegosaurus|iguanodon|brachiosaurus|"
                "triceratops|pteranodon|megalosaurus|diplodocus|apatosaurus"
            ), "noun"),
            PagePlan(34, "Flower parts", "explicit_word_box", terms(
                "ovary|petals|stigma|anthers|style"
            ), "noun"),
            PagePlan(50, "Animal habitats", "explicit_label_grid", terms(
                "ocean|grasslands|desert|rain forest|polar zones|monkey|snake|"
                "ape|octopus|dolphin|shark|penguin|walrus|polar bear|elephant|"
                "lion|antelope|camel|lizard|coyote"
            ), "noun"),
            PagePlan(52, "Economics", "explicit_term_column", terms(
                "consumer|want|need|currency|producer|product|service|labor|bank"
            ), "noun"),
            PagePlan(54, "Emotions", "explicit_word_box", terms(
                "lonely|sad|surprised|angry|nervous|confused|afraid|happy|excited"
            ), "adjective"),
            PagePlan(56, "Character traits", "explicit_cap_labels", terms(
                "consideration|cooperation|honesty|responsibility|patience"
            ), "noun"),
            PagePlan(64, "Short-o words", "explicit_hockey_puck_bank", terms(
                "dog|flock|hop|knot|hot|lock|stop|frog|trot|crop"
            )),
            PagePlan(66, "Short-u words", "explicit_word_bank", terms(
                "nut|mutt|scrub|grudge|run|dull|bus|smudge|mud|sun|bulb|bug|"
                "bubble|tub|drug"
            )),
            PagePlan(70, "Nouns", "explicit_sorting_targets", terms(
                "hotel|waiter|zoo|home|table|sister|friend|mother|nurse|school|"
                "baseball|beach|brother|hat|librarian|store|teacher|mom|man|ballpark"
            ), "noun"),
            PagePlan(82, "Analogies", "explicit_snowflake_bank", terms(
                "number|son|flower|dog|hour|kick|cup|blow"
            )),
            PagePlan(84, "Analogies", "explicit_cap_bank", terms(
                "brush|full|see|climb|sour|sad|least"
            )),
            PagePlan(86, "Analogies", "explicit_apple_bank", terms(
                "month|river|notes|soft|water|women|hard|open|tame|drove|shut|awake"
            )),
        ),
        visual_sample_pages=(4, 30, 54, 86),
    ),
    SourceProfile(
        registry_source_id="scholastic-success-vocabulary-grade-3",
        sha256="c3c5432508e3451a9b236a05cf801064ae2bb7bdff2d8532e125d269c7383d4f",
        byte_size=2_299_300,
        page_count=87,
        plans=(
            PagePlan(6, "Homonyms", "explicit_word_box", terms(
                "case|sole|count|band|firm"
            )),
            PagePlan(8, "Science vocabulary", "explicit_animal_bank", terms(
                "giraffe|ostrich|Komodo dragon|hawk moth|sea horse|blue whale|"
                "cheetah|Goliath birdeater|sailfish|sloth"
            ), "noun"),
            PagePlan(10, "Antonyms and -ous", "explicit_word_box", terms(
                "tiny|silly|unclear|unknown|stingy|tasteless|calm|few|rude|"
                "careless|safe|timid"
            )),
            PagePlan(22, "Synonyms", "explicit_group_targets", terms(
                "adult|grown-up|young|mature|necessary|powerful|important|required|"
                "slim|slender|skinny|smart|chubby|plump|thin|fat|pleasing|"
                "agreeable|lovely|full grown|empty|huge|gigantic|vast|brave|"
                "daring|pleasant|fearless|stuffed|loaded|packed|needed|bare|"
                "crowded|vacant|unfilled|bright|bold|intelligent|clever|overweight|"
                "mighty|strong|hardy|immature|juvenile|enormous|undeveloped"
            )),
            PagePlan(26, "Analogies", "explicit_word_box", terms(
                "south|continent|inventor|resolution|nation|immigrant|state|"
                "demand|elect|consumer|century|communication"
            )),
            PagePlan(30, "Prefix un-", "explicit_word_list", terms(
                "unpack|untie|unwrap|unload|unlock|unfamiliar|unused|unwind|undo|"
                "unknown|unfold|unable|uncertain|unfair|uncover|unroll|unusual|"
                "unwise|unkind|unpainted"
            )),
            PagePlan(32, "Trees", "explicit_tree_list", terms(
                "oak|paloverde|cottonwood|pecan|buckeye|pine|cypress|dogwood|"
                "redbud|piñon|kukui|magnolia|hemlock|palmetto"
            ), "noun"),
            PagePlan(34, "Compound-word components", "explicit_component_grid", terms(
                "school|side|water|room|time|back|under|light|store|break|fall|"
                "house|proof|down|ground|wood|town|foot|work|print|door|fire|"
                "step|out|mean"
            )),
            PagePlan(44, "Words that go together", "explicit_word_box", terms(
                "sooner|right|chips|sweet|order|lost|sugar|effect|bacon|fun|"
                "shine|business|error|easy|name|gentlemen|cup|alive|cents|pots"
            )),
            PagePlan(46, "Signs and symbols", "explicit_phrase_box", terms(
                "handicapped access|poison|hiking trail|school zone|railroad crossing|"
                "fuel|camping|flammable|slippery road|food|lodging|no bicycles"
            )),
            PagePlan(50, "Homonyms", "explicit_word_box", terms(
                "stem|leaf|root|bark|trunk"
            )),
            PagePlan(54, "Map vocabulary", "explicit_numbered_term_list", terms(
                "compass rose|distance scale|national capital|state capital|"
                "state border|national border|map key"
            ), "noun"),
            PagePlan(56, "Categories", "explicit_group_targets", terms(
                "shoes|gloves|socks|hat|adjective|comma|noun|verb|tornado|"
                "hurricane|earthquake|snow|square|sphere|pyramid|cube|banana|"
                "apple|orange|peach|daffodil|oak|maple|elm|baseball|tennis|"
                "swimming|golf|delete|return|backspace|open|pupil|iris|cornea|palm"
            )),
            PagePlan(66, "Weather vocabulary", "explicit_word_box", terms(
                "tornado|drought|flood|gale|sleet|hurricane|blizzard|frost|hail|"
                "thunderstorm"
            ), "noun"),
            PagePlan(68, "Exact reporting verbs", "explicit_word_box", terms(
                "announced|complained|directed|responded|gasped|interrupted|"
                "suggested|insisted|explained|shouted"
            ), "verb"),
            PagePlan(80, "Computer vocabulary", "explicit_word_lists", terms(
                "notebook|window|Web|virus|bug|hardware|mouse|crash|boot|bit|"
                "chip|cookie|ZIP|RAM|desktop|click|menu"
            )),
            PagePlan(82, "Portmanteau words", "explicit_word_box", terms(
                "boost|smash|flop|twirl|brunch|motel|smog|telethon|flurry|intercom"
            )),
            PagePlan(84, "Music-related vocabulary", "explicit_term_list", terms(
                "percussion|harmony|opera|jazz|rhythm|woodwind|soprano|melody|"
                "composer|conductor|musician|orchestra|brass|string|keyboard|tenor"
            )),
            PagePlan(86, "Science and health vocabulary", "explicit_diagram_and_system_labels", terms(
                "brain|esophagus|trachea|heart|lungs|liver|stomach|intestines|"
                "circulatory system|digestive system|endocrine system|muscular system|"
                "nervous system|respiratory system|immune system|skeletal system"
            ), "noun"),
        ),
        visual_sample_pages=(8, 32, 66, 86),
    ),
    SourceProfile(
        registry_source_id="scholastic-success-vocabulary-grade-4",
        sha256="c7fdae809a3366b7cbb0a7d3669f056746fc8337608267fb565c012894dc3eff",
        byte_size=2_453_925,
        page_count=87,
        plans=(
            PagePlan(12, "Prefix dis-", "explicit_word_chart", terms(
                "discontinued|disagree|dislike|discover|dishonest|disconnect|"
                "disobey|disappear|disapprove"
            )),
            PagePlan(30, "Occupations", "explicit_word_box", terms(
                "conductor|cashier|custodian|astronaut|professor|paratrooper|"
                "geologist|architect|archaeologist|hairdresser|physician|astronomer"
            ), "noun"),
            PagePlan(36, "Antonyms", "explicit_word_box", terms(
                "lower|minor|hustle|innocent|sloppy|dry|scarce|failure|darken|"
                "brand-new|narrow"
            )),
            PagePlan(42, "Synonyms", "explicit_group_targets", terms(
                "clumsy|awkward|klutzy|ordinary|glossy|big-hearted|shiny|sparkling|"
                "weird|bewildered|confused|puzzled|generous|kind|trustworthy|giving|"
                "devoted|loyal|faithful|graceless|average|red|regular|typical|"
                "gleaming|wobbly|rickety|shaky|eerie|strange|baffled|mysterious|"
                "brisk|unsteady|rapid|quick|sturdy|durable|strong|alert|ruby|"
                "swift|crimson|scarlet|cautious|wary|solid|careful"
            )),
            PagePlan(44, "Environmental vocabulary", "explicit_word_box", terms(
                "pollutants|garbage|recycle|reduce|reuse|incinerator|cleanup|"
                "landfill|environment"
            )),
            PagePlan(48, "Portmanteau words", "explicit_word_list", terms(
                "infomercial|telethon|slang|flare|dumbfound|o'clock|clash|flurry|"
                "guestimate|squiggle|splatter|glob"
            )),
            PagePlan(56, "Science categories", "explicit_group_targets", terms(
                "seal|manatee|blue whale|minnow|sea lion|iris|eardrum|pupil|cornea|"
                "root|petals|stamen|pistil|wedge|lever|pulley|battery|centimeter|"
                "decimeter|kilogram|meter|biology|geometry|botany|zoology|incisors|"
                "molars|canines|plaque|volume|thermometer|barometer|anemometer|"
                "baking soda|nitrogen|oxygen|carbon dioxide|cirrus|cumulus|stratus|"
                "circus|flock|gosling|herd|colony|climate|forest|grassland|desert|"
                "larva|chrysalis|pupa|hibernation|alligator|tortoise|gecko"
            )),
            PagePlan(58, "Word relations", "explicit_headword_column", terms(
                "stationary|taut|current|alter|banned|bolder|coarse|cruel|sum|"
                "sheer|birth|attendance"
            )),
            PagePlan(64, "Borrowed words", "explicit_numbered_word_list", terms(
                "delicatessen|shampoo|chow|pickle|bouquet|macaroni|borscht|judo|"
                "coyote|sherbet|pastrami|alfalfa|pumpernickel|bologna|potato|detour"
            )),
            PagePlan(66, "Oxymorons", "explicit_word_box", terms(
                "random|inside|original|bitter|estimate|minor|whisper|sorrow|"
                "awfully|unfinished|serious|ugly|shrimp|half|misunderstood"
            )),
            PagePlan(68, "Onomatopoeic words", "explicit_word_box", terms(
                "sniffle|swish|rumble|crunch|whish|slurp|sizzle|crackle|clatter|"
                "hiccup|thud|screech|whir|zing|sputter|clomp|burp|splash"
            )),
            PagePlan(70, "Parts of speech", "explicit_group_targets", terms(
                "Phew|Ouch|Wow|Hooray|unless|and|since|or|with|in|beside|during|"
                "brilliantly|daily|above|never|gigantic|happiest|refreshing|yellow|"
                "teacher|cafeteria|ourselves|we|your|both|uncover|shuffle|have|whittle"
            )),
            PagePlan(74, "Mathematic vocabulary", "explicit_term_box", terms(
                "point|line|line segment|perpendicular lines|right angle|parallel lines|"
                "acute angle|obtuse angle|ray|intersecting lines"
            ), "noun"),
        ),
        visual_sample_pages=(12, 42, 56, 74),
    ),
    SourceProfile(
        registry_source_id="scholastic-success-vocabulary-grade-5",
        sha256="6fedaab6d78dc409c42667a22166bc558ed3417c8ec7cad59af5b36c53bae4ba",
        byte_size=2_185_140,
        page_count=84,
        plans=(
            PagePlan(2, "Dictionary targets", "explicit_numbered_headwords", terms(
                "allergist|alpaca|agouti|albatross|amphora|anorak|auk|aphid|adze|"
                "adenoid|aerialist|agate|alyssum|ascot|albacore"
            )),
            PagePlan(6, "Antonyms", "explicit_parenthetical_pairs", terms(
                "torrent|trickle|appear|vanish|small|vast|intricate|simple|flimsy|"
                "solid|bright|dingy|diligence|laziness|wither|flourish|scanty|"
                "generous|scorn|admiration|joyful|grave|spacious|cheerful|dismal|"
                "worn|new"
            )),
            PagePlan(8, "Homophones", "explicit_homophone_pairs", terms(
                "alter|altar|hanger|hangar|coarse|course|ring|wring|brows|browse|"
                "baron|barren|quarts|quartz|stationery|stationary|cymbal|symbol|"
                "manor|manner|residence|residents|crews|cruise|duel|dual|foul|"
                "fowl|groan|grown|capital|capitol"
            )),
            PagePlan(12, "Homographs", "explicit_accent_targets", terms(
                "minute|object|present|project|desert|record|contract|subject|"
                "conduct|produce|content"
            )),
            PagePlan(24, "Synonyms", "explicit_multiple_choice_targets", terms(
                "extract|fill|replace|remove|clean|pretentious|private|outstanding|"
                "creative|showy|sullen|gloomy|sleepy|rude|tired|tranquil|peaceful|"
                "exciting|boring|dangerous|horrific|humorous|official|terrible|"
                "honorable|empty|garbage can|notebook|classroom|ship|perilous|"
                "transcontinental|very brief|extended|savory|ceramic|tasty|Spanish|"
                "salty|dynamic|knowledgeable|energetic|cordial|hasty|friendly|formal|"
                "written|valiant|complicated|careless|cowardly|courageous|tremulous|"
                "fearful|sad|eager|discouraged"
            )),
            PagePlan(26, "Homophones", "explicit_homophone_box", terms(
                "flu|flew|sighed|side|beech|beach|heard|herd|close|clothes|"
                "boarder|border|mown|moan|waste|waist|morning|mourning"
            )),
            PagePlan(28, "Analogies", "explicit_word_box", terms(
                "geology|zoology|octagon|bridal|sad|gray|strum|hurricane|google|"
                "mouse|stout|taut|arid|source|pentagon|Madrid|gaggle|research|"
                "tiny|atlas|feline"
            )),
            PagePlan(31, "Context-clue targets", "explicit_numbered_target_list", terms(
                "puny|malady|asthma|yearned|siblings|participate|regimen|courage|"
                "patience|persistence|robust|popular|collegian|field|legislator|"
                "devastated|term|big-game hunts|contracted|succumbed"
            )),
            PagePlan(41, "Rhyming words", "explicit_word_box", terms(
                "super-duper|heebie-jeebies|nitty-gritty|fuddy-duddy|hoity-toity|"
                "lovey-dovey|humdrum|teeny-weeny|okeydokey|hodgepodge|willy-nilly|"
                "handy-dandy"
            )),
            PagePlan(45, "Categories", "explicit_group_targets", terms(
                "miscellaneous|misbehave|misprint|miscalculate|misinform|eloquent|"
                "articulate|fluent|foliage|well-spoken|tranquil|pandemonium|chaos|"
                "confusion|mayhem|moneyless|faithless|hopeless|homeless|painless|"
                "caviar|omelet|quiche|armoire|mousse|zeal|eagerness|enthusiasm|"
                "calamity|fervor|derby|fedora|forsythia|homburg|beret|merry|"
                "pitiable|joyous|jovial|mirthful|curt|gruff|brusque|genial|harsh|"
                "cloudy|clear|foggy|murky|hazy|excluded|affiliated|connected|linked|"
                "associated|polluted|contaminated|impure|foul|adequate|desolate|"
                "abundant|deserted|isolated|solitary|savory|appetizing|delectable|"
                "tasty|malign|vulture|gibbon|chickadee|finch|thrasher|thistle|"
                "crabgrass|ragweed|dandelion|mulch|raiment|garment|attire|apparel|"
                "adroit|flawless|ideal|defective|suitable|accurate"
            )),
            PagePlan(47, "General vocabulary", "explicit_underlined_pairs", terms(
                "unwieldy|wily|elaborate|prudent|minimal|momentous|revelry|rivalry|"
                "wither|flourish|instigating|hindering|cherish|relinquish|dynamic|"
                "monotonous|repulsive|compatible|ecstatic|nonchalant|synchronize|"
                "scrutinize|distort|sanitize|unprecedented|undaunted|desolate|"
                "vivacious|enhancement|obstacle"
            )),
            PagePlan(52, "Antonyms", "explicit_source_word_list", terms(
                "industrious|lenient|obscure|graceful|exterior|courteous|optimist|"
                "hinder|absurd|accidental|crucial|attract|translucent|maximum|"
                "reduce|major"
            )),
            PagePlan(54, "Homophones", "explicit_homophone_box", terms(
                "board|bored|knows|nose|hour|our|threw|through|horse|hoarse|days|"
                "daze|dessert|desert|heel|heal|none|nun|patients|patience"
            )),
            PagePlan(58, "Context-clue targets", "explicit_word_cloud", terms(
                "luminous|monotonous|gesture|atmosphere|formations|lethargic|"
                "temperature|revive|treacherous|tranquil"
            )),
            PagePlan(62, "Synonyms", "explicit_multiple_choice_targets", terms(
                "eloquent|weak|abrasive|articulate|original|natural phenomenon|"
                "marvel|performer|traveler|food additive|compatible group|noisy|"
                "small|agreeable|related|emphatic answer|sorrowful|untruthful|"
                "fascinating|forceful|impetuous decision|unwise|hasty|clever|harsh|"
                "increase in revenue|garbage|money|sunlight|pottery|arrogant attitude|"
                "haughty|tricky|nervous|insolent behavior|polite|friendly|formal|rude|"
                "substantial increase|standard|minimal|significant|miniature|"
                "wary approach|haphazard|watchful|speedy|bold|taunt|tease|walk|feed|"
                "lead|remote island|famous|superior|faraway|nearby|shrewd move|gaudy|"
                "sad|weary|formidable enemy|defeated|frightening|brave|emotionless|"
                "irate parent|angry|proud|strict|lenient"
            )),
            PagePlan(64, "Science vocabulary", "explicit_definition_terms", terms(
                "organism|scientific|plants|nutrients|kingdom"
            )),
            PagePlan(66, "Dictionary targets", "explicit_numbered_headwords", terms(
                "highboy|cicada|borough|spar|bandicoot|thesaurus|periwinkle|jonquil|"
                "stratosphere|diva|strudel|carburetor|obituary|facade|chandelier"
            )),
            PagePlan(71, "Root-word vocabulary", "explicit_word_box", terms(
                "collaborate|physician|bankrupt|command|contradict|dictation|"
                "thermometer|laboratory|elaborate|physical|demand|barometer"
            )),
            PagePlan(73, "Syllable and synonym targets", "explicit_numbered_target_list", terms(
                "secret|autograph|angry|leave behind|tasty|rejoice|leader|pause|"
                "youthful|observe|forefather|understand"
            )),
            PagePlan(75, "Careers", "explicit_specialist_box", terms(
                "podiatrist|allergist|radiologist|cardiologist|orthopedist|"
                "neurologist|pediatrician|otolaryngologist|pathologist|nutritionist|"
                "pharmacist|ophthalmologist"
            ), "noun"),
            PagePlan(79, "Social studies vocabulary", "explicit_word_list", terms(
                "tyranny|appoint|senate|monarch|judicial|territory|kingdom|elect|"
                "executive|president|nation|legislative|civil rights|cabinet|anarchy"
            )),
        ),
        visual_sample_pages=(2, 31, 45, 75),
    ),
)

PROFILES_BY_ID = {profile.registry_source_id: profile for profile in PROFILES}
PROFILES_BY_SHA = {profile.sha256: profile for profile in PROFILES}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_registry(path: Path) -> dict[str, RegistrySource]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    result: dict[str, RegistrySource] = {}
    for item in payload.get("sources", []):
        source_id = clean_text(item.get("id"))
        if source_id not in SUPPORTED_SOURCE_IDS:
            continue
        source = RegistrySource(
            id=source_id,
            display_name=clean_text(item.get("display_name")),
            expected_sha256=clean_text(item.get("expected_sha256")),
            expected_byte_size=int(item.get("expected_byte_size") or 0),
            source_role=clean_text(item.get("source_role")),
            corpus_policy=clean_text(item.get("corpus_policy")),
            source_format=clean_text(item.get("format")),
        )
        profile = PROFILES_BY_ID[source_id]
        if (
            source.expected_sha256 != profile.sha256
            or source.expected_byte_size != profile.byte_size
            or source.source_role != SOURCE_ROLE
            or source.corpus_policy != CORPUS_POLICY
            or source.source_format != SOURCE_FORMAT
        ):
            raise ValueError(f"Registry metadata does not match profile: {source_id}")
        result[source_id] = source
    missing = SUPPORTED_SOURCE_IDS - set(result)
    if missing:
        raise ValueError(f"Registry is missing supported sources: {sorted(missing)}")
    return result


def identify_source(
    path: Path,
    registry: dict[str, RegistrySource],
) -> tuple[RegistrySource, SourceProfile]:
    byte_size = path.stat().st_size
    possible = [
        profile for profile in PROFILES if profile.byte_size == byte_size
    ]
    if not possible:
        raise ValueError(f"{path.name}: byte size does not match a supported source")
    digest = sha256_file(path)
    profile = PROFILES_BY_SHA.get(digest)
    if profile is None or profile not in possible:
        raise ValueError(f"{path.name}: SHA-256 does not match a supported source")
    return registry[profile.registry_source_id], profile


def normalized_page_text(value: str) -> str:
    text = clean_text(value).casefold()
    # Poppler can expose a no-break hyphen as a regular hyphen after NFKC.
    return re.sub(r"\s+", " ", text)


def term_is_visible(page_text: str, target: str) -> bool:
    haystack = normalized_page_text(page_text)
    needle = normalized_page_text(target)
    return re.search(
        rf"(?<![\w]){re.escape(needle)}(?![\w])",
        haystack,
        flags=re.UNICODE,
    ) is not None


def validate_target(target: str) -> None:
    if not target or len(target) > 48:
        raise ValueError(f"Unsafe lexical target length: {target!r}")
    if re.search(r"[.!?;:()\[\]{}]", target):
        raise ValueError(f"Sentence-like or annotated target rejected: {target!r}")
    if not re.fullmatch(r"[^\W\d_][^\d_]*", target, flags=re.UNICODE):
        raise ValueError(f"Non-lexical target rejected: {target!r}")


def make_row(
    source: RegistrySource,
    plan: PagePlan,
    target: str,
) -> dict[str, str]:
    validate_target(target)
    return {
        "source": source.display_name,
        "registry_source_id": source.id,
        "raw_term": target,
        "headword": target,
        "pos": plan.pos,
        "cefr": "",
        "topic_or_section": f"{plan.topic} | explicit lexical targets",
        "pdf_page": str(plan.page),
        "source_ref": f"registry:{source.id}",
        "definition": "",
        "notes": (
            "Explicit printed word-bank, list, chart or label form only; "
            "lemma, sense and IELTS relevance require editorial review."
        ),
        "source_role": source.source_role,
        "corpus_policy": source.corpus_policy,
        "source_format": source.source_format,
        "locator": (
            f"pdf:explicit-lexical-targets;pdf_page={plan.page};"
            f"section={plan.section}"
        ),
    }


def deduplicate_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for row in rows:
        key = (row["registry_source_id"], clean_text(row["headword"]).casefold())
        if key in seen:
            continue
        seen.add(key)
        result.append(row)
    return result


def extract_path(
    path: Path,
    registry: dict[str, RegistrySource],
) -> tuple[RegistrySource, list[dict[str, str]], dict[str, Any]]:
    source, profile = identify_source(path, registry)
    try:
        import pdfplumber  # type: ignore
    except ImportError as error:
        raise RuntimeError(
            "pdfplumber is required; use the bundled workspace Python runtime"
        ) from error

    rows: list[dict[str, str]] = []
    with pdfplumber.open(path) as pdf:
        if len(pdf.pages) != profile.page_count:
            raise ValueError(
                f"{source.id}: expected {profile.page_count} pages, found {len(pdf.pages)}"
            )
        for plan in profile.plans:
            page_text = pdf.pages[plan.page - 1].extract_text(
                x_tolerance=1,
                y_tolerance=3,
            ) or ""
            missing = [
                target
                for target in plan.targets
                if not term_is_visible(page_text, target)
            ]
            if missing:
                raise ValueError(
                    f"{source.id} PDF page {plan.page}: expected explicit targets "
                    f"not visible: {missing}"
                )
            rows.extend(make_row(source, plan, target) for target in plan.targets)

    rows = deduplicate_rows(rows)
    audit = {
        "id": source.id,
        "status": "candidate_extracted_needs_editorial_review",
        "extracted_row_count": len(rows),
        "extraction_method": (
            "sha256_gated_page_specific_explicit_word_banks_and_target_lists"
        ),
        "pages_parsed": sorted({plan.page for plan in profile.plans}),
        "visual_sample_pages": list(profile.visual_sample_pages),
        "all_pages_parsed": False,
        "editorial_review_complete": False,
        "limitations": (
            "No consolidated index is present. Only explicit word banks, labelled "
            "lists, charts and lesson target tables on whitelisted pages were "
            "retained; exercise prose, definitions and answer pages were excluded."
        ),
        "rights_boundary": (
            "lexical_forms_and_sanitized_page_locators_only_no_definitions_"
            "examples_exercises_answers_or_page_images"
        ),
    }
    return source, rows, audit


def write_tsv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=OUTPUT_COLUMNS,
            delimiter="\t",
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)


def write_audit(path: Path, audits: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 1,
        "scope": (
            "Candidate-only extraction from explicit lexical targets in five "
            "Scholastic Success with Vocabulary workbooks."
        ),
        "sources": sorted(audits, key=lambda item: item["id"]),
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_files", nargs="+", type=Path)
    parser.add_argument(
        "--registry",
        type=Path,
        default=Path("data/ielts-corpus/supplemental-source-registry.json"),
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--audit-output", required=True, type=Path)
    args = parser.parse_args()

    registry = load_registry(args.registry)
    rows: list[dict[str, str]] = []
    audits: list[dict[str, Any]] = []
    seen_sources: set[str] = set()
    for path in args.pdf_files:
        source, extracted, audit = extract_path(path, registry)
        if source.id in seen_sources:
            raise ValueError(f"Duplicate source input: {source.id}")
        seen_sources.add(source.id)
        rows.extend(extracted)
        audits.append(audit)
    if seen_sources != SUPPORTED_SOURCE_IDS:
        missing = SUPPORTED_SOURCE_IDS - seen_sources
        raise ValueError(f"Missing supported source inputs: {sorted(missing)}")

    output_rows = deduplicate_rows(rows)
    write_tsv(args.output, output_rows)
    write_audit(args.audit_output, audits)
    print(
        f"Wrote {len(output_rows)} candidate-only lexical rows from "
        f"{len(audits)} sources"
    )


if __name__ == "__main__":
    main()
