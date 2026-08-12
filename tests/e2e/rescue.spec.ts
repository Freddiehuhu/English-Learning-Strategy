import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const STORAGE_KEY = 'els-ielts-wordlab-v1';

type RescueGate = 'readDecode' | 'listenForm' | 'meaningRecall';

type RescueTask = {
  wordId: string;
  gate: RescueGate;
  variant: number;
  attemptCycle: number;
};

type RelearnEntry = {
  key: string;
  wordId: string;
  skill: string;
  scheduledAt: number;
  scheduledSequence: number;
  scheduledPracticeSeconds: number;
  notBeforeAt: number;
  notBeforeSequence: number;
  notBeforePracticeSeconds: number;
  variant?: number;
};

type SavedState = {
  daily?: { practicedSeconds?: number };
  history?: Array<{
    wordId: string;
    skill: string;
    correct: boolean | null;
    coreAttempt?: boolean;
    rescue?: { attemptCycle?: number; variant?: number; pendingContext?: boolean };
  }>;
  relearn?: {
    sequence: number;
    practiceSeconds: number;
    queue: RelearnEntry[];
  };
  rescue?: {
    tasks?: RescueTask[];
    taskIndex?: number;
    gates?: Record<
      string,
      {
        attempts: number;
        correct: number;
        needsReview: boolean;
        pendingContext: boolean;
        skipCount: number;
      }
    >;
    contextNotes?: Record<string, string>;
  };
  words?: Record<string, unknown>;
};

type RescueWord = {
  id: string;
  word: string;
  pos: string;
  zh: string;
  ipaUk: string;
  ipaUs: string;
  collocation: string;
  chunks: string[];
  difficulty: number;
  reportedNeeds: string[];
  senseStatus: string;
  decodeTask: { kind: string; prompt: string; choices: string[]; answerIndex: number };
  meaningTask: {
    prompt: string;
    answer: string | null;
    choices: string[];
    masteryEligible: boolean;
  };
  pronunciation: {
    uk: { wordAudio: string; ipa: string; voice: string };
    us: { wordAudio: string; ipa: string; voice: string };
  };
};

async function installControllableAudio(page: Page, autoStart = true) {
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

    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: ControllableAudio,
    });
    Object.defineProperty(window, '__controllableAudio', {
      configurable: true,
      value: ControllableAudio.instances,
    });
  }, autoStart);
}

async function savedState(page: Page): Promise<SavedState> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{}') as SavedState,
    STORAGE_KEY,
  );
}

async function currentRescueTask(page: Page): Promise<RescueTask> {
  return page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return saved.rescue.tasks[saved.rescue.taskIndex] as RescueTask;
  });
}

async function rescueWord(page: Page, wordId: string): Promise<RescueWord> {
  return page.evaluate((id) => {
    const words = (window as unknown as { IELTS_RESCUE_VOCABULARY: RescueWord[] })
      .IELTS_RESCUE_VOCABULARY;
    return words.find((entry) => entry.id === id)!;
  }, wordId);
}

async function startRescue(page: Page) {
  await page.goto('/ielts/index.html');
  await expect(page.getByRole('heading', { name: '声形急救' })).toBeVisible();
  await page.locator('[data-action="start-rescue"]').click();
  await expect(page.locator('[data-rescue-task]')).toBeVisible();
}

async function navigateToProgress(page: Page) {
  await page.locator('[data-view-link="progress"]:visible').click();
  await expect(page.getByRole('heading', { name: '错题与进度' })).toBeVisible();
}

async function answerCurrentRescueCorrectly(page: Page) {
  const task = await currentRescueTask(page);
  const data = await rescueWord(page, task.wordId);

  if (task.gate === 'listenForm') {
    await page.locator('[data-rescue-play]').click();
    await page.locator('#rescueListenInput').fill(data.word);
    await page.getByRole('button', { name: '检查', exact: true }).click();
  } else if (task.gate === 'readDecode') {
    await page
      .locator(`[data-rescue-answer-controls] input[value="${data.decodeTask.answerIndex}"]`)
      .evaluate((input: HTMLInputElement) => input.click());
    await page.getByRole('button', { name: '检查字音' }).click();
  } else {
    const pending = data.senseStatus === 'pending_context' || !data.meaningTask.masteryEligible;
    const index = pending ? 0 : data.meaningTask.choices.indexOf(data.meaningTask.answer!);
    await page
      .locator(`[data-rescue-answer-controls] input[value="${index}"]`)
      .evaluate((input: HTMLInputElement) => input.click());
    if (pending) await page.locator('textarea[name="contextNote"]').fill('The original sentence.');
    await page.getByRole('button', { name: pending ? '保存线索' : '检查词义' }).click();
  }
}

