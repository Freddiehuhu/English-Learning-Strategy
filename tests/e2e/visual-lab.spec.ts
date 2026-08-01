import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const FAMILY_ATLASES = [
  {
    id: 'family-atlas-beauty',
    targetWordId: 'foundation-beauty',
    image: './images/semantic-lab/family-beauty-v1.webp',
    answers: ['beautify', 'beautiful', 'beautifully'],
  },
  {
    id: 'family-atlas-success',
    targetWordId: 'foundation-success',
    image: './images/semantic-lab/family-success-v1.webp',
    answers: ['succeed', 'successful', 'successfully'],
  },
  {
    id: 'family-atlas-decision',
    targetWordId: 'foundation-decision',
    image: './images/semantic-lab/family-decision-v1.webp',
    answers: ['decide', 'decisive', 'decisively'],
  },
  {
    id: 'family-atlas-danger',
    targetWordId: 'foundation-danger',
    image: './images/semantic-lab/family-danger-v1.webp',
    answers: ['endanger', 'dangerous', 'dangerously'],
  },
  {
    id: 'family-atlas-strength',
    targetWordId: 'foundation-strength',
    image: './images/semantic-lab/family-strength-v1.webp',
    answers: ['strengthen', 'strong', 'strongly'],
  },
  {
    id: 'family-atlas-difference',
    targetWordId: 'foundation-difference',
    image: './images/semantic-lab/family-difference-v1.webp',
    answers: ['differ', 'different', 'differently'],
  },
  {
    id: 'family-atlas-competition',
    targetWordId: 'foundation-competition',
    image: './images/semantic-lab/family-competition-v1.webp',
    answers: ['compete', 'competitive', 'competitively'],
  },
  {
    id: 'family-atlas-creation',
    targetWordId: 'foundation-creation',
    image: './images/semantic-lab/family-creation-v1.webp',
    answers: ['create', 'creative', 'creatively'],
  },
  {
    id: 'family-atlas-safety',
    targetWordId: 'foundation-safety',
    image: './images/semantic-lab/family-safety-v1.webp',
    answers: ['save', 'safe', 'safely'],
  },
  {
    id: 'family-atlas-extension',
    targetWordId: 'foundation-extension',
    image: './images/semantic-lab/family-extension-v1.webp',
    answers: ['extend', 'extensive', 'extensively'],
  },
  {
    id: 'family-atlas-equality',
    targetWordId: 'foundation-equality',
    image: './images/semantic-lab/family-equality-v1.webp',
    answers: ['equal', 'equal', 'equally'],
  },
  {
    id: 'family-atlas-completion',
    targetWordId: 'foundation-completion',
    image: './images/semantic-lab/family-completion-v1.webp',
    answers: ['complete', 'complete', 'completely'],
  },
] as const;

function capturePageErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

