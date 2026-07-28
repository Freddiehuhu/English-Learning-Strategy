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