async function advanceToGate(page: Page, targetGate: RescueGate) {
  for (let guard = 0; guard < 24; guard += 1) {
    const gate = await page.locator('[data-rescue-task]').getAttribute('data-gate');
    if (gate === targetGate) return;
    await answerCurrentRescueCorrectly(page);
    await page.getByRole('button', { name: '下一题' }).click();
  }
  throw new Error(`Could not reach rescue gate ${targetGate}`);
}

async function dispatchAudioEvent(page: Page, eventName: string) {
  await page.evaluate((name) => {
    const instances = (
      window as unknown as { __controllableAudio: Array<{ dispatchEvent: (event: Event) => void }> }
    ).__controllableAudio;
    instances.at(-1)?.dispatchEvent(new Event(name));
  }, eventName);
}

test('loads a source-audited twelve-word rescue set with exact routes and noun audio binding', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  const audit = await page.evaluate(() => {
    const words = (window as unknown as { IELTS_RESCUE_VOCABULARY: RescueWord[] })
      .IELTS_RESCUE_VOCABULARY;
    const readDecodeWords = words.filter((word) => [1, 3].includes(word.difficulty));
    return {
      count: words.length,
      ids: words.map((word) => word.id),
      routes: Object.fromEntries(
        words.map((word) => [word.id, { difficulty: word.difficulty, needs: word.reportedNeeds }]),
      ),
      readDecodeTasks: readDecodeWords.map((word) => ({
        id: word.id,
        kind: word.decodeTask.kind,
        prompt: word.decodeTask.prompt,
      })),
      instant: words.find((word) => word.id === 'instant'),
      certificate: words.find((word) => word.id === 'certificate'),
      squeeze: words.find((word) => word.id === 'squeeze'),
    };
  });

  expect(audit.count).toBe(12);
  expect(new Set(audit.ids).size).toBe(12);
  expect(audit.routes.controversial).toEqual({ difficulty: 1, needs: ['pronunciation'] });
  expect(audit.routes.pronunciation).toEqual({ difficulty: 2, needs: ['meaning'] });
  expect(audit.routes.certificate).toEqual({
    difficulty: 3,
    needs: ['pronunciation', 'meaning'],
  });
  expect(audit.readDecodeTasks).toHaveLength(9);
  expect(audit.readDecodeTasks.every((task) => task.kind !== 'primary_stress')).toBe(true);
  expect(audit.instant).toMatchObject({
    senseStatus: 'pending_context',
    meaningTask: { masteryEligible: false },
  });
  expect(audit.certificate).toMatchObject({
    decodeTask: { kind: 'noun_ending', choices: ['/kət/', '/keɪt/', '/sət/'], answerIndex: 0 },
    pronunciation: {
      uk: {
        wordAudio: './audio/uk/certificate.mp3',
        voice: 'en-GB-SoniaNeural',
      },
      us: {
        wordAudio: './audio/us/certificate.mp3',
        voice: 'en-US-AvaNeural',
      },
    },
  });
  expect(audit.certificate!.pronunciation.uk.ipa).toContain('kət');
  expect(audit.certificate!.pronunciation.uk.ipa).not.toContain('keɪt');
  expect(audit.squeeze!.decodeTask).toEqual({
    kind: 'grapheme_sound',
    prompt: '单词中的 /iː/ 由哪个拼写块表示？',
    choices: ['squ', 'ee', 'ze'],
    answerIndex: 1,
  });
});