function escapedWordPattern(answer: string) {
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

async function expectFamilyAnswersHidden(card: Locator, answers: readonly string[]) {
  const domContent = await card.evaluate((element) => {
    const values = [element.textContent || ''];
    for (const node of [element, ...element.querySelectorAll('*')]) {
      for (const attribute of node.attributes) values.push(attribute.value);
    }
    return values.join('\n');
  });
  for (const answer of answers) {
    expect(domContent, `${answer} must stay out of the incomplete card DOM`).not.toMatch(
      escapedWordPattern(answer),
    );
  }
}

async function showVisualLab(page: Page) {
  await page.locator('[data-view-link="practice"]:visible').first().click();
  await expect(page.getByRole('heading', { name: '专项练习' })).toBeVisible();
  await page.locator('[data-action="go-view"][data-view="visual"]').click();
  await expect(page.getByRole('heading', { name: '图像词义实验室' })).toBeVisible();
}

async function openVisualLab(page: Page) {
  await page.goto('/ielts/index.html');
  await showVisualLab(page);
}

async function showFamilyAtlases(page: Page) {
  await page.getByRole('button', { name: /看图变词/ }).click();
  await expect(page.getByRole('heading', { name: '同一幅图，练会完整词族' })).toBeVisible();
}

async function openFamilyAtlases(page: Page) {
  await openVisualLab(page);
  await showFamilyAtlases(page);
}

test('teaches noun, verb, adjective and adverb without changing core progress', async ({
  page,
}) => {
  await page.goto('/ielts/index.html');
  const coreBefore = await page.evaluate(() => localStorage.getItem('els-ielts-wordlab-v1'));

  await showVisualLab(page);
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

test('validates all twelve word-family atlases, images and hidden-answer DOM', async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await openFamilyAtlases(page);

  const atlasData = await page.evaluate(() => {
    const lab = (
      window as Window & {
        IELTS_VISUAL_LAB?: {
          familyAtlases?: Array<{
            id?: unknown;
            targetWordId?: unknown;
            image?: unknown;
            story?: {
              title?: unknown;
              english?: unknown;
              chinese?: unknown;
              retellPrompt?: unknown;
            };
            etymology?: {
              level?: unknown;
              fact?: unknown;
              memoryHook?: unknown;
              modernRule?: unknown;
              sources?: unknown[];
            };
          }>;
        };
      }
    ).IELTS_VISUAL_LAB;
    return (lab?.familyAtlases || []).map((atlas) => ({
      id: String(atlas.id || ''),
      targetWordId: String(atlas.targetWordId || ''),
      image: String(atlas.image || ''),
      hasStory: [
        atlas.story?.title,
        atlas.story?.english,
        atlas.story?.chinese,
        atlas.story?.retellPrompt,
      ].every((copy) => typeof copy === 'string' && copy.length > 0),
      hasEtymology:
        ['剧情卡', '来源彩蛋'].includes(String(atlas.etymology?.level || '')) &&
        [atlas.etymology?.fact, atlas.etymology?.memoryHook, atlas.etymology?.modernRule].every(
          (copy) => typeof copy === 'string' && copy.length > 0,
        ),
      sourceCount: Array.isArray(atlas.etymology?.sources) ? atlas.etymology.sources.length : 0,
    }));
  });

  expect(atlasData).toHaveLength(12);
  await expect(page.locator('.visual-family-card')).toHaveCount(12);
  expect(new Set(atlasData.map(({ id }) => id)).size).toBe(12);
  expect(new Set(atlasData.map(({ targetWordId }) => targetWordId)).size).toBe(12);
  expect(new Set(atlasData.map(({ image }) => image)).size).toBe(12);

  const safeId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const safeImage = /^\.\/images\/semantic-lab\/family-[a-z0-9-]+-v\d+\.webp$/;
  for (const atlas of atlasData) {
    expect(atlas.id).toMatch(safeId);
    expect(atlas.targetWordId).toMatch(safeId);
    expect(atlas.image).toMatch(safeImage);
    expect(atlas.hasStory).toBe(true);
    expect(atlas.hasEtymology).toBe(true);
    expect(atlas.sourceCount).toBeGreaterThan(0);
  }
  for (const expectedAtlas of FAMILY_ATLASES) {
    expect(atlasData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expectedAtlas.id,
          targetWordId: expectedAtlas.targetWordId,
          image: expectedAtlas.image,
        }),
      ]),
    );
  }

  for (const atlas of FAMILY_ATLASES) {
    const card = page.locator(`[data-visual-task-id="${atlas.id}"]`);
    const image = card.locator('img');
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(
        () =>
          image.evaluate((element: HTMLImageElement) => ({
            width: element.naturalWidth,
            height: element.naturalHeight,
          })),
        { message: `${atlas.id} should load its 1200 × 800 atlas` },
      )
      .toEqual({ width: 1200, height: 800 });
    await expectFamilyAnswersHidden(card, atlas.answers);
    await expect(card.getByText('词源故事与记忆钩子')).toHaveCount(0);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test('persists a skipped beauty atlas across reload and retries without revealing answers', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await openFamilyAtlases(page);

  const atlas = FAMILY_ATLASES[0];
  const card = page.locator(`[data-visual-task-id="${atlas.id}"]`);
  await card.getByRole('button', { name: /这组不会/ }).click();
  await expect(card.getByText('本轮已跳过')).toBeVisible();
  await expectFamilyAnswersHidden(card, atlas.answers);

  await page.reload();
  await showVisualLab(page);
  await showFamilyAtlases(page);
  await expect(card.getByText('本轮已跳过')).toBeVisible();
  await expectFamilyAnswersHidden(card, atlas.answers);

  await card.getByRole('button', { name: '重新挑战' }).click();
  await expect(card.getByText(/把 beauty 变成动词/)).toBeVisible();
  await expect(card.getByLabel('直接输入英文变形')).toBeEnabled();
  await expectFamilyAnswersHidden(card, atlas.answers);

  const progress = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return visual.tasks?.['family-atlas-beauty'];
  });
  expect(progress).toMatchObject({
    attempts: 1,
    correct: 0,
    mastered: false,
    step: 0,
    skipped: false,
  });
  expect(pageErrors).toEqual([]);
});

