#!/usr/bin/env python3
"""Transcribe visible target-word lists from six incomplete Edge PDF exports.

The supplied PDFs are image-only exports in which nearly every adjacent PDF
page pair is identical.  The visible textbook page is the even-numbered
printed page, so alternate printed pages are missing from the source files.
This extractor therefore emits only terms visibly printed in explicit
glossaries or labelled target-word lists.  It never reconstructs a missing
page, and it never copies definitions, translations, examples or exercises.

The transcription below was produced from OCR drafts and then checked against
rendered page images.  Exact source fingerprints are required at the command
line so the curated page locators cannot silently be applied to another file.
All emitted rows are candidate-only evidence for later editorial review.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


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

POS_LABELS = {
    "adj": "adjective",
    "adjphr": "adjective phrase",
    "adv": "adverb",
    "exp": "expression",
    "n": "noun",
    "nphr": "noun phrase",
    "nv": "noun; verb",
    "phrv": "phrasal verb",
    "v": "verb",
    "vphr": "verb phrase",
}

ROW_NOTE = (
    "visible-even-pages-only; source-missing-alternate-pages; "
    "explicit target-list term and printed POS only; editorial review required."
)

RIGHTS_BOUNDARY = (
    "Terms and printed parts of speech only; no definitions, translations, "
    "example sentences, exercise text or artwork."
)


@dataclass(frozen=True)
class SourceProfile:
    registry_source_id: str
    display_name: str
    expected_sha256: str
    expected_byte_size: int
    expected_page_count: int
    pages_parsed: tuple[int, ...]
    visual_sample_pages: tuple[int, ...]


@dataclass(frozen=True)
class EntryBlock:
    registry_source_id: str
    pdf_page: int
    topic: str
    entries: str


PROFILES = {
    "edge-vocabulary-3b": SourceProfile(
        registry_source_id="edge-vocabulary-3b",
        display_name="Edge 3B Vocabulary",
        expected_sha256=(
            "70ba3d07eedd7d38d4c8787ef6a3a5ebac87207a870c7656ca2e9d844e28f7cd"
        ),
        expected_byte_size=123_554_459,
        expected_page_count=62,
        pages_parsed=(51, 53, 55, 57, 59),
        visual_sample_pages=(51, 55, 57),
    ),
    "edge-vocabulary-booster-3a": SourceProfile(
        registry_source_id="edge-vocabulary-booster-3a",
        display_name="Edge Vocabulary Booster 3A",
        expected_sha256=(
            "36d287cb0c0008794a775d0c84eb5eac72248f93e394f397996bd9c9731c407a"
        ),
        expected_byte_size=116_626_733,
        expected_page_count=66,
        pages_parsed=(55, 57, 59, 61, 63),
        visual_sample_pages=(55, 59, 61),
    ),
    "edge-vocabulary-book-1a": SourceProfile(
        registry_source_id="edge-vocabulary-book-1a",
        display_name="Edge Vocabulary Book 1A",
        expected_sha256=(
            "e8d741b822385e5b297f81e2f3485bf424ee7be8a92dbcb0612ef0f8938d6e47"
        ),
        expected_byte_size=30_061_659,
        expected_page_count=60,
        pages_parsed=(49, 51, 53, 55),
        visual_sample_pages=(49, 53, 55),
    ),
    "edge-vocabulary-book-1b": SourceProfile(
        registry_source_id="edge-vocabulary-book-1b",
        display_name="Edge Vocabulary Book 1B",
        expected_sha256=(
            "86bb8d09e7961333aac9c38286ea796b0cdca8e0251c3080fdd86c64ef0399bf"
        ),
        expected_byte_size=27_563_080,
        expected_page_count=60,
        pages_parsed=(51, 53, 55, 57),
        visual_sample_pages=(51, 53, 57),
    ),
    "edge-vocabulary-booster-2a": SourceProfile(
        registry_source_id="edge-vocabulary-booster-2a",
        display_name="Edge Vocabulary Booster 2A",
        expected_sha256=(
            "bccc70c3f2d2a9cbae4bcd3b16c6c6278964a91ccb77727b93b36f556e8b18f7"
        ),
        expected_byte_size=31_711_488,
        expected_page_count=62,
        pages_parsed=(51, 53, 55, 57),
        visual_sample_pages=(51, 55, 57),
    ),
    "edge-vocabulary-booster-2b": SourceProfile(
        registry_source_id="edge-vocabulary-booster-2b",
        display_name="Edge Vocabulary Booster 2B",
        expected_sha256=(
            "404632a56b09ec9e1f59d20f8dfd461f646f3141c91ca0f661111e7bd73d5035"
        ),
        expected_byte_size=29_022_866,
        expected_page_count=62,
        pages_parsed=(51, 53, 55, 57),
        visual_sample_pages=(51, 53, 57),
    ),
}


BLOCKS = (
    # Edge Vocabulary Book 1A
    EntryBlock(
        "edge-vocabulary-book-1a",
        49,
        "Sports communication - People in sports",
        """
