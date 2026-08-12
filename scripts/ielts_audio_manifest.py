#!/usr/bin/env python3
"""Build and verify the IELTS audio asset manifest.

The manifest binds each checked-in MP3 to the exact vocabulary text and the
generation contract that is expected to have produced it.  It deliberately
contains no absolute paths, timestamps, or host-specific tool metadata.
Hashes and binding fields are compared exactly; decoded duration and EBU R128
measurements use small tolerances because FFmpeg releases can report the same
MP3 bytes slightly differently.

This is an integrity/provenance gate.  A matching voice name in the manifest is
not acoustic or biometric proof that a recording sounds natural or that a
particular speaker produced it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
VOCABULARY_FILE = ROOT / "public" / "ielts" / "vocabulary.js"
LISTENING_VOCABULARY_FILE = (
    ROOT / "public" / "ielts" / "listening-vocabulary.js"
)
RESCUE_VOCABULARY_FILE = ROOT / "public" / "ielts" / "rescue-vocabulary.js"
AUDIO_ROOT = ROOT / "public" / "ielts" / "audio"
MANIFEST_FILE = AUDIO_ROOT / "manifest.json"

SCHEMA_VERSION = 1
PIPELINE_VERSION = "2026-07-30.1"
SYNTHESIS_ENGINE = "edge-tts"
SYNTHESIS_ENGINE_VERSION = "7.2.8"
VOICES = {
    "uk": "en-GB-SoniaNeural",
    "us": "en-US-AvaNeural",
}
COMMON_PARAMETERS = {
    "channels": 1,
    "closing_silence_seconds": 0.3,
    "codec": "mp3",
    "edge_tts_pitch": "+0Hz",
    "edge_tts_rate": "+0%",
    "edge_tts_volume": "+0%",
    "ffmpeg_quality": 2,
    "opening_silence_seconds": 0.7,
    "sample_rate_hz": 24_000,
}
PROFILE_PARAMETERS = {
    "word": {
        **COMMON_PARAMETERS,
        "between_repetitions_seconds": 0.55,
        "repeat_count": 3,
    },
    "sentence": {
        **COMMON_PARAMETERS,
        "repeat_count": 1,
    },
}
DURATION_DRIFT_TOLERANCE_SECONDS = 0.1
LUFS_DRIFT_TOLERANCE_DB = 1.0
MIN_PLAYBACK_LUFS = -26.0
MAX_PLAYBACK_LUFS = -15.0


class AudioManifestError(RuntimeError):
    """Raised when an audio manifest cannot be built or verified."""


def canonical_json(value: Any) -> str:
    """Return the stable JSON representation used for all manifest signatures."""

    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    return sha256_bytes(value.encode("utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def profile_id(kind: str) -> str:
    return f"edge-tts-{kind}-{PIPELINE_VERSION}"


def generation_profiles() -> dict[str, dict[str, Any]]:
    return {
        profile_id(kind): {
            "parameters": PROFILE_PARAMETERS[kind],
            "pipeline_version": PIPELINE_VERSION,
            "synthesis_engine": SYNTHESIS_ENGINE,
            "synthesis_engine_version": SYNTHESIS_ENGINE_VERSION,
        }
        for kind in ("word", "sentence")
    }


def read_vocabulary(
    vocabulary_file: Path = VOCABULARY_FILE,
    supplementary_file: Path = LISTENING_VOCABULARY_FILE,
    rescue_file: Path = RESCUE_VOCABULARY_FILE,
) -> list[dict[str, str]]:
    """Read the executable vocabulary data without duplicating its contents."""

    if not shutil.which("node"):
        raise AudioManifestError("Node.js is required to read vocabulary.js")
    extractor = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), context);
if (process.argv[2] && fs.existsSync(process.argv[2])) {
  vm.runInNewContext(fs.readFileSync(process.argv[2], 'utf8'), context);
}
if (process.argv[3] && fs.existsSync(process.argv[3])) {
  vm.runInNewContext(fs.readFileSync(process.argv[3], 'utf8'), context);
}
const activeVocabulary = Array.isArray(context.window.IELTS_VOCABULARY)
  ? context.window.IELTS_VOCABULARY
  : [];
const rescueVocabulary = Array.isArray(context.window.IELTS_RESCUE_VOCABULARY)
  ? context.window.IELTS_RESCUE_VOCABULARY
  : [];
const entries = [...activeVocabulary, ...rescueVocabulary].map((entry) => ({
  id: entry.id,
  word: entry.word,
  sentence: entry.chunks.join(' ').replace(/\s+([,.;!?])/g, '$1'),
}));
process.stdout.write(JSON.stringify(entries));
"""
    result = subprocess.run(
        [
            "node",
            "-e",
            extractor,
            str(vocabulary_file),
            str(supplementary_file),
            str(rescue_file),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    entries = json.loads(result.stdout)
    if not entries:
        raise AudioManifestError("Vocabulary is empty")
    if len({entry["id"] for entry in entries}) != len(entries):
        raise AudioManifestError("Vocabulary IDs must be unique")
    if any(not entry.get("word") or not entry.get("sentence") for entry in entries):
        raise AudioManifestError(
            "Every vocabulary entry needs a word and an example sentence"
        )
    return entries


def expected_assets(
    vocabulary_file: Path = VOCABULARY_FILE,
) -> list[dict[str, Any]]:
    """Return the stable text/voice/generation contracts for every word."""

    specs: list[dict[str, Any]] = []
    vocabulary = read_vocabulary(vocabulary_file)
    profiles = generation_profiles()
    for accent, voice in VOICES.items():
        for entry in vocabulary:
            for kind, text_key in (("word", "word"), ("sentence", "sentence")):
                suffix = "_sentence" if kind == "sentence" else ""
                text = entry[text_key]
                profile = profile_id(kind)
                binding_payload = {
                    "accent": accent,
                    "generation_profile": profile,
                    "generation_profile_sha256": sha256_text(
                        canonical_json(profiles[profile])
                    ),
                    "kind": kind,
                    "pipeline_version": PIPELINE_VERSION,
                    "synthesis_engine_version": SYNTHESIS_ENGINE_VERSION,
                    "text_sha256": sha256_text(text),
                    "voice": voice,
                    "word_id": entry["id"],
                }
                specs.append(
                    {
                        **binding_payload,
                        "binding_sha256": sha256_text(
                            canonical_json(binding_payload)
                        ),
                        "path": f"{accent}/{entry['id']}{suffix}.mp3",
                        "text": text,
                        "text_utf8_bytes": len(text.encode("utf-8")),
                    }
                )
    return sorted(specs, key=lambda item: item["path"])


def expected_asset_paths(
    vocabulary_file: Path = VOCABULARY_FILE,
) -> set[str]:
    return {item["path"] for item in expected_assets(vocabulary_file)}


def repository_audio_paths(audio_root: Path = AUDIO_ROOT) -> set[str]:
    return {
        path.relative_to(audio_root).as_posix()
        for path in audio_root.rglob("*.mp3")
        if path.is_file()
    }


def require_exact_coverage(
    audio_root: Path = AUDIO_ROOT,
    vocabulary_file: Path = VOCABULARY_FILE,
) -> None:
    expected = expected_asset_paths(vocabulary_file)
    actual = repository_audio_paths(audio_root)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    messages = []
    if missing:
        messages.append(f"missing MP3 files: {', '.join(missing)}")
    if extra:
        messages.append(f"unexpected MP3 files: {', '.join(extra)}")
    if messages:
        raise AudioManifestError("; ".join(messages))


def _run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def probe_audio(path: Path) -> dict[str, Any]:
    """Return duration, format, channel, and byte metadata from ffprobe."""

    if not shutil.which("ffprobe"):
        raise AudioManifestError("ffprobe is required to inspect audio duration")
    payload = _run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size:stream=codec_name,sample_rate,channels",
            "-of",
            "json",
            str(path),
        ]
    )
    try:
        audio_stream = next(
            stream
            for stream in payload["streams"]
            if stream.get("codec_name") == "mp3"
        )
        probe = {
            "channels": int(audio_stream["channels"]),
            "codec": str(audio_stream["codec_name"]),
            "duration_seconds": round(float(payload["format"]["duration"]), 6),
            "probed_bytes": int(payload["format"]["size"]),
            "sample_rate_hz": int(audio_stream["sample_rate"]),
        }
    except (KeyError, StopIteration, TypeError, ValueError) as error:
        raise AudioManifestError(f"Invalid ffprobe result for {path}") from error
    if probe["duration_seconds"] <= 0 or probe["probed_bytes"] <= 0:
        raise AudioManifestError(f"Invalid audio metrics for {path}")
    return probe


