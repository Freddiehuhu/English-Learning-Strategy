import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.use({ serviceWorkers: 'block' });

const publishedCatalog = JSON.parse(
  readFileSync(join(process.cwd(), 'public/ielts/corpus/student-hard-words.json'), 'utf8'),
);

async function openHardWords(page: import('@playwright/test').Page) {
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
  await expect(page.locator('[data-hard-words-results]')).toBeVisible();
}

test('loads the 462-word learner catalog only on demand and exposes it from Today and Practice', async ({
  page,
}) => {
  let catalogRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/ielts/corpus/student-hard-words.json')) catalogRequests += 1;
  });

  await page.goto('/ielts/index.html');
  expect(catalogRequests).toBe(0);
  await expect(page.getByRole('button', { name: '查看全部学生难词' })).toBeVisible();
  await page.getByRole('button', { name: '查看全部学生难词' }).click();
  await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
  await expect(page.locator('.hard-words-stat').nth(0)).toContainText('462');
  await expect(page.locator('.hard-words-stat[data-difficulty="1"]')).toContainText('194');
  await expect(page.locator('.hard-words-stat[data-difficulty="2"]')).toContainText('111');
  await expect(page.locator('.hard-words-stat[data-difficulty="3"]')).toContainText('157');
  expect(catalogRequests).toBe(1);

  await page.locator('[data-view-link="practice"]:visible').click();
  await expect(page.getByRole('button', { name: /学生难词总表/ })).toBeVisible();
  await page.getByRole('button', { name: /学生难词总表/ }).click();
  await expect(page.locator('[data-hard-words-results]')).toBeVisible();
  expect(catalogRequests).toBe(1);
});

test('searches, filters and progressively reveals the real learner catalog without answer leakage', async ({
  page,
}) => {
  await openHardWords(page);
  await expect(page.locator('.hard-word-row')).toHaveCount(60);
  await page.getByRole('button', { name: /再显示 60 个/ }).click();
  await expect(page.locator('.hard-word-row')).toHaveCount(120);

  await page.getByRole('button', { name: /157 两项都不会/ }).click();
  await expect(page.locator('[data-hard-words-match-count]')).toHaveText('157');
  await expect(page.locator('.hard-word-row')).toHaveCount(60);
  await expect(page.locator('.hard-word-row[data-difficulty="1"]')).toHaveCount(0);
  await expect(page.locator('.hard-word-row[data-difficulty="2"]')).toHaveCount(0);

  const search = page.getByLabel('搜索单词或短语');
  await search.fill('maturity');
  await expect(page.locator('.hard-word-row')).toHaveCount(1);
  const maturity = page.locator('[data-hard-word="maturity"]');
  await expect(maturity).toContainText('读音＋意思');
  await expect(maturity).toContainText('待补权威来源');
  await expect(maturity).toContainText('基础练习可用');
  await expect(maturity).not.toContainText(/\/[^/]+\//);
  await expect(maturity).not.toContainText(/\bn\.|\bv\.|\badj\.|\badv\./i);

  await search.fill('');
  await page
    .locator('[data-action="hard-words-filter"][data-filter="practice"]')
    .selectOption('in_rescue_training');
  await expect(page.locator('[data-hard-words-match-count]')).toHaveText('4');
  await expect(page.locator('.hard-word-start')).toHaveCount(4);

  await page.getByRole('button', { name: /462 全部难词/ }).click();
  await expect(page.locator('[data-hard-words-match-count]')).toHaveText('12');
  await expect(page.locator('.hard-word-start')).toHaveCount(12);
});

test('keeps basic practice on every row and limits the sound-form rescue route to audited words', async ({
  page,
}) => {
  await openHardWords(page);
  const search = page.getByLabel('搜索单词或短语');
  await search.fill('maturity');
  const unaudited = page.locator('[data-hard-word="maturity"]');
  await expect(unaudited.locator('[data-action="hard-word-spell"]')).toBeVisible();
  await expect(unaudited.locator('[data-action="hard-word-sentence"]')).toBeVisible();
  await expect(unaudited.locator('[data-action="start-rescue-word"]')).toHaveCount(0);

  await search.fill('controversial');
  const audited = page.locator('[data-hard-word="controversial"]');
  await expect(audited).toContainText('已进入练习');
  await expect(audited).toContainText('声形急救可用');
  await audited.getByRole('button', { name: '声形急救' }).click();
  await expect(page.locator('[data-rescue-task][data-gate="readDecode"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'controversial' })).toBeVisible();
});

test('shows a recoverable load error and can use a cached catalog while offline', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/ielts/corpus/student-hard-words.json', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, body: 'temporarily unavailable' });
      return;
    }
    await route.continue();
  });
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('alert')).toContainText('难词表暂时没有载入');
  await page.getByRole('button', { name: '重新载入' }).click();
  await expect(page.locator('.hard-words-stat').nth(0)).toContainText('462');
  expect(attempts).toBe(2);

  await page.unroute('**/ielts/corpus/student-hard-words.json');
  await page.addInitScript((cachedPayload) => {
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        match: () => Promise.resolve(new Response(JSON.stringify(cachedPayload))),
      },
    });
  }, publishedCatalog);
  await page.route('**/ielts/corpus/student-hard-words.json', (route) =>
    route.abort('internetdisconnected'),
  );
  await page.reload();
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.locator('.hard-words-stat').nth(0)).toContainText('462');
  await expect(page.locator('[data-hard-word="loss"]')).toBeVisible();
});