test('persists strength progress and prevents a double submit from scoring twice', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await openFamilyAtlases(page);
  const coreBefore = await page.evaluate(() => localStorage.getItem('els-ielts-wordlab-v1'));

  const atlas = FAMILY_ATLASES.find(({ id }) => id === 'family-atlas-strength');
  if (!atlas) throw new Error('The strength atlas fixture is missing.');
  const card = page.locator(`[data-visual-task-id="${atlas.id}"]`);
  await card.getByLabel('直接输入英文变形').fill('strengthen');
  await card.locator('[data-visual-family-form]').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(card.locator('.visual-question-meta')).toContainText('变形 2 / 3');
  await expectFamilyAnswersHidden(card, atlas.answers);

  const firstStep = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return {
      task: visual.tasks?.['family-atlas-strength'],
      historyCount:
        visual.history?.filter(
          (item: { taskId: string }) => item.taskId === 'family-atlas-strength',
        ).length || 0,
    };
  });
  expect(firstStep.task).toMatchObject({
    attempts: 1,
    correct: 1,
    mastered: false,
    step: 1,
  });
  expect(firstStep.historyCount).toBe(1);

  await page.reload();
  await showVisualLab(page);
  await showFamilyAtlases(page);
  await expect(card.locator('.visual-question-meta')).toContainText('变形 2 / 3');
  await expect(card.getByText(/The electromagnet is/)).toBeVisible();
  await expectFamilyAnswersHidden(card, atlas.answers);

  const familyInput = card.getByLabel('直接输入英文变形');
  const familyCheck = card.getByRole('button', { name: '检查拼写' });
  await expect(async () => {
    const step = await page.evaluate(() => {
      const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
      return Number(visual.tasks?.['family-atlas-strength']?.step || 0);
    });
    if (step < 2) {
      await familyInput.fill('strong');
      await familyCheck.click();
    }
    expect(
      await page.evaluate(() => {
        const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
        return Number(visual.tasks?.['family-atlas-strength']?.step || 0);
      }),
    ).toBe(2);
  }).toPass({ timeout: 5_000 });
  await expect(card.locator('.visual-question-meta')).toContainText('变形 3 / 3');
  await card.getByLabel('直接输入英文变形').fill('strongly');
  await card.locator('[data-visual-family-form]').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  await page.reload();
  await showVisualLab(page);
  await showFamilyAtlases(page);
  const answers = card.locator('.visual-family-answer-grid');
  for (const answer of ['strength', ...atlas.answers]) {
    await expect(answers.getByText(answer, { exact: true })).toBeVisible();
  }
  await expect(card.getByText('三个变形全部独立拼对')).toBeVisible();

  const completed = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return {
      core: localStorage.getItem('els-ielts-wordlab-v1'),
      task: visual.tasks?.['family-atlas-strength'],
      historyCount:
        visual.history?.filter(
          (item: { taskId: string }) => item.taskId === 'family-atlas-strength',
        ).length || 0,
    };
  });
  expect(completed.core).toBe(coreBefore);
  expect(completed.task).toMatchObject({
    attempts: 3,
    correct: 3,
    mastered: true,
    step: 0,
    skipped: false,
  });
  expect(completed.historyCount).toBe(3);
  expect(pageErrors).toEqual([]);
});

test('uses sentence position to practise equal as both a verb and an adjective', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await openFamilyAtlases(page);

  const card = page.locator('[data-visual-task-id="family-atlas-equality"]');
  await expect(card.getByText(/Four small bags/)).toBeVisible();
  await card.getByLabel('直接输入英文变形').fill('equal');
  await card.getByRole('button', { name: '检查拼写' }).click();

  await expect(card.getByText(/Each family received/)).toBeVisible();
  await card.getByLabel('直接输入英文变形').fill('equal');
  await card.getByRole('button', { name: '检查拼写' }).click();

  await expect(card.getByText(/divided the fruit/)).toBeVisible();
  await card.getByLabel('直接输入英文变形').fill('equally');
  await card.getByRole('button', { name: '检查拼写' }).click();

  const answers = card.locator('.visual-family-answer-grid');
  await expect(answers.getByText('equal', { exact: true })).toHaveCount(2);
  await expect(answers.getByText('equally', { exact: true })).toBeVisible();
  await expect(card.getByText('四格故事链')).toBeVisible();
  await expect(card.getByText(/Equality guided the food-sharing event/)).toBeVisible();
  await card.getByText('词源故事与记忆钩子').click();
  await expect(card.getByText(/aequalis/)).toBeVisible();
  await expect(
    card.getByRole('link', { name: 'Merriam-Webster: equal', exact: true }),
  ).toHaveAttribute('href', 'https://www.merriam-webster.com/dictionary/equal');
  await expect(card.getByText('三个变形全部独立拼对')).toBeVisible();

  const progress = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return visual.tasks?.['family-atlas-equality'];
  });
  expect(progress).toMatchObject({
    attempts: 3,
    correct: 3,
    mastered: true,
    step: 0,
    skipped: false,
  });
  expect(pageErrors).toEqual([]);
});

test('recovers a failed word-family atlas image without recording an attempt', async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await openFamilyAtlases(page);

  const card = page.locator('[data-visual-task-id="family-atlas-beauty"]');
  const image = card.locator('img');
  await image.scrollIntoViewIfNeeded();
  await image.evaluate((element) => {
    element.dispatchEvent(new Event('error'));
  });
  await expect(card.getByText('图片暂时没有载入。')).toBeVisible();
  await expect(card.getByLabel('直接输入英文变形')).toBeDisabled();
  await expect(card.getByRole('button', { name: '检查拼写' })).toBeDisabled();

  await card.getByRole('button', { name: '重新加载图片' }).click();
  await expect(card.getByLabel('直接输入英文变形')).toBeEnabled();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => ({
        width: element.naturalWidth,
        height: element.naturalHeight,
      })),
    )
    .toEqual({ width: 1200, height: 800 });

  const historyCount = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return (
      visual.history?.filter((item: { taskId: string }) => item.taskId === 'family-atlas-beauty')
        .length || 0
    );
  });
  expect(historyCount).toBe(0);
  expect(pageErrors).toEqual([]);
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
  await card.getByRole('button', { name: 'interested', exact: true }).click();
  await expect(card.getByText(/还不够贴切/)).toBeVisible();
  await page.waitForTimeout(300);
  await card.getByRole('button', { name: 'fascinated', exact: true }).click();

  await expect(card.locator('.visual-comparison-result')).toBeVisible();
  await expect(card.getByText(/已完成待复习/)).toBeVisible();
  await expect(card.getByText(/区别主要是程度/)).toBeVisible();
  await expect(page.locator('#visualContent')).not.toContainText(/已掌握|已稳定|全部稳定/);

  const saved = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    const core = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return {
      task: visual.tasks?.['syn-interest-fascinate'],
      visualError: visual.history?.find(
        (item: { taskId?: string; correct?: boolean }) =>
          item.taskId === 'syn-interest-fascinate' && !item.correct,
      ),
      repair: core.history?.find(
        (item: { visualTaskId?: string }) => item.visualTaskId === 'syn-interest-fascinate',
      ),
    };
  });
  expect(saved.task).toMatchObject({
    mastered: false,
    completed: true,
    needsReview: true,
    attempts: 3,
    correct: 2,
  });
  expect(saved.visualError).toMatchObject({
    targetWordId: 'fascinate',
    gameType: 'synonym',
    repairSkill: 'sentence',
  });
  expect(saved.repair).toMatchObject({
    wordId: 'fascinate',
    skill: 'sentence',
    source: 'visual',
    visualGameType: 'synonym',
  });
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
    expect(layout.items).toHaveLength(3);
    layout.items.forEach((box) => {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    });
  }
});