test('blind listening leaks no word, Chinese, POS, IPA, or word-family clue and unlocks only after playing', async ({
  page,
}) => {
  await installControllableAudio(page, false);
  await startRescue(page);
  await advanceToGate(page, 'listenForm');
  await expect(page.locator('[data-rescue-task][data-gate="listenForm"]')).toBeVisible();

  const task = await currentRescueTask(page);
  const target = await rescueWord(page, task.wordId);
  const candidateSecrets = [
    target.word,
    target.zh,
    target.pos,
    target.ipaUk,
    target.ipaUs,
    target.collocation,
    ...target.chunks.filter((chunk) => /[a-z]/i.test(chunk)),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const leaked = await page.locator('#mainContent').evaluate((root, secrets) => {
    const values = [root, ...root.querySelectorAll('*')].flatMap((element) => {
      const attributes = Array.from(element.attributes || []).map((attribute) => attribute.value);
      return [element === root ? element.innerHTML : '', ...attributes];
    });
    return secrets.filter((secret) =>
      values.some((value) => value.toLowerCase().includes(secret.toLowerCase())),
    );
  }, candidateSecrets);
  expect(leaked).toEqual([]);
  await expect(page.getByText(/\/.+\//)).toHaveCount(0);
  await expect(page.locator('#rescueListenInput')).toBeDisabled();

  const play = page.locator('[data-rescue-play]');
  await play.click();
  await expect(play).toHaveAttribute('data-playback-state', 'loading');
  await expect(play).toHaveAttribute('aria-label', '暂停盲听音频');
  await expect(page.locator('#rescueListenInput')).toBeDisabled();

  await dispatchAudioEvent(page, 'playing');
  await expect(play).toHaveAttribute('data-playback-state', 'playing');
  await expect(page.locator('#rescueListenInput')).toBeEnabled();
  await play.click();
  await expect(play).toHaveAttribute('data-playback-state', 'paused');
  await expect(play).toHaveAttribute('aria-label', '继续盲听音频');
  await play.click();
  await expect(play).toHaveAttribute('data-playback-state', 'loading');
  await dispatchAudioEvent(page, 'playing');
  await expect(play).toHaveAttribute('data-playback-state', 'playing');
});

test('audio failure keeps blind answer controls locked and does not record evidence', async ({
  page,
}) => {
  await page.addInitScript(() => {
    class FailingAudio extends EventTarget {
      currentTime = 0;
      playbackRate = 1;
      preload = '';
      paused = true;
      ended = false;
      constructor(public src: string) {
        super();
      }
      play() {
        queueMicrotask(() => this.dispatchEvent(new Event('error')));
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: FailingAudio });
  });
  await startRescue(page);
  await advanceToGate(page, 'listenForm');
  const task = await currentRescueTask(page);
  const before = await savedState(page);
  await page.locator('[data-rescue-play]').click();
  await expect(page.locator('#rescueListenInput')).toBeDisabled();
  await expect(page.locator('[data-rescue-feedback]')).toContainText('音频未成功播放');
  expect((await savedState(page)).history?.length || 0).toBe(before.history?.length || 0);

  await page.locator('[data-rescue-skip]').click();
  await expect(page.locator('#toast')).toContainText('因音频故障已延后本题');
  const after = await savedState(page);
  expect(after.history?.length || 0).toBe(before.history?.length || 0);
  expect(after.rescue?.gates?.[`${task.wordId}::listenForm`]).toBeUndefined();
  expect(after.relearn?.queue.length || 0).toBe(before.relearn?.queue.length || 0);
  expect(after.daily?.practicedSeconds).toBe(before.daily?.practicedSeconds);
  expect(after.relearn?.sequence).toBe(before.relearn?.sequence);
  expect(after.relearn?.practiceSeconds).toBe(before.relearn?.practiceSeconds);
});

test('blind audio loading timeout and rejected resume stay technical failures with no learner evidence', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) =>
      nativeSetTimeout(
        callback,
        delay === 10000 ? 25 : delay,
        ...args,
      )) as typeof window.setTimeout;
    class TimeoutThenRejectAudio extends EventTarget {
      static calls = 0;
      currentTime = 0;
      playbackRate = 1;
      preload = '';
      paused = true;
      ended = false;
      constructor(public src: string) {
        super();
      }
      play() {
        TimeoutThenRejectAudio.calls += 1;
        this.paused = false;
        if (TimeoutThenRejectAudio.calls === 1) return new Promise<void>(() => {});
        if (TimeoutThenRejectAudio.calls === 2) {
          queueMicrotask(() => this.dispatchEvent(new Event('playing')));
          return Promise.resolve();
        }
        return Promise.reject(new Error('resume failed'));
      }
      pause() {
        this.paused = true;
        queueMicrotask(() => this.dispatchEvent(new Event('pause')));
      }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: TimeoutThenRejectAudio });
  });
  await startRescue(page);
  await advanceToGate(page, 'listenForm');
  const task = await currentRescueTask(page);
  const before = await savedState(page);
  const play = page.locator('[data-rescue-play]');

  await play.click();
  await expect(page.locator('#toast')).toContainText('自然语音加载超时');
  await expect(page.locator('#rescueListenInput')).toBeDisabled();
  await expect(page.locator('[data-rescue-feedback]')).toContainText('音频未成功播放');

  await play.click();
  await expect(play).toHaveAttribute('data-playback-state', 'playing');
  await play.click();
  await expect(play).toHaveAttribute('data-playback-state', 'paused');
  await play.click();
  await expect(page.locator('#toast')).toContainText('自然语音无法继续播放');
  await expect(page.locator('#rescueListenInput')).toBeDisabled();

  await page.locator('[data-rescue-skip]').click();
  const after = await savedState(page);
  expect(after.history?.length || 0).toBe(before.history?.length || 0);
  expect(after.rescue?.gates?.[`${task.wordId}::listenForm`]).toBeUndefined();
  expect(after.relearn?.queue.length || 0).toBe(before.relearn?.queue.length || 0);
  expect(after.daily?.practicedSeconds).toBe(before.daily?.practicedSeconds);
  expect(after.relearn?.sequence).toBe(before.relearn?.sequence);
  expect(after.relearn?.practiceSeconds).toBe(before.relearn?.practiceSeconds);
});