n|fan
n|runner-up
n|substitute
n|team-mate
n|umpire
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        49,
        "Sports communication - Sports equipment",
        """
n|ball
n|bat
n|cue
n|goalpost
n|goggles
nphr|golf club
n|puck
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        51,
        "Poems (I) - Words used in poetry",
        """
n|acrostic
n|alliteration
n|emphasis
n|line
n|message
n|repetition
v|rhyme
nphr|rhyming words
n|stress
n|subject
nphr|shape poem
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        53,
        "Visible glossary continuation",
        """
phrv|hand sth* in
vphr|lend an ear
nphr|school spirit
v|scold
adv|wisely
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        53,
        "Hobbies",
        """
n|baking
n|calligraphy
n|chess
n|collecting ...
n|crafting
n|drawing
n|gaming
n|hiking
n|ice-skating
n|journalling
nphr|K-pop dancing
nphr|martial arts
n|photography
nphr|playing the ...
n|reading
n|skateboarding
n|vlogging
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        53,
        "Describing a hobby",
        """
adj|beneficial
adj|calming
adj|challenging
adj|educational
adj|enjoyable
adj|rewarding
adj|satisfying
adj|stress-relieving
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        53,
        "Reasons to have hobbies",
        """
vphr|develop new skills
vphr|develop patience
vphr|enrich one's life
vphr|explore one's creativity
vphr|feel relaxed
vphr|gain more confidence
vphr|have fun with friends
vphr|keep fit
vphr|learn about the world
vphr|make new friends
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        53,
        "Words and phrases related to doing hobbies",
        """
v|create ...
vphr|form a ... band
v|practise ...
v|share ...
vphr|sign up for ... classes
vphr|take up ...
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        53,
        "Other vocabulary",
        """
adj|catchy
n|coach
nphr|dance studio
adj|everyday
v|express
adj|fascinating
v|inspire
adj|keen
n|miniature
n|model
n|snap
adj|tiny
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        55,
        "Visible glossary continuation",
        """
n|medallist
n|ranking
adj|supportive
v|suspend
v|toss
n|training
nphr|ups and downs
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        55,
        "Out and about - Leisure activities",
        """
n|cycling
nphr|exploring a new neighbourhood
nphr|going bird-watching
nphr|going camping
nphr|going kite flying
nphr|going sunbathing
nphr|going window-shopping
nphr|having a barbecue
nphr|having a picnic
nphr|having tea at a cafe
n|hiking
n|outing
nphr|seeing an exhibition
n|stargazing
nphr|taking a boat trip
nphr|visiting a country park
nphr|visiting a museum
nphr|visiting a street market
nphr|visiting a village
nphr|visiting an island
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        55,
        "Adjectives to describe places",
        """
adj|bustling
adj|charming
adj|compact
adj|crowded
adj|easy-to-reach
adj|exotic
adj|incredible
adj|lively
adj|magnificent
adj|peaceful
adj|picturesque
adj|remote
adj|rural
adj|spectacular
adj|unique
adj|upmarket
adj|urban
adj|well-known
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1a",
        55,
        "Things and places to enjoy during a trip",
        """
n|attraction
n|beach
nphr|cable car
n|campfire
n|countryside
n|exhibit
n|lake
n|mural
nphr|rock carving
n|scenery
nphr|sea breeze
n|waterfall
n|waterfront
n|wildlife
""",
    ),
    # Edge Vocabulary Book 1B
    EntryBlock(
        "edge-vocabulary-book-1b",
        51,
        "Drama (I) - Common terms in drama",
        """
n|audience
n|cast
n|character
n|costume
n|dialogue
n|director
nphr|dress rehearsal
nphr|facial expression
n|gesture
n|narrator
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        53,
        "Tasty treats - Ways of preparing food",
        """
v|beat
v|blend
v|dice
v|drizzle
v|peel
v|slice
v|spread
v|sprinkle
v|whisk
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        53,
        "Ways of cooking",
        """