test('supports homophone, homograph, analogy and taxonomy games without revealing skipped answers', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await openVisualLab(page);

  await page.getByRole('button', { name: /词网游戏/ }).click();
  await expect(page.getByRole('heading', { name: '把单词连成一张会思考的网' })).toBeVisible();
  await expect(page.locator('.visual-game-mode')).toHaveCount(6);

  await page.getByRole('button', { name: /同音词侦探/ }).click();
  const firstTask = page.locator('[data-visual-task-id="game-homophone-fir"]');
  await expect(firstTask).toBeVisible();
  await expect(firstTask.getByRole('button', { name: '播放同音词语音' })).toBeVisible();
  await expect(firstTask.locator('.visual-image-frame')).toHaveClass(/focus-left/);
  await expect(firstTask.locator('figcaption')).toHaveText(
    '先观察对应画面，再结合句子选择正确拼写。',
  );
  await expect
    .poll(() =>
      firstTask.locator('img').evaluate((image: HTMLImageElement) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    )
    .toEqual({ width: 1200, height: 800 });

  await firstTask.getByRole('button', { name: 'fur', exact: true }).click();
  await expect(firstTask.getByText(/句中说的是一种常绿树/)).toBeVisible();
  await expect(firstTask.getByText(/fir 是“冷杉”/)).toHaveCount(0);

  await page.waitForTimeout(300);
  await firstTask.getByRole('button', { name: 'fur', exact: true }).click();
  await expect(firstTask.getByText(/句中说的是一种常绿树/)).toBeVisible();
  await page.waitForTimeout(300);
  await firstTask.getByRole('button', { name: 'fir', exact: true }).click();
  await expect(firstTask.getByText(/fir 是“冷杉”/)).toBeVisible();
  await expect(firstTask.getByText(/已完成待复习/)).toBeVisible();
  await expect(firstTask.getByRole('button', { name: '下一题 →' })).toBeFocused();
  await firstTask.getByRole('button', { name: '下一题 →' }).click();

  const secondTask = page.locator('[data-visual-task-id="game-homophone-fur"]');
  await expect(secondTask).toBeVisible();
  await expect(secondTask.locator('.visual-image-frame')).toHaveClass(/focus-right/);
  await secondTask.getByRole('button', { name: /先跳过/ }).click();
  const thirdTask = page.locator('[data-visual-task-id="game-homophone-prey"]');
  await expect(thirdTask).toBeVisible();
  await expect(thirdTask.locator('[data-action="visual-game-choice"]').first()).toBeFocused();
  await expect(page.getByText(/fur 是“动物的软毛/)).toHaveCount(0);

  await page.getByRole('button', { name: /同形词分身/ }).click();
  const homograph = page.locator('[data-visual-task-id="game-homograph-hide-noun"]');
  await expect(homograph).toContainText('hide');
  await expect(homograph.getByRole('button', { name: '播放听这个词的读音' })).toBeVisible();
  await expect(homograph).toContainText('结合读音、词性和句法判断本句词义。');
  await expect(homograph).not.toContainText('同音词要靠句子决定拼写');
  await page.getByRole('button', { name: /类比接龙/ }).click();
  await expect(page.getByText(/ecology : ecologist/)).toBeVisible();
  await page.getByRole('button', { name: /分类与上下义/ }).click();
  const taxonomy = page.locator('[data-visual-task-id="game-taxonomy-tree"]');
  await expect(taxonomy.getByRole('heading', { name: '找共同上义词' })).toBeVisible();
  await expect(taxonomy.locator('.visual-image-frame')).toHaveClass(/focus-all/);
  await expect(taxonomy.getByText('观察整图')).toBeVisible();
  const taxonomyMask = await taxonomy.locator('.visual-image-frame').evaluate((frame) => ({
    before: getComputedStyle(frame, '::before').content,
    after: getComputedStyle(frame, '::after').content,
  }));
  expect(taxonomyMask).toEqual({ before: 'none', after: 'none' });

  const saved = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    const core = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return {
      first: visual.tasks?.['game-homophone-fir'],
      skipped: visual.tasks?.['game-homophone-fur'],
      firstHistory: visual.history?.filter(
        (item: { taskId: string }) => item.taskId === 'game-homophone-fir',
      ),
      repairHistory: core.history?.filter((item: { source?: string }) => item.source === 'visual'),
      spellState: core.words?.fir?.skills?.spell,
      visualRepairPending: core.words?.fir?.visualRepairPending,
    };
  });
  expect(saved.first).toMatchObject({
    mastered: false,
    completed: true,
    needsReview: true,
  });
  expect(saved.first.attempts).toBe(3);
  expect(saved.first.correct).toBe(1);
  expect(saved.skipped).toMatchObject({
    mastered: false,
    completed: false,
    needsReview: true,
  });
  expect(saved.skipped.attempts).toBe(1);
  expect(saved.skipped.correct).toBe(0);
  expect(saved.firstHistory).toHaveLength(3);
  expect(saved.firstHistory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        targetWordId: 'fir',
        gameType: 'homophone',
        repairSkill: 'spell',
      }),
    ]),
  );
  expect(saved.repairHistory).toHaveLength(2);
  expect(saved.repairHistory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        wordId: 'fir',
        skill: 'spell',
        coreAttempt: false,
        visualTaskId: 'game-homophone-fir',
        visualGameType: 'homophone',
      }),
      expect.objectContaining({
        wordId: 'fir',
        skill: 'spell',
        coreAttempt: false,
        visualTaskId: 'game-homophone-fur',
        visualGameType: 'homophone',
      }),
    ]),
  );
  expect(saved.spellState).toBeUndefined();
  expect(saved.visualRepairPending).toMatchObject({ spell: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.locator('[data-view-link="today"]:visible').first().click();
  await page.locator('[data-view-link="practice"]:visible').first().click();
  await page.locator('[data-action="start-weak"]').click();
  await expect(page.locator('.training-panel')).toHaveAttribute('data-word-id', 'fir');
  await expect(page.locator('.skill-badge')).toHaveText('听写拼词');
  await expect(page.locator('.training-count')).toHaveText('1 / 1');
  expect(pageErrors).toEqual([]);
});