test('each rescue gate records independent evidence, stays outside core mistakes, and is visible in progress', async ({
  page,
}) => {
  await installControllableAudio(page);
  await startRescue(page);
  const seen = new Set<string>();
  for (let guard = 0; guard < 18 && seen.size < 3; guard += 1) {
    const gate = (await page.locator('[data-rescue-task]').getAttribute('data-gate'))!;
    seen.add(gate);
    await answerCurrentRescueCorrectly(page);
    await page.getByRole('button', { name: '下一题' }).click();
  }
  expect(seen).toEqual(new Set(['readDecode', 'listenForm', 'meaningRecall']));

  const saved = await savedState(page);
  const gateKeys = Object.keys(saved.rescue?.gates || {});
  expect(gateKeys.some((key) => key.endsWith('::readDecode'))).toBe(true);
  expect(gateKeys.some((key) => key.endsWith('::listenForm'))).toBe(true);
  expect(gateKeys.some((key) => key.endsWith('::meaningRecall'))).toBe(true);
  const rescueIds = new Set(
    await page.evaluate(() =>
      (window as unknown as { IELTS_RESCUE_VOCABULARY: RescueWord[] }).IELTS_RESCUE_VOCABULARY.map(
        (word) => word.id,
      ),
    ),
  );
  expect(Object.keys(saved.words || {}).filter((id) => rescueIds.has(id))).toEqual([]);
  expect(
    saved.history
      ?.filter((entry) => rescueIds.has(entry.wordId))
      .every((entry) => entry.coreAttempt === false),
  ).toBe(true);

  await navigateToProgress(page);
  await expect(page.getByRole('heading', { name: '声形急救记录' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '近期错项' }).locator('..')).not.toContainText(
    'controversial',
  );
  await expect(page.getByRole('heading', { name: '声形急救记录' }).locator('..')).toContainText(
    /controversial|fountain/,
  );
});

