import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertBlindRootHasNoAnswer,
  AudioHarness,
  catalog,
  clearActiveForNextBatch,
  entryFor,
  hardWordAudioManifestFixture,
  installHardWordAudioRoute,
  installRecorderHarness,
  openHardWords,
  openReadSplitter,
  skipCurrent,
  SOUND_FORM_KEY,
  soundFormState,
  startBatch,
  startDirectWord,
  waitForTransitionLock,
  type SoundFormState,
} from './helpers/hard-word-sound-form';

test.use({ serviceWorkers: 'block' });

const root = (page: Page) => page.locator('[data-hard-word-sound-form]');

test('browser fixture mirrors the final 23 shared and 728 local-generation voice contract', () => {
  const manifest = hardWordAudioManifestFixture();
  const allAudio = manifest.entries.flatMap((entry) => Object.values(entry.audio));
  const shared = allAudio.filter((audio) => audio.assetSource === 'shared_reviewed_word');
  const generated = allAudio.filter((audio) => audio.assetSource === 'hard_word_generated');
  expect(shared).toHaveLength(46);
  expect(generated).toHaveLength(1456);
  expect(new Set(shared.map((audio) => audio.voice))).toEqual(
    new Set(['en-GB-SoniaNeural', 'en-US-AvaNeural']),
  );
  expect(new Set(generated.map((audio) => audio.voice))).toEqual(new Set(['Daniel', 'Samantha']));
  expect(manifest.generationProfile).toMatchObject({
    appliesToAssetSource: 'hard_word_generated',
    id: 'macos-say-hard-word-2026-08-13.2',
    synthesisEngine: 'macos-say',
  });
  expect(manifest.privacy.generatedTextSentToExternalService).toBe(false);
});

test('published manifest launches the formal route without a browser fixture', async ({ page }) => {
  await openHardWords(page);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/ielts/audio/hard-words/manifest.json'),
  );
  await page.locator('[data-action="start-sound-form-practice"]:not([data-word-id])').click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as ReturnType<typeof hardWordAudioManifestFixture>;
  expect(manifest.coverage).toMatchObject({
    headwords: 751,
    audioLinks: 1502,
    generatedFiles: 1456,
    sharedAudioLinks: 46,
  });
  expect(manifest.generationProfile.id).toBe('macos-say-hard-word-2026-08-13.2');
  await expect(root(page)).toBeVisible();
});

async function reachDirectSpell(page: Page, word: string) {
  await startDirectWord(page, word);
  for (let index = 0; index < 10; index += 1) {
    await skipCurrent(page);
    await waitForTransitionLock(page);
  }
  const expected = entryFor(word);
  await expect(root(page)).toHaveAttribute('data-task-position', '11');
  await expect(root(page)).toHaveAttribute('data-task-type', 'spell');
  await assertBlindRootHasNoAnswer(page, expected.displayWord, expected.id);
}

async function playAndUnlock(page: Page) {
  const button = page.locator('[data-dual-spell-audio]');
  await button.click();
  await AudioHarness.dispatch(page, 'playing');
}

