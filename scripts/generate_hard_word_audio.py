#!/usr/bin/env python3
"""Generate UK/US isolated-word audio for the complete hard-word catalog."""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from generate_ielts_audio import assemble_audio
from hard_word_audio_manifest import (
    AUDIO_ROOT,
    HARD_WORD_AUDIO_MANIFEST_FILE,
    HARD_WORD_AUDIO_ROOT,
    PROFILE_ID,
    SPEECH_RATE_WPM,
    build_manifest,
    catalog_sha256,
    compare_manifest,
    expected_audio_links,
    flattened_manifest_audio_index,
    generated_specs,
    load_manifest,
    reusable_generated_asset,
    sha256_file,
    validate_manifest_schema,
    write_manifest,
)


CHECKPOINT_FILE = HARD_WORD_AUDIO_ROOT / ".generation-checkpoint.json"


def load_checkpoint() -> dict[tuple[str, str], dict[str, object]]:
    if not CHECKPOINT_FILE.is_file():
        return {}
    try:
        checkpoint = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError("Invalid hard-word audio generation checkpoint") from error
    if (
        not isinstance(checkpoint, dict)
        or set(checkpoint) != {"catalogSha256", "entries", "profileId"}
        or checkpoint["catalogSha256"] != catalog_sha256()
        or checkpoint["profileId"] != PROFILE_ID
        or not isinstance(checkpoint["entries"], list)
    ):
        raise RuntimeError("Stale or invalid hard-word audio generation checkpoint")
    index: dict[tuple[str, str], dict[str, object]] = {}
    expected = {
        (str(spec["entry_id"]), str(spec["accent"])): spec
        for spec in generated_specs()
    }
    fields = {
        "assetSource": "hard_word_generated",
        "kind": "word",
    }
    for entry in checkpoint["entries"]:
        if not isinstance(entry, dict):
            raise RuntimeError("Invalid hard-word audio checkpoint entry")
        key = (str(entry.get("entryId") or ""), str(entry.get("accent") or ""))
        if not all(key) or key in index:
            raise RuntimeError("Duplicate hard-word audio checkpoint entry")
        spec = expected.get(key)
        if spec is None:
            raise RuntimeError("Unexpected hard-word audio checkpoint binding")
        expected_binding = {
            **fields,
            "accent": spec["accent"],
            "bindingSha256": spec["binding_sha256"],
            "entryId": spec["entry_id"],
            "generationProfile": spec["generation_profile"],
            "generationProfileSha256": spec["generation_profile_sha256"],
            "src": spec["src"],
            "textSha256": spec["text_sha256"],
            "voice": spec["voice"],
        }
        if any(entry.get(field) != value for field, value in expected_binding.items()):
            raise RuntimeError("Stale hard-word audio checkpoint binding")
        path = AUDIO_ROOT / str(spec["path"])
        if (
            not path.is_file()
            or entry.get("bytes") != path.stat().st_size
            or entry.get("audioSha256") != sha256_file(path)
        ):
            raise RuntimeError("Stale hard-word audio checkpoint file")
        index[key] = entry
    return index


def write_checkpoint(entries: dict[tuple[str, str], dict[str, object]]) -> None:
    checkpoint = {
        "catalogSha256": catalog_sha256(),
        "entries": [entries[key] for key in sorted(entries)],
        "profileId": PROFILE_ID,
    }
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(checkpoint, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if CHECKPOINT_FILE.is_file() and CHECKPOINT_FILE.read_text(encoding="utf-8") == rendered:
        return
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=CHECKPOINT_FILE.parent,
        prefix=".checkpoint-",
        suffix=".json",
        delete=False,
    ) as output:
        output.write(rendered)
        temporary = Path(output.name)
    temporary.replace(CHECKPOINT_FILE)


def checkpoint_entry(spec: dict[str, object]) -> dict[str, object]:
    output = AUDIO_ROOT / str(spec["path"])
    return {
        "accent": spec["accent"],
        "assetSource": "hard_word_generated",
        "audioSha256": sha256_file(output),
        "bindingSha256": spec["binding_sha256"],
        "bytes": output.stat().st_size,
        "entryId": spec["entry_id"],
        "generationProfile": spec["generation_profile"],
        "generationProfileSha256": spec["generation_profile_sha256"],
        "kind": "word",
        "src": spec["src"],
        "textSha256": spec["text_sha256"],
        "voice": spec["voice"],
    }


