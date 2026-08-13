import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

class AudioHarness {
  static async install(page: Page) {
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
          return Promise.resolve();
        }

        pause() {
          this.paused = true;
          queueMicrotask(() => this.dispatchEvent(new Event('pause')));
        }
      }

      Object.defineProperty(window, 'Audio', {
        configurable: true,
        value: ControllableAudio,
      });
      Object.defineProperty(window, '__syllableAudioInstances', {
        configurable: true,
        value: ControllableAudio.instances,
      });
    });
  }

  static async dispatch(page: Page, eventName: string) {
    await page.evaluate((name) => {
      const instances = (
        window as unknown as {
          __syllableAudioInstances: Array<{ dispatchEvent: (event: Event) => void }>;
        }
      ).__syllableAudioInstances;
      instances.at(-1)?.dispatchEvent(new Event(name));
    }, eventName);
  }
}

async function openTutorial(page: Page) {
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
  const entry = page.locator('[data-action="open-syllable-tutorial"]');
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('[data-syllable-tutorial]')).toBeVisible();
}

async function advanceTo(page: Page, step: 'layers' | 'examples' | 'quiz') {
  const order = ['idea', 'layers', 'examples', 'quiz'];
  const root = page.locator('[data-syllable-tutorial]');
  const current = await root.getAttribute('data-syllable-step');
  const clicks = order.indexOf(step) - order.indexOf(current || 'idea');
  for (let index = 0; index < clicks; index += 1) {
    await page.locator('[data-action="syllable-next"]').click();
  }
  await expect(root).toHaveAttribute('data-syllable-step', step);
}

async function advanceToFinish(page: Page) {
  await advanceTo(page, 'quiz');
  for (let index = 0; index < 3; index += 1) {
    await page.locator('[data-action="syllable-quiz-skip"]').click();
  }
  await expect(page.locator('[data-syllable-tutorial]')).toHaveAttribute(
    'data-syllable-step',
    'finish',
  );
}

test('opens from the learner hard-word page and teaches sound before spelling', async ({
  page,
}) => {
  await openTutorial(page);
  const root = page.locator('[data-syllable-tutorial]');
  await expect(root).toHaveAttribute('data-syllable-step', 'idea');
  await expect(page.getByRole('heading', { name: '音节是声音的“拍”' })).toBeVisible();
  await expect(root).toContainText('不要数元音字母');
  await expect(page.locator('[data-syllable-example="squeeze"]')).toHaveAttribute(
    'data-syllable-count',
    '1',
  );
  await expect(page.locator('[data-syllable-example="squeeze"]')).not.toContainText('3 拍');
});

test('distinguishes spoken syllables, dictionary syllabification and spelling chunks', async ({
  page,
}) => {
  await openTutorial(page);
  await advanceTo(page, 'layers');

  const sound = page.locator('[data-syllable-layer="sound"]');
  const dictionary = page.locator('[data-syllable-layer="dictionary"]');
  const spelling = page.locator('[data-syllable-layer="spelling"]');
  await expect(sound).toContainText('听音音节');
  await expect(sound).toContainText('声音拍');
  await expect(dictionary).toContainText('词典音标分节');
  await expect(dictionary).toContainText('重音');
  await expect(spelling).toContainText('本课拼写分块');
  await expect(spelling).toContainText(/不等于|不是.*唯一/);
  await expect(page.locator('[data-syllable-tutorial]')).toContainText('fountain');
  await expect(page.locator('[data-syllable-tutorial]')).toContainText('两拍');
});

test('publishes the audited counts and primary-stress positions for the five examples', async ({
  page,
}) => {
  await openTutorial(page);
  await advanceTo(page, 'examples');

  const expected = [
    { word: 'squeeze', count: '1', zeroBasedStress: '0', stressedBlock: 'SQUEEZE' },
    { word: 'fountain', count: '2', zeroBasedStress: '0', stressedBlock: 'FOUN' },
    { word: 'certificate', count: '4', zeroBasedStress: '1', stressedBlock: 'TIF' },
    { word: 'pronunciation', count: '5', zeroBasedStress: '3', stressedBlock: 'A' },
  ];

  for (const item of expected) {
    const example = page.locator(`[data-syllable-example="${item.word}"]`);
    await expect(example).toHaveAttribute('data-syllable-count', item.count);
    await expect(example).toHaveAttribute('data-syllable-stress', item.zeroBasedStress);
    await expect(example.locator('strong')).toHaveText(item.stressedBlock);
  }

  const squeeze = page.locator('[data-syllable-example="squeeze"]');
  await expect(squeeze).toContainText('squ / ee / ze');
  await expect(squeeze).not.toContainText(/squ\s*·\s*ee\s*·\s*ze/i);

  const certificate = page.locator('[data-syllable-example="certificate"]');
  await expect(certificate).toContainText('4 拍');
  await expect(certificate.locator('strong')).toHaveText('TIF');

  const pronunciation = page.locator('[data-syllable-example="pronunciation"]');
  await expect(pronunciation).toContainText('5 拍');
  await expect(pronunciation.locator('strong')).toHaveText('A');

  const variation = page.locator('[data-syllable-variation]');
  await expect(variation).toContainText('controversial');
  await expect(variation).toContainText(/变体|不同/);
  await expect(variation).toContainText(/不.*唯一|不把.*判错|都可能/);
});