for (const targetGate of ['readDecode', 'listenForm', 'meaningRecall'] as const) {
  test(`skip click-through is idempotent for ${targetGate}, waits for all spacing gates, and returns a real cycle-one variant`, async ({
    page,
  }) => {
    await installControllableAudio(page);
    await startRescue(page);
    await advanceToGate(page, targetGate);

    const original = await currentRescueTask(page);
    await expect(page.locator('[data-rescue-task]')).toHaveAttribute('data-variant', '0');
    const originalChoices =
      targetGate === 'listenForm'
        ? []
        : await page.locator('[data-rescue-answer-controls] span').allTextContents();
    const originalAccent =
      targetGate === 'listenForm'
        ? await page.locator('[data-rescue-play]').getAttribute('data-accent')
        : null;

    await page.locator('[data-rescue-skip]').dispatchEvent('click');
    await page.waitForTimeout(50);
    await page.locator('[data-rescue-skip]').dispatchEvent('click');

    let saved = await savedState(page);
    const stateKey = `${original.wordId}::${original.gate}`;
    const queueKey = `rescue::${original.wordId}::${original.gate}`;
    expect(saved.rescue?.gates?.[stateKey]?.skipCount).toBe(1);
    const queued = saved.relearn?.queue.filter((entry) => entry.key === queueKey) || [];
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      key: queueKey,
      wordId: original.wordId,
      skill: original.gate,
      variant: 1,
    });
    expect(
      saved.history?.filter(
        (entry) => entry.wordId === original.wordId && entry.skill === original.gate,
      ),
    ).toHaveLength(1);
    expect(queued[0].notBeforeSequence - queued[0].scheduledSequence).toBe(3);
    expect(queued[0].notBeforePracticeSeconds - queued[0].scheduledPracticeSeconds).toBe(300);
    expect(queued[0].notBeforeAt - queued[0].scheduledAt).toBe(300_000);

    await page.getByRole('button', { name: '退出' }).click();
    await page.locator('[data-action="start-rescue"]').click();
    const immediateTasks = (await savedState(page)).rescue?.tasks || [];
    expect(
      immediateTasks.some((task) => task.wordId === original.wordId && task.gate === original.gate),
    ).toBe(false);

    await page.getByRole('button', { name: '退出' }).click();
    await page.evaluate(
      ({ storageKey, queueEntry }) => {
        const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
        state.relearn.sequence = queueEntry.notBeforeSequence;
        state.relearn.practiceSeconds = queueEntry.notBeforePracticeSeconds;
        const stored = state.relearn.queue.find(
          (entry: RelearnEntry) => entry.key === queueEntry.key,
        );
        stored.scheduledAt = Date.now() - 300_001;
        stored.notBeforeAt = stored.scheduledAt + 300_000;
        localStorage.setItem(storageKey, JSON.stringify(state));
      },
      { storageKey: STORAGE_KEY, queueEntry: queued[0] },
    );
    await page.reload();
    await page.locator('[data-action="start-rescue"]').click();
    const retryRoot = page.locator(
      `[data-rescue-task][data-gate="${original.gate}"][data-attempt-cycle="1"]`,
    );
    await expect(retryRoot).toBeVisible();
    await expect(retryRoot).toHaveAttribute('data-variant', '1');
    const retryTask = await currentRescueTask(page);
    expect(retryTask).toMatchObject({
      wordId: original.wordId,
      gate: original.gate,
      attemptCycle: 1,
      variant: 1,
    });
    if (targetGate === 'listenForm') {
      const retryAccent = await page.locator('[data-rescue-play]').getAttribute('data-accent');
      expect(retryAccent).not.toBe(originalAccent);
    } else {
      const retryChoices = await page
        .locator('[data-rescue-answer-controls] span')
        .allTextContents();
      expect(retryChoices).not.toEqual(originalChoices);
    }

    saved = await savedState(page);
    expect(saved.relearn?.queue.filter((entry) => entry.key === queueKey)).toHaveLength(1);
  });
}