_LUFS_PATTERN = re.compile(r"I:\s+(-?inf|-?\d+(?:\.\d+)?)\s+LUFS")


def measure_integrated_lufs(path: Path) -> float | None:
    """Measure EBU R128 integrated loudness when ffmpeg is available."""

    if not shutil.which("ffmpeg"):
        raise AudioManifestError(
            "ffmpeg is required to reproduce the committed LUFS measurements"
        )
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-filter_complex",
            "ebur128=framelog=verbose",
            "-f",
            "null",
            "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    matches = _LUFS_PATTERN.findall(result.stderr)
    if not matches or matches[-1] == "-inf":
        return None
    return round(float(matches[-1]), 1)


def inspect_asset(path: Path, kind: str) -> dict[str, Any]:
    probe = probe_audio(path)
    actual_size = path.stat().st_size
    if probe["probed_bytes"] != actual_size:
        raise AudioManifestError(
            f"ffprobe size mismatch for {path}: "
            f"{probe['probed_bytes']} != {actual_size}"
        )
    parameters = PROFILE_PARAMETERS[kind]
    for field in ("channels", "codec", "sample_rate_hz"):
        if probe[field] != parameters[field]:
            raise AudioManifestError(
                f"{path} has {field}={probe[field]!r}; "
                f"expected {parameters[field]!r}"
            )
    return {
        "audio_sha256": sha256_file(path),
        "bytes": actual_size,
        "channels": probe["channels"],
        "codec": probe["codec"],
        "duration_seconds": probe["duration_seconds"],
        "integrated_lufs": measure_integrated_lufs(path),
        "sample_rate_hz": probe["sample_rate_hz"],
    }