test('locks quiz answers until the audio really starts and treats playback failure as technical', async ({
  page,
}) => {
  await AudioHarness.install(page);
  await openTutorial(page);
  await advanceTo(page, 'quiz');

  const quiz = page.locator('[data-syllable-quiz]');
  await expect(quiz).not.toHaveAttribute('data-syllable-count');
  await expect(quiz).not.toHaveAttribute('data-syllable-stress');
  const answerLeaks = await quiz.evaluate((element, answer) => {
    const values = [element, ...element.querySelectorAll('*')].flatMap((node) => [
      node === element ? node.textContent || '' : '',
      ...Array.from(node.attributes).map((attribute) => attribute.value),
    ]);
    return values.filter((value) => value.toLowerCase().includes(answer));
  }, 'squeeze');
  expect(answerLeaks).toEqual([]);
  const answers = page.locator('[data-action="syllable-answer"]');
  await expect(answers).toHaveCount(5);
  await expect(answers.first()).toBeDisabled();
  await page.locator('[data-syllable-audio]').click();
  await expect(answers.first()).toBeDisabled();
  await AudioHarness.dispatch(page, 'playing');
  await expect(answers.first()).toBeEnabled();
  await page.locator('[data-action="syllable-answer"][data-count="1"]').click();
  await expect(page.locator('[data-syllable-feedback]')).toContainText('听对了');
  await expect(page.locator('[data-syllable-feedback]')).toHaveClass(/is-correct/);

  await page.locator('[data-action="syllable-quiz-next"]').click();
  await expect(answers.first()).toBeDisabled();
  await page.locator('[data-syllable-audio]').click();
  await AudioHarness.dispatch(page, 'error');
  await expect(page.locator('[data-syllable-feedback]')).toContainText('不判错');
  await expect(page.locator('[data-syllable-feedback]')).not.toHaveClass(/is-correct/);
  await expect(answers.first()).toBeDisabled();
  await expect(page.locator('[data-action="syllable-quiz-skip"]')).toBeEnabled();
});

test('does not write tutorial activity into the core mastery model', async ({ page }) => {
  await AudioHarness.install(page);
  await openTutorial(page);
  const before = await page.evaluate(() => localStorage.getItem('els-ielts-wordlab-v1'));
  await advanceTo(page, 'quiz');
  await page.locator('[data-syllable-audio]').click();
  await AudioHarness.dispatch(page, 'playing');
  await page.locator('[data-action="syllable-answer"][data-count="1"]').click();
  await page.locator('[data-action="syllable-quiz-next"]').click();
  await page.locator('[data-action="syllable-quiz-skip"]').click();
  const after = await page.evaluate(() => localStorage.getItem('els-ielts-wordlab-v1'));
  expect(after).toBe(before);
});

test('links the lesson to three named authoritative pronunciation references', async ({ page }) => {
  await openTutorial(page);
  await advanceToFinish(page);
  const sources = page.locator('[data-syllable-sources]');
  await expect(sources).toContainText('Cambridge');
  await expect(sources).toContainText('Oxford');
  await expect(sources).toContainText('Merriam-Webster');
  await expect(sources.locator('a')).toHaveCount(3);
  const hrefs = await sources
    .locator('a')
    .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
  expect(hrefs.some((href) => href.includes('dictionary.cambridge.org/'))).toBe(true);
  expect(hrefs.some((href) => href.includes('oxfordlearnersdictionaries.com/'))).toBe(true);
  expect(hrefs.some((href) => href.includes('merriam-webster.com/'))).toBe(true);
});

test('keeps every lesson step usable at 320 and 375 pixels with 44px targets', async ({ page }) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await openTutorial(page);

    for (const step of ['idea', 'layers', 'examples', 'quiz'] as const) {
      if (step !== 'idea') await advanceTo(page, step);
      const geometry = await page.locator('[data-syllable-tutorial]').evaluate((root) => {
        const controls = Array.from(root.querySelectorAll<HTMLElement>('button, a')).filter(
          (control) => {
            const style = getComputedStyle(control);
            return style.display !== 'none' && style.visibility !== 'hidden';
          },
        );
        return {
          viewport: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          controls: controls.map((control) => {
            const box = control.getBoundingClientRect();
            return {
              label: control.textContent?.trim() || control.getAttribute('aria-label') || 'control',
              width: box.width,
              height: box.height,
            };
          }),
        };
      });
      expect(geometry.viewport).toBe(width);
      expect(geometry.scroll).toBeLessThanOrEqual(width + 1);
      expect(geometry.controls.length).toBeGreaterThan(0);
      geometry.controls.forEach((control) => {
        expect(control.width, `${step}: ${control.label} width`).toBeGreaterThanOrEqual(44);
        expect(control.height, `${step}: ${control.label} height`).toBeGreaterThanOrEqual(44);
      });
    }
  }
});
