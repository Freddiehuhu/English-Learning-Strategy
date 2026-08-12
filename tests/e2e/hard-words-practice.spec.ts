import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.use({ serviceWorkers: 'block' });

const HARD_WORD_STORAGE_KEY = 'els-ielts-hard-word-practice-v1';
const CORE_STORAGE_KEY = 'els-ielts-wordlab-v1';
const catalog = JSON.parse(
  readFileSync(join(process.cwd(), 'public/ielts/corpus/student-hard-words.json'), 'utf8'),
) as {
  entries: Array<{
    id: string;
    displayWord: string;
    normalizedHeadword: string;
    difficultyCode: 1 | 2 | 3;
  }>;
};

type HardWordProgress = {
  version?: number;
  entries?: Record<
    string,
    {
      spell?: {
        attempts?: number;
        blindPasses?: number;
        repairPasses?: number;
        skips?: number;
      };
      sentence?: {
        submissions?: number;
        skips?: number;
        draft?: string;
        status?: string;
      };
    }
  >;
  journal?: Array<{
    wordId?: string;
    mode?: string;
    outcome?: string;
  }>;
};

async function hardProgress(page: Page): Promise<HardWordProgress> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{}') as HardWordProgress,
    HARD_WORD_STORAGE_KEY,
  );
}

async function openHardWords(page: Page) {
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
  await expect(page.locator('[data-hard-words-results]')).toBeVisible();
}

async function openWordPractice(page: Page, word: string, mode: 'spell' | 'sentence') {
  await openHardWords(page);
  await page.getByLabel('搜索单词或短语').fill(word);
  const row = page.locator(`[data-hard-word="${word}"]`);
  await expect(row).toBeVisible();
  await row.locator(`[data-action="hard-word-${mode}"]`).click();
  const practice = page.locator(`[data-hard-word-practice][data-mode="${mode}"]`);
  await expect(practice).toBeVisible();
  return practice;
}

async function startBatch(page: Page, mode: 'spell' | 'sentence') {
  await openHardWords(page);
  await page.locator(`[data-action="hard-words-start-${mode}"]`).click();
  await expect(page.locator(`[data-hard-word-practice][data-mode="${mode}"]`)).toBeVisible();
}

async function enterBlindRecall(practice: Locator) {
  const hide = practice.locator('[data-action="hard-word-hide"]');
  if (await hide.count()) await hide.click();
  await expect(practice.locator('[data-hard-word-spell-input]')).toBeVisible();
}