test('instant context stays unscored, persists the note, advances no clocks, and does not block round two', async ({
  page,
}) => {
  await installControllableAudio(page);
  await startRescue(page);
  for (let guard = 0; guard < 24; guard += 1) {
    const current = await currentRescueTask(page);
    if (current.wordId === 'instant' && current.gate === 'meaningRecall') break;
    await answerCurrentRescueCorrectly(page);
    await page.getByRole('button', { name: '下一题' }).click();
  }
  await expect(page.locator('[data-rescue-task]')).toHaveAttribute('data-gate', 'meaningRecall');
  await expect(page.getByRole('heading', { name: 'instant' })).toBeVisible();

  const before = await savedState(page);
  const clocksBefore = {
    daily: before.daily?.practicedSeconds,
    sequence: before.relearn?.sequence,
    practiceSeconds: before.relearn?.practiceSeconds,
  };
  await page
    .locator('[data-rescue-answer-controls] input[value="2"]')
    .evaluate((input: HTMLInputElement) => input.click());
  await page.locator('textarea[name="contextNote"]').fill('We need instant access to the file.');
  await page.getByRole('button', { name: '保存线索' }).click();

  let saved = await savedState(page);
  expect({
    sequence: saved.relearn?.sequence,
    practiceSeconds: saved.relearn?.practiceSeconds,
  }).toEqual({
    sequence: clocksBefore.sequence,
    practiceSeconds: clocksBefore.practiceSeconds,
  });
  expect(saved.daily?.practicedSeconds).toBe(Number(clocksBefore.daily || 0) + 40);
  expect(
    saved.history
      ?.filter((entry) => entry.wordId === 'instant' && entry.skill === 'meaningRecall')
      .at(-1),
  ).toMatchObject({ correct: null, rescue: { pendingContext: true } });
  expect(saved.rescue?.contextNotes?.instant).toBe('We need instant access to the file.');
  expect(saved.rescue?.gates?.['instant::meaningRecall']).toMatchObject({
    correct: 0,
    pendingContext: true,
    needsReview: false,
  });
  expect(
    saved.relearn?.queue.some(
      (entry) => entry.wordId === 'instant' && entry.skill === 'meaningRecall',
    ),
  ).toBe(false);

  await page.getByRole('button', { name: '下一题' }).click();
  for (let guard = 0; guard < 30; guard += 1) {
    if (
      await page
        .getByRole('heading', { name: '本轮训练完成' })
        .isVisible()
        .catch(() => false)
    )
      break;
    await answerCurrentRescueCorrectly(page);
    await page.getByRole('button', { name: '下一题' }).click();
  }
  await page.getByRole('button', { name: '返回今日 →' }).click();
  await page.locator('[data-action="start-rescue"]').click();
  const roundTwoIds = ((await savedState(page)).rescue?.tasks || []).map((task) => task.wordId);
  expect(roundTwoIds).toContain('botanical');
  expect(roundTwoIds).not.toContain('instant');

  await page.getByRole('button', { name: '退出' }).click();
  await navigateToProgress(page);
  await expect(page.getByRole('button', { name: '补录 instant 原句' })).toBeVisible();
  await page.getByRole('button', { name: '补录 instant 原句' }).click();
  await expect(page.locator('textarea[name="contextNote"]')).toHaveValue(
    'We need instant access to the file.',
  );
  saved = await savedState(page);
  expect(saved.rescue?.contextNotes?.instant).toBe('We need instant access to the file.');
});

test('skipping instant without an original sentence records pending context, never a mistake or relearn item', async ({
  page,
}) => {
  await installControllableAudio(page);
  await startRescue(page);
  for (let guard = 0; guard < 24; guard += 1) {
    const current = await currentRescueTask(page);
    if (current.wordId === 'instant' && current.gate === 'meaningRecall') break;
    await answerCurrentRescueCorrectly(page);
    await page.getByRole('button', { name: '下一题' }).click();
  }
  await expect(page.getByRole('heading', { name: 'instant' })).toBeVisible();
  const before = await savedState(page);
  await page.locator('[data-rescue-skip]').click();
  await expect(page.locator('#toast')).toContainText('没有原句时不判错');

  const after = await savedState(page);
  expect(after.daily?.practicedSeconds).toBe(Number(before.daily?.practicedSeconds || 0) + 40);
  expect(after.relearn?.sequence).toBe(before.relearn?.sequence);
  expect(after.relearn?.practiceSeconds).toBe(before.relearn?.practiceSeconds);
  expect(
    after.relearn?.queue.some(
      (entry) => entry.wordId === 'instant' && entry.skill === 'meaningRecall',
    ),
  ).toBe(false);
  expect(after.rescue?.gates?.['instant::meaningRecall']).toMatchObject({
    attempts: 1,
    correct: 0,
    needsReview: false,
    pendingContext: true,
    skipCount: 0,
  });
  expect(
    after.history
      ?.filter((entry) => entry.wordId === 'instant' && entry.skill === 'meaningRecall')
      .at(-1),
  ).toMatchObject({ correct: null, rescue: { pendingContext: true } });
});

