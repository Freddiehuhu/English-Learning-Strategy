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
  await page.locator('[data-view-link="visual"]:visible').first().click();
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

  await page.getByRole('button', { name: /05 图像词义实验室/ }).click();
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

test('validates all eight word-family atlases, images and hidden-answer DOM', async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await openFamilyAtlases(page);

  const atlasData = await page.evaluate(() => {
    const lab = (
      window as Window & {
        IELTS_VISUAL_LAB?: {
          familyAtlases?: Array<{ id?: unknown; targetWordId?: unknown; image?: unknown }>;
        };
      }
    ).IELTS_VISUAL_LAB;
    return (lab?.familyAtlases || []).map((atlas) => ({
      id: String(atlas.id || ''),
      targetWordId: String(atlas.targetWordId || ''),
      image: String(atlas.image || ''),
    }));
  });

  expect(atlasData).toHaveLength(8);
  await expect(page.locator('.visual-family-card')).toHaveCount(8);
  expect(new Set(atlasData.map(({ id }) => id)).size).toBe(8);
  expect(new Set(atlasData.map(({ targetWordId }) => targetWordId)).size).toBe(8);
  expect(new Set(atlasData.map(({ image }) => image)).size).toBe(8);

  const safeId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const safeImage = /^\.\/images\/semantic-lab\/family-[a-z0-9-]+-v\d+\.webp$/;
  for (const atlas of atlasData) {
    expect(atlas.id).toMatch(safeId);
    expect(atlas.targetWordId).toMatch(safeId);
    expect(atlas.image).toMatch(safeImage);
  }
  for (const expectedAtlas of FAMILY_ATLASES) {
    expect(atlasData).toContainEqual({
      id: expectedAtlas.id,
      targetWordId: expectedAtlas.targetWordId,
      image: expectedAtlas.image,
    });
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

  await card.getByLabel('直接输入英文变形').fill('strong');
  await card.getByRole('button', { name: '检查拼写' }).click();
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
  await card.getByRole('button', { name: 'fascinated', exact: true }).click();

  await expect(card.getByText('两个场景都已判断正确')).toBeVisible();
  await expect(card.getByText(/区别主要是程度/)).toBeVisible();

  const saved = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return visual.tasks?.['syn-interest-fascinate'];
  });
  expect(saved.mastered).toBe(true);
  expect(saved.attempts).toBe(2);
  expect(saved.correct).toBe(2);
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
    expect(layout.items).toHaveLength(6);
    layout.items.forEach((box) => {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    });
  }
});

test('supports homophone, homograph, analogy and taxonomy games without revealing skipped answers', async ({
  page,
}) => {
  await openVisualLab(page);
  const coreBefore = await page.evaluate(() => localStorage.getItem('els-ielts-wordlab-v1'));

  await page.getByRole('button', { name: /词网游戏/ }).click();
  await expect(page.getByRole('heading', { name: '把单词连成一张会思考的网' })).toBeVisible();
  await expect(page.locator('.visual-game-mode')).toHaveCount(6);

  await page.getByRole('button', { name: /同音词侦探/ }).click();
  const firstTask = page.locator('[data-visual-task-id="game-homophone-fir"]');
  await expect(firstTask).toBeVisible();
  await expect(firstTask.getByRole('button', { name: '播放同音词语音' })).toBeVisible();

  await firstTask.getByRole('button', { name: 'fur', exact: true }).click();
  await expect(firstTask.getByText(/句中说的是一种常绿树/)).toBeVisible();
  await expect(firstTask.getByText(/fir 是“冷杉”/)).toHaveCount(0);

  await page.waitForTimeout(300);
  await firstTask.getByRole('button', { name: 'fir', exact: true }).click();
  await expect(firstTask.getByText(/fir 是“冷杉”/)).toBeVisible();
  await firstTask.getByRole('button', { name: '下一题 →' }).click();

  const secondTask = page.locator('[data-visual-task-id="game-homophone-fur"]');
  await expect(secondTask).toBeVisible();
  await secondTask.getByRole('button', { name: /先跳过/ }).click();
  await expect(page.locator('[data-visual-task-id="game-homophone-prey"]')).toBeVisible();
  await expect(page.getByText(/fur 是“动物的软毛/)).toHaveCount(0);

  await page.getByRole('button', { name: /同形词分身/ }).click();
  await expect(page.locator('[data-visual-task-id="game-homograph-hide-noun"]')).toContainText(
    'hide',
  );
  await page.getByRole('button', { name: /类比接龙/ }).click();
  await expect(page.getByText(/ecology : ecologist/)).toBeVisible();
  await page.getByRole('button', { name: /分类与上下义/ }).click();
  await expect(page.getByRole('heading', { name: '找共同上义词' })).toBeVisible();

  const saved = await page.evaluate(() => {
    const visual = JSON.parse(localStorage.getItem('els-ielts-visual-lab-v1') || '{}');
    return {
      core: localStorage.getItem('els-ielts-wordlab-v1'),
      first: visual.tasks?.['game-homophone-fir'],
      skipped: visual.tasks?.['game-homophone-fur'],
    };
  });
  expect(saved.core).toBe(coreBefore);
  expect(saved.first.mastered).toBe(true);
  expect(saved.first.attempts).toBe(2);
  expect(saved.first.correct).toBe(1);
  expect(saved.skipped.mastered).toBe(false);
  expect(saved.skipped.attempts).toBe(1);
  expect(saved.skipped.correct).toBe(0);
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