async function submitSpelling(practice: Locator, answer: string) {
  await practice.locator('[data-hard-word-spell-input]').fill(answer);
  await practice
    .locator('[data-hard-word-spell-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
}

function entryId(word: string) {
  const entry = catalog.entries.find((candidate) => candidate.normalizedHeadword === word);
  expect(entry, `catalog entry for ${word}`).toBeTruthy();
  return entry!.id;
}

test('every one of the 462 public learner words has spelling and sentence entry points', async ({
  page,
}) => {
  expect(catalog.entries).toHaveLength(462);
  expect(new Set(catalog.entries.map((entry) => entry.id)).size).toBe(462);
  expect(new Set(catalog.entries.map((entry) => entry.normalizedHeadword)).size).toBe(462);

  await openHardWords(page);
  while (await page.locator('[data-action="hard-words-more"]').count()) {
    await page.locator('[data-action="hard-words-more"]').click();
  }

  const rendered = await page.locator('.hard-word-row').evaluateAll((rows) =>
    rows.map((row) => ({
      word: row.getAttribute('data-hard-word'),
      spelling: row.querySelectorAll('[data-action="hard-word-spell"]').length,
      sentence: row.querySelectorAll('[data-action="hard-word-sentence"]').length,
    })),
  );
  expect(rendered).toHaveLength(462);
  expect(new Set(rendered.map((row) => row.word)).size).toBe(462);
  expect(rendered.every((row) => row.spelling === 1 && row.sentence === 1)).toBe(true);
  expect(new Set(rendered.map((row) => row.word))).toEqual(
    new Set(catalog.entries.map((entry) => entry.normalizedHeadword)),
  );

  await expect(page.locator('[data-action="hard-words-start-spell"]')).toBeVisible();
  await expect(page.locator('[data-action="hard-words-start-sentence"]')).toBeVisible();
});

test('batch spelling and sentence launchers start usable queues', async ({ page }) => {
  await startBatch(page, 'spell');
  await expect(page.locator('[data-hard-word-memory]')).toBeVisible();
  await page.locator('[data-action="hard-word-exit"]').click();
  await startBatch(page, 'sentence');
  await expect(page.locator('[data-hard-word-sentence-input]')).toBeVisible();
});

test('blind spelling removes the answer from the live DOM and preserves hyphens strictly', async ({
  page,
}) => {
  const practice = await openWordPractice(page, 'stress-free', 'spell');
  await expect(practice.locator('[data-hard-word-memory]')).toContainText('stress-free');
  await enterBlindRecall(practice);

  const beforeAnswer = (await practice.evaluate((element) => element.outerHTML)).toLowerCase();
  const bodyText = ((await page.locator('body').textContent()) || '').toLowerCase();
  expect(beforeAnswer).not.toContain('stress-free');
  expect(bodyText).not.toContain('stress-free');
  const maxLength = await practice
    .locator('[data-hard-word-spell-input]')
    .getAttribute('maxlength');
  expect(maxLength === null || Number(maxLength) >= 64).toBe(true);

  await submitSpelling(practice, 'stressfree');
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'incorrect',
  );
  expect(((await practice.textContent()) || '').toLowerCase()).not.toContain('stress-free');

  await practice.locator('[data-action="hard-word-retry"]').click();
  await submitSpelling(practice, '  STRESS-FREE  ');
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'correct',
  );

  const progress = await hardProgress(page);
  expect(progress.entries?.[entryId('stress-free')]?.spell).toMatchObject({
    attempts: 2,
    blindPasses: 0,
    repairPasses: 1,
  });
});

test('memory study becomes answer-free blind recall when the learner is ready', async ({
  page,
}) => {
  const practice = await openWordPractice(page, 'loss', 'spell');
  await expect(practice.locator('[data-hard-word-memory]')).toContainText('loss');
  await practice.locator('[data-action="hard-word-hide"]').click();
  await expect(practice.locator('[data-hard-word-spell-input]')).toBeVisible();
  expect(
    ((await practice.evaluate((element) => element.outerHTML)) || '').toLowerCase(),
  ).not.toContain('loss');
});

test('phrase spelling accepts outer whitespace and case but never deletes word boundaries', async ({
  page,
}) => {
  let practice = await openWordPractice(page, 'get carried away', 'spell');
  await enterBlindRecall(practice);
  await submitSpelling(practice, 'getcarriedaway');
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'incorrect',
  );
  expect(((await practice.textContent()) || '').toLowerCase()).not.toContain('get carried away');

  await practice.locator('[data-action="hard-word-retry"]').click();
  await submitSpelling(practice, '  GET CARRIED AWAY  ');
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'correct',
  );

  await page.reload();
  await openHardWords(page);
  await page.getByLabel('搜索单词或短语').fill('get carried away');
  await page.locator('[data-hard-word="get carried away"] [data-action="hard-word-spell"]').click();
  practice = page.locator('[data-hard-word-practice][data-mode="spell"]');
  await expect(practice.locator('[data-hard-word-practice-summary]')).toContainText(/2|练习/);
  const progress = await hardProgress(page);
  expect(progress.entries?.[entryId('get carried away')]?.spell).toMatchObject({
    attempts: 2,
    repairPasses: 1,
  });
});