test('extends the semantic network with expert roles, word-form analogies and taxonomy', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await openVisualLab(page);

  const targetAudit = await page.evaluate(() => {
    const lab = (
      window as Window & {
        IELTS_VISUAL_LAB?: {
          gameModes?: Array<{
            tasks?: Array<{ id?: string; targetWordId?: string }>;
          }>;
        };
        IELTS_VOCABULARY?: Array<{ id?: string }>;
      }
    ).IELTS_VISUAL_LAB;
    const vocabulary = new Set(
      (
        window as Window & {
          IELTS_VOCABULARY?: Array<{ id?: string }>;
        }
      ).IELTS_VOCABULARY?.map((word) => word.id) || [],
    );
    const expected = new Set([
      'game-homograph-expert-noun',
      'game-homograph-expert-adjective',
      'game-analogy-rescuer-logger',
      'game-analogy-distance-importance',
      'game-analogy-bacterium-criterion',
      'game-taxonomy-acre',
      'game-taxonomy-organ-lung',
    ]);
    const tasks =
      lab?.gameModes
        ?.flatMap((mode) => mode.tasks || [])
        .filter((task) => expected.has(task.id || '')) || [];
    return {
      taskCount: tasks.length,
      targetIds: tasks.map((task) => task.targetWordId),
      allTargetsInLocalVocabulary: tasks.every((task) => vocabulary.has(task.targetWordId)),
    };
  });
  expect(targetAudit).toEqual({
    taskCount: 7,
    targetIds: ['expert', 'expert', 'rescue', 'distant', 'bacteria', 'acre', 'lung'],
    allTargetsInLocalVocabulary: true,
  });

  await page.getByRole('button', { name: /词网游戏/ }).click();
  await page.getByRole('button', { name: /同形词分身/ }).click();
  for (let index = 0; index < 6; index += 1) {
    await page
      .locator('.visual-game-stage')
      .getByRole('button', { name: '先跳过 · 不看答案' })
      .click();
  }

  const expertNoun = page.locator('[data-visual-task-id="game-homograph-expert-noun"]');
  await expect(expertNoun).toContainText('called in an expert');
  await expect(expertNoun).not.toContainText('an expert 指一个拥有专业知识或技能的人');
  await expertNoun.getByRole('button', { name: '形容词 · 专业的' }).click();
  await expect(expertNoun.getByText(/an 后面需要单数可数名词/)).toBeVisible();
  await expect(expertNoun).not.toContainText('an expert 指一个拥有专业知识或技能的人');
  await page.waitForTimeout(300);
  await expertNoun.getByRole('button', { name: '名词 · 专家' }).click();
  await expect(expertNoun.getByText(/an expert 指一个拥有专业知识或技能的人/)).toBeVisible();
  await expect(expertNoun.getByText(/已完成待复习/)).toBeVisible();
  await expect(expertNoun.getByRole('button', { name: '下一题 →' })).toBeFocused();
  await expertNoun.getByRole('button', { name: '下一题 →' }).click();

  const expertAdjective = page.locator('[data-visual-task-id="game-homograph-expert-adjective"]');
  await expect(expertAdjective).toContainText('expert advice');
  await expect(expertAdjective).not.toContainText('expert advice 指由专业知识或技能支持的意见');
  await expertAdjective.getByRole('button', { name: '形容词 · 专业的' }).click();
  await expect(
    expertAdjective.getByText(/expert advice 指由专业知识或技能支持的意见/),
  ).toBeVisible();

  await page.getByRole('button', { name: /类比接龙/ }).click();
  for (let index = 0; index < 4; index += 1) {
    await page
      .locator('.visual-game-stage')
      .getByRole('button', { name: '先跳过 · 不看答案' })
      .click();
  }

  const rescuerLogger = page.locator('[data-visual-task-id="game-analogy-rescuer-logger"]');
  await expect(rescuerLogger).toContainText('rescue : rescuer');
  await expect(rescuerLogger).not.toContainText('logger 另有“记录设备”义');
  await rescuerLogger.getByRole('button', { name: 'logger', exact: true }).click();
  await expect(rescuerLogger.getByText(/logger 另有“记录设备”义/)).toBeVisible();
  await rescuerLogger.getByRole('button', { name: '下一题 →' }).click();

  const distanceImportance = page.locator(
    '[data-visual-task-id="game-analogy-distance-importance"]',
  );
  await expect(distanceImportance).not.toContainText('两组都把 -ant 变为 -ance');
  await distanceImportance.getByRole('button', { name: 'important', exact: true }).click();
  await expect(distanceImportance.getByText(/由形容词变成表示“这种性质”的名词/)).toBeVisible();
  await page.waitForTimeout(300);
  await distanceImportance.getByRole('button', { name: 'importance', exact: true }).click();
  await expect(distanceImportance.getByText(/两组都把 -ant 变为 -ance/)).toBeVisible();
  await expect(distanceImportance.getByText(/已完成待复习/)).toBeVisible();
  await distanceImportance.getByRole('button', { name: '下一题 →' }).click();

  const bacteriumCriterion = page.locator(
    '[data-visual-task-id="game-analogy-bacterium-criterion"]',
  );
  await expect(bacteriumCriterion).not.toContainText('criterion 的标准复数是 criteria');
  await bacteriumCriterion.getByRole('button', { name: 'criteria', exact: true }).click();
  await expect(bacteriumCriterion.getByText(/criterion 的标准复数是 criteria/)).toBeVisible();

  await page.getByRole('button', { name: /分类与上下义/ }).click();
  for (let index = 0; index < 5; index += 1) {
    await page
      .locator('.visual-game-stage')
      .getByRole('button', { name: '先跳过 · 不看答案' })
      .click();
  }

  const acre = page.locator('[data-visual-task-id="game-taxonomy-acre"]');
  await expect(acre).not.toContainText('因此它的上义类别是');
  await acre.getByRole('button', { name: 'unit of area', exact: true }).click();
  await expect(acre.getByText(/上义类别是 unit of area/)).toBeVisible();
  await acre.getByRole('button', { name: '下一题 →' }).click();

  const organLung = page.locator('[data-visual-task-id="game-taxonomy-organ-lung"]');
  await expect(organLung).not.toContainText('肺）是 organ');
  await organLung.getByRole('button', { name: 'blood', exact: true }).click();
  await expect(organLung.getByText(/执行呼吸功能的身体器官/)).toBeVisible();
  await expect(organLung).not.toContainText('肺）是 organ');
  await page.waitForTimeout(300);
  await organLung.getByRole('button', { name: 'lung', exact: true }).click();
  await expect(organLung.getByText(/lung（肺）是 organ/)).toBeVisible();
  await expect(organLung.getByText(/已完成待复习/)).toBeVisible();

  const repairMappings = await page.evaluate(() => {
    const core = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    const ids = [
      'game-homograph-expert-noun',
      'game-analogy-distance-importance',
      'game-taxonomy-organ-lung',
    ];
    return {
      core: core.history
        ?.filter((item: { visualTaskId?: string }) => ids.includes(item.visualTaskId || ''))
        .map(
          (item: {
            visualTaskId?: string;
            wordId?: string;
            skill?: string;
            visualGameType?: string;
          }) => ({
            taskId: item.visualTaskId,
            wordId: item.wordId,
            skill: item.skill,
            gameType: item.visualGameType,
          }),
        ),
      visual: visual.history
        ?.filter((item: { taskId?: string; correct?: boolean }) => {
          return ids.includes(item.taskId || '') && !item.correct;
        })
        .map(
          (item: {
            taskId?: string;
            targetWordId?: string;
            repairSkill?: string;
            gameType?: string;
          }) => ({
            taskId: item.taskId,
            wordId: item.targetWordId,
            skill: item.repairSkill,
            gameType: item.gameType,
          }),
        ),
    };
  });
  expect(repairMappings.core).toEqual([
    {
      taskId: 'game-homograph-expert-noun',
      wordId: 'expert',
      skill: 'forms',
      gameType: 'homograph',
    },
    {
      taskId: 'game-analogy-distance-importance',
      wordId: 'distant',
      skill: 'forms',
      gameType: 'analogy',
    },
    {
      taskId: 'game-taxonomy-organ-lung',
      wordId: 'lung',
      skill: 'sentence',
      gameType: 'taxonomy',
    },
  ]);
  expect(repairMappings.visual).toEqual(repairMappings.core);

  expect(pageErrors).toEqual([]);
});

