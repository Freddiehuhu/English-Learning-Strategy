import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

class AudioHarness {
  static async install(page: Page, autoStart = false) {
    await page.addInitScript((shouldAutoStart) => {
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
          if (shouldAutoStart) queueMicrotask(() => this.dispatchEvent(new Event('playing')));
          return Promise.resolve();
        }

        pause() {
          this.paused = true;
          queueMicrotask(() => this.dispatchEvent(new Event('pause')));
        }
      }
      Object.defineProperty(window, 'Audio', { configurable: true, value: ControllableAudio });
      Object.defineProperty(window, '__mixedAudioInstances', {
        configurable: true,
        value: ControllableAudio.instances,
      });
    }, autoStart);
  }

  static async dispatch(page: Page, eventName: string) {
    await page.evaluate((name) => {
      const items = (
        window as unknown as {
          __mixedAudioInstances: Array<{ dispatchEvent: (event: Event) => void }>;
        }
      ).__mixedAudioInstances;
      items.at(-1)?.dispatchEvent(new Event(name));
    }, eventName);
  }
}

async function openPrototype(page: Page) {
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
  await expect(page.getByRole('button', { name: '混合声形样板 · 3 词 6 题' })).toBeVisible();
  await page.getByRole('button', { name: '混合声形样板 · 3 词 6 题' }).click();
  await expect(page.locator('[data-dual-mixed-prototype]')).toBeVisible();
}

async function skipTask(page: Page) {
  await page.locator('[data-dual-skip]').click();
}

test('uses the exact six-task interleaving and keeps each word pair two tasks apart', async ({
  page,
}) => {
  await openPrototype(page);
  const observed: Array<{ position: string | null; type: string | null; word: string | null }> = [];
  for (let index = 0; index < 6; index += 1) {
    const root = page.locator('[data-dual-mixed-prototype]');
    const type = await root.getAttribute('data-dual-task-type');
    const word =
      type === 'read'
        ? await page.locator('[data-dual-visible-word]').innerText()
        : ['certificate', 'pronunciation', 'controversial'][Math.floor(index / 2)];
    observed.push({
      position: await root.getAttribute('data-dual-queue-position'),
      type,
      word,
    });
    await skipTask(page);
  }

  expect(observed).toEqual([
    { position: '1', type: 'read', word: 'pronunciation' },
    { position: '2', type: 'spell', word: 'certificate' },
    { position: '3', type: 'read', word: 'controversial' },
    { position: '4', type: 'spell', word: 'pronunciation' },
    { position: '5', type: 'read', word: 'certificate' },
    { position: '6', type: 'spell', word: 'controversial' },
  ]);
  await expect(page.locator('[data-dual-summary]')).toContainText('6 题混排样板完成');
  await expect(page.locator('[data-dual-summary]')).not.toContainText('已掌握');
});

test('read task requires meaning, POS and syllables before cold recording and hides the model', async ({
  page,
}) => {
  await openPrototype(page);
  const root = page.locator('[data-dual-mixed-prototype]');
  await expect(root).toHaveAttribute('data-dual-step', 'read-info');
  await expect(page.locator('[data-dual-model-audio]')).toHaveCount(0);
  await expect(root).not.toContainText('/prə');
  await page.locator('[data-dual-read-meaning]').fill('发音');
  await page.locator('[data-dual-read-pos]').fill('noun');
  await page
    .locator('[data-dual-read-info-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(root).toHaveAttribute('data-dual-step', 'read-syllables');
  await expect(page.locator('[data-dual-model-audio]')).toHaveCount(0);
  await page.locator('[data-dual-read-syllables-input]').fill('pro / nun / ci / a / tion');
  await page
    .locator('[data-dual-read-syllables-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(root).toHaveAttribute('data-dual-step', 'read-record');
  await expect(page.locator('[data-dual-model-audio]')).toHaveCount(0);
  await expect(root).not.toContainText('/prə');
});

test('valid recording reveals self/model comparison but remains pending human review', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const stream = { getTracks: () => [{ stop: () => undefined }] };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve(stream) },
    });
    class FakeMediaRecorder extends EventTarget {
      state = 'inactive';
      mimeType = 'audio/webm';
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.dispatchEvent(
          new MessageEvent('dataavailable', {
            data: new Blob(['x'.repeat(256)], { type: this.mimeType }),
          }),
        );
        this.dispatchEvent(new Event('stop'));
      }
    }
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    });
  });

  await openPrototype(page);
  await page.locator('[data-dual-read-meaning]').fill('发音');
  await page.locator('[data-dual-read-pos]').fill('n.');
  await page
    .locator('[data-dual-read-info-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await page.locator('[data-dual-read-syllables-input]').fill('pro/nun/ci/a/tion');
  await page
    .locator('[data-dual-read-syllables-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await page.locator('[data-dual-record]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-dual-record]').click();
  await expect(page.locator('[data-dual-read-compare]')).toContainText('待人工核对');
  await expect(page.locator('[data-dual-own-audio]')).toBeEnabled();
  await expect(page.locator('[data-dual-model-audio]')).toBeEnabled();
  await expect(page.locator('[data-dual-read-compare]')).toContainText('/prə');
  await expect(page.locator('[data-dual-read-compare]')).not.toContainText('读音正确');
  await expect(page.locator('[data-dual-read-compare]')).not.toContainText('已掌握');
});

