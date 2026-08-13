import { expect, test, type Page } from '@playwright/test';
import {
  AudioHarness,
  installRecorderHarness,
  openReadSplitter,
  startDirectWord,
} from './helpers/hard-word-sound-form';

test.use({ serviceWorkers: 'block' });

async function toggleBoundaries(page: Page, boundaries: number[]) {
  for (const boundary of boundaries) {
    await page.locator(`[data-action="dual-toggle-split"][data-boundary="${boundary}"]`).click();
  }
}

test('cuts directly at letter seams without opening a keyboard or text field', async ({ page }) => {
  await openReadSplitter(page);

  const editor = page.locator('[data-dual-word-splitter]');
  await expect(editor).toBeVisible();
  await expect(editor.locator('[data-action="dual-toggle-split"]')).toHaveCount(12);
  await expect(page.locator('[data-dual-read-syllables] input')).toHaveCount(0);
  await expect(page.locator('[data-dual-read-syllables] textarea')).toHaveCount(0);
  await expect(page.locator('[data-dual-read-syllables] form')).toHaveCount(0);
  await expect(page.locator('[data-dual-split-preview]')).toHaveText('保持完整 · 按 1 拍读');

  await editor.evaluate((element) => {
    (window as unknown as { __splitterIdentity?: Element }).__splitterIdentity = element;
  });

  await toggleBoundaries(page, [3, 6, 8, 9]);
  expect(
    await editor.evaluate(
      (element) =>
        (window as unknown as { __splitterIdentity?: Element }).__splitterIdentity === element,
    ),
  ).toBe(true);
  await expect(page.locator('[data-dual-split-preview]')).toHaveText('pro · nun · ci · a · tion');
  for (const boundary of [3, 6, 8, 9]) {
    await expect(
      page.locator(`[data-action="dual-toggle-split"][data-boundary="${boundary}"]`),
    ).toHaveAttribute('aria-pressed', 'true');
  }
});

test('a seam is reversible, clear resets all seams, and zero cuts remain valid', async ({
  page,
}) => {
  await openReadSplitter(page);
  const gap = (boundary: number) =>
    page.locator(`[data-action="dual-toggle-split"][data-boundary="${boundary}"]`);

  await gap(3).click();
  await gap(6).click();
  await expect(page.locator('[data-dual-split-preview]')).toHaveText('pro · nun · ciation');
  await gap(6).click();
  await expect(page.locator('[data-dual-split-preview]')).toHaveText('pro · nunciation');
  await expect(gap(6)).toHaveAttribute('aria-pressed', 'false');

  await page.locator('[data-action="dual-clear-splits"]').click();
  await expect(page.locator('[data-dual-split-preview]')).toHaveText('保持完整 · 按 1 拍读');
  await expect(page.locator('[data-action="dual-clear-splits"]')).toBeDisabled();
  await page.locator('[data-action="dual-confirm-splits"]').click();
  await expect(page.locator('[data-dual-mixed-prototype]')).toHaveAttribute(
    'data-dual-step',
    'read-record',
  );
});

test('rerender, rapid double activation, and browser refresh do not duplicate stale seams', async ({
  page,
}) => {
  await openReadSplitter(page);
  const thirdGap = page.locator('[data-action="dual-toggle-split"][data-boundary="3"]');

  await thirdGap.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.locator('[data-dual-split-preview]')).toHaveText('pro · nunciation');
  await expect(
    page.locator('[data-action="dual-toggle-split"][data-boundary="3"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.locator('[data-hard-word-sound-form]')).toHaveAttribute(
    'data-step',
    'read-syllables',
  );
  await expect(page.locator('[data-dual-split-preview]')).toHaveText('pro · nunciation');
});

test('confirmed touch cuts keep the legacy slash value used by recording comparison', async ({
  page,
}) => {
  await installRecorderHarness(page);
  await openReadSplitter(page);
  await toggleBoundaries(page, [3, 6, 8, 9]);
  await page.locator('[data-action="dual-confirm-splits"]').click();
  await expect(page.locator('[data-dual-mixed-prototype]')).toHaveAttribute(
    'data-dual-step',
    'read-record',
  );

  await page.locator('[data-dual-record]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-dual-record]').click();
  const comparison = page.locator('[data-dual-read-answer-compare]');
  await expect(comparison).toContainText('pro / nun / ci / a / tion');
});

test('the unrelated blind-listening sequence remains answer-free and audio-gated', async ({
  page,
}) => {
  await AudioHarness.install(page, false);
  await startDirectWord(page, 'certificate');
  for (let index = 0; index < 10; index += 1) {
    await page.locator('[data-dual-skip]').click();
    await page.waitForTimeout(700);
  }

  const root = page.locator('[data-dual-mixed-prototype]');
  await expect(root).toHaveAttribute('data-dual-step', 'spell-count');
  await expect(page.locator('[data-dual-word-splitter]')).toHaveCount(0);
  await expect(page.locator('[data-dual-spell-count-input]')).toBeDisabled();
  expect(((await root.evaluate((element) => element.outerHTML)) || '').toLowerCase()).not.toContain(
    'certificate',
  );

  await page.locator('[data-dual-spell-audio]').click();
  await expect(page.locator('[data-dual-spell-count-input]')).toBeDisabled();
  await AudioHarness.dispatch(page, 'playing');
  await expect(page.locator('[data-dual-spell-count-input]')).toBeEnabled();
});

test('the splitter fits 320px and 375px screens with accessible touch targets', async ({
  page,
}) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await openReadSplitter(page);
    const geometry = await page.locator('[data-dual-read-syllables]').evaluate((root) => {
      const controls = Array.from(root.querySelectorAll<HTMLElement>('button')).filter((button) => {
        const style = getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      const splitter = root.querySelector<HTMLElement>('[data-dual-word-splitter]');
      return {
        viewport: document.documentElement.clientWidth,
        documentScroll: document.documentElement.scrollWidth,
        splitterClient: splitter?.clientWidth || 0,
        splitterScroll: splitter?.scrollWidth || 0,
        controls: controls.map((control) => {
          const box = control.getBoundingClientRect();
          return {
            label: control.getAttribute('aria-label') || control.textContent?.trim() || 'control',
            width: box.width,
            height: box.height,
          };
        }),
      };
    });

    expect(geometry.viewport).toBe(width);
    expect(geometry.documentScroll).toBeLessThanOrEqual(width + 1);
    expect(geometry.splitterScroll).toBeGreaterThanOrEqual(geometry.splitterClient);
    for (const control of geometry.controls) {
      const isDenseLetterSeam = control.label.startsWith('在第 ');
      expect(control.width, `${width}px: ${control.label} width`).toBeGreaterThanOrEqual(
        isDenseLetterSeam ? 22 : 44,
      );
      expect(control.height, `${width}px: ${control.label} height`).toBeGreaterThanOrEqual(44);
    }
  }
});
