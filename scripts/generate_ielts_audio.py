#!/usr/bin/env python3
"""Generate reproducible UK/US word and sentence audio for IELTS WordLab.

The cadence intentionally matches the original Grade 8 learning cards:

- Edge neural voices at their natural speaking rate
- 700 ms opening silence and 300 ms closing silence
- isolated words repeated three times with 550 ms inserted between takes
- example sentences spoken once
"""

from __future__ import annotations

import argparse
import asyncio
import importlib
import importlib.metadata
import shutil
import subprocess
import tempfile
from pathlib import Path
from types import ModuleType

from ielts_audio_manifest import (
    AUDIO_ROOT,
    MANIFEST_FILE,
    PIPELINE_VERSION,
    PROFILE_PARAMETERS,
    SYNTHESIS_ENGINE_VERSION,
    build_manifest,
    compare_manifest,
    expected_assets,
    load_manifest,
    manifest_entry_index,
    reusable_asset,
    write_manifest,
)


SAMPLE_RATE = PROFILE_PARAMETERS["word"]["sample_rate_hz"]
OPENING_SILENCE_SECONDS = PROFILE_PARAMETERS["word"][
    "opening_silence_seconds"
]
BETWEEN_WORDS_SECONDS = PROFILE_PARAMETERS["word"][
    "between_repetitions_seconds"
]
CLOSING_SILENCE_SECONDS = PROFILE_PARAMETERS["word"][
    "closing_silence_seconds"
]
CHANNELS = PROFILE_PARAMETERS["word"]["channels"]
FFMPEG_QUALITY = PROFILE_PARAMETERS["word"]["ffmpeg_quality"]
EDGE_TTS_RATE = PROFILE_PARAMETERS["word"]["edge_tts_rate"]
EDGE_TTS_VOLUME = PROFILE_PARAMETERS["word"]["edge_tts_volume"]
EDGE_TTS_PITCH = PROFILE_PARAMETERS["word"]["edge_tts_pitch"]


def assemble_audio(source: Path, output: Path, repeat_word: bool) -> None:
    if repeat_word:
        audio_filter = (
            "[0:a]asplit=3[word1][word2][word3];"
            f"aevalsrc=0:d={OPENING_SILENCE_SECONDS}:s={SAMPLE_RATE}[opening];"
            f"aevalsrc=0:d={BETWEEN_WORDS_SECONDS}:s={SAMPLE_RATE}[gap1];"
            f"aevalsrc=0:d={BETWEEN_WORDS_SECONDS}:s={SAMPLE_RATE}[gap2];"
            f"aevalsrc=0:d={CLOSING_SILENCE_SECONDS}:s={SAMPLE_RATE}[closing];"
            "[opening][word1][gap1][word2][gap2][word3][closing]"
            "concat=n=7:v=0:a=1[out]"
        )
    else:
        audio_filter = (
            f"aevalsrc=0:d={OPENING_SILENCE_SECONDS}:s={SAMPLE_RATE}[opening];"
            f"aevalsrc=0:d={CLOSING_SILENCE_SECONDS}:s={SAMPLE_RATE}[closing];"
            "[opening][0:a][closing]concat=n=3:v=0:a=1[out]"
        )

    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-filter_complex",
            audio_filter,
            "-map",
            "[out]",
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            str(CHANNELS),
            "-q:a",
            str(FFMPEG_QUALITY),
            str(output),
        ],
        check=True,
    )


async def generate_one(
    semaphore: asyncio.Semaphore,
    edge_tts_module: ModuleType,
    spec: dict[str, object],
    build_root: Path,
) -> str:
    accent = str(spec["accent"])
    voice = str(spec["voice"])
    entry_id = str(spec["word_id"])
    text = str(spec["text"])
    kind = str(spec["kind"])
    suffix = "_sentence" if kind == "sentence" else ""
    output = AUDIO_ROOT / accent / f"{entry_id}{suffix}.mp3"
    output.parent.mkdir(parents=True, exist_ok=True)

    async with semaphore:
        raw = build_root / f"{accent}-{entry_id}-{kind}-raw.mp3"
        assembled = build_root / f"{accent}-{entry_id}-{kind}-assembled.mp3"
        communicator = edge_tts_module.Communicate(
            text=text,
            voice=voice,
            rate=EDGE_TTS_RATE,
            volume=EDGE_TTS_VOLUME,
            pitch=EDGE_TTS_PITCH,
        )
        await communicator.save(str(raw))
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, assemble_audio, raw, assembled, kind == "word")
        assembled.replace(output)
    if output.stat().st_size <= 1_000:
        raise RuntimeError(f"Generated audio is unexpectedly small: {output}")
    return f"made {accent}/{entry_id}/{kind}"


async def run(overwrite: bool, concurrency: int) -> None:
    if not shutil.which("node"):
        raise RuntimeError("Node.js is required to read vocabulary.js")

    specs = expected_assets()
    try:
        manifest_entries = manifest_entry_index(load_manifest())
    except RuntimeError:
        manifest_entries = {}
    stale_specs = [
        spec
        for spec in specs
        if overwrite
        or not reusable_asset(
            spec,
            manifest_entries.get(str(spec["path"])),
            AUDIO_ROOT / str(spec["path"]),
        )
    ]

    if stale_specs and not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required to assemble the learning cadence")

    edge_tts_module = None
    if stale_specs:
        try:
            installed_version = importlib.metadata.version("edge-tts")
        except importlib.metadata.PackageNotFoundError as error:
            raise RuntimeError(
                "edge-tts is required to synthesize stale audio assets"
            ) from error
        if installed_version != SYNTHESIS_ENGINE_VERSION:
            raise RuntimeError(
                "Refusing to generate audio with edge-tts "
                f"{installed_version}; this profile requires "
                f"{SYNTHESIS_ENGINE_VERSION}. Update the declared profile and "
                "regenerate intentionally if the engine version changes."
            )
        edge_tts_module = importlib.import_module("edge_tts")

    semaphore = asyncio.Semaphore(concurrency)
    AUDIO_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".ielts-audio-build-", dir=AUDIO_ROOT) as build:
        build_root = Path(build)
        tasks = [
            asyncio.create_task(
                generate_one(
                    semaphore,
                    edge_tts_module,
                    spec,
                    build_root,
                )
            )
            for spec in stale_specs
        ]
        results = []
        for index, task in enumerate(asyncio.as_completed(tasks), start=1):
            results.append(await task)
            if index % 20 == 0 or index == len(tasks):
                print(f"Progress: {index}/{len(tasks)}", flush=True)

    manifest = build_manifest()
    write_manifest(manifest)
    made = len(results)
    reused = len(specs) - made
    print(
        "Audio ready: "
        f"{made} generated, {reused} manifest-verified and reused, "
        f"{len(specs)} total; profile {PIPELINE_VERSION}"
    )
    print(f"Updated {MANIFEST_FILE}")


def check() -> None:
    """Offline integrity gate; never imports edge-tts or contacts its service."""

    messages = compare_manifest()
    if messages:
        for message in messages:
            print(f"ERROR: {message}")
        raise SystemExit(1)
    total = len(expected_assets())
    print(f"IELTS audio manifest is current: {total}/{total} assets verified")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify all audio/text/profile bindings without synthesis or writes",
    )
    parser.add_argument("--concurrency", type=int, default=6)
    args = parser.parse_args()
    if args.check:
        if args.overwrite:
            parser.error("--check and --overwrite cannot be used together")
        check()
        return
    asyncio.run(run(args.overwrite, max(1, min(args.concurrency, 10))))


if __name__ == "__main__":
    main()