test('rejects an inconsistent cached catalog instead of rendering untrusted rows', async ({
  page,
}) => {
  const malformedCatalog = structuredClone(publishedCatalog);
  malformedCatalog.entries[0].needsPronunciation = false;
  malformedCatalog.entries[0].definition = 'untrusted answer';
  await page.addInitScript((cachedPayload) => {
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        match: () => Promise.resolve(new Response(JSON.stringify(cachedPayload))),
      },
    });
  }, malformedCatalog);
  await page.route('**/ielts/corpus/student-hard-words.json', (route) =>
    route.abort('internetdisconnected'),
  );
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('alert')).toContainText('未通过一致性或隐私校验');
  await expect(page.locator('[data-hard-word="loss"]')).toHaveCount(0);
});

test('rejects a forged rescue training list even when entry counts remain unchanged', async ({
  page,
}) => {
  const forgedCatalog = structuredClone(publishedCatalog);
  const realTraining = forgedCatalog.entries.find(
    (entry: { normalizedHeadword: string }) => entry.normalizedHeadword === 'controversial',
  );
  const forgedTraining = forgedCatalog.entries.find(
    (entry: { normalizedHeadword: string }) => entry.normalizedHeadword === 'spite',
  );
  realTraining.reviewStatus = 'needs_sense_confirmation';
  realTraining.practiceStatus = 'awaiting_exercise_authoring';
  forgedTraining.reviewStatus = 'source_audited_for_rescue';
  forgedTraining.practiceStatus = 'in_rescue_training';
  await page.addInitScript((cachedPayload) => {
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        match: () => Promise.resolve(new Response(JSON.stringify(cachedPayload))),
      },
    });
  }, forgedCatalog);
  await page.route('**/ielts/corpus/student-hard-words.json', (route) =>
    route.abort('internetdisconnected'),
  );
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('alert')).toContainText('练习清单与条目不一致');
  await expect(page.locator('[data-hard-word="spite"]')).toHaveCount(0);
});

test('rejects swapped display and normalized forms instead of mislabeling a rescue button', async ({
  page,
}) => {
  const forgedCatalog = structuredClone(publishedCatalog);
  const controversial = forgedCatalog.entries.find(
    (entry: { normalizedHeadword: string }) => entry.normalizedHeadword === 'controversial',
  );
  const spite = forgedCatalog.entries.find(
    (entry: { normalizedHeadword: string }) => entry.normalizedHeadword === 'spite',
  );
  [controversial.normalizedHeadword, spite.normalizedHeadword] = [
    spite.normalizedHeadword,
    controversial.normalizedHeadword,
  ];
  await page.addInitScript((cachedPayload) => {
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        match: () => Promise.resolve(new Response(JSON.stringify(cachedPayload))),
      },
    });
  }, forgedCatalog);
  await page.route('**/ielts/corpus/student-hard-words.json', (route) =>
    route.abort('internetdisconnected'),
  );
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('alert')).toContainText('未通过一致性或隐私校验');
  await expect(page.locator('.hard-word-start')).toHaveCount(0);
});

test('keeps the learner catalog usable at 320 and 375 pixels', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'mobile-only viewport gate');
  await openHardWords(page);

  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    const layout = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-hard-words-view] button, [data-hard-words-view] input, [data-hard-words-view] select, .bottom-nav-item',
        ),
      ).filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      return {
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        targets: controls.map((element) => ({
          label:
            element.textContent?.trim() || element.getAttribute('aria-label') || element.tagName,
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        })),
      };
    });
    expect(layout.viewport).toBe(width);
    expect(layout.scroll).toBeLessThanOrEqual(width);
    expect(layout.targets.length).toBeGreaterThan(0);
    layout.targets.forEach((target) => {
      expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
    });
  }
});
