import { expect, test } from '@playwright/test';

async function openVisualLab(page: import('@playwright/test').Page) {
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="visual"]:visible').first().click();
  await expect(page.getByRole('heading', { name: '图像词义实验室' })).toBeVisible();
}

test('teaches noun, verb, adjective and adverb without changing core progress', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  const coreBefore = await page.evaluate(() => localStorage.getItem('els-ielts-wordlab-v1'));

  await page.getByRole('button', { name: /05 图像词义实验室/ }).click();
  await expect(page.getByRole('heading', { name: '一张图看懂四种词性' })).toBeVisible();
  const scene = page.locator('[data-visual-task-id="pos-foundation"] img');
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute('alt', /徒步者走过厚实木桥/);
  await expect
    .poll(() => scene.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1200);

  await page.getByRole('button', { name: 'bridge', exact: true }).click();
  await expect(page.getByText('哪一个词说明“正在做什么”？')).toBeVisible();
  await page.getByRole('button', { name: 'supports', exact: true }).click();
  await expect(page.getByText(/哪一个词说明 bridge/)).toBeVisible();
  await page.getByRole('button', { name: 'sturdy', exact: true }).click();
  await expect(page.getByText('哪一个词说明动作“怎样发生”？')).toBeVisible();
  await page.getByRole('button', { name: 'safely', exact: true }).click();

  await expect(page.getByText('四种实词已经全部找对')).toBeVisible();
  await expect(page.getByText(/bridge 和 hiker 都是名词/)).toBeVisible();

  const progress = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return {
      core: localStorage.getItem('els-ielts-wordlab-v1'),
      task: visual.tasks?.['pos-foundation'],
      historyLength: visual.history?.length,
    };
  });
  expect(progress.core).toBe(coreBefore);
  expect(progress.task.mastered).toBe(true);
  expect(progress.task.attempts).toBe(4);
  expect(progress.task.correct).toBe(4);
  expect(progress.historyLength).toBe(4);
});

test('uses pictures to distinguish precise synonyms and prevents double scoring', async ({
  page,
}) => {
  await openVisualLab(page);
  await page.getByRole('button', { name: /近义辨析/ }).click();

  const card = page.locator('[data-visual-task-id="syn-interest-fascinate"]');
  await expect(card).toBeVisible();
  const image = card.locator('img');
  await expect(image).toHaveAttribute('loading', 'lazy');
  await expect
    .poll(() => image.evaluate((element) => getComputedStyle(element).objectFit))
    .toBe('contain');

  await card.getByRole('button', { name: 'interested', exact: true }).dblclick();
  await expect(card.getByText(/live jellyfish held Mia’s attention/)).toBeVisible();
  await card.getByRole('button', { name: 'fascinated', exact: true }).click();

  await expect(card.getByText('两个场景都已判断正确')).toBeVisible();
  await expect(card.getByText(/区别主要是程度/)).toBeVisible();

  const saved = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return visual.tasks?.['syn-interest-fascinate'];
  });
  expect(saved.mastered).toBe(true);
  expect(saved.attempts).toBe(2);
  expect(saved.correct).toBe(2);
});

test('keeps image failures recoverable and mobile navigation usable', async ({ page }) => {
  await openVisualLab(page);
  await page.getByRole('button', { name: /近义辨析/ }).click();

  const card = page.locator('[data-visual-task-id="syn-ailment-disease"]');
  await card.scrollIntoViewIfNeeded();
  await card.locator('img').evaluate((image: HTMLImageElement) => {
    image.src = './images/semantic-lab/does-not-exist.webp';
  });
  await expect(card.getByText('图片暂时没有载入。')).toBeVisible();
  await expect(card.getByRole('button', { name: 'ailment', exact: true })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'disease', exact: true })).toBeDisabled();

  const historyCount = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return (
      visual.history?.filter((item: { taskId: string }) => item.taskId === 'syn-ailment-disease')
        .length || 0
    );
  });
  expect(historyCount).toBe(0);

  const layout = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const items = Array.from(document.querySelectorAll<HTMLElement>('.bottom-nav-item')).map(
      (item) => item.getBoundingClientRect(),
    );
    return {
      overflow,
      mobile: innerWidth <= 780,
      items: items.map((box) => ({ width: box.width, height: box.height })),
    };
  });
  expect(layout.overflow).toBeLessThanOrEqual(1);
  if (layout.mobile) {
    expect(layout.items).toHaveLength(6);
    layout.items.forEach((box) => {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    });
  }
});

test('supports homophone, homograph, analogy and taxonomy games without revealing skipped answers', async ({
  page,
}) => {
  await openVisualLab(page);
  const coreBefore = await page.evaluate(() => localStorage.getItem('els-ielts-wordlab-v1'));

  await page.getByRole('button', { name: /词网游戏/ }).click();
  await expect(page.getByRole('heading', { name: '把单词连成一张会思考的网' })).toBeVisible();
  await expect(page.locator('.visual-game-mode')).toHaveCount(6);

  await page.getByRole('button', { name: /同音词侦探/ }).click();
  const firstTask = page.locator('[data-visual-task-id="game-homophone-fir"]');
  await expect(firstTask).toBeVisible();
  await expect(firstTask.getByRole('button', { name: '播放同音词语音' })).toBeVisible();

  await firstTask.getByRole('button', { name: 'fur', exact: true }).click();
  await expect(firstTask.getByText(/句中说的是一种常绿树/)).toBeVisible();
  await expect(firstTask.getByText(/fir 是“冷杉”/)).toHaveCount(0);

  await page.waitForTimeout(300);
  await firstTask.getByRole('button', { name: 'fir', exact: true }).click();
  await expect(firstTask.getByText(/fir 是“冷杉”/)).toBeVisible();
  await firstTask.getByRole('button', { name: '下一题 →' }).click();

  const secondTask = page.locator('[data-visual-task-id="game-homophone-fur"]');
  await expect(secondTask).toBeVisible();
  await secondTask.getByRole('button', { name: /先跳过/ }).click();
  await expect(page.locator('[data-visual-task-id="game-homophone-prey"]')).toBeVisible();
  await expect(page.getByText(/fur 是“动物的软毛/)).toHaveCount(0);

  await page.getByRole('button', { name: /同形词分身/ }).click();
  await expect(page.locator('[data-visual-task-id="game-homograph-hide-noun"]')).toContainText(
    'hide',
  );
  await page.getByRole('button', { name: /类比接龙/ }).click();
  await expect(page.getByText(/ecology : ecologist/)).toBeVisible();
  await page.getByRole('button', { name: /分类与上下义/ }).click();
  await expect(page.getByRole('heading', { name: '找共同上义词' })).toBeVisible();

  const saved = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return {
      core: localStorage.getItem('els-ielts-wordlab-v1'),
      first: visual.tasks?.['game-homophone-fir'],
      skipped: visual.tasks?.['game-homophone-fur'],
    };
  });
  expect(saved.core).toBe(coreBefore);
  expect(saved.first.mastered).toBe(true);
  expect(saved.first.attempts).toBe(2);
  expect(saved.first.correct).toBe(1);
  expect(saved.skipped.mastered).toBe(false);
  expect(saved.skipped.attempts).toBe(1);
  expect(saved.skipped.correct).toBe(0);
});