async function completeBlindSpelling(
  page: Page,
  values: { count: string; syllables: string; spelling: string; meaning?: string; pos?: string },
) {
  await playAndUnlock(page);
  await page.locator('[data-dual-spell-count-input]').fill(values.count);
  await page
    .locator('[data-dual-spell-count-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await playAndUnlock(page);
  await page.locator('[data-dual-spell-syllables-input]').fill(values.syllables);
  await page
    .locator('[data-dual-spell-syllables-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await playAndUnlock(page);
  await page.locator('[data-dual-spell-word-input]').fill(values.spelling);
  await page.locator('[data-dual-spell-meaning-input]').fill(values.meaning || 'learner meaning');
  await page.locator('[data-dual-spell-pos-input]').fill(values.pos || 'n.');
  await page
    .locator('[data-dual-spell-final-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(root(page)).toHaveAttribute('data-step', 'spell-result');
}

async function baseExportPayload(page: Page, sound: SoundFormState) {
  return page.evaluate((hardWordSoundFormState) => {
    const state = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || 'null');
    return {
      app: 'WordLab',
      version: 5,
      state,
      visualState: null,
      hardWordSoundFormState,
    };
  }, sound);
}

async function navigateToProgress(page: Page) {
  await page.locator('[data-view-link="progress"]:visible').click();
  await expect(page.getByRole('heading', { name: '错题与进度' })).toBeVisible();
}

async function importPayload(page: Page, payload: unknown) {
  await page.locator('input[data-action="import-data"]').setInputFiles({
    name: 'wordlab-progress.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

test('all 751 rows launch sound-form and a formal batch is 10 unique words with paired tasks 10 positions apart', async ({
  page,
}) => {
  expect(catalog.entries).toHaveLength(751);
  await installHardWordAudioRoute(page);
  await openHardWords(page);
  while (await page.locator('[data-action="hard-words-more"]').count()) {
    await page.locator('[data-action="hard-words-more"]').click();
  }

  const rows = await page.locator('.hard-word-row').evaluateAll((items) =>
    items.map((item) => ({
      word: item.getAttribute('data-hard-word'),
      soundForm: item.querySelectorAll('[data-action="start-sound-form-practice"][data-word-id]')
        .length,
    })),
  );
  expect(rows).toHaveLength(751);
  expect(rows.every((item) => item.soundForm === 1)).toBe(true);
  expect(new Set(rows.map((item) => item.word))).toEqual(
    new Set(catalog.entries.map((entry) => entry.normalizedHeadword)),
  );

  await page.locator('[data-action="start-sound-form-practice"]:not([data-word-id])').click();
  await expect(root(page)).toHaveAttribute('data-task-position', '1');
  const state = await soundFormState(page);
  const queue = state.active!.queue;
  expect(queue).toHaveLength(20);
  expect(new Set(queue.map((item) => item.wordId)).size).toBe(10);
  for (let index = 0; index < 10; index += 1) {
    expect(queue[index + 10].wordId).toBe(queue[index].wordId);
    expect(queue[index + 10].type).not.toBe(queue[index].type);
    expect(queue[index].type).toBe(
      index % 2 === 0 ? queue[0].type : queue[0].type === 'read' ? 'spell' : 'read',
    );
  }
});

test('canonical rotation covers all 751 words within 76 batches without starvation', async ({
  page,
}) => {
  await startBatch(page);
  const seen = new Set<string>();
  const batches: string[][] = [];

  for (let batchIndex = 0; batchIndex < 76; batchIndex += 1) {
    const state = await soundFormState(page);
    const selected = state.active!.queue.slice(0, 10).map((item) => item.wordId);
    expect(new Set(selected).size).toBe(10);
    batches.push(selected);
    selected.forEach((id) => seen.add(id));
    if (batchIndex === 75) break;
    await clearActiveForNextBatch(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
    await page.locator('[data-action="start-sound-form-practice"]:not([data-word-id])').click();
    await expect(root(page)).toBeVisible();
  }

  expect(seen.size).toBe(751);
  expect(batches.slice(0, 75).flat()).toHaveLength(750);
  expect(new Set(batches.slice(0, 75).flat()).size).toBe(750);
  expect(batches[75][0]).toBe(catalog.entries[750].id);
  expect(batches[75].slice(1)).toEqual(catalog.entries.slice(0, 9).map((entry) => entry.id));
});

test('row launch pins its word at read 1 and spell 11 without advancing the global cursor', async ({
  page,
}) => {
  await installHardWordAudioRoute(page);
  await openHardWords(page);
  const before = (await soundFormState(page)).cursor;
  await page.getByLabel('搜索单词或短语').fill('maturity');
  await page
    .locator('[data-hard-word="maturity"] [data-action="start-sound-form-practice"]')
    .click();
  await expect(root(page)).toBeVisible();
  const state = await soundFormState(page);
  const target = entryFor('maturity');
  expect(state.cursor).toBe(before);
  expect(state.active!.queue[0]).toEqual({ wordId: target.id, type: 'read' });
  expect(state.active!.queue[10]).toEqual({ wordId: target.id, type: 'spell' });
});

test('blind stages expose no answer or audio path, unlock only on playing, and support pause/resume', async ({
  page,
}) => {
  await AudioHarness.install(page, false);
  await reachDirectSpell(page, 'stress-free');
  const entry = entryFor('stress-free');
  const countInput = page.locator('[data-dual-spell-count-input]');
  await expect(countInput).toBeDisabled();
  await assertBlindRootHasNoAnswer(page, entry.displayWord, entry.id);

  const audio = page.locator('[data-dual-spell-audio]');
  await audio.click();
  await expect(audio).toHaveAttribute('data-playback-state', 'loading');
  await expect(countInput).toBeDisabled();
  expect(await AudioHarness.lastSource(page)).toContain('./audio/');
  await assertBlindRootHasNoAnswer(page, entry.displayWord, entry.id);
  await AudioHarness.dispatch(page, 'playing');
  await expect(countInput).toBeEnabled();
  await expect(audio).toHaveAttribute('aria-label', /暂停/);
  await audio.click();
  await expect(audio).toHaveAttribute('data-playback-state', 'paused');
  await expect(audio).toHaveAttribute('aria-label', /继续/);
  await audio.click();
  await AudioHarness.dispatch(page, 'playing');
  await expect(audio).toHaveAttribute('data-playback-state', 'playing');
});

test('spelling is objective and preserves spaces and hyphens', async ({ page }) => {
  await AudioHarness.install(page, false);
  await reachDirectSpell(page, 'stress-free');
  await completeBlindSpelling(page, {
    count: '2',
    syllables: 'stress / free',
    spelling: 'stressfree',
  });
  await expect(page.locator('[data-dual-spell-result]')).toContainText('完整拼写需修订');
  await page.locator('[data-dual-finish-spell]').click();
  let saved = await soundFormState(page);
  expect(saved.active!.results.at(-1)).toMatchObject({
    wordId: entryFor('stress-free').id,
    type: 'spell',
    status: 'needs_repair',
  });

  await waitForTransitionLock(page);
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    state.active.index = 10;
    state.active.results = state.active.queue
      .slice(0, 10)
      .map((item: { wordId: string; type: string }) => ({
        ...item,
        status: item.type === 'read' ? 'skipped' : 'skipped',
      }));
    state.active.step = 'spell-count';
    state.active.task = {
      meaning: '',
      pos: '',
      syllableCount: '',
      syllables: '',
      splitBoundaries: [],
      spelling: '',
      audioReady: false,
      audioFailed: false,
      technicalFailure: false,
      error: '',
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, SOUND_FORM_KEY);
  await page.reload();
  await expect(root(page)).toHaveAttribute('data-step', 'spell-count');
  await completeBlindSpelling(page, {
    count: '2',
    syllables: 'stress / free',
    spelling: '  STRESS-FREE  ',
  });
  await expect(page.locator('[data-dual-spell-result]')).toContainText('完整拼写正确');
  await page.locator('[data-dual-finish-spell]').click();
  saved = await soundFormState(page);
  expect(saved.active!.results.at(-1)?.status).toBe('independent_correct');
});

test('audio failure is a technical audit event, not a learner attempt; normal skip is evidence', async ({
  page,
}) => {
  await AudioHarness.install(page, false);
  await startBatch(page);
  await skipCurrent(page);
  await waitForTransitionLock(page);
  const beforeFailure = await soundFormState(page);
  const failedItem = beforeFailure.active!.queue[1];
  await page.locator('[data-dual-spell-audio]').click();
  await AudioHarness.dispatch(page, 'error');
  await expect(page.locator('[data-dual-feedback]')).toContainText('本次不记错');
  await skipCurrent(page);
  await waitForTransitionLock(page);

  let state = await soundFormState(page);
  expect(state.entries[failedItem.wordId]).toBeUndefined();
  expect(state.active!.results[1]).toEqual({ ...failedItem, status: 'technical_deferred' });
  expect(state.journal.at(-1)).toMatchObject({ ...failedItem, status: 'technical_deferred' });

  const normalItem = state.active!.queue[2];
  await skipCurrent(page);
  state = await soundFormState(page);
  expect(state.active!.results[2]).toEqual({ ...normalItem, status: 'skipped' });
  expect(state.entries[normalItem.wordId]).toMatchObject({
    read: { attempts: 1, skips: 1, status: 'skipped' },
  });
  expect(state.journal.at(-1)).toMatchObject({ ...normalItem, status: 'skipped' });
});

test('audio loading timeout stays technical and does not count a learner error', async ({
  page,
}) => {
  test.setTimeout(20_000);
  await page.clock.install();
  await AudioHarness.install(page, false);
  await startBatch(page);
  await skipCurrent(page);
  await waitForTransitionLock(page);
  const item = (await soundFormState(page)).active!.queue[1];
  await page.locator('[data-dual-spell-audio]').click();
  await expect(page.locator('[data-dual-spell-count-input]')).toBeDisabled();
  await page.clock.fastForward(10_001);
  await expect(page.locator('#toast')).toContainText('加载超时');
  await expect(page.locator('[data-dual-feedback]')).toContainText('本次不记错');
  await skipCurrent(page);
  const state = await soundFormState(page);
  expect(state.entries[item.wordId]).toBeUndefined();
  expect(state.journal.at(-1)).toMatchObject({ ...item, status: 'technical_deferred' });
});

test('rapid double skip advances once, unlocks, then the following skip advances once', async ({
  page,
}) => {
  await startBatch(page);
  const skip = page.locator('[data-dual-skip]');
  await skip.evaluate((button: HTMLButtonElement) => {
    button.click();
    setTimeout(() => button.click(), 50);
  });
  await expect(root(page)).toHaveAttribute('data-task-position', '2');
  expect((await soundFormState(page)).active!.results).toHaveLength(1);
  await waitForTransitionLock(page);
  await page.locator('[data-dual-skip]').click();
  await expect(root(page)).toHaveAttribute('data-task-position', '3');
  expect((await soundFormState(page)).active!.results).toHaveLength(2);
});

test('refresh restores every text stage, forces audio replay, and read comparison returns to recording', async ({
  page,
}) => {
  await AudioHarness.install(page, false);
  await openReadSplitter(page, 'pronunciation');
  await page.locator('[data-action="dual-toggle-split"][data-boundary="3"]').click();
  await page.reload();
  await expect(root(page)).toHaveAttribute('data-step', 'read-syllables');
  await expect(page.locator('[data-dual-read-meaning]')).toHaveCount(0);
  await expect(page.locator('[data-dual-split-preview]')).toContainText('pro · nunciation');

  await page.locator('[data-action="dual-confirm-splits"]').click();
  await expect(root(page)).toHaveAttribute('data-step', 'read-record');
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    state.active.step = 'read-compare';
    localStorage.setItem(key, JSON.stringify(state));
  }, SOUND_FORM_KEY);
  await page.reload();
  await expect(root(page)).toHaveAttribute('data-step', 'read-record');

  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    state.active.index = 1;
    state.active.results = [{ ...state.active.queue[0], status: 'skipped' }];
    state.active.step = 'spell-final';
    state.active.task = {
      meaning: 'my meaning',
      pos: 'adj.',
      syllableCount: '2',
      syllables: 'my / blocks',
      splitBoundaries: [],
      spelling: 'draft',
      audioReady: true,
      audioFailed: false,
      technicalFailure: false,
      error: '',
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, SOUND_FORM_KEY);
  await page.reload();
  await expect(root(page)).toHaveAttribute('data-step', 'spell-final');
  await expect(page.locator('[data-dual-spell-word-input]')).toHaveValue('draft');
  await expect(page.locator('[data-dual-spell-meaning-input]')).toHaveValue('my meaning');
  await expect(page.locator('[data-dual-spell-word-input]')).toBeDisabled();
});

test('recording completion is pending human review and never machine-marked correct', async ({
  page,
}) => {
  await installRecorderHarness(page);
  await openReadSplitter(page, 'pronunciation');
  await page.locator('[data-action="dual-confirm-splits"]').click();
  await page.locator('[data-dual-record]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-dual-record]').click();
  await expect(page.locator('[data-dual-read-compare]')).toContainText('待人工核对');
  await expect(page.locator('[data-dual-read-compare]')).not.toContainText(/读音正确|已掌握/);
  await page.locator('[data-dual-finish-read]').click();
  const state = await soundFormState(page);
  expect(state.active!.results[0]).toMatchObject({
    type: 'read',
    status: 'recorded_pending_human_review',
  });
  expect(state.entries[entryFor('pronunciation').id]).toMatchObject({
    read: { attempts: 1, recordings: 1, status: 'recorded_pending_human_review' },
  });
});

test('pending microphone permission cannot start a recorder after leaving the exercise', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let resolvePermission: ((stream: unknown) => void) | undefined;
    const track = {
      stop: () => ((window as unknown as { __trackStops: number }).__trackStops += 1),
    };
    Object.defineProperty(window, '__trackStops', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(window, '__recorderStarts', {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(window, '__resolvePermission', {
      configurable: true,
      value: () => resolvePermission?.({ getTracks: () => [track] }),
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => new Promise((resolve) => (resolvePermission = resolve)),
      },
    });
    class PendingRecorder extends EventTarget {
      state = 'inactive';
      mimeType = 'audio/webm';
      start() {
        (window as unknown as { __recorderStarts: number }).__recorderStarts += 1;
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: PendingRecorder });
  });
  await openReadSplitter(page, 'pronunciation');
  await page.locator('[data-action="dual-confirm-splits"]').click();
  await page.locator('[data-dual-record]').click();
  await page.locator('[data-dual-exit]').click();
  await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __resolvePermission: () => void }).__resolvePermission(),
  );
  await expect
    .poll(() =>
      page.evaluate(() => ({
        starts: (window as unknown as { __recorderStarts: number }).__recorderStarts,
        stops: (window as unknown as { __trackStops: number }).__trackStops,
      })),
    )
    .toEqual({ starts: 0, stops: 1 });
});