test('the rescue route enforces the shared 720-second budget across refresh without false completion', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  await page.evaluate((storageKey) => {
    const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    state.daily = { ...(state.daily || {}), date, practicedSeconds: 700 };
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.locator('[data-action="start-rescue"]')).toBeDisabled();
  await expect(page.locator('[data-action="start-rescue"]')).toHaveText('今日额度已完成');
  await expect(page.locator('[data-rescue-task]')).toHaveCount(0);
  await expect(page.locator('[data-rescue-entry]')).toContainText('今日有效训练额度已用完');
  await expect(page.locator('[data-rescue-entry]')).not.toContainText('两轮已完成');

  await page.evaluate((storageKey) => {
    const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
    state.daily.practicedSeconds = 665;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, STORAGE_KEY);
  await page.reload();
  await page.locator('[data-action="start-rescue"]').click();
  const tasks = (await savedState(page)).rescue?.tasks || [];
  expect(tasks).toHaveLength(1);
  expect(tasks[0].gate).toBe('readDecode');
  await answerCurrentRescueCorrectly(page);
  expect((await savedState(page)).daily?.practicedSeconds).toBe(705);
  await page.reload();
  expect((await savedState(page)).daily?.practicedSeconds).toBe(705);
  await expect(page.locator('[data-action="start-rescue"]')).toBeDisabled();
  await expect(page.locator('[data-action="start-rescue"]')).toHaveText('今日额度已完成');
  await expect(page.locator('[data-rescue-task]')).toHaveCount(0);
});

test('state import rejects rescue-only core state and unsupported gates, then safely reschedules damaged valid gates', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  const rescueOnlyId = await page.evaluate(() => {
    const rescueIds = new Set(
      (window as unknown as { IELTS_RESCUE_VOCABULARY: RescueWord[] }).IELTS_RESCUE_VOCABULARY.map(
        (word) => word.id,
      ),
    );
    const coreIds = new Set(
      (
        window as unknown as {
          IELTS_VOCABULARY: Array<{ id: string }>;
        }
      ).IELTS_VOCABULARY.map((word) => word.id),
    );
    return [...rescueIds].find((id) => !coreIds.has(id))!;
  });
  const now = Date.now();
  const forgedState = await page.evaluate(
    ({ storageKey, timestamp, rescueOnlyWordId }) => {
      const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
      state.words = {
        ...(state.words || {}),
        [rescueOnlyWordId]: {
          skills: {
            sound: { attempts: 999, correct: 999, needsReview: true },
          },
        },
      };
      state.history = [
        ...(state.history || []),
        {
          wordId: 'controversial',
          word: 'controversial',
          skill: 'meaningRecall',
          correct: false,
          at: timestamp,
          coreAttempt: false,
        },
        {
          wordId: rescueOnlyWordId,
          word: rescueOnlyWordId,
          skill: 'sound',
          correct: false,
          at: timestamp,
          coreAttempt: true,
        },
        {
          wordId: 'instant',
          word: 'instant',
          skill: 'meaningRecall',
          correct: true,
          detail: 'forged mastery',
          at: timestamp,
          coreAttempt: false,
          rescue: { pendingContext: false },
        },
      ];
      state.rescue = {
        ...(state.rescue || {}),
        gates: {
          'controversial::readDecode': {
            attempts: 1,
            correct: 0,
            last: timestamp,
            needsReview: true,
            pendingContext: false,
            skipCount: 1,
          },
          'instant::meaningRecall': {
            attempts: 9,
            correct: 9,
            last: timestamp,
            needsReview: true,
            pendingContext: false,
            skipCount: 0,
          },
          'controversial::meaningRecall': {
            attempts: 1,
            correct: 0,
            last: timestamp,
            needsReview: true,
            pendingContext: false,
            skipCount: 1,
          },
        },
        tasks: [
          {
            wordId: 'controversial',
            gate: 'meaningRecall',
            variant: 0,
            attemptCycle: 0,
            relearnKey: '',
          },
        ],
      };
      state.relearn = {
        sequence: 7,
        practiceSeconds: 500,
        queue: [
          {
            key: `${rescueOnlyWordId}::sound`,
            wordId: rescueOnlyWordId,
            skill: 'sound',
            scheduledAt: timestamp,
            scheduledSequence: 0,
            scheduledPracticeSeconds: 0,
            notBeforeAt: timestamp + 300000,
            notBeforeSequence: 3,
            notBeforePracticeSeconds: 300,
          },
          {
            key: 'rescue::controversial::meaningRecall',
            wordId: 'controversial',
            skill: 'meaningRecall',
            scheduledAt: timestamp,
            scheduledSequence: 0,
            scheduledPracticeSeconds: 0,
            notBeforeAt: timestamp + 300000,
            notBeforeSequence: 3,
            notBeforePracticeSeconds: 300,
          },
          {
            key: 'rescue::controversial::readDecode',
            wordId: 'controversial',
            skill: 'readDecode',
            scheduledAt: timestamp,
            scheduledSequence: 99,
            scheduledPracticeSeconds: 9999,
            notBeforeAt: timestamp + 1,
            notBeforeSequence: 99,
            notBeforePracticeSeconds: 9999,
            variant: 1,
          },
        ],
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
      return state;
    },
    { storageKey: STORAGE_KEY, timestamp: now, rescueOnlyWordId: rescueOnlyId },
  );
  await navigateToProgress(page);
  await page.locator('input[data-action="import-data"]').setInputFiles({
    name: 'forged-wordlab-progress.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ app: 'WordLab', version: 5, state: forgedState, visualState: null }),
    ),
  });
  await expect(page.locator('#toast')).toContainText('进度已导入');

  const normalised = await savedState(page);
  expect(normalised.words?.[rescueOnlyId]).toBeUndefined();
  expect(normalised.rescue?.gates?.['controversial::meaningRecall']).toBeUndefined();
  expect(normalised.rescue?.gates?.['instant::meaningRecall']).toMatchObject({
    attempts: 9,
    correct: 0,
    needsReview: false,
    pendingContext: true,
  });
  expect(normalised.rescue?.tasks).toEqual([]);
  expect(
    normalised.history?.some(
      (entry) => entry.wordId === 'controversial' && entry.skill === 'meaningRecall',
    ),
  ).toBe(false);
  expect(normalised.history?.some((entry) => entry.wordId === rescueOnlyId)).toBe(false);
  expect(
    normalised.history?.filter(
      (entry) => entry.wordId === 'instant' && entry.skill === 'meaningRecall',
    ),
  ).toEqual([
    expect.objectContaining({
      correct: null,
      coreAttempt: false,
      rescue: expect.objectContaining({ pendingContext: true }),
    }),
  ]);
  expect(
    normalised.relearn?.queue.some(
      (entry) => entry.key === `${rescueOnlyId}::sound` || entry.skill === 'meaningRecall',
    ),
  ).toBe(false);

  const repaired = normalised.relearn?.queue.filter(
    (entry) => entry.key === 'rescue::controversial::readDecode',
  );
  expect(repaired).toHaveLength(1);
  expect(repaired![0].scheduledSequence).toBe(normalised.relearn?.sequence);
  expect(repaired![0].scheduledPracticeSeconds).toBe(normalised.relearn?.practiceSeconds);
  expect(repaired![0].notBeforeAt - repaired![0].scheduledAt).toBe(300_000);
  expect(repaired![0].notBeforeSequence - repaired![0].scheduledSequence).toBe(3);
  expect(repaired![0].notBeforePracticeSeconds - repaired![0].scheduledPracticeSeconds).toBe(300);
  expect(repaired![0].notBeforeAt).toBeGreaterThan(now);
});