v|bake
v|boil
v|deep-fry
v|grill
v|roast
v|scramble
v|steam
v|stew
v|stir-fry
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        53,
        "Adjectives to describe food",
        """
adj|bitter
adj|bland
adj|chewy
adj|creamy
adj|crispy
adj|crunchy
adj|fluffy
adj|juicy
adj|oily
adj|salty
adj|savoury
adj|smooth
adj|sour
adj|spicy
adj|sweet
adj|tender
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        53,
        "Seasonings",
        """
nphr|brown sugar
n|chilli
n|cinnamon
n|garlic
n|ginger
n|honey
n|ketchup
n|mustard
n|onion
n|parsley
n|pepper
nphr|red rice vinegar
n|rosemary
n|salt
nphr|soy sauce
n|spice
nphr|spring onion
n|syrup
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        53,
        "Ingredients",
        """
n|asparagus
n|flour
n|kimchi
n|mochi
n|mushroom
nphr|red bean
n|sausage
nphr|sesame seeds
n|yogurt
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        55,
        "Visible glossary continuation",
        """
adj|exhausted
adj|relieved
adj|shocked
adj|thrilled
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        55,
        "Holiday items",
        """
n|adapter
n|backpack
nphr|boarding pass
nphr|first aid kit
n|guidebook
n|itinerary
n|luggage
n|passport
n|reservation
nphr|street map
n|toiletries
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        55,
        "Attractions",
        """
n|monument
n|museum
nphr|night market
nphr|safari park
n|temple
n|theatre
nphr|theme park
nphr|water slide
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        55,
        "Adverbs to describe how something happens",
        """
adv|dramatically
adv|frantically
adv|freely
adv|impatiently
adv|lightly
adv|loudly
adv|madly
adv|nervously
adv|quietly
adv|rapidly
adv|suddenly
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        55,
        "Other vocabulary",
        """
n|appetite
adj|available
adj|elaborate
n|experience
n|fortune
vphr|have second thoughts
n|legend
adj|ordinary
n|staycation
adj|traditional
adj|unique
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        55,
        "Types of games",
        """
nphr|adventure game
nphr|board game
nphr|card game
nphr|code-breaking game
nphr|computer game
nphr|detective game
nphr|playground game
nphr|property game
nphr|role-playing game
nphr|sports game
nphr|strategy game
nphr|video game
nphr|web-based game
nphr|word game
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        55,
        "Board game items",
        """
n|buzzer
n|dice
nphr|game board
nphr|game card
nphr|game piece/token
n|rulebook
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        57,
        "Visible glossary continuation",
        """
nv|post
n|screen
n|smartphone
nphr|social media (site)
v|trend
nv|vlog
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        57,
        "Adjectives to describe technology",
        """
adj|convenient
adj|indispensable
adj|interactive
adj|practical
adj|reliable
adj|state-of-the-art
adj|unique
adj|user-friendly
adj|versatile
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        57,
        "Reasons why people use apps",
        """
vphr|become an influencer
vphr|enhance productivity
vphr|entertain oneself
vphr|learn new skills
vphr|order food
vphr|pass the time
vphr|share photos and videos
vphr|stay connected
vphr|stay organised
vphr|stay up to date
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        57,
        "Words related to Internet threats",
        """
n|addiction
n|cyberbullying
n|cybersecurity
n|doxing
n|hacking
nphr|identity theft
n|malware
n|phishing
n|privacy
""",
    ),
    EntryBlock(
        "edge-vocabulary-book-1b",
        57,
        "Other vocabulary",
        """
nphr|fitness class
n|hardship
n|pace
nphr|pocket money
n|timetable
v|translate
n|treadmill
""",
    ),
    # Edge Vocabulary Booster 2A
    EntryBlock(
        "edge-vocabulary-booster-2a",
        51,
        "Songs - Aspects of songs",
        """
n|arrangement
n|chorus
n|composer
n|cover
n|genre
n|lyrics
n|medley
n|melody
n|mood
nphr|music video
n|number
n|pitch
n|rhythm
n|score
n|song
n|vocals
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        53,
        "Types of drama",
        """
n|comedy
n|farce
n|mime
n|musical
n|opera
n|romance
n|tragedy
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        55,
        "Visible glossary continuation",
        """