test('a stale recorder error cannot contaminate a newer recording attempt', async ({ page }) => {
  await page.addInitScript(() => {
    const recorders: EventTarget[] = [];
    let streamNumber = 0;
    const stops: number[] = [];
    Object.defineProperty(window, '__recorders', { configurable: true, value: recorders });
    Object.defineProperty(window, '__streamStops', { configurable: true, value: stops });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          const number = streamNumber++;
          return Promise.resolve({ getTracks: () => [{ stop: () => stops.push(number) }] });
        },
      },
    });
    class RacingRecorder extends EventTarget {
      state = 'inactive';
      mimeType = 'audio/webm';
      constructor() {
        super();
        recorders.push(this);
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.dispatchEvent(new Event('stop'));
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: RacingRecorder });
  });
  await openReadSplitter(page, 'pronunciation');
  await page.locator('[data-action="dual-confirm-splits"]').click();
  await page.locator('[data-dual-record]').click();
  await page.locator('[data-dual-record]').click();
  await page.locator('[data-dual-record]').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __recorders: unknown[] }).__recorders.length),
    )
    .toBe(2);
  await page.evaluate(() => {
    const first = (window as unknown as { __recorders: EventTarget[] }).__recorders[0];
    first.dispatchEvent(new Event('error'));
    first.dispatchEvent(new Event('stop'));
  });
  await expect(page.locator('[data-dual-record-status]')).toContainText('正在录音');
  expect((await soundFormState(page)).active!.task).toMatchObject({ technicalFailure: false });
  const stops = await page.evaluate(
    () => (window as unknown as { __streamStops: number[] }).__streamStops,
  );
  expect(stops.filter((number) => number === 1)).toHaveLength(0);
});

