import { expect, test } from '@playwright/test';

async function installControllableAudio(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
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
        queueMicrotask(() => this.dispatchEvent(new Event('playing')));
        return Promise.resolve();
      }

      pause() {
        this.paused = true;
        setTimeout(() => this.dispatchEvent(new Event('pause')), 25);
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
  });
}

type IeltsSkill = 'sound' | 'spell' | 'forms' | 'sentence';

async function seedSingleDueSkill(
  page: import('@playwright/test').Page,
  wordId: string,
  skill: IeltsSkill,
  overrides: Record<string, number | boolean> = {},
) {
  await page.evaluate(
    ({ targetId, targetSkill, skillOverrides }) => {
      const old = Date.now() - 2 * 86_400_000;
      localStorage.setItem(
        'els-ielts-wordlab-v1',
        JSON.stringify({
          version: 3,
          settings: { accent: 'uk', dailyNew: 0 },
          daily: {
            date: '',
            newIds: [],
            carryoverIds: [],
            newSelectionDone: false,
            completedAt: 0,
          },
          words: {
            [targetId]: {
              skills: {
                [targetSkill]: {
                  attempts: 1,
                  correct: 0,
                  pending: 0,
                  level: 0,
                  due: 0,
                  last: old,
                  needsReview: true,
                  relearnRequired: false,
                  ...skillOverrides,
                },
              },
            },
          },
          history: [],
          journal: [],
        }),
      );
    },
    { targetId: wordId, targetSkill: skill, skillOverrides: overrides },
  );
  await page.reload();
}

async function unlockSentenceRecall(
  page: import('@playwright/test').Page,
  wordId: string,
  options: { reveal?: boolean } = {},
) {
  await expect(page.locator('.training-panel')).toHaveAttribute('data-word-id', wordId);
  if (options.reveal) {
    await page.getByRole('button', { name: '显示骨架' }).click();
  } else {
    const sortableIndices = await page.evaluate((targetId) => {
      const word = window.IELTS_VOCABULARY.find(
        (candidate: { id: string; chunks: string[] }) => candidate.id === targetId,
      );
      return word!.chunks
        .map((chunk: string, index: number) => ({ chunk: chunk.trim(), index }))
        .filter(({ chunk }: { chunk: string }) => chunk && !/^[,.;:!?]+$/.test(chunk))
        .map(({ index }: { index: number }) => index);
    }, wordId);
    for (const index of sortableIndices) {
      await page.locator(`[data-action="chunk-select"][data-index="${index}"]`).click();
    }
    await page.getByRole('button', { name: '检查顺序' }).click();
  }

  await page.getByRole('button', { name: '遮住骨架，开始复现' }).click();
  await expect(page.getByLabel('HIDDEN SENTENCE RECALL')).toBeVisible();
  return page.evaluate((targetId) => {
    const word = window.IELTS_VOCABULARY.find(
      (candidate: { id: string; chunks: string[] }) => candidate.id === targetId,
    );
    return word!.chunks
      .join(' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }, wordId);
}

test('opens the learning list and boots the Phaser mission', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /沪教版 英语/ })).toBeVisible();
  await expect(page.getByText('dinosaur', { exact: true }).first()).toBeVisible();
  const ieltsEntry = page.getByRole('link', { name: '进入学习 →' });
  await expect(ieltsEntry).toHaveAttribute('href', './ielts/index.html');
  await ieltsEntry.click();
  await expect(page).toHaveTitle('WordLab 50 · 雅思薄弱词专项训练');
  await page.goBack();
  await expect(page.getByRole('heading', { name: /沪教版 英语/ })).toBeVisible();

  await page.getByRole('button', { name: /打字射击/ }).click();
  await expect(page.getByText('PHASER 4 ENGINE')).toBeVisible();
  await page.getByRole('button', { name: '开始任务' }).click();

  await expect(page.locator('#engineStage canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('输入英文答案')).toBeVisible();
  await page.getByRole('button', { name: '暂停' }).click();
  await expect(page.getByText('已暂停')).toBeVisible();
  await page.getByRole('button', { name: '继续' }).click();
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page.getByRole('button', { name: '开始任务' })).toBeVisible();
});

test('lets learners skip word-form questions before using hints', async ({ page }) => {
  await page.goto('/ielts/index.html');

  await page.getByRole('button', { name: /03 词形变换/ }).click();
  const skipButton = page.getByRole('button', { name: '先跳过本题，稍后复习' });

  await expect(page.locator('[data-form-task-type="family"]')).toBeVisible();
  await expect(skipButton).toBeVisible();
  await expect(page.getByText('beautify', { exact: true })).toHaveCount(0);

  await skipButton.click();

  await expect(page.locator('[data-form-task-type="context"]')).toBeVisible();
  await expect(page.getByText('第一步：空格需要哪一种词性？')).toBeVisible();
  await expect(skipButton).toBeVisible();

  const historyDetail = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return saved.history?.at(-1)?.detail;
  });
  expect(historyDetail).toBe('主动跳过；未显示答案');

  await skipButton.click();
  await expect(page.locator('.training-count')).toHaveText('3 / 12');
});