adj|suspenseful
adj|thrilling
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        55,
        "Adjectives to describe characters",
        """
adj|bossy
adj|charismatic
adj|dependable
adj|lovable
adj|moody
adj|stubborn
adj|talented
adj|thoughtless
adj|witty
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        55,
        "Other vocabulary",
        """
n|entertainment
adv|fairly
adv|incredibly
v|inspire
n|sequel
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        55,
        "Environmental problems",
        """
nphr|air pollution
nphr|climate change
nphr|global warming
nphr|light pollution
nphr|noise pollution
nphr|plastic pollution
nphr|wasting electricity
nphr|wasting water
nphr|water pollution
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        55,
        "Types of waste",
        """
nphr|chemical waste
nphr|construction waste
n|e-waste
nphr|food waste
nphr|household waste
nphr|organic waste
nphr|paper waste
nphr|plastic waste
nphr|textile waste
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        55,
        "Examples of waste",
        """
nphr|aluminium can
n|container
nphr|detergent bottle
nphr|drinking straw
nphr|fast fashion
n|leftovers
nphr|polystyrene box
nphr|shower curtain
nphr|tin can
nphr|water bottle
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        55,
        "Ways to reduce waste",
        """
vphr|bring your own container
vphr|buy products with less packaging
vphr|donate old clothes
vphr|offer smaller portion sizes
vphr|order more carefully
v|recycle
vphr|shop more thoughtfully
vphr|sort your waste
vphr|stop using single-use cutlery
vphr|turn off the tap
vphr|upcycle to create new items
vphr|use cloth handkerchiefs instead of tissues
vphr|use 'ugly' produce
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        57,
        "Visible glossary continuation",
        """
nphr|grooming supplies
n|leash
nphr|litter box
nphr|nest box
n|perch
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        57,
        "Ways to care for pets",
        """
vphr|clean (them) regularly
vphr|exercise (them) regularly
vphr|give (them) a place to rest
vphr|give (them) a treat occasionally
vphr|give (them) fresh water
vphr|give (them) healthy food
vphr|handle (them) carefully
vphr|play with (them)
vphr|take (them) to a vet for regular checkups
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        57,
        "Talking about pets",
        """
vphr|be a lifetime responsibility
vphr|be good companions
vphr|be quite sociable
vphr|groom themselves regularly
vphr|help us relax
vphr|keep sb* company
vphr|need a lot of attention
vphr|need daily exercise
vphr|need training
vphr|need yearly checkups
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        57,
        "Other vocabulary",
        """