test('spelling skip is persistent and a rapid double submit records only one attempt', async ({
  page,
}) => {
  let practice = await openWordPractice(page, 'loss', 'spell');
  await enterBlindRecall(practice);
  await practice.locator('[data-action="hard-word-skip"]').click();
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'skipped',
  );
  let progress = await hardProgress(page);
  expect(progress.entries?.[entryId('loss')]?.spell?.skips).toBe(1);

  practice = await openWordPractice(page, 'purpose', 'spell');
  await enterBlindRecall(practice);
  await practice.locator('[data-hard-word-spell-input]').fill('PURPOSE');
  await practice.locator('[data-hard-word-spell-form]').evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'correct',
  );
  progress = await hardProgress(page);
  expect(progress.entries?.[entryId('purpose')]?.spell).toMatchObject({
    attempts: 1,
    blindPasses: 1,
  });
  expect(
    progress.journal?.filter((item) => item.wordId === entryId('purpose') && item.mode === 'spell'),
  ).toHaveLength(1);
});

test('refresh restores incorrect, correct and skipped spelling states without duplicate records', async ({
  page,
}) => {
  let practice = await openWordPractice(page, 'loss', 'spell');
  await enterBlindRecall(practice);
  await submitSpelling(practice, 'lost');
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'incorrect',
  );
  await page.reload();
  practice = page.locator('[data-hard-word-practice][data-mode="spell"]');
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'incorrect',
  );
  await practice.locator('[data-action="hard-word-retry"]').click();
  await submitSpelling(practice, 'loss');
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'correct',
  );
  await page.reload();
  practice = page.locator('[data-hard-word-practice][data-mode="spell"]');
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'correct',
  );

  practice = await openWordPractice(page, 'attain', 'spell');
  await enterBlindRecall(practice);
  await practice.locator('[data-action="hard-word-skip"]').click();
  await page.reload();
  practice = page.locator('[data-hard-word-practice][data-mode="spell"]');
  await expect(practice.locator('[data-hard-word-spell-feedback]')).toHaveAttribute(
    'data-result',
    'skipped',
  );

  const progress = await hardProgress(page);
  expect(progress.entries?.[entryId('loss')]?.spell).toMatchObject({
    attempts: 2,
    repairPasses: 1,
  });
  expect(progress.entries?.[entryId('attain')]?.spell?.skips).toBe(1);
  expect(progress.journal?.filter((item) => item.wordId === entryId('loss'))).toHaveLength(2);
  expect(progress.journal?.filter((item) => item.wordId === entryId('attain'))).toHaveLength(1);
});

test('sentence checks reject fragments or missing targets, preserve drafts, and only queue human review', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  const coreBefore = await page.evaluate((key) => localStorage.getItem(key), CORE_STORAGE_KEY);
  let practice = await openWordPractice(page, 'mature', 'sentence');
  const textarea = practice.locator('[data-hard-word-sentence-input]');

  await textarea.fill('The maturity of the plan surprised us.');
  await practice
    .locator('[data-hard-word-sentence-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(practice.locator('[data-hard-word-sentence-feedback]')).toHaveAttribute(
    'data-result',
    'needs_revision',
  );

  await textarea.fill('Mature.');
  await practice
    .locator('[data-hard-word-sentence-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(practice.locator('[data-hard-word-sentence-feedback]')).toHaveAttribute(
    'data-result',
    'needs_revision',
  );

  const draft = 'The fruit will mature slowly in the warm kitchen.';
  await textarea.fill(draft);
  await page.reload();
  practice = page.locator('[data-hard-word-practice][data-mode="sentence"]');
  await expect(practice).toBeVisible();
  await expect(practice.locator('[data-hard-word-sentence-input]')).toHaveValue(draft);

  await practice.locator('[data-hard-word-sentence-form]').evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(practice.locator('[data-hard-word-sentence-feedback]')).toHaveAttribute(
    'data-result',
    'pending_human_review',
  );
  await expect(practice.locator('[data-hard-word-sentence-feedback]')).toContainText(
    /人工|老师|评阅/,
  );

  const progress = await hardProgress(page);
  const sentence = progress.entries?.[entryId('mature')]?.sentence;
  expect(sentence).toMatchObject({
    submissions: 1,
    draft,
    status: 'pending_human_review',
  });
  expect(
    progress.journal?.filter(
      (item) => item.wordId === entryId('mature') && item.mode === 'sentence',
    ),
  ).toHaveLength(1);
  expect(JSON.stringify(progress)).not.toMatch(/"(correct|mastery|mastered)"\s*:\s*true/i);
  expect(await page.evaluate((key) => localStorage.getItem(key), CORE_STORAGE_KEY)).toBe(
    coreBefore,
  );
  await page.reload();
  practice = page.locator('[data-hard-word-practice][data-mode="sentence"]');
  await expect(practice.locator('[data-hard-word-sentence-input]')).toHaveValue(draft);
  await expect(practice.locator('[data-hard-word-sentence-feedback]')).toHaveAttribute(
    'data-result',
    'pending_human_review',
  );
});