test('presents daily practice as one connected learning loop with secondary repair stations', async ({
  page,
}) => {
  await installControllableAudio(page);
  await page.goto('/ielts/index.html');

  await expect(page.getByRole('heading', { name: '同一个词，走完一条学习闭环' })).toBeVisible();
  await expect(page.locator('[data-daily-plan]')).toHaveAttribute('data-new-count', '2');
  const estimatedSeconds = Number(
    await page.locator('[data-daily-plan]').getAttribute('data-estimated-seconds'),
  );
  expect(estimatedSeconds).toBeLessThanOrEqual(720);
  await expect(page.locator('.integrated-loop li')).toHaveText([
    '01声音与核心义听辨 · 跟读',
    '02无提示拼写盲听 · 检索',
    '03词形与构词判断 · 变形',
    '04搭配到句架词块 · 复现',
  ]);
  await expect(page.getByRole('heading', { name: '专项练习是错误修复站' })).toBeVisible();

  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  await expect(page.getByRole('heading', { name: '第 1 关 · 声音与核心义' })).toBeVisible();
  await expect(page.locator('.training-count')).toHaveText('1 / 8');
  const activeWordId = await page.locator('.training-panel').getAttribute('data-word-id');
  const activeWord = await page.evaluate(
    (wordId) => window.IELTS_VOCABULARY.find((word) => word.id === wordId),
    activeWordId,
  );
  await expect(page.getByRole('heading', { name: '先听，不看拼写' })).toBeVisible();
  await expect(page.getByText(activeWord.word, { exact: true })).toHaveCount(0);
  const syllableChoices = page.locator('[data-action="sound-syllables"]');
  await expect(syllableChoices.first()).toBeDisabled();
  await page.getByRole('button', { name: /播放先听/ }).click();
  await expect(syllableChoices.first()).toBeEnabled();
  await page
    .locator(`[data-action="sound-syllables"][data-value="${String(activeWord.syllables.length)}"]`)
    .click();
  await expect(page.getByRole('heading', { name: activeWord.word })).toBeVisible();
  const stages = page.locator('.learning-stage-track li');
  await expect(stages).toHaveCount(4);
  await expect(stages.filter({ hasText: '声音与核心义' })).toHaveClass(/is-current/);

  await page.getByRole('button', { name: '完成声音对照 →' }).click();
  await expect(page.getByRole('heading', { name: '第 2 关 · 无提示拼写' })).toBeVisible();
  await expect(stages.filter({ hasText: '声音与核心义' })).toHaveClass(/is-done/);
  await expect(stages.filter({ hasText: '无提示拼写' })).toHaveClass(/is-current/);
  const soundEvidence = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return saved.history?.at(-1);
  });
  expect(soundEvidence).toMatchObject({ skill: 'sound', correct: true });
  expect(soundEvidence.detail).toContain('录音跟读不计自动评分');
});

test('browser back exits an active daily session before leaving WordLab', async ({ page }) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  await expect(page.getByRole('heading', { name: '第 1 关 · 声音与核心义' })).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL(/\/ielts\/index\.html$/);
  await expect(page.getByRole('heading', { name: '同一个词，走完一条学习闭环' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始今日训练 →' })).toBeVisible();
});

test('browser back still exits after leaving and starting a second daily session', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  await expect(page.getByRole('heading', { name: '第 1 关 · 声音与核心义' })).toBeVisible();

  await page.getByRole('button', { name: '退出' }).click();
  await expect(page.getByRole('heading', { name: '同一个词，走完一条学习闭环' })).toBeVisible();
  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  await expect(page.getByRole('heading', { name: '第 1 关 · 声音与核心义' })).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL(/\/ielts\/index\.html$/);
  await expect(page.getByRole('heading', { name: '同一个词，走完一条学习闭环' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始今日训练 →' })).toBeVisible();
});

test('leaving a session does not leave a duplicate today entry in browser history', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: '进入学习 →' }).click();
  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  await expect(page.getByRole('heading', { name: '第 1 关 · 声音与核心义' })).toBeVisible();

  await page.getByRole('button', { name: '退出' }).click();
  await expect(page.getByRole('heading', { name: '同一个词，走完一条学习闭环' })).toBeVisible();
  await page.goBack();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /沪教版 英语/ })).toBeVisible();
});

test('refreshing an active session clears its stale history marker', async ({ page }) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  await expect(page.getByRole('heading', { name: '第 1 关 · 声音与核心义' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: '同一个词，走完一条学习闭环' })).toBeVisible();
  expect(await page.evaluate(() => history.state?.wordlabSession)).not.toBe(true);

  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  await page.goBack();

  await expect(page).toHaveURL(/\/ielts\/index\.html$/);
  await expect(page.getByRole('heading', { name: '同一个词，走完一条学习闭环' })).toBeVisible();
});

test('sound precheck keeps spelling hidden and a wrong diagnosis cannot count as correct', async ({
  page,
}) => {
  await installControllableAudio(page);
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /01 音节听辨与自练/ }).click();

  const activeWordId = await page.locator('.training-panel').getAttribute('data-word-id');
  const activeWord = await page.evaluate(
    (wordId) => window.IELTS_VOCABULARY.find((word) => word.id === wordId),
    activeWordId,
  );
  await expect(page.getByText(activeWord.word, { exact: true })).toHaveCount(0);
  await expect(page.locator('.ipa')).toHaveCount(0);
  await expect(page.locator('.meaning-line')).toHaveCount(0);
  await expect(page.locator('.word-stage .topic-badge')).toHaveCount(0);
  await expect(page.getByRole('group', { name: /播放主口音/ })).toBeVisible();
  const precheckSkip = page.getByRole('button', { name: '听不出来，先看拼写' });
  await expect(precheckSkip).toBeVisible();
  expect(
    Number.parseFloat(await precheckSkip.evaluate((element) => getComputedStyle(element).fontSize)),
  ).toBeGreaterThan(0);

  const precheckAudio = page.locator('[data-sound-precheck] [data-action="play-word"]');
  await precheckAudio.click();
  await expect(precheckAudio).toHaveAttribute('aria-label', /暂停先听/);
  await precheckAudio.click();
  await expect(precheckAudio).toHaveAttribute('aria-label', /继续先听/);
  await precheckAudio.click();
  await expect(precheckAudio).toHaveAttribute('aria-label', /暂停先听/);
  const wrongCount = (activeWord.syllables.length % 5) + 1;
  await page.locator(`[data-action="sound-syllables"][data-value="${String(wrongCount)}"]`).click();
  await expect(page.getByText('音节听辨需要复习')).toBeVisible();
  await page.getByRole('button', { name: '完成声音对照 →' }).click();

  const history = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return saved.history?.at(-1);
  });
  expect(history.skill).toBe('sound');
  expect(history.correct).toBe(false);
  expect(history.detail).toContain('预听音节：错误');
});

test('skipping the sound precheck can never become a correct sound result', async ({ page }) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /01 音节听辨与自练/ }).click();
  await page.getByRole('button', { name: '听不出来，先看拼写' }).click();
  await expect(page.getByText('预听记录：暂时听不出')).toBeVisible();
  await page.getByRole('button', { name: '完成声音对照 →' }).click();

  const history = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return saved.history?.at(-1);
  });
  expect(history.skill).toBe('sound');
  expect(history.correct).toBe(false);
  expect(history.detail).toContain('预听音节：主动跳过');
});