test('blind dictation stays answer-free and enforces count, syllables, then full information', async ({
  page,
}) => {
  await AudioHarness.install(page, false);
  await openPrototype(page);
  await skipTask(page);

  const root = page.locator('[data-dual-mixed-prototype]');
  const assertNoCertificate = async () => {
    const leaks = await root.evaluate((element, answer) => {
      const values = [element, ...element.querySelectorAll('*')].flatMap((node) => [
        node === element ? node.innerHTML : '',
        ...Array.from(node.attributes).map((attribute) => attribute.value),
      ]);
      return values.filter((value) => value.toLowerCase().includes(answer));
    }, 'certificate');
    expect(leaks).toEqual([]);
  };

  await expect(root).toHaveAttribute('data-dual-step', 'spell-count');
  await assertNoCertificate();
  await expect(page.locator('[data-dual-spell-count-input]')).toBeDisabled();
  await page.locator('[data-dual-spell-audio]').click();
  await AudioHarness.dispatch(page, 'playing');
  await expect(page.locator('[data-dual-spell-count-input]')).toBeEnabled();
  await page.locator('[data-dual-spell-count-input]').fill('4');
  await page
    .locator('[data-dual-spell-count-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(root).toHaveAttribute('data-dual-step', 'spell-syllables');
  await assertNoCertificate();
  await page.locator('[data-dual-spell-audio]').click();
  await AudioHarness.dispatch(page, 'playing');
  await page.locator('[data-dual-spell-syllables-input]').fill('cer / tif / i / cate');
  await page
    .locator('[data-dual-spell-syllables-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(root).toHaveAttribute('data-dual-step', 'spell-final');
  await assertNoCertificate();
  await expect(page.locator('[data-dual-own-syllables]')).toContainText('cer / tif / i / cate');
  await page.locator('[data-dual-spell-audio]').click();
  await AudioHarness.dispatch(page, 'playing');
  await page.locator('[data-dual-spell-word-input]').fill('certificate');
  await page.locator('[data-dual-spell-meaning-input]').fill('证书');
  await page.locator('[data-dual-spell-pos-input]').fill('noun');
  await page
    .locator('[data-dual-spell-final-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('[data-dual-spell-result]')).toContainText('certificate');
  await expect(page.locator('[data-dual-spell-result]')).toContainText('中文意思仅供对照');
});

test('audio and microphone failures remain technical and every task can be skipped', async ({
  page,
}) => {
  await AudioHarness.install(page, false);
  await openPrototype(page);
  await skipTask(page);
  await page.locator('[data-dual-spell-audio]').click();
  await AudioHarness.dispatch(page, 'error');
  await expect(page.locator('[data-dual-feedback]')).toContainText('本次不记错');
  await expect(page.locator('[data-dual-skip]')).toBeEnabled();
  await skipTask(page);

  await page.locator('[data-dual-read-meaning]').fill('有争议的');
  await page.locator('[data-dual-read-pos]').fill('adj.');
  await page
    .locator('[data-dual-read-info-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await page.locator('[data-dual-read-syllables-input]').fill('con/tro/ver/sial');
  await page
    .locator('[data-dual-read-syllables-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: class FakeMediaRecorder {},
    });
  });
  await page.locator('[data-dual-record]').click();
  await expect(page.locator('[data-dual-record-status]')).toContainText('不会判错');
  await expect(page.locator('[data-dual-skip]')).toBeEnabled();
});

test('mixed prototype is isolated from core mastery state', async ({ page }) => {
  await openPrototype(page);
  const before = await page.evaluate(() => localStorage.getItem('els-ielts-wordlab-v1'));
  await skipTask(page);
  await skipTask(page);
  const after = await page.evaluate(() => localStorage.getItem('els-ielts-wordlab-v1'));
  expect(after).toBe(before);
});

test('a rapid double skip advances exactly one task', async ({ page }) => {
  await openPrototype(page);
  const skip = page.locator('[data-dual-skip]');
  await skip.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.locator('[data-dual-mixed-prototype]')).toHaveAttribute(
    'data-dual-queue-position',
    '2',
  );
  await expect(page.locator('[data-dual-mixed-prototype]')).toHaveAttribute(
    'data-dual-task-type',
    'spell',
  );
});

test('mobile controls are at least 44px and the sample has no horizontal overflow', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile-only geometry audit');
  await openPrototype(page);
  const metrics = await page.locator('[data-dual-mixed-prototype]').evaluate((root) => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    controls: Array.from(
      root.querySelectorAll('button:not([hidden]), input:not([type="hidden"])'),
    ).map((control) => {
      const box = control.getBoundingClientRect();
      return { height: box.height, width: box.width };
    }),
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.controls.every((item) => item.height >= 44 && item.width >= 44)).toBe(true);
});
