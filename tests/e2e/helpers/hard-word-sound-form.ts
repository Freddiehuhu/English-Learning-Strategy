import { expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SOUND_FORM_KEY = 'els-ielts-hard-word-sound-form-v1';
export const CORE_KEY = 'els-ielts-wordlab-v1';

export type CatalogEntry = {
  id: string;
  displayWord: string;
  normalizedHeadword: string;
  reviewStatus: string;
  practiceStatus: string;
};

export type SoundFormItem = { wordId: string; type: 'read' | 'spell' };
export type SoundFormResult = SoundFormItem & { status: string };
export type SoundFormTask = {
  meaning: string;
  pos: string;
  syllableCount: string;
  syllables: string;
  splitBoundaries: number[];
  spelling: string;
  audioReady: boolean;
  audioFailed: boolean;
  technicalFailure: boolean;
  error: string;
};
export type SoundFormState = {
  version: 1;
  catalogId: string;
  cursor: number;
  entries: Record<string, unknown>;
  journal: Array<SoundFormResult & { at: number }>;
  active: null | {
    runId: string;
    queue: SoundFormItem[];
    index: number;
    step: string;
    results: SoundFormResult[];
    task: SoundFormTask | null;
  };
};

type PublicCatalog = {
  catalogId: string;
  entries: CatalogEntry[];
};

type ReviewedAudio = {
  entries: Array<{
    kind: string;
    text: string;
    accent: 'uk' | 'us';
    path: string;
    generation_profile: string;
    generation_profile_sha256: string;
  }>;
};

export const catalog = JSON.parse(
  readFileSync(join(process.cwd(), 'public/ielts/corpus/student-hard-words.json'), 'utf8'),
) as PublicCatalog;

const reviewedAudio = JSON.parse(
  readFileSync(join(process.cwd(), 'public/ielts/audio/manifest.json'), 'utf8'),
) as ReviewedAudio;

const catalogSha256 = createHash('sha256')
  .update(readFileSync(join(process.cwd(), 'public/ielts/corpus/student-hard-words.json')))
  .digest('hex');

const hex = (value: string) => createHash('sha256').update(value).digest('hex');

export function entryFor(word: string): CatalogEntry {
  const entry = catalog.entries.find(
    (candidate) => candidate.normalizedHeadword.toLowerCase() === word.toLowerCase(),
  );
  expect(entry, `catalog entry for ${word}`).toBeTruthy();
  return entry!;
}

function fixtureAudio(entry: CatalogEntry, accent: 'uk' | 'us') {
  const reviewed = reviewedAudio.entries.find(
    (item) =>
      item.kind === 'word' &&
      item.accent === accent &&
      item.text.toLowerCase() === entry.displayWord.toLowerCase(),
  );
  const shared = Boolean(reviewed);
  const path = shared ? reviewed!.path : `hard-words/${accent}/${entry.id}.mp3`;
  const generationProfile = shared
    ? reviewed!.generation_profile
    : 'macos-say-hard-word-2026-08-13.2';
  const generationProfileSha256 = shared
    ? reviewed!.generation_profile_sha256
    : '1afdacac57993e5dcf0d787479210ea3a6ca77d526cdbac59ef3643957320bcc';
  return {
    accent,
    assetSource: shared ? 'shared_reviewed_word' : 'hard_word_generated',
    audioSha256: hex(`audio:${entry.id}:${accent}`),
    bindingSha256: hex(`binding:${entry.id}:${accent}`),
    bytes: 2048,
    channels: 1,
    codec: 'mp3',
    durationSeconds: 1.25,
    generationProfile,
    generationProfileSha256,
    kind: 'word',
    path,
    sampleRateHz: 24000,
    src: `./audio/${path}`,
    textSha256: hex(entry.displayWord),
    voice: shared
      ? accent === 'uk'
        ? 'en-GB-SoniaNeural'
        : 'en-US-AvaNeural'
      : accent === 'uk'
        ? 'Daniel'
        : 'Samantha',
  };
}

export function hardWordAudioManifestFixture() {
  return {
    catalog: {
      catalogId: catalog.catalogId,
      entryCount: 751,
      path: 'public/ielts/corpus/student-hard-words.json',
      sha256: catalogSha256,
    },
    coverage: {
      accents: 2,
      audioLinks: 1502,
      generatedFiles: 1456,
      generatedHeadwords: 728,
      headwords: 751,
      sharedAudioLinks: 46,
      sharedHeadwords: 23,
      sourceAuditedHeadwords: 12,
    },
    entries: catalog.entries.map((entry) => ({
      audio: {
        uk: fixtureAudio(entry, 'uk'),
        us: fixtureAudio(entry, 'us'),
      },
      entryId: entry.id,
      headword: entry.displayWord,
      lexicalReview: {
        sourceAudited: entry.reviewStatus === 'source_audited_for_rescue',
        status: entry.reviewStatus,
      },
    })),
    generationProfile: {
      appliesToAssetSource: 'hard_word_generated',
      id: 'macos-say-hard-word-2026-08-13.2',
      parameters: {
        between_repetitions_seconds: 0.55,
        channels: 1,
        closing_silence_seconds: 0.3,
        codec: 'mp3',
        ffmpeg_quality: 2,
        opening_silence_seconds: 0.7,
        repeat_count: 3,
        sample_rate_hz: 24000,
        source_channels: 1,
        source_codec: 'pcm_s16be',
        source_container: 'aiff',
        source_sample_rate_hz: 22050,
        speech_rate_wpm: 175,
      },
      pipelineVersion: '2026-08-13.2',
      synthesisEngine: 'macos-say',
      synthesisEngineVersion: 'macOS-26.5-25F71',
    },
    privacy: {
      containsLearnerIdentity: false,
      generatedTextSentToExternalService: false,
      lexicalAnswerFieldsIncluded: false,
    },
    provenance: {
      assurance: 'e2e-contract-fixture',
      generatedAudioOrigin: 'Generated locally with Daniel and Samantha.',
      limitation: 'Browser interaction fixture; repository asset integrity is tested separately.',
      sharedAudioOrigin: 'Exact-match reviewed words reuse existing Sonia and Ava assets.',
    },
    schemaVersion: 1,
  };
}

export async function installHardWordAudioRoute(page: Page) {
  const fixture = hardWordAudioManifestFixture();
  await page.route('**/ielts/audio/hard-words/manifest.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture),
    }),
  );
}