test('uses original scene clues for insulate, blubber and logger without early answer reveal', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await openVisualLab(page);
  await page.getByRole('button', { name: /词网游戏/ }).click();
  await page.getByRole('button', { name: /看图猜词/ }).click();

  for (let index = 0; index < 4; index += 1) {
    await page
      .locator('.visual-game-stage')
      .getByRole('button', { name: '先跳过 · 不看答案' })
      .click();
  }

  const insulate = page.locator('[data-visual-task-id="game-guess-insulate"]');
  await expect(insulate).toBeVisible();
  await expect
    .poll(() =>
      insulate.locator('img').evaluate((image: HTMLImageElement) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    )
    .toEqual({ width: 1200, height: 800 });
  await expect(insulate).not.toContainText('用材料阻止热、声音或电通过');
  await insulate.getByRole('button', { name: 'isolate', exact: true }).click();
  await expect(insulate.getByText(/墙里的材料阻止热量穿过/)).toBeVisible();
  await expect(insulate).not.toContainText('用材料阻止热、声音或电通过');
  await page.waitForTimeout(300);
  await insulate.getByRole('button', { name: 'insulate', exact: true }).click();
  await expect(insulate.getByText(/用材料阻止热、声音或电通过/)).toBeVisible();
  await expect(insulate.getByText(/已完成待复习/)).toBeVisible();
  await expect(insulate.getByRole('button', { name: '下一题 →' })).toBeFocused();
  await insulate.getByRole('button', { name: '下一题 →' }).click();

  const blubber = page.locator('[data-visual-task-id="game-guess-blubber"]');
  await expect(blubber).toBeVisible();
  await expect
    .poll(() =>
      blubber.locator('img').evaluate((image: HTMLImageElement) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    )
    .toEqual({ width: 1200, height: 800 });
  await expect(blubber).not.toContainText('帮助它们在冷水中保存体温');
  await blubber.getByRole('button', { name: 'blubber', exact: true }).click();
  await expect(blubber.getByText(/帮助它们在冷水中保存体温/)).toBeVisible();
  await blubber.getByRole('button', { name: '下一题 →' }).click();

  const logger = page.locator('[data-visual-task-id="game-guess-logger"]');
  await expect(logger).toBeVisible();
  await expect
    .poll(() =>
      logger.locator('img').evaluate((image: HTMLImageElement) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    )
    .toEqual({ width: 1200, height: 800 });
  await expect(logger).not.toContainText('也可指记录数据的设备或程序');
  await logger.getByRole('button', { name: 'logger', exact: true }).click();
  await expect(logger.getByText(/也可指记录数据的设备或程序/)).toBeVisible();

  const guessRepair = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    const core = JSON.parse(localStorage.getItem('els-ielts-wordlab-v1') || '{}');
    return {
      visual: visual.history?.find(
        (item: { taskId?: string; correct?: boolean }) =>
          item.taskId === 'game-guess-insulate' && !item.correct,
      ),
      core: core.history?.find(
        (item: { visualTaskId?: string }) => item.visualTaskId === 'game-guess-insulate',
      ),
    };
  });
  expect(guessRepair.visual).toMatchObject({
    targetWordId: 'insulate',
    gameType: 'guess',
    repairSkill: 'sentence',
  });
  expect(guessRepair.core).toMatchObject({
    wordId: 'insulate',
    skill: 'sentence',
    source: 'visual',
    visualGameType: 'guess',
  });

  expect(pageErrors).toEqual([]);
});