test('unaudited, instant, and locked-sense result cards respect reference boundaries', async ({
  page,
}) => {
  test.setTimeout(75_000);
  await AudioHarness.install(page, false);

  await reachDirectSpell(page, 'maturity');
  await completeBlindSpelling(page, {
    count: '4',
    syllables: 'ma / tur / i / ty',
    spelling: 'maturity',
    meaning: 'my maturity meaning',
    pos: 'my noun',
  });
  await expect(page.locator('[data-sound-form-lexical-reference]')).toHaveCount(0);
  await expect(page.locator('[data-sound-form-pronunciation-reference]')).toHaveCount(0);
  await expect(page.locator('[data-sound-form-block-reference]')).toHaveCount(0);
  await expect(
    page.locator('[data-sound-form-pending-review]').filter({ hasText: '待教师' }).last(),
  ).toBeVisible();
  await expect(page.locator('[data-dual-spell-result]')).toContainText('合成范音');

  await page.evaluate((key) => localStorage.removeItem(key), SOUND_FORM_KEY);
  await reachDirectSpell(page, 'instant');
  await completeBlindSpelling(page, {
    count: '2',
    syllables: 'in / stant',
    spelling: 'instant',
  });
  await expect(page.locator('[data-sound-form-block-reference]')).toHaveCount(2);
  await expect(page.locator('[data-sound-form-lexical-reference]')).toHaveCount(0);
  await expect(
    page.locator('[data-sound-form-pending-review]').filter({ hasText: '待教师' }).last(),
  ).toBeVisible();

  await page.evaluate((key) => localStorage.removeItem(key), SOUND_FORM_KEY);
  await reachDirectSpell(page, 'pronunciation');
  await completeBlindSpelling(page, {
    count: '5',
    syllables: 'pro / nun / ci / a / tion',
    spelling: 'pronunciation',
  });
  await expect(page.locator('[data-sound-form-block-reference]')).toHaveCount(2);
  await expect(page.locator('[data-sound-form-lexical-reference]')).toContainText('发音');
});