test('sound choices stay locked when natural audio fails to start', async ({ page }) => {
  await page.addInitScript(() => {
    class FailingAudio extends EventTarget {
      currentTime = 0;
      playbackRate = 1;
      preload = '';
      paused = true;
      ended = false;

      play() {
        return Promise.reject(new Error('audio failed'));
      }

      pause() {
        this.paused = true;
      }
    }
    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: FailingAudio,
    });
  });
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /01 音节听辨与自练/ }).click();

  const choices = page.locator('[data-action="sound-syllables"]');
  await expect(choices.first()).toBeDisabled();
  await page.getByRole('button', { name: /播放先听/ }).click();
  await expect(choices.first()).toBeDisabled();
  await expect(page.getByText('自然语音加载失败，请检查网络后重试。')).toBeVisible();
});

test('enthusiasm precheck uses five audible syllables', async ({ page }) => {
  await page.goto('/ielts/index.html');
  const enthusiasm = await page.evaluate(() =>
    window.IELTS_VOCABULARY.find((word) => word.id === 'enthusiasm'),
  );
  expect(enthusiasm.ipa).toBe('/ɪnˈθjuːziæzəm/');
  expect(enthusiasm.syllables).toHaveLength(5);
  expect(enthusiasm.syllables.join('').toLowerCase()).toBe('enthusiasm');
});

test('chaparral source misspelling stays hidden until the audio-only precheck is over', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  await seedSingleDueSkill(page, 'chaparral', 'sound');
  await page.getByRole('button', { name: /01 音节听辨与自练/ }).click();

  await expect(page.locator('.training-panel')).toHaveAttribute('data-word-id', 'chaparral');
  const precheck = page.locator('[data-sound-precheck]');
  await expect(precheck.getByText('chaparral', { exact: true })).toHaveCount(0);
  await expect(precheck.getByText(/chapparal/i)).toHaveCount(0);

  await page.getByRole('button', { name: '听不出来，先看拼写' }).click();
  await expect(page.getByRole('heading', { name: 'chaparral' })).toBeVisible();
  await expect(page.getByText('原输入误拼：chapparal')).toBeVisible();
});

test('mesquite audio controls switch the visible UK and US IPA', async ({ page }) => {
  await installControllableAudio(page);
  await page.goto('/ielts/index.html');
  await seedSingleDueSkill(page, 'mesquite', 'sound');
  await page.getByRole('button', { name: /01 音节听辨与自练/ }).click();

  await page.getByRole('button', { name: /播放先听 · 英/ }).click();
  await page.locator('[data-action="sound-syllables"][data-value="2"]').click();

  const ipa = page.locator('[data-ipa-display]');
  await expect(ipa).toHaveText('UK /mesˈkiːt/');
  await page.getByRole('button', { name: '播放单词 · 美' }).click();
  await expect(ipa).toHaveText('US /məˈskiːt/');
  await page.getByRole('button', { name: '播放单词 · 英' }).click();
  await expect(ipa).toHaveText('UK /mesˈkiːt/');
});

test('daily practice schedules only a due ability plus one transfer gate', async ({ page }) => {
  await page.goto('/ielts/index.html');
  const word = await page.evaluate(() => window.IELTS_VOCABULARY[0]);
  await page.evaluate((target) => {
    const old = Date.now() - 2 * 86_400_000;
    const future = Date.now() + 7 * 86_400_000;
    const stable = {
      attempts: 1,
      correct: 1,
      level: 1,
      due: future,
      last: old,
    };
    localStorage.setItem(
      'els-ielts-wordlab-v1',
      JSON.stringify({
        version: 3,
        settings: { accent: 'uk', dailyNew: 0 },
        daily: {
          date: '',
          newIds: [],
          carryoverIds: [],
          newSelectionDone: false,
          completedAt: 0,
        },
        words: {
          [target.id]: {
            skills: {
              sound: stable,
              spell: { attempts: 2, correct: 1, level: 1, due: 0, last: old },
              forms: stable,
              sentence: stable,
            },
          },
        },
        history: [],
        journal: [],
      }),
    );
  }, word);
  await page.reload();

  await expect(page.locator('[data-daily-plan]')).toHaveAttribute('data-new-count', '0');
  await page.getByRole('button', { name: '开始今日训练 →' }).click();

  const stages = page.locator('.learning-stage-track li');
  await expect(stages).toHaveCount(2);
  await expect(stages.nth(0)).toHaveAttribute('data-skill', 'spell');
  await expect(stages.nth(0)).toHaveAttribute('data-role', 'review');
  await expect(stages.nth(1)).toHaveAttribute('data-skill', 'forms');
  await expect(stages.nth(1)).toHaveAttribute('data-role', 'transfer');
  await expect(stages.locator('[data-skill="sound"]')).toHaveCount(0);
  await expect(stages.locator('[data-skill="sentence"]')).toHaveCount(0);

  await page.getByRole('button', { name: '先跳过（稍后复习）' }).click();
  await expect(page.locator('[data-form-task-type="context"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '本词第 2 步 · 词形与构词' })).toBeVisible();
});

test('legacy daily-new settings migrate to two bounded new words', async ({ page }) => {
  await page.goto('/ielts/index.html');
  await page.evaluate(() => {
    localStorage.setItem(
      'els-ielts-wordlab-v1',
      JSON.stringify({
        version: 1,
        settings: { accent: 'uk', dailyNew: 8 },
        daily: { date: '', newIds: [] },
        words: {},
        history: [],
        journal: [],
      }),
    );
  });
  await page.reload();

  const plan = page.locator('[data-daily-plan]');
  await expect(plan).toHaveAttribute('data-new-count', '2');
  expect(Number(await plan.getAttribute('data-estimated-seconds'))).toBeLessThanOrEqual(720);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}'),
  );
  expect(saved.version).toBe(3);
  expect(saved.settings.dailyNew).toBe(2);
  expect(saved.daily.newIds).toHaveLength(2);

  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  await expect(page.locator('.training-count')).toHaveText('1 / 8');
  await expect(page.locator('.learning-stage-track li')).toHaveCount(4);
});