test('sentence practice enforces basic mechanics and saves skips without claiming correctness', async ({
  page,
}) => {
  let practice = await openWordPractice(page, 'stress-free', 'sentence');
  const textarea = practice.locator('[data-hard-word-sentence-input]');
  await textarea.fill('my quiet weekends are stress-free');
  await practice
    .locator('[data-hard-word-sentence-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(practice.locator('[data-hard-word-sentence-feedback]')).toHaveAttribute(
    'data-result',
    'needs_revision',
  );

  await textarea.fill('My quiet weekends are stress-free.');
  await practice
    .locator('[data-hard-word-sentence-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(practice.locator('[data-hard-word-sentence-feedback]')).toHaveAttribute(
    'data-result',
    'pending_human_review',
  );

  practice = await openWordPractice(page, 'familiarity', 'sentence');
  await practice.locator('[data-action="hard-word-skip"]').click();
  const progress = await hardProgress(page);
  expect(progress.entries?.[entryId('familiarity')]?.sentence?.skips).toBe(1);
  expect(progress.entries?.[entryId('familiarity')]?.sentence?.status).not.toBe('correct');
});

test('the new practice keeps the audited rescue route and the public data privacy boundary intact', async ({
  page,
}) => {
  const forbidden = [
    'learner_name',
    'raw_token',
    'received_at',
    'batch_id',
    'lexical_definition',
    'part_of_speech',
    'cefr',
    'ipa',
  ];
  for (const entry of catalog.entries as unknown as Array<Record<string, unknown>>) {
    expect(forbidden.some((field) => Object.hasOwn(entry, field))).toBe(false);
  }

  await openHardWords(page);
  await page.getByLabel('搜索单词或短语').fill('controversial');
  const row = page.locator('[data-hard-word="controversial"]');
  await expect(row.locator('[data-action="hard-word-spell"]')).toBeVisible();
  await expect(row.locator('[data-action="hard-word-sentence"]')).toBeVisible();
  await row.locator('[data-action="start-rescue-word"]').click();
  await expect(page.locator('[data-rescue-task]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'controversial' })).toBeVisible();
});

test('spelling and sentence controls stay touch-safe without horizontal overflow at 320 and 375px', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'mobile-only viewport gate');

  for (const mode of ['spell', 'sentence'] as const) {
    const practice = await openWordPractice(page, 'get carried away', mode);
    if (mode === 'spell') await enterBlindRecall(practice);
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 });
      const layout = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[data-hard-word-practice]')!;
        const controls = Array.from(
          root.querySelectorAll<HTMLElement>('button, input, textarea, select'),
        ).filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        return {
          viewport: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          rootRight: root.getBoundingClientRect().right,
          controls: controls.map((element) => ({
            name:
              element.textContent?.trim() || element.getAttribute('aria-label') || element.tagName,
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          })),
        };
      });
      expect(layout.viewport).toBe(width);
      expect(layout.scroll).toBeLessThanOrEqual(width);
      expect(layout.rootRight).toBeLessThanOrEqual(width);
      expect(layout.controls.length).toBeGreaterThan(0);
      layout.controls.forEach((control) => {
        expect(control.width, `${mode}: ${control.name} width`).toBeGreaterThanOrEqual(44);
        expect(control.height, `${mode}: ${control.name} height`).toBeGreaterThanOrEqual(44);
      });
    }
  }
});
