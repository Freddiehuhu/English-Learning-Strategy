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
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parents[1]
VOCABULARY_FILE = ROOT / "public" / "ielts" / "vocabulary.js"
AUDIO_ROOT = ROOT / "public" / "ielts" / "audio"
VOICES = {
    "uk": "en-GB-SoniaNeural",
    "us": "en-US-AvaNeural",
}
SAMPLE_RATE = 24_000
OPENING_SILENCE_SECONDS = 0.7
BETWEEN_WORDS_SECONDS = 0.55
CLOSING_SILENCE_SECONDS = 0.3


def read_vocabulary() -> list[dict[str, str]]:
    extractor = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), context);
const entries = context.window.IELTS_VOCABULARY.map((entry) => ({
  id: entry.id,
  word: entry.word,
  sentence: entry.chunks.join(' ').replace(/\s+([,.;!?])/g, '$1'),
}));
process.stdout.write(JSON.stringify(entries));
"""
    result = subprocess.run(
        ["node", "-e", extractor, str(VOCABULARY_FILE)],
        check=True,
        capture_output=True,
        text=True,
    )
    entries = json.loads(result.stdout)
    if len(entries) != 50:
        raise RuntimeError(f"Expected 50 vocabulary entries, found {len(entries)}")
    if len({entry["id"] for entry in entries}) != len(entries):
        raise RuntimeError("Vocabulary IDs must be unique")
    if any(not entry.get("word") or not entry.get("sentence") for entry in entries):
        raise RuntimeError("Every vocabulary entry needs a word and an example sentence")
    return entries


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
            "1",
            "-q:a",
            "2",
            str(output),
        ],
        check=True,
    )


async def generate_one(
    semaphore: asyncio.Semaphore,
    accent: str,
    voice: str,
    entry_id: str,
    text: str,
    kind: str,
    build_root: Path,
    overwrite: bool,
) -> str:
    suffix = "_sentence" if kind == "sentence" else ""
    output = AUDIO_ROOT / accent / f"{entry_id}{suffix}.mp3"
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and output.stat().st_size > 1_000 and not overwrite:
        return f"skip {accent}/{entry_id}/{kind}"

    async with semaphore:
        raw = build_root / f"{accent}-{entry_id}-{kind}-raw.mp3"
        assembled = build_root / f"{accent}-{entry_id}-{kind}-assembled.mp3"
        communicator = edge_tts.Communicate(text=text, voice=voice)
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
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required to assemble the learning cadence")

    entries = read_vocabulary()
    semaphore = asyncio.Semaphore(concurrency)
    AUDIO_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".ielts-audio-build-", dir=AUDIO_ROOT) as build:
        build_root = Path(build)
        tasks = [
            asyncio.create_task(
                generate_one(
                    semaphore,
                    accent,
                    voice,
                    entry["id"],
                    entry[text_key],
                    kind,
                    build_root,
                    overwrite,
                )
            )
            for accent, voice in VOICES.items()
            for entry in entries
            for kind, text_key in (("word", "word"), ("sentence", "sentence"))
        ]
        results = []
        for index, task in enumerate(asyncio.as_completed(tasks), start=1):
            results.append(await task)
            if index % 20 == 0 or index == len(tasks):
                print(f"Progress: {index}/{len(tasks)}", flush=True)

    made = sum(result.startswith("made") for result in results)
    skipped = len(results) - made
    print(f"Audio ready: {made} generated, {skipped} reused, {len(results)} total")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--concurrency", type=int, default=6)
    args = parser.parse_args()
    asyncio.run(run(args.overwrite, max(1, min(args.concurrency, 10))))


if __name__ == "__main__":
    main()