test('v2 sentence self-ratings migrate to archived practice instead of mastery evidence', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  const word = await page.evaluate(() => window.IELTS_VOCABULARY[0]);
  const legacySentence = {
    attempts: 4,
    correct: 4,
    level: 4,
    due: Date.now() + 86_400_000,
    last: Date.now() - 86_400_000,
  };
  await page.evaluate(
    ({ target, legacy }) => {
      localStorage.setItem(
        'els-ielts-wordlab-v1',
        JSON.stringify({
          version: 2,
          settings: { accent: 'uk', dailyNew: 0 },
          daily: {
            date: '',
            newIds: [],
            carryoverIds: [],
            newSelectionDone: false,
          },
          words: {
            [target.id]: {
              skills: {
                sentence: legacy,
              },
            },
          },
          history: [
            {
              wordId: target.id,
              word: target.word,
              skill: 'sentence',
              correct: true,
              detail: '旧版自评正确',
              at: Date.now() - 1000,
            },
          ],
          journal: [
            {
              wordId: target.id,
              word: target.word,
              text: 'A legacy learner sentence.',
              reviewed: true,
              teacherVerified: true,
              status: 'verified',
              at: Date.now() - 1000,
            },
          ],
        }),
      );
    },
    { target: word, legacy: legacySentence },
  );
  await page.reload();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}'),
  );
  expect(saved.version).toBe(3);
  expect(saved.words[word.id].legacySentencePractice).toMatchObject(legacySentence);
  expect(saved.words[word.id].skills.sentence).toMatchObject({
    attempts: 0,
    correct: 0,
    pending: 0,
    level: 0,
    due: 0,
    last: 0,
    needsReview: true,
    relearnRequired: true,
  });
  expect(saved.history[0]).toMatchObject({
    skill: 'sentence',
    correct: null,
    legacyUnverified: true,
  });
  expect(saved.journal[0]).toMatchObject({
    status: 'legacy_unverified',
    teacherVerified: false,
  });
});

test('v3 normalisation rejects impossible levels and lets the latest core error win', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  const word = await page.evaluate(() => window.IELTS_VOCABULARY[0]);
  await page.evaluate((target) => {
    const old = Date.now() - 2 * 86_400_000;
    const future = Date.now() + 7 * 86_400_000;
    const stableSkill = {
      attempts: 4,
      correct: 4,
      pending: 0,
      level: 4,
      due: future,
      last: old,
      needsReview: false,
      relearnRequired: false,
    };
    localStorage.setItem(
      'els-ielts-wordlab-v1',
      JSON.stringify({
        version: 3,
        settings: { accent: 'uk', dailyNew: 0 },
        daily: {
          date: '',
          newIds: [],
          carryoverIds: [],
          newSelectionDone: false,
          completedAt: 0,
        },
        words: {
          [target.id]: {
            skills: {
              sound: { ...stableSkill, attempts: 0, correct: 0, level: 4 },
              spell: { ...stableSkill },
              forms: { ...stableSkill },
              sentence: { ...stableSkill },
            },
          },
        },
        history: [
          {
            wordId: target.id,
            word: target.word,
            skill: 'spell',
            correct: false,
            at: Date.now(),
          },
          {
            wordId: target.id,
            word: target.word,
            skill: 'forms',
            correct: false,
            coreAttempt: false,
            source: 'visual',
            at: Date.now() + 1,
          },
        ],
        journal: [],
      }),
    );
  }, word);
  await page.reload();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}'),
  );
  expect(saved.words[word.id].skills.sound).toMatchObject({
    attempts: 0,
    correct: 0,
    level: 0,
  });
  expect(saved.words[word.id].skills.spell).toMatchObject({
    level: 4,
    needsReview: true,
  });
  expect(saved.words[word.id].skills.forms).toMatchObject({
    level: 4,
    needsReview: false,
  });
  await expect(
    page
      .locator('.metric')
      .filter({ hasText: '四项受控任务达标且无待复习' })
      .locator('strong'),
  ).toHaveText('0');
});

test('a latest spelling error removes level-five stability until independent correction', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  const word = await page.evaluate(() => window.IELTS_VOCABULARY[0]);
  await page.evaluate((target) => {
    const old = Date.now() - 2 * 86_400_000;
    const future = Date.now() + 7 * 86_400_000;
    const stableSkill = {
      attempts: 5,
      correct: 5,
      pending: 0,
      level: 5,
      due: future,
      last: old,
      needsReview: false,
      relearnRequired: false,
    };
    localStorage.setItem(
      'els-ielts-wordlab-v1',
      JSON.stringify({
        version: 3,
        settings: { accent: 'uk', dailyNew: 0 },
        daily: {
          date: '',
          newIds: [],
          carryoverIds: [],
          newSelectionDone: false,
          completedAt: 0,
        },
        words: {
          [target.id]: {
            skills: {
              sound: { ...stableSkill },
              spell: { ...stableSkill, due: 0 },
              forms: { ...stableSkill },
              sentence: { ...stableSkill },
            },
          },
        },
        history: [],
        journal: [],
      }),
    );
  }, word);
  await page.reload();

  const stableMetric = page
    .locator('.metric')
    .filter({ hasText: '四项受控任务达标且无待复习' });
  await expect(stableMetric.locator('strong')).toHaveText('1');

  await page.getByRole('button', { name: /02 听写拼词/ }).click();
  await expect(page.locator('.training-panel')).toHaveAttribute('data-word-id', word.id);
  const spellingSkip = page.getByRole('button', { name: '先跳过（稍后复习）' });
  await expect(async () => {
    const needsReview = await page.evaluate((wordId) => {
      const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
      return saved.words?.[wordId]?.skills?.spell?.needsReview === true;
    }, word.id);
    if (!needsReview) await spellingSkip.click();
    expect(
      await page.evaluate((wordId) => {
        const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
        return saved.words?.[wordId]?.skills?.spell?.needsReview === true;
      }, word.id),
    ).toBe(true);
  }).toPass({ timeout: 5_000 });
  await page.locator('[data-view-link="progress"]:visible').click();
  await expect(stableMetric.locator('strong')).toHaveText('0');

  let saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}'),
  );
  expect(saved.words[word.id].skills.spell).toMatchObject({
    level: 4,
    needsReview: true,
  });
  expect(saved.history.at(-1)).toMatchObject({
    wordId: word.id,
    skill: 'spell',
    correct: false,
  });

  await page.locator('[data-view-link="spell"]:visible').click();
  await expect(page.locator('.training-panel')).toHaveAttribute('data-word-id', word.id);
  await page.getByLabel('TYPE WHAT YOU HEAR').fill(word.word);
  await page.getByRole('button', { name: '检查拼写' }).click();
  await page.locator('[data-view-link="progress"]:visible').click();
  await expect(stableMetric.locator('strong')).toHaveText('1');

  saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}'),
  );
  expect(saved.words[word.id].skills.spell).toMatchObject({
    level: 5,
    needsReview: false,
  });
  expect(saved.history.at(-1)).toMatchObject({
    wordId: word.id,
    skill: 'spell',
    correct: true,
  });
});