def build_manifest(
    audio_root: Path = AUDIO_ROOT,
    vocabulary_file: Path = VOCABULARY_FILE,
) -> dict[str, Any]:
    """Build the complete deterministic manifest from repository assets."""

    require_exact_coverage(audio_root, vocabulary_file)
    profiles = generation_profiles()
    entries = []
    for spec in expected_assets(vocabulary_file):
        entries.append(
            {
                **spec,
                **inspect_asset(audio_root / spec["path"], spec["kind"]),
            }
        )
    return {
        "asset_root": "public/ielts/audio",
        "coverage": {
            "accents": len(VOICES),
            "assets": len(entries),
            "kinds_per_word": 2,
            "words": len(entries) // (len(VOICES) * 2),
        },
        "entries": entries,
        "generation_profiles": profiles,
        "provenance": {
            "assurance": "repository-contract-and-file-integrity",
            "limitation": (
                "Voice and profile fields record the generation contract; "
                "they do not acoustically certify speaker identity or naturalness."
            ),
        },
        "schema_version": SCHEMA_VERSION,
    }


def render_manifest(manifest: dict[str, Any]) -> str:
    return json.dumps(
        manifest,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"


def write_manifest(
    manifest: dict[str, Any],
    manifest_file: Path = MANIFEST_FILE,
) -> None:
    """Write atomically so an interrupted check/generation cannot truncate it."""

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


def bootstrap_manifest(
    manifest: dict[str, Any],
    manifest_file: Path = MANIFEST_FILE,
) -> None:
    """Create the first manifest, but never re-bind an existing asset silently."""

    if manifest_file.exists():
        raise AudioManifestError(
            f"Refusing to replace existing manifest: {manifest_file}. "
            "Run generate_ielts_audio.py so stale text/voice/profile bindings "
            "cause synthesis instead of being accepted as current."
        )
    write_manifest(manifest, manifest_file)


def load_manifest(manifest_file: Path = MANIFEST_FILE) -> dict[str, Any]:
    try:
        return json.loads(manifest_file.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise AudioManifestError(f"Missing audio manifest: {manifest_file}") from error
    except json.JSONDecodeError as error:
        raise AudioManifestError(f"Invalid audio manifest JSON: {error}") from error


def manifest_drift_messages(
    committed: dict[str, Any],
    current: dict[str, Any],
) -> list[str]:
    """Compare manifests, keeping integrity exact and probes version-tolerant."""

    if committed == current:
        return []

    messages = []
    for field in sorted((set(committed) | set(current)) - {"entries"}):
        if committed.get(field) != current.get(field):
            messages.append(f"manifest field changed: {field}")

    committed_entries = {
        item.get("path"): item for item in committed.get("entries", [])
    }
    current_entries = {item["path"]: item for item in current["entries"]}
    for path in sorted(set(committed_entries) | set(current_entries)):
        old = committed_entries.get(path)
        new = current_entries.get(path)
        if old is None:
            messages.append(f"manifest is missing entry: {path}")
        elif new is None:
            messages.append(f"manifest has unexpected entry: {path}")
        elif old != new:
            changed = {
                key
                for key in set(old) | set(new)
                if key not in {"duration_seconds", "integrated_lufs"}
                if old.get(key) != new.get(key)
            }

            old_duration = old.get("duration_seconds")
            new_duration = new.get("duration_seconds")
            if not isinstance(old_duration, (int, float)) or not isinstance(
                new_duration, (int, float)
            ):
                if old_duration != new_duration:
                    changed.add("duration_seconds")
            elif (
                abs(float(old_duration) - float(new_duration))
                > DURATION_DRIFT_TOLERANCE_SECONDS
            ):
                changed.add("duration_seconds")

            old_lufs = old.get("integrated_lufs")
            new_lufs = new.get("integrated_lufs")
            if old_lufs is None or new_lufs is None:
                if old_lufs != new_lufs:
                    changed.add("integrated_lufs")
            elif not isinstance(old_lufs, (int, float)) or not isinstance(
                new_lufs, (int, float)
            ):
                changed.add("integrated_lufs")
            elif (
                abs(float(old_lufs) - float(new_lufs))
                > LUFS_DRIFT_TOLERANCE_DB
                or not MIN_PLAYBACK_LUFS <= float(new_lufs) <= MAX_PLAYBACK_LUFS
            ):
                changed.add("integrated_lufs")

            if changed:
                observed = ", ".join(
                    f"{field}={old.get(field)!r}->{new.get(field)!r}"
                    for field in sorted(changed)
                )
                messages.append(
                    f"{path} changed fields: {', '.join(sorted(changed))} "
                    f"({observed})"
                )

    if messages:
        messages.insert(
            0,
            "audio manifest differs from vocabulary/assets/generation contract",
        )
    return messages


def compare_manifest(
    manifest_file: Path = MANIFEST_FILE,
    audio_root: Path = AUDIO_ROOT,
    vocabulary_file: Path = VOCABULARY_FILE,
) -> list[str]:
    """Return drift messages; an empty list means the integrity gate passes."""

    try:
        committed = load_manifest(manifest_file)
        current = build_manifest(audio_root, vocabulary_file)
    except AudioManifestError as error:
        return [str(error)]
    return manifest_drift_messages(committed, current)


def manifest_entry_index(
    manifest: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    return {item["path"]: item for item in manifest.get("entries", [])}


def reusable_asset(
    spec: dict[str, Any],
    manifest_entry: dict[str, Any] | None,
    audio_path: Path,
) -> bool:
    """Allow reuse only when both binding and checked-in bytes still match."""

    if manifest_entry is None or not audio_path.is_file():
        return False
    binding_fields: Iterable[str] = (
        "accent",
        "binding_sha256",
        "generation_profile",
        "generation_profile_sha256",
        "kind",
        "path",
        "pipeline_version",
        "synthesis_engine_version",
        "text",
        "text_sha256",
        "text_utf8_bytes",
        "voice",
        "word_id",
    )
    if any(manifest_entry.get(field) != spec.get(field) for field in binding_fields):
        return False
    if manifest_entry.get("bytes") != audio_path.stat().st_size:
        return False
    return manifest_entry.get("audio_sha256") == sha256_file(audio_path)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build or check the deterministic IELTS audio manifest."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--bootstrap",
        action="store_true",
        help=(
            "create the initial manifest only; refuses to replace an existing "
            "binding"
        ),
    )
    mode.add_argument(
        "--check",
        action="store_true",
        help="offline drift gate; does not synthesize or modify audio",
    )
    args = parser.parse_args()

    try:
        if args.bootstrap:
            manifest = build_manifest()
            bootstrap_manifest(manifest)
            print(f"Wrote {MANIFEST_FILE} with {len(manifest['entries'])} assets")
            return
        messages = compare_manifest()
        if messages:
            for message in messages:
                print(f"ERROR: {message}", file=sys.stderr)
            raise SystemExit(1)
        total = len(expected_assets())
        print(f"IELTS audio manifest is current: {total}/{total} assets verified")
    except (AudioManifestError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
