#!/usr/bin/env python3
"""Build and verify the public audio index for all learner-reported hard words.

This layer is intentionally pronunciation-only.  The learner report does not
contain source sentences, approved senses, parts of speech, or IPA, so none of
those fields may enter this manifest.  Exact headword matches may reference an
already verified IELTS WordLab word recording; every other headword receives a
dedicated UK and US recording under ``audio/hard-words``.
"""

from __future__ import annotations

import argparse
import json
import math
import tempfile
from decimal import Decimal
from pathlib import Path
from typing import Any

from ielts_audio_manifest import (
    AUDIO_ROOT,
    MANIFEST_FILE as REVIEWED_AUDIO_MANIFEST_FILE,
    VOICES as REVIEWED_VOICES,
    canonical_json,
    load_manifest as load_reviewed_audio_manifest,
    probe_audio,
    sha256_file,
    sha256_text,
)


ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "public" / "ielts" / "corpus" / "student-hard-words.json"
HARD_WORD_AUDIO_ROOT = AUDIO_ROOT / "hard-words"
HARD_WORD_AUDIO_MANIFEST_FILE = HARD_WORD_AUDIO_ROOT / "manifest.json"

SCHEMA_VERSION = 1
CATALOG_ID = "student-hard-words-2026-08-12"
PIPELINE_VERSION = "2026-08-13.2"
PROFILE_ID = f"macos-say-hard-word-{PIPELINE_VERSION}"
SYNTHESIS_ENGINE = "macos-say"
SYNTHESIS_ENGINE_VERSION = "macOS-26.5-25F71"
GENERATED_VOICES = {
    "uk": "Daniel",
    "us": "Samantha",
}
SPEECH_RATE_WPM = 175
GENERATED_PROFILE_PARAMETERS = {
    "between_repetitions_seconds": 0.55,
    "channels": 1,
    "closing_silence_seconds": 0.3,
    "codec": "mp3",
    "ffmpeg_quality": 2,
    "opening_silence_seconds": 0.7,
    "repeat_count": 3,
    "sample_rate_hz": 24_000,
    "source_channels": 1,
    "source_codec": "pcm_s16be",
    "source_container": "aiff",
    "source_sample_rate_hz": 22_050,
    "speech_rate_wpm": SPEECH_RATE_WPM,
}
REVIEWED_WORD_PROFILE_ID = "edge-tts-word-2026-07-30.1"
REVIEWED_WORD_PROFILE_SHA256 = (
    "07f4cd8abcdf6b72b0b8a75ee4c86ae572c6d0c7ba7acd6beec5e1a34fd4cda3"
)
EXPECTED_HEADWORD_COUNT = 751
EXPECTED_SHARED_HEADWORD_COUNT = 23
EXPECTED_GENERATED_HEADWORD_COUNT = 728
EXPECTED_SOURCE_AUDITED_HEADWORD_COUNT = 12
DURATION_DRIFT_TOLERANCE_SECONDS = 0.1
REVIEW_STATUSES = {
    "needs_lexical_approval",
    "needs_lexical_source",
    "needs_proper_noun_and_sense_review",
    "needs_sense_confirmation",
    "source_audited_for_rescue",
}


class HardWordAudioError(RuntimeError):
    """Raised when the hard-word pronunciation contract is invalid."""


def finite_number(value: Any) -> bool:
    """Return true only for finite JSON numbers, never booleans."""

    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(float(value))
    except (OverflowError, TypeError, ValueError):
        return False


def type_strict_equal(left: Any, right: Any) -> bool:
    """Compare JSON-like values without treating booleans as integers."""

    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return set(left) == set(right) and all(
            type_strict_equal(left[key], right[key]) for key in left
        )
    if isinstance(left, list):
        return len(left) == len(right) and all(
            type_strict_equal(old, new) for old, new in zip(left, right)
        )
    return bool(left == right)


