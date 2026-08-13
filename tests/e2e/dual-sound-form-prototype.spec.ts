import { expect, test } from '@playwright/test';
import {
  AudioHarness,
  assertBlindRootHasNoAnswer,
  catalog,
  entryFor,
  skipCurrent,
  soundFormState,
  startBatch,
  startDirectWord,
  waitForTransitionLock,
} from './helpers/hard-word-sound-form';

test.use({ serviceWorkers: 'block' });

test('legacy prototype selectors remain aliases for the formal 10-word 20-task route', async ({
  page,
}) => {
  await startBatch(page);
  const root = page.locator('[data-hard-word-sound-form]');
  await expect(root).toHaveAttribute('data-dual-mixed-prototype', '');
  const queue = (await soundFormState(page)).active!.queue;
  expect(queue).toHaveLength(20);
  expect(new Set(queue.map((item) => item.wordId)).size).toBe(10);
  for (let index = 0; index < 10; index += 1) {
    expect(queue[index + 10].wordId).toBe(queue[index].wordId);
    expect(queue[index + 10].type).not.toBe(queue[index].type);
  }
});

test('every formal task remains skippable through summary, then next batch advances the cursor', async ({
  page,
}) => {
  await startBatch(page);
  const first = await soundFormState(page);
  for (let index = 0; index < 20; index += 1) {
    await skipCurrent(page);
    if (index < 19) await waitForTransitionLock(page);
  }
  await expect(page.locator('[data-sound-form-summary]')).toContainText('10 个词 · 20 道声形题');
  await expect(page.locator('[data-sound-form-summary]')).not.toContainText('已掌握');
  expect((await soundFormState(page)).active!.results).toHaveLength(20);
  await waitForTransitionLock(page);
  await page.locator('[data-action="sound-form-next-batch"]').click();
  await expect(page.locator('[data-hard-word-sound-form]')).toHaveAttribute(
    'data-task-position',
    '1',
  );
  expect((await soundFormState(page)).cursor).toBe((first.cursor + 10) % catalog.entries.length);
});

test('blind spelling remains answer-free at every pre-result stage', async ({ page }) => {
  await AudioHarness.install(page, false);
  await startDirectWord(page, 'certificate');
  for (let index = 0; index < 10; index += 1) {
    await skipCurrent(page);
    await waitForTransitionLock(page);
  }
  const entry = entryFor('certificate');
  for (const expectedStep of ['spell-count', 'spell-syllables', 'spell-final']) {
    await expect(page.locator('[data-hard-word-sound-form]')).toHaveAttribute(
      'data-step',
      expectedStep,
    );
    await assertBlindRootHasNoAnswer(page, entry.displayWord, entry.id);
    const audio = page.locator('[data-dual-spell-audio]');
    await audio.click();
    await AudioHarness.dispatch(page, 'playing');
    if (expectedStep === 'spell-count') {
      await page.locator('[data-dual-spell-count-input]').fill('4');
      await page
        .locator('[data-dual-spell-count-form]')
        .evaluate((form: HTMLFormElement) => form.requestSubmit());
    } else if (expectedStep === 'spell-syllables') {
      await page.locator('[data-dual-spell-syllables-input]').fill('cer / tif / i / cate');
      await page
        .locator('[data-dual-spell-syllables-form]')
        .evaluate((form: HTMLFormElement) => form.requestSubmit());
    } else {
      await page.locator('[data-dual-spell-word-input]').fill('certificate');
      await page.locator('[data-dual-spell-meaning-input]').fill('证书');
      await page.locator('[data-dual-spell-pos-input]').fill('n.');
      await page
        .locator('[data-dual-spell-final-form]')
        .evaluate((form: HTMLFormElement) => form.requestSubmit());
    }
  }
  await expect(page.locator('[data-dual-spell-result]')).toContainText('certificate');
});

test('formal route is usable on configured mobile browser projects', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile compatibility gate');
  await startDirectWord(page, 'pronunciation');
  const metrics = await page.locator('[data-hard-word-sound-form]').evaluate((root) => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    controls: Array.from(root.querySelectorAll<HTMLElement>('button, input'))
      .map((control) => control.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) => ({ width: box.width, height: box.height })),
  }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.controls.every((box) => box.width >= 44 && box.height >= 44)).toBe(true);
});