test('formal sound-form state is isolated from core adaptive and basic hard-word state', async ({
  page,
}) => {
  await installHardWordAudioRoute(page);
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
  const before = await page.evaluate(() => ({
    core: localStorage.getItem('els-ielts-wordlab-v1'),
    basic: localStorage.getItem('els-ielts-hard-word-practice-v1'),
  }));
  await page.locator('[data-action="start-sound-form-practice"]:not([data-word-id])').click();
  await skipCurrent(page);
  const after = await page.evaluate(() => ({
    core: localStorage.getItem('els-ielts-wordlab-v1'),
    basic: localStorage.getItem('els-ielts-hard-word-practice-v1'),
  }));
  expect(after).toEqual(before);
});

test('fresh-session import loads the catalog, while malformed state fails closed without partial overwrite', async ({
  page,
}) => {
  await installHardWordAudioRoute(page);
  await page.goto('/ielts/index.html');
  const validSound: SoundFormState = {
    version: 1,
    catalogId: catalog.catalogId,
    cursor: 10,
    entries: {},
    journal: [],
    active: null,
  };
  const payload = await baseExportPayload(page, validSound);
  await navigateToProgress(page);
  await importPayload(page, payload);
  await expect(page.locator('#toast')).toContainText('进度已导入');
  expect(await soundFormState(page)).toMatchObject({ cursor: 10, active: null });

  await page.locator('[data-view-link="hard-words"]:visible').click();
  await page.locator('[data-action="start-sound-form-practice"]:not([data-word-id])').click();
  await expect(root(page)).toBeVisible();
  const current = await soundFormState(page);
  const malformedCases = [
    (state: SoundFormState) => {
      (state as unknown as { active: boolean }).active = false;
    },
    (state: SoundFormState) => {
      state.active!.step = 'forged-step';
    },
    (state: SoundFormState) => {
      state.active!.runId = '';
    },
    (state: SoundFormState) => {
      state.active!.queue[1] = state.active!.queue[0];
    },
    (state: SoundFormState) => {
      state.active!.queue[0].wordId = 'foreign-word-id';
      state.active!.queue[10].wordId = 'foreign-word-id';
    },
    (state: SoundFormState) => {
      state.active!.task!.splitBoundaries = Array.from({ length: 31 }, (_, index) => index + 1);
    },
    (state: SoundFormState) => {
      state.active!.task!.error = 'x'.repeat(1000);
    },
    (state: SoundFormState) => {
      state.entries[current.active!.queue[0].wordId] = {
        read: { attempts: 0, recordings: 1, skips: 0, lastAt: 0, status: '' },
        spell: {
          attempts: 0,
          independentPasses: 0,
          repairNeeded: 0,
          skips: 0,
          lastAt: 0,
          status: '',
        },
      };
    },
  ];
  await page.locator('[data-dual-exit]').click();
  await navigateToProgress(page);
  const stableBefore = localStorageSnapshot(await soundFormState(page));

  for (const mutate of malformedCases) {
    const forged = structuredClone(current);
    mutate(forged);
    const forgedPayload = await baseExportPayload(page, forged);
    await importPayload(page, forgedPayload);
    await expect(page.locator('#toast')).toContainText('导入失败');
    expect(localStorageSnapshot(await soundFormState(page))).toEqual(stableBefore);
  }
});