test('mobile rescue works at 320 and 375 px with no overflow, 44 px targets, and visible Tab focus', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'mobile-only viewport gate');
  await startRescue(page);

  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    const layout = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-rescue-task] button:not([hidden]), [data-rescue-answer-controls] label',
        ),
      ).filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      return {
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        targets: controls.map((element) => ({
          tag: element.tagName,
          text: element.textContent?.trim() || '',
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        })),
      };
    });
    expect(layout.viewport).toBe(width);
    expect(layout.scroll).toBeLessThanOrEqual(layout.viewport);
    expect(layout.targets.length).toBeGreaterThan(0);
    layout.targets.forEach(({ tag, text, width: targetWidth, height }) => {
      expect(targetWidth, `${tag} ${text} width`).toBeGreaterThanOrEqual(44);
      expect(height, `${tag} ${text} height`).toBeGreaterThanOrEqual(44);
    });
  }

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let focusedRadio = false;
  for (let attempts = 0; attempts < 20; attempts += 1) {
    await page.keyboard.press('Tab');
    focusedRadio = await page.evaluate(
      () => document.activeElement?.matches('[data-rescue-answer-controls] input') || false,
    );
    if (focusedRadio) break;
  }
  expect(focusedRadio).toBe(true);
  const visibleFocus = await page.evaluate(() => {
    const input = document.activeElement as HTMLInputElement;
    const span = input.nextElementSibling as HTMLElement;
    const style = getComputedStyle(span);
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  });
  expect(visibleFocus).toBe(true);
});