test('a skipped due task does not immediately loop again on the same day', async ({ page }) => {
  await page.goto('/ielts/index.html');
  const word = await page.evaluate(() => window.IELTS_VOCABULARY[0]);
  await page.evaluate((target) => {
    const old = Date.now() - 2 * 86_400_000;
    const future = Date.now() + 7 * 86_400_000;
    const stable = {
      attempts: 1,
      correct: 1,
      level: 1,
      due: future,
      last: old,
    };
    localStorage.setItem(
      'els-ielts-wordlab-v1',
      JSON.stringify({
        version: 3,
        settings: { accent: 'uk', dailyNew: 0 },
        daily: {
          date: '',
          newIds: [],
          carryoverIds: [],
          newSelectionDone: false,
          completedAt: 0,
        },
        words: {
          [target.id]: {
            skills: {
              sound: stable,
              spell: { attempts: 1, correct: 0, level: 0, due: 0, last: old },
              forms: stable,
              sentence: stable,
            },
          },
        },
        history: [],
        journal: [],
      }),
    );
  }, word);
  await page.reload();

  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  const spellingSkip = page.getByRole('button', { name: '先跳过（稍后复习）' });
  const formSkip = page.getByRole('button', { name: '先跳过本题，稍后复习' });
  await expect(async () => {
    if (await spellingSkip.isVisible()) await spellingSkip.click();
    expect(await formSkip.isVisible()).toBe(true);
  }).toPass({ timeout: 5_000 });
  const completedHeading = page.getByRole('heading', { name: '本轮训练完成' });
  await expect(async () => {
    if (await formSkip.isVisible()) await formSkip.click();
    expect(await completedHeading.isVisible()).toBe(true);
  }).toPass({ timeout: 5_000 });

  await page.getByRole('button', { name: '返回今日 →' }).click();
  await expect(page.getByRole('heading', { name: '今日到期任务已完成' })).toBeVisible();
  await expect(page.getByRole('button', { name: '今日任务已完成' })).toBeDisabled();
  const completedAt = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return saved.daily?.completedAt;
  });
  expect(completedAt).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: '今日到期任务已完成' })).toBeVisible();
  await expect(page.getByRole('button', { name: '今日任务已完成' })).toBeDisabled();
  await expect(page.locator('[data-daily-plan]')).toHaveAttribute('data-new-count', '0');
});

test('resumes only unfinished stages for a partially learned daily word', async ({ page }) => {
  await page.goto('/ielts/index.html');
  const word = await page.evaluate(() => window.IELTS_VOCABULARY[0]);
  await page.evaluate((target) => {
    const today = new Date();
    const dateKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    localStorage.setItem(
      'els-ielts-wordlab-v1',
      JSON.stringify({
        version: 2,
        settings: { accent: 'uk', dailyNew: 2 },
        daily: {
          date: dateKey,
          newIds: [target.id],
          carryoverIds: [],
          newSelectionDone: true,
        },
        words: {
          [target.id]: {
            skills: {
              sound: {
                attempts: 1,
                correct: 1,
                level: 1,
                due: Date.now() + 86_400_000,
                last: Date.now(),
              },
            },
          },
        },
        history: [],
        journal: [],
      }),
    );
  }, word);
  await page.reload();

  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  const stages = page.locator('.learning-stage-track li');
  await expect(stages).toHaveCount(3);
  await expect(stages.nth(0)).toHaveAttribute('data-skill', 'spell');
  await expect(stages.nth(1)).toHaveAttribute('data-skill', 'forms');
  await expect(stages.nth(2)).toHaveAttribute('data-skill', 'sentence');
  await expect(stages.locator('[data-skill="sound"]')).toHaveCount(0);
  await expect(page.locator('.training-count')).toHaveText('1 / 3');
});

test('unlocks the atlas and story only after completing a pictured core word family', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /03 词形变换/ }).click();

  const familyTask = page.locator('[data-form-task-type="family"]');
  await expect(familyTask).toContainText('beauty');
  await expect(page.locator('.form-family-atlas')).toHaveCount(0);
  await expect(page.locator('.visual-family-story')).toHaveCount(0);

  const hiddenAnswers = ['beautify', 'beautiful', 'beautifully'];
  const incompleteHtml = (await familyTask.evaluate((element) => element.outerHTML)).toLowerCase();
  for (const answer of hiddenAnswers) {
    expect(incompleteHtml).not.toContain(answer);
  }

  await familyTask.locator('input[name="v."]').fill('beautify');
  await familyTask.locator('input[name="adj."]').fill('beautiful');
  await familyTask.locator('input[name="adv."]').fill('beautifully');
  await familyTask.getByRole('button', { name: '检查3格' }).click();

  const atlas = page.locator('.form-family-atlas');
  const image = atlas.locator('img');
  await expect(atlas).toBeVisible();
  await expect(image).toHaveAttribute('alt', /校园花园的四格无文字场景/);
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => ({
        width: element.naturalWidth,
        height: element.naturalHeight,
      })),
    )
    .toEqual({ width: 1200, height: 800 });

  const story = page.locator('.visual-family-story');
  await expect(story).toBeVisible();
  await expect(story).toHaveAttribute('open', '');
  await expect(story).toContainText('四格故事链');
  await expect(story.locator('.visual-family-story-en')).toContainText(
    'Beauty inspired the garden project.',
  );
  for (const answer of hiddenAnswers) {
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '读完了，下一题 →' })).toBeVisible();
});