test('export includes formal sound-form evidence and reset removes its independent storage', async ({
  page,
}) => {
  await startBatch(page);
  await skipCurrent(page);
  const expected = await soundFormState(page);
  await page.locator('[data-dual-exit]').click();
  await navigateToProgress(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="export-data"]').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const exported = JSON.parse(readFileSync(path!, 'utf8')) as {
    hardWordSoundFormState: SoundFormState;
  };
  expect(exported.hardWordSoundFormState).toMatchObject({
    version: 1,
    catalogId: catalog.catalogId,
    cursor: expected.cursor,
  });
  expect(exported.hardWordSoundFormState.journal).toEqual(expected.journal);
  expect(exported.hardWordSoundFormState.active?.index).toBe(1);

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-action="reset-data"]').click();
  await expect(page.locator('#toast')).toContainText('已清空');
  expect(await page.evaluate((key) => localStorage.getItem(key), SOUND_FORM_KEY)).toBeNull();
});

function localStorageSnapshot(state: SoundFormState) {
  return JSON.parse(JSON.stringify(state)) as SoundFormState;
}

test('mobile 320/375 layout has no overflow, uses 44px controls, and exposes keyboard hints', async ({
  page,
}) => {
  await AudioHarness.install(page, false);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page
      .evaluate((key) => localStorage.removeItem(key), SOUND_FORM_KEY)
      .catch(() => undefined);
    await startDirectWord(page, 'pronunciation');
    const geometry = await root(page).evaluate((element) => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      controls: Array.from(element.querySelectorAll<HTMLElement>('button, input')).map(
        (control) => {
          const rect = control.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height > 0,
          };
        },
      ),
    }));
    expect(geometry.viewport).toBe(width);
    expect(geometry.scroll).toBeLessThanOrEqual(width + 1);
    expect(
      geometry.controls
        .filter((item) => item.visible)
        .every((item) => item.width >= 44 && item.height >= 44),
    ).toBe(true);

    await reachDirectSpell(page, 'pronunciation');
    await page.locator('[data-dual-spell-audio]').click();
    await AudioHarness.dispatch(page, 'playing');
    await expect(page.locator('[data-dual-spell-count-input]')).toHaveAttribute(
      'inputmode',
      'numeric',
    );
  }
});

