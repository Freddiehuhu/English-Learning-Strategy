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

      Object.defineProperty(window, 'Audio', {
        configurable: true,
        value: ControllableAudio,
      });
      Object.defineProperty(window, '__dualAudioInstances', {
        configurable: true,
        value: ControllableAudio.instances,
      });
    }, autoStart);
  }

  static async dispatch(page: Page, eventName: string) {
    await page.evaluate((name) => {
      const instances = (
        window as unknown as {
          __dualAudioInstances: Array<{ dispatchEvent: (event: Event) => void }>;
        }
      ).__dualAudioInstances;
      instances.at(-1)?.dispatchEvent(new Event(name));
    }, eventName);
  }
}

async function openPrototype(page: Page) {
  await page.goto('/ielts/index.html');
  await page.locator('[data-view-link="hard-words"]:visible').click();
  await expect(page.getByRole('heading', { name: '学生难词总表' })).toBeVisible();
  await page.locator('[data-action="start-dual-prototype"]').first().click();
  await expect(page.locator('[data-dual-prototype][data-dual-step="choice"]')).toBeVisible();
}

async function completeReadBySkipping(page: Page, expectChoice = true) {
  await page.locator('[data-dual-start-read]').click();
  await expect(page.locator('[data-dual-read-cold]')).toContainText('pronunciation');
  await page.locator('[data-dual-skip-read]').click();
  if (expectChoice) {
    await expect(page.locator('[data-dual-prototype][data-dual-step="choice"]')).toBeVisible();
  }
}

async function openBlindSpell(page: Page) {
  await page.locator('[data-dual-start-spell]').click();
  await expect(page.locator('[data-dual-prototype][data-dual-step="spell-cold"]')).toBeVisible();
}

test('offers independent see-read and hear-write directions from the hard-word catalog', async ({
  page,
}) => {
  await openPrototype(page);

  await expect(page.locator('[data-dual-start-read]')).toContainText('看词');
  await expect(page.locator('[data-dual-start-read]')).toContainText('读出来');
  await expect(page.locator('[data-dual-start-spell]')).toContainText('听音');
  await expect(page.locator('[data-dual-start-spell]')).toContainText('写出来');

  await page.locator('[data-dual-start-read]').click();
  await expect(page.locator('[data-dual-read-cold]')).toContainText('pronunciation');
  await expect(page.locator('[data-dual-read-cold]')).not.toContainText('/prə');
  await expect(page.locator('[data-dual-read-cold] [data-dual-model-audio]')).toHaveCount(0);
});

test('blind spelling leaks no target and stays locked until audio really starts', async ({
  page,
}) => {
  await AudioHarness.install(page, false);
  await openPrototype(page);
  await openBlindSpell(page);

  const blind = page.locator('[data-dual-spell-cold]');
  const target = 'pronunciation';
  const leaks = await blind.evaluate((root, answer) => {
    const values = [root, ...root.querySelectorAll('*')].flatMap((element) => [
      element === root ? element.innerHTML : '',
      ...Array.from(element.attributes).map((attribute) => attribute.value),
    ]);
    return values.filter((value) => value.toLowerCase().includes(answer));
  }, target);
  expect(leaks).toEqual([]);

  const input = page.locator('[data-dual-spell-input]');
  const check = page.locator('[data-dual-spell-check]');
  await expect(input).toBeDisabled();
  await expect(check).toBeDisabled();

  const play = page.locator('[data-dual-spell-audio]');
  await play.click();
  await expect(play).toHaveAttribute('data-playback-state', 'loading');
  await expect(input).toBeDisabled();
  await AudioHarness.dispatch(page, 'playing');
  await expect(input).toBeEnabled();
  await expect(check).toBeEnabled();
  await expect(play).toHaveAttribute('data-playback-state', 'playing');
  await expect(play).toHaveAttribute('aria-label', '暂停盲听音频');
});

test('recording is collected as pending human review and never presented as correct', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const track = { stop: () => undefined };
    const stream = { getTracks: () => [track] };
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
  await page.locator('[data-dual-start-read]').click();
  await page.locator('[data-dual-record]').click();
  await expect(page.locator('[data-dual-record]')).toContainText('停止录音');
  await page.waitForTimeout(500);
  await page.locator('[data-dual-record]').click();
  await expect(page.locator('[data-dual-read-compare]')).toBeVisible();
  await expect(page.locator('[data-dual-read-compare]')).toContainText('不自动判分');
  await expect(page.locator('[data-dual-own-audio]')).toBeEnabled();

  await page.locator('[data-dual-finish-read]').click();
  await expect(page.locator('[data-dual-choice]')).toContainText('已录音 · 待人工核对');
  await expect(page.locator('[data-dual-choice]')).not.toContainText('读音正确');
  await expect(page.locator('[data-dual-choice]')).not.toContainText('已掌握');
});