adj|abandoned
vphr|be aware of sth*
n|bug
adj|canine
adv|constantly
v|drag
n|feline
v|heal
nphr|heated discussion
adjphr|in disguise
vphr|jump into action
n|lifespan
n|nuisance
n|pest
n|vaccination
n|vet
v|wag
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2a",
        57,
        "Better together - Talking about friends",
        """
n|acquaintance
vphr|be insincere
vphr|be sb's* best friend
vphr|become toxic
n|bestie
n|frenemy
vphr|hold grudges
phrv|let sb* down
n|mate
vphr|show appreciation
nphr|soul mate
nphr|superficial friendship
vphr|take advantage of sb*
""",
    ),
    # Edge Vocabulary Booster 2B
    EntryBlock(
        "edge-vocabulary-booster-2b",
        51,
        "Other popular culture items",
        """
n|advertisement
nphr|comic strip
n|commercial
n|horoscope
n|manga
nphr|music video
nphr|reality TV programme
nphr|movie trailer
n|show
nphr|stand-up comedy
nphr|vox pop
n|webcomic
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        53,
        "Helping others - People in need",
        """
n|orphans
nphr|people with intellectual disabilities
nphr|people with physical disabilities
nphr|people with severe illnesses
nphr|people with substance abuse issues
n|refugees
nphr|the elderly
nphr|the homeless
nphr|the needy
nphr|the poor
nphr|the unemployed
nphr|underprivileged families
nphr|victims of abuse
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        53,
        "Social issues",
        """
nphr|abandoned animals
nphr|alcohol addiction
n|discrimination
nphr|drug addiction
nphr|economic inequality
nphr|mental illness
n|poverty
n|racism
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        53,
        "Volunteer activities",
        """
nphr|caring for rescued animals
nphr|coaching people with disabilities
nphr|collecting used clothing
nphr|delivering food to the homeless
nphr|doing household chores for the elderly
nphr|fostering animals
nphr|organising fundraising activities
nphr|storytelling in libraries
nphr|tutoring children
nphr|visiting the elderly
nphr|voluntary work
nphr|walking dogs
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        53,
        "Talking about offering help",
        """
vphr|find sth* worthwhile
exp|for a good cause
vphr|get involved
vphr|give back to (the community)
vphr|make a (big) difference
vphr|make an impact
n|opportunity
vphr|raise awareness of
vphr|show care
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        53,
        "Groups or people that offer help",
        """
n|charity
nphr|community centre
n|counsellor
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        55,
        "Adjectives to describe appearance",
        """
adj|athletic
adj|casual
adj|chic
adj|delicate
adj|dull
adj|elegant
adj|glamorous
adj|petite
adj|plain
adj|polished
adj|presentable
adj|radiant
adj|scruffy
adj|sleek
adj|stylish
adj|worn
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        55,
        "Words and phrases related to looking good",
        """
n|accessory
n|acne
n|appearance
n|cosmetics
nphr|facial cleanser
n|fashion
n|hairstyle
nphr|inner beauty
n|looks
n|make-up
n|mirror
n|outfit
adj|plump
n|pore
adj|puffy
nphr|skincare routine
adj|slim
n|style
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        55,
        "Other vocabulary",
        """
nphr|a small fortune
adj|artistic
exp|be out and about
n|celebrity
n|compliment
v|criticise
n|damage
v|define
v|disapprove
adj|dissatisfied
n|effect
n|event
adj|formal
adj|harmful
adj|harmless
nphr|hate mail
nphr|image filter
adj|imaginary
adj|immature
exp|in all honesty
n|interview
n|mood
n|occasion
adj|permanent
n|preteen
nphr|social media account
phrv|stand out
adj|subjective
n|trend
n|trickery
adj|unique
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        57,
        "Useful expressions about life lessons",
        """
exp|better late than never
exp|don't cry over spilt milk
exp|honesty is the best policy
exp|practice makes perfect
exp|practise what you preach
exp|take the bull by the horns
exp|the early bird catches the worm
exp|two heads are better than one
exp|you reap what you sow
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        57,
        "Other vocabulary",
        """
v|appeal
n|eye-opener
nphr|life lesson
n|moral
adj|timeless
adj|universal
n|word-of-mouth
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        57,
        "Inspiring people - Types of inspiring people",
        """
n|adventurer
n|businessperson
n|entertainer
n|founder
n|inventor
n|novelist
nphr|role model
n|scientist
n|songwriter
n|thinker
n|writer
n|advocate
n|pioneer
n|prodigy
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-2b",
        57,
        "Types of achievements",
        """
vphr|break a record
vphr|create a world-changing invention
vphr|follow one's dreams
vphr|gain recognition
vphr|improve people's lives
vphr|launch a product
vphr|launch a successful business
vphr|leave an important mark
vphr|make a breakthrough
vphr|make a major discovery
vphr|make important information accessible
vphr|save lives
vphr|speak up for body positivity
vphr|walk in space
vphr|win an award
vphr|write a best-seller
""",
    ),
    # Edge Vocabulary Booster 3A
    EntryBlock(
        "edge-vocabulary-booster-3a",
        55,
        "Social issues - Common social issues",
        """
nphr|ageing population
nphr|animal cruelty
n|cyberbullying
n|discrimination
nphr|drug abuse
n|illiteracy
nphr|income inequality
nphr|Internet addiction
n|pollution
n|poverty
nphr|high healthcare costs
n|racism
nphr|underage drinking
nphr|underage smoking
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        57,
        "Types of poem",
        """
n|ballad
n|elegy
nphr|free verse
n|haiku
n|limerick
nphr|mood poem
n|ode
nphr|shape poem
n|sonnet
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        59,
        "Other vocabulary",
        """
nphr|act of kindness
nphr|agony aunt
vphr|be in sb's* shoes
v|convince
n|deadline
vphr|drive sb* nuts
adj|extensive
phrv|fall behind
phrv|figure out
phrv|get sth* back
v|handle
phrv|look forward to
nphr|medium of instruction
n|mentee
n|mentor
adj|motivational
n|peer
adj|problem-solving
adj|random
v|recall
nphr|social worker
n|strategy
nphr|stress management
n|uncertainty
adj|unreasonable
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        59,
        "People in business",
        """
nphr|business partner
n|chairperson
nphr|Chief Executive Officer
n|customer
n|entrepreneur
n|manager
n|salesperson
n|secretary
nphr|shop owner
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        59,
        "Phrases related to setting up a business",
        """
vphr|create a schedule
vphr|draw up a budget
vphr|find sponsors
vphr|identify a target market
vphr|promote an event
vphr|recruit employees
vphr|set up a stall
vphr|source products
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        59,
        "Phrases related to running a business",
        """
vphr|be hands-on
vphr|cut costs
vphr|go the extra mile
vphr|improve customer experience
vphr|maximise opportunities
vphr|motivate staff
vphr|promote one's business
vphr|streamline workflows
vphr|take a calculated risk
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        59,
        "Words and phrases related to marketing",
        """
n|advertisement
n|brand
nphr|brand awareness
n|campaign
n|consumer
n|discount
adj|eye-catching
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        61,
        "Describing the invention process",
        """
v|analyse
v|brainstorm
v|define
nphr|demand for
n|design
v|empathise
v|experiment
n|feature
n|feedback
v|finalise
n|function
adjphr|inspired by
nv|launch
v|modify
nv|prototype
v|refine
nphr|solution to
n|testing
v|visualise
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        61,
        "Qualities of successful innovators",
        """
adj|ambitious
adj|courageous
adj|dynamic
adj|flexible
adj|forward-thinking
adj|open-minded
adj|persistent
adj|results-oriented
adj|self-disciplined
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        61,
        "Phrasal verbs",
        """
phrv|ask around
phrv|break down
phrv|carry on
phrv|come across
phrv|come up with
phrv|come with
phrv|find out
phrv|get back to
phrv|get ... out
phrv|give off
phrv|go down
phrv|go through
phrv|grow up
phrv|pay off
phrv|pick up
phrv|put ... off
phrv|put ... on
phrv|put together
phrv|reach into
phrv|reach out
phrv|run out of
phrv|send ... back
phrv|set out
phrv|sit around
phrv|sit down
phrv|switch out
phrv|take away
phrv|take off
phrv|talk about
phrv|test ... out
phrv|think up
phrv|throw out
phrv|try out
phrv|turn out
phrv|walk over
phrv|wrap up
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        61,
        "Other vocabulary",
        """
nphr|back story
v|exceed
n|generosity
adj|impractical
adj|neighbouring
adj|nutritious
v|shortlist
adj|soundproof
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        63,
        "Visible glossary continuation",
        """
v|drawl
phrv|dwell on
v|gasp
v|giggle
phrv|mull over
v|murmur
v|mutter
phrv|ponder over
v|shriek
v|sigh
v|snarl
v|stammer
v|threaten
v|urge
v|whimper
v|whisper
v|yell
""",
    ),
    EntryBlock(
        "edge-vocabulary-booster-3a",
        63,
        "Other vocabulary",
        """
v|clutter
v|dare
n|hawk
n|inhabitant
n|persuasion
n|pharaoh
v|reveal
n|revenge
v|surface
""",
    ),
    # Edge 3B Vocabulary
    EntryBlock(
        "edge-vocabulary-3b",
        51,
        "Workplace communication - Positions in a company",
        """
n|accountant
nphr|chief executive officer
nphr|customer services executive
nphr|general manager
nphr|human resources manager
nphr|IT technician
nphr|managing director
nphr|marketing executive
n|president
n|receptionist
nphr|sales representative
n|secretary
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        53,
        "Debating - Debating terms",
        """
n|argument
v|define
n|definition
n|fallacy
n|issue
n|motion
nphr|the Opposition team
nphr|opposing teams
n|position
n|principle
nphr|the Proposition team
n|reasoning
v|rebut
n|rebuttal
n|scope
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        55,
        "Other vocabulary",
        """
adj|aggressive
adj|appealing
n|applicant
n|appreciation
v|brag
n|capacity
n|client
adj|daunting
v|ease
n|fame
nphr|financial burden
v|influence
v|interact
adj|irresistible
phrv|lay off
v|nominate
n|passion
adj|reputable
n|satisfaction
v|serve
v|source
n|uncertainty
adj|veteran
adj|vital
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        55,
        "Life in the future - Advanced technologies",
        """
nphr|3-D printing
nphr|artificial intelligence
nphr|augmented reality
n|biotechnology
nphr|computer graphic
nphr|driverless car
n|drone
nphr|facial recognition
nphr|genetic engineering
nphr|holographic technology
nphr|plant-based meat
n|nanotechnology
n|robotics
nphr|smart home device
nphr|space tourism
nphr|virtual reality
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        55,
        "Talking about using advanced technologies",
        """
v|accelerate
vphr|adapt to
v|alter
v|impact
v|optimise
v|redefine
v|reshape
v|revolutionise
v|transform
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        55,
        "Adjectives to describe technologies",
        """
adj|accessible
adj|automated
adj|complex
adj|creepy
adj|cutting-edge
adj|emerging
adj|ethical
adj|experimental
adj|game-changing
adj|intuitive
adj|personalised
adj|pragmatic
adj|realistic
adj|sophisticated
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        57,
        "Ways to help conservation",
        """
vphr|ban illegal wildlife trade
vphr|debunk false beliefs
vphr|educate the public
vphr|enforce stricter penalties
vphr|impose heavier fines
vphr|make a donation
vphr|raise awareness
vphr|reverse habitat loss
vphr|set up a nature reserve
vphr|sign a petition
vphr|spread the message
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        57,
        "Threatened animals",
        """
nphr|Asian elephant
nphr|black rhino
nphr|black-faced spoonbill
nphr|bluefin tuna
n|chimpanzee
nphr|giant panda
n|gibbon
nphr|green turtle
n|hornbill
n|koala
n|macaque
n|pangolin
nphr|polar bear
n|shark
nphr|snow leopard
nphr|sun bear
n|tiger
nphr|wild boar
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        57,
        "Describing conservation status",
        """
adjphr|critically endangered
adj|endangered
adj|extinct
nphr|least concern
exp|on the edge of extinction
adj|threatened
adj|vulnerable
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        57,
        "Other vocabulary",
        """
vphr|be guilty of sth*
vphr|be worth it
v|breed
n|cloning
n|consequence
n|conservationist
vphr|cross one's mind
v|cull
phrv|die out
v|forage
n|haven
nphr|nature reserve
n|orphan
v|perish
adj|precious
v|roam
phrv|stick to sth*
v|tackle
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        57,
        "Our heritage - Words related to Chinese culture and traditions",
        """
n|abundance
n|calligraphy
nphr|Chinese mythology
nphr|Chinese opera
n|embroidery
nphr|filial piety
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        59,
        "Visible glossary continuation",
        """
adj|magnificent
adj|majestic
adj|notable
adj|scenic
adj|stunning
""",
    ),
    EntryBlock(
        "edge-vocabulary-3b",
        59,
        "Other vocabulary",
        """
n|burden
nphr|culture shock
adj|embroidered
n|gaze
nphr|language barrier
n|privilege
adj|socioeconomic
""",
    ),
)