test('service worker caches the manifest and full audio on demand while bypassing Range requests', async () => {
  const sw = readFileSync(join(process.cwd(), 'public/ielts/sw.js'), 'utf8');
  expect(sw).toContain("const CACHE_NAME = 'wordlab-v29-formal-hard-word-sound-form'");
  expect(sw).toContain("url.pathname.endsWith('/ielts/audio/hard-words/manifest.json')");
  expect(sw).toContain("url.pathname.includes('/ielts/audio/')");
  expect(sw).toMatch(/request\.headers\.has\(['"]range['"]\)\) return/);
  const coreAssets = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/)?.[1] || '';
  expect(coreAssets).not.toContain('audio/hard-words');
  expect(coreAssets).not.toContain('student-hard-words.json');
});

test('missing or malformed production manifest fails closed before creating a session', async ({
  page,
}) => {
  await page.route('**/ielts/audio/hard-words/manifest.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await openHardWords(page);
  await page.locator('[data-action="start-sound-form-practice"]:not([data-word-id])').click();
  await expect(page.locator('#toast')).toContainText('暂时无法启动');
  await expect(root(page)).toHaveCount(0);
  const saved = await page.evaluate((key) => localStorage.getItem(key), SOUND_FORM_KEY);
  expect(saved === null || JSON.parse(saved).active === null).toBe(true);
});