test('wrong cold attempts keep the answer hidden, then assisted repair stays distinct', async ({
  page,
}) => {
  await AudioHarness.install(page, true);
  await openPrototype(page);
  await openBlindSpell(page);

  await page.locator('[data-dual-spell-audio]').click();
  await page.locator('[data-dual-spell-input]').fill('pronounciation');
  await page
    .locator('[data-dual-spell-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('[data-dual-spell-feedback]')).toContainText('答案仍隐藏');
  await expect(page.locator('[data-dual-spell-cold]')).not.toContainText('pronunciation');

  await page.locator('[data-dual-spell-audio]').click();
  await page.locator('[data-dual-spell-input]').fill('pronounciation');
  await page
    .locator('[data-dual-spell-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('[data-dual-spell-repair]')).toContainText('pro · nun · ci · a · tion');
  await page.locator('[data-dual-repair-input]').fill('pronunciation');
  await page
    .locator('[data-dual-repair-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('[data-dual-choice]')).toContainText('修复后完成 · 有提示');

  await completeReadBySkipping(page, false);
  await expect(page.locator('[data-dual-summary]')).toContainText('修复后完成 · 有提示');
  await expect(page.locator('[data-dual-summary]')).toContainText('不等于长期掌握');
});

test('audio failure and skips do not misreport mastery', async ({ page }) => {
  await AudioHarness.install(page, false);
  await openPrototype(page);
  await openBlindSpell(page);

  await page.locator('[data-dual-spell-audio]').click();
  await AudioHarness.dispatch(page, 'error');
  await expect(page.locator('[data-dual-spell-feedback]')).toContainText('本次不记错');
  await expect(page.locator('[data-dual-spell-input]')).toBeDisabled();
  await page.locator('[data-dual-skip-spell]').click();
  await expect(page.locator('[data-dual-choice]')).toContainText('已跳过 · 未掌握');

  await page.locator('[data-dual-start-read]').click();
  await page.locator('[data-dual-skip-read]').click();
  const summary = page.locator('[data-dual-summary]');
  await expect(summary).toContainText('已跳过 · 未判定');
  await expect(summary).toContainText('已跳过 · 未掌握');
  await expect(summary).not.toContainText('双向掌握');
});

test('an independent first-pass spelling stays independent and the retest preview resets hints', async ({
  page,
}) => {
  await AudioHarness.install(page, true);
  await openPrototype(page);
  await completeReadBySkipping(page);
  await openBlindSpell(page);

  await page.locator('[data-dual-spell-audio]').click();
  await page.locator('[data-dual-spell-input]').fill(' pronunciation ');
  await page
    .locator('[data-dual-spell-form]')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());

  const summary = page.locator('[data-dual-summary]');
  await expect(summary).toContainText('首次独立拼对');
  await summary.locator('[data-dual-preview-retest]').click();
  await expect(page.locator('[data-dual-word-demo][data-dual-stage="choice"]')).toContainText(
    '无提示复测',
  );
  await expect(page.locator('[data-dual-start-read]')).toBeEnabled();
  await expect(page.locator('[data-dual-start-spell]')).toBeEnabled();
  await expect(page.locator('[data-dual-word-demo]')).not.toContainText('修复后完成');
});

test('microphone denial is a technical non-judgement and leaves skip available', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: class FakeMediaRecorder {},
    });
  });

  await openPrototype(page);
  await page.locator('[data-dual-start-read]').click();
  await page.locator('[data-dual-record]').click();
  await expect(page.locator('[data-dual-record-status]')).toContainText('麦克风未授权');
  await expect(page.locator('[data-dual-record-status]')).toContainText('不会判错');
  await expect(page.locator('[data-dual-skip-read]')).toBeEnabled();
  await expect(page.locator('[data-dual-read-compare]')).toHaveCount(0);
});

test('mobile controls meet the 44px target and the prototype has no horizontal overflow', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile-only geometry audit');
  await openPrototype(page);

  const metrics = await page.locator('[data-dual-prototype]').evaluate((root) => {
    const controls = Array.from(root.querySelectorAll('button:not([hidden])')).map((button) => {
      const box = button.getBoundingClientRect();
      return { label: (button.textContent || '').trim(), width: box.width, height: box.height };
    });
    return {
      controls,
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.controls.length).toBeGreaterThan(0);
  expect(
    metrics.controls.every((control) => control.height >= 44 && control.width >= 44),
    JSON.stringify(metrics.controls),
  ).toBe(true);
});
