(function () {
  'use strict';

  var WORDS = Array.isArray(window.IELTS_VOCABULARY) ? window.IELTS_VOCABULARY : [];
  var VISUAL_LAB =
    window.IELTS_VISUAL_LAB && typeof window.IELTS_VISUAL_LAB === 'object'
      ? window.IELTS_VISUAL_LAB
      : { posScene: null, groups: [], gameModes: [] };
  var STORAGE_KEY = 'els-ielts-wordlab-v1';
  var VISUAL_STORAGE_KEY = 'els-ielts-visual-lab-v1';
  var AUDIO_ASSET_VERSION = 'natural-20260728';
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
  var visualState = loadVisualState();
  var visualSection = 'pos';
  var visualRuntime = defaultVisualRuntime();
  var currentView = 'today';
  var session = null;
  var currentAudio = null;
  var playingButton = null;
  var playbackToken = 0;
  var playbackStatus = 'idle';
  var playbackDesired = 'idle';
  var playbackTimer = null;
  var skipLockedUntil = 0;
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
    validateVisualLab(ids);

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
    main.addEventListener('input', handleMainInput);
    main.addEventListener('error', handleVisualImageError, true);
    main.addEventListener('load', handleVisualImageLoad, true);

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

  function visualTaskIds() {
    var ids = [];
    if (VISUAL_LAB.posScene && VISUAL_LAB.posScene.id) ids.push(VISUAL_LAB.posScene.id);
    if (Array.isArray(VISUAL_LAB.groups)) {
      VISUAL_LAB.groups.forEach(function (task) {
        if (task && task.id) ids.push(task.id);
      });
    }
    if (Array.isArray(VISUAL_LAB.gameModes)) {
      VISUAL_LAB.gameModes.forEach(function (mode) {
        if (!mode || !Array.isArray(mode.tasks)) return;
        mode.tasks.forEach(function (task) {
          if (task && task.id) ids.push(task.id);
        });
      });
    }
    return ids;
  }

  function defaultVisualState() {
    return {
      version: 2,
      tasks: {},
      history: [],
    };
  }

  function defaultVisualRuntime() {
    return {
      posStep: 0,
      taskSteps: {},
      unlockedTasks: {},
      gameMode: 'guess',
      gameIndices: {},
      gameAnswered: {},
      gameReplay: {},
    };
  }

  function normaliseVisualState(saved) {
    var base = defaultVisualState();
    if (!saved || typeof saved !== 'object') return base;
    var allowedIds = new Set(visualTaskIds());
    var tasks = {};
    if (saved.tasks && typeof saved.tasks === 'object') {
      Object.keys(saved.tasks).forEach(function (taskId) {
        if (!allowedIds.has(taskId)) return;
        var task = saved.tasks[taskId] || {};
        tasks[taskId] = {
          attempts: Math.max(0, Number(task.attempts) || 0),
          correct: Math.max(0, Number(task.correct) || 0),
          mastered: Boolean(task.mastered),
          last: Math.max(0, Number(task.last) || 0),
        };
      });
    }
    var history = Array.isArray(saved.history)
      ? saved.history
          .filter(function (item) {
            return item && allowedIds.has(String(item.taskId || ''));
          })
          .slice(-240)
      : [];
    return {
      version: 2,
      tasks: tasks,
      history: history.slice(-240),
    };
  }

  function loadVisualState() {
    try {
      return normaliseVisualState(JSON.parse(localStorage.getItem(VISUAL_STORAGE_KEY) || 'null'));
    } catch (error) {
      console.warn('Could not read saved visual vocabulary progress.', error);
      return defaultVisualState();
    }
  }

  function saveVisualState() {
    try {
      localStorage.setItem(VISUAL_STORAGE_KEY, JSON.stringify(visualState));
    } catch (error) {
      showToast('浏览器未能保存图像练习进度，请稍后导出备份。');
    }
  }

  function getVisualTaskState(taskId) {
    if (!visualState.tasks[taskId]) {
      visualState.tasks[taskId] = {
        attempts: 0,
        correct: 0,
        mastered: false,
        last: 0,
      };
    }
    return visualState.tasks[taskId];
  }

  function recordVisualResult(taskId, correct, choice) {
    var taskState = getVisualTaskState(taskId);
    var now = Date.now();
    taskState.attempts += 1;
    if (correct) taskState.correct += 1;
    taskState.last = now;
    visualState.history.push({
      taskId: taskId,
      correct: Boolean(correct),
      choice: String(choice || ''),
      at: now,
    });
    visualState.history = visualState.history.slice(-240);
    saveVisualState();
  }

  function validateVisualLab(wordIds) {
    var ids = visualTaskIds();
    if (!VISUAL_LAB.posScene || !Array.isArray(VISUAL_LAB.groups)) {
      console.error('WordLab visual vocabulary data is unavailable.');
      return;
    }
    if (new Set(ids).size !== ids.length) {
      console.error('WordLab visual vocabulary data contains duplicate task IDs.');
    }
    VISUAL_LAB.groups.forEach(function (task) {
      var answersValid =
        Array.isArray(task.choices) &&
        Array.isArray(task.scenes) &&
        task.scenes.every(function (scene) {
          return task.choices.indexOf(scene.answer) >= 0;
        });
      if (
        !answersValid ||
        !wordIds.has(task.targetWordId) ||
        String(task.image || '').indexOf('./images/semantic-lab/') !== 0
      ) {
        console.error('Invalid visual vocabulary task:', task.id);
      }
    });
    (Array.isArray(VISUAL_LAB.gameModes) ? VISUAL_LAB.gameModes : []).forEach(function (mode) {
      if (!mode || !mode.id || !Array.isArray(mode.tasks) || mode.tasks.length === 0) {
        console.error('Invalid visual game mode:', mode && mode.id);
        return;
      }
      mode.tasks.forEach(function (task) {
        var validImage = !task.image || String(task.image).indexOf('./images/semantic-lab/') === 0;
        if (
          !task.id ||
          !wordIds.has(task.targetWordId) ||
          !Array.isArray(task.choices) ||
          task.choices.indexOf(task.answer) < 0 ||
          !validImage
        ) {
          console.error('Invalid visual word game:', task && task.id);
        }
      });
    });
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
    } else if (view === 'visual') {
      renderVisualLab();
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
      moduleCard(
        '02',
        '听写拼词',
        '盲听输入，支持暂停与变速重播；需要时获取不直接给答案的提示。',
        'spell',
      ) +
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
      viewModuleCard(
        '05',
        '图像词义实验室',
        '用手绘场景看懂名、动、形、副，再辨别近义词的细微差别和反义词。',
        'visual',
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

  function viewModuleCard(number, title, description, view) {
    return (
      '<button class="module-card visual-module-card" type="button" data-action="go-view" data-view="' +
      esc(view) +
      '">' +
      '<span>' +
      '<span class="module-number">' +
      esc(number) +
      '</span>' +
      '<h3>' +
      esc(title) +
      '</h3>' +
      '<p>' +
      esc(description) +
      '</p>' +
      '</span>' +
      '<small>看图辨词 →</small>' +
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

  function visualSummary() {
    var ids = visualTaskIds();
    var completed = ids.filter(function (taskId) {
      return Boolean(visualState.tasks[taskId] && visualState.tasks[taskId].mastered);
    }).length;
    var attempts = 0;
    var correct = 0;
    ids.forEach(function (taskId) {
      var task = visualState.tasks[taskId];
      if (!task) return;
      attempts += Number(task.attempts) || 0;
      correct += Number(task.correct) || 0;
    });
    return {
      total: ids.length,
      completed: completed,
      attempts: attempts,
      correct: correct,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    };
  }

  function renderVisualLab() {
    currentView = 'visual';
    setActiveNav('visual');
    if (!VISUAL_LAB.posScene || !Array.isArray(VISUAL_LAB.groups)) {
      main.innerHTML = '<div class="empty-state">图像词义课程载入失败，请刷新页面后重试。</div>';
      return;
    }
    var summary = visualSummary();
    main.innerHTML =
      '<section class="page-heading visual-page-heading">' +
      '<div>' +
      '<p class="eyebrow">VISUAL MEANING LAB</p>' +
      '<h1>图像词义实验室</h1>' +
      '<p>先看场景作判断，再读精确区别；图片帮助理解，但拼写和语境仍要自己完成。</p>' +
      '</div>' +
      '<span class="date-chip">手绘场景课</span>' +
      '</section>' +
      '<section class="visual-overview panel" aria-label="图像课程进度">' +
      '<div>' +
      '<p class="eyebrow">YOUR PROGRESS</p>' +
      '<strong data-visual-completed>' +
      summary.completed +
      ' / ' +
      summary.total +
      '</strong>' +
      '<span>组已完成</span>' +
      '</div>' +
      '<div class="visual-overview-accuracy"><strong data-visual-accuracy>' +
      summary.accuracy +
      '%</strong><span>本课程作答准确率</span></div>' +
      '<div class="visual-progress-track" aria-hidden="true"><span data-visual-progress style="--visual-progress:' +
      (summary.total ? Math.round((summary.completed / summary.total) * 100) : 0) +
      '%"></span></div>' +
      '</section>' +
      '<nav class="visual-tabs" aria-label="图像词义课程章节">' +
      visualTab('pos', '词性入门', '名 · 动 · 形 · 副') +
      visualTab('synonym', '近义辨析', '4 组') +
      visualTab('antonym', '反义对照', '4 组') +
      visualTab(
        'games',
        '词网游戏',
        (Array.isArray(VISUAL_LAB.gameModes) ? VISUAL_LAB.gameModes.length : 0) + ' 类',
      ) +
      '</nav>' +
      '<section id="visualContent" class="visual-content"></section>';
    renderVisualSection();
  }

  function visualTab(section, label, meta) {
    var active = visualSection === section;
    return (
      '<button class="visual-tab' +
      (active ? ' is-active' : '') +
      '" type="button" data-action="visual-section" data-section="' +
      section +
      '" aria-selected="' +
      String(active) +
      '"><span>' +
      esc(label) +
      '</span><small>' +
      esc(meta) +
      '</small></button>'
    );
  }

  function renderVisualSection() {
    var container = document.getElementById('visualContent');
    if (!container) return;
    document.querySelectorAll('.visual-tab').forEach(function (button) {
      var active = button.dataset.section === visualSection;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (visualSection === 'pos') {
      container.innerHTML = renderVisualPosLesson();
    } else if (visualSection === 'games') {
      container.innerHTML = renderVisualGames();
    } else {
      var tasks = VISUAL_LAB.groups.filter(function (task) {
        return task.relation === visualSection;
      });
      container.innerHTML =
        '<section class="visual-section-intro">' +
        '<div><p class="eyebrow">' +
        (visualSection === 'synonym' ? 'PRECISE WORD CHOICE' : 'MEANING CONTRAST') +
        '</p><h2>' +
        (visualSection === 'synonym' ? '选出本场景中更贴切的词' : '在同一维度上看清相反方向') +
        '</h2></div>' +
        '<p>' +
        (visualSection === 'synonym'
          ? '近义词常有重叠。题目要求“更精确”，不会把另一个词粗暴判成所有语境都错误。'
          : '反义关系也要看场景和词性；先抓住图中的共同维度，再判断方向。') +
        '</p></section>' +
        '<div class="visual-card-grid">' +
        tasks.map(renderVisualComparisonCard).join('') +
        '</div>';
    }
  }

  function renderVisualPosLesson() {
    var scene = VISUAL_LAB.posScene;
    var taskState = getVisualTaskState(scene.id);
    var retrying = Boolean(visualRuntime.unlockedTasks[scene.id]);
    var complete = taskState.mastered && !retrying;
    var step = Math.min(visualRuntime.posStep, scene.questions.length - 1);
    var question = scene.questions[step];
    return (
      '<article class="panel visual-pos-card" data-visual-task-id="' +
      esc(scene.id) +
      '" data-complete="' +
      String(complete) +
      '">' +
      '<div class="visual-pos-copy"><p class="eyebrow">PARTS OF SPEECH</p><h2>一张图看懂四种词性</h2>' +
      '<p>词性不是单词的中文意思，而是它在句子里承担的工作。先看图，再点击句中的词。</p></div>' +
      '<figure class="visual-figure">' +
      '<div class="visual-image-frame">' +
      '<img src="' +
      esc(scene.image) +
      '" data-src="' +
      esc(scene.image) +
      '" data-visual-image alt="' +
      esc(scene.alt) +
      '" width="' +
      scene.width +
      '" height="' +
      scene.height +
      '" loading="eager" decoding="async" fetchpriority="high">' +
      '<div class="visual-image-error" data-image-error hidden role="status">图片暂时没有载入。' +
      '<button type="button" data-action="visual-retry-image">重新加载图片</button></div>' +
      '</div>' +
      '<figcaption>观察：哪些词给人和物命名？哪个词说明动作？哪些词补充特征和方式？</figcaption>' +
      '</figure>' +
      '<div class="visual-sentence" aria-label="The sturdy bridge safely supports the hiker.">' +
      scene.sentence
        .map(function (token) {
          if (token.id === 'period') return '<span aria-hidden="true">.</span>';
          if (complete) {
            return (
              '<span class="visual-token' +
              (token.role ? ' role-' + token.role : '') +
              '">' +
              esc(token.text) +
              '</span>'
            );
          }
          return (
            '<button class="visual-token" type="button" data-action="visual-pos-token" data-token="' +
            esc(token.text) +
            '">' +
            esc(token.text) +
            '</button>'
          );
        })
        .join(' ') +
      '</div>' +
      (complete
        ? renderVisualPosComplete(scene)
        : '<section class="visual-question" aria-labelledby="visualPosPrompt">' +
          '<div class="visual-question-meta"><span>第 ' +
          (step + 1) +
          ' / ' +
          scene.questions.length +
          ' 步</span><strong>' +
          esc(question.label) +
          '</strong></div>' +
          '<h3 id="visualPosPrompt">' +
          esc(question.prompt) +
          '</h3>' +
          '<p id="visualPosFeedback" class="visual-feedback" role="status" aria-live="polite">先自己判断，答错不会直接显示答案。</p>' +
          '</section>') +
      '</article>'
    );
  }

  function renderVisualPosComplete(scene) {
    return (
      '<section class="visual-pos-result"><div class="visual-pos-role-grid">' +
      scene.questions
        .map(function (question) {
          return (
            '<article class="role-card role-' +
            question.role +
            '"><strong>' +
            esc(question.label) +
            '</strong><p>' +
            esc(question.explanation) +
            '</p></article>'
          );
        })
        .join('') +
      '</div><div class="visual-result-actions"><span>✓ 四种实词已经全部找对</span>' +
      '<button class="secondary-button" type="button" data-action="visual-retry" data-task-id="' +
      esc(scene.id) +
      '">再挑战一次</button></div></section>'
    );
  }

  function renderVisualComparisonCard(task) {
    var taskState = getVisualTaskState(task.id);
    var retrying = Boolean(visualRuntime.unlockedTasks[task.id]);
    var skipped = Boolean(visualRuntime.skippedTasks && visualRuntime.skippedTasks[task.id]);
    var complete = taskState.mastered && !retrying;
    var step = Math.min(Number(visualRuntime.taskSteps[task.id]) || 0, task.scenes.length - 1);
    var scene = task.scenes[step];
    var relationLabel = task.relation === 'synonym' ? '近义辨析' : '反义对照';
    var stateClass = complete ? ' is-complete' : skipped ? ' is-skipped' : '';
    return (
      '<article class="panel visual-comparison-card' +
      stateClass +
      '" data-visual-task-id="' +
      esc(task.id) +
      '" data-complete="' +
      String(complete) +
      '">' +
      '<div class="visual-card-head"><span class="relation-chip ' +
      task.relation +
      '">' +
      relationLabel +
      '</span><span class="visual-pair">' +
      esc(task.pair[0]) +
      ' <i>↔</i> ' +
      esc(task.pair[1]) +
      '</span></div>' +
      '<h3>' +
      esc(task.title) +
      '</h3>' +
      '<figure class="visual-figure">' +
      '<div class="visual-image-frame' +
      (!complete && !skipped ? ' focus-' + scene.side : '') +
      '">' +
      '<img src="' +
      esc(task.image) +
      '" data-src="' +
      esc(task.image) +
      '" data-visual-image alt="' +
      esc(task.alt) +
      '" width="' +
      task.width +
      '" height="' +
      task.height +
      '" loading="lazy" decoding="async">' +
      (!complete && !skipped
        ? '<span class="visual-side-cue">观察' + (scene.side === 'left' ? '左' : '右') + '图</span>'
        : '') +
      '<div class="visual-image-error" data-image-error hidden role="status">图片暂时没有载入。' +
      '<button type="button" data-action="visual-retry-image">重新加载图片</button></div>' +
      '</div>' +
      '<figcaption>' +
      esc(task.alt) +
      '</figcaption></figure>' +
      (complete
        ? renderVisualComparisonResult(task)
        : skipped
          ? '<div class="visual-skipped"><strong>本轮已跳过</strong><p>答案没有直接显示，可以稍后重新判断。</p>' +
            '<button class="secondary-button" type="button" data-action="visual-retry" data-task-id="' +
            esc(task.id) +
            '">重新挑战</button></div>'
          : renderVisualComparisonQuestion(task, scene, step)) +
      '</article>'
    );
  }

  function renderVisualComparisonQuestion(task, scene, step) {
    return (
      '<section class="visual-question"><div class="visual-question-meta"><span>场景 ' +
      (step + 1) +
      ' / ' +
      task.scenes.length +
      '</span><strong>Choose the more precise word</strong></div>' +
      '<h4>' +
      esc(scene.prompt) +
      '</h4>' +
      '<div class="visual-choice-grid">' +
      task.choices
        .map(function (choice) {
          return (
            '<button type="button" data-action="visual-choice" data-task-id="' +
            esc(task.id) +
            '" data-choice="' +
            esc(choice) +
            '">' +
            esc(choice) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<p id="visualFeedback-' +
      esc(task.id) +
      '" class="visual-feedback" role="status" aria-live="polite">先看图和句中线索，再选择更贴切的词。</p>' +
      '<button class="visual-skip-link" type="button" data-action="visual-skip" data-task-id="' +
      esc(task.id) +
      '">先跳过 · 稍后再练</button></section>'
    );
  }

  function renderVisualComparisonResult(task) {
    return (
      '<section class="visual-comparison-result"><div class="visual-meaning-pair">' +
      '<div><span>左图</span><strong>' +
      esc(task.pair[0]) +
      '</strong><p>' +
      esc(task.leftNote) +
      '</p></div>' +
      '<div><span>右图</span><strong>' +
      esc(task.pair[1]) +
      '</strong><p>' +
      esc(task.rightNote) +
      '</p></div></div>' +
      '<p class="visual-rule"><strong>辨析边界：</strong>' +
      esc(task.rule) +
      '</p><div class="visual-result-actions"><span>✓ 两个场景都已判断正确</span>' +
      '<button class="secondary-button" type="button" data-action="visual-retry" data-task-id="' +
      esc(task.id) +
      '">再挑战一次</button></div></section>'
    );
  }

  function visualGameModes() {
    return Array.isArray(VISUAL_LAB.gameModes) ? VISUAL_LAB.gameModes : [];
  }

  function findVisualGameMode(modeId) {
    return visualGameModes().find(function (mode) {
      return mode.id === modeId;
    });
  }

  function visualGameModeProgress(mode) {
    var completed = mode.tasks.filter(function (task) {
      return Boolean(visualState.tasks[task.id] && visualState.tasks[task.id].mastered);
    }).length;
    return {
      completed: completed,
      total: mode.tasks.length,
    };
  }

  function renderVisualGames() {
    var modes = visualGameModes();
    if (!modes.length) {
      return '<div class="empty-state">词网游戏暂时没有载入，请刷新页面后重试。</div>';
    }
    var activeMode = findVisualGameMode(visualRuntime.gameMode) || modes[0];
    visualRuntime.gameMode = activeMode.id;
    return (
      '<section class="visual-section-intro visual-games-intro">' +
      '<div><p class="eyebrow">WORD RELATION GAMES</p><h2>把单词连成一张会思考的网</h2></div>' +
      '<p>先判断，再看解释。答错只给线索；不会的可以跳过，系统不会直接泄露答案。</p></section>' +
      '<div class="visual-game-mode-grid" role="group" aria-label="选择词义关系游戏">' +
      modes
        .map(function (mode) {
          var progress = visualGameModeProgress(mode);
          var active = mode.id === activeMode.id;
          return (
            '<button class="visual-game-mode' +
            (active ? ' is-active' : '') +
            '" type="button" data-action="visual-game-mode" data-mode-id="' +
            esc(mode.id) +
            '" aria-pressed="' +
            String(active) +
            '"><span class="visual-game-icon" aria-hidden="true">' +
            esc(mode.icon) +
            '</span><span><strong>' +
            esc(mode.label) +
            '</strong><small>' +
            esc(mode.description) +
            '</small></span><b>' +
            progress.completed +
            '/' +
            progress.total +
            '</b></button>'
          );
        })
        .join('') +
      '</div>' +
      renderVisualGameStage(activeMode)
    );
  }

  function renderVisualGameStage(mode) {
    var tasks = mode.tasks;
    var replaying = Boolean(visualRuntime.gameReplay[mode.id]);
    var index = Math.max(0, Number(visualRuntime.gameIndices[mode.id]) || 0);

    if (!replaying) {
      while (
        index < tasks.length &&
        visualState.tasks[tasks[index].id] &&
        visualState.tasks[tasks[index].id].mastered &&
        !visualRuntime.gameAnswered[tasks[index].id]
      ) {
        index += 1;
      }
      visualRuntime.gameIndices[mode.id] = index;
    }

    if (index >= tasks.length) {
      return renderVisualGameRoundEnd(mode, replaying);
    }

    var task = tasks[index];
    var answered = Boolean(visualRuntime.gameAnswered[task.id]);
    var progress = visualGameModeProgress(mode);
    var image = task.image
      ? '<figure class="visual-game-figure"><div class="visual-image-frame focus-' +
        esc(task.focus || 'left') +
        '"><img src="' +
        esc(task.image) +
        '" data-src="' +
        esc(task.image) +
        '" data-visual-image alt="' +
        esc(task.alt) +
        '" width="' +
        Number(task.width || 1200) +
        '" height="' +
        Number(task.height || 751) +
        '" loading="lazy" decoding="async"><span class="visual-side-cue">只看' +
        (task.focus === 'right' ? '右' : '左') +
        '图</span><div class="visual-image-error" data-image-error hidden role="status">图片暂时没有载入。' +
        '<button type="button" data-action="visual-retry-image">重新加载图片</button></div></div>' +
        '<figcaption>' +
        esc(task.alt) +
        '</figcaption></figure>'
      : '';
    var audio = task.audioId
      ? '<div class="visual-game-listen"><button class="audio-button visual-game-audio" type="button" data-action="visual-game-audio" data-audio-id="' +
        esc(task.audioId) +
        '" data-audio-label="同音词语音" data-status-target="visualGameAudioStatus" aria-label="播放同音词语音"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">先听声音</span></button>' +
        '<span id="visualGameAudioStatus" aria-live="polite">同音词要靠句子决定拼写</span></div>'
      : '';
    var word = task.word
      ? '<div class="visual-game-word" aria-label="本题单词">' + esc(task.word) + '</div>'
      : '';

    return (
      '<article class="panel visual-game-stage" data-visual-task-id="' +
      esc(task.id) +
      '" data-complete="' +
      String(answered) +
      '">' +
      '<header class="visual-game-stage-head"><div><span class="relation-chip game">' +
      esc(mode.shortLabel) +
      '</span><p>第 ' +
      (index + 1) +
      ' / ' +
      tasks.length +
      ' 题</p></div><div class="visual-game-score"><strong>' +
      progress.completed +
      '</strong><span>已掌握</span></div></header>' +
      '<div class="visual-game-track" aria-hidden="true"><span style="--game-progress:' +
      Math.round((index / tasks.length) * 100) +
      '%"></span></div>' +
      '<div class="visual-game-layout"><div class="visual-game-media">' +
      image +
      word +
      audio +
      '</div><section class="visual-game-question"><p class="eyebrow">THINK BEFORE YOU PICK</p><h3>' +
      esc(task.title) +
      '</h3><p class="visual-game-prompt">' +
      esc(task.prompt) +
      '</p><div class="visual-game-choice-grid">' +
      task.choices
        .map(function (choice) {
          return (
            '<button type="button" data-action="visual-game-choice" data-task-id="' +
            esc(task.id) +
            '" data-choice="' +
            esc(choice) +
            '"' +
            (answered ? ' disabled' : '') +
            ' class="' +
            (answered && choice === task.answer ? 'is-correct' : '') +
            '">' +
            esc(choice) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      (answered
        ? '<div class="visual-game-answer" role="status"><strong>答对了：' +
          esc(task.answer) +
          '</strong><p>' +
          esc(task.feedback) +
          '</p></div><div class="visual-game-actions"><button class="primary-button" type="button" data-action="visual-game-next" data-mode-id="' +
          esc(mode.id) +
          '">下一题 →</button></div>'
        : '<p id="visualGameFeedback-' +
          esc(task.id) +
          '" class="visual-feedback" role="status" aria-live="polite">先独立判断；答错后只会得到一条线索。</p><div class="visual-game-actions"><button class="visual-skip-link" type="button" data-action="visual-game-skip" data-mode-id="' +
          esc(mode.id) +
          '" data-task-id="' +
          esc(task.id) +
          '">先跳过 · 不看答案</button></div>') +
      '</section></div></article>'
    );
  }

  function renderVisualGameRoundEnd(mode, replaying) {
    var progress = visualGameModeProgress(mode);
    var remaining = progress.total - progress.completed;
    return (
      '<section class="panel visual-game-finish"><span class="visual-game-finish-mark" aria-hidden="true">' +
      (remaining ? '↺' : '✓') +
      '</span><div><p class="eyebrow">' +
      (remaining ? 'ROUND REVIEW' : 'MODE COMPLETE') +
      '</p><h3>' +
      (remaining ? '这一轮已经走完' : esc(mode.label) + ' 已全部掌握') +
      '</h3><p>' +
      (remaining
        ? '还有 ' + remaining + ' 题没有答对；跳过的题没有显示答案，可以继续回来判断。'
        : replaying
          ? '复习轮完成。已掌握记录会保留，仍可再玩一轮巩固。'
          : '这一类词义关系已经全部答对，可以重玩来巩固速度。') +
      '</p></div><div class="visual-game-finish-actions">' +
      (remaining
        ? '<button class="primary-button" type="button" data-action="visual-game-continue" data-mode-id="' +
          esc(mode.id) +
          '">继续未完成题</button>'
        : '') +
      '<button class="secondary-button" type="button" data-action="visual-game-replay" data-mode-id="' +
      esc(mode.id) +
      '">再玩一轮</button></div></section>'
    );
  }

  function updateVisualProgress() {
    var summary = visualSummary();
    var completed = document.querySelector('[data-visual-completed]');
    var accuracy = document.querySelector('[data-visual-accuracy]');
    var bar = document.querySelector('[data-visual-progress]');
    if (completed) completed.textContent = summary.completed + ' / ' + summary.total;
    if (accuracy) accuracy.textContent = summary.accuracy + '%';
    if (bar) {
      bar.style.setProperty(
        '--visual-progress',
        (summary.total ? Math.round((summary.completed / summary.total) * 100) : 0) + '%',
      );
    }
  }

  function replaceVisualComparisonCard(task) {
    var card = document.querySelector('[data-visual-task-id="' + task.id + '"]');
    if (!card) return;
    card.outerHTML = renderVisualComparisonCard(task);
    var nextCard = document.querySelector('[data-visual-task-id="' + task.id + '"]');
    if (nextCard) {
      var firstChoice = nextCard.querySelector('[data-action="visual-choice"]');
      if (firstChoice) firstChoice.focus({ preventScroll: true });
    }
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
    skipLockedUntil = 0;
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
    skipLockedUntil = 0;
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
    skipLockedUntil = 0;
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
      spell: ['听写拼词', '先盲听拼写，可暂停和变速重播；提示不会直接显示答案。'],
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

    if (skill === 'forms' && !session.taskState.completed) {
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
      '" data-audio-label="' +
      esc(label) +
      '" aria-label="播放' +
      esc(label) +
      '"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">' +
      esc(label) +
      '</span></button>'
    );
  }

  function exampleAudioButton(accent, id, label) {
    return (
      '<button class="audio-button secondary-audio" type="button" data-action="play-example" data-accent="' +
      accent +
      '" data-audio-id="' +
      esc(id) +
      '" data-audio-label="' +
      esc(label) +
      '" aria-label="播放' +
      esc(label) +
      '"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">' +
      esc(label) +
      '</span></button>'
    );
  }

  function renderSpellTask(word) {
    var stateForTask = session.taskState;
    var attempts = stateForTask.attempts || 0;
    var completed = Boolean(stateForTask.completed);
    var accent = state.settings.accent === 'us' ? 'us' : 'uk';
    var accentLabel = accent === 'us' ? '美音' : '英音';
    return (
      '<div class="word-stage">' +
      '<span class="topic-badge">' +
      esc(word.topic) +
      '</span>' +
      '<p class="question-lead">先只听声音，输入完整单词；首次作答不显示长度。</p>' +
      '<button class="listen-orb" type="button" data-action="play-word" data-accent="' +
      accent +
      '" data-audio-id="' +
      esc(word.id) +
      '" data-rate="1" data-audio-label="单词" data-status-target="listenStatus" aria-label="播放单词" aria-describedby="listenStatus"><span class="audio-control-icon" aria-hidden="true">▶</span></button>' +
      '<p class="listen-status" id="listenStatus" aria-live="polite">' +
      accentLabel +
      ' · 正常语速；播放后可暂停或继续</p>' +
      '<div class="spell-replay-row" aria-label="重播速度">' +
      spellReplayButton(accent, word.id, 0.85, '慢速 0.85×') +
      spellReplayButton(accent, word.id, 1, '正常 1.0×') +
      '</div>' +
      '<div class="feedback spell-feedback" id="spellFeedback" data-feedback-class="feedback spell-feedback" aria-live="polite"></div>' +
      '<form class="answer-form" data-skill-form="spell">' +
      '<label class="eyebrow" for="spellInput">TYPE WHAT YOU HEAR</label>' +
      '<input class="answer-input" id="spellInput" name="answer" type="text" inputmode="text" enterkeyhint="done" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-describedby="spellFeedback" placeholder="在这里拼写" value="' +
      esc(stateForTask.answerValue || '') +
      '"' +
      (completed ? ' disabled' : '') +
      ' />' +
      '<div class="spell-action-grid">' +
      '<button class="primary-button spell-check-button" type="submit"' +
      (completed ? ' disabled' : '') +
      '>检查拼写</button>' +
      '<button class="secondary-button spell-hint-button" type="button" data-action="reveal-spell"' +
      (attempts >= 3 || completed ? ' disabled' : '') +
      '>' +
      spellHintButtonLabel(attempts) +
      '</button>' +
      (completed
        ? ''
        : '<button class="quiet-button spell-skip-button" type="button" data-action="skip-spell" aria-label="先跳过（稍后复习）">先跳过 · 稍后练</button>') +
      '</div>' +
      '</form>' +
      '</div>'
    );
  }

  function spellReplayButton(accent, id, rate, label) {
    return (
      '<button class="audio-button secondary-audio spell-replay-button" type="button" data-action="play-word" data-accent="' +
      accent +
      '" data-audio-id="' +
      esc(id) +
      '" data-rate="' +
      rate +
      '" data-audio-label="' +
      esc(label) +
      '" data-status-target="listenStatus" aria-label="播放' +
      esc(label) +
      '"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">' +
      esc(label) +
      '</span></button>'
    );
  }

  function spellHintButtonLabel(attempts) {
    if (attempts <= 0) return '给一点提示';
    if (attempts === 1) return '再给音节提示';
    if (attempts === 2) return '最后给乱序字母';
    return '提示已用完';
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
      formSkipRow(task) +
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
      '<div class="input-actions form-task-actions">' +
      '<button class="primary-button form-check-button" type="submit"' +
      (task.completed ? ' disabled' : '') +
      '>检查词形</button>' +
      formHintButton(task) +
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
      formSkipRow(task) +
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
      '<div class="input-actions form-task-actions">' +
      '<button class="primary-button form-check-button" type="submit"' +
      (task.completed ? ' disabled' : '') +
      '>检查词形</button>' +
      formHintButton(task) +
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
      formSkipRow(task) +
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
      '<div class="input-actions form-task-actions">' +
      '<button class="primary-button form-check-button" type="submit"' +
      (task.completed ? ' disabled' : '') +
      '>检查' +
      answerSlotCount +
      '格</button>' +
      formHintButton(task) +
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
    if (task.completed) return '';
    if (level >= 3) {
      return '<span class="form-hint-limit" role="status">提示已到最细</span>';
    }
    return (
      '<button class="secondary-button form-hint-button" type="button" data-action="reveal-form">' +
      labels[level] +
      '</button>'
    );
  }

  function formSkipButton(task) {
    if (task.completed) return '';
    return '<button class="secondary-button form-skip-button" type="button" data-action="skip-form" aria-label="先跳过本题，稍后复习">先跳过（稍后复习）</button>';
  }

  function formSkipRow(task) {
    var button = formSkipButton(task);
    return button ? '<div class="form-skip-row">' + button + '</div>' : '';
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
    var sortableIndices = sortableChunkIndices(word.chunks);
    if (!Array.isArray(task.chunkOrder) || task.chunkOrder.length !== sortableIndices.length) {
      task.chunkOrder = shuffledIndices(sortableIndices.length, word.id).map(function (position) {
        return sortableIndices[position];
      });
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
      '<div class="sentence-step-header"><span class="step-number">1</span><div><h3>搭出正确句子骨架</h3><p>大小写和句末标点已隐藏；请只根据语法和语义排序。</p></div></div>' +
      (task.chunksCorrect
        ? ''
        : '<div class="chunk-pool" aria-label="待选词块">' +
          remaining
            .map(function (index) {
              return chunkButton(word.chunks[index], 'chunk-select', index);
            })
            .join('') +
          '</div>') +
      '<div class="chunk-answer" aria-label="已选词块">' +
      (task.chunksCorrect
        ? task.writingUnlocked
          ? '<span class="fine-print">标准骨架已遮住；请只看中文独立仿写。</span>'
          : '<div class="chunk-solved-sentence"><span>标准骨架</span><strong>' +
            esc(joinChunks(word.chunks)) +
            '</strong></div>'
        : selected.length
          ? selected
              .map(function (index, position) {
                return chunkButton(word.chunks[index], 'chunk-remove', position);
              })
              .join('')
          : '<span class="fine-print">答案会出现在这里</span>') +
      '</div>' +
      '<div class="sentence-toolbar">' +
      (task.chunksCorrect
        ? '<button class="secondary-button" type="button" data-action="chunk-reset">重新排序</button>' +
          (task.writingUnlocked
            ? ''
            : '<button class="primary-button" type="button" data-action="start-sentence-writing">遮住骨架，开始仿写</button>')
        : '<button class="secondary-button" type="button" data-action="chunk-reset">重排</button>' +
          '<button class="secondary-button" type="button" data-action="chunk-reveal">显示骨架</button>' +
          '<button class="primary-button" type="button" data-action="chunk-check">检查顺序</button>') +
      '</div>' +
      '<div class="feedback' +
      (task.chunkFeedbackClass ? ' ' + task.chunkFeedbackClass : '') +
      '" id="chunkFeedback">' +
      esc(task.chunkFeedback || '') +
      '</div>' +
      '</section>' +
      renderSentenceWritingStep(word, task) +
      '</div>'
    );
  }

  function renderSentenceWritingStep(word, task) {
    if (!task.chunksCorrect || !task.writingUnlocked) {
      var lockedTitle = task.chunksCorrect ? '遮住骨架后开始仿写' : '完成排序后再仿写';
      var lockedNote = task.chunksCorrect
        ? '先读一遍标准骨架，再点击“遮住骨架，开始仿写”。'
        : '中文句子和写作检查项将在第一步完成后出现。';
      return (
        '<section class="sentence-step sentence-step-locked" aria-label="第二步尚未解锁">' +
        '<div class="sentence-step-header"><span class="step-number">2</span><div><h3>' +
        lockedTitle +
        '</h3><p>' +
        lockedNote +
        '</p></div></div>' +
        '</section>'
      );
    }
    return (
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
      '</section>'
    );
  }

  function chunkButton(text, action, index) {
    return (
      '<button class="chunk-button" type="button" data-action="' +
      action +
      '" data-index="' +
      index +
      '">' +
      esc(sentencePuzzleChunkText(text)) +
      '</button>'
    );
  }

  function sortableChunkIndices(chunks) {
    return chunks
      .map(function (chunk, index) {
        return { chunk: String(chunk || '').trim(), index: index };
      })
      .filter(function (item) {
        return item.chunk && !/^[,.;:!?]+$/.test(item.chunk);
      })
      .map(function (item) {
        return item.index;
      });
  }

  function sentencePuzzleChunkText(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[.!?]+$/, '')
      .trim();
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
    if (action === 'go-view') return navigate(button.dataset.view);
    if (action === 'go-today') return navigate('today');
    if (action === 'go-progress') return navigate('progress');
    if (action === 'leave-session') return navigate('today');
    if (action === 'visual-section') return changeVisualSection(button.dataset.section);
    if (action === 'visual-pos-token') return chooseVisualPosToken(button);
    if (action === 'visual-choice') return chooseVisualWord(button);
    if (action === 'visual-skip') return skipVisualWord(button);
    if (action === 'visual-retry') return retryVisualTask(button.dataset.taskId);
    if (action === 'visual-retry-image') return retryVisualImage(button);
    if (action === 'visual-game-mode') return changeVisualGameMode(button.dataset.modeId);
    if (action === 'visual-game-choice') return chooseVisualGameAnswer(button);
    if (action === 'visual-game-skip') return skipVisualGame(button);
    if (action === 'visual-game-next') return advanceVisualGame(button.dataset.modeId);
    if (action === 'visual-game-continue') return continueVisualGame(button.dataset.modeId);
    if (action === 'visual-game-replay') return replayVisualGame(button.dataset.modeId);
    if (action === 'visual-game-audio') return playVisualGameAudio(button);
    if (action === 'reveal-word') return revealWord();
    if (action === 'play-word') return playWordFromButton(button);
    if (action === 'play-example') return playExample(button);
    if (action === 'record-toggle') return toggleRecording(button);
    if (action === 'play-recording') return playRecording(button);
    if (action === 'mark-sound') return markSound(button.dataset.correct === 'true');
    if (action === 'reveal-spell') return revealSpellHint();
    if (action === 'skip-spell') return skipSpelling();
    if (action === 'advance-spell') return advanceSession();
    if (action === 'choose-pos') return choosePartOfSpeech(button.dataset.pos);
    if (action === 'reveal-form') return revealFormHint();
    if (action === 'skip-form') return skipFormExercise();
    if (action === 'advance-form') return advanceSession();
    if (action === 'chunk-select') return selectChunk(Number(button.dataset.index));
    if (action === 'chunk-remove') return removeChunk(Number(button.dataset.index));
    if (action === 'chunk-reset') return resetChunks();
    if (action === 'chunk-reveal') return revealChunks();
    if (action === 'chunk-check') return checkChunks();
    if (action === 'start-sentence-writing') return startSentenceWriting();
    if (action === 'finish-sentence') return finishSentence(button.dataset.correct === 'true');
    if (action === 'export-data') return exportData();
    if (action === 'reset-data') return resetData();
  }

  function changeVisualSection(section) {
    if (['pos', 'synonym', 'antonym', 'games'].indexOf(section) < 0) return;
    stopAudio();
    visualSection = section;
    renderVisualSection();
    var container = document.getElementById('visualContent');
    if (!container) return;
    if (window.matchMedia('(max-width: 780px)').matches) {
      var tabs = document.querySelector('.visual-tabs');
      var topbar = document.querySelector('.topbar');
      var visibleTop =
        (topbar ? topbar.getBoundingClientRect().height : 0) +
        (tabs ? tabs.getBoundingClientRect().height : 0) +
        14;
      var delta = container.getBoundingClientRect().top - visibleTop;
      window.scrollBy({ top: delta, behavior: 'smooth' });
      return;
    }
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function chooseVisualPosToken(button) {
    var card = button.closest('[data-visual-task-id]');
    var scene = VISUAL_LAB.posScene;
    if (!card || !scene || card.dataset.locked === 'true') return;
    var step = Math.min(visualRuntime.posStep, scene.questions.length - 1);
    var question = scene.questions[step];
    var choice = String(button.dataset.token || '');
    var correct = question.answers.indexOf(choice) >= 0;
    card.dataset.locked = 'true';
    recordVisualResult(scene.id, correct, choice);
    if (!correct) {
      button.classList.add('is-wrong');
      setFeedback('visualPosFeedback', '再想想：' + question.clue, 'is-wrong');
      setTimeout(function () {
        card.dataset.locked = 'false';
      }, 260);
      updateVisualProgress();
      return;
    }

    button.classList.add('is-correct');
    card.querySelectorAll('[data-action="visual-pos-token"]').forEach(function (token) {
      token.disabled = true;
    });
    setFeedback('visualPosFeedback', '正确。' + question.explanation, 'is-correct');
    setTimeout(function () {
      visualRuntime.posStep += 1;
      if (visualRuntime.posStep >= scene.questions.length) {
        var taskState = getVisualTaskState(scene.id);
        taskState.mastered = true;
        taskState.last = Date.now();
        visualRuntime.posStep = 0;
        delete visualRuntime.unlockedTasks[scene.id];
        saveVisualState();
      }
      renderVisualSection();
      updateVisualProgress();
    }, 620);
  }

  function findVisualTask(taskId) {
    return VISUAL_LAB.groups.find(function (task) {
      return task.id === taskId;
    });
  }

  function chooseVisualWord(button) {
    var task = findVisualTask(button.dataset.taskId);
    var card = button.closest('[data-visual-task-id]');
    if (!task || !card || card.dataset.locked === 'true') return;
    var step = Math.min(Number(visualRuntime.taskSteps[task.id]) || 0, task.scenes.length - 1);
    var scene = task.scenes[step];
    var choice = String(button.dataset.choice || '');
    var correct = choice === scene.answer;
    card.dataset.locked = 'true';
    recordVisualResult(task.id, correct, choice);
    if (!correct) {
      button.classList.add('is-wrong');
      button.setAttribute('aria-invalid', 'true');
      setFeedback(
        'visualFeedback-' + task.id,
        '这个词还不够贴切。再看图中的姿态、距离、结构或结果线索。',
        'is-wrong',
      );
      setTimeout(function () {
        card.dataset.locked = 'false';
      }, 260);
      updateVisualProgress();
      return;
    }

    button.classList.add('is-correct');
    card.querySelectorAll('[data-action="visual-choice"]').forEach(function (choiceButton) {
      choiceButton.disabled = true;
    });
    setFeedback('visualFeedback-' + task.id, '正确。' + scene.feedback, 'is-correct');
    setTimeout(function () {
      var nextStep = step + 1;
      if (nextStep >= task.scenes.length) {
        var taskState = getVisualTaskState(task.id);
        taskState.mastered = true;
        taskState.last = Date.now();
        visualRuntime.taskSteps[task.id] = 0;
        delete visualRuntime.unlockedTasks[task.id];
      } else {
        visualRuntime.taskSteps[task.id] = nextStep;
      }
      if (visualRuntime.skippedTasks) delete visualRuntime.skippedTasks[task.id];
      saveVisualState();
      replaceVisualComparisonCard(task);
      updateVisualProgress();
    }, 720);
  }

  function skipVisualWord(button) {
    var task = findVisualTask(button.dataset.taskId);
    var card = button.closest('[data-visual-task-id]');
    if (!task || !card || card.dataset.locked === 'true') return;
    var step = Math.min(Number(visualRuntime.taskSteps[task.id]) || 0, task.scenes.length - 1);
    card.dataset.locked = 'true';
    recordVisualResult(task.id, false, 'skip');
    if (step + 1 < task.scenes.length) {
      visualRuntime.taskSteps[task.id] = step + 1;
    } else {
      if (!visualRuntime.skippedTasks) visualRuntime.skippedTasks = {};
      visualRuntime.skippedTasks[task.id] = true;
      visualRuntime.taskSteps[task.id] = 0;
    }
    replaceVisualComparisonCard(task);
    updateVisualProgress();
  }

  function retryVisualTask(taskId) {
    delete visualRuntime.unlockedTasks[taskId];
    visualRuntime.unlockedTasks[taskId] = true;
    if (visualRuntime.skippedTasks) delete visualRuntime.skippedTasks[taskId];
    if (VISUAL_LAB.posScene && VISUAL_LAB.posScene.id === taskId) {
      visualRuntime.posStep = 0;
      renderVisualSection();
      return;
    }
    var task = findVisualTask(taskId);
    if (!task) return;
    visualRuntime.taskSteps[taskId] = 0;
    replaceVisualComparisonCard(task);
  }

  function findVisualGameTask(taskId) {
    var result = null;
    visualGameModes().some(function (mode) {
      var task = mode.tasks.find(function (candidate) {
        return candidate.id === taskId;
      });
      if (!task) return false;
      result = { mode: mode, task: task };
      return true;
    });
    return result;
  }

  function changeVisualGameMode(modeId) {
    var mode = findVisualGameMode(modeId);
    if (!mode) return;
    stopAudio();
    visualRuntime.gameMode = mode.id;
    renderVisualSection();
    var stage = document.querySelector('.visual-game-stage, .visual-game-finish');
    if (stage) stage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function chooseVisualGameAnswer(button) {
    var found = findVisualGameTask(button.dataset.taskId);
    var card = button.closest('[data-visual-task-id]');
    if (!found || !card || card.dataset.locked === 'true') return;
    var task = found.task;
    var choice = String(button.dataset.choice || '');
    var correct = choice === task.answer;
    card.dataset.locked = 'true';
    recordVisualResult(task.id, correct, choice);
    if (!correct) {
      button.classList.add('is-wrong');
      button.setAttribute('aria-invalid', 'true');
      setFeedback('visualGameFeedback-' + task.id, '还不对。线索：' + task.hint, 'is-wrong');
      setTimeout(function () {
        card.dataset.locked = 'false';
      }, 260);
      updateVisualProgress();
      return;
    }

    var taskState = getVisualTaskState(task.id);
    taskState.mastered = true;
    taskState.last = Date.now();
    visualRuntime.gameAnswered[task.id] = true;
    saveVisualState();
    renderVisualSection();
    updateVisualProgress();
  }

  function skipVisualGame(button) {
    var found = findVisualGameTask(button.dataset.taskId);
    var card = button.closest('[data-visual-task-id]');
    if (!found || !card || card.dataset.locked === 'true') return;
    card.dataset.locked = 'true';
    stopAudio();
    recordVisualResult(found.task.id, false, 'skip');
    delete visualRuntime.gameAnswered[found.task.id];
    visualRuntime.gameIndices[found.mode.id] =
      (Number(visualRuntime.gameIndices[found.mode.id]) || 0) + 1;
    renderVisualSection();
    updateVisualProgress();
  }

  function advanceVisualGame(modeId) {
    var mode = findVisualGameMode(modeId);
    if (!mode) return;
    stopAudio();
    var index = Math.max(0, Number(visualRuntime.gameIndices[mode.id]) || 0);
    if (mode.tasks[index]) delete visualRuntime.gameAnswered[mode.tasks[index].id];
    visualRuntime.gameIndices[mode.id] = index + 1;
    renderVisualSection();
  }

  function continueVisualGame(modeId) {
    var mode = findVisualGameMode(modeId);
    if (!mode) return;
    stopAudio();
    delete visualRuntime.gameReplay[mode.id];
    var firstIncomplete = mode.tasks.findIndex(function (task) {
      return !(visualState.tasks[task.id] && visualState.tasks[task.id].mastered);
    });
    visualRuntime.gameIndices[mode.id] = firstIncomplete < 0 ? mode.tasks.length : firstIncomplete;
    renderVisualSection();
  }

  function replayVisualGame(modeId) {
    var mode = findVisualGameMode(modeId);
    if (!mode) return;
    stopAudio();
    visualRuntime.gameReplay[mode.id] = true;
    visualRuntime.gameIndices[mode.id] = 0;
    mode.tasks.forEach(function (task) {
      delete visualRuntime.gameAnswered[task.id];
    });
    renderVisualSection();
  }

  function playVisualGameAudio(button) {
    var audioId = String(button.dataset.audioId || '');
    if (!audioId) return;
    var accent = state.settings.accent === 'us' ? 'us' : 'uk';
    button.dataset.accent = accent;
    var source =
      './audio/' + accent + '/' + audioId + '.mp3?v=' + encodeURIComponent(AUDIO_ASSET_VERSION);
    startAudioPlayback(source, button, 1);
  }

  function retryVisualImage(button) {
    var card = button.closest('[data-visual-task-id]');
    var image = card && card.querySelector('[data-visual-image]');
    var error = card && card.querySelector('[data-image-error]');
    if (!card || !image) return;
    card.classList.remove('is-image-error');
    card.setAttribute('aria-busy', 'true');
    image.hidden = false;
    if (error) error.hidden = true;
    var base = image.dataset.src;
    image.src = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'retry=' + Date.now();
  }

  function handleVisualImageError(event) {
    var image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('[data-visual-image]')) return;
    var card = image.closest('[data-visual-task-id]');
    if (!card) return;
    image.hidden = true;
    card.classList.add('is-image-error');
    card.setAttribute('aria-busy', 'false');
    var error = card.querySelector('[data-image-error]');
    if (error) error.hidden = false;
    card
      .querySelectorAll(
        '[data-action="visual-choice"], [data-action="visual-pos-token"], [data-action="visual-game-choice"]',
      )
      .forEach(function (answerButton) {
        answerButton.disabled = true;
      });
  }

  function handleVisualImageLoad(event) {
    var image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('[data-visual-image]')) return;
    var card = image.closest('[data-visual-task-id]');
    if (!card) return;
    card.classList.remove('is-image-error');
    card.setAttribute('aria-busy', 'false');
    var error = card.querySelector('[data-image-error]');
    if (error) error.hidden = true;
    if (card.dataset.complete !== 'true') {
      card
        .querySelectorAll(
          '[data-action="visual-choice"], [data-action="visual-pos-token"], [data-action="visual-game-choice"]',
        )
        .forEach(function (answerButton) {
          answerButton.disabled = false;
        });
    }
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

  function handleMainInput(event) {
    if (!session || currentSkill() !== 'spell' || event.target.id !== 'spellInput') return;
    session.taskState.answerValue = event.target.value;
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
    var task = session.taskState;
    if (task.completed || task.skipping) return;
    task.answerValue = answer;
    if (!answer) {
      setFeedback('spellFeedback', '先输入你听到的单词。', 'is-wrong');
      focusSpellInput();
      return;
    }
    var accepted = [word.word].concat(word.spellAccept || []);
    var correct = accepted.some(function (candidate) {
      return normaliseAnswer(candidate) === normaliseAnswer(answer);
    });
    if (correct) {
      task.completed = true;
      var firstTry = !task.hadError;
      var variant = normaliseAnswer(answer) !== normaliseAnswer(word.word);
      recordResult(
        word,
        'spell',
        firstTry,
        variant
          ? firstTry
            ? '接受变体拼写；首次正确'
            : '接受变体拼写；提示后完成'
          : firstTry
            ? '听写首次正确'
            : '提示后完成；仍列入复习',
      );
      setFeedback(
        'spellFeedback',
        '<div class="spell-result-copy">' +
          (variant
            ? '可以接受；IELTS 英式书写建议使用 <strong>' + esc(word.word) + '</strong>。'
            : firstTry
              ? '首次正确。声音和拼写已经连上了。'
              : '这次拼对了；因为使用过提示，本词仍会稍后复习。') +
          '<small>音节复盘：' +
          syllableHtml(word) +
          '</small></div>' +
          '<div class="spell-result-actions">' +
          spellReviewAudioButton(word) +
          '<button class="primary-button" type="button" data-action="advance-spell">下一题 →</button></div>',
        'is-correct',
        true,
      );
      disableForm('spellInput');
      var skipButton = document.querySelector('[data-action="skip-spell"]');
      if (skipButton) skipButton.disabled = true;
      return;
    }

    task.hadError = true;
    task.attempts = Math.min(3, (task.attempts || 0) + 1);
    showSpellingHint(answer);
  }

  function revealSpellHint() {
    if (!session || currentSkill() !== 'spell') return;
    var input = document.getElementById('spellInput');
    var answer = input ? input.value : '';
    var task = session.taskState;
    if (task.completed || task.skipping) return;
    task.answerValue = answer;
    if ((task.attempts || 0) >= 3) {
      setFeedback(
        'spellFeedback',
        '提示已经用完，答案仍然隐藏。请再听、继续尝试，或先跳过稍后复习。',
        'is-wrong',
      );
      updateSpellHintButton();
      return;
    }
    task.hadError = true;
    task.attempts = Math.min(3, (task.attempts || 0) + 1);
    showSpellingHint(answer);
  }

  function showSpellingHint(answer) {
    var word = currentWord();
    var task = session.taskState;
    var attempt = task.attempts || 1;
    if (attempt === 1) {
      var hintTarget = closestSpellingTarget(answer, word);
      var analysis = spellingAlignment(answer, hintTarget);
      var message = answer
        ? '还不对。' + analysis.summary + letterCountText(hintTarget) + '；答案仍然隐藏。'
        : '第一层提示：目标词' + letterCountText(hintTarget) + '。答案仍然隐藏。';
      setFeedback(
        'spellFeedback',
        message + (answer ? spellingAlignmentHtml(analysis) : ''),
        'is-wrong',
        true,
      );
    } else if (attempt === 2) {
      setFeedback(
        'spellFeedback',
        '第二层提示：音节轮廓为 <strong>' +
          esc(maskedSyllables(word)) +
          '</strong>。完整答案仍然隐藏。',
        'is-wrong',
        true,
      );
    } else {
      setFeedback(
        'spellFeedback',
        '最后一层提示：请把这些字母重新排列并完整输入。' +
          scrambledLetterBankHtml(word) +
          '<small class="hint-note">系统不会直接显示答案；不会做可以先跳过。</small>',
        'is-wrong',
        true,
      );
    }
    updateSpellHintButton();
    focusSpellInput();
  }

  function skipSpelling() {
    if (!session || currentSkill() !== 'spell') return;
    var task = session.taskState;
    if (task.completed || task.skipping) return;
    if (!acquireSkipLock()) return;
    task.skipping = true;
    stopAudio();
    var input = document.getElementById('spellInput');
    var answer = input ? input.value.trim() : '';
    var usedHelp = Boolean(task.hadError || task.attempts || answer);
    recordResult(
      currentWord(),
      'spell',
      false,
      usedHelp ? '尝试或使用提示后主动跳过；未显示答案' : '主动跳过；未显示答案',
    );
    showToast('已跳过，不显示答案；这道题已加入待复习。');
    advanceSession();
  }

  function acquireSkipLock() {
    var now = Date.now();
    if (now < skipLockedUntil) return false;
    skipLockedUntil = now + 650;
    return true;
  }

  function updateSpellHintButton() {
    if (!session || currentSkill() !== 'spell') return;
    var button = document.querySelector('[data-action="reveal-spell"]');
    if (!button) return;
    var attempts = session.taskState.attempts || 0;
    button.textContent = spellHintButtonLabel(attempts);
    button.disabled = attempts >= 3 || Boolean(session.taskState.completed);
  }

  function focusSpellInput() {
    var input = document.getElementById('spellInput');
    if (!input || input.disabled) return;
    input.focus({ preventScroll: true });
    var alignActions = function () {
      var actions = document.querySelector('.spell-action-grid');
      if (!actions) return;
      var reducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      actions.scrollIntoView({
        block: 'end',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    };
    setTimeout(alignActions, 100);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', alignActions, { once: true });
    }
  }

  function spellReviewAudioButton(word) {
    var accent = state.settings.accent === 'us' ? 'us' : 'uk';
    return (
      '<button class="audio-button secondary-audio spell-review-audio" type="button" data-action="play-word" data-accent="' +
      accent +
      '" data-audio-id="' +
      esc(word.id) +
      '" data-rate="1" data-audio-label="正确拼写读音" data-status-target="listenStatus" aria-label="播放正确拼写读音"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">再听一次</span></button>'
    );
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
    var task = session.taskState;
    if (task.completed || task.skipping) return;
    task.skipping = true;
    var usedHelp = (task.formAttempts || 0) > 0;
    recordResult(
      word,
      'forms',
      false,
      usedHelp ? '尝试或使用提示后主动跳过；未显示答案' : '主动跳过；未显示答案',
    );
    showToast('已跳过，不显示答案；这道题已加入待复习。');
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
    var task = session.taskState;
    task.selectedChunks = [];
    task.chunksCorrect = false;
    task.writingUnlocked = false;
    task.chunkFeedback = '';
    task.chunkFeedbackClass = '';
    task.writing = '';
    task.checks = null;
    task.mechanicsPass = false;
    task.evaluated = false;
    task.sentenceFeedback = '';
    renderSession();
  }

  function revealChunks() {
    if (!session || currentSkill() !== 'sentence') return;
    var word = currentWord();
    session.taskState.selectedChunks = sortableChunkIndices(word.chunks);
    session.taskState.chunksCorrect = true;
    session.taskState.writingUnlocked = false;
    session.taskState.hadError = true;
    session.taskState.chunkFeedback = '已显示正确骨架。请读一遍，再完成下面的仿写。';
    session.taskState.chunkFeedbackClass = 'is-wrong';
    renderSession();
  }

  function checkChunks() {
    if (!session || currentSkill() !== 'sentence') return;
    var word = currentWord();
    var task = session.taskState;
    var expected = sortableChunkIndices(word.chunks);
    var selected = task.selectedChunks || [];
    var correct =
      selected.length === expected.length &&
      selected.every(function (index, position) {
        return index === expected[position];
      });
    task.chunkAttempts = (task.chunkAttempts || 0) + 1;
    if (correct) {
      task.chunksCorrect = true;
      task.writingUnlocked = false;
      task.chunkFeedback = '顺序正确。先读一遍标准骨架，再遮住英文完成仿写。';
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

  function startSentenceWriting() {
    if (!session || currentSkill() !== 'sentence') return;
    var task = session.taskState;
    if (!task.chunksCorrect || task.writingUnlocked) return;
    task.writingUnlocked = true;
    task.chunkFeedback = '骨架已遮住。现在只看中文，独立写出完整句子。';
    task.chunkFeedbackClass = '';
    renderSession();
    setTimeout(function () {
      var textarea = document.getElementById('sentenceInput');
      if (textarea) textarea.focus({ preventScroll: true });
    }, 40);
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
    var accent = button.classList.contains('listen-orb')
      ? state.settings.accent
      : button.dataset.accent || state.settings.accent;
    var rate = Number(button.dataset.rate) || 1;
    button.dataset.accent = accent;
    playFixedAudio(currentWord(), accent, rate, button, 'word');
  }

  function playFixedAudio(word, accent, rate, button, kind) {
    if (toggleCurrentPlayback(button)) return;
    var isSentence = kind === 'sentence';
    var suffix = isSentence ? '_sentence' : '';
    var source =
      './audio/' +
      accent +
      '/' +
      word.id +
      suffix +
      '.mp3?v=' +
      encodeURIComponent(AUDIO_ASSET_VERSION);
    startAudioPlayback(source, button, rate);
  }

  function startAudioPlayback(source, button, rate) {
    stopAudio();
    var audio = new Audio(source);
    var token = ++playbackToken;
    currentAudio = audio;
    playingButton = button;
    playbackStatus = 'loading';
    playbackDesired = 'playing';
    audio.playbackRate = rate;
    audio.preload = 'auto';
    button.dataset.activeRate = String(rate);
    updatePlaybackButton(button, 'loading');
    updatePlaybackMessage(button, 'loading');

    var isCurrent = function () {
      return playbackToken === token && currentAudio === audio;
    };

    var finish = function () {
      if (!isCurrent()) return;
      clearTimeout(playbackTimer);
      currentAudio = null;
      playingButton = null;
      playbackStatus = 'idle';
      playbackDesired = 'idle';
      updatePlaybackButton(button, 'idle');
      updatePlaybackMessage(button, 'ended');
    };

    var fail = function (error) {
      if (!isCurrent()) return;
      if (error && error.name === 'AbortError') return;
      clearTimeout(playbackTimer);
      currentAudio = null;
      playingButton = null;
      playbackStatus = 'idle';
      playbackDesired = 'idle';
      updatePlaybackButton(button, 'idle');
      updatePlaybackMessage(button, 'error');
      showToast('自然语音加载失败，请检查网络后重试。');
    };

    audio.addEventListener('playing', function () {
      if (!isCurrent() || playbackDesired !== 'playing') return;
      clearTimeout(playbackTimer);
      playbackStatus = 'playing';
      updatePlaybackButton(button, 'playing');
      updatePlaybackMessage(button, 'playing');
    });
    audio.addEventListener('waiting', function () {
      if (!isCurrent() || playbackDesired !== 'playing') return;
      playbackStatus = 'loading';
      updatePlaybackButton(button, 'loading');
      updatePlaybackMessage(button, 'loading');
    });
    audio.addEventListener('stalled', function () {
      if (!isCurrent() || playbackDesired !== 'playing') return;
      updatePlaybackMessage(button, 'loading');
    });
    audio.addEventListener('pause', function () {
      if (!isCurrent() || audio.ended || playbackDesired !== 'paused' || !audio.paused) {
        return;
      }
      playbackStatus = 'paused';
      updatePlaybackButton(button, 'paused');
      updatePlaybackMessage(button, 'paused');
    });
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', fail, { once: true });
    armPlaybackTimeout(token, audio, button);
    audio.play().catch(fail);
  }

  function playExample(button) {
    if (!session) return;
    var accent = button.dataset.accent || state.settings.accent;
    playFixedAudio(currentWord(), accent, 1, button, 'sentence');
  }

  function toggleCurrentPlayback(button) {
    if (!currentAudio || playingButton !== button) return false;
    if (playbackDesired === 'playing') {
      playbackDesired = 'paused';
      currentAudio.pause();
      playbackStatus = 'paused';
      updatePlaybackButton(button, 'paused');
      updatePlaybackMessage(button, 'paused');
      return true;
    }
    var audio = currentAudio;
    var token = playbackToken;
    playbackDesired = 'playing';
    playbackStatus = 'loading';
    updatePlaybackButton(button, 'loading');
    updatePlaybackMessage(button, 'loading');
    armPlaybackTimeout(token, audio, button);
    audio.play().catch(function (error) {
      if (playbackToken !== token || currentAudio !== audio || playingButton !== button) return;
      if (error && error.name === 'AbortError') return;
      stopAudio();
      updatePlaybackMessage(button, 'error');
      showToast('自然语音无法继续播放，请重新点击播放。');
    });
    return true;
  }

  function armPlaybackTimeout(token, audio, button) {
    clearTimeout(playbackTimer);
    playbackTimer = setTimeout(function () {
      if (
        playbackToken !== token ||
        currentAudio !== audio ||
        playingButton !== button ||
        playbackDesired !== 'playing' ||
        playbackStatus !== 'loading'
      ) {
        return;
      }
      stopAudio();
      updatePlaybackMessage(button, 'error');
      showToast('自然语音加载超时，请检查网络后重试。');
    }, 10000);
  }

  function updatePlaybackButton(button, status) {
    if (!button) return;
    button.classList.toggle('is-playing', status === 'playing');
    button.classList.toggle('is-paused', status === 'paused');
    button.classList.toggle('is-loading', status === 'loading');
    button.dataset.playbackState = status;
    button.setAttribute(
      'aria-pressed',
      status === 'playing' || status === 'loading' ? 'true' : 'false',
    );
    var icon = button.querySelector('.audio-control-icon');
    if (icon) icon.textContent = status === 'playing' || status === 'loading' ? '❚❚' : '▶';
    var label = button.dataset.audioLabel || '语音';
    var action =
      status === 'playing' || status === 'loading' ? '暂停' : status === 'paused' ? '继续' : '播放';
    button.setAttribute('aria-label', action + label);
  }

  function updatePlaybackMessage(button, status) {
    if (!button || !button.dataset.statusTarget) return;
    var element = document.getElementById(button.dataset.statusTarget);
    if (!element) return;
    var accent = button.dataset.accent === 'us' ? '美音' : '英音';
    var rate = Number(button.dataset.activeRate || button.dataset.rate) || 1;
    if (status === 'playing') {
      element.textContent =
        accent + ' · ' + (rate < 1 ? rate.toFixed(2) + '× 慢速' : '正常语速') + ' · 点击暂停';
    } else if (status === 'paused') {
      element.textContent = '已暂停 · 点击同一个按钮继续';
    } else if (status === 'loading') {
      element.textContent = '正在加载自然语音…';
    } else if (status === 'ended') {
      element.textContent = '播放完成 · 可以再次播放';
    } else if (status === 'error') {
      element.textContent = '语音加载失败 · 请检查网络后重试';
    }
  }

  function stopAudio() {
    playbackToken += 1;
    clearTimeout(playbackTimer);
    playbackTimer = null;
    var audio = currentAudio;
    var button = playingButton;
    currentAudio = null;
    playingButton = null;
    playbackStatus = 'idle';
    playbackDesired = 'idle';
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (error) {
        // Safari can reject currentTime changes before metadata is available.
      }
    }
    if (button) updatePlaybackButton(button, 'idle');
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
    if (!button.dataset.audioLabel) button.dataset.audioLabel = '跟读录音';
    if (!button.querySelector('.audio-control-icon')) {
      button.innerHTML =
        '<span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">回放自己</span>';
    }
    if (toggleCurrentPlayback(button)) return;
    startAudioPlayback(recordUrl, button, 1);
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
    settingsDialog.showModal();
  }

  function saveSettings() {
    var form = document.getElementById('settingsForm');
    state.settings.accent = form.elements.accent.value === 'us' ? 'us' : 'uk';
    state.settings.dailyNew = Number(form.elements.dailyNew.value) || 6;
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
      visualState: visualState,
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
      visualState = normaliseVisualState(payload.visualState);
      visualRuntime = defaultVisualRuntime();
      saveState();
      saveVisualState();
      showToast('词汇与图像课程进度已导入。');
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
    visualState = defaultVisualState();
    visualRuntime = defaultVisualRuntime();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VISUAL_STORAGE_KEY);
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
    var text = String(value || '');
    if (typeof text.normalize === 'function') text = text.normalize('NFKC');
    return text
      .trim()
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/\s+/g, ' ');
  }

  function closestSpellingTarget(answer, word) {
    var candidates = [word.word].concat(word.spellAccept || []);
    return candidates
      .map(function (candidate) {
        return {
          candidate: candidate,
          distance: spellingAlignment(answer, candidate).distance,
        };
      })
      .sort(function (a, b) {
        return a.distance - b.distance;
      })[0].candidate;
  }

  function spellingAlignment(input, target) {
    var answer = normaliseAnswer(input).replace(/[^a-z]/g, '');
    var expected = normaliseAnswer(target).replace(/[^a-z]/g, '');
    var rows = answer.length + 1;
    var columns = expected.length + 1;
    var table = Array.from({ length: rows }, function () {
      return Array(columns).fill(0);
    });
    var row;
    var column;
    for (row = 0; row < rows; row += 1) table[row][0] = row;
    for (column = 0; column < columns; column += 1) table[0][column] = column;
    for (row = 1; row < rows; row += 1) {
      for (column = 1; column < columns; column += 1) {
        var substitutionCost = answer[row - 1] === expected[column - 1] ? 0 : 1;
        table[row][column] = Math.min(
          table[row - 1][column] + 1,
          table[row][column - 1] + 1,
          table[row - 1][column - 1] + substitutionCost,
        );
      }
    }

    var tokens = [];
    var missing = 0;
    var extra = 0;
    var changed = 0;
    row = answer.length;
    column = expected.length;
    while (row > 0 || column > 0) {
      if (
        row > 0 &&
        column > 0 &&
        answer[row - 1] === expected[column - 1] &&
        table[row][column] === table[row - 1][column - 1]
      ) {
        tokens.push({ value: answer[row - 1], status: 'ok' });
        row -= 1;
        column -= 1;
      } else if (row > 0 && column > 0 && table[row][column] === table[row - 1][column - 1] + 1) {
        tokens.push({ value: answer[row - 1], status: 'changed' });
        changed += 1;
        row -= 1;
        column -= 1;
      } else if (row > 0 && table[row][column] === table[row - 1][column] + 1) {
        tokens.push({ value: answer[row - 1], status: 'extra' });
        extra += 1;
        row -= 1;
      } else {
        tokens.push({ value: '□', status: 'missing' });
        missing += 1;
        column -= 1;
      }
    }
    tokens.reverse();

    var parts = [];
    if (missing) parts.push('少了 ' + missing + ' 个字母');
    if (extra) parts.push('多了 ' + extra + ' 个字母');
    if (changed) parts.push(changed + ' 个字母需要修改');
    return {
      distance: table[answer.length][expected.length],
      tokens: tokens,
      summary: parts.length ? parts.join('，') + '。' : '请检查拼写边界。',
    };
  }

  function spellingAlignmentHtml(analysis) {
    return (
      '<div class="letter-diff" aria-label="' +
      esc(analysis.summary) +
      '">' +
      analysis.tokens
        .map(function (token) {
          return '<span class="diff-letter ' + token.status + '">' + esc(token.value) + '</span>';
        })
        .join('') +
      '</div>'
    );
  }

  function scrambledLetterBankHtml(word) {
    var letters = normaliseAnswer(word.word)
      .replace(/[^a-z]/g, '')
      .split('');
    var order = shuffledIndices(letters.length, word.id + '-spell-hint');
    return (
      '<div class="scrambled-letter-bank" aria-label="乱序字母">' +
      order
        .map(function (index) {
          return '<span>' + esc(letters[index]) + '</span>';
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
    element.className =
      (element.dataset.feedbackClass || 'feedback') + (className ? ' ' + className : '');
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