def load_catalog(catalog_file: Path = CATALOG_FILE) -> dict[str, Any]:
    try:
        catalog = json.loads(catalog_file.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise HardWordAudioError(f"Missing hard-word catalog: {catalog_file}") from error
    except json.JSONDecodeError as error:
        raise HardWordAudioError(f"Invalid hard-word catalog JSON: {error}") from error

    entries = catalog.get("entries")
    if (
        not type_strict_equal(catalog.get("schemaVersion"), 1)
        or catalog.get("catalogId") != CATALOG_ID
        or not isinstance(entries, list)
        or len(entries) != EXPECTED_HEADWORD_COUNT
    ):
        raise HardWordAudioError("Hard-word catalog identity or coverage changed")

    ids: set[str] = set()
    headwords: set[str] = set()
    source_audited = 0
    for entry in entries:
        if not isinstance(entry, dict):
            raise HardWordAudioError("Hard-word catalog entry is not an object")
        entry_id = str(entry.get("id") or "")
        display_word = str(entry.get("displayWord") or "").strip()
        normalized = str(entry.get("normalizedHeadword") or "").strip()
        if not entry_id or not display_word or not normalized:
            raise HardWordAudioError("Hard-word entry is missing its public identity")
        if entry_id in ids or normalized.casefold() in headwords:
            raise HardWordAudioError(f"Duplicate hard-word identity: {entry_id}")
        if display_word.casefold() != normalized.casefold():
            raise HardWordAudioError(
                f"Display and normalized headword differ unexpectedly: {entry_id}"
            )
        allowed_keys = {
            "abilityTags",
            "corpusMatchStatus",
            "difficultyCode",
            "displayWord",
            "id",
            "needsMeaning",
            "needsPronunciation",
            "normalizedHeadword",
            "practiceStatus",
            "reportCount",
            "reviewStatus",
        }
        if set(entry) != allowed_keys:
            raise HardWordAudioError(
                f"Hard-word catalog entry fields changed unexpectedly: {entry_id}"
            )
        review_status = str(entry.get("reviewStatus") or "")
        if review_status not in REVIEW_STATUSES:
            raise HardWordAudioError(
                f"Hard-word entry has an unknown lexical review status: {entry_id}"
            )
        if review_status == "source_audited_for_rescue":
            source_audited += 1
        ids.add(entry_id)
        headwords.add(normalized.casefold())
    if source_audited != EXPECTED_SOURCE_AUDITED_HEADWORD_COUNT:
        raise HardWordAudioError(
            f"Expected {EXPECTED_SOURCE_AUDITED_HEADWORD_COUNT} source-audited "
            f"headwords; found {source_audited}"
        )
    return catalog


def catalog_sha256(catalog_file: Path = CATALOG_FILE) -> str:
    return sha256_file(catalog_file)


def reviewed_word_assets(
    reviewed_manifest_file: Path = REVIEWED_AUDIO_MANIFEST_FILE,
) -> dict[tuple[str, str], dict[str, Any]]:
    manifest = load_reviewed_audio_manifest(reviewed_manifest_file)
    index: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in manifest.get("entries", []):
        if entry.get("kind") != "word":
            continue
        key = (str(entry.get("text") or "").casefold(), str(entry.get("accent") or ""))
        if not key[0] or key[1] not in REVIEWED_VOICES or key in index:
            raise HardWordAudioError("Reviewed word-audio index is ambiguous")
        index[key] = entry
    return index


def generation_profile() -> dict[str, Any]:
    return {
        "parameters": GENERATED_PROFILE_PARAMETERS,
        "pipelineVersion": PIPELINE_VERSION,
        "synthesisEngine": SYNTHESIS_ENGINE,
        "synthesisEngineVersion": SYNTHESIS_ENGINE_VERSION,
    }


def expected_audio_links(
    catalog_file: Path = CATALOG_FILE,
    reviewed_manifest_file: Path = REVIEWED_AUDIO_MANIFEST_FILE,
) -> list[dict[str, Any]]:
    catalog = load_catalog(catalog_file)
    reviewed = reviewed_word_assets(reviewed_manifest_file)
    profile_sha256 = sha256_text(canonical_json(generation_profile()))
    links: list[dict[str, Any]] = []
    for entry in catalog["entries"]:
        entry_id = str(entry["id"])
        headword = str(entry["displayWord"])
        for accent in REVIEWED_VOICES:
            existing = reviewed.get((headword.casefold(), accent))
            if existing:
                voice = REVIEWED_VOICES[accent]
                relative_path = str(existing["path"])
                asset_source = "shared_reviewed_word"
                profile_id = str(existing["generation_profile"])
                generation_profile_sha256 = str(
                    existing["generation_profile_sha256"]
                )
            else:
                voice = GENERATED_VOICES[accent]
                relative_path = f"hard-words/{accent}/{entry_id}.mp3"
                asset_source = "hard_word_generated"
                profile_id = PROFILE_ID
                generation_profile_sha256 = profile_sha256

            binding_payload = {
                "accent": accent,
                "asset_source": asset_source,
                "catalog_id": CATALOG_ID,
                "entry_id": entry_id,
                "generation_profile": profile_id,
                "generation_profile_sha256": generation_profile_sha256,
                "kind": "word",
                "path": relative_path,
                "text_sha256": sha256_text(headword),
                "voice": voice,
            }
            binding_sha256 = sha256_text(canonical_json(binding_payload))

            links.append(
                {
                    "accent": accent,
                    "asset_source": asset_source,
                    "binding_sha256": binding_sha256,
                    "entry_id": entry_id,
                    "generation_profile": profile_id,
                    "generation_profile_sha256": generation_profile_sha256,
                    "headword": headword,
                    "kind": "word",
                    "path": relative_path,
                    "src": f"./audio/{relative_path}",
                    "text_sha256": sha256_text(headword),
                    "voice": voice,
                }
            )
    return links


def generated_specs(
    catalog_file: Path = CATALOG_FILE,
    reviewed_manifest_file: Path = REVIEWED_AUDIO_MANIFEST_FILE,
) -> list[dict[str, Any]]:
    return [
        link
        for link in expected_audio_links(catalog_file, reviewed_manifest_file)
        if link["asset_source"] == "hard_word_generated"
    ]


def expected_generated_paths(
    catalog_file: Path = CATALOG_FILE,
    reviewed_manifest_file: Path = REVIEWED_AUDIO_MANIFEST_FILE,
) -> set[str]:
    prefix = "hard-words/"
    return {
        str(link["path"])[len(prefix) :]
        for link in generated_specs(catalog_file, reviewed_manifest_file)
    }


def repository_generated_paths(
    hard_word_audio_root: Path = HARD_WORD_AUDIO_ROOT,
) -> set[str]:
    if not hard_word_audio_root.exists():
        return set()
    return {
        path.relative_to(hard_word_audio_root).as_posix()
        for path in hard_word_audio_root.rglob("*.mp3")
    }


def require_exact_generated_coverage(
    hard_word_audio_root: Path = HARD_WORD_AUDIO_ROOT,
    catalog_file: Path = CATALOG_FILE,
    reviewed_manifest_file: Path = REVIEWED_AUDIO_MANIFEST_FILE,
) -> None:
    expected = expected_generated_paths(catalog_file, reviewed_manifest_file)
    actual = repository_generated_paths(hard_word_audio_root)
    missing = sorted(expected - actual)
    unexpected = sorted(actual - expected)
    if missing or unexpected:
        detail = []
        if missing:
            detail.append(f"missing {len(missing)}: {', '.join(missing[:3])}")
        if unexpected:
            detail.append(f"unexpected {len(unexpected)}: {', '.join(unexpected[:3])}")
        raise HardWordAudioError("Hard-word audio coverage mismatch; " + "; ".join(detail))


def _verify_reviewed_reference(
    link: dict[str, Any],
    reviewed_by_path: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    path = str(link["path"])
    reviewed = reviewed_by_path.get(path)
    asset_path = AUDIO_ROOT / path
    if reviewed is None or not asset_path.is_file():
        raise HardWordAudioError(f"Missing reviewed audio reference: {path}")
    if (
        reviewed.get("kind") != "word"
        or reviewed.get("voice") != link["voice"]
        or reviewed.get("text_sha256") != link["text_sha256"]
        or reviewed.get("generation_profile") != link["generation_profile"]
        or reviewed.get("generation_profile_sha256")
        != link["generation_profile_sha256"]
    ):
        raise HardWordAudioError(f"Reviewed audio binding changed: {path}")
    if reviewed.get("audio_sha256") != sha256_file(asset_path):
        raise HardWordAudioError(f"Reviewed audio hash changed: {path}")
    if reviewed.get("bytes") != asset_path.stat().st_size:
        raise HardWordAudioError(f"Reviewed audio size changed: {path}")
    return {
        "audioSha256": reviewed["audio_sha256"],
        "bytes": reviewed["bytes"],
        "channels": reviewed["channels"],
        "codec": reviewed["codec"],
        "durationSeconds": reviewed["duration_seconds"],
        "sampleRateHz": reviewed["sample_rate_hz"],
    }


def _inspect_generated(link: dict[str, Any]) -> dict[str, Any]:
    path = AUDIO_ROOT / str(link["path"])
    if not path.is_file():
        raise HardWordAudioError(f"Missing generated hard-word audio: {path}")
    probe = probe_audio(path)
    expected_profile = generation_profile()["parameters"]
    for field in ("channels", "codec", "sample_rate_hz"):
        if probe[field] != expected_profile[field]:
            raise HardWordAudioError(
                f"{path} has {field}={probe[field]!r}; expected {expected_profile[field]!r}"
            )
    return {
        "audioSha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "channels": probe["channels"],
        "codec": probe["codec"],
        "durationSeconds": probe["duration_seconds"],
        "sampleRateHz": probe["sample_rate_hz"],
    }


def build_manifest(
    catalog_file: Path = CATALOG_FILE,
    hard_word_audio_root: Path = HARD_WORD_AUDIO_ROOT,
    reviewed_manifest_file: Path = REVIEWED_AUDIO_MANIFEST_FILE,
) -> dict[str, Any]:
    require_exact_generated_coverage(
        hard_word_audio_root, catalog_file, reviewed_manifest_file
    )
    catalog = load_catalog(catalog_file)
    reviewed_manifest = load_reviewed_audio_manifest(reviewed_manifest_file)
    reviewed_by_path = {
        str(item["path"]): item for item in reviewed_manifest.get("entries", [])
    }
    links = expected_audio_links(catalog_file, reviewed_manifest_file)
    by_entry: dict[str, dict[str, Any]] = {
        str(entry["id"]): {
            "audio": {},
            "entryId": str(entry["id"]),
            "headword": str(entry["displayWord"]),
            "lexicalReview": {
                "sourceAudited": entry["reviewStatus"]
                == "source_audited_for_rescue",
                "status": str(entry["reviewStatus"]),
            },
        }
        for entry in catalog["entries"]
    }
    shared_headwords: set[str] = set()
    generated_headwords: set[str] = set()
    for link in links:
        if link["asset_source"] == "shared_reviewed_word":
            measurements = _verify_reviewed_reference(link, reviewed_by_path)
            shared_headwords.add(str(link["entry_id"]))
        else:
            measurements = _inspect_generated(link)
            generated_headwords.add(str(link["entry_id"]))
        by_entry[str(link["entry_id"])]["audio"][str(link["accent"])] = {
            "accent": link["accent"],
            "assetSource": link["asset_source"],
            "bindingSha256": link["binding_sha256"],
            "generationProfile": link["generation_profile"],
            "generationProfileSha256": link["generation_profile_sha256"],
            "kind": "word",
            "path": link["path"],
            "src": link["src"],
            "textSha256": link["text_sha256"],
            "voice": link["voice"],
            **measurements,
        }

    if len(shared_headwords) != EXPECTED_SHARED_HEADWORD_COUNT:
        raise HardWordAudioError(
            f"Expected {EXPECTED_SHARED_HEADWORD_COUNT} shared headwords; "
            f"found {len(shared_headwords)}"
        )
    if len(generated_headwords) != EXPECTED_GENERATED_HEADWORD_COUNT:
        raise HardWordAudioError(
            f"Expected {EXPECTED_GENERATED_HEADWORD_COUNT} generated headwords; "
            f"found {len(generated_headwords)}"
        )

    return {
        "catalog": {
            "catalogId": catalog["catalogId"],
            "entryCount": len(catalog["entries"]),
            "path": "public/ielts/corpus/student-hard-words.json",
            "sha256": catalog_sha256(catalog_file),
        },
        "coverage": {
            "accents": len(REVIEWED_VOICES),
            "audioLinks": len(links),
            "generatedFiles": len(repository_generated_paths(hard_word_audio_root)),
            "generatedHeadwords": len(generated_headwords),
            "headwords": len(by_entry),
            "sharedAudioLinks": len(shared_headwords) * len(REVIEWED_VOICES),
            "sharedHeadwords": len(shared_headwords),
            "sourceAuditedHeadwords": sum(
                1
                for entry in catalog["entries"]
                if entry["reviewStatus"] == "source_audited_for_rescue"
            ),
        },
        "entries": list(by_entry.values()),
        "generationProfile": {
            "appliesToAssetSource": "hard_word_generated",
            "id": PROFILE_ID,
            **generation_profile(),
        },
        "privacy": {
            "containsLearnerIdentity": False,
            "generatedTextSentToExternalService": False,
            "lexicalAnswerFieldsIncluded": False,
        },
        "provenance": {
            "assurance": "text-voice-profile-and-file-integrity",
            "generatedAudioOrigin": (
                "Generated locally with macOS say using installed Daniel and Samantha "
                "voices; no hard-word text is sent to an external speech service."
            ),
            "limitation": (
                "The manifest verifies text, voice contract, and audio-file integrity. "
                "It does not provide senses, parts of speech, IPA, or a human judgment "
                "of pronunciation naturalness."
            ),
            "sharedAudioOrigin": (
                "Exact-match reviewed words reuse the existing Sonia/Ava Edge assets "
                "and retain their original voice and generation profile."
            ),
        },
        "schemaVersion": SCHEMA_VERSION,
    }


def render_manifest(manifest: dict[str, Any]) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_manifest(
    manifest: dict[str, Any],
    manifest_file: Path = HARD_WORD_AUDIO_MANIFEST_FILE,
) -> None:
    manifest_file.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=manifest_file.parent,
        prefix=".manifest-",
        suffix=".json",
        delete=False,
    ) as output:
        output.write(render_manifest(manifest))
        temporary = Path(output.name)
    temporary.replace(manifest_file)


def load_manifest(
    manifest_file: Path = HARD_WORD_AUDIO_MANIFEST_FILE,
) -> dict[str, Any]:
    try:
        return json.loads(manifest_file.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise HardWordAudioError(f"Missing hard-word audio manifest: {manifest_file}") from error
    except json.JSONDecodeError as error:
        raise HardWordAudioError(f"Invalid hard-word audio manifest JSON: {error}") from error


def validate_manifest_schema(manifest: dict[str, Any]) -> None:
    """Validate the public loader contract before comparing file evidence."""

    def exact_keys(value: Any, keys: set[str], label: str) -> None:
        if not isinstance(value, dict) or set(value) != keys:
            raise HardWordAudioError(f"Invalid {label} fields")

    exact_keys(
        manifest,
        {
            "catalog",
            "coverage",
            "entries",
            "generationProfile",
            "privacy",
            "provenance",
            "schemaVersion",
        },
        "manifest",
    )
    if not type_strict_equal(manifest["schemaVersion"], SCHEMA_VERSION):
        raise HardWordAudioError("Unsupported hard-word audio manifest schema")
    exact_keys(
        manifest["catalog"], {"catalogId", "entryCount", "path", "sha256"}, "catalog"
    )
    exact_keys(
        manifest["coverage"],
        {
            "accents",
            "audioLinks",
            "generatedFiles",
            "generatedHeadwords",
            "headwords",
            "sharedAudioLinks",
            "sharedHeadwords",
            "sourceAuditedHeadwords",
        },
        "coverage",
    )
    catalog = manifest["catalog"]
    if (
        catalog["catalogId"] != CATALOG_ID
        or not type_strict_equal(catalog["entryCount"], EXPECTED_HEADWORD_COUNT)
        or catalog["path"] != "public/ielts/corpus/student-hard-words.json"
        or not isinstance(catalog["sha256"], str)
        or len(catalog["sha256"]) != 64
    ):
        raise HardWordAudioError("Invalid hard-word catalog binding")
    expected_coverage = {
        "accents": len(REVIEWED_VOICES),
        "audioLinks": EXPECTED_HEADWORD_COUNT * len(REVIEWED_VOICES),
        "generatedFiles": EXPECTED_GENERATED_HEADWORD_COUNT * len(REVIEWED_VOICES),
        "generatedHeadwords": EXPECTED_GENERATED_HEADWORD_COUNT,
        "headwords": EXPECTED_HEADWORD_COUNT,
        "sharedAudioLinks": EXPECTED_SHARED_HEADWORD_COUNT * len(REVIEWED_VOICES),
        "sharedHeadwords": EXPECTED_SHARED_HEADWORD_COUNT,
        "sourceAuditedHeadwords": EXPECTED_SOURCE_AUDITED_HEADWORD_COUNT,
    }
    if not type_strict_equal(manifest["coverage"], expected_coverage):
        raise HardWordAudioError("Invalid hard-word audio manifest coverage")
    entries = manifest["entries"]
    if not isinstance(entries, list) or len(entries) != EXPECTED_HEADWORD_COUNT:
        raise HardWordAudioError("Invalid hard-word audio entry count")
    entry_ids: set[str] = set()
    headwords: set[str] = set()
    audited = 0
    shared_links = 0
    generated_links = 0
    audio_keys = {
        "accent",
        "assetSource",
        "audioSha256",
        "bindingSha256",
        "bytes",
        "channels",
        "codec",
        "durationSeconds",
        "generationProfile",
        "generationProfileSha256",
        "kind",
        "path",
        "sampleRateHz",
        "src",
        "textSha256",
        "voice",
    }
    for entry in entries:
        exact_keys(entry, {"audio", "entryId", "headword", "lexicalReview"}, "entry")
        entry_id = entry["entryId"]
        headword = entry["headword"]
        if (
            not isinstance(entry_id, str)
            or not entry_id
            or entry_id in entry_ids
            or not isinstance(headword, str)
            or not headword
            or headword.casefold() in headwords
        ):
            raise HardWordAudioError("Duplicate or invalid manifest entry identity")
        entry_ids.add(entry_id)
        headwords.add(headword.casefold())
        review = entry["lexicalReview"]
        exact_keys(review, {"sourceAudited", "status"}, "lexicalReview")
        if review["status"] not in REVIEW_STATUSES or not isinstance(
            review["sourceAudited"], bool
        ):
            raise HardWordAudioError("Invalid lexical review metadata")
        if review["sourceAudited"] != (
            review["status"] == "source_audited_for_rescue"
        ):
            raise HardWordAudioError("Lexical audit flag and status disagree")
        audited += int(review["sourceAudited"])
        exact_keys(entry["audio"], set(REVIEWED_VOICES), "audio accents")
        for accent in REVIEWED_VOICES:
            audio = entry["audio"][accent]
            exact_keys(audio, audio_keys, "audio")
            path = str(audio["path"])
            if (
                audio["accent"] != accent
                or audio["kind"] != "word"
                or audio["codec"] != "mp3"
                or not type_strict_equal(audio["channels"], 1)
                or not type_strict_equal(audio["sampleRateHz"], 24_000)
                or audio["src"] != f"./audio/{path}"
                or audio["textSha256"] != sha256_text(headword)
                or audio["assetSource"]
                not in {"hard_word_generated", "shared_reviewed_word"}
                or type(audio["bytes"]) is not int
                or audio["bytes"] <= 0
                or not finite_number(audio["durationSeconds"])
                or audio["durationSeconds"] <= 0
            ):
                raise HardWordAudioError("Invalid audio entry contract")
            if audio["assetSource"] == "shared_reviewed_word":
                shared_links += 1
                if (
                    audio["voice"] != REVIEWED_VOICES[accent]
                    or not path.startswith(f"{accent}/")
                    or audio["generationProfile"] != REVIEWED_WORD_PROFILE_ID
                    or audio["generationProfileSha256"]
                    != REVIEWED_WORD_PROFILE_SHA256
                ):
                    raise HardWordAudioError("Shared audio escaped its accent namespace")
            else:
                generated_links += 1
                if (
                    audio["voice"] != GENERATED_VOICES[accent]
                    or audio["generationProfile"] != PROFILE_ID
                    or audio["generationProfileSha256"]
                    != sha256_text(canonical_json(generation_profile()))
                    or path != f"hard-words/{accent}/{entry_id}.mp3"
                ):
                    raise HardWordAudioError("Generated audio path is not catalog-bound")
    if audited != EXPECTED_SOURCE_AUDITED_HEADWORD_COUNT:
        raise HardWordAudioError("Invalid source-audited entry count")
    if (
        shared_links != EXPECTED_SHARED_HEADWORD_COUNT * len(REVIEWED_VOICES)
        or generated_links != EXPECTED_GENERATED_HEADWORD_COUNT * len(REVIEWED_VOICES)
    ):
        raise HardWordAudioError("Invalid shared/generated audio split")
    exact_keys(
        manifest["generationProfile"],
        {
            "id",
            "appliesToAssetSource",
            "parameters",
            "pipelineVersion",
            "synthesisEngine",
            "synthesisEngineVersion",
        },
        "generationProfile",
    )
    profile = manifest["generationProfile"]
    expected_profile = {
        "appliesToAssetSource": "hard_word_generated",
        "id": PROFILE_ID,
        **generation_profile(),
    }
    if not type_strict_equal(profile, expected_profile):
        raise HardWordAudioError("Invalid hard-word generation profile")
    exact_keys(
        manifest["privacy"],
        {
            "containsLearnerIdentity",
            "generatedTextSentToExternalService",
            "lexicalAnswerFieldsIncluded",
        },
        "privacy",
    )
    if not type_strict_equal(
        manifest["privacy"],
        {
            "containsLearnerIdentity": False,
            "generatedTextSentToExternalService": False,
            "lexicalAnswerFieldsIncluded": False,
        },
    ):
        raise HardWordAudioError("Hard-word manifest privacy declaration changed")
    exact_keys(
        manifest["provenance"],
        {"assurance", "generatedAudioOrigin", "limitation", "sharedAudioOrigin"},
        "provenance",
    )


def manifest_drift_messages(
    committed: dict[str, Any],
    current: dict[str, Any],
) -> list[str]:
    """Compare manifests while tolerating only cross-ffprobe duration drift."""

    if type_strict_equal(committed, current):
        return []

    messages: list[str] = []
    top_level_keys = set(committed) | set(current)
    for field in sorted(top_level_keys - {"entries"}):
        if field not in committed or field not in current:
            messages.append(f"manifest field presence changed: {field}")
        elif not type_strict_equal(committed[field], current[field]):
            messages.append(f"manifest field changed: {field}")

    old_entries = committed.get("entries")
    new_entries = current.get("entries")
    if not isinstance(old_entries, list) or not isinstance(new_entries, list):
        messages.append("manifest entries are not lists")
    elif len(old_entries) != len(new_entries):
        messages.append(
            f"manifest entry count changed: {len(old_entries)}->{len(new_entries)}"
        )
    else:
        for index, (old_entry, new_entry) in enumerate(zip(old_entries, new_entries)):
            if not isinstance(old_entry, dict) or not isinstance(new_entry, dict):
                if not type_strict_equal(old_entry, new_entry):
                    messages.append(f"manifest entry changed at index {index}")
                continue

            entry_id = old_entry.get("entryId", f"index-{index}")
            entry_fields = (set(old_entry) | set(new_entry)) - {"audio"}
            changed_entry_fields = [
                field
                for field in sorted(entry_fields)
                if field not in old_entry
                or field not in new_entry
                or not type_strict_equal(old_entry[field], new_entry[field])
            ]
            if changed_entry_fields:
                messages.append(
                    f"{entry_id} changed entry fields: "
                    + ", ".join(changed_entry_fields)
                )

            old_audio = old_entry.get("audio")
            new_audio = new_entry.get("audio")
            if not isinstance(old_audio, dict) or not isinstance(new_audio, dict):
                if not type_strict_equal(old_audio, new_audio):
                    messages.append(f"{entry_id} changed audio container")
                continue
            if set(old_audio) != set(new_audio):
                messages.append(f"{entry_id} changed audio accents")
                continue

            for accent in sorted(old_audio):
                old_link = old_audio[accent]
                new_link = new_audio[accent]
                if not isinstance(old_link, dict) or not isinstance(new_link, dict):
                    if not type_strict_equal(old_link, new_link):
                        messages.append(f"{entry_id}/{accent} changed audio link")
                    continue

                changed_audio_fields = {
                    field
                    for field in set(old_link) | set(new_link)
                    if field != "durationSeconds"
                    and (
                        field not in old_link
                        or field not in new_link
                        or not type_strict_equal(old_link[field], new_link[field])
                    )
                }
                old_duration = old_link.get("durationSeconds")
                new_duration = new_link.get("durationSeconds")
                if not finite_number(old_duration) or not finite_number(new_duration):
                    changed_audio_fields.add("durationSeconds")
                else:
                    difference = abs(
                        Decimal(str(old_duration)) - Decimal(str(new_duration))
                    )
                    if difference > Decimal(str(DURATION_DRIFT_TOLERANCE_SECONDS)):
                        changed_audio_fields.add("durationSeconds")

                if changed_audio_fields:
                    messages.append(
                        f"{entry_id}/{accent} changed audio fields: "
                        + ", ".join(sorted(changed_audio_fields))
                    )

    if messages:
        messages.insert(
            0,
            "Hard-word audio manifest differs from catalog/assets/generation contract",
        )
    return messages


def compare_manifest(
    manifest_file: Path = HARD_WORD_AUDIO_MANIFEST_FILE,
    catalog_file: Path = CATALOG_FILE,
    hard_word_audio_root: Path = HARD_WORD_AUDIO_ROOT,
    reviewed_manifest_file: Path = REVIEWED_AUDIO_MANIFEST_FILE,
) -> list[str]:
    try:
        committed = load_manifest(manifest_file)
        validate_manifest_schema(committed)
        current = build_manifest(
            catalog_file, hard_word_audio_root, reviewed_manifest_file
        )
    except (HardWordAudioError, RuntimeError) as error:
        return [str(error)]
    return manifest_drift_messages(committed, current)


def reusable_generated_asset(
    spec: dict[str, Any],
    manifest_entry: dict[str, Any] | None,
) -> bool:
    if not manifest_entry:
        return False
    path = AUDIO_ROOT / str(spec["path"])
    if not path.is_file():
        return False
    required = {
        "assetSource": "hard_word_generated",
        "bindingSha256": spec["binding_sha256"],
        "generationProfile": spec["generation_profile"],
        "generationProfileSha256": spec["generation_profile_sha256"],
        "kind": "word",
        "src": spec["src"],
        "textSha256": spec["text_sha256"],
        "voice": spec["voice"],
    }
    if any(manifest_entry.get(field) != value for field, value in required.items()):
        return False
    if manifest_entry.get("bytes") != path.stat().st_size:
        return False
    return manifest_entry.get("audioSha256") == sha256_file(path)


def flattened_manifest_audio_index(
    manifest: dict[str, Any],
) -> dict[tuple[str, str], dict[str, Any]]:
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in manifest.get("entries", []):
        for accent, audio in entry.get("audio", {}).items():
            result[(str(entry.get("entryId")), str(accent))] = audio
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build or verify the learner hard-word audio manifest."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--build", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        if args.build:
            manifest = build_manifest()
            write_manifest(manifest)
            print(
                f"Wrote {HARD_WORD_AUDIO_MANIFEST_FILE} with "
                f"{manifest['coverage']['audioLinks']} audio links"
            )
            return
        messages = compare_manifest()
        if messages:
            for message in messages:
                print(f"ERROR: {message}")
            raise SystemExit(1)
        print(
            "Hard-word audio manifest is current: "
            f"{EXPECTED_HEADWORD_COUNT}/{EXPECTED_HEADWORD_COUNT} headwords, "
            f"{EXPECTED_HEADWORD_COUNT * len(REVIEWED_VOICES)} audio links verified"
        )
    except (HardWordAudioError, RuntimeError) as error:
        print(f"ERROR: {error}")
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
