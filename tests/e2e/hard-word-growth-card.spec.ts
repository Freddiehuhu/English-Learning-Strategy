import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  assertBlindRootHasNoAnswer,
  AudioHarness,
  entryFor,
  installRecorderHarness,
  skipCurrent,
  soundFormState,
  startDirectWord,
  waitForTransitionLock,
} from './helpers/hard-word-sound-form';

test.use({ serviceWorkers: 'block' });

const root = (page: Page) => page.locator('[data-hard-word-sound-form]');
const growthCard = (page: Page) => page.locator('[data-dual-growth-card]');

async function markNodeIdentity(locator: Locator, token: string) {
  await locator.evaluate((node, value) => {
    (node as HTMLElement & { __growthCardQaIdentity?: string }).__growthCardQaIdentity = value;
  }, token);
}

async function expectNodeIdentity(locator: Locator, token: string) {
  await expect
    .poll(() =>
      locator.evaluate(
        (node) =>
          (node as HTMLElement & { __growthCardQaIdentity?: string }).__growthCardQaIdentity || '',
      ),
    )
    .toBe(token);
}

async function expectGrowthState(page: Page, activeStep: string, completeSteps: string[]) {
  const card = growthCard(page);
  await expect(root(page)).toHaveAttribute('data-step', activeStep);

  const active = card.locator('[data-growth-block][data-growth-state="active"]');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('data-step-name', activeStep);

  const complete = card.locator('[data-growth-block][data-growth-state="complete"]');
  await expect(complete).toHaveCount(completeSteps.length);
  await expect(card.locator('[data-growth-block]')).toHaveCount(completeSteps.length + 1);
  await expect(card.locator('[data-growth-summary]')).toHaveCount(completeSteps.length);

  for (const step of completeSteps) {
    const block = card.locator(
      `[data-growth-block][data-growth-state="complete"][data-step-name="${step}"]`,
    );
    await expect(block).toHaveCount(1);
    await expect(block.locator('[data-growth-summary]')).toBeVisible();
    await expect(block.locator('form, input, button')).toHaveCount(0);
  }

  const primary = card.locator('[data-growth-primary]:visible');
  await expect(primary).toHaveCount(1);
  await expect(primary).toBeEnabled();
}

async function expectCompletedSummary(page: Page, step: string, text: string) {
  const summary = growthCard(page).locator(
    `[data-growth-block][data-growth-state="complete"][data-step-name="${step}"] [data-growth-summary]`,
  );
  await expect(summary).toContainText(text);
}

async function expectReadModelHidden(page: Page) {
  const exercise = root(page);
  await expect(exercise.locator('[data-dual-model-audio]')).toHaveCount(0);
  await expect(exercise.locator('[data-dual-own-audio]')).toHaveCount(0);
  await expect(exercise.locator('[data-sound-form-pronunciation-reference]')).toHaveCount(0);
  await expect(exercise.locator('[data-sound-form-block-reference]')).toHaveCount(0);
  await expect(exercise.locator('[data-sound-form-lexical-reference]')).toHaveCount(0);
  await expect(exercise).not.toContainText(/审校范音|本次合成范音/);
  const sourceLeaks = await exercise.evaluate((element) =>
    [element, ...element.querySelectorAll('*')]
      .flatMap((node) => Array.from(node.attributes).map((attribute) => attribute.value))
      .filter((value) => /(?:\.mp3|\/audio\/)/i.test(value)),
  );
  expect(sourceLeaks).toEqual([]);
}

async function reachDirectSpell(page: Page, word: string) {
  await startDirectWord(page, word);
  for (let index = 0; index < 10; index += 1) {
    await skipCurrent(page);
    await waitForTransitionLock(page);
  }
  await expect(root(page)).toHaveAttribute('data-task-position', '11');
  await expect(root(page)).toHaveAttribute('data-task-type', 'spell');
}