test('context form cards accept both standard inflection variants', async ({ page }) => {
  await page.goto('/ielts/index.html');
  const cases = [
    { id: 'spruce', answers: ['spruces', 'spruce'] },
    { id: 'caribou', answers: ['caribou', 'caribous'] },
    { id: 'broadcast', answers: ['broadcast', 'broadcasted'] },
  ];

  for (const testCase of cases) {
    for (const [answerIndex, answer] of testCase.answers.entries()) {
      await test.step(`${testCase.id} accepts ${answer}`, async () => {
        await seedSingleDueSkill(page, testCase.id, 'forms');
        await page.getByRole('button', { name: '开始今日训练 →' }).click();
        await expect(page.locator('.training-panel')).toHaveAttribute('data-word-id', testCase.id);
        await expect(page.locator('[data-form-task-type="context"]')).toBeVisible();

        const need = await page.evaluate((targetId) => {
          const word = window.IELTS_VOCABULARY.find(
            (candidate: { id: string; form: { need: string } }) => candidate.id === targetId,
          );
          return word!.form.need;
        }, testCase.id);
        await page.locator(`[data-action="choose-pos"][data-pos="${need}"]`).click();
        await page.locator('#formInput').fill(answer);
        await page.getByRole('button', { name: '检查词形' }).click();
        await expect(page.locator('#formFeedback')).toContainText(answer);
        if (answerIndex > 0) {
          await expect(page.locator('#formFeedback')).toContainText('可接受的标准变体');
        }

        const latest = await page.evaluate(() => {
          const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
          return saved.history?.at(-1);
        });
        expect(latest).toMatchObject({
          wordId: testCase.id,
          skill: 'forms',
          correct: true,
        });
      });
    }
  }
});

test('dictation audio pauses, resumes, and ignores stale playback events', async ({ page }) => {
  await installControllableAudio(page);
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /02 听写拼词/ }).click();

  const mainPlay = page.locator('.listen-orb');
  await expect(mainPlay).toContainText('▶');
  await mainPlay.click();
  await expect(mainPlay).toHaveAttribute('aria-label', '暂停单词');
  await expect(mainPlay).toContainText('❚❚');
  await expect(page.locator('#listenStatus')).toContainText('点击暂停');

  await page.evaluate(() => {
    const audios = (
      window as unknown as {
        __controllableAudio: Array<{ currentTime: number }>;
      }
    ).__controllableAudio;
    audios[0]!.currentTime = 2.4;
  });
  await mainPlay.click();
  await expect(mainPlay).toHaveAttribute('aria-label', '继续单词');
  await expect(page.locator('#listenStatus')).toContainText('已暂停');

  await mainPlay.click();
  await expect(mainPlay).toHaveAttribute('aria-label', '暂停单词');
  await page.waitForTimeout(50);
  await expect(mainPlay).toHaveAttribute('aria-label', '暂停单词');
  const resumedState = await page.evaluate(() => {
    const audios = (
      window as unknown as {
        __controllableAudio: Array<{ currentTime: number }>;
      }
    ).__controllableAudio;
    return { count: audios.length, currentTime: audios[0]!.currentTime };
  });
  expect(resumedState).toEqual({ count: 1, currentTime: 2.4 });

  const normalReplay = page.locator('.spell-replay-button[data-rate="1"]');
  const slowReplay = page.locator('.spell-replay-button[data-rate="0.85"]');
  await normalReplay.click();
  await expect(normalReplay).toHaveAttribute('aria-label', '暂停正常 1.0×');
  await slowReplay.click();
  await expect(slowReplay).toHaveAttribute('aria-label', '暂停慢速 0.85×');

  await page.evaluate(() => {
    const audios = (
      window as unknown as {
        __controllableAudio: Array<EventTarget & { ended: boolean; paused: boolean }>;
      }
    ).__controllableAudio;
    const stale = audios[audios.length - 2]!;
    stale.ended = true;
    stale.paused = true;
    stale.dispatchEvent(new Event('ended'));
    stale.dispatchEvent(new Event('error'));
  });
  await expect(slowReplay).toHaveAttribute('aria-label', '暂停慢速 0.85×');

  await page.evaluate(() => {
    const audios = (
      window as unknown as {
        __controllableAudio: Array<EventTarget & { ended: boolean; paused: boolean }>;
      }
    ).__controllableAudio;
    const active = audios.at(-1)!;
    active.ended = true;
    active.paused = true;
    active.dispatchEvent(new Event('ended'));
  });
  await expect(slowReplay).toHaveAttribute('aria-label', '播放慢速 0.85×');
  await expect(page.locator('#listenStatus')).toContainText('播放完成');
});

test('service worker lets ranged natural-audio requests reach the network', async ({ page }) => {
  await page.goto('/ielts/index.html');
  const controlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  if (!controlled) await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  const result = await page.evaluate(async () => {
    const response = await fetch('./audio/uk/blubber.mp3?v=range-regression', {
      headers: { Range: 'bytes=0-1023' },
      cache: 'no-store',
    });
    return { ok: response.ok, status: response.status };
  });
  expect(result.ok).toBe(true);
  expect([200, 206]).toContain(result.status);
});

test('service worker caches the on-demand corpus for offline reuse', async ({ page, context }) => {
  await page.goto('/ielts/index.html');
  const controlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  if (!controlled) await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const response = await fetch('./corpus/catalog.json');
        const payload = await response.json();
        const cached = await caches.match('./corpus/catalog.json');
        return response.ok && payload.entries.length === 7229 && Boolean(cached);
      }),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.locator('[data-view-link="visual"]:visible').first().click();
  await page.getByRole('button', { name: /词库地图/ }).click();
  await expect(page.locator('.corpus-stat-grid')).toContainText('7,229');
  await expect(page.locator('[data-corpus-results] .corpus-entry')).toHaveCount(60);
  await context.setOffline(false);
});

test('dictation keeps answers hidden through hints and supports skipping', async ({ page }) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /02 听写拼词/ }).click();

  const question = page.locator('.question-lead');
  const input = page.getByLabel('TYPE WHAT YOU HEAR');
  const hintButton = page.getByRole('button', { name: '给一点提示' });
  const answer = await page.locator('.listen-orb').evaluate((button) => {
    const id = (button as HTMLElement).dataset.audioId;
    return window.IELTS_VOCABULARY.find((word: { id: string; word: string }) => word.id === id)!
      .word;
  });

  await expect(question).not.toContainText('个字母');
  await expect(input).not.toBeFocused();
  await expect(page.getByRole('button', { name: '先跳过（稍后复习）' })).toBeVisible();

  await hintButton.click();
  await expect(page.locator('#spellFeedback')).toContainText('目标词');
  await expect(page.getByRole('button', { name: '再给音节提示' })).toBeVisible();
  await page.getByRole('button', { name: '再给音节提示' }).click();
  await expect(page.locator('#spellFeedback')).toContainText('音节轮廓');
  await page.getByRole('button', { name: '最后给乱序字母' }).click();
  await expect(page.locator('.scrambled-letter-bank')).toBeVisible();
  await expect(page.getByText(answer, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '提示已用完' })).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const actions = document.querySelector('.spell-action-grid')!.getBoundingClientRect();
        const bottomInset = innerWidth <= 780 ? 84 : 0;
        return actions.top >= 0 && actions.bottom <= innerHeight - bottomInset + 1;
      }),
    )
    .toBe(true);

  await page.getByRole('button', { name: '先跳过（稍后复习）' }).click();
  await expect(page.locator('.training-count')).toHaveText('2 / 10');
  const history = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return saved.history?.at(-1);
  });
  expect(history.correct).toBe(false);
  expect(history.detail).toBe('尝试或使用提示后主动跳过；未显示答案');
});

