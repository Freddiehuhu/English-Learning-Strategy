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

test('opens the learning list and boots the Phaser mission', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /沪教版 英语/ })).toBeVisible();
  await expect(page.getByText('dinosaur', { exact: true }).first()).toBeVisible();

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
  await page.goto('/ielts/index.html');

  await expect(page.getByRole('heading', { name: '同一个词，走完一条学习闭环' })).toBeVisible();
  await expect(page.locator('.integrated-loop li')).toHaveText([
    '01声音与核心义听辨 · 跟读',
    '02无提示拼写盲听 · 检索',
    '03词形与构词判断 · 变形',
    '04搭配到表达词块 · 造句',
  ]);
  await expect(page.getByRole('heading', { name: '专项练习是错误修复站' })).toBeVisible();

  await page.getByRole('button', { name: '开始今日训练 →' }).click();
  await expect(page.getByRole('heading', { name: '第 1 关 · 声音与核心义' })).toBeVisible();
  const stages = page.locator('.learning-stage-track li');
  await expect(stages).toHaveCount(4);
  await expect(stages.filter({ hasText: '声音与核心义' })).toHaveClass(/is-current/);

  await page.getByRole('button', { name: '跟读清楚了 →' }).click();
  await expect(page.getByRole('heading', { name: '第 2 关 · 无提示拼写' })).toBeVisible();
  await expect(stages.filter({ hasText: '声音与核心义' })).toHaveClass(/is-done/);
  await expect(stages.filter({ hasText: '无提示拼写' })).toHaveClass(/is-current/);
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
  await expect(page.getByLabel('YOUR SENTENCE')).toHaveCount(0);

  await page.getByRole('button', { name: '显示骨架' }).click();

  const solvedSentence = page.locator('.chunk-solved-sentence strong');
  await expect(solvedSentence).toBeVisible();
  await expect(solvedSentence).toHaveText(/^[A-Z].*[.!?]$/);
  await expect(page.getByLabel('YOUR SENTENCE')).toHaveCount(0);

  await page.getByRole('button', { name: '遮住骨架，开始仿写' }).click();

  await expect(solvedSentence).toHaveCount(0);
  const writingInput = page.getByLabel('YOUR SENTENCE');
  await expect(writingInput).toBeVisible();

  await writingInput.fill('test.');
  await page.getByRole('button', { name: '检查并对照' }).click();
  await expect(page.locator('#modelSentence')).toBeVisible();

  await page.getByRole('button', { name: '重新排序' }).click();
  await page.getByRole('button', { name: '显示骨架' }).click();
  await page.getByRole('button', { name: '遮住骨架，开始仿写' }).click();

  await expect(page.locator('#modelSentence')).toBeHidden();
  await expect(writingInput).toHaveValue('');
});
