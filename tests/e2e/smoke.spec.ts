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