test('loads the full corpus only on demand and filters its auditable index', async ({ page }) => {
  let corpusRequests = 0;
  await page.route('**/ielts/corpus/catalog.json', async (route) => {
    corpusRequests += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 1,
        generated_at: '2026-07-29T00:00:00+08:00',
        statistics: {
          active_entries: 4,
          source_rows: 9,
          image_eligible_entries: 3,
          excluded_proper_nouns: 1,
        },
        sources: [],
        entries: [
          {
            id: 'environment',
            headword: 'environment',
            status: 'active',
            is_phrase: false,
            pos: ['noun'],
            cefr: ['B1'],
            primary_skill: 'reading',
            skill_labels: ['reading', 'writing'],
            skill_confidence: 'medium',
            source_count: 3,
            source_ids: [],
            topics: ['环境 Environment'],
            image_mode: 'concept-metaphor',
            image_priority: 'high',
            image_prompt_status: 'needs_teacher_approved_sense',
            proper_noun_sense_removed: false,
          },
          {
            id: 'accountability',
            headword: 'accountability',
            status: 'active',
            is_phrase: false,
            pos: ['noun'],
            cefr: ['C1'],
            primary_skill: 'writing',
            skill_labels: ['reading', 'writing'],
            skill_confidence: 'review',
            source_count: 2,
            source_ids: [],
            topics: ['Academic'],
            image_mode: 'concept-metaphor',
            image_priority: 'medium',
            image_prompt_status: 'needs_teacher_approved_sense',
            proper_noun_sense_removed: false,
          },
          {
            id: 'guided-tour',
            headword: 'guided tour',
            status: 'active',
            is_phrase: true,
            pos: ['phrase'],
            cefr: ['B1'],
            primary_skill: 'speaking',
            skill_labels: ['listening', 'speaking'],
            skill_confidence: 'medium',
            source_count: 1,
            source_ids: [],
            topics: ['旅游 Touring'],
            image_mode: 'none',
            image_priority: 'none',
            image_prompt_status: 'not_applicable',
            proper_noun_sense_removed: false,
          },
          {
            id: 'may',
            headword: 'may',
            status: 'active',
            is_phrase: false,
            pos: ['unspecified'],
            cefr: [],
            primary_skill: 'listening',
            skill_labels: ['listening'],
            skill_confidence: 'high',
            source_count: 1,
            source_ids: [],
            topics: ['月份 Months'],
            image_mode: 'none',
            image_priority: 'none',
            image_prompt_status: 'not_applicable',
            proper_noun_sense_removed: true,
          },
        ],
      }),
    });
  });

  await openVisualLab(page);
  expect(corpusRequests).toBe(0);
  await page.getByRole('button', { name: /词库地图/ }).click();
  await expect(page.getByRole('heading', { name: '从 PDF 词表到可审核的学习地图' })).toBeVisible();
  expect(corpusRequests).toBe(1);
  await expect(page.locator('.corpus-entry')).toHaveCount(4);
  await expect(page.getByText('专名义项已隔离')).toBeVisible();

  const skillFilter = page.locator('[data-action="corpus-filter"][data-filter="skill"]');
  await skillFilter.selectOption('writing');
  await expect(page.locator('.corpus-entry')).toHaveCount(1);
  await expect(page.getByText('accountability', { exact: true })).toBeVisible();

  await skillFilter.selectOption('all');
  await page.getByLabel('查单词或主题').fill('environment');
  await expect(page.locator('.corpus-entry')).toHaveCount(1);
  await expect(page.getByText('environment', { exact: true })).toBeVisible();

  await page.getByLabel('查单词或主题').fill('');
  await page.locator('[data-action="corpus-filter"][data-filter="pos"]').selectOption('phrase');
  await page.locator('[data-action="corpus-filter"][data-filter="cefr"]').selectOption('B1');
  await page.locator('[data-action="corpus-filter"][data-filter="image"]').selectOption('none');
  await expect(page.locator('.corpus-entry')).toHaveCount(1);
  await expect(page.getByText('guided tour', { exact: true })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('browses the published 21-PDF corpus on desktop and mobile', async ({ page }) => {
  let corpusRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/ielts/corpus/catalog.json')) corpusRequests += 1;
  });

  await openVisualLab(page);
  expect(corpusRequests).toBe(0);
  await page.getByRole('button', { name: /词库地图/ }).click();

  await expect(page.getByRole('heading', { name: '从 PDF 词表到可审核的学习地图' })).toBeVisible();
  await expect(page.locator('.corpus-stat-grid')).toContainText('7,229');
  await expect(page.locator('.corpus-stat-grid')).toContainText('12,316');
  expect(corpusRequests).toBe(1);
  await expect(page.locator('.corpus-entry')).toHaveCount(60);
  await page.getByRole('button', { name: /再显示 60 个/ }).click();
  await expect(page.locator('.corpus-entry')).toHaveCount(120);

  await page.locator('[data-action="corpus-quick-skill"][data-skill="listening"]').click();
  await expect(page.locator('[data-corpus-match-count]')).toHaveText('853');
  await expect(page.locator('[data-action="corpus-filter"][data-filter="skill"]')).toHaveValue(
    'listening',
  );
  await page.locator('[data-action="corpus-quick-skill"][data-skill="listening"]').click();

  const search = page.getByLabel('查单词或主题');
  await search.fill('burning fossil fuels');
  const correctedEntry = page.locator('.corpus-entry', {
    has: page.getByText('burning fossil fuels', { exact: true }),
  });
  await expect(correctedEntry).toBeVisible();
  await expect(correctedEntry).toContainText('听力');
  await expect(correctedEntry).toContainText('环境 Environment');

  await search.fill('may');
  const properNounReview = page.locator('.corpus-entry', {
    has: page.getByText('may', { exact: true }),
  });
  await expect(properNounReview).toBeVisible();
  await expect(properNounReview).toContainText('专名义项已隔离');

  await search.fill('Antarctica');
  await expect(page.locator('.corpus-entry')).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('recovers when the on-demand corpus request initially fails', async ({ page }) => {
  let attempts = 0;
  await page.route('**/ielts/corpus/catalog.json', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, body: 'temporarily unavailable' });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 2,
        generated_at: '2026-07-28T21:34:21Z',
        statistics: {
          active_entries: 1,
          source_rows: 1,
          image_eligible_entries: 1,
          excluded_proper_nouns: 0,
          primary_skill_counts: { reading: 1 },
        },
        sources: [],
        entries: [
          {
            id: 'word',
            headword: 'word',
            status: 'active',
            is_phrase: false,
            pos: ['noun'],
            cefr: ['A1'],
            primary_skill: 'reading',
            skill_labels: ['reading'],
            skill_confidence: 'high',
            source_count: 1,
            source_ids: [],
            topics: ['CEFR A1'],
            image_mode: 'object-or-context-scene',
            image_priority: 'medium',
            image_prompt_status: 'needs_teacher_approved_sense',
            proper_noun_sense_removed: false,
          },
        ],
      }),
    });
  });

  await openVisualLab(page);
  await page.getByRole('button', { name: /词库地图/ }).click();
  await expect(page.getByRole('heading', { name: '全量词库暂时没有载入' })).toBeVisible();
  await page.getByRole('button', { name: '重新载入' }).click();
  await expect(page.getByRole('heading', { name: '从 PDF 词表到可审核的学习地图' })).toBeVisible();
  await expect(page.getByText('word', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