test('dictation double tap skips only one question', async ({ page }) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /02 听写拼词/ }).click();

  const skipButton = page.getByRole('button', { name: '先跳过（稍后复习）' });
  await skipButton.scrollIntoViewIfNeeded();
  const box = await skipButton.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.click(x, y);
  await page.waitForTimeout(50);
  await page.mouse.click(x, y);

  await expect(page.locator('.training-count')).toHaveText('2 / 10');
  const skippedEntries = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return saved.history?.filter(
      (item: { skill: string; detail: string }) =>
        item.skill === 'spell' && item.detail === '主动跳过；未显示答案',
    ).length;
  });
  expect(skippedEntries).toBe(1);
});

test('dictation waits for the learner after a correct spelling', async ({ page }) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /02 听写拼词/ }).click();

  const answer = await page.locator('.listen-orb').evaluate((button) => {
    const id = (button as HTMLElement).dataset.audioId;
    return window.IELTS_VOCABULARY.find((word: { id: string; word: string }) => word.id === id)!
      .word;
  });
  const input = page.getByLabel('TYPE WHAT YOU HEAR');
  await input.fill(answer.toUpperCase());
  await page.getByRole('button', { name: '检查拼写' }).click();

  await expect(page.locator('#spellFeedback')).toContainText('首次正确');
  await expect(input).toBeDisabled();
  await expect(page.getByRole('button', { name: '下一题 →' })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.locator('.training-count')).toHaveText('1 / 10');

  await page.getByRole('button', { name: '下一题 →' }).click();
  await expect(page.locator('.training-count')).toHaveText('2 / 10');
});

test('keeps collocation recall unprompted until the learner opens the three-step workshop detail', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /04 句子工坊/ }).click();

  const stepNumbers = page.locator('.sentence-step > .sentence-step-header .step-number');
  await expect(stepNumbers).toHaveText(['1', '2', '3']);
  await expect(page.getByRole('heading', { name: '先从记忆中提取自然搭配' })).toBeVisible();
  await expect(page.getByText(/不要先看答案。口头说出或写下一个/)).toBeVisible();

  const targetWord = await page
    .locator('.sentence-steps .word-meta .pos-badge')
    .evaluate((element) => (element.textContent || '').split('·')[0]!.trim());
  const collocation = await page.evaluate((word) => {
    const entry = window.IELTS_VOCABULARY.find(
      (candidate: { word: string; collocation: string }) => candidate.word === word,
    );
    return entry?.collocation || '';
  }, targetWord);
  expect(collocation).not.toBe('');

  const detail = page.locator('[data-collocation-recall]');
  const answer = page.getByText(collocation, { exact: true });
  await expect(detail).not.toHaveAttribute('open', '');
  await expect(answer).toHaveCount(1);
  await expect(answer).toBeHidden();

  await detail.locator('summary').click();
  await expect(detail).toHaveAttribute('open', '');
  await expect(answer).toBeVisible();
});

test('lets learners skip the sentence workshop without revealing an answer', async ({ page }) => {
  await page.goto('/ielts/index.html');
  await page.getByRole('button', { name: /04 句子工坊/ }).click();

  const skipButton = page.getByRole('button', {
    name: '先跳过表达任务，稍后复习',
  });
  await expect(skipButton).toBeVisible();
  await expect(page.locator('#modelSentence')).toBeHidden();
  await skipButton.click();

  await expect(page.locator('.training-count')).toHaveText('2 / 10');
  await expect(page.locator('[data-collocation-recall] summary')).toBeFocused();
  const history = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return saved.history?.at(-1);
  });
  expect(history.skill).toBe('sentence');
  expect(history.correct).toBe(false);
  expect(history.detail).toBe('主动跳过搭配与句架任务；稍后复习');
});

test('smart repair practises only the weak ability recorded for a word', async ({ page }) => {
  await page.goto('/ielts/index.html');
  const word = await page.evaluate(() => window.IELTS_VOCABULARY[0]);
  await page.evaluate((target) => {
    localStorage.setItem(
      'els-ielts-wordlab-v1',
      JSON.stringify({
        version: 1,
        settings: { accent: 'uk', dailyNew: 6 },
        daily: { date: '', newIds: [] },
        words: {
          [target.id]: {
            skills: {
              sound: {
                attempts: 3,
                correct: 3,
                level: 3,
                due: 0,
                last: Date.now(),
              },
              spell: {
                attempts: 2,
                correct: 0,
                level: 0,
                due: 0,
                last: Date.now(),
              },
            },
          },
        },
        history: [
          {
            wordId: target.id,
            word: target.word,
            skill: 'spell',
            correct: false,
            detail: '主动跳过；未显示答案',
            at: Date.now(),
          },
        ],
        journal: [],
      }),
    );
  }, word);
  await page.reload();

  await page.getByRole('button', { name: '智能补弱（按错因）' }).click();
  await expect(page.getByRole('heading', { name: '听写拼词' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '本轮错误修复' })).toBeVisible();
  await expect(page.locator('.learning-stage-track')).toHaveCount(0);
  await expect(page.locator('.training-count')).toHaveText('1 / 1');
});