async function expectMobileGrowthCardGeometry(page: Page, testInfo: TestInfo) {
  if (!testInfo.project.name.startsWith('mobile-')) return;
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await root(page).evaluate((exercise) => {
      const card = exercise.querySelector<HTMLElement>('[data-dual-growth-card]');
      const visibleControls = Array.from(
        exercise.querySelectorAll<HTMLElement>('button, input, [role="button"]'),
      )
        .map((control) => control.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0)
        .map((box) => ({ width: box.width, height: box.height }));
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        cardClientWidth: card?.clientWidth || 0,
        cardScrollWidth: card?.scrollWidth || 0,
        visibleControls,
      };
    });
    expect(metrics.documentWidth, `${width}px document overflow`).toBeLessThanOrEqual(
      metrics.viewportWidth + 1,
    );
    expect(metrics.cardScrollWidth, `${width}px growth-card overflow`).toBeLessThanOrEqual(
      metrics.cardClientWidth + 1,
    );
    expect(metrics.visibleControls.length, `${width}px visible controls`).toBeGreaterThan(0);
    for (const control of metrics.visibleControls) {
      expect(control.width, `${width}px control width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${width}px control height`).toBeGreaterThanOrEqual(44);
    }
  }
}

test('read growth card keeps one DOM identity, folds learner summaries, and hides the model until cold recording finishes', async ({
  page,
}) => {
  await installRecorderHarness(page);
  await startDirectWord(page, 'pronunciation');

  const pronunciation = entryFor('pronunciation');
  const initial = await soundFormState(page);
  expect(initial.active!.queue[0]).toEqual({ wordId: pronunciation.id, type: 'read' });
  expect(initial.active!.queue[10]).toEqual({ wordId: pronunciation.id, type: 'spell' });
  expect(initial.active!.queue.slice(1, 10).map((item) => item.wordId)).not.toContain(
    pronunciation.id,
  );

  await markNodeIdentity(root(page), 'read-root');
  await markNodeIdentity(growthCard(page), 'read-card');
  await expectGrowthState(page, 'read-info', []);
  await expectReadModelHidden(page);

  await page.locator('[data-dual-read-meaning]').fill('学习者释义');
  await page.locator('[data-dual-read-pos]').fill('n.');
  await page
    .locator('[data-dual-read-info-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());

  await expectNodeIdentity(root(page), 'read-root');
  await expectNodeIdentity(growthCard(page), 'read-card');
  await expectGrowthState(page, 'read-syllables', ['read-info']);
  await expectCompletedSummary(page, 'read-info', '意思：学习者释义 · 词性：n.');
  await expectReadModelHidden(page);

  await page.locator('[data-action="dual-toggle-split"][data-boundary="3"]').click();
  await page.locator('[data-action="dual-confirm-splits"]').click();

  await expectNodeIdentity(root(page), 'read-root');
  await expectNodeIdentity(growthCard(page), 'read-card');
  await expectGrowthState(page, 'read-record', ['read-info', 'read-syllables']);
  await expectCompletedSummary(page, 'read-syllables', '我的分拍：pro · nunciation');
  await expectReadModelHidden(page);

  await page.locator('[data-dual-record]').click();
  await expect(page.locator('[data-dual-record-status]')).toContainText('正在录音');
  await expectGrowthState(page, 'read-record', ['read-info', 'read-syllables']);
  await expectReadModelHidden(page);
  await page.waitForTimeout(500);
  await page.locator('[data-dual-record]').click();

  await expectNodeIdentity(root(page), 'read-root');
  await expectNodeIdentity(growthCard(page), 'read-card');
  await expectGrowthState(page, 'read-compare', ['read-info', 'read-syllables', 'read-record']);
  await expectCompletedSummary(page, 'read-record', '冷录音已完成');
  await expect(page.locator('[data-dual-model-audio]')).toBeVisible();
  await expect(page.locator('[data-sound-form-pronunciation-reference]')).toBeVisible();
  await expect(page.locator('[data-dual-read-compare]')).toContainText('待人工核对');

  await page.locator('[data-dual-finish-read]').click();
  const finished = await soundFormState(page);
  expect(finished.active!.results[0]).toEqual({
    wordId: pronunciation.id,
    type: 'read',
    status: 'recorded_pending_human_review',
  });
  expect(finished.entries[pronunciation.id]).toMatchObject({
    read: { attempts: 1, recordings: 1, status: 'recorded_pending_human_review' },
  });
});

test('blind spelling grows in place without leaking the answer and stays usable with cumulative blocks on mobile', async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  await AudioHarness.install(page, false);
  await reachDirectSpell(page, 'certificate');

  const certificate = entryFor('certificate');
  await markNodeIdentity(root(page), 'spell-root');
  await markNodeIdentity(growthCard(page), 'spell-card');
  await expectGrowthState(page, 'spell-count', []);
  await assertBlindRootHasNoAnswer(page, certificate.displayWord, certificate.id);

  await page.locator('[data-dual-spell-audio]').click();
  await AudioHarness.dispatch(page, 'playing');
  await expectGrowthState(page, 'spell-count', []);
  await page.locator('[data-action="dual-select-syllable-count"][data-count="4"]').click();
  await expect(page.locator('[data-dual-confirm-count]')).toContainText('4 个音节槽');
  await assertBlindRootHasNoAnswer(page, certificate.displayWord, certificate.id);
  await page.locator('[data-dual-confirm-count]').click();

  await expectNodeIdentity(root(page), 'spell-root');
  await expectNodeIdentity(growthCard(page), 'spell-card');
  await expectGrowthState(page, 'spell-syllables', ['spell-count']);
  await expectCompletedSummary(page, 'spell-count', '我听到：4 拍');
  await assertBlindRootHasNoAnswer(page, certificate.displayWord, certificate.id);

  const slots = page.locator('[data-dual-syllable-slot]');
  await expect(slots).toHaveCount(4);
  for (const [index, chunk] of ['cer', 'tif', 'i', 'cate'].entries()) {
    await slots.nth(index).fill(chunk);
  }
  await expectGrowthState(page, 'spell-syllables', ['spell-count']);
  await assertBlindRootHasNoAnswer(page, certificate.displayWord, certificate.id);
  await growthCard(page).locator('[data-growth-primary]').click();

  await expectNodeIdentity(root(page), 'spell-root');
  await expectNodeIdentity(growthCard(page), 'spell-card');
  await expectGrowthState(page, 'spell-final', ['spell-count', 'spell-syllables']);
  await expectCompletedSummary(page, 'spell-count', '我听到：4 拍');
  await expectCompletedSummary(page, 'spell-syllables', '我的声音块：cer · tif · i · cate');
  await assertBlindRootHasNoAnswer(page, certificate.displayWord, certificate.id);
  await expectMobileGrowthCardGeometry(page, testInfo);

  await page.locator('[data-dual-spell-word-input]').fill('certifikate');
  await page.locator('[data-dual-spell-meaning-input]').fill('学习者释义');
  await page.locator('[data-dual-spell-pos-input]').fill('n.');
  await assertBlindRootHasNoAnswer(page, certificate.displayWord, certificate.id);
  await page
    .locator('[data-dual-spell-final-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());

  await expectNodeIdentity(root(page), 'spell-root');
  await expectNodeIdentity(growthCard(page), 'spell-card');
  await expectGrowthState(page, 'spell-result', ['spell-count', 'spell-syllables', 'spell-final']);
  await expect(root(page)).not.toHaveAttribute('data-answer-hidden', 'true');
  await expect(page.locator('[data-dual-spell-result]')).toContainText('certificate');
  await expect(page.locator('[data-dual-spell-result]')).toContainText('完整拼写需修订');

  await page.locator('[data-dual-finish-spell]').click();
  const finished = await soundFormState(page);
  expect(finished.active!.results.at(-1)).toEqual({
    wordId: certificate.id,
    type: 'spell',
    status: 'needs_repair',
  });
  expect(finished.entries[certificate.id]).toMatchObject({
    spell: { attempts: 1, repairNeeded: 1, status: 'needs_repair' },
  });
});