def run_checked(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)


def verify_local_synthesis_environment() -> None:
    voices = subprocess.run(
        ["/usr/bin/say", "-v", "?"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    required = {"Daniel": "en_GB", "Samantha": "en_US"}
    for voice, locale in required.items():
        if not any(
            line.split()[:2] == [voice, locale] for line in voices.splitlines()
        ):
            raise RuntimeError(f"Required local macOS voice is missing: {voice} {locale}")


async def synthesize_one(
    semaphore: asyncio.Semaphore,
    spec: dict[str, object],
    build_root: Path,
) -> dict[str, object]:
    output = AUDIO_ROOT / str(spec["path"])
    output.parent.mkdir(parents=True, exist_ok=True)
    token = f"{spec['accent']}-{spec['entry_id']}"
    raw = build_root / f"{token}-raw.aiff"
    assembled = build_root / f"{token}-assembled.mp3"
    async with semaphore:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            run_checked,
            [
                "/usr/bin/say",
                "-v",
                str(spec["voice"]),
                "-r",
                str(SPEECH_RATE_WPM),
                "-o",
                str(raw),
                "--",
                str(spec["headword"]),
            ],
        )
        if not raw.is_file() or raw.stat().st_size <= 4_096:
            raise RuntimeError(
                f"macOS say produced no usable local audio for {token}; "
                "run with access to the macOS speech service"
            )
        await loop.run_in_executor(None, assemble_audio, raw, assembled, True)
        assembled.replace(output)
        if output.stat().st_size <= 1_000:
            raise RuntimeError(f"Generated audio is unexpectedly small: {output}")
        return spec


async def run(overwrite: bool, concurrency: int) -> None:
    specs = generated_specs()
    if HARD_WORD_AUDIO_MANIFEST_FILE.is_file():
        loaded_manifest = load_manifest()
        validate_manifest_schema(loaded_manifest)
        existing = flattened_manifest_audio_index(loaded_manifest)
    else:
        existing = load_checkpoint()
    if overwrite:
        existing = {}
        CHECKPOINT_FILE.unlink(missing_ok=True)
    stale = [
        spec
        for spec in specs
        if not reusable_generated_asset(
            spec,
            existing.get((str(spec["entry_id"]), str(spec["accent"]))),
        )
    ]

    if stale:
        if not shutil.which("ffmpeg"):
            raise RuntimeError("ffmpeg is required to assemble the learning cadence")
        if not Path("/usr/bin/say").is_file():
            raise RuntimeError(
                "macOS say is required to synthesize hard-word audio completely locally"
            )
        verify_local_synthesis_environment()

    semaphore = asyncio.Semaphore(concurrency)
    HARD_WORD_AUDIO_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="hard-word-audio-build-", dir=tempfile.gettempdir()
    ) as directory:
        build_root = Path(directory)
        tasks = [
            asyncio.create_task(synthesize_one(semaphore, spec, build_root))
            for spec in stale
        ]
        try:
            for index, task in enumerate(asyncio.as_completed(tasks), start=1):
                spec = await task
                key = (str(spec["entry_id"]), str(spec["accent"]))
                existing[key] = checkpoint_entry(spec)
                write_checkpoint(existing)
                if index % 25 == 0 or index == len(tasks):
                    print(f"Progress: {index}/{len(tasks)}", flush=True)
        except Exception:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

    manifest = build_manifest()
    write_manifest(manifest)
    CHECKPOINT_FILE.unlink(missing_ok=True)
    print(
        "Hard-word audio ready: "
        f"{len(stale)} generated, {len(specs) - len(stale)} verified and reused, "
        f"{len(expected_audio_links())} UK/US links; profile {PROFILE_ID}"
    )
    print(f"Updated {HARD_WORD_AUDIO_MANIFEST_FILE}")


def check() -> None:
    messages = compare_manifest()
    if messages:
        for message in messages:
            print(f"ERROR: {message}")
        raise SystemExit(1)
    print("Hard-word audio manifest and all 751 UK/US links are current")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--concurrency", type=int, default=8)
    args = parser.parse_args()
    if args.check:
        if args.overwrite:
            parser.error("--check and --overwrite cannot be used together")
        check()
        return
    asyncio.run(run(args.overwrite, max(1, min(args.concurrency, 10))))


if __name__ == "__main__":
    main()
