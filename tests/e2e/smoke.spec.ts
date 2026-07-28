import { expect, test } from '@playwright/test';

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