def parse_entries(block: EntryBlock) -> list[tuple[str, str]]:
    parsed: list[tuple[str, str]] = []
    for line_number, raw_line in enumerate(block.entries.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        try:
            pos_code, term = line.split("|", 1)
        except ValueError as error:
            raise ValueError(
                f"{block.registry_source_id} p.{block.pdf_page} "
                f"line {line_number}: expected POS|term"
            ) from error
        if pos_code not in POS_LABELS:
            raise ValueError(
                f"{block.registry_source_id} p.{block.pdf_page}: "
                f"unsupported POS code {pos_code!r}"
            )
        term = re.sub(r"\s+", " ", term).strip()
        if not term:
            raise ValueError(
                f"{block.registry_source_id} p.{block.pdf_page}: empty term"
            )
        if re.search(r"[\u3400-\u9fff]", term):
            raise ValueError(
                f"{block.registry_source_id} p.{block.pdf_page}: "
                f"translation leaked into term {term!r}"
            )
        parsed.append((term, POS_LABELS[pos_code]))
    return parsed


def build_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    entry_index_by_page: Counter[tuple[str, int]] = Counter()
    for block in BLOCKS:
        profile = PROFILES[block.registry_source_id]
        if block.pdf_page not in profile.pages_parsed:
            raise ValueError(
                f"{block.registry_source_id}: unapproved page {block.pdf_page}"
            )
        for term, pos in parse_entries(block):
            page_key = (block.registry_source_id, block.pdf_page)
            entry_index_by_page[page_key] += 1
            entry_index = entry_index_by_page[page_key]
            rows.append(
                {
                    "source": profile.display_name,
                    "registry_source_id": profile.registry_source_id,
                    "raw_term": term,
                    "headword": term,
                    "pos": pos,
                    "cefr": "",
                    "topic_or_section": block.topic,
                    "pdf_page": str(block.pdf_page),
                    "source_ref": (
                        f"{profile.display_name} visible PDF p.{block.pdf_page}"
                    ),
                    "definition": "",
                    "notes": ROW_NOTE,
                    "source_role": "lexical_candidate",
                    "corpus_policy": "candidate_only",
                    "source_format": "pdf",
                    "locator": (
                        f"pdf:page={block.pdf_page};"
                        "region=explicit-vocabulary-list;"
                        "scope=visible-even-pages-only;"
                        "source-missing-alternate-pages=true;"
                        f"entry={entry_index}"
                    ),
                }
            )
    return rows


def normalise_term(term: str) -> str:
    return re.sub(r"\s+", " ", term.casefold()).strip()


def source_statistics(
    rows: Iterable[dict[str, str]],
) -> dict[str, dict[str, int]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[row["registry_source_id"]].append(row)
    stats: dict[str, dict[str, int]] = {}
    for source_id, source_rows in grouped.items():
        unique = {
            normalise_term(row["headword"])
            for row in source_rows
        }
        stats[source_id] = {
            "extracted_row_count": len(source_rows),
            "unique_normalized_term_count": len(unique),
            "duplicate_evidence_row_count": len(source_rows) - len(unique),
        }
    return stats


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_sources(paths: Iterable[Path]) -> dict[str, Path]:
    matched: dict[str, Path] = {}
    profiles_by_fingerprint = {
        (profile.expected_byte_size, profile.expected_sha256): profile
        for profile in PROFILES.values()
    }
    for path in paths:
        if not path.is_file():
            raise ValueError(f"Source is not a file: {path}")
        fingerprint = (path.stat().st_size, sha256_file(path))
        profile = profiles_by_fingerprint.get(fingerprint)
        if profile is None:
            raise ValueError(
                f"Unrecognised Edge source fingerprint: {path.name}"
            )
        if profile.registry_source_id in matched:
            raise ValueError(
                f"Duplicate source for {profile.registry_source_id}"
            )
        matched[profile.registry_source_id] = path
    missing = sorted(set(PROFILES) - set(matched))
    if missing:
        raise ValueError(f"Missing required Edge sources: {', '.join(missing)}")
    return matched


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


def build_audit(
    rows: list[dict[str, str]],
    output_path: Path,
) -> dict[str, object]:
    stats = source_statistics(rows)
    sources = []
    for source_id, profile in PROFILES.items():
        source_stats = stats[source_id]
        sources.append(
            {
                "id": source_id,
                "status": "candidate_extracted_source_pages_missing",
                "extracted_row_count": source_stats["extracted_row_count"],
                "unique_normalized_term_count": (
                    source_stats["unique_normalized_term_count"]
                ),
                "duplicate_evidence_row_count": (
                    source_stats["duplicate_evidence_row_count"]
                ),
                "extraction_method": (
                    "ocr-assisted-manual-transcription-from-visible-explicit-"
                    "glossary-and-target-word-lists"
                ),
                "pages_parsed": list(profile.pages_parsed),
                "visual_sample_pages": list(profile.visual_sample_pages),
                "rights_boundary": RIGHTS_BOUNDARY,
            }
        )
    return {
        "schema_version": 1,
        "scope": {
            "source_ids": list(PROFILES),
            "output": output_path.as_posix(),
            "source_limitation": (
                "visible-even-pages-only; source-missing-alternate-pages"
            ),
            "promotion_policy": "candidate_only",
        },
        "sources": sources,
    }


def write_audit(
    path: Path,
    rows: list[dict[str, str]],
    output_path: Path,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = build_audit(rows, output_path)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_files", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--audit-output", required=True, type=Path)
    args = parser.parse_args()

    verify_sources(args.pdf_files)
    rows = build_rows()
    write_tsv(args.output, rows)
    write_audit(args.audit_output, rows, args.output)

    stats = source_statistics(rows)
    print(f"Wrote {len(rows)} candidate evidence rows to {args.output}")
    for source_id in PROFILES:
        source_stats = stats[source_id]
        print(
            f"{source_id}: {source_stats['extracted_row_count']} rows; "
            f"{source_stats['unique_normalized_term_count']} unique terms; "
            f"{source_stats['duplicate_evidence_row_count']} duplicate "
            "evidence rows"
        )
    print(
        "Status: candidate_extracted_source_pages_missing "
        "(visible-even-pages-only)"
    )


if __name__ == "__main__":
    main()