export async function openHardWords(page: Page) {
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
  await expect(page.locator('[data-hard-words-results]')).toBeVisible();
}

export async function startBatch(page: Page) {
  await installHardWordAudioRoute(page);
  await openHardWords(page);
  await page.locator('[data-action="start-sound-form-practice"]:not([data-word-id])').click();
  await expect(page.locator('[data-hard-word-sound-form]')).toBeVisible();
}

export async function startDirectWord(page: Page, word: string) {
  await installHardWordAudioRoute(page);
  await openHardWords(page);
  await page.getByLabel('搜索单词或短语').fill(word);
  const row = page.locator(`[data-hard-word="${word}"]`);
  await expect(row).toBeVisible();
  await row.locator('[data-action="start-sound-form-practice"]').click();
  await expect(page.locator('[data-hard-word-sound-form]')).toBeVisible();
}

export async function soundFormState(page: Page): Promise<SoundFormState> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || 'null') as SoundFormState,
    SOUND_FORM_KEY,
  );
}

export async function skipCurrent(page: Page) {
  await page.locator('[data-action="dual-skip-task"]').click();
}

export async function waitForTransitionLock(page: Page) {
  await page.waitForTimeout(700);
}

export async function clearActiveForNextBatch(page: Page) {
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    saved.active = null;
    localStorage.setItem(key, JSON.stringify(saved));
  }, SOUND_FORM_KEY);
}

export async function assertBlindRootHasNoAnswer(page: Page, answer: string, wordId: string) {
  const root = page.locator('[data-hard-word-sound-form]');
  await expect(root).toHaveAttribute('data-answer-hidden', 'true');
  const leaks = await root.evaluate(
    (element, secrets) => {
      const lowerSecrets = secrets.map((secret) => secret.toLowerCase());
      const values = [element, ...element.querySelectorAll('*')].flatMap((node) => [
        node === element ? node.innerHTML : '',
        ...Array.from(node.attributes).map((attribute) => attribute.value),
      ]);
      return values.filter((value) => {
        const normalized = value.toLowerCase();
        return lowerSecrets.some((secret) => normalized.includes(secret));
      });
    },
    [answer, wordId, '/audio/hard-words/', '.mp3'],
  );
  expect(leaks).toEqual([]);
}

export class AudioHarness {
  static async install(page: Page, autoStart = false) {
    await page.addInitScript((shouldAutoStart) => {
      class ControllableAudio extends EventTarget {
        static instances: ControllableAudio[] = [];
        src: string;
        currentTime = 0;
        playbackRate = 1;
        preload = '';
        paused = true;
        ended = false;

        constructor(src: string) {
          super();
          this.src = src;
          ControllableAudio.instances.push(this);
        }

        play() {
          this.paused = false;
          if (shouldAutoStart) queueMicrotask(() => this.dispatchEvent(new Event('playing')));
          return Promise.resolve();
        }

        pause() {
          this.paused = true;
          queueMicrotask(() => this.dispatchEvent(new Event('pause')));
        }
      }

      Object.defineProperty(window, 'Audio', { configurable: true, value: ControllableAudio });
      Object.defineProperty(window, '__hardWordAudioInstances', {
        configurable: true,
        value: ControllableAudio.instances,
      });
    }, autoStart);
  }

  static async dispatch(page: Page, eventName: string) {
    await page.evaluate((name) => {
      const items = (
        window as unknown as {
          __hardWordAudioInstances: Array<{ dispatchEvent: (event: Event) => void }>;
        }
      ).__hardWordAudioInstances;
      items.at(-1)?.dispatchEvent(new Event(name));
    }, eventName);
  }

  static async lastSource(page: Page) {
    return page.evaluate(() => {
      const items = (
        window as unknown as {
          __hardWordAudioInstances: Array<{ src: string }>;
        }
      ).__hardWordAudioInstances;
      return items.at(-1)?.src || '';
    });
  }
}

export async function installRecorderHarness(page: Page) {
  await page.addInitScript(() => {
    const stream = { getTracks: () => [{ stop: () => undefined }] };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve(stream) },
    });
    class FakeMediaRecorder extends EventTarget {
      state = 'inactive';
      mimeType = 'audio/webm';
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.dispatchEvent(
          new MessageEvent('dataavailable', {
            data: new Blob(['x'.repeat(256)], { type: this.mimeType }),
          }),
        );
        this.dispatchEvent(new Event('stop'));
      }
    }
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    });
  });
}

export async function openReadSplitter(page: Page, word = 'pronunciation') {
  await startDirectWord(page, word);
  await page.locator('[data-dual-read-meaning]').fill('learner meaning');
  await page.locator('[data-dual-read-pos]').fill('n.');
  await page
    .locator('[data-dual-read-info-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('[data-hard-word-sound-form]')).toHaveAttribute(
    'data-step',
    'read-syllables',
  );
}

export async function submitBlindStage(page: Page, selector: string) {
  await page.locator('[data-dual-spell-audio]').click();
  await AudioHarness.dispatch(page, 'playing');
  await page.locator(selector).evaluate((form: HTMLFormElement) => form.requestSubmit());
}