test('surface-complete nonsense stays pending and cannot raise sentence mastery', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  await seedSingleDueSkill(page, 'marine', 'sentence', {
    attempts: 2,
    correct: 2,
    level: 2,
    needsReview: false,
  });
  await page.getByRole('button', { name: /04 句子工坊/ }).click();
  await unlockSentenceRecall(page, 'marine');

  await page.getByLabel('HIDDEN SENTENCE RECALL').fill('Marine marine marine marine marine.');
  await page.getByRole('button', { name: '提交复现并对照' }).click();
  await expect(page.locator('#sentenceChecklist li.pass')).toHaveCount(4);
  await expect(page.locator('#sentenceFeedback')).toContainText(
    '表面检查通过，但与标准句不完全一致',
  );
  await page.getByRole('button', { name: '记录本次练习 →' }).click();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}'),
  );
  expect(saved.words.marine.skills.sentence).toMatchObject({
    attempts: 2,
    correct: 2,
    level: 2,
    pending: 1,
    needsReview: true,
  });
  expect(saved.journal.at(-1)).toMatchObject({
    wordId: 'marine',
    status: 'pending_human_review',
    teacherVerified: false,
  });
  expect(saved.history.at(-1)).toMatchObject({
    wordId: 'marine',
    skill: 'sentence',
    correct: null,
    pendingReview: true,
  });
});

test('first hidden exact recall records controlled evidence and raises sentence level', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  await seedSingleDueSkill(page, 'sturdy', 'sentence');
  await page.getByRole('button', { name: /04 句子工坊/ }).click();
  const standardSentence = await unlockSentenceRecall(page, 'sturdy');

  await page.getByLabel('HIDDEN SENTENCE RECALL').fill(standardSentence);
  await page.getByRole('button', { name: '提交复现并对照' }).click();
  await expect(page.locator('#sentenceFeedback')).toContainText('首次完整复现标准句');
  await page.getByRole('button', { name: '记录本次练习 →' }).click();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}'),
  );
  expect(saved.words.sturdy.skills.sentence).toMatchObject({
    attempts: 2,
    correct: 1,
    level: 1,
    needsReview: false,
  });
  expect(saved.journal.at(-1)).toMatchObject({
    wordId: 'sturdy',
    status: 'controlled_recall',
    teacherVerified: false,
  });
  expect(saved.history.at(-1)).toMatchObject({
    wordId: 'sturdy',
    skill: 'sentence',
    correct: true,
    detail: '标准句在隐藏后首次完整复现',
  });
});

test('exact recall after revealing the model remains corrected practice, not first-try evidence', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  await seedSingleDueSkill(page, 'sturdy', 'sentence', {
    attempts: 2,
    correct: 2,
    level: 2,
    needsReview: false,
  });
  await page.getByRole('button', { name: /04 句子工坊/ }).click();
  const standardSentence = await unlockSentenceRecall(page, 'sturdy', { reveal: true });

  await page.getByLabel('HIDDEN SENTENCE RECALL').fill(standardSentence);
  await page.getByRole('button', { name: '提交复现并对照' }).click();
  await expect(page.locator('#sentenceFeedback')).toContainText(
    '本轮看过答案或有过错误，只记录为纠错练习',
  );
  await page.getByRole('button', { name: '记录本次练习 →' }).click();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}'),
  );
  expect(saved.words.sturdy.skills.sentence).toMatchObject({
    attempts: 3,
    correct: 2,
    level: 1,
    needsReview: true,
  });
  expect(saved.journal.at(-1)).toMatchObject({
    wordId: 'sturdy',
    status: 'corrected_practice',
  });
  expect(saved.history.at(-1)).toMatchObject({
    wordId: 'sturdy',
    skill: 'sentence',
    correct: false,
    detail: '看过答案或纠错后复现；不计独立证据',
  });
});

test('editing after sentence comparison invalidates the old finish actions', async ({ page }) => {
  await page.goto('/ielts/index.html');
  await seedSingleDueSkill(page, 'sturdy', 'sentence');
  await page.getByRole('button', { name: /04 句子工坊/ }).click();
  const standardSentence = await unlockSentenceRecall(page, 'sturdy');
  const input = page.getByLabel('HIDDEN SENTENCE RECALL');

  await input.fill(standardSentence);
  await page.getByRole('button', { name: '提交复现并对照' }).click();
  const finishActions = page.locator('#sentenceFinishActions');
  await expect(finishActions).toBeVisible();
  await expect(page.locator('#modelSentence')).toBeVisible();

  await input.fill(`${standardSentence} Changed.`);
  await expect(finishActions).toBeHidden();
  await expect(page.locator('#modelSentence')).toBeHidden();
  await expect(page.locator('#sentenceFeedback')).toContainText('旧检查已失效');

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}'),
  );
  expect(saved.journal).toHaveLength(0);
  expect(saved.history).toHaveLength(0);
});

test('hides sentence-order capitalization and punctuation until reveal', async ({ page }) => {
  await page.goto('/ielts/index.html');

  await page.getByRole('button', { name: /04 句子工坊/ }).click();
  const chunkPool = page.getByLabel('待选词块');
  const chunkLabels = await chunkPool.getByRole('button').allTextContents();

  expect(chunkLabels.length).toBeGreaterThan(1);
  chunkLabels.forEach((label) => {
    expect(label).toBe(label.toLowerCase());
    expect(label).not.toMatch(/[.!?]$/);
  });
  expect(chunkLabels).not.toContain('.');
  await expect(page.getByLabel('HIDDEN SENTENCE RECALL')).toHaveCount(0);

  await page.getByRole('button', { name: '显示骨架' }).click();

  const solvedSentence = page.locator('.chunk-solved-sentence strong');
  await expect(solvedSentence).toBeVisible();
  await expect(solvedSentence).toHaveText(/^[A-Z].*[.!?]$/);
  await expect(page.getByLabel('HIDDEN SENTENCE RECALL')).toHaveCount(0);

  await page.getByRole('button', { name: '遮住骨架，开始复现' }).click();

  await expect(solvedSentence).toHaveCount(0);
  const writingInput = page.getByLabel('HIDDEN SENTENCE RECALL');
  await expect(writingInput).toBeVisible();

  await writingInput.fill('test.');
  await page.getByRole('button', { name: '提交复现并对照' }).click();
  await expect(page.locator('#modelSentence')).toBeVisible();
  await expect(page.getByRole('button', { name: '先跳过表达任务，稍后复习' })).toHaveCount(0);

  await page.getByRole('button', { name: '重新排序' }).click();
  await page.getByRole('button', { name: '显示骨架' }).click();
  await page.getByRole('button', { name: '遮住骨架，开始复现' }).click();

  await expect(page.locator('#modelSentence')).toBeHidden();
  await expect(writingInput).toHaveValue('');
});
