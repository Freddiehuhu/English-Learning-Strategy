(function () {
  'use strict';

  var WORDS = Array.isArray(window.IELTS_VOCABULARY) ? window.IELTS_VOCABULARY : [];
  var STORAGE_KEY = 'els-ielts-wordlab-v1';
  var SKILLS = ['sound', 'spell', 'forms', 'sentence'];
  var SKILL_LABELS = {
    sound: '听音跟读',
    spell: '听写拼词',
    forms: '词形变换',
    sentence: '句子运用',
  };
  var SKILL_SHORT = {
    sound: '跟读',
    spell: '拼写',
    forms: '词形',
    sentence: '句用',
  };
  var POS_LABELS = {
    'n.': '名词',
    'v.': '动词',
    'adj.': '形容词',
    'adv.': '副词',
  };
  var FORM_FOUNDATIONS = [
    [
      'beauty',
      '美；美丽',
      [
        ['beauty', 'n.', '美；美丽', '这是题面给出的名词。'],
        ['beautify', 'v.', '美化', '名词末尾的 -y 改为动词词尾 -ify。'],
        ['beautiful', 'adj.', '美丽的', '名词末尾的 y 不保留；形容词词尾是 -iful。'],
        ['beautifully', 'adv.', '美丽地', '先写出形容词，再加副词词尾 -ly。'],
      ],
    ],
    [
      'success',
      '成功',
      [
        ['success', 'n.', '成功', '这是题面给出的名词。'],
        ['succeed', 'v.', '成功；做到', '动词不是简单加后缀；注意词尾写作 -ceed。'],
        ['successful', 'adj.', '成功的', '在名词后接 -ful，并保留原词中的双写字母。'],
        ['successfully', 'adv.', '成功地', '先写出形容词，再加 -ly。'],
      ],
    ],
    [
      'decision',
      '决定',
      [
        ['decision', 'n.', '决定', '这是题面给出的名词。'],
        ['decide', 'v.', '决定', '名词词尾 -sion 对应的动词以 -de 结尾。'],
        ['decisive', 'adj.', '决定性的；果断的', '从动词出发，去掉末尾 e，再接 -ive。'],
        ['decisively', 'adv.', '果断地', '先写出形容词，再加 -ly。'],
      ],
    ],
    [
      'strength',
      '力量；强度',
      [
        ['strength', 'n.', '力量；强度', '这是题面给出的名词。'],
        ['strengthen', 'v.', '加强', '在名词后接动词词尾 -en，并保留 -th。'],
        ['strong', 'adj.', '强的', '这是词干元音变化，不是简单添加后缀。'],
        ['strongly', 'adv.', '强烈地', '先写出形容词，再加 -ly。'],
      ],
    ],
    [
      'danger',
      '危险',
      [
        ['danger', 'n.', '危险', '这是题面给出的名词。'],
        ['endanger', 'v.', '危及', '在名词前加动词前缀 en-。'],
        ['dangerous', 'adj.', '危险的', '保留 danger，再接形容词词尾 -ous。'],
        ['dangerously', 'adv.', '危险地', '先写出形容词，再加 -ly。'],
      ],
    ],
    [
      'difference',
      '差异',
      [
        ['difference', 'n.', '差异', '这是题面给出的名词。'],
        ['differ', 'v.', '不同', '去掉名词词尾 -ence，并保留双写 r。'],
        ['different', 'adj.', '不同的', '从动词出发接 -ent，并保留双写 f。'],
        ['differently', 'adv.', '不同地', '先写出形容词，再加 -ly。'],
      ],
    ],
    [
      'competition',
      '竞争',
      [
        ['competition', 'n.', '竞争', '这是题面给出的名词。'],
        ['compete', 'v.', '竞争', '名词去掉 -ition 后，动词以 -ete 结尾。'],
        [
          'competitive',
          'adj.',
          '竞争性的；竞争激烈的；有竞争力的',
          '从动词出发，去掉末尾 e，再接 -itive。',
        ],
        ['competitively', 'adv.', '竞争性地；以有竞争力的方式', '先写出形容词，再加 -ly。'],
      ],
    ],
    [
      'creation',
      '创造；作品',
      [
        ['creation', 'n.', '创造；作品', '这是题面给出的名词。'],
        ['create', 'v.', '创造', '去掉名词词尾 -ion，恢复动词末尾 e。'],
        ['creative', 'adj.', '有创造力的', '从动词出发，去掉末尾 e，再接 -ive。'],
        ['creatively', 'adv.', '创造性地', '先写出形容词，再加 -ly。'],
      ],
    ],
  ].map(function (group) {
    var family = group[2];
    return {
      id: 'foundation-' + group[0],
      word: group[0],
      pos: 'n. / v. / adj. / adv.',
      zh: group[1],
      topic: '基础词族',
      family: family,
      isFoundation: true,
      practiceMode: 'family',
      formPractice: {
        type: 'family',
        base: group[0],
        slots: family.map(function (item, index) {
          return {
            key: item[1],
            label: POS_LABELS[item[1]],
            answer: item[0],
            gloss: item[2],
            hint: item[3],
            given: index === 0,
          };
        }),
      },
    };
  });
  var DIRECT_FORM_DRILLS = [
    [
      'ecologist',
      'ecology',
      'ecological',
      'adj.',
      '形容词',
      '生态的',
      'direct',
      '名词末尾的 y 不保留，形容词词尾是 -ical。',
    ],
    [
      'expert',
      'expert',
      'expertise',
      'n.',
      '抽象名词',
      '专业知识',
      'direct',
      '在词干后接 -ise；这个结果是不可数名词。',
    ],
    ['lung', 'lung', 'lungs', 'n.', '名词复数', '肺（复数）', 'inflection', '规则复数直接加 -s。'],
    [
      'ailment',
      'ail',
      'ailment',
      'n.',
      '名词',
      '小病；疾病',
      'direct',
      '在动词后接名词词尾 -ment。',
    ],
    [
      'poison',
      'poison',
      'poisonous',
      'adj.',
      '形容词',
      '本身有毒的',
      'direct',
      '在名词后接形容词词尾 -ous。',
    ],
    [
      'fascinate',
      'fascinate',
      'fascinating',
      'v-ing',
      '-ing 形容词',
      '令人着迷的',
      'inflection',
      '去掉词尾不发音的 e，再加 -ing。',
    ],
    [
      'birch',
      'birch',
      'birches',
      'n.',
      '名词复数',
      '桦树（复数）',
      'inflection',
      '以 -ch 结尾，复数加 -es。',
    ],
    [
      'sturdy',
      'sturdy',
      'sturdier',
      'adj.',
      '比较级形容词',
      '更结实的',
      'inflection',
      '辅音字母 + y 结尾：把 y 改为 i，再加 -er。',
    ],
    [
      'acre',
      'acre',
      'acres',
      'n.',
      '名词复数',
      '英亩（复数）',
      'inflection',
      '规则复数直接加 -s。',
    ],
    [
      'spruce',
      'spruce',
      'spruces',
      'n.',
      '名词复数',
      '云杉（复数）',
      'inflection',
      '词尾已有 e，复数直接加 -s。',
    ],
    [
      'dominate',
      'dominate',
      'dominant',
      'adj.',
      '形容词',
      '占主导的',
      'direct',
      '把动词词尾 -ate 改为形容词词尾 -ant。',
    ],
    [
      'prize',
      'prize',
      'prized',
      'adj.',
      '形容词',
      '珍贵的；受重视的',
      'inflection',
      '词尾已有 e，构成 -ed 形式时只加 d。',
    ],
    [
      'teem',
      'teem',
      'teeming',
      'v-ing',
      '-ing 形式',
      '充满的',
      'inflection',
      '直接加 -ing，并保留词干中的双写 e。',
    ],
    [
      'observation',
      'observe',
      'observation',
      'n.',
      '名词',
      '观察',
      'direct',
      '去掉动词末尾 e，再接名词词尾 -ation。',
    ],
    [
      'distant',
      'distant',
      'distance',
      'n.',
      '名词',
      '距离',
      'direct',
      '把形容词词尾 -ant 改为名词词尾 -ance。',
    ],
    [
      'profit',
      'profit',
      'profitable',
      'adj.',
      '形容词',
      '有利润的；有益的',
      'direct',
      '在词干后接形容词词尾 -able。',
    ],
    [
      'logger',
      'log',
      'logging',
      'v-ing',
      '-ing 形式',
      '伐木；记录',
      'inflection',
      '短元音后的单辅音 g 双写，再加 -ing。',
    ],
    [
      'bacteria',
      'bacterium',
      'bacteria',
      'n.',
      '不规则名词复数',
      '细菌（复数）',
      'inflection',
      '拉丁来源词：单数词尾 -um 改为复数词尾 -a。',
    ],
    [
      'anti-pollution',
      'pollute',
      'pollution',
      'n.',
      '名词',
      '污染',
      'direct',
      '去掉动词末尾 e，再接名词词尾 -ion。',
    ],
    [
      'walrus',
      'walrus',
      'walruses',
      'n.',
      '名词复数',
      '海象（复数）',
      'inflection',
      '以 -s 结尾，复数加 -es。',
    ],
    [
      'kayak',
      'kayak',
      'kayaking',
      'v-ing',
      '-ing 形式',
      '划皮艇',
      'inflection',
      '直接加 -ing，不双写末尾 k。',
    ],
    [
      'chase',
      'chase',
      'chasing',
      'v-ing',
      '-ing 形式',
      '追逐',
      'inflection',
      '去掉词尾不发音的 e，再加 -ing。',
    ],
    [
      'prey',
      'prey',
      'preying',
      'v-ing',
      '-ing 形式',
      '捕食',
      'inflection',
      '直接加 -ing，并保留词尾 y。',
    ],
    [
      'insulate',
      'insulate',
      'insulation',
      'n.',
      '名词',
      '隔热；绝缘',
      'direct',
      '去掉动词末尾 e，再接名词词尾 -ion。',
    ],
    [
      'starve',
      'starve',
      'starvation',
      'n.',
      '名词',
      '饥饿；饿死',
      'direct',
      '去掉动词末尾 e，再接名词词尾 -ation。',
    ],
    [
      'victim',
      'victim',
      'victimise',
      'v.',
      '英式动词',
      '使受害；迫害',
      'direct',
      '英式拼写在名词后接 -ise。',
    ],
    [
      'rescue',
      'rescue',
      'rescuer',
      'n.',
      '人物名词',
      '救援者',
      'direct',
      '词尾已有 e，表示人的名词只需再接 r。',
    ],
    [
      'beam',
      'beam',
      'beamed',
      'v-ed',
      '过去式／过去分词',
      '照射；微笑',
      'inflection',
      '规则变化直接加 -ed。',
    ],
    [
      'beeper',
      'beep',
      'beeping',
      'v-ing',
      '-ing 形式',
      '发出哔哔声',
      'inflection',
      '直接加 -ing，不双写末尾 p。',
    ],
    [
      'hide-noun',
      'hide',
      'hides',
      'n.',
      '名词复数',
      '兽皮（复数）',
      'inflection',
      '规则复数直接加 -s。',
    ],
    [
      'enthusiasm',
      'enthusiasm',
      'enthusiastic',
      'adj.',
      '形容词',
      '热情的',
      'direct',
      '把名词词尾 -asm 改为形容词词尾 -astic。',
    ],
  ].reduce(function (drills, item) {
    drills[item[0]] = {
      type: item[6],
      base: item[1],
      answer: item[2],
      targetPos: item[3],
      targetLabel: item[4],
      gloss: item[5],
      ruleHint: item[7],
    };
    return drills;
  }, {});
  var INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
  var state = loadState();
  var currentView = 'today';
  var session = null;
  var currentAudio = null;
  var playingButton = null;
  var recorder = null;
  var recordStream = null;
  var recordChunks = [];
  var recordUrl = '';
  var recordTimer = null;
  var toastTimer = null;
  var advanceTimer = null;

  var main = document.getElementById('mainContent');
  var auditDialog = document.getElementById('auditDialog');
  var settingsDialog = document.getElementById('settingsDialog');
  var toast = document.getElementById('toast');

  init();

  function init() {
    if (!main || WORDS.length === 0) {
      if (main) {
        main.innerHTML =
          '<div class="empty-state">词库载入失败，请刷新页面或检查 vocabulary.js。</div>';
      }
      return;
    }

    var ids = new Set(
      WORDS.map(function (word) {
        return word.id;
      }),
    );
    if (ids.size !== WORDS.length) {
      console.error('WordLab vocabulary contains duplicate IDs.');
    }

    document.querySelectorAll('[data-view-link]').forEach(function (button) {
      button.addEventListener('click', function () {
        navigate(button.dataset.viewLink);
      });
    });

    document.getElementById('openAudit').addEventListener('click', function () {
      auditDialog.showModal();
    });
    document.getElementById('openSettings').addEventListener('click', openSettings);
    document.getElementById('saveSettings').addEventListener('click', saveSettings);

    document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
      button.addEventListener('click', function () {
        var dialog = button.closest('dialog');
        if (dialog) dialog.close();
      });
    });

    [auditDialog, settingsDialog].forEach(function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) dialog.close();
      });
    });

    main.addEventListener('click', handleMainClick);
    main.addEventListener('submit', handleMainSubmit);
    main.addEventListener('change', handleMainChange);

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    renderToday();
    scrollToTop();

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || isLocalhost())) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {
          // The app remains fully usable without installation/offline caching.
        });
      });
    }
  }

  function defaultState() {
    return {
      version: 1,
      settings: {
        accent: 'uk',
        dailyNew: 6,
        slowFirst: true,
      },
      daily: {
        date: '',
        newIds: [],
      },
      words: {},
      history: [],
      journal: [],
    };
  }

  function loadState() {
    var base = defaultState();
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return base;
      return {
        version: 1,
        settings: Object.assign({}, base.settings, saved.settings || {}),
        daily:
          saved.daily && typeof saved.daily === 'object'
            ? {
                date: String(saved.daily.date || ''),
                newIds: Array.isArray(saved.daily.newIds) ? saved.daily.newIds.slice(0, 10) : [],
              }
            : base.daily,
        words: saved.words && typeof saved.words === 'object' ? saved.words : {},
        history: Array.isArray(saved.history) ? saved.history.slice(-240) : [],
        journal: Array.isArray(saved.journal) ? saved.journal.slice(-120) : [],
      };
    } catch (error) {
      console.warn('Could not read saved WordLab progress.', error);
      return base;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast('浏览器未能保存进度，请在“进度”页导出备份。');
    }
  }

  function getWordState(wordId) {
    if (!state.words[wordId]) {
      state.words[wordId] = { skills: {} };
    }
    if (!state.words[wordId].skills) {
      state.words[wordId].skills = {};
    }
    return state.words[wordId];
  }

  function getSkillState(wordId, skill) {
    var wordState = getWordState(wordId);
    if (!wordState.skills[skill]) {
      wordState.skills[skill] = {
        attempts: 0,
        correct: 0,
        level: 0,
        due: 0,
        last: 0,
      };
    }
    return wordState.skills[skill];
  }

  function peekSkillState(wordId, skill) {
    var wordState = state.words[wordId];
    if (!wordState || !wordState.skills || !wordState.skills[skill]) {
      return { attempts: 0, correct: 0, level: 0, due: 0, last: 0 };
    }
    return wordState.skills[skill];
  }

  function recordResult(word, skill, correct, detail) {
    var skillState = getSkillState(word.id, skill);
    var now = Date.now();
    skillState.attempts += 1;
    if (correct) {
      skillState.correct += 1;
      skillState.level = Math.min(5, skillState.level + 1);
      skillState.due = startOfToday() + INTERVAL_DAYS[skillState.level] * 86400000;
    } else {
      skillState.level = Math.max(0, skillState.level - 1);
      skillState.due = startOfToday();
    }
    skillState.last = now;

    state.history.push({
      wordId: word.id,
      word: word.word,
      skill: skill,
      correct: Boolean(correct),
      detail: detail || (correct ? '首次完成' : '需要复习'),
      at: now,
    });
    state.history = state.history.slice(-240);
    saveState();

    if (session) {
      if (!session.stats[skill]) session.stats[skill] = { attempts: 0, correct: 0 };
      session.stats[skill].attempts += 1;
      if (correct) session.stats[skill].correct += 1;
    }
  }

  function navigate(view) {
    clearTimeout(advanceTimer);
    cleanupMedia();
    session = null;
    currentView = view;

    if (view === 'today') {
      renderToday();
    } else if (view === 'progress') {
      renderProgress();
    } else if (SKILLS.indexOf(view) >= 0) {
      startSkillSession(view);
    } else if (view === 'learn') {
      startSkillSession('sound');
    } else {
      renderToday();
    }
    scrollToTop();
  }

  function setActiveNav(view) {
    var normalised = view === 'sound' ? 'learn' : view;
    document.querySelectorAll('[data-view-link]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.viewLink === normalised);
    });
  }

  function renderToday() {
    currentView = 'today';
    setActiveNav('today');
    var queue = buildDailyQueue();
    var summary = progressSummary();
    var dueCount = countDueSkills();
    var today = new Intl.DateTimeFormat('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date());

    main.innerHTML =
      '<section class="page-heading">' +
      '<div>' +
      '<p class="eyebrow">TODAY’S PRACTICE</p>' +
      '<h1>今天先练准确，再练速度</h1>' +
      '<p>每个词分别训练声音、拼写、词形和句中使用；只认识中文不算掌握。</p>' +
      '</div>' +
      '<span class="date-chip">' +
      esc(today) +
      '</span>' +
      '</section>' +
      '<section class="today-layout">' +
      '<article class="panel start-panel">' +
      '<p class="eyebrow">15–20 MINUTES</p>' +
      '<h2>' +
      (queue.length ? '今日 ' + queue.length + ' 词，完成四关训练' : '今日到期任务已完成') +
      '</h2>' +
      '<p>' +
      (queue.length
        ? '先听音和跟读，再完成无提示听写、词性判断与词形填写，最后用词块搭出正确句子并仿写。'
        : '你可以继续做专项练习，或明天按间隔计划回来复习。') +
      '</p>' +
      '<ol class="session-steps">' +
      '<li>01 听音跟读</li><li>02 听写拼词</li><li>03 词形变换</li><li>04 句子迁移</li>' +
      '</ol>' +
      '<div class="start-actions">' +
      '<button class="primary-button" type="button" data-action="start-daily"' +
      (queue.length ? '' : ' disabled') +
      '>' +
      (queue.length ? '开始今日训练 →' : '今日任务已完成') +
      '</button>' +
      '<button class="secondary-button" type="button" data-action="start-weak">只练薄弱词</button>' +
      '<span class="mini-metric">' +
      dueCount +
      ' 项能力待复习</span>' +
      '</div>' +
      '</article>' +
      '<div class="dashboard-side">' +
      '<article class="panel metric-panel">' +
      '<h3>学习概览</h3>' +
      '<div class="metric-grid">' +
      metric(summary.started, '已开始') +
      metric(summary.stable, '稳定掌握') +
      metric(summary.mistakes, '近期待纠正') +
      '</div>' +
      '</article>' +
      '<article class="panel skill-panel">' +
      '<h3>四项能力</h3>' +
      skillBars(summary.skills) +
      '</article>' +
      '</div>' +
      '</section>' +
      '<section class="module-grid" aria-label="专项训练">' +
      moduleCard(
        '01',
        '声音与跟读',
        '听英音／美音，拆音节与重音，录下自己的发音做 A/B 对比。',
        'sound',
      ) +
      moduleCard('02', '听写拼词', '关闭键盘自动纠错，只听声音输入；错误提示逐级出现。', 'spell') +
      moduleCard(
        '03',
        '词形变换',
        '混合练习四格词族、直接变形、屈折规则和语境填空；答对前不显示答案。',
        'forms',
      ) +
      moduleCard(
        '04',
        '句子工坊',
        '从词块排序到受控仿写，用范句和检查表修改自己的句子。',
        'sentence',
      ) +
      '</section>';
  }

  function metric(value, label) {
    return (
      '<div class="metric"><strong>' +
      esc(value == null ? 0 : value) +
      '</strong><span>' +
      esc(label) +
      '</span></div>'
    );
  }

  function moduleCard(number, title, description, skill) {
    return (
      '<button class="module-card" type="button" data-action="start-skill" data-skill="' +
      skill +
      '">' +
      '<span>' +
      '<span class="module-number">' +
      number +
      '</span>' +
      '<h3>' +
      esc(title) +
      '</h3>' +
      '<p>' +
      esc(description) +
      '</p>' +
      '</span>' +
      '<small>进入专项 →</small>' +
      '</button>'
    );
  }

  function skillBars(skills) {
    return (
      '<div class="skill-list">' +
      SKILLS.map(function (skill) {
        var percentage = skills[skill] || 0;
        return (
          '<div class="skill-row">' +
          '<span>' +
          SKILL_SHORT[skill] +
          '</span>' +
          '<div class="progress-track"><span style="--progress:' +
          percentage +
          '%"></span></div>' +
          '<strong>' +
          percentage +
          '%</strong>' +
          '</div>'
        );
      }).join('') +
      '</div>'
    );
  }

  function startDailySession() {
    var queue = buildDailyQueue();
    if (!queue.length) {
      showToast('今天没有到期任务，可以选择一个专项继续练习。');
      return;
    }
    session = {
      type: 'daily',
      words: queue,
      wordIndex: 0,
      stageIndex: 0,
      stages: SKILLS.slice(),
      stats: {},
      taskState: {},
      token: Date.now(),
    };
    renderSession();
    scrollToTop();
  }

  function startWeakSession() {
    var weak = WORDS.slice()
      .sort(function (a, b) {
        return overallWordScore(a.id) - overallWordScore(b.id);
      })
      .filter(function (word) {
        return hasAnyAttempt(word.id);
      })
      .slice(0, 8);
    if (!weak.length) {
      weak = seededWords(WORDS).slice(0, Number(state.settings.dailyNew) || 6);
    }
    session = {
      type: 'daily',
      words: weak,
      wordIndex: 0,
      stageIndex: 0,
      stages: SKILLS.slice(),
      stats: {},
      taskState: {},
      token: Date.now(),
    };
    renderSession();
    scrollToTop();
  }

  function startSkillSession(skill) {
    currentView = skill;
    var queue = skill === 'forms' ? buildFormsQueue(12) : buildSkillQueue(skill, 10);
    session = {
      type: 'skill',
      words: queue,
      wordIndex: 0,
      stageIndex: 0,
      stages: [skill],
      stats: {},
      taskState: {},
      token: Date.now(),
    };
    renderSession();
    scrollToTop();
  }

  function renderSession() {
    if (!session || session.wordIndex >= session.words.length) {
      renderSessionComplete();
      return;
    }
    cleanupMedia();

    var word = currentWord();
    var skill = currentSkill();
    var currentTaskNumber =
      session.type === 'daily'
        ? session.wordIndex * session.stages.length + session.stageIndex + 1
        : session.wordIndex + 1;
    var totalTasks =
      session.type === 'daily'
        ? session.words.length * session.stages.length
        : session.words.length;

    setActiveNav(skill);
    currentView = skill;
    var headings = {
      sound: ['听音跟读', '先建立声音，再看拼写。录音只在当前页面内使用。'],
      spell: ['听写拼词', '关掉提示，只听音输入。答错时提示会逐级增加。'],
      forms: ['词形变换', '四格词族、直接变形与语境填空交替出现；答案在答对前保持隐藏。'],
      sentence: ['句子工坊', '先用词块搭好骨架，再完成受控仿写与修改。'],
    };

    main.innerHTML =
      '<section class="page-heading">' +
      '<div>' +
      '<p class="eyebrow">' +
      (session.type === 'daily' ? 'DAILY SESSION' : 'FOCUS PRACTICE') +
      '</p>' +
      '<h1>' +
      headings[skill][0] +
      '</h1>' +
      '<p>' +
      headings[skill][1] +
      '</p>' +
      '</div>' +
      '<span class="date-chip">任务 ' +
      currentTaskNumber +
      ' / ' +
      totalTasks +
      '</span>' +
      '</section>' +
      '<section class="training-shell">' +
      '<article class="panel training-panel">' +
      renderTask(word, skill, currentTaskNumber, totalTasks) +
      '</article>' +
      '<aside class="training-aside">' +
      renderQueuePanel() +
      renderTrainingTip(word, skill) +
      '</aside>' +
      '</section>';

    if (skill === 'spell') {
      setTimeout(function () {
        var input = document.getElementById('spellInput');
        if (input) input.focus({ preventScroll: true });
      }, 50);
    } else if (skill === 'forms' && !session.taskState.completed) {
      var formExercise = getFormExercise(word);
      if (formExercise.type !== 'context' || session.taskState.posPassed) {
        focusCurrentFormInput(formExercise, session.taskState);
      }
    }
  }

  function renderTask(word, skill, currentTaskNumber, totalTasks) {
    var badge =
      '<div class="training-kicker"><span class="skill-badge">' +
      SKILL_LABELS[skill] +
      '</span><span class="training-count">' +
      currentTaskNumber +
      ' / ' +
      totalTasks +
      '</span></div>';
    if (skill === 'sound') return badge + renderSoundTask(word);
    if (skill === 'spell') return badge + renderSpellTask(word);
    if (skill === 'forms') return badge + renderFormsTask(word);
    return badge + renderSentenceTask(word);
  }

  function renderQueuePanel() {
    var wordPosition = session.wordIndex + 1;
    var stageText =
      session.type === 'daily'
        ? '第 ' +
          wordPosition +
          ' / ' +
          session.words.length +
          ' 词 · ' +
          SKILL_SHORT[currentSkill()]
        : '第 ' + wordPosition + ' / ' + session.words.length + ' 题';
    return (
      '<article class="panel queue-panel">' +
      '<h3>当前队列</h3>' +
      '<p>' +
      (session.type === 'daily'
        ? '同一个词依次通过四关。'
        : currentSkill() === 'forms'
          ? '基础词族与薄弱词交替，题型不会连续重复。'
          : '到期和薄弱项目优先。') +
      '</p>' +
      '<div class="queue-progress"><span>' +
      esc(stageText) +
      '</span><button class="quiet-button" type="button" data-action="leave-session">退出</button></div>' +
      '<div class="queue-dots">' +
      session.words
        .map(function (_, index) {
          var className =
            index < session.wordIndex
              ? 'queue-dot is-done'
              : index === session.wordIndex
                ? 'queue-dot is-current'
                : 'queue-dot';
          return '<span class="' + className + '"></span>';
        })
        .join('') +
      '</div>' +
      '</article>'
    );
  }

  function renderTrainingTip(word, skill) {
    if (skill === 'forms') {
      return (
        '<article class="panel info-panel"><h3>无答案提示</h3>' +
        '<p>先确定目标词性，再回忆拼写规则。需要帮助时，系统只给规则、词形轮廓和乱序字母，不会替你填答案。</p>' +
        '</article>'
      );
    }
    return (
      '<article class="panel info-panel"><h3>本词提醒</h3><p>' + esc(word.tip) + '</p></article>'
    );
  }

  function renderSoundTask(word) {
    var sourceBadge =
      word.source && normaliseAnswer(word.source) !== normaliseAnswer(word.word)
        ? '<span class="source-badge">原词形：' + esc(word.source) + '</span>'
        : '';
    return (
      '<div class="word-stage">' +
      '<span class="topic-badge">' +
      esc(word.topic) +
      '</span>' +
      '<h2>' +
      esc(word.word) +
      '</h2>' +
      '<div class="word-meta"><span class="ipa">' +
      esc(word.ipa) +
      '</span><span class="pos-badge">' +
      esc(word.pos) +
      '</span>' +
      sourceBadge +
      '</div>' +
      '<p class="syllable-line">' +
      syllableHtml(word) +
      '</p>' +
      '<div class="audio-row">' +
      audioButton('uk', word.id, 1, '单词 · 英') +
      audioButton('us', word.id, 1, '单词 · 美') +
      exampleAudioButton('uk', word.id, '例句 · 英') +
      exampleAudioButton('us', word.id, '例句 · 美') +
      '</div>' +
      '<div class="record-box">' +
      '<p>跟读方法：听范音 → 录下自己 → 交替播放。重点检查重音和尾音，不评价“口音像不像”。</p>' +
      '<div class="record-actions">' +
      '<button class="secondary-button" type="button" data-action="record-toggle">● 录下跟读</button>' +
      '<button class="secondary-button" type="button" data-action="play-recording" disabled>▶ 回放自己</button>' +
      '</div>' +
      '<p id="recordStatus" aria-live="polite"></p>' +
      '</div>' +
      '<button class="quiet-button" type="button" data-action="reveal-word">查看词义与词族</button>' +
      '<div class="reveal-card" id="wordReveal" hidden>' +
      '<div class="meaning-line"><strong>' +
      esc(word.zh) +
      '</strong><span class="pos-badge">' +
      esc(word.pos) +
      '</span></div>' +
      '<p class="collocation">高频搭配：<code>' +
      esc(word.collocation) +
      '</code></p>' +
      '<p class="example">' +
      esc(joinChunks(word.chunks)) +
      '<small>' +
      esc(word.exampleCn) +
      '</small></p>' +
      '<div class="family-strip">' +
      familyHtml(word) +
      '</div>' +
      '</div>' +
      '<div class="card-actions">' +
      '<button class="secondary-button" type="button" data-action="mark-sound" data-correct="false">还不稳，再排期</button>' +
      '<button class="primary-button" type="button" data-action="mark-sound" data-correct="true">跟读清楚了 →</button>' +
      '</div>' +
      '</div>'
    );
  }

  function audioButton(accent, id, rate, label, secondary) {
    return (
      '<button class="audio-button' +
      (secondary ? ' secondary-audio' : '') +
      '" type="button" data-action="play-word" data-accent="' +
      accent +
      '" data-audio-id="' +
      esc(id) +
      '" data-rate="' +
      rate +
      '">▶ ' +
      esc(label) +
      '</button>'
    );
  }

  function exampleAudioButton(accent, id, label) {
    return (
      '<button class="audio-button secondary-audio" type="button" data-action="play-example" data-accent="' +
      accent +
      '" data-audio-id="' +
      esc(id) +
      '">▶ ' +
      esc(label) +
      '</button>'
    );
  }

  function renderSpellTask(word) {
    var stateForTask = session.taskState;
    var visibleAnswer = stateForTask.answerVisible;
    return (
      '<div class="word-stage">' +
      '<span class="topic-badge">' +
      esc(word.topic) +
      '</span>' +
      '<p class="question-lead">点击播放，输入你听到的完整单词。' +
      letterCountText(word.word) +
      '</p>' +
      '<button class="listen-orb" type="button" data-action="play-word" data-accent="' +
      state.settings.accent +
      '" data-audio-id="' +
      esc(word.id) +
      '" data-rate="' +
      (state.settings.slowFirst && !stateForTask.played ? '0.78' : '1') +
      '" aria-label="播放单词">▶</button>' +
      '<form class="answer-form" data-skill-form="spell">' +
      '<label class="eyebrow" for="spellInput">TYPE WHAT YOU HEAR</label>' +
      '<input class="answer-input" id="spellInput" name="answer" type="text" inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="在这里拼写" ' +
      (visibleAnswer ? 'disabled' : '') +
      ' />' +
      '<div class="input-actions">' +
      '<button class="secondary-button" type="button" data-action="reveal-spell">不会，逐级提示</button>' +
      '<button class="primary-button" type="submit"' +
      (visibleAnswer ? ' disabled' : '') +
      '>检查拼写</button>' +
      '</div>' +
      '</form>' +
      '<div class="feedback' +
      (visibleAnswer ? ' is-wrong' : '') +
      '" id="spellFeedback" aria-live="polite">' +
      (visibleAnswer
        ? '答案：<strong>' +
          esc(word.word) +
          '</strong>。看清音节后，点击“遮住并重写”。<div class="input-actions"><button class="secondary-button" type="button" data-action="hide-spell-answer">遮住并重写</button></div>'
        : '') +
      '</div>' +
      '</div>'
    );
  }

  function renderFormsTask(word) {
    var task = session.taskState;
    var exercise = getFormExercise(word);
    if (exercise.type === 'family') return renderFamilyFormsTask(word, exercise, task);
    if (exercise.type === 'direct' || exercise.type === 'inflection') {
      return renderDirectFormsTask(word, exercise, task);
    }
    return renderContextFormsTask(word, exercise, task);
  }

  function renderContextFormsTask(word, exercise, task) {
    return (
      '<div class="word-stage" data-form-task-type="context">' +
      '<div class="word-meta"><span class="topic-badge">' +
      esc(word.topic) +
      '</span><span class="exercise-type-badge">' +
      (exercise.baseVisible ? '语境填空' : '原形判断') +
      '</span><span class="pos-badge">' +
      (exercise.baseVisible ? '提示词：' + esc(word.word) : '词义提示：' + esc(word.zh)) +
      '</span></div>' +
      '<div class="pos-question">' +
      '<p class="question-lead">第一步：空格需要哪一种词性？</p>' +
      '<blockquote>' +
      formSentenceHtml(exercise.sentence) +
      '</blockquote>' +
      '<div class="pos-options">' +
      Object.keys(POS_LABELS)
        .map(function (pos) {
          var className = 'pill-button';
          if (task.selectedPos === pos) {
            className += pos === exercise.need ? ' is-selected' : ' is-wrong';
          }
          return (
            '<button class="' +
            className +
            '" type="button" data-action="choose-pos" data-pos="' +
            pos +
            '"' +
            (task.posPassed || task.completed ? ' disabled' : '') +
            '>' +
            POS_LABELS[pos] +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</div>' +
      '<div class="feedback' +
      (task.posFeedbackClass ? ' ' + task.posFeedbackClass : '') +
      '" id="posFeedback" aria-live="polite">' +
      esc(task.posFeedback || '') +
      '</div>' +
      '<div class="form-answer-stage" id="formAnswerStage" ' +
      (task.posPassed ? '' : 'hidden') +
      '>' +
      '<form data-skill-form="forms">' +
      '<label for="formInput">第二步：写出正确词形</label>' +
      '<input class="answer-input" id="formInput" name="answer" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="输入正确形式" ' +
      (task.completed ? 'disabled' : '') +
      ' value="' +
      esc(task.answerValue || '') +
      '" />' +
      '<div class="input-actions">' +
      formHintButton(task) +
      '<button class="primary-button" type="submit"' +
      (task.completed ? ' disabled' : '') +
      '>检查词形</button>' +
      '</div>' +
      '</form>' +
      renderFormFeedback(task) +
      '</div>' +
      renderCompletedFamily(word, task) +
      '</div>'
    );
  }

  function renderDirectFormsTask(word, exercise, task) {
    return (
      '<div class="word-stage" data-form-task-type="' +
      exercise.type +
      '">' +
      '<div class="word-meta"><span class="topic-badge">' +
      esc(word.topic) +
      '</span><span class="exercise-type-badge">' +
      (exercise.type === 'inflection' ? '拼写规则' : '直接变形') +
      '</span></div>' +
      '<p class="question-lead">不看词族，按指定含义和词性直接写出新形式。</p>' +
      '<div class="direct-form-prompt">' +
      '<span class="direct-seed"><small>提示词</small><strong>' +
      esc(exercise.base) +
      '</strong></span>' +
      '<span class="direct-arrow" aria-hidden="true">→</span>' +
      '<span class="direct-target"><small>目标</small><strong>' +
      esc(exercise.targetLabel) +
      '</strong><span>' +
      esc(exercise.gloss) +
      '</span></span>' +
      '</div>' +
      '<form class="answer-form form-direct-answer" data-skill-form="forms">' +
      '<label class="eyebrow" for="formInput">WRITE THE NEW FORM</label>' +
      '<input class="answer-input" id="formInput" name="answer" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="输入变形后的完整单词" ' +
      (task.completed ? 'disabled' : '') +
      ' value="' +
      esc(task.answerValue || '') +
      '" />' +
      '<div class="input-actions">' +
      formHintButton(task) +
      '<button class="primary-button" type="submit"' +
      (task.completed ? ' disabled' : '') +
      '>检查词形</button>' +
      '</div>' +
      '</form>' +
      renderFormFeedback(task) +
      renderCompletedFamily(word, task) +
      '</div>'
    );
  }

  function renderFamilyFormsTask(word, exercise, task) {
    var values = task.familyValues || {};
    var status = task.familyStatus || {};
    var answerSlotCount = exercise.slots.filter(function (slot) {
      return !slot.given;
    }).length;
    return (
      '<div class="word-stage" data-form-task-type="family">' +
      '<div class="word-meta"><span class="topic-badge">' +
      esc(word.topic) +
      '</span><span class="exercise-type-badge">词族四格</span></div>' +
      '<p class="question-lead">已给出名词 <strong>' +
      esc(exercise.base) +
      '</strong>，请补全动词、形容词和副词。</p>' +
      '<form class="family-form" data-skill-form="forms">' +
      '<div class="family-form-grid">' +
      exercise.slots
        .map(function (slot) {
          var fieldClass = 'family-form-field';
          if (slot.given) fieldClass += ' is-given';
          if (status[slot.key] === true) fieldClass += ' is-correct';
          if (status[slot.key] === false) fieldClass += ' is-wrong';
          if (slot.given) {
            return (
              '<div class="' +
              fieldClass +
              '">' +
              '<span><strong>' +
              esc(slot.label) +
              '</strong><small>' +
              esc(slot.gloss) +
              '</small></span>' +
              '<div class="given-form"><strong>' +
              esc(slot.answer) +
              '</strong><small>已给形式</small></div>' +
              '</div>'
            );
          }
          return (
            '<label class="' +
            fieldClass +
            '" for="family-' +
            esc(slot.key) +
            '">' +
            '<span><strong>' +
            esc(slot.label) +
            '</strong><small>' +
            esc(slot.gloss) +
            '</small></span>' +
            '<input id="family-' +
            esc(slot.key) +
            '" name="' +
            esc(slot.key) +
            '" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="写出' +
            esc(slot.label) +
            '" value="' +
            esc(values[slot.key] || '') +
            '"' +
            (task.completed ? ' disabled' : status[slot.key] === true ? ' readonly' : '') +
            ' />' +
            '</label>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="input-actions">' +
      formHintButton(task) +
      '<button class="primary-button" type="submit"' +
      (task.completed ? ' disabled' : '') +
      '>检查' +
      answerSlotCount +
      '格</button>' +
      '</div>' +
      '</form>' +
      renderFormFeedback(task) +
      renderCompletedFamily(word, task) +
      '</div>'
    );
  }

  function renderFormFeedback(task) {
    return (
      '<div class="feedback' +
      (task.formFeedbackClass ? ' ' + task.formFeedbackClass : '') +
      '" id="formFeedback" aria-live="polite">' +
      (task.formFeedbackHtml || '') +
      '</div>'
    );
  }

  function formHintButton(task) {
    var labels = ['给我提示（不显示答案）', '再降低一点难度', '给我乱序字母', '提示已到最细'];
    var level = Math.min(3, task.formAttempts || 0);
    return (
      '<button class="secondary-button" type="button" data-action="reveal-form"' +
      (task.completed || level >= 3 ? ' disabled' : '') +
      '>' +
      labels[level] +
      '</button>' +
      (level >= 3 && !task.completed
        ? '<button class="secondary-button" type="button" data-action="skip-form">暂时跳过</button>'
        : '')
    );
  }

  function renderCompletedFamily(word, task) {
    if (!task.completed) return '';
    return (
      '<div class="reveal-card form-family-review">' +
      '<strong>答对后复盘</strong><span>完整词族只在完成后出现。</span>' +
      '<div class="family-strip">' +
      familyHtml(word) +
      '</div>' +
      (task.formExercise && task.formExercise.type === 'family'
        ? '<div class="card-actions"><button class="primary-button" type="button" data-action="advance-form">读完了，下一题 →</button></div>'
        : '') +
      '</div>'
    );
  }

  function getFormExercise(word) {
    var task = session.taskState;
    if (task.formExercise) return task.formExercise;
    if (word.formPractice) {
      task.formExercise = word.formPractice;
      return task.formExercise;
    }

    var requestedMode = word.practiceMode;
    if (!requestedMode && session.type === 'daily') {
      requestedMode = session.wordIndex % 2 === 1 ? 'direct' : 'context';
    }
    if (requestedMode === 'direct') {
      var directExercise = makeDirectFormExercise(word);
      if (directExercise) {
        task.formExercise = directExercise;
        return task.formExercise;
      }
    }

    task.formExercise = {
      type: 'context',
      sentence: word.form.sentence,
      answer: word.form.answer,
      need: word.form.need,
      explanation: word.form.explanation,
      baseVisible: normaliseAnswer(word.form.answer) !== normaliseAnswer(word.word),
    };
    return task.formExercise;
  }

  function makeDirectFormExercise(word) {
    var configured = DIRECT_FORM_DRILLS[word.id];
    if (!configured) return null;
    return Object.assign({}, configured, {
      explanation:
        configured.base + ' 变为 ' + configured.answer + '，表示“' + configured.gloss + '”。',
    });
  }

  function renderSentenceTask(word) {
    var task = session.taskState;
    if (!Array.isArray(task.chunkOrder)) {
      task.chunkOrder = shuffledIndices(word.chunks.length, word.id);
      task.selectedChunks = [];
      task.chunkAttempts = 0;
    }
    var selected = task.selectedChunks || [];
    var remaining = task.chunkOrder.filter(function (index) {
      return selected.indexOf(index) < 0;
    });
    return (
      '<div class="sentence-steps">' +
      '<div class="word-meta"><span class="topic-badge">' +
      esc(word.topic) +
      '</span><span class="pos-badge">' +
      esc(word.word) +
      ' · ' +
      esc(word.pos) +
      '</span><span class="source-badge">' +
      esc(word.zh) +
      '</span></div>' +
      '<section class="sentence-step">' +
      '<div class="sentence-step-header"><span class="step-number">1</span><div><h3>搭出正确句子骨架</h3><p>按顺序点击词块；已选词块可点回。</p></div></div>' +
      '<div class="chunk-pool" aria-label="待选词块">' +
      remaining
        .map(function (index) {
          return chunkButton(word.chunks[index], 'chunk-select', index);
        })
        .join('') +
      '</div>' +
      '<div class="chunk-answer" aria-label="已选词块">' +
      (selected.length
        ? selected
            .map(function (index, position) {
              return chunkButton(word.chunks[index], 'chunk-remove', position);
            })
            .join('')
        : '<span class="fine-print">答案会出现在这里</span>') +
      '</div>' +
      '<div class="sentence-toolbar">' +
      '<button class="secondary-button" type="button" data-action="chunk-reset">重排</button>' +
      '<button class="secondary-button" type="button" data-action="chunk-reveal">显示骨架</button>' +
      '<button class="primary-button" type="button" data-action="chunk-check">检查顺序</button>' +
      '</div>' +
      '<div class="feedback' +
      (task.chunkFeedbackClass ? ' ' + task.chunkFeedbackClass : '') +
      '" id="chunkFeedback">' +
      esc(task.chunkFeedback || '') +
      '</div>' +
      '</section>' +
      '<section class="sentence-step">' +
      '<div class="sentence-step-header"><span class="step-number">2</span><div><h3>按中文受控仿写</h3><p>必须使用目标词或本卡中的一个词形。</p></div></div>' +
      '<p class="model-sentence">' +
      esc(word.exampleCn) +
      '</p>' +
      '<form data-skill-form="sentence">' +
      '<label class="eyebrow" for="sentenceInput">YOUR SENTENCE</label>' +
      '<textarea class="sentence-input" id="sentenceInput" name="sentence" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="先自己写完整句子，再检查……"' +
      (task.chunksCorrect ? '' : ' disabled') +
      '>' +
      esc(task.writing || '') +
      '</textarea>' +
      '<div class="sentence-toolbar">' +
      '<button class="primary-button" type="submit"' +
      (task.chunksCorrect ? '' : ' disabled') +
      '>检查并对照</button>' +
      '</div>' +
      '</form>' +
      '<ul class="checklist" id="sentenceChecklist">' +
      (task.checks ? checklistHtml(task.checks) : defaultChecklistHtml()) +
      '</ul>' +
      '<div class="model-sentence" id="modelSentence" ' +
      (task.evaluated ? '' : 'hidden') +
      '><strong>参考范句</strong><br>' +
      esc(joinChunks(word.chunks)) +
      '<br><small>' +
      esc(word.tip) +
      '</small></div>' +
      '<div class="feedback" id="sentenceFeedback">' +
      esc(task.sentenceFeedback || '') +
      '</div>' +
      '<div class="card-actions" id="sentenceFinishActions" ' +
      (task.evaluated ? '' : 'hidden') +
      '>' +
      '<button class="secondary-button" type="button" data-action="finish-sentence" data-correct="false">仍需老师帮助</button>' +
      '<button class="primary-button" type="button" data-action="finish-sentence" data-correct="true">已对照并修改 →</button>' +
      '</div>' +
      '</section>' +
      '</div>'
    );
  }

  function chunkButton(text, action, index) {
    return (
      '<button class="chunk-button" type="button" data-action="' +
      action +
      '" data-index="' +
      index +
      '">' +
      esc(text) +
      '</button>'
    );
  }

  function defaultChecklistHtml() {
    return ['包含目标词或其正确词形', '首字母大写', '句末有标点', '至少 5 个单词']
      .map(function (label) {
        return '<li><span class="check-icon">·</span><span>' + label + '</span></li>';
      })
      .join('');
  }

  function checklistHtml(checks) {
    return checks
      .map(function (check) {
        return (
          '<li class="' +
          (check.pass ? 'pass' : 'fail') +
          '"><span class="check-icon">' +
          (check.pass ? '✓' : '!') +
          '</span><span>' +
          esc(check.label) +
          '</span></li>'
        );
      })
      .join('');
  }

  function renderSessionComplete() {
    cleanupMedia();
    if (!session) {
      renderToday();
      return;
    }
    var stats = session.stats;
    setActiveNav('today');
    main.innerHTML =
      '<section class="page-heading"><div><p class="eyebrow">SESSION COMPLETE</p><h1>本轮训练完成</h1><p>答错并完成重写的项目已进入错题队列；每项能力独立安排下次复习。</p></div></section>' +
      '<article class="panel training-panel">' +
      '<div class="word-stage"><span class="topic-badge">训练小结</span><h2 style="font-size:42px">准确比刷量更重要</h2>' +
      '<div class="metric-grid" style="max-width:680px;margin:26px auto">' +
      SKILLS.map(function (skill) {
        var skillStats = stats[skill] || { attempts: 0, correct: 0 };
        var score = skillStats.attempts
          ? Math.round((skillStats.correct / skillStats.attempts) * 100)
          : 0;
        return metric(score + '%', SKILL_SHORT[skill]);
      }).join('') +
      '</div>' +
      '<div class="card-actions"><button class="secondary-button" type="button" data-action="go-progress">查看错题与进度</button><button class="primary-button" type="button" data-action="go-today">返回今日 →</button></div>' +
      '</div></article>';
    session = null;
  }

  function renderProgress() {
    currentView = 'progress';
    setActiveNav('progress');
    var summary = progressSummary();
    var rows = WORDS.slice()
      .sort(function (a, b) {
        var attemptedDifference = Number(hasAnyAttempt(b.id)) - Number(hasAnyAttempt(a.id));
        if (attemptedDifference) return attemptedDifference;
        return overallWordScore(a.id) - overallWordScore(b.id);
      })
      .map(wordProgressRow)
      .join('');
    var mistakes = state.history
      .filter(function (item) {
        return !item.correct;
      })
      .slice(-18)
      .reverse();
    var journal = state.journal.slice(-12).reverse();

    main.innerHTML =
      '<section class="page-heading"><div><p class="eyebrow">LOCAL PROGRESS</p><h1>错题与进度</h1><p>四项能力分别记录。自由造句保存的是学习草稿，不代表已经通过教师语法审核。</p></div></section>' +
      '<section class="progress-layout">' +
      '<article class="panel progress-panel">' +
      '<h2>50 词能力表</h2>' +
      '<div class="metric-grid">' +
      metric(summary.started, '已开始') +
      metric(summary.stable, '稳定掌握') +
      metric(summary.mistakes, '近期错项') +
      '</div>' +
      '<div class="word-table-wrap"><table class="word-table"><thead><tr><th>词汇</th><th>跟读</th><th>拼写</th><th>词形</th><th>句用</th><th>下次复习</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      '</article>' +
      '<div>' +
      '<article class="panel progress-panel"><h3>近期错项</h3>' +
      (mistakes.length
        ? '<ul class="mistake-list">' +
          mistakes
            .map(function (item) {
              return (
                '<li><strong>' +
                esc(item.word) +
                ' · ' +
                esc(SKILL_LABELS[item.skill] || item.skill) +
                '</strong><span>' +
                esc(item.detail) +
                ' · ' +
                formatRelativeDate(item.at) +
                '</span></li>'
              );
            })
            .join('') +
          '</ul>'
        : '<div class="empty-state">完成一次练习后，错项会出现在这里。</div>') +
      '</article>' +
      '<article class="panel progress-panel" style="margin-top:18px"><h3>造句草稿</h3>' +
      (journal.length
        ? '<ul class="journal-list">' +
          journal
            .map(function (item) {
              return (
                '<li><strong>' +
                esc(item.word) +
                '</strong><span>' +
                esc(item.text) +
                '</span></li>'
              );
            })
            .join('') +
          '</ul>'
        : '<div class="empty-state">句子工坊中的草稿会保存在本机。</div>') +
      '</article>' +
      '<article class="panel progress-panel" style="margin-top:18px"><h3>数据备份</h3><p class="fine-print">换设备或清理浏览器数据前，请先导出 JSON。</p>' +
      '<div class="data-actions"><button class="secondary-button" type="button" data-action="export-data">导出进度</button><label class="import-label">导入进度<input type="file" accept="application/json" data-action="import-data"></label><button class="danger-button" type="button" data-action="reset-data">清空本机进度</button></div>' +
      '</article>' +
      '</div>' +
      '</section>';
  }

  function wordProgressRow(word) {
    var scores = SKILLS.map(function (skill) {
      var skillState = peekSkillState(word.id, skill);
      var score = skillState.attempts
        ? Math.round((skillState.correct / skillState.attempts) * 100)
        : null;
      var className =
        score === null ? 'score-chip' : score >= 80 ? 'score-chip good' : 'score-chip weak';
      return (
        '<td><span class="' +
        className +
        '">' +
        (score === null ? '—' : score + '%') +
        '</span></td>'
      );
    }).join('');
    return (
      '<tr><td>' +
      esc(word.word) +
      '</td>' +
      scores +
      '<td>' +
      esc(nextDueLabel(word.id)) +
      '</td></tr>'
    );
  }

  function handleMainClick(event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.dataset.action;

    if (action === 'start-daily') return startDailySession();
    if (action === 'start-weak') return startWeakSession();
    if (action === 'start-skill') return startSkillSession(button.dataset.skill);
    if (action === 'go-today') return navigate('today');
    if (action === 'go-progress') return navigate('progress');
    if (action === 'leave-session') return navigate('today');
    if (action === 'reveal-word') return revealWord();
    if (action === 'play-word') return playWordFromButton(button);
    if (action === 'play-example') return playExample(button);
    if (action === 'record-toggle') return toggleRecording(button);
    if (action === 'play-recording') return playRecording(button);
    if (action === 'mark-sound') return markSound(button.dataset.correct === 'true');
    if (action === 'reveal-spell') return revealSpellHint();
    if (action === 'hide-spell-answer') return hideSpellAnswer();
    if (action === 'choose-pos') return choosePartOfSpeech(button.dataset.pos);
    if (action === 'reveal-form') return revealFormHint();
    if (action === 'skip-form') return skipFormExercise();
    if (action === 'advance-form') return advanceSession();
    if (action === 'chunk-select') return selectChunk(Number(button.dataset.index));
    if (action === 'chunk-remove') return removeChunk(Number(button.dataset.index));
    if (action === 'chunk-reset') return resetChunks();
    if (action === 'chunk-reveal') return revealChunks();
    if (action === 'chunk-check') return checkChunks();
    if (action === 'finish-sentence') return finishSentence(button.dataset.correct === 'true');
    if (action === 'export-data') return exportData();
    if (action === 'reset-data') return resetData();
  }

  function handleMainSubmit(event) {
    var form = event.target.closest('[data-skill-form]');
    if (!form) return;
    event.preventDefault();
    var skill = form.dataset.skillForm;
    if (skill === 'spell') checkSpelling(new FormData(form).get('answer'));
    if (skill === 'forms') checkFormAnswer(form);
    if (skill === 'sentence') evaluateSentence(new FormData(form).get('sentence'));
  }

  function handleMainChange(event) {
    var input = event.target;
    if (input.matches('input[data-action="import-data"]') && input.files && input.files[0]) {
      importData(input.files[0]);
    }
  }

  function revealWord() {
    var card = document.getElementById('wordReveal');
    if (card) {
      card.hidden = false;
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function markSound(correct) {
    if (!session) return;
    var word = currentWord();
    recordResult(
      word,
      'sound',
      correct,
      correct ? '跟读自评：重音与尾音清楚' : '跟读自评：仍需 A/B 对比',
    );
    advanceSession();
  }

  function checkSpelling(rawAnswer) {
    if (!session || currentSkill() !== 'spell') return;
    var word = currentWord();
    var answer = String(rawAnswer || '').trim();
    if (!answer) {
      setFeedback('spellFeedback', '先输入你听到的单词。', 'is-wrong');
      return;
    }
    var task = session.taskState;
    var accepted = [word.word].concat(word.spellAccept || []);
    var correct = accepted.some(function (candidate) {
      return normaliseAnswer(candidate) === normaliseAnswer(answer);
    });
    if (correct) {
      var firstTry = !task.hadError && !task.answerVisible && !task.retype;
      var variant = normaliseAnswer(answer) !== normaliseAnswer(word.word);
      recordResult(
        word,
        'spell',
        firstTry,
        firstTry
          ? '听写首次正确'
          : variant
            ? '接受变体拼写；建议记住规范展示形式'
            : '提示或看答案后完成重写',
      );
      setFeedback(
        'spellFeedback',
        variant
          ? '可以接受；IELTS 英式书写建议使用 <strong>' + esc(word.word) + '</strong>。'
          : firstTry
            ? '正确。声音和拼写已经连上了。'
            : '重写正确。本次仍记为错项，稍后会重新出现。',
        'is-correct',
        true,
      );
      disableForm('spellInput');
      scheduleAdvance();
      return;
    }

    task.hadError = true;
    task.attempts = (task.attempts || 0) + 1;
    showSpellingHint(answer);
  }

  function revealSpellHint() {
    if (!session || currentSkill() !== 'spell') return;
    var input = document.getElementById('spellInput');
    var answer = input ? input.value : '';
    var task = session.taskState;
    task.hadError = true;
    task.attempts = Math.min(3, (task.attempts || 0) + 1);
    showSpellingHint(answer);
  }

  function showSpellingHint(answer) {
    var word = currentWord();
    var task = session.taskState;
    var attempt = task.attempts || 1;
    if (attempt === 1) {
      var position = firstMismatchPosition(answer, word.word);
      var message =
        '还不对。第 ' +
        position +
        ' 个字符附近有误；你写了 ' +
        compactLength(answer) +
        ' 个字母，目标有 ' +
        compactLength(word.word) +
        ' 个。答案仍然隐藏。';
      setFeedback('spellFeedback', message + positionDiffHtml(answer, word.word), 'is-wrong', true);
    } else if (attempt === 2) {
      setFeedback(
        'spellFeedback',
        '再试一次。音节拼写提示：<strong>' + esc(maskedSyllables(word)) + '</strong>',
        'is-wrong',
        true,
      );
    } else {
      task.answerVisible = true;
      renderSession();
    }
  }

  function hideSpellAnswer() {
    if (!session) return;
    session.taskState.answerVisible = false;
    session.taskState.retype = true;
    renderSession();
    setFeedback('spellFeedback', '答案已遮住。现在不看提示，完整重写一次。', '');
  }

  function choosePartOfSpeech(pos) {
    if (!session || currentSkill() !== 'forms') return;
    var task = session.taskState;
    var exercise = getFormExercise(currentWord());
    if (exercise.type !== 'context' || task.completed) return;
    task.selectedPos = pos;
    if (pos === exercise.need) {
      task.posPassed = true;
      task.posFeedback = '判断正确：这里需要' + POS_LABELS[pos] + '。继续写出正确词形。';
      task.posFeedbackClass = 'is-correct';
    } else {
      task.hadError = true;
      task.posFeedback = '再看空格两边：这里不需要' + POS_LABELS[pos] + '。答案仍然隐藏。';
      task.posFeedbackClass = 'is-wrong';
    }
    renderSession();
    if (task.posPassed) {
      setTimeout(function () {
        var input = document.getElementById('formInput');
        if (input) input.focus({ preventScroll: true });
      }, 40);
    }
  }

  function checkFormAnswer(form) {
    if (!session || currentSkill() !== 'forms') return;
    var word = currentWord();
    var task = session.taskState;
    var exercise = getFormExercise(word);
    if (task.completed) return;
    if (exercise.type === 'family') {
      checkFamilyFormAnswer(form, word, exercise, task);
      return;
    }

    var answer = String(new FormData(form).get('answer') || '').trim();
    task.answerValue = answer;
    if (!answer) {
      setFeedback('formFeedback', '先写出一个词形。', 'is-wrong');
      return;
    }
    var correct = normaliseAnswer(answer) === normaliseAnswer(exercise.answer);
    if (correct) {
      completeFormExercise(word, exercise, task);
      return;
    }

    task.hadError = true;
    task.formAttempts = Math.min(3, (task.formAttempts || 0) + 1);
    showFormHint();
  }

  function checkFamilyFormAnswer(form, word, exercise, task) {
    var formData = new FormData(form);
    var values = {};
    var status = {};
    var missing = [];
    var incorrect = [];
    var answerSlots = exercise.slots.filter(function (slot) {
      return !slot.given;
    });

    answerSlots.forEach(function (slot) {
      var value = String(formData.get(slot.key) || '').trim();
      values[slot.key] = value;
      if (!value) {
        missing.push(slot.label);
        status[slot.key] = null;
      } else {
        status[slot.key] = normaliseAnswer(value) === normaliseAnswer(slot.answer);
        if (!status[slot.key]) incorrect.push(slot.label);
      }
    });
    task.familyValues = values;
    task.familyStatus = status;

    if (!missing.length && !incorrect.length) {
      completeFormExercise(word, exercise, task);
      return;
    }

    task.hadError = true;
    task.formAttempts = Math.min(3, (task.formAttempts || 0) + 1);
    task.formFeedbackClass = 'is-wrong';
    task.formFeedbackHtml =
      '已答对 ' +
      (answerSlots.length - missing.length - incorrect.length) +
      ' / ' +
      answerSlots.length +
      ' 格；' +
      (missing.length ? '还未填写：<strong>' + esc(missing.join('、')) + '</strong>。' : '') +
      (incorrect.length ? '需要修改：<strong>' + esc(incorrect.join('、')) + '</strong>。' : '') +
      formHintHtml(exercise, task);
    renderSession();
    focusFirstFamilyGap(exercise, status);
  }

  function completeFormExercise(word, exercise, task) {
    var firstTry = !task.hadError && !(task.formAttempts > 0);
    var typeLabels = {
      family: '四格词族',
      direct: '直接变形',
      inflection: '拼写规则',
      context: '语境填空',
    };
    recordResult(
      word,
      'forms',
      firstTry,
      firstTry
        ? typeLabels[exercise.type] + '首次正确'
        : typeLabels[exercise.type] + '在提示或纠错后完成',
    );
    task.completed = true;
    task.formFeedbackClass = 'is-correct';
    if (exercise.type === 'family') {
      task.familyStatus = {};
      exercise.slots.forEach(function (slot) {
        task.familyStatus[slot.key] = true;
      });
      task.formFeedbackHtml =
        (firstTry ? '三个变形全部正确。' : '三个变形已改对，本次仍进入复习。') +
        ' 现在按自己的速度读一遍完整四格词族，再手动进入下一题。';
    } else {
      task.answerValue = exercise.answer;
      task.formFeedbackHtml =
        (firstTry ? '正确：' : '已经改对，本次仍进入复习：') +
        '<strong>' +
        esc(exercise.answer) +
        '</strong>。' +
        esc(exercise.explanation || '');
    }
    renderSession();
    if (exercise.type !== 'family') scheduleAdvance(2200);
  }

  function revealFormHint() {
    if (!session || currentSkill() !== 'forms') return;
    var task = session.taskState;
    if (task.completed || (task.formAttempts || 0) >= 3) return;
    captureFormValues();
    task.hadError = true;
    task.formAttempts = Math.min(3, (task.formAttempts || 0) + 1);
    showFormHint();
  }

  function skipFormExercise() {
    if (!session || currentSkill() !== 'forms') return;
    var word = currentWord();
    recordResult(word, 'forms', false, '完成三层提示后暂时跳过；未显示答案');
    showToast('已记为待复习；下次词形专项会优先出现。');
    advanceSession();
  }

  function showFormHint() {
    var task = session.taskState;
    var exercise = getFormExercise(currentWord());
    task.formFeedbackClass = 'is-wrong';
    task.formFeedbackHtml = formHintHtml(exercise, task);
    renderSession();
    focusCurrentFormInput(exercise, task);
  }

  function captureFormValues() {
    var task = session.taskState;
    var exercise = getFormExercise(currentWord());
    var form = document.querySelector('[data-skill-form="forms"]');
    if (!form) return;
    var formData = new FormData(form);
    if (exercise.type === 'family') {
      task.familyValues = task.familyValues || {};
      exercise.slots.forEach(function (slot) {
        if (slot.given) return;
        task.familyValues[slot.key] = String(formData.get(slot.key) || '').trim();
      });
    } else {
      task.answerValue = String(formData.get('answer') || '').trim();
    }
  }

  function formHintHtml(exercise, task) {
    var attempt = task.formAttempts || 1;
    var targets =
      exercise.type === 'family'
        ? exercise.slots.filter(function (slot) {
            return !slot.given && (!task.familyStatus || task.familyStatus[slot.key] !== true);
          })
        : [
            {
              key: exercise.need || exercise.targetPos || 'target',
              label: exercise.type === 'context' ? POS_LABELS[exercise.need] : exercise.targetLabel,
              answer: exercise.answer,
              hint: exercise.ruleHint,
            },
          ];
    if (attempt === 1) {
      return (
        '<div class="form-hint"><strong>规则提示：</strong>' +
        targets
          .map(function (target) {
            return (
              '<span><b>' +
              esc(target.label) +
              '</b>：' +
              esc(morphologyRuleHint(target, exercise)) +
              '</span>'
            );
          })
          .join('') +
        '<small>答案仍然隐藏。</small></div>'
      );
    }
    if (attempt === 2) {
      return (
        '<div class="form-hint"><strong>词形轮廓：</strong>' +
        targets
          .map(function (target) {
            return (
              '<span><b>' +
              esc(target.label) +
              '</b>：<code>' +
              esc(edgeHint(target.answer)) +
              '</code>（' +
              compactLength(target.answer) +
              ' 个字母）</span>'
            );
          })
          .join('') +
        '<small>只给首尾和长度，不显示完整答案。</small></div>'
      );
    }
    return (
      '<div class="form-hint"><strong>乱序字母：</strong>' +
      targets
        .map(function (target) {
          return (
            '<span><b>' +
            esc(target.label) +
            '</b>：' +
            scrambledLettersHtml(target.answer, currentWord().id + '-' + target.key) +
            '</span>'
          );
        })
        .join('') +
      '<small>把字母重新排列后，仍要由你完整输入；系统不会自动填答案。</small></div>'
    );
  }

  function morphologyRuleHint(target, exercise) {
    if (target.hint) return target.hint;
    var label = String(target.label || '');
    if (exercise.type === 'inflection') {
      if (/复数/.test(label)) return '检查 -s / -es，以及 y、ch、sh 等结尾的变化。';
      if (/-ing/.test(label)) return '检查词尾 e、辅音双写，以及 y 是否保留。';
      if (/过去/.test(label)) return '检查 -ed、辅音双写，或不规则变化。';
      if (/比较/.test(label)) return '检查 -er，以及词尾 y 或辅音双写。';
    }
    if (/副词/.test(label) || target.key === 'adv.') {
      return '通常从形容词出发，检查 -ly 以及词尾 y / le 的拼写变化。';
    }
    if (/形容词/.test(label) || target.key === 'adj.') {
      return '回忆 -al、-ous、-ive、-ful、-ed / -ing 等常见词尾。';
    }
    if (/动词/.test(label) || target.key === 'v.') {
      return '回忆原形，或检查 -ify、-ise / -ize、-en 等常见动词词尾。';
    }
    return '回忆 -tion、-ment、-ness、-ity、-ist 等常见名词词尾，并检查单复数。';
  }

  function scrambledLettersHtml(answer, seedText) {
    var letters = String(answer || '')
      .replace(/[^A-Za-z]/g, '')
      .split('');
    var order = shuffledIndices(letters.length, seedText);
    return (
      '<span class="letter-tiles" aria-label="乱序字母">' +
      order
        .map(function (index) {
          return '<i>' + esc(letters[index]) + '</i>';
        })
        .join('') +
      '</span>'
    );
  }

  function focusFirstFamilyGap(exercise, status) {
    var target = exercise.slots.find(function (slot) {
      return !slot.given && status[slot.key] !== true;
    });
    if (!target) return;
    setTimeout(function () {
      var input = document.getElementById('family-' + target.key);
      if (input) input.focus({ preventScroll: true });
    }, 40);
  }

  function focusCurrentFormInput(exercise, task) {
    if (exercise.type === 'family') {
      focusFirstFamilyGap(exercise, task.familyStatus || {});
      return;
    }
    setTimeout(function () {
      var input = document.getElementById('formInput');
      if (input) input.focus({ preventScroll: true });
    }, 40);
  }

  function selectChunk(index) {
    if (!session || currentSkill() !== 'sentence') return;
    var selected = session.taskState.selectedChunks;
    if (selected.indexOf(index) < 0) selected.push(index);
    renderSession();
  }

  function removeChunk(position) {
    if (!session || currentSkill() !== 'sentence') return;
    session.taskState.selectedChunks.splice(position, 1);
    session.taskState.chunksCorrect = false;
    renderSession();
  }

  function resetChunks() {
    if (!session || currentSkill() !== 'sentence') return;
    session.taskState.selectedChunks = [];
    session.taskState.chunksCorrect = false;
    session.taskState.chunkFeedback = '';
    session.taskState.chunkFeedbackClass = '';
    renderSession();
  }

  function revealChunks() {
    if (!session || currentSkill() !== 'sentence') return;
    var word = currentWord();
    session.taskState.selectedChunks = word.chunks.map(function (_, index) {
      return index;
    });
    session.taskState.chunksCorrect = true;
    session.taskState.hadError = true;
    session.taskState.chunkFeedback = '已显示正确骨架。请读一遍，再完成下面的仿写。';
    session.taskState.chunkFeedbackClass = 'is-wrong';
    renderSession();
  }

  function checkChunks() {
    if (!session || currentSkill() !== 'sentence') return;
    var word = currentWord();
    var task = session.taskState;
    var expected = word.chunks.map(function (_, index) {
      return index;
    });
    var selected = task.selectedChunks || [];
    var correct =
      selected.length === expected.length &&
      selected.every(function (index, position) {
        return index === expected[position];
      });
    task.chunkAttempts = (task.chunkAttempts || 0) + 1;
    if (correct) {
      task.chunksCorrect = true;
      task.chunkFeedback = '顺序正确。现在不要照抄英文，按中文自己写一遍。';
      task.chunkFeedbackClass = 'is-correct';
    } else {
      task.hadError = true;
      var firstWrong = selected.findIndex(function (index, position) {
        return index !== expected[position];
      });
      task.chunkFeedback =
        selected.length < expected.length
          ? '还有词块没有使用。'
          : '第 ' + (Math.max(0, firstWrong) + 1) + ' 个词块附近顺序不对。';
      task.chunkFeedbackClass = 'is-wrong';
    }
    renderSession();
  }

  function evaluateSentence(rawSentence) {
    if (!session || currentSkill() !== 'sentence') return;
    var word = currentWord();
    var text = String(rawSentence || '').trim();
    if (!text) {
      setFeedback('sentenceFeedback', '先写一个完整句子。', 'is-wrong');
      return;
    }
    var checks = sentenceChecks(word, text);
    var allPass = checks.every(function (check) {
      return check.pass;
    });
    var task = session.taskState;
    task.writing = text;
    task.checks = checks;
    task.mechanicsPass = allPass;
    task.evaluated = true;
    task.sentenceFeedback = allPass
      ? '机械检查通过。请对照参考范句和本词提醒，再修改一次；这不等于完整语法评分。'
      : '先修正红色项目，再对照参考范句。静态页面不会宣称你的语法已经完全正确。';

    document.getElementById('sentenceChecklist').innerHTML = checklistHtml(checks);
    document.getElementById('modelSentence').hidden = false;
    document.getElementById('sentenceFinishActions').hidden = false;
    setFeedback('sentenceFeedback', task.sentenceFeedback, allPass ? 'is-correct' : 'is-wrong');
  }

  function finishSentence(selfRatedCorrect) {
    if (!session || currentSkill() !== 'sentence') return;
    var word = currentWord();
    var task = session.taskState;
    var textarea = document.getElementById('sentenceInput');
    var text = String((textarea && textarea.value) || task.writing || '').trim();
    if (!task.evaluated || !text) {
      setFeedback('sentenceFeedback', '请先点击“检查并对照”。', 'is-wrong');
      return;
    }
    var correct = Boolean(selfRatedCorrect && task.mechanicsPass && !task.hadError);
    state.journal.push({
      wordId: word.id,
      word: word.word,
      text: text,
      reviewed: Boolean(selfRatedCorrect),
      at: Date.now(),
    });
    state.journal = state.journal.slice(-120);
    recordResult(
      word,
      'sentence',
      correct,
      selfRatedCorrect
        ? correct
          ? '词块与仿写首次完成'
          : '对照范句后完成修改'
        : '需要教师进一步帮助',
    );
    saveState();
    advanceSession();
  }

  function sentenceChecks(word, text) {
    var trimmed = text.trim();
    var words = trimmed.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || [];
    return [
      {
        label: '包含目标词或其正确词形',
        pass: containsTargetForm(word, trimmed),
      },
      {
        label: '首字母大写',
        pass: /^[A-Z]/.test(trimmed),
      },
      {
        label: '句末有标点',
        pass: /[.!?]$/.test(trimmed),
      },
      {
        label: '至少 5 个英文单词',
        pass: words.length >= 5,
      },
    ];
  }

  function containsTargetForm(word, sentence) {
    var candidates = [word.word]
      .concat(
        word.family.map(function (familyItem) {
          return familyItem[0];
        }),
      )
      .join(' ')
      .toLowerCase()
      .split(/[^a-z-]+/)
      .filter(function (token) {
        return token.length > 1 && ['the', 'base', 'past', 'singular', 'plural'].indexOf(token) < 0;
      });
    var normalisedSentence = ' ' + sentence.toLowerCase().replace(/[’]/g, "'") + ' ';
    return candidates.some(function (candidate) {
      var escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var direct = new RegExp('\\b' + escaped + '\\b', 'i').test(normalisedSentence);
      if (direct) return true;
      if (candidate.indexOf('-') >= 0) {
        return normalisedSentence.replace(/-/g, '').indexOf(candidate.replace(/-/g, '')) >= 0;
      }
      return false;
    });
  }

  function advanceSession() {
    if (!session) return;
    cleanupMedia();
    if (session.type === 'daily') {
      session.stageIndex += 1;
      if (session.stageIndex >= session.stages.length) {
        session.stageIndex = 0;
        session.wordIndex += 1;
      }
    } else {
      session.wordIndex += 1;
    }
    session.taskState = {};
    renderSession();
    scrollToTop();
  }

  function scheduleAdvance(delay) {
    var token = session && session.token;
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(
      function () {
        if (session && session.token === token) advanceSession();
      },
      Number(delay) || 850,
    );
  }

  function currentWord() {
    return session.words[session.wordIndex];
  }

  function currentSkill() {
    return session.stages[session.stageIndex];
  }

  function buildDailyQueue() {
    var now = startOfToday();
    var dateKey = localDateKey();
    if (!state.daily || state.daily.date !== dateKey) {
      state.daily = { date: dateKey, newIds: [] };
    }
    var due = WORDS.filter(function (word) {
      return SKILLS.some(function (skill) {
        var skillState = peekSkillState(word.id, skill);
        return skillState.attempts > 0 && skillState.due <= now;
      });
    }).sort(function (a, b) {
      return nextDueTime(a.id) - nextDueTime(b.id);
    });

    if (!state.daily.newIds.length) {
      state.daily.newIds = seededWords(
        WORDS.filter(function (word) {
          return !hasAnyAttempt(word.id) && due.indexOf(word) < 0;
        }),
      )
        .slice(0, Number(state.settings.dailyNew) || 6)
        .map(function (word) {
          return word.id;
        });
      saveState();
    }

    var introducedButIncomplete = state.daily.newIds
      .map(function (id) {
        return WORDS.find(function (word) {
          return word.id === id;
        });
      })
      .filter(function (word) {
        return (
          word &&
          SKILLS.some(function (skill) {
            return peekSkillState(word.id, skill).attempts === 0;
          })
        );
      });
    var combined = uniqueWords(due.slice(0, 6).concat(introducedButIncomplete));
    return combined.slice(0, 10);
  }

  function buildSkillQueue(skill, limit) {
    var now = startOfToday();
    var due = WORDS.filter(function (word) {
      var skillState = peekSkillState(word.id, skill);
      return skillState.attempts > 0 && skillState.due <= now;
    }).sort(function (a, b) {
      return peekSkillState(a.id, skill).due - peekSkillState(b.id, skill).due;
    });
    var weak = WORDS.filter(function (word) {
      var skillState = peekSkillState(word.id, skill);
      return skillState.attempts > 0 && skillState.correct / skillState.attempts < 0.8;
    }).sort(function (a, b) {
      var aState = peekSkillState(a.id, skill);
      var bState = peekSkillState(b.id, skill);
      return aState.correct / aState.attempts - bState.correct / bState.attempts;
    });
    var unseen = seededWords(
      WORDS.filter(function (word) {
        return peekSkillState(word.id, skill).attempts === 0;
      }),
    );
    return uniqueWords(due.concat(weak, unseen)).slice(0, limit);
  }

  function buildFormsQueue(limit) {
    var foundationCount = Math.min(4, Math.max(2, Math.round(limit / 3)));
    var vocabularyCount = Math.max(1, limit - foundationCount);
    var rankedVocabulary = uniqueWords(
      buildSkillQueue('forms', WORDS.length).concat(seededWords(WORDS)),
    );
    var usedVocabulary = new Set();
    var vocabulary = [];

    for (var index = 0; index < vocabularyCount; index += 1) {
      var wantsDirect = index % 3 !== 0;
      var word = rankedVocabulary.find(function (candidate) {
        return (
          !usedVocabulary.has(candidate.id) &&
          (!wantsDirect || Boolean(DIRECT_FORM_DRILLS[candidate.id]))
        );
      });
      if (!word) {
        word = rankedVocabulary.find(function (candidate) {
          return !usedVocabulary.has(candidate.id);
        });
      }
      if (!word) break;
      usedVocabulary.add(word.id);
      vocabulary.push(
        Object.assign({}, word, {
          practiceMode: wantsDirect && DIRECT_FORM_DRILLS[word.id] ? 'direct' : 'context',
        }),
      );
    }

    var now = startOfToday();
    var foundations = FORM_FOUNDATIONS.map(function (word, originalIndex) {
      var skillState = peekSkillState(word.id, 'forms');
      var accuracy = skillState.attempts ? skillState.correct / skillState.attempts : -1;
      var bucket =
        skillState.attempts > 0 && (skillState.due <= now || accuracy < 0.8)
          ? 0
          : skillState.attempts === 0
            ? 1
            : 2;
      return {
        word: word,
        bucket: bucket,
        accuracy: accuracy,
        due: skillState.due || 0,
        originalIndex: originalIndex,
      };
    })
      .sort(function (a, b) {
        if (a.bucket !== b.bucket) return a.bucket - b.bucket;
        if (a.bucket === 0 && a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
        if (a.due !== b.due) return a.due - b.due;
        return a.originalIndex - b.originalIndex;
      })
      .slice(0, foundationCount)
      .map(function (item) {
        return item.word;
      });
    var queue = [];
    var foundationIndex = 0;

    if (foundations.length) {
      queue.push(foundations[foundationIndex]);
      foundationIndex += 1;
    }
    vocabulary.forEach(function (word, index) {
      queue.push(word);
      if (index % 2 === 1 && foundationIndex < foundations.length) {
        queue.push(foundations[foundationIndex]);
        foundationIndex += 1;
      }
    });
    while (foundationIndex < foundations.length) {
      queue.push(foundations[foundationIndex]);
      foundationIndex += 1;
    }
    return queue.slice(0, limit);
  }

  function progressSummary() {
    var started = WORDS.filter(function (word) {
      return hasAnyAttempt(word.id);
    }).length;
    var stable = WORDS.filter(function (word) {
      return SKILLS.every(function (skill) {
        return peekSkillState(word.id, skill).level >= 4;
      });
    }).length;
    var recentBoundary = Date.now() - 14 * 86400000;
    var mistakes = state.history.filter(function (item) {
      return !item.correct && item.at >= recentBoundary;
    }).length;
    var skills = {};
    SKILLS.forEach(function (skill) {
      var total = 0;
      var correct = 0;
      WORDS.forEach(function (word) {
        var skillState = peekSkillState(word.id, skill);
        total += skillState.attempts;
        correct += skillState.correct;
      });
      skills[skill] = total ? Math.round((correct / total) * 100) : 0;
    });
    return { started: started, stable: stable, mistakes: mistakes, skills: skills };
  }

  function countDueSkills() {
    var now = startOfToday();
    var count = 0;
    WORDS.forEach(function (word) {
      SKILLS.forEach(function (skill) {
        var skillState = peekSkillState(word.id, skill);
        if (skillState.attempts > 0 && skillState.due <= now) count += 1;
      });
    });
    return count;
  }

  function hasAnyAttempt(wordId) {
    return SKILLS.some(function (skill) {
      return peekSkillState(wordId, skill).attempts > 0;
    });
  }

  function overallWordScore(wordId) {
    var attempted = 0;
    var total = 0;
    SKILLS.forEach(function (skill) {
      var skillState = peekSkillState(wordId, skill);
      if (skillState.attempts > 0) {
        attempted += 1;
        total += skillState.correct / skillState.attempts;
      }
    });
    return attempted ? total / attempted : -1;
  }

  function nextDueTime(wordId) {
    var times = SKILLS.map(function (skill) {
      var skillState = peekSkillState(wordId, skill);
      return skillState.attempts ? skillState.due : Infinity;
    });
    return Math.min.apply(Math, times);
  }

  function nextDueLabel(wordId) {
    if (!hasAnyAttempt(wordId)) return '尚未开始';
    var due = nextDueTime(wordId);
    if (!Number.isFinite(due)) return '尚未排期';
    var today = startOfToday();
    var days = Math.round((due - today) / 86400000);
    if (days <= 0) return '今天';
    if (days === 1) return '明天';
    return days + ' 天后';
  }

  function startOfToday() {
    var date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function localDateKey() {
    var date = new Date();
    var year = String(date.getFullYear());
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function seededWords(words) {
    var seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    return words.slice().sort(function (a, b) {
      return seededHash(a.id, seed) - seededHash(b.id, seed);
    });
  }

  function seededHash(text, seed) {
    var hash = seed || 1;
    for (var i = 0; i < text.length; i += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(i), 2654435761);
    }
    return hash >>> 0;
  }

  function uniqueWords(words) {
    var seen = new Set();
    return words.filter(function (word) {
      if (seen.has(word.id)) return false;
      seen.add(word.id);
      return true;
    });
  }

  function playWordFromButton(button) {
    if (!session) return;
    session.taskState.played = true;
    var accent = button.dataset.accent || state.settings.accent;
    var rate = Number(button.dataset.rate) || 1;
    if (button.classList.contains('listen-orb')) {
      button.dataset.rate = '1';
    }
    playFixedAudio(currentWord(), accent, rate, button, 'word');
  }

  function playFixedAudio(word, accent, rate, button, kind) {
    stopAudio();
    markPlaying(button);
    var isSentence = kind === 'sentence';
    var suffix = isSentence ? '_sentence' : '';
    var text = isSentence ? joinChunks(word.chunks) : word.word;
    var audio = new Audio('./audio/' + accent + '/' + word.id + suffix + '.mp3');
    currentAudio = audio;
    audio.playbackRate = rate;
    audio.preload = 'auto';
    var fellBack = false;
    var fallback = function () {
      if (fellBack) return;
      fellBack = true;
      if (currentAudio === audio) currentAudio = null;
      speakText(text, accent, rate, button);
    };
    audio.addEventListener(
      'ended',
      function () {
        if (currentAudio === audio) currentAudio = null;
        clearPlaying();
      },
      { once: true },
    );
    audio.addEventListener('error', fallback, { once: true });
    audio.play().catch(fallback);
  }

  function playExample(button) {
    if (!session) return;
    var accent = button.dataset.accent || state.settings.accent;
    playFixedAudio(currentWord(), accent, 1, button, 'sentence');
  }

  function speakText(text, accent, rate, button) {
    if (!('speechSynthesis' in window)) {
      clearPlaying();
      showToast('当前浏览器无法播放语音，请检查网络或更换系统浏览器。');
      return;
    }
    stopAudio();
    markPlaying(button);
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = accent === 'us' ? 'en-US' : 'en-GB';
    utterance.rate = Math.max(0.55, Math.min(1.1, rate));
    var voices = speechSynthesis.getVoices();
    var preferred = voices.find(function (voice) {
      return voice.lang.toLowerCase().startsWith(utterance.lang.toLowerCase());
    });
    if (preferred) utterance.voice = preferred;
    utterance.onend = clearPlaying;
    utterance.onerror = clearPlaying;
    speechSynthesis.speak(utterance);
  }

  function markPlaying(button) {
    clearPlaying();
    playingButton = button;
    if (playingButton) playingButton.classList.add('is-playing');
  }

  function clearPlaying() {
    if (playingButton) playingButton.classList.remove('is-playing');
    playingButton = null;
  }

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    clearPlaying();
  }

  async function toggleRecording(button) {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      showToast('当前浏览器不支持本地录音；听音和其余训练仍可使用。');
      return;
    }
    try {
      revokeRecording();
      recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordChunks = [];
      recorder = new MediaRecorder(recordStream);
      recorder.addEventListener('dataavailable', function (event) {
        if (event.data.size) recordChunks.push(event.data);
      });
      recorder.addEventListener('stop', finishRecording, { once: true });
      recorder.start();
      button.textContent = '■ 停止录音';
      button.classList.add('recording-state');
      var status = document.getElementById('recordStatus');
      if (status) status.textContent = '正在录音… 最多 8 秒，只保留在当前页面。';
      clearTimeout(recordTimer);
      recordTimer = setTimeout(function () {
        if (recorder && recorder.state === 'recording') recorder.stop();
      }, 8000);
    } catch (error) {
      showToast('未获得麦克风权限。你仍可继续听音、拼写和词形训练。');
    }
  }

  function finishRecording() {
    clearTimeout(recordTimer);
    if (!session || currentSkill() !== 'sound') {
      if (recordStream) {
        recordStream.getTracks().forEach(function (track) {
          track.stop();
        });
        recordStream = null;
      }
      recordChunks = [];
      recorder = null;
      return;
    }
    var type = recorder && recorder.mimeType ? recorder.mimeType : 'audio/webm';
    var blob = new Blob(recordChunks, { type: type });
    recordUrl = URL.createObjectURL(blob);
    if (recordStream) {
      recordStream.getTracks().forEach(function (track) {
        track.stop();
      });
      recordStream = null;
    }
    var recordButton = document.querySelector('[data-action="record-toggle"]');
    var playButton = document.querySelector('[data-action="play-recording"]');
    if (recordButton) {
      recordButton.textContent = '● 重新录音';
      recordButton.classList.remove('recording-state');
    }
    if (playButton) playButton.disabled = false;
    var status = document.getElementById('recordStatus');
    if (status) status.textContent = '录音完成。请先播范音，再回放自己，检查重音和尾音。';
    recorder = null;
  }

  function playRecording(button) {
    if (!recordUrl) return;
    stopAudio();
    markPlaying(button);
    currentAudio = new Audio(recordUrl);
    currentAudio.addEventListener('ended', clearPlaying, { once: true });
    currentAudio.play().catch(function () {
      clearPlaying();
      showToast('录音回放失败，请重新录制。');
    });
  }

  function cleanupMedia() {
    stopAudio();
    clearTimeout(recordTimer);
    if (recorder && recorder.state === 'recording') recorder.stop();
    if (recordStream) {
      recordStream.getTracks().forEach(function (track) {
        track.stop();
      });
      recordStream = null;
    }
    recorder = null;
    revokeRecording();
  }

  function revokeRecording() {
    if (recordUrl) URL.revokeObjectURL(recordUrl);
    recordUrl = '';
  }

  function openSettings() {
    var form = document.getElementById('settingsForm');
    form.elements.accent.value = state.settings.accent;
    form.elements.dailyNew.value = String(state.settings.dailyNew);
    form.elements.slowFirst.checked = Boolean(state.settings.slowFirst);
    settingsDialog.showModal();
  }

  function saveSettings() {
    var form = document.getElementById('settingsForm');
    state.settings.accent = form.elements.accent.value === 'us' ? 'us' : 'uk';
    state.settings.dailyNew = Number(form.elements.dailyNew.value) || 6;
    state.settings.slowFirst = Boolean(form.elements.slowFirst.checked);
    saveState();
    settingsDialog.close();
    showToast('训练设置已保存。');
    if (currentView === 'today') renderToday();
  }

  function exportData() {
    var payload = {
      app: 'WordLab 50',
      version: 1,
      exportedAt: new Date().toISOString(),
      state: state,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'wordlab-50-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    showToast('进度文件已导出。');
  }

  async function importData(file) {
    try {
      var payload = JSON.parse(await file.text());
      if (!payload || payload.app !== 'WordLab 50' || !payload.state) {
        throw new Error('Invalid WordLab export');
      }
      var imported = payload.state;
      state = {
        version: 1,
        settings: Object.assign({}, defaultState().settings, imported.settings || {}),
        daily:
          imported.daily && typeof imported.daily === 'object'
            ? {
                date: String(imported.daily.date || ''),
                newIds: Array.isArray(imported.daily.newIds)
                  ? imported.daily.newIds.slice(0, 10)
                  : [],
              }
            : defaultState().daily,
        words: imported.words && typeof imported.words === 'object' ? imported.words : {},
        history: Array.isArray(imported.history) ? imported.history.slice(-240) : [],
        journal: Array.isArray(imported.journal) ? imported.journal.slice(-120) : [],
      };
      saveState();
      showToast('进度已导入。');
      renderProgress();
    } catch (error) {
      showToast('导入失败：请选择由 WordLab 50 导出的 JSON 文件。');
    }
  }

  function resetData() {
    if (!window.confirm('确定清空这台设备上的 WordLab 练习记录吗？此操作无法撤销。')) {
      return;
    }
    state = defaultState();
    localStorage.removeItem(STORAGE_KEY);
    showToast('本机练习记录已清空。');
    renderProgress();
  }

  function familyHtml(word) {
    return word.family
      .map(function (item) {
        return (
          '<span class="family-chip"><b>' +
          esc(item[0]) +
          '</b> · ' +
          esc(item[1]) +
          ' · ' +
          esc(item[2]) +
          '</span>'
        );
      })
      .join('');
  }

  function syllableHtml(word) {
    return word.syllables
      .map(function (syllable, index) {
        var text = esc(syllable.toLowerCase());
        return index === word.stress ? '<span class="stress">' + text + '</span>' : text;
      })
      .join(' · ');
  }

  function maskedSyllables(word) {
    return word.syllables
      .map(function (syllable) {
        var clean = syllable.toLowerCase().replace(/[^a-z]/g, '');
        if (clean.length <= 2) return clean.charAt(0) + '_';
        return clean.charAt(0) + '_'.repeat(clean.length - 2) + clean.charAt(clean.length - 1);
      })
      .join(' · ');
  }

  function joinChunks(chunks) {
    return chunks
      .join(' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formSentenceHtml(sentence) {
    return esc(sentence).replace('____', '<span class="blank">____</span>');
  }

  function letterCountText(word) {
    var letters = compactLength(word);
    return '（' + letters + ' 个字母' + (word.indexOf('-') >= 0 ? '，含连字符' : '') + '）';
  }

  function compactLength(value) {
    return String(value || '').replace(/[^A-Za-z]/g, '').length;
  }

  function normaliseAnswer(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/\s+/g, ' ');
  }

  function firstMismatchPosition(input, target) {
    var a = normaliseAnswer(input);
    var b = normaliseAnswer(target);
    var length = Math.max(a.length, b.length);
    for (var index = 0; index < length; index += 1) {
      if (a[index] !== b[index]) return index + 1;
    }
    return Math.max(1, length);
  }

  function positionDiffHtml(input, target) {
    var answer = normaliseAnswer(input);
    var expected = normaliseAnswer(target);
    if (!answer) return '';
    return (
      '<div class="letter-diff" aria-label="你的字母位置">' +
      answer
        .split('')
        .map(function (letter, index) {
          if (letter === ' ') return '';
          var ok = letter === expected[index];
          return '<span class="diff-letter ' + (ok ? 'ok' : 'bad') + '">' + esc(letter) + '</span>';
        })
        .join('') +
      '</div>'
    );
  }

  function edgeHint(answer) {
    var clean = String(answer || '');
    if (clean.length <= 2) return clean.charAt(0) + '_';
    return clean.charAt(0) + ' ' + '_ '.repeat(Math.max(1, clean.length - 2)) + clean.slice(-1);
  }

  function shuffledIndices(length, seedText) {
    var values = Array.from({ length: length }, function (_, index) {
      return index;
    });
    var seed = seededHash(seedText, 20260728);
    for (var index = values.length - 1; index > 0; index -= 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      var swap = seed % (index + 1);
      var temp = values[index];
      values[index] = values[swap];
      values[swap] = temp;
    }
    var alreadyOrdered = values.every(function (value, index) {
      return value === index;
    });
    if (alreadyOrdered && values.length > 1) values.push(values.shift());
    return values;
  }

  function setFeedback(id, message, className, allowHtml) {
    var element = document.getElementById(id);
    if (!element) return;
    element.className = 'feedback' + (className ? ' ' + className : '');
    if (allowHtml) {
      element.innerHTML = message;
    } else {
      element.textContent = message;
    }
  }

  function disableForm(inputId) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.disabled = true;
    var form = input.closest('form');
    if (form) {
      form.querySelectorAll('button').forEach(function (button) {
        button.disabled = true;
      });
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2800);
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function formatRelativeDate(timestamp) {
    var difference = Date.now() - Number(timestamp || 0);
    var days = Math.floor(difference / 86400000);
    if (days <= 0) return '今天';
    if (days === 1) return '昨天';
    return days + ' 天前';
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isLocalhost() {
    return ['localhost', '127.0.0.1', '[::1]'].indexOf(location.hostname) >= 0;
  }
})();
