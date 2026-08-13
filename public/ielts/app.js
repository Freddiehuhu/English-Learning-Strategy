(function () {
  'use strict';

  var WORDS = Array.isArray(window.IELTS_VOCABULARY) ? window.IELTS_VOCABULARY : [];
  var RESCUE_WORDS = Array.isArray(window.IELTS_RESCUE_VOCABULARY)
    ? window.IELTS_RESCUE_VOCABULARY
    : [];
  var VISUAL_LAB =
    window.IELTS_VISUAL_LAB && typeof window.IELTS_VISUAL_LAB === 'object'
      ? window.IELTS_VISUAL_LAB
      : { posScene: null, familyAtlases: [], groups: [], gameModes: [] };
  var STORAGE_KEY = 'els-ielts-wordlab-v1';
  var VISUAL_STORAGE_KEY = 'els-ielts-visual-lab-v1';
  var HARD_WORD_PRACTICE_STORAGE_KEY = 'els-ielts-hard-word-practice-v1';
  var HARD_WORD_SOUND_FORM_STORAGE_KEY = 'els-ielts-hard-word-sound-form-v1';
  var HARD_WORD_AUDIO_MANIFEST_URL = './audio/hard-words/manifest.json';
  var HARD_WORD_AUDIO_CATALOG_ID = 'student-hard-words-2026-08-12';
  var HARD_WORD_CATALOG_SHA256 = '0db08fa501961bc0ccdc1a044be8d86793858761cc43e4db9f68087a05560a95';
  var HARD_WORD_SOUND_FORM_BATCH_SIZE = 10;
  var AUDIO_ASSET_VERSION = 'mixed-local-20260813.2-hard-words';
  var STATE_VERSION = 5;
  var VISUAL_STATE_VERSION = 5;
  var ADAPTIVE_MODEL_VERSION = 2;
  var ADAPTIVE_FEATURE_SCHEMA_VERSION = 2;
  var DAY_MS = 86400000;
  var SKILLS = ['sound', 'spell', 'forms', 'sentence'];
  var MODEL_SKILLS = SKILLS.concat('meaning');
  var ADAPTIVE_SHADOW_MIN = 20;
  var ADAPTIVE_SHADOW_FULL = 50;
  var ADAPTIVE_SKILL_MIN = 5;
  var DAILY_NEW_LIMIT = 2;
  var DAILY_MAX_SECONDS = 720;
  var RELEARN_MIN_OTHER_TASKS = 3;
  var RELEARN_TARGET_DELAY_MS = 5 * 60 * 1000;
  var RELEARN_TARGET_PRACTICE_SECONDS = 5 * 60;
  var RELEARN_MAX_QUEUE = 40;
  var RELEARN_MAX_PER_SESSION = 2;
  var RESCUE_GATE_SECONDS = {
    readDecode: 40,
    listenForm: 55,
    meaningRecall: 40,
  };
  var RESCUE_GATE_LABELS = {
    readDecode: '见词辨音',
    listenForm: '盲听成形',
    meaningRecall: '语境辨义',
  };
  var SYLLABLE_TUTORIAL_STEPS = ['idea', 'layers', 'examples', 'quiz', 'finish'];
  var SYLLABLE_TUTORIAL_WORDS = {
    squeeze: {
      count: 1,
      stress: 0,
      sounds: ['SQUEEZE'],
      spelling: ['squ', 'ee', 'ze'],
    },
    fountain: {
      count: 2,
      stress: 0,
      sounds: ['FOUN', 'tain'],
      spelling: ['foun', 'tain'],
    },
    certificate: {
      count: 4,
      stress: 1,
      sounds: ['cer', 'TIF', 'i', 'cate'],
      spelling: ['cer', 'tif', 'i', 'cate'],
    },
    pronunciation: {
      count: 5,
      stress: 3,
      sounds: ['pro', 'nun', 'ci', 'A', 'tion'],
      spelling: ['pro', 'nun', 'ci', 'a', 'tion'],
    },
    controversial: {
      count: 4,
      stress: 2,
      sounds: ['con', 'tro', 'VER', 'sial'],
      spelling: ['con', 'tro', 'ver', 'sial'],
    },
  };
  var SYLLABLE_TUTORIAL_QUIZ = ['squeeze', 'certificate', 'controversial'];
  var STAGE_SECONDS = {
    sound: 45,
    spell: 75,
    forms: 90,
    sentence: 135,
  };
  var SKILL_LABELS = {
    sound: '音节听辨',
    spell: '听写拼词',
    forms: '词形变换',
    sentence: '标准句复现',
    meaning: '图片辨义',
  };
  var SKILL_SHORT = {
    sound: '辨音',
    spell: '拼写',
    forms: '词形',
    sentence: '句架',
  };
  var SKILL_CHAIN_LABELS = {
    sound: '声音与核心义',
    spell: '拼写与词义',
    forms: '词形与构词',
    sentence: '搭配到标准句复现',
  };
  var ADAPTIVE_WEIGHT_KEYS = [
    'bias',
    'priorAccuracy',
    'level',
    'logDays',
    'recentError',
    'hintRate',
    'replayRate',
    'skipRate',
    'slowResponse',
    'skillSound',
    'skillSpell',
    'skillForms',
    'skillSentence',
    'skillMeaning',
  ];
  var ADAPTIVE_DEFAULT_WEIGHTS = {
    bias: -0.4,
    priorAccuracy: 1.4,
    level: 1.2,
    logDays: -1,
    recentError: -1.2,
    hintRate: -0.9,
    replayRate: -0.45,
    skipRate: -1.1,
    slowResponse: -0.4,
    skillSound: 0,
    skillSpell: 0,
    skillForms: 0,
    skillSentence: 0,
    skillMeaning: 0,
  };
  var ADAPTIVE_NONPOSITIVE_WEIGHTS = [
    'logDays',
    'recentError',
    'hintRate',
    'replayRate',
    'skipRate',
    'slowResponse',
  ];
  var ADAPTIVE_NONNEGATIVE_WEIGHTS = ['priorAccuracy', 'level'];
  var LEARNING_GOALS = {
    balanced: {
      label: '均衡提升',
      retention: { sound: 0.68, spell: 0.72, meaning: 0.7, forms: 0.72, sentence: 0.74 },
      priority: { sound: 1, spell: 1, meaning: 1, forms: 1, sentence: 1 },
    },
    listening: {
      label: '听力与拼写',
      retention: { sound: 0.76, spell: 0.78, meaning: 0.72, forms: 0.68, sentence: 0.68 },
      priority: { sound: 1.3, spell: 1.25, meaning: 1.05, forms: 0.85, sentence: 0.85 },
    },
    writing: {
      label: '词形与写作',
      retention: { sound: 0.66, spell: 0.74, meaning: 0.72, forms: 0.78, sentence: 0.8 },
      priority: { sound: 0.8, spell: 1.1, meaning: 1.05, forms: 1.3, sentence: 1.3 },
    },
  };
  // Only visual tasks that directly test a core gate can enter its repair queue.
  // Meaning recognition remains separate so it cannot invalidate sentence mastery.
  var VISUAL_REPAIR_SKILLS = {
    pos: 'forms',
    family: 'forms',
    synonym: '',
    antonym: '',
    guess: '',
    homophone: 'spell',
    homograph: '',
    analogy: 'forms',
    taxonomy: '',
    collocation: 'sentence',
  };
  var VISUAL_MODEL_SKILLS = {
    pos: 'forms',
    family: 'forms',
    synonym: 'meaning',
    antonym: 'meaning',
    guess: 'meaning',
    homophone: 'spell',
    homograph: 'meaning',
    analogy: 'forms',
    taxonomy: 'meaning',
    collocation: 'meaning',
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
        [
          'differ',
          'v.',
          '不同',
          '去掉名词词尾 -ence，得到 differ；注意保留双写 f，词尾只有一个 r。',
        ],
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
    [
      'safety',
      '安全',
      [
        ['safety', 'n.', '安全', '这是题面给出的名词。'],
        [
          'save',
          'v.',
          '挽救；救助',
          '先从 safety 还原 safe，再把词干中的 f 变为 v；这不是简单添加后缀。',
        ],
        ['safe', 'adj.', '安全的', '从名词 safety 去掉词尾 -ty。'],
        ['safely', 'adv.', '安全地', '在 safe 后加 -ly，并保留末尾 e。'],
      ],
    ],
    [
      'extension',
      '延伸；扩建部分',
      [
        ['extension', 'n.', '延伸；扩建部分', '这是题面给出的名词。'],
        ['extend', 'v.', '延伸；扩建', '把名词词尾 -sion 换成动词词尾 -d。'],
        [
          'extensive',
          'adj.',
          '广泛的；大量的',
          '把名词词尾 -ion 换成 -ive；注意 extensive 不等于 extended。',
        ],
        ['extensively', 'adv.', '广泛地', '先写出形容词 extensive，再加 -ly。'],
      ],
    ],
    [
      'equality',
      '平等；相等',
      [
        ['equality', 'n.', '平等；相等', '这是题面给出的名词。'],
        ['equal', 'v.', '等于；比得上', '从名词 equality 去掉词尾 -ity。'],
        ['equal', 'adj.', '相等的；同等的', '形容词与动词拼写相同，要根据句中位置判断。'],
        ['equally', 'adv.', '相等地；平均地', '在 equal 后加 -ly，拼写中形成双写 ll。'],
      ],
    ],
    [
      'completion',
      '完成；结束',
      [
        ['completion', 'n.', '完成；结束', '这是题面给出的名词。'],
        ['complete', 'v.', '完成', '把名词词尾 -ion 去掉，恢复动词末尾 e。'],
        ['complete', 'adj.', '完整的；全部的', '形容词与动词拼写相同，要根据句法判断。'],
        ['completely', 'adv.', '完全地', '在 complete 后加 -ly，并保留末尾 e。'],
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
  persistNormalisedState();
  var visualState = loadVisualState();
  var visualSection = 'pos';
  var visualRuntime = defaultVisualRuntime();
  var corpusCatalog = null;
  var corpusLoadState = 'idle';
  var corpusLoadError = '';
  var corpusQuery = '';
  var corpusSearchTimer = null;
  var corpusFilters = {
    skill: 'all',
    pos: 'all',
    cefr: 'all',
    image: 'all',
  };
  var corpusVisible = 60;
  var hardWordsCatalog = null;
  var hardWordsLoadState = 'idle';
  var hardWordsLoadError = '';
  var hardWordsQuery = '';
  var hardWordsSearchTimer = null;
  var hardWordsDifficulty = 'all';
  var hardWordsReviewFilter = 'all';
  var hardWordsPracticeFilter = 'all';
  var hardWordsVisible = 60;
  var hardWordPracticeState = loadHardWordPracticeState();
  var hardWordSoundFormState = loadHardWordSoundFormState();
  var hardWordAudioManifest = null;
  var hardWordAudioLoadState = 'idle';
  var hardWordAudioLoadError = '';
  var hardWordMemoryTimer = null;
  var dualPrototypeState = null;
  var dualActionLocked = false;
  var syllableTutorialState = null;
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
  var recordStartedAt = 0;
  var recordRequestPending = false;
  var recordingTechnicalFailure = false;
  var recordingToken = 0;
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
        if (session && button.dataset.viewLink === 'today') {
          leaveSessionToToday();
          return;
        }
        navigate(button.dataset.viewLink);
      });
    });

    document.getElementById('openAudit').addEventListener('click', function () {
      if (settingsDialog.open) settingsDialog.close();
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
    document.addEventListener('visibilitychange', syncTaskActivityVisibility);

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    var recoverDualPrototype = Boolean(history.state && history.state.dualPrototype);
    if (history.replaceState) {
      var initialHistoryState = Object.assign({}, history.state || {});
      delete initialHistoryState.wordlabSession;
      delete initialHistoryState.dualPrototype;
      history.replaceState(
        Object.assign({}, initialHistoryState, {
          wordlabView: recoverDualPrototype ? 'hard-words' : 'today',
        }),
        '',
        location.href,
      );
      window.addEventListener('popstate', function (event) {
        navigate((event.state && event.state.wordlabView) || 'today', { fromPopState: true });
      });
    }
    if (hardWordPracticeState.active) {
      resumeHardWordPractice();
    } else if (hardWordSoundFormState.active || recoverDualPrototype) {
      renderHardWordsCatalog();
    } else {
      renderToday();
    }
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
      version: STATE_VERSION,
      settings: {
        accent: 'uk',
        dailyNew: DAILY_NEW_LIMIT,
        learningGoal: 'balanced',
      },
      daily: {
        date: '',
        newIds: [],
        carryoverIds: [],
        newSelectionDone: false,
        completedAt: 0,
        practicedSeconds: 0,
      },
      words: {},
      history: [],
      journal: [],
      rescue: defaultRescueState(),
      relearn: defaultRelearnState(),
      adaptive: defaultAdaptiveState(),
    };
  }

  function defaultRelearnState() {
    return {
      sequence: 0,
      practiceSeconds: 0,
      queue: [],
    };
  }

  function defaultRescueState() {
    return {
      version: 1,
      round: 1,
      taskIndex: 0,
      tasks: [],
      gates: {},
      contextNotes: {},
    };
  }

  function defaultAdaptiveState() {
    var skillObservations = {};
    MODEL_SKILLS.forEach(function (skill) {
      skillObservations[skill] = 0;
    });
    return {
      version: ADAPTIVE_MODEL_VERSION,
      featureSchemaVersion: ADAPTIVE_FEATURE_SCHEMA_VERSION,
      localOnly: true,
      observations: 0,
      updatedAt: 0,
      weights: Object.assign({}, ADAPTIVE_DEFAULT_WEIGHTS),
      meaningWeights: Object.assign({}, ADAPTIVE_DEFAULT_WEIGHTS),
      skillObservations: skillObservations,
      abilities: {},
      shadow: {
        count: 0,
        ruleBrier: 0,
        modelBrier: 0,
      },
      meaningShadow: {
        count: 0,
        ruleBrier: 0,
        modelBrier: 0,
      },
      eventSeq: 0,
      events: [],
    };
  }

  function visualTaskIds() {
    var ids = [];
    if (VISUAL_LAB.posScene && VISUAL_LAB.posScene.id) ids.push(VISUAL_LAB.posScene.id);
    if (Array.isArray(VISUAL_LAB.familyAtlases)) {
      VISUAL_LAB.familyAtlases.forEach(function (task) {
        if (task && task.id) ids.push(task.id);
      });
    }
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
      version: VISUAL_STATE_VERSION,
      tasks: {},
      history: [],
    };
  }

  function defaultVisualRuntime() {
    return {
      posStep: 0,
      taskSteps: {},
      unlockedTasks: {},
      skippedTasks: {},
      gameMode: 'guess',
      gameIndices: {},
      gameAnswered: {},
      gameReplay: {},
      repairRecorded: {},
    };
  }

  function visualTaskMetadata(taskId) {
    var id = String(taskId || '');
    if (VISUAL_LAB.posScene && VISUAL_LAB.posScene.id === id) {
      return {
        targetWordId: String(VISUAL_LAB.posScene.targetWordId || ''),
        gameType: 'pos',
        repairSkill: VISUAL_REPAIR_SKILLS.pos,
        modelSkill: VISUAL_MODEL_SKILLS.pos,
        optionCount: 0,
      };
    }
    var familyTask = visualFamilyAtlases().find(function (task) {
      return task && task.id === id;
    });
    if (familyTask) {
      return {
        targetWordId: String(familyTask.targetWordId || ''),
        gameType: 'family',
        repairSkill: VISUAL_REPAIR_SKILLS.family,
        modelSkill: VISUAL_MODEL_SKILLS.family,
        optionCount: 0,
      };
    }
    var comparisonTask = Array.isArray(VISUAL_LAB.groups)
      ? VISUAL_LAB.groups.find(function (task) {
          return task && task.id === id;
        })
      : null;
    if (comparisonTask) {
      var relation = comparisonTask.relation === 'antonym' ? 'antonym' : 'synonym';
      return {
        targetWordId: String(comparisonTask.targetWordId || ''),
        gameType: relation,
        repairSkill: VISUAL_REPAIR_SKILLS[relation],
        modelSkill: VISUAL_MODEL_SKILLS[relation],
        optionCount: Array.isArray(comparisonTask.choices) ? comparisonTask.choices.length : 0,
      };
    }
    var gameMetadata = null;
    visualGameModes().some(function (mode) {
      var task =
        mode &&
        Array.isArray(mode.tasks) &&
        mode.tasks.find(function (candidate) {
          return candidate && candidate.id === id;
        });
      if (!task) return false;
      gameMetadata = {
        targetWordId: String(task.targetWordId || ''),
        gameType: String(mode.id || 'game'),
        repairSkill: Object.prototype.hasOwnProperty.call(VISUAL_REPAIR_SKILLS, mode.id)
          ? VISUAL_REPAIR_SKILLS[mode.id]
          : '',
        modelSkill: VISUAL_MODEL_SKILLS[mode.id] || 'meaning',
        optionCount: Array.isArray(task.choices) ? task.choices.length : 0,
      };
      return true;
    });
    return (
      gameMetadata || {
        targetWordId: '',
        gameType: 'unknown',
        repairSkill: '',
        modelSkill: '',
        optionCount: 0,
      }
    );
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
        var mastered = Boolean(task.mastered);
        var expectedTaskVersion = visualTaskVersion(visualTaskMetadata(taskId));
        var allowedPromptIds = visualPromptIds(taskId);
        tasks[taskId] = {
          attempts: Math.max(0, Number(task.attempts) || 0),
          correct: Math.max(0, Number(task.correct) || 0),
          mastered: mastered,
          completed: task.completed === undefined ? mastered : Boolean(task.completed),
          needsReview: Boolean(task.needsReview) && !mastered,
          hadError: Boolean(task.hadError),
          last: Math.max(0, Number(task.last) || 0),
          step: Math.max(0, Number(task.step) || 0),
          skipped: Boolean(task.skipped),
          modelCycle: Math.min(10000, Math.max(0, Math.round(Number(task.modelCycle) || 0))),
          modelRecorded: Array.isArray(task.modelRecorded)
            ? task.modelRecorded
                .filter(function (key) {
                  if (typeof key !== 'string') return false;
                  var parts = key.split('::');
                  return (
                    parts.length === 2 &&
                    parts[0] === expectedTaskVersion &&
                    allowedPromptIds.indexOf(parts[1]) >= 0
                  );
                })
                .slice(-64)
            : [],
        };
      });
    }
    var history = Array.isArray(saved.history)
      ? saved.history
          .filter(function (item) {
            return item && allowedIds.has(String(item.taskId || ''));
          })
          .map(function (item) {
            var taskId = String(item.taskId || '');
            var metadata = visualTaskMetadata(taskId);
            return {
              taskId: taskId,
              targetWordId: metadata.targetWordId || '',
              gameType: metadata.gameType || 'unknown',
              repairSkill: metadata.repairSkill || '',
              modelSkill: metadata.modelSkill || '',
              correct: Boolean(item.correct),
              choice: String(item.choice || '') === 'skip' ? 'skip' : '',
              at: Math.max(0, Number(item.at) || 0),
            };
          })
          .slice(-240)
      : [];
    return {
      version: VISUAL_STATE_VERSION,
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
        completed: false,
        needsReview: false,
        hadError: false,
        last: 0,
        step: 0,
        skipped: false,
        modelCycle: 0,
        modelRecorded: [],
      };
    }
    return visualState.tasks[taskId];
  }

  function visualTaskVersion(metadata) {
    return 'visual-' + String((metadata && metadata.gameType) || 'unknown') + '-v2';
  }

  function visualPromptIds(taskId) {
    var id = String(taskId || '');
    if (VISUAL_LAB.posScene && VISUAL_LAB.posScene.id === id) {
      return (
        Array.isArray(VISUAL_LAB.posScene.questions) ? VISUAL_LAB.posScene.questions : []
      ).map(function (_, index) {
        return 'question-' + index;
      });
    }
    var familyTask = visualFamilyAtlases().find(function (task) {
      return task && task.id === id;
    });
    if (familyTask) {
      return visualFamilyPracticeSlots(familyTask).map(function (_, index) {
        return 'form-' + index;
      });
    }
    var comparisonTask = Array.isArray(VISUAL_LAB.groups)
      ? VISUAL_LAB.groups.find(function (task) {
          return task && task.id === id;
        })
      : null;
    if (comparisonTask) {
      return (Array.isArray(comparisonTask.scenes) ? comparisonTask.scenes : []).map(
        function (_, index) {
          return 'scene-' + index;
        },
      );
    }
    var isSinglePromptGame = visualGameModes().some(function (mode) {
      return Boolean(
        mode &&
        Array.isArray(mode.tasks) &&
        mode.tasks.some(function (task) {
          return task && task.id === id;
        }),
      );
    });
    return isSinglePromptGame ? ['prompt-0'] : [];
  }

  function normaliseVisualPromptId(taskId, promptId) {
    var value = String(promptId || '');
    var allowed = visualPromptIds(taskId);
    return allowed.indexOf(value) >= 0 ? value : '';
  }

  function claimVisualModelEvidence(taskId, taskState, metadata, promptId) {
    if (!Array.isArray(taskState.modelRecorded)) taskState.modelRecorded = [];
    var safePromptId = normaliseVisualPromptId(taskId, promptId);
    if (!safePromptId) {
      return {
        independent: false,
        promptId: 'prompt-0',
        attemptCycle: Number(taskState.modelCycle || 0),
        taskVersion: visualTaskVersion(metadata),
      };
    }
    var taskVersion = visualTaskVersion(metadata);
    var key = taskVersion + '::' + safePromptId;
    if (taskState.modelRecorded.indexOf(key) >= 0) {
      return {
        independent: false,
        promptId: safePromptId,
        attemptCycle: Number(taskState.modelCycle || 0),
        taskVersion: taskVersion,
      };
    }
    taskState.modelRecorded.push(key);
    taskState.modelRecorded = taskState.modelRecorded.slice(-64);
    return {
      independent: true,
      promptId: safePromptId,
      attemptCycle: Number(taskState.modelCycle || 0),
      taskVersion: taskVersion,
    };
  }

  function beginNewVisualModelCycle(taskId) {
    var taskState = getVisualTaskState(taskId);
    taskState.modelCycle = Math.min(10000, Number(taskState.modelCycle || 0) + 1);
    taskState.modelRecorded = [];
  }

  function recordVisualResult(taskId, correct, choice, promptId) {
    var taskState = getVisualTaskState(taskId);
    var metadata = visualTaskMetadata(taskId);
    var now = Date.now();
    var evidence = claimVisualModelEvidence(taskId, taskState, metadata, promptId);
    if (evidence.independent && Number(taskState.modelCycle || 0) > 0) {
      taskState.completed = false;
      taskState.mastered = false;
      taskState.needsReview = false;
    }
    taskState.attempts += 1;
    if (correct) taskState.correct += 1;
    if (!correct) {
      taskState.hadError = true;
      taskState.mastered = false;
      taskState.completed = false;
      taskState.needsReview = true;
    }
    taskState.last = now;
    visualState.history.push({
      taskId: taskId,
      targetWordId: metadata.targetWordId,
      gameType: metadata.gameType,
      repairSkill: metadata.repairSkill,
      modelSkill: metadata.modelSkill,
      correct: Boolean(correct),
      choice: String(choice || '') === 'skip' ? 'skip' : '',
      at: now,
    });
    visualState.history = visualState.history.slice(-240);
    saveVisualState();
    if (evidence.independent) {
      recordVisualAdaptiveResult(metadata, Boolean(correct), choice, now, evidence);
    }
    if (!correct && evidence.independent) bridgeVisualError(taskId, choice, metadata);
    return metadata;
  }

  function bridgeVisualError(taskId, choice, metadata) {
    if (!metadata.targetWordId || SKILLS.indexOf(metadata.repairSkill) < 0) return;
    var word = WORDS.find(function (candidate) {
      return candidate.id === metadata.targetWordId;
    });
    if (!word) return;
    var existingState = state.words[word.id];
    if (
      existingState &&
      existingState.visualRepairPending &&
      existingState.visualRepairPending[metadata.repairSkill]
    ) {
      return;
    }
    visualRuntime.repairRecorded[taskId] = true;
    recordVisualRepairNeed(
      word,
      metadata.repairSkill,
      '图像错因 · ' +
        metadata.gameType +
        (String(choice || '') === 'skip' ? ' · 主动跳过' : ' · 判断错误'),
      taskId,
      metadata.gameType,
    );
  }

  function recordVisualRepairNeed(word, skill, detail, taskId, gameType) {
    var wordState = getWordState(word.id);
    if (!wordState.visualRepairPending || typeof wordState.visualRepairPending !== 'object') {
      wordState.visualRepairPending = {};
    }
    wordState.visualRepairPending[skill] = true;
    var now = Date.now();
    state.history.push({
      wordId: word.id,
      word: word.word,
      skill: skill,
      correct: false,
      detail: detail,
      at: now,
      source: 'visual',
      visualTaskId: String(taskId || ''),
      visualGameType: String(gameType || ''),
      coreAttempt: false,
    });
    state.history = state.history.slice(-240);
    saveState();
  }

  function completeVisualTask(taskId) {
    var taskState = getVisualTaskState(taskId);
    var needsReview = Boolean(taskState.hadError);
    taskState.completed = true;
    taskState.mastered = !needsReview;
    taskState.needsReview = needsReview;
    taskState.hadError = false;
    taskState.last = Date.now();
    return taskState;
  }

  function validateVisualLab(wordIds) {
    var ids = visualTaskIds();
    var safeId = /^[a-z0-9-]+$/;
    var foundationIds = new Set(
      FORM_FOUNDATIONS.map(function (foundation) {
        return foundation.id;
      }),
    );
    if (!VISUAL_LAB.posScene || !Array.isArray(VISUAL_LAB.groups)) {
      console.error('WordLab visual vocabulary data is unavailable.');
      return;
    }
    if (new Set(ids).size !== ids.length) {
      console.error('WordLab visual vocabulary data contains duplicate task IDs.');
    }
    if (
      ids.some(function (taskId) {
        return !safeId.test(String(taskId || ''));
      })
    ) {
      console.error('WordLab visual vocabulary data contains an unsafe task ID.');
    }
    var familyTargets = new Set();
    var familyImages = new Set();
    (Array.isArray(VISUAL_LAB.familyAtlases) ? VISUAL_LAB.familyAtlases : []).forEach(
      function (task) {
        task = task || {};
        var foundation = FORM_FOUNDATIONS.find(function (candidate) {
          return candidate.id === task.targetWordId;
        });
        var slots =
          foundation && foundation.formPractice && Array.isArray(foundation.formPractice.slots)
            ? foundation.formPractice.slots
            : [];
        var panels = Array.isArray(task.panels) ? task.panels : [];
        var panelSlots = panels.map(function (panel) {
          return panel.slot;
        });
        var panelAreas = panels.map(function (panel) {
          return panel.area;
        });
        var expectedAreas = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        var hiddenAnswers = slots
          .filter(function (slot) {
            return !slot.given;
          })
          .map(function (slot) {
            return String(slot.answer || '').toLowerCase();
          });
        var publicCopy = [task.title, task.alt]
          .concat(
            panels.reduce(function (copy, panel) {
              return copy.concat([panel.sceneLabel, panel.prompt]);
            }, []),
          )
          .join(' ')
          .toLowerCase();
        var leaksAnswer = hiddenAnswers.some(function (answer) {
          return answer && new RegExp('\\b' + answer + '\\b').test(publicCopy);
        });
        var requiredCopy = [task && task.title, task && task.alt].concat(
          panels.reduce(function (copy, panel) {
            return copy.concat([panel && panel.sceneLabel, panel && panel.prompt]);
          }, []),
        );
        var hasRequiredCopy = requiredCopy.every(function (copy) {
          return typeof copy === 'string' && copy.trim().length > 0;
        });
        var story = task.story || {};
        var etymology = task.etymology || {};
        var storyValid = [story.title, story.english, story.chinese, story.retellPrompt].every(
          function (copy) {
            return typeof copy === 'string' && copy.trim().length > 0;
          },
        );
        var sources = Array.isArray(etymology.sources) ? etymology.sources : [];
        var etymologyValid =
          ['剧情卡', '来源彩蛋'].indexOf(etymology.level) >= 0 &&
          [etymology.fact, etymology.memoryHook, etymology.modernRule].every(function (copy) {
            return typeof copy === 'string' && copy.trim().length > 0;
          }) &&
          sources.length > 0 &&
          sources.every(function (source) {
            return (
              source &&
              typeof source.label === 'string' &&
              source.label.trim().length > 0 &&
              /^https:\/\/(www\.)?(merriam-webster|oxfordlearnersdictionaries)\.com\//.test(
                String(source.url || ''),
              )
            );
          });
        var duplicateTarget = familyTargets.has(task && task.targetWordId);
        var duplicateImage = familyImages.has(task && task.image);
        if (task && task.targetWordId) familyTargets.add(task.targetWordId);
        if (task && task.image) familyImages.add(task.image);
        if (
          !task.id ||
          !safeId.test(String(task.id)) ||
          !foundationIds.has(task.targetWordId) ||
          duplicateTarget ||
          duplicateImage ||
          !hasRequiredCopy ||
          !storyValid ||
          !etymologyValid ||
          slots.length !== 4 ||
          panels.length !== 4 ||
          new Set(panelSlots).size !== 4 ||
          new Set(panelAreas).size !== 4 ||
          !slots.every(function (slot) {
            return panelSlots.indexOf(slot.key) >= 0;
          }) ||
          !expectedAreas.every(function (area) {
            return panelAreas.indexOf(area) >= 0;
          }) ||
          String(task.image || '').indexOf('./images/semantic-lab/') !== 0 ||
          Number(task.width) !== 1200 ||
          Number(task.height) !== 800 ||
          leaksAnswer
        ) {
          console.error('Invalid visual word-family atlas:', task && task.id);
        }
      },
    );
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
      var modeUsesAudio = mode.tasks.some(function (task) {
        return Boolean(task && task.audioId);
      });
      if (
        modeUsesAudio &&
        (!(typeof mode.audioLabel === 'string' && mode.audioLabel.trim()) ||
          !(typeof mode.audioStatus === 'string' && mode.audioStatus.trim()))
      ) {
        console.error('Visual game audio guidance is missing:', mode.id);
      }
      mode.tasks.forEach(function (task) {
        var hasImage = Boolean(task.image);
        var validIntegratedMeaning =
          mode.id !== 'guess' ||
          (Array.isArray(task.meaningChoices) &&
            task.meaningChoices.length >= 2 &&
            task.meaningChoices.indexOf(task.meaningAnswer) >= 0);
        var validImage =
          !hasImage ||
          (String(task.image).indexOf('./images/semantic-lab/') === 0 &&
            typeof task.alt === 'string' &&
            task.alt.trim().length > 0 &&
            (task.caption === undefined ||
              (typeof task.caption === 'string' && task.caption.trim().length > 0)) &&
            Number(task.width) === 1200 &&
            Number(task.height) > 0 &&
            ['left', 'right', 'all'].indexOf(task.focus) >= 0);
        if (
          !task.id ||
          !wordIds.has(task.targetWordId) ||
          !Array.isArray(task.choices) ||
          task.choices.indexOf(task.answer) < 0 ||
          !validIntegratedMeaning ||
          !validImage
        ) {
          console.error('Invalid visual word game:', task && task.id);
        }
      });
    });
  }

  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return normaliseState(saved);
    } catch (error) {
      console.warn('Could not read saved WordLab progress.', error);
      return defaultState();
    }
  }

  function normaliseState(saved) {
    var base = defaultState();
    if (!saved || typeof saved !== 'object') return base;
    var validWordIds = new Set(
      WORDS.map(function (word) {
        return word.id;
      }),
    );
    var validCoreProgressIds = new Set(validWordIds);
    FORM_FOUNDATIONS.forEach(function (word) {
      validCoreProgressIds.add(word.id);
    });
    var validHistoryIds = new Set(validCoreProgressIds);
    RESCUE_WORDS.forEach(function (word) {
      validHistoryIds.add(word.id);
    });
    var settings = Object.assign({}, base.settings, saved.settings || {});
    settings.dailyNew = normaliseDailyNew(settings.dailyNew);
    settings.learningGoal = normaliseLearningGoal(settings.learningGoal);
    var savedDaily = saved.daily && typeof saved.daily === 'object' ? saved.daily : base.daily;
    var words =
      saved.words && typeof saved.words === 'object' && !Array.isArray(saved.words)
        ? Object.assign({}, saved.words)
        : {};
    Object.keys(words).forEach(function (wordId) {
      if (!validCoreProgressIds.has(wordId)) delete words[wordId];
    });
    var allNewIds = normaliseDailyIds(savedDaily.newIds, validWordIds);
    var newIds = allNewIds.slice(0, DAILY_NEW_LIMIT);
    var overflowCarryoverIds = allNewIds.slice(DAILY_NEW_LIMIT).filter(function (id) {
      return savedWordHasActivity(words, id) && savedWordHasUnattemptedSkill(words, id);
    });
    var carryoverIds = normaliseDailyIds(
      (Array.isArray(savedDaily.carryoverIds) ? savedDaily.carryoverIds : []).concat(
        overflowCarryoverIds,
      ),
      validWordIds,
    ).filter(function (id) {
      return newIds.indexOf(id) < 0;
    });
    var history = Array.isArray(saved.history)
      ? saved.history
          .filter(function (item) {
            if (!item || !validHistoryIds.has(item.wordId)) return false;
            var rescueWord = findRescueWord(item.wordId);
            if (rescueWord) {
              return (
                item.coreAttempt === false &&
                rescueGatesForWord(rescueWord).indexOf(String(item.skill || '')) >= 0
              );
            }
            if (isRescueGate(String(item.skill || ''))) return false;
            var foundation = FORM_FOUNDATIONS.some(function (word) {
              return word.id === item.wordId;
            });
            return foundation ? item.skill === 'forms' : SKILLS.indexOf(item.skill) >= 0;
          })
          .map(function (item) {
            var rescueWord = findRescueWord(item.wordId);
            var pendingContext =
              rescueWord &&
              item.skill === 'meaningRecall' &&
              rescueWord.senseStatus === 'pending_context' &&
              rescueWord.meaningTask &&
              rescueWord.meaningTask.masteryEligible === false;
            if (!pendingContext) return item;
            return Object.assign({}, item, {
              correct: null,
              coreAttempt: false,
              detail: '原句语境待确认；不计掌握',
              rescue: Object.assign({}, item.rescue || {}, { pendingContext: true }),
            });
          })
          .slice(-240)
      : [];
    history = normaliseLegacyVisualHistory(history);
    var journal = Array.isArray(saved.journal)
      ? saved.journal
          .filter(function (item) {
            return item && validWordIds.has(item.wordId);
          })
          .slice(-120)
      : [];
    if (Number(saved.version || 1) < 3) {
      archiveLegacySentenceEvidence(words);
      history = history.map(function (item) {
        if (!item || item.skill !== 'sentence') return item;
        return Object.assign({}, item, {
          correct: null,
          legacyUnverified: true,
          detail: '旧版句子自评记录（未作语言正确性证据）',
        });
      });
      journal = journal.map(function (item) {
        return Object.assign({}, item, {
          status: 'legacy_unverified',
          teacherVerified: false,
        });
      });
    }
    if (Number(saved.version || 1) < STATE_VERSION) {
      migrateLegacyVisualRepairFlags(words, history);
    } else {
      normaliseCurrentVisualRepairFlags(words);
    }
    normaliseSkillReviewFlags(words, history);
    var rescue = normaliseRescueState(saved.rescue);
    return {
      version: STATE_VERSION,
      settings: settings,
      daily: {
        date: String(savedDaily.date || ''),
        newIds: newIds,
        carryoverIds: carryoverIds,
        newSelectionDone:
          typeof savedDaily.newSelectionDone === 'boolean'
            ? savedDaily.newSelectionDone &&
              (newIds.length > 0 ||
                settings.dailyNew === 0 ||
                Number(savedDaily.completedAt || 0) > 0)
            : newIds.length > 0,
        completedAt: Math.max(0, Number(savedDaily.completedAt || 0)),
        practicedSeconds: Math.min(
          DAILY_MAX_SECONDS,
          Math.round(normaliseNonnegativeNumber(savedDaily.practicedSeconds)),
        ),
      },
      words: words,
      history: history,
      journal: journal,
      rescue: rescue,
      relearn: normaliseRelearnState(saved.relearn, words, rescue),
      adaptive: normaliseAdaptiveState(saved.adaptive),
    };
  }

  function persistNormalisedState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // The in-memory fail-closed state remains authoritative for this visit.
    }
  }

  function normaliseRescueState(saved) {
    var base = defaultRescueState();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;
    var validIds = new Set(
      RESCUE_WORDS.map(function (word) {
        return word.id;
      }),
    );
    var validGates = new Set(Object.keys(RESCUE_GATE_SECONDS));
    var gates = saved.gates && typeof saved.gates === 'object' ? saved.gates : {};
    var contextNotes =
      saved.contextNotes &&
      typeof saved.contextNotes === 'object' &&
      !Array.isArray(saved.contextNotes)
        ? saved.contextNotes
        : {};
    Object.keys(gates)
      .slice(0, 80)
      .forEach(function (key) {
        var parts = key.split('::');
        var gate = parts.pop();
        var wordId = parts.join('::');
        var value = gates[key];
        var rescueWord = findRescueWord(wordId);
        if (
          !validIds.has(wordId) ||
          !validGates.has(gate) ||
          !rescueWord ||
          rescueGatesForWord(rescueWord).indexOf(gate) < 0 ||
          !value ||
          typeof value !== 'object'
        ) {
          return;
        }
        var attempts = Math.min(1000, Math.round(normaliseNonnegativeNumber(value.attempts)));
        var pendingContext =
          attempts > 0 &&
          gate === 'meaningRecall' &&
          rescueWord.senseStatus === 'pending_context' &&
          rescueWord.meaningTask &&
          rescueWord.meaningTask.masteryEligible === false;
        base.gates[key] = {
          attempts: attempts,
          correct: pendingContext
            ? 0
            : Math.min(attempts, Math.round(normaliseNonnegativeNumber(value.correct))),
          last: normaliseNonnegativeNumber(value.last),
          needsReview: pendingContext ? false : Boolean(value.needsReview),
          pendingContext: pendingContext,
          skipCount: Math.min(1000, Math.round(normaliseNonnegativeNumber(value.skipCount))),
        };
      });
    base.round = Math.max(1, Math.min(2, Math.round(normaliseNonnegativeNumber(saved.round)) || 1));
    base.taskIndex = Math.min(200, Math.round(normaliseNonnegativeNumber(saved.taskIndex)));
    base.tasks = Array.isArray(saved.tasks)
      ? saved.tasks
          .filter(function (task) {
            var rescueWord = task && findRescueWord(String(task.wordId || ''));
            return (
              task &&
              validIds.has(String(task.wordId || '')) &&
              validGates.has(String(task.gate || '')) &&
              rescueWord &&
              rescueGatesForWord(rescueWord).indexOf(String(task.gate || '')) >= 0
            );
          })
          .slice(0, 40)
          .map(function (task) {
            return {
              wordId: String(task.wordId),
              gate: String(task.gate),
              variant: Math.max(
                0,
                Math.min(2, Math.round(normaliseNonnegativeNumber(task.variant))),
              ),
              attemptCycle: Math.max(
                0,
                Math.min(1, Math.round(normaliseNonnegativeNumber(task.attemptCycle))),
              ),
              relearnKey: String(task.relearnKey || ''),
            };
          })
      : [];
    if (base.taskIndex > base.tasks.length) base.taskIndex = 0;
    Object.keys(contextNotes)
      .slice(0, 24)
      .forEach(function (wordId) {
        if (!validIds.has(wordId)) return;
        base.contextNotes[wordId] = String(contextNotes[wordId] || '')
          .trim()
          .slice(0, 500);
      });
    return base;
  }

  function normaliseRelearnState(saved, words, rescue) {
    var base = defaultRelearnState();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;
    base.sequence = Math.min(1000000000, Math.round(normaliseNonnegativeNumber(saved.sequence)));
    base.practiceSeconds = Math.min(
      1000000000,
      Math.round(normaliseNonnegativeNumber(saved.practiceSeconds)),
    );
    if (!Array.isArray(saved.queue)) return base;
    var seen = new Set();
    var recoveryNow = Date.now();
    base.queue = saved.queue
      .filter(function (entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
        var wordId = String(entry.wordId || '');
        var skill = String(entry.skill || '');
        if (String(entry.key || '').indexOf('rescue::') === 0) {
          var rescueParts = String(entry.key).split('::');
          if (rescueParts.length === 3) {
            wordId = rescueParts[1];
            skill = rescueParts[2];
          }
        }
        var key = isRescueGate(skill) ? rescueKey(wordId, skill) : wordId + '::' + skill;
        var scheduledAt = entry.scheduledAt;
        var scheduledSequence = entry.scheduledSequence;
        var scheduledPracticeSeconds = entry.scheduledPracticeSeconds;
        var notBeforeAt = entry.notBeforeAt;
        var notBeforeSequence = entry.notBeforeSequence;
        var notBeforePracticeSeconds = entry.notBeforePracticeSeconds;
        var rescueGate = isRescueGate(skill);
        var rescueWord = rescueGate ? findRescueWord(wordId) : null;
        var coreWord = rescueGate
          ? rescueWord
          : findWord(wordId) ||
            FORM_FOUNDATIONS.find(function (word) {
              return word.id === wordId;
            });
        var rescueState =
          rescueGate && rescue && rescue.gates
            ? rescue.gates[rescueStateKey(wordId, skill)] || null
            : null;
        var skillState =
          words[wordId] && words[wordId].skills && words[wordId].skills[skill]
            ? words[wordId].skills[skill]
            : null;
        if (
          seen.has(key) ||
          !coreWord ||
          (SKILLS.indexOf(skill) < 0 && !rescueGate) ||
          (coreWord.isFoundation && skill !== 'forms') ||
          (rescueGate && (!rescueWord || rescueGatesForWord(rescueWord).indexOf(skill) < 0)) ||
          (!rescueGate &&
            (!skillState || !skillState.needsReview || Number(skillState.pending || 0) > 0)) ||
          (rescueGate && (!rescueState || !rescueState.needsReview))
        ) {
          return false;
        }
        var validThresholds =
          entry.key === key &&
          isExactNonnegativeInteger(scheduledAt) &&
          isExactNonnegativeInteger(scheduledSequence) &&
          isExactNonnegativeInteger(scheduledPracticeSeconds) &&
          isExactNonnegativeInteger(notBeforeAt) &&
          isExactNonnegativeInteger(notBeforeSequence) &&
          isExactNonnegativeInteger(notBeforePracticeSeconds) &&
          notBeforeAt === scheduledAt + RELEARN_TARGET_DELAY_MS &&
          notBeforeSequence === scheduledSequence + RELEARN_MIN_OTHER_TASKS &&
          notBeforePracticeSeconds === scheduledPracticeSeconds + RELEARN_TARGET_PRACTICE_SECONDS &&
          scheduledSequence <= base.sequence &&
          scheduledPracticeSeconds <= base.practiceSeconds;
        if (!validThresholds) {
          entry.key = key;
          entry.scheduledAt = recoveryNow;
          entry.scheduledSequence = base.sequence;
          entry.scheduledPracticeSeconds = base.practiceSeconds;
          entry.notBeforeAt = recoveryNow + RELEARN_TARGET_DELAY_MS;
          entry.notBeforeSequence = base.sequence + RELEARN_MIN_OTHER_TASKS;
          entry.notBeforePracticeSeconds = base.practiceSeconds + RELEARN_TARGET_PRACTICE_SECONDS;
        }
        seen.add(key);
        return true;
      })
      .slice(-RELEARN_MAX_QUEUE)
      .map(function (entry) {
        var mappedWordId = String(entry.wordId || '');
        var mappedSkill = String(entry.skill || '');
        if (String(entry.key || '').indexOf('rescue::') === 0) {
          var mappedParts = String(entry.key).split('::');
          if (mappedParts.length === 3) {
            mappedWordId = mappedParts[1];
            mappedSkill = mappedParts[2];
          }
        }
        return {
          key: isRescueGate(mappedSkill)
            ? rescueKey(mappedWordId, mappedSkill)
            : mappedWordId + '::' + mappedSkill,
          wordId: mappedWordId,
          skill: mappedSkill,
          scheduledAt: entry.scheduledAt,
          scheduledSequence: entry.scheduledSequence,
          scheduledPracticeSeconds: entry.scheduledPracticeSeconds,
          notBeforeAt: entry.notBeforeAt,
          notBeforeSequence: entry.notBeforeSequence,
          notBeforePracticeSeconds: entry.notBeforePracticeSeconds,
          variant: isRescueGate(mappedSkill)
            ? Math.max(0, Math.min(2, Math.round(normaliseNonnegativeNumber(entry.variant))))
            : ['context', 'direct', 'family'].indexOf(entry.variant) >= 0
              ? entry.variant
              : '',
        };
      });
    return base;
  }

  function isExactNonnegativeInteger(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value % 1 === 0;
  }

  function normaliseAdaptiveState(saved) {
    var base = defaultAdaptiveState();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;
    var savedVersion = Number(saved.version);
    if (savedVersion !== 1 && savedVersion !== ADAPTIVE_MODEL_VERSION) return base;
    if (
      savedVersion === ADAPTIVE_MODEL_VERSION &&
      Number(saved.featureSchemaVersion) !== ADAPTIVE_FEATURE_SCHEMA_VERSION
    ) {
      return base;
    }
    base.weights = normaliseAdaptiveWeights(saved.weights);
    base.observations = Math.min(
      1000000,
      Math.round(normaliseNonnegativeNumber(saved.observations)),
    );
    base.updatedAt = normaliseNonnegativeNumber(saved.updatedAt);
    if (savedVersion === ADAPTIVE_MODEL_VERSION) {
      var savedSkillObservations =
        saved.skillObservations &&
        typeof saved.skillObservations === 'object' &&
        !Array.isArray(saved.skillObservations)
          ? saved.skillObservations
          : {};
      MODEL_SKILLS.forEach(function (skill) {
        base.skillObservations[skill] = Math.min(
          base.observations,
          Math.round(normaliseNonnegativeNumber(savedSkillObservations[skill])),
        );
      });
      base.meaningWeights = normaliseAdaptiveWeights(saved.meaningWeights);
      base.abilities = normaliseAdaptiveAbilities(saved.abilities);
      var coreObservations = Math.min(
        base.observations,
        SKILLS.reduce(function (total, skill) {
          return total + Number(base.skillObservations[skill] || 0);
        }, 0),
      );
      base.shadow = normaliseAdaptiveShadow(saved.shadow, coreObservations);
      base.meaningShadow = normaliseAdaptiveShadow(
        saved.meaningShadow,
        Number(base.skillObservations.meaning || 0),
      );
      base.eventSeq = Math.min(1000000000, Math.round(normaliseNonnegativeNumber(saved.eventSeq)));
      base.events = normaliseAdaptiveEvents(saved.events);
      if (base.events.length) {
        base.eventSeq = Math.max(
          base.eventSeq,
          base.events.reduce(function (maximum, event) {
            return Math.max(maximum, Number(event.sequence || 0));
          }, 0),
        );
      }
    }
    return base;
  }

  function normaliseAdaptiveWeights(value) {
    var savedWeights = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var weights = {};
    ADAPTIVE_WEIGHT_KEYS.forEach(function (key) {
      var rawValue = savedWeights[key];
      var number = Number(rawValue);
      var normalised =
        typeof rawValue === 'number' && Number.isFinite(number)
          ? number
          : ADAPTIVE_DEFAULT_WEIGHTS[key];
      weights[key] = constrainAdaptiveWeight(key, normalised);
    });
    return weights;
  }

  function normaliseAdaptiveShadow(value, maximumCount) {
    var saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var hasValidLoss =
      typeof saved.ruleBrier === 'number' &&
      Number.isFinite(saved.ruleBrier) &&
      typeof saved.modelBrier === 'number' &&
      Number.isFinite(saved.modelBrier);
    return {
      count: hasValidLoss
        ? Math.min(Math.max(0, Number(maximumCount) || 0), normaliseNonnegativeNumber(saved.count))
        : 0,
      ruleBrier: normaliseProbability(saved.ruleBrier),
      modelBrier: normaliseProbability(saved.modelBrier),
    };
  }

  function normaliseAdaptiveAbilities(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    var abilities = {};
    Object.keys(value)
      .slice(0, 4000)
      .forEach(function (key) {
        var parts = key.split('::');
        var skill = parts.pop();
        var wordId = parts.join('::');
        var ability = value[key];
        if (
          !isKnownAdaptiveWordId(wordId) ||
          MODEL_SKILLS.indexOf(skill) < 0 ||
          !ability ||
          typeof ability !== 'object' ||
          Array.isArray(ability)
        ) {
          return;
        }
        var attempts = Math.min(1000000, normaliseNonnegativeNumber(ability.attempts));
        abilities[wordId + '::' + skill] = {
          attempts: attempts,
          correct: Math.min(attempts, normaliseNonnegativeNumber(ability.correct)),
          level: Math.min(
            5,
            attempts,
            normaliseNonnegativeNumber(ability.correct),
            normaliseNonnegativeNumber(ability.level),
          ),
          last: normaliseNonnegativeNumber(ability.last),
          lastResponseMs: Math.min(
            20 * 60 * 1000,
            normaliseNonnegativeNumber(ability.lastResponseMs),
          ),
          hintUses: Math.round(normaliseNonnegativeNumber(ability.hintUses)),
          replayUses: Math.round(normaliseNonnegativeNumber(ability.replayUses)),
          skipCount: Math.round(normaliseNonnegativeNumber(ability.skipCount)),
          mastery: normaliseProbability(ability.mastery),
          lastPredictedRecall: normaliseProbability(ability.lastPredictedRecall),
          needsReview: Boolean(ability.needsReview),
        };
      });
    return abilities;
  }

  function normaliseAdaptiveEvents(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(function (event) {
        return (
          event &&
          typeof event === 'object' &&
          MODEL_SKILLS.indexOf(event.skill) >= 0 &&
          typeof event.wordId === 'string' &&
          isKnownAdaptiveWordId(event.wordId) &&
          isAllowedAdaptiveTaskVersion(event.taskVersion) &&
          [
            'controlled_first_attempt',
            'controlled_delayed_retest',
            'controlled_visual_first_attempt',
          ].indexOf(event.labelSource) >= 0 &&
          ((event.labelSource === 'controlled_first_attempt' &&
            Number(event.attemptCycle || 0) === 0) ||
            (event.labelSource === 'controlled_delayed_retest' &&
              Number(event.attemptCycle) === 1) ||
            event.labelSource === 'controlled_visual_first_attempt') &&
          (event.label === 0 || event.label === 1) &&
          Boolean(normaliseImportedAdaptivePromptId(event))
        );
      })
      .map(function (event) {
        return {
          id: 'local-' + Math.round(normaliseNonnegativeNumber(event.sequence)),
          sequence: Math.round(normaliseNonnegativeNumber(event.sequence)),
          at: normaliseNonnegativeNumber(event.at),
          wordId: String(event.wordId || ''),
          skill: event.skill,
          taskVersion: String(event.taskVersion),
          label: event.label === 1 ? 1 : 0,
          labelSource: String(event.labelSource),
          independent: event.independent !== false,
          optionCount: Math.max(0, Math.round(normaliseNonnegativeNumber(event.optionCount))),
          evidenceWeight: normaliseProbability(event.evidenceWeight || 1),
          hintLevel: Math.max(0, Math.round(normaliseNonnegativeNumber(event.hintLevel))),
          replayCount: Math.max(0, Math.round(normaliseNonnegativeNumber(event.replayCount))),
          activeResponseMs: Math.min(
            20 * 60 * 1000,
            Math.round(normaliseNonnegativeNumber(event.activeResponseMs)),
          ),
          predictedRuleBefore: normaliseProbability(event.predictedRuleBefore),
          predictedModelBefore: normaliseProbability(event.predictedModelBefore),
          promptId: normaliseImportedAdaptivePromptId(event),
          attemptCycle: Math.min(10000, Math.round(normaliseNonnegativeNumber(event.attemptCycle))),
        };
      })
      .slice(-160);
  }

  function isAllowedAdaptiveTaskVersion(value) {
    return (
      /^(sound|spell|forms|sentence)-controlled-v2$/.test(String(value || '')) ||
      /^visual-(pos|family|synonym|antonym|guess|homophone|homograph|analogy|taxonomy|collocation)-v2$/.test(
        String(value || ''),
      )
    );
  }

  function normaliseImportedAdaptivePromptId(event) {
    if (!event || typeof event !== 'object') return '';
    var taskVersion = String(event.taskVersion || '');
    var rawPromptId = typeof event.promptId === 'string' ? event.promptId : '';
    var coreMatch = /^(sound|spell|forms|sentence)-controlled-v2$/.exec(taskVersion);
    if (coreMatch) {
      var isOrdinaryWord = WORDS.some(function (word) {
        return word.id === event.wordId;
      });
      var isFormFoundation = FORM_FOUNDATIONS.some(function (word) {
        return word.id === event.wordId;
      });
      if (
        ['controlled_first_attempt', 'controlled_delayed_retest'].indexOf(event.labelSource) < 0 ||
        (event.labelSource === 'controlled_first_attempt' &&
          Number(event.attemptCycle || 0) !== 0) ||
        (event.labelSource === 'controlled_delayed_retest' && Number(event.attemptCycle) !== 1) ||
        event.skill !== coreMatch[1] ||
        (!isOrdinaryWord && !(isFormFoundation && coreMatch[1] === 'forms')) ||
        (rawPromptId && rawPromptId !== 'core')
      ) {
        return '';
      }
      return 'core';
    }
    if (event.labelSource !== 'controlled_visual_first_attempt') return '';
    var matchingTasks = visualTaskIds().filter(function (taskId) {
      var metadata = visualTaskMetadata(taskId);
      return (
        metadata.targetWordId === event.wordId &&
        metadata.modelSkill === event.skill &&
        visualTaskVersion(metadata) === taskVersion
      );
    });
    if (!matchingTasks.length) return '';
    if (rawPromptId) {
      return matchingTasks.some(function (taskId) {
        return visualPromptIds(taskId).indexOf(rawPromptId) >= 0;
      })
        ? rawPromptId
        : '';
    }
    var defaults = new Set();
    matchingTasks.forEach(function (taskId) {
      visualPromptIds(taskId).forEach(function (promptId) {
        defaults.add(promptId);
      });
    });
    return defaults.size === 1 ? Array.from(defaults)[0] : '';
  }

  function normaliseGeneratedAdaptivePromptId(taskVersion, promptId) {
    var version = String(taskVersion || '');
    var value = String(promptId || '');
    if (/^(sound|spell|forms|sentence)-controlled-v2$/.test(version)) return 'core';
    if (version === 'visual-pos-v2') {
      return /^question-(0|[1-9][0-9]?)$/.test(value) ? value : 'question-0';
    }
    if (version === 'visual-family-v2') {
      return /^form-(0|[1-9][0-9]?)$/.test(value) ? value : 'form-0';
    }
    if (/^visual-(synonym|antonym)-v2$/.test(version)) {
      return /^scene-(0|[1-9][0-9]?)$/.test(value) ? value : 'scene-0';
    }
    if (/^visual-(guess|homophone|homograph|analogy|taxonomy|collocation)-v2$/.test(version)) {
      return 'prompt-0';
    }
    return 'core';
  }

  function archiveLegacySentenceEvidence(words) {
    Object.keys(words).forEach(function (wordId) {
      var wordState = words[wordId];
      if (!wordState || !wordState.skills || !wordState.skills.sentence) return;
      wordState.legacySentencePractice = Object.assign({}, wordState.skills.sentence);
      wordState.skills.sentence = {
        attempts: 0,
        correct: 0,
        pending: 0,
        level: 0,
        due: 0,
        last: 0,
        lastResponseMs: 0,
        hintUses: 0,
        replayUses: 0,
        skipCount: 0,
        mastery: 0,
        lastPredictedRecall: 0,
        lastIntervalDays: 0,
        needsReview: true,
        relearnRequired: true,
      };
    });
  }

  function isMeaningOnlyVisualHistory(item) {
    var gameType = String((item && item.visualGameType) || '');
    return Boolean(
      item &&
      item.source === 'visual' &&
      item.coreAttempt === false &&
      VISUAL_MODEL_SKILLS[gameType] === 'meaning' &&
      SKILLS.indexOf(VISUAL_REPAIR_SKILLS[gameType]) < 0,
    );
  }

  function normaliseLegacyVisualHistory(history) {
    return history.map(function (item) {
      if (!isMeaningOnlyVisualHistory(item) || item.skill === 'meaning') return item;
      return Object.assign({}, item, {
        skill: 'meaning',
        legacySkill: String(item.skill || ''),
        migration: 'v4-visual-meaning',
      });
    });
  }

  function migrateLegacyVisualRepairFlags(words, history) {
    var supportedRepairs = new Set();
    history.forEach(function (item) {
      if (!item || item.coreAttempt !== false || item.source !== 'visual') return;
      var currentSkill = VISUAL_REPAIR_SKILLS[String(item.visualGameType || '')];
      if (SKILLS.indexOf(currentSkill) >= 0) {
        supportedRepairs.add(String(item.wordId || '') + '::' + currentSkill);
      }
    });
    Object.keys(words).forEach(function (wordId) {
      var wordState = words[wordId];
      if (!wordState || !wordState.visualRepairPending) return;
      var migrated = {};
      SKILLS.forEach(function (skill) {
        if (wordState.visualRepairPending[skill] && supportedRepairs.has(wordId + '::' + skill)) {
          migrated[skill] = true;
        }
      });
      if (Object.keys(migrated).length) wordState.visualRepairPending = migrated;
      else delete wordState.visualRepairPending;
    });
  }

  function normaliseCurrentVisualRepairFlags(words) {
    Object.keys(words).forEach(function (wordId) {
      var wordState = words[wordId];
      if (
        !wordState ||
        !wordState.visualRepairPending ||
        typeof wordState.visualRepairPending !== 'object' ||
        Array.isArray(wordState.visualRepairPending)
      ) {
        if (wordState) delete wordState.visualRepairPending;
        return;
      }
      var pending = {};
      SKILLS.forEach(function (skill) {
        if (wordState.visualRepairPending[skill]) pending[skill] = true;
      });
      if (Object.keys(pending).length) wordState.visualRepairPending = pending;
      else delete wordState.visualRepairPending;
    });
  }

  function savedWordHasActivity(words, wordId) {
    var wordState = words[wordId];
    if (!wordState || !wordState.skills) return false;
    return SKILLS.some(function (skill) {
      var skillState = wordState.skills[skill] || {};
      return Number(skillState.attempts || 0) > 0 || Number(skillState.pending || 0) > 0;
    });
  }

  function savedWordHasUnattemptedSkill(words, wordId) {
    var wordState = words[wordId];
    if (!wordState || !wordState.skills) return true;
    return SKILLS.some(function (skill) {
      var skillState = wordState.skills[skill] || {};
      return Number(skillState.attempts || 0) === 0 && Number(skillState.pending || 0) === 0;
    });
  }

  function normaliseDailyNew(value) {
    if (value === null || value === undefined || String(value).trim() === '') {
      return DAILY_NEW_LIMIT;
    }
    var parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return DAILY_NEW_LIMIT;
    return Math.max(0, Math.min(DAILY_NEW_LIMIT, parsed));
  }

  function normaliseLearningGoal(value) {
    return Object.prototype.hasOwnProperty.call(LEARNING_GOALS, value) ? value : 'balanced';
  }

  function isKnownAdaptiveWordId(wordId) {
    return (
      WORDS.some(function (word) {
        return word.id === wordId;
      }) ||
      FORM_FOUNDATIONS.some(function (word) {
        return word.id === wordId;
      }) ||
      RESCUE_WORDS.some(function (word) {
        return word.id === wordId;
      })
    );
  }

  function normaliseDailyIds(value, validWordIds) {
    if (!Array.isArray(value)) return [];
    var seen = new Set();
    return value.filter(function (id) {
      if (!validWordIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function normaliseSkillReviewFlags(words, history) {
    var latestResults = {};
    history.forEach(function (item) {
      if (!item || SKILLS.indexOf(item.skill) < 0 || !item.wordId || item.coreAttempt === false)
        return;
      var key = item.wordId + '::' + item.skill;
      if (!latestResults[key] || Number(item.at || 0) >= Number(latestResults[key].at || 0)) {
        latestResults[key] = item;
      }
    });
    Object.keys(words).forEach(function (wordId) {
      var wordState = words[wordId];
      if (!wordState || typeof wordState !== 'object') return;
      if (!wordState.skills || typeof wordState.skills !== 'object') {
        wordState.skills = {};
        return;
      }
      Object.keys(wordState.skills).forEach(function (skill) {
        if (SKILLS.indexOf(skill) < 0) delete wordState.skills[skill];
      });
      SKILLS.forEach(function (skill) {
        var skillState = wordState.skills[skill];
        if (!skillState || typeof skillState !== 'object' || Array.isArray(skillState)) {
          delete wordState.skills[skill];
          return;
        }
        skillState.attempts = normaliseNonnegativeNumber(skillState.attempts);
        skillState.correct = Math.min(
          skillState.attempts,
          normaliseNonnegativeNumber(skillState.correct),
        );
        skillState.pending = normaliseNonnegativeNumber(skillState.pending);
        skillState.level = Math.min(
          5,
          skillState.attempts,
          skillState.correct,
          normaliseNonnegativeNumber(skillState.level),
        );
        skillState.due = normaliseNonnegativeNumber(skillState.due);
        skillState.last = normaliseNonnegativeNumber(skillState.last);
        skillState.lastResponseMs = Math.min(
          20 * 60 * 1000,
          normaliseNonnegativeNumber(skillState.lastResponseMs),
        );
        skillState.hintUses = Math.round(normaliseNonnegativeNumber(skillState.hintUses));
        skillState.replayUses = Math.round(normaliseNonnegativeNumber(skillState.replayUses));
        skillState.skipCount = Math.round(normaliseNonnegativeNumber(skillState.skipCount));
        skillState.mastery = normaliseProbability(skillState.mastery);
        skillState.lastPredictedRecall = normaliseProbability(skillState.lastPredictedRecall);
        skillState.lastIntervalDays = Math.min(
          60,
          Math.round(normaliseNonnegativeNumber(skillState.lastIntervalDays)),
        );
        skillState.relearnRequired = Boolean(skillState.relearnRequired);
        var latest = latestResults[wordId + '::' + skill];
        skillState.needsReview = skillState.relearnRequired
          ? true
          : latest
            ? latest.correct !== true
            : Boolean(skillState.needsReview);
      });
    });
  }

  function normaliseNonnegativeNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  function normaliseProbability(value) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
  }

  function constrainAdaptiveWeight(key, value) {
    var bounded = Math.max(-6, Math.min(6, Number(value) || 0));
    if (ADAPTIVE_NONPOSITIVE_WEIGHTS.indexOf(key) >= 0) return Math.min(0, bounded);
    if (ADAPTIVE_NONNEGATIVE_WEIGHTS.indexOf(key) >= 0) return Math.max(0, bounded);
    return bounded;
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
        pending: 0,
        level: 0,
        due: 0,
        last: 0,
        lastResponseMs: 0,
        hintUses: 0,
        replayUses: 0,
        skipCount: 0,
        mastery: 0,
        lastPredictedRecall: 0,
        lastIntervalDays: 0,
        needsReview: false,
        relearnRequired: false,
      };
    }
    return wordState.skills[skill];
  }

  function peekSkillState(wordId, skill) {
    var wordState = state.words[wordId];
    if (!wordState || !wordState.skills || !wordState.skills[skill]) {
      return {
        attempts: 0,
        correct: 0,
        pending: 0,
        level: 0,
        due: 0,
        last: 0,
        lastResponseMs: 0,
        hintUses: 0,
        replayUses: 0,
        skipCount: 0,
        mastery: 0,
        lastPredictedRecall: 0,
        lastIntervalDays: 0,
        needsReview: false,
        relearnRequired: false,
      };
    }
    return wordState.skills[skill];
  }

  function getAdaptiveAbility(wordId, skill) {
    if (!state.adaptive) state.adaptive = defaultAdaptiveState();
    if (!state.adaptive.abilities || typeof state.adaptive.abilities !== 'object') {
      state.adaptive.abilities = {};
    }
    var key = wordId + '::' + skill;
    if (!state.adaptive.abilities[key]) {
      state.adaptive.abilities[key] = {
        attempts: 0,
        correct: 0,
        level: 0,
        last: 0,
        lastResponseMs: 0,
        hintUses: 0,
        replayUses: 0,
        skipCount: 0,
        mastery: 0,
        lastPredictedRecall: 0,
        needsReview: false,
      };
    }
    return state.adaptive.abilities[key];
  }

  function getRelearnState() {
    if (!state.relearn || typeof state.relearn !== 'object') {
      state.relearn = defaultRelearnState();
    }
    if (!Array.isArray(state.relearn.queue)) state.relearn.queue = [];
    return state.relearn;
  }

  function isRescueGate(gate) {
    return Object.prototype.hasOwnProperty.call(RESCUE_GATE_SECONDS, gate);
  }

  function rescueKey(wordId, gate) {
    return 'rescue::' + String(wordId || '') + '::' + String(gate || '');
  }

  function rescueStateKey(wordId, gate) {
    return String(wordId || '') + '::' + String(gate || '');
  }

  function getRescueState() {
    if (!state.rescue || typeof state.rescue !== 'object') state.rescue = defaultRescueState();
    if (!state.rescue.gates || typeof state.rescue.gates !== 'object') state.rescue.gates = {};
    if (!state.rescue.contextNotes || typeof state.rescue.contextNotes !== 'object') {
      state.rescue.contextNotes = {};
    }
    if (!Array.isArray(state.rescue.tasks)) state.rescue.tasks = [];
    return state.rescue;
  }

  function getRescueGateState(wordId, gate) {
    var rescue = getRescueState();
    var key = rescueStateKey(wordId, gate);
    if (!rescue.gates[key]) {
      rescue.gates[key] = {
        attempts: 0,
        correct: 0,
        last: 0,
        needsReview: false,
        pendingContext: false,
        skipCount: 0,
      };
    }
    return rescue.gates[key];
  }

  function peekRescueGateState(wordId, gate) {
    var rescue = state.rescue;
    return rescue && rescue.gates ? rescue.gates[rescueStateKey(wordId, gate)] || null : null;
  }

  function relearnKey(wordId, skill) {
    if (isRescueGate(skill)) return rescueKey(wordId, skill);
    return String(wordId || '') + '::' + String(skill || '');
  }

  function findPendingRelearn(wordId, skill) {
    var key = relearnKey(wordId, skill);
    return (
      getRelearnState().queue.find(function (entry) {
        return entry && entry.key === key;
      }) || null
    );
  }

  function currentRelearnKey() {
    if (!session) return '';
    var stage = currentStage();
    if (stage && stage.relearnKey) return String(stage.relearnKey);
    var word = currentWord();
    return word && word.relearnKey ? String(word.relearnKey) : '';
  }

  function isRelearnReady(entry, now) {
    if (!entry) return false;
    var relearn = getRelearnState();
    var enoughTasks = Number(relearn.sequence || 0) >= Number(entry.notBeforeSequence || 0);
    var enoughSpacing =
      Number(relearn.practiceSeconds || 0) >= Number(entry.notBeforePracticeSeconds || 0) ||
      Number(now || Date.now()) >= Number(entry.notBeforeAt || 0);
    return enoughTasks && enoughSpacing;
  }

  function consumePendingRelearn(wordId, skill) {
    var relearn = getRelearnState();
    var key = relearnKey(wordId, skill);
    var entry = findPendingRelearn(wordId, skill);
    var automaticAttempt = Boolean(entry && currentRelearnKey() === key);
    if (!automaticAttempt) return false;
    relearn.queue = relearn.queue.filter(function (candidate) {
      return candidate && candidate.key !== key;
    });
    return true;
  }

  function noteRelearnPracticeCompletion(skill) {
    var relearn = getRelearnState();
    relearn.sequence = Math.min(1000000000, Number(relearn.sequence || 0) + 1);
    relearn.practiceSeconds = Math.min(
      1000000000,
      Number(relearn.practiceSeconds || 0) +
        Number(STAGE_SECONDS[skill] || RESCUE_GATE_SECONDS[skill] || 60),
    );
  }

  function noteDailyPracticeCompletion(skill) {
    if (
      !session ||
      (session.type !== 'daily' && session.type !== 'rescue') ||
      !state.daily ||
      state.daily.date !== localDateKey()
    ) {
      return;
    }
    state.daily.practicedSeconds = Math.min(
      DAILY_MAX_SECONDS,
      Number(state.daily.practicedSeconds || 0) +
        Number(STAGE_SECONDS[skill] || RESCUE_GATE_SECONDS[skill] || 60),
    );
  }

  function relearnVariantForCurrentTask(wordId, skill) {
    if (skill !== 'forms') return '';
    var studyWord = findCoreStudyWord(wordId);
    if (studyWord && studyWord.isFoundation) return 'family';
    var exercise = session && session.taskState ? session.taskState.formExercise : null;
    if (exercise && exercise.type === 'context' && DIRECT_FORM_DRILLS[wordId]) return 'direct';
    return 'context';
  }

  function scheduleAutomaticRelearn(wordId, skill, now) {
    var rescueGate = isRescueGate(skill);
    var studyWord = rescueGate
      ? findRescueWord(wordId)
      : findWord(wordId) ||
        FORM_FOUNDATIONS.find(function (word) {
          return word.id === wordId;
        });
    if (
      !studyWord ||
      (SKILLS.indexOf(skill) < 0 && !rescueGate) ||
      (rescueGate && rescueGatesForWord(studyWord).indexOf(skill) < 0) ||
      (studyWord.isFoundation && skill !== 'forms')
    ) {
      return;
    }
    var relearn = getRelearnState();
    var key = relearnKey(wordId, skill);
    if (
      relearn.queue.some(function (entry) {
        return entry && entry.key === key;
      })
    ) {
      return;
    }
    relearn.queue.push({
      key: key,
      wordId: wordId,
      skill: skill,
      scheduledAt: now,
      scheduledSequence: Number(relearn.sequence || 0),
      scheduledPracticeSeconds: Number(relearn.practiceSeconds || 0),
      notBeforeAt: now + RELEARN_TARGET_DELAY_MS,
      notBeforeSequence: Number(relearn.sequence || 0) + RELEARN_MIN_OTHER_TASKS,
      notBeforePracticeSeconds:
        Number(relearn.practiceSeconds || 0) + RELEARN_TARGET_PRACTICE_SECONDS,
      variant: isRescueGate(skill)
        ? (Math.max(
            0,
            Number(session && session.taskState && session.taskState.rescueVariant) || 0,
          ) +
            1) %
          2
        : relearnVariantForCurrentTask(wordId, skill),
    });
    relearn.queue = relearn.queue.slice(-RELEARN_MAX_QUEUE);
  }

  function readyRelearnEntries(now) {
    return getRelearnState()
      .queue.filter(function (entry) {
        var validWord = isRescueGate(entry.skill)
          ? findRescueWord(entry.wordId)
          : findWord(entry.wordId) ||
            FORM_FOUNDATIONS.find(function (word) {
              return word.id === entry.wordId;
            });
        return isRelearnReady(entry, now || Date.now()) && Boolean(validWord);
      })
      .sort(function (a, b) {
        return (
          Number(a.scheduledAt || 0) - Number(b.scheduledAt || 0) || a.key.localeCompare(b.key)
        );
      });
  }

  function relearnWord(entry) {
    if (isRescueGate(entry.skill)) return null;
    var word =
      findWord(entry.wordId) ||
      FORM_FOUNDATIONS.find(function (candidate) {
        return candidate.id === entry.wordId;
      });
    if (!word) return null;
    return Object.assign({}, word, {
      relearnKey: entry.key,
      relearnVariant: entry.variant || '',
    });
  }

  function markReadyRelearnWord(word, skill, now) {
    var entry = word && findPendingRelearn(word.id, skill);
    return entry && isRelearnReady(entry, now || Date.now()) ? relearnWord(entry) : word;
  }

  function dailyPlanRelearnKeys(plans) {
    var keys = new Set();
    (plans || []).forEach(function (plan) {
      (plan && Array.isArray(plan.stages) ? plan.stages : []).forEach(function (stage) {
        if (stage && stage.relearnKey) keys.add(String(stage.relearnKey));
      });
    });
    return Array.from(keys);
  }

  function markCoveredDailyRelearn(plans, entry, startIndex, firstStageIndex) {
    for (
      var planIndex = Math.max(0, Number(startIndex || 0));
      planIndex < plans.length;
      planIndex += 1
    ) {
      var plan = plans[planIndex];
      if (!plan || !plan.word || plan.word.id !== entry.wordId || !Array.isArray(plan.stages)) {
        continue;
      }
      var stageStart = planIndex === Number(startIndex || 0) ? Number(firstStageIndex || 0) : 0;
      var stageIndex = plan.stages.findIndex(function (stage, index) {
        return index >= stageStart && stage.skill === entry.skill;
      });
      if (stageIndex < 0) continue;
      var stages = plan.stages.slice();
      stages[stageIndex] = Object.assign({}, stages[stageIndex], {
        role: 'relearn',
        variant: entry.variant || stages[stageIndex].variant || '',
        relearnKey: entry.key,
      });
      plans[planIndex] = Object.assign({}, plan, { stages: stages });
      return true;
    }
    return false;
  }

  function makeRelearnPlan(entry, now) {
    var word = relearnWord(entry);
    if (!word) return null;
    return makeDailyPlan(
      word,
      'relearn',
      [
        {
          skill: entry.skill,
          role: 'relearn',
          variant: entry.variant || '',
          relearnKey: entry.key,
          estimatedSeconds: STAGE_SECONDS[entry.skill] || 60,
        },
      ],
      now,
    );
  }

  function appendReadyRelearnPlans(
    plans,
    now,
    removableStartIndex,
    firstStageIndex,
    maximumKeys,
    availableSeconds,
  ) {
    var result = plans.slice();
    var selectedKeys = new Set(dailyPlanRelearnKeys(result));
    var keyLimit = Math.max(0, Number(maximumKeys));
    var secondsLimit = Math.max(0, Number(availableSeconds));
    var stateChanged = false;
    readyRelearnEntries(now).some(function (entry) {
      if (isRescueGate(entry.skill)) return false;
      if (selectedKeys.has(entry.key)) return false;
      if (selectedKeys.size >= keyLimit) return true;
      if (markCoveredDailyRelearn(result, entry, removableStartIndex, firstStageIndex)) {
        selectedKeys.add(entry.key);
        return false;
      }
      var plan = makeRelearnPlan(entry, now);
      if (!plan) return false;
      var extraSeconds = dailyPlanSeconds([plan]);
      while (
        dailyRemainingPlanSeconds(result, removableStartIndex, firstStageIndex) + extraSeconds >
        secondsLimit
      ) {
        var removableIndex = -1;
        var firstRemovableIndex =
          Number(removableStartIndex || 0) + (Number(firstStageIndex || 0) > 0 ? 1 : 0);
        for (var index = result.length - 1; index >= firstRemovableIndex; index -= 1) {
          if (result[index] && result[index].kind === 'new') {
            removableIndex = index;
            break;
          }
        }
        if (removableIndex < 0) break;
        var removed = result.splice(removableIndex, 1)[0];
        state.daily.newIds = (state.daily.newIds || []).filter(function (id) {
          return !removed.word || id !== removed.word.id;
        });
        stateChanged = true;
      }
      if (
        dailyRemainingPlanSeconds(result, removableStartIndex, firstStageIndex) + extraSeconds >
        secondsLimit
      ) {
        return false;
      }
      result.push(plan);
      selectedKeys.add(entry.key);
      return false;
    });
    if (stateChanged) saveState();
    return result;
  }

  function appendReadyRelearnToSession() {
    if (!session || session.wordIndex > session.words.length) return;
    var sessionKeys = new Set(Array.isArray(session.relearnKeys) ? session.relearnKeys : []);
    var remainingSlots = Math.max(0, RELEARN_MAX_PER_SESSION - sessionKeys.size);
    if (!remainingSlots) return;
    var now = Date.now();
    if (session.type === 'daily') {
      var removableStart = session.wordIndex;
      session.plans = appendReadyRelearnPlans(
        session.plans,
        now,
        removableStart,
        session.stageIndex,
        RELEARN_MAX_PER_SESSION,
        Math.max(0, DAILY_MAX_SECONDS - Number(state.daily.practicedSeconds || 0)),
      );
      session.relearnKeys = dailyPlanRelearnKeys(session.plans);
      session.words = session.plans.map(function (plan) {
        return plan.word;
      });
      return;
    }

    readyRelearnEntries(now).some(function (entry) {
      if (isRescueGate(entry.skill)) return false;
      if (remainingSlots <= 0) return true;
      if (session.type === 'skill' && session.stages[0] !== entry.skill) return false;
      var existingIndex = -1;
      for (var index = session.wordIndex; index < session.words.length; index += 1) {
        var scheduledSkill =
          session.type === 'repair' ? session.repairSkills[index] : session.stages[0];
        if (session.words[index].id === entry.wordId && scheduledSkill === entry.skill) {
          existingIndex = index;
          break;
        }
      }
      var word = relearnWord(entry);
      if (!word) return false;
      if (existingIndex >= 0) {
        session.words[existingIndex] = word;
      } else {
        session.words.push(word);
        if (session.type === 'repair') session.repairSkills.push(entry.skill);
      }
      sessionKeys.add(entry.key);
      session.relearnKeys = Array.from(sessionKeys);
      remainingSlots -= 1;
      return false;
    });
  }

  function recordResult(word, skill, correct, detail, source, interactionOverrides) {
    var skillState = getSkillState(word.id, skill);
    clearVisualRepairNeed(word.id, skill);
    skillState.relearnRequired = false;
    startTaskActivity();
    var now = Date.now();
    var relearnAttempt = consumePendingRelearn(word.id, skill);
    var interaction = collectInteractionEvidence(skill, interactionOverrides);
    // Train only on information available before this answer. Current hints,
    // replays, response time and skipping describe the attempt itself; they are
    // persisted after scoring so they can inform the next recall prediction.
    var features = adaptiveFeatures(word.id, skill, null, now);
    var rulePredictedBefore = predictRuleRecallProbability(features);
    var modelPredictedBefore = predictModelRecallProbability(features, skill);
    var predictedBefore = blendAdaptivePredictions(
      rulePredictedBefore,
      modelPredictedBefore,
      skill,
    );
    skillState.attempts += 1;
    skillState.lastResponseMs = interaction.responseMs;
    skillState.hintUses += interaction.hintUses;
    skillState.replayUses += interaction.replayUses;
    if (interaction.skipped) skillState.skipCount += 1;
    if (correct) {
      skillState.correct += 1;
      skillState.level = Math.min(5, skillState.level + 1);
      skillState.needsReview = false;
    } else {
      skillState.level = Math.max(0, skillState.level - 1);
      skillState.lastIntervalDays = 0;
      skillState.due = startOfToday();
      skillState.needsReview = true;
    }
    skillState.last = now;
    skillState.lastPredictedRecall = predictedBefore;
    updateAdaptiveModel(
      word.id,
      skill,
      features,
      Boolean(correct),
      rulePredictedBefore,
      modelPredictedBefore,
      now,
      {
        taskVersion: skill + '-controlled-v2',
        labelSource: relearnAttempt ? 'controlled_delayed_retest' : 'controlled_first_attempt',
        optionCount: 0,
        hintLevel: interaction.hintUses,
        replayCount: interaction.replayUses,
        activeResponseMs: interaction.responseMs,
        attemptCycle: relearnAttempt ? 1 : 0,
      },
    );
    if (correct) {
      skillState.lastIntervalDays = adaptiveIntervalDays(
        word.id,
        skill,
        skillState.level,
        predictedBefore,
        interaction,
        now,
      );
      skillState.due = addCalendarDays(startOfToday(), skillState.lastIntervalDays);
    }

    var historyItem = {
      wordId: word.id,
      word: word.word,
      skill: skill,
      correct: Boolean(correct),
      detail: detail || (correct ? '首次完成' : '需要复习'),
      at: now,
      adaptive: {
        modelVersion: ADAPTIVE_MODEL_VERSION,
        predictedBefore: roundProbability(predictedBefore),
        predictedRuleBefore: roundProbability(rulePredictedBefore),
        predictedModelBefore: roundProbability(modelPredictedBefore),
        predictedAfter: 0,
        responseMs: interaction.responseMs,
        hintUses: interaction.hintUses,
        replayUses: interaction.replayUses,
        skipped: interaction.skipped,
        relearnAttempt: relearnAttempt,
        attemptCycle: relearnAttempt ? 1 : 0,
      },
    };
    if (source && typeof source === 'object') {
      historyItem.source = String(source.source || '');
      historyItem.visualTaskId = String(source.visualTaskId || '');
      historyItem.visualGameType = String(source.visualGameType || '');
    }
    state.history.push(historyItem);
    // The just-recorded result must be visible to the after-prediction. This
    // keeps persisted mastery aligned with the scheduler's next calculation.
    skillState.mastery = predictRecallProbability(word.id, skill, null, now);
    historyItem.adaptive.predictedAfter = roundProbability(skillState.mastery);
    noteRelearnPracticeCompletion(skill);
    noteDailyPracticeCompletion(skill);
    if (!correct && !relearnAttempt) scheduleAutomaticRelearn(word.id, skill, now);
    state.history = state.history.slice(-240);
    saveState();

    if (session) {
      if (!session.stats[skill]) session.stats[skill] = { attempts: 0, correct: 0 };
      session.stats[skill].attempts += 1;
      if (correct) session.stats[skill].correct += 1;
    }
  }

  function recordVisualAdaptiveResult(metadata, correct, choice, now, evidence) {
    if (!metadata || !metadata.targetWordId || MODEL_SKILLS.indexOf(metadata.modelSkill) < 0) {
      return;
    }
    var skill = metadata.modelSkill;
    var skillState = getAdaptiveAbility(metadata.targetWordId, skill);
    var features = adaptiveFeaturesFromState(
      skillState,
      skill,
      null,
      now,
      Boolean(skillState.needsReview),
    );
    var rulePredictedBefore = predictRuleRecallProbability(features);
    var modelPredictedBefore = predictModelRecallProbability(features, skill);
    var predictedBefore = blendAdaptivePredictions(
      rulePredictedBefore,
      modelPredictedBefore,
      skill,
    );
    var skipped = String(choice || '') === 'skip';

    skillState.attempts += 1;
    if (correct) {
      skillState.correct += 1;
      skillState.level = Math.min(5, skillState.level + 1);
      skillState.needsReview = false;
    } else {
      skillState.level = Math.max(0, skillState.level - 1);
      skillState.needsReview = true;
    }
    if (skipped) skillState.skipCount += 1;
    skillState.last = now;
    skillState.lastPredictedRecall = predictedBefore;

    updateAdaptiveModel(
      metadata.targetWordId,
      skill,
      features,
      correct,
      rulePredictedBefore,
      modelPredictedBefore,
      now,
      {
        taskVersion: (evidence && evidence.taskVersion) || visualTaskVersion(metadata),
        labelSource: 'controlled_visual_first_attempt',
        optionCount: metadata.optionCount,
        hintLevel: 0,
        replayCount: 0,
        activeResponseMs: 0,
        promptId: (evidence && evidence.promptId) || 'prompt-0',
        attemptCycle: (evidence && evidence.attemptCycle) || 0,
      },
    );
    var afterFeatures = adaptiveFeaturesFromState(
      skillState,
      skill,
      null,
      now,
      Boolean(skillState.needsReview),
    );
    skillState.mastery = blendAdaptivePredictions(
      predictRuleRecallProbability(afterFeatures),
      predictModelRecallProbability(afterFeatures, skill),
      skill,
    );
    saveState();
  }

  function recordPendingResult(word, skill, detail) {
    var skillState = getSkillState(word.id, skill);
    clearVisualRepairNeed(word.id, skill);
    skillState.relearnRequired = false;
    startTaskActivity();
    var now = Date.now();
    var relearnAttempt = consumePendingRelearn(word.id, skill);
    var interaction = collectInteractionEvidence(skill, null);
    skillState.pending = Number(skillState.pending || 0) + 1;
    skillState.needsReview = true;
    skillState.due = startOfToday();
    skillState.last = now;
    skillState.lastResponseMs = interaction.responseMs;
    state.history.push({
      wordId: word.id,
      word: word.word,
      skill: skill,
      correct: null,
      pendingReview: true,
      detail: detail || '已提交，等待人工评阅',
      at: now,
      adaptive: {
        modelVersion: ADAPTIVE_MODEL_VERSION,
        trained: false,
        excludedReason: 'pending_human_review',
        responseMs: interaction.responseMs,
        relearnAttempt: relearnAttempt,
      },
    });
    noteDailyPracticeCompletion(skill);
    state.history = state.history.slice(-240);
    saveState();

    if (session) {
      if (!session.stats[skill]) {
        session.stats[skill] = { attempts: 0, correct: 0, pending: 0 };
      }
      session.stats[skill].pending = Number(session.stats[skill].pending || 0) + 1;
    }
  }

  function collectInteractionEvidence(skill, overrides) {
    var task = session && session.taskState ? session.taskState : {};
    var hintUses = 0;
    if (skill === 'spell') hintUses = Number(task.attempts || 0);
    if (skill === 'forms') hintUses = Number(task.formAttempts || 0);
    if (skill === 'sentence' && task.hadError) hintUses = 1;
    var evidence = {
      responseMs: currentTaskResponseMs(),
      hintUses: Math.max(0, Math.round(hintUses)),
      replayUses: Math.max(0, Math.round(Number(task.audioPlays || 0)) - 1),
      skipped: Boolean(task.soundDiagnosticSkipped),
    };
    if (overrides && typeof overrides === 'object') {
      if (overrides.responseMs !== undefined) {
        evidence.responseMs = Math.max(0, Number(overrides.responseMs) || 0);
      }
      if (overrides.hintUses !== undefined) {
        evidence.hintUses = Math.max(0, Math.round(Number(overrides.hintUses) || 0));
      }
      if (overrides.replayUses !== undefined) {
        evidence.replayUses = Math.max(0, Math.round(Number(overrides.replayUses) || 0));
      }
      if (overrides.skipped !== undefined) evidence.skipped = Boolean(overrides.skipped);
    }
    evidence.responseMs = Math.min(20 * 60 * 1000, Math.round(evidence.responseMs));
    return evidence;
  }

  function adaptiveFeatures(wordId, skill, interaction, now) {
    var skillState = peekSkillState(wordId, skill);
    return adaptiveFeaturesFromState(
      skillState,
      skill,
      interaction,
      now,
      hasUnresolvedControlledError(wordId, skill, skillState),
    );
  }

  function adaptiveFeaturesFromState(skillState, skill, interaction, now, recentError) {
    var attempts = Math.max(0, Number(skillState.attempts || 0));
    var denominator = Math.max(1, attempts + (interaction ? 1 : 0));
    var responseMs = interaction
      ? Number(interaction.responseMs || 0)
      : Number(skillState.lastResponseMs || 0);
    var expectedMs = (STAGE_SECONDS[skill] || 60) * 1000;
    var elapsedDays = skillState.last ? Math.max(0, (now - skillState.last) / DAY_MS) : 0;
    return {
      bias: 1,
      priorAccuracy: (Number(skillState.correct || 0) + 1) / (attempts + 2),
      level: Math.max(0, Math.min(1, Number(skillState.level || 0) / 5)),
      logDays: Math.max(0, Math.min(1.5, Math.log1p(elapsedDays) / Math.log(31))),
      recentError: recentError ? 1 : 0,
      hintRate: Math.min(
        1,
        (Number(skillState.hintUses || 0) + (interaction ? interaction.hintUses : 0)) / denominator,
      ),
      replayRate: Math.min(
        1,
        (Number(skillState.replayUses || 0) + (interaction ? interaction.replayUses : 0)) /
          denominator,
      ),
      skipRate: Math.min(
        1,
        (Number(skillState.skipCount || 0) + (interaction && interaction.skipped ? 1 : 0)) /
          denominator,
      ),
      slowResponse: responseMs ? Math.max(0, Math.min(1, responseMs / (expectedMs * 1.5))) : 0,
      skillSound: skill === 'sound' ? 1 : 0,
      skillSpell: skill === 'spell' ? 1 : 0,
      skillForms: skill === 'forms' ? 1 : 0,
      skillSentence: skill === 'sentence' ? 1 : 0,
      skillMeaning: skill === 'meaning' ? 1 : 0,
    };
  }

  function latestControlledResult(wordId, skill) {
    for (var index = state.history.length - 1; index >= 0; index -= 1) {
      var item = state.history[index];
      if (
        item &&
        item.wordId === wordId &&
        item.skill === skill &&
        item.coreAttempt !== false &&
        typeof item.correct === 'boolean'
      ) {
        return item;
      }
    }
    return null;
  }

  function hasUnresolvedControlledError(wordId, skill, preparedSkillState) {
    var skillState = preparedSkillState || peekSkillState(wordId, skill);
    if (skillState.relearnRequired) return true;
    var latest = latestControlledResult(wordId, skill);
    if (latest) return latest.correct === false;
    return Boolean(skillState.needsReview && Number(skillState.pending || 0) === 0);
  }

  function predictRecallProbability(wordId, skill, interaction, now, preparedFeatures) {
    var features =
      preparedFeatures || adaptiveFeatures(wordId, skill, interaction, now || Date.now());
    return blendAdaptivePredictions(
      predictRuleRecallProbability(features),
      predictModelRecallProbability(features, skill),
      skill,
    );
  }

  function predictRuleRecallProbability(features) {
    return predictWithAdaptiveWeights(ADAPTIVE_DEFAULT_WEIGHTS, features);
  }

  function predictModelRecallProbability(features, skill) {
    var model = state.adaptive || defaultAdaptiveState();
    var weights = skill === 'meaning' ? model.meaningWeights : model.weights;
    return predictWithAdaptiveWeights(weights || ADAPTIVE_DEFAULT_WEIGHTS, features);
  }

  function predictWithAdaptiveWeights(weights, features) {
    var score = ADAPTIVE_WEIGHT_KEYS.reduce(function (total, key) {
      return total + Number(weights[key] || 0) * Number(features[key] || 0);
    }, 0);
    score = Math.max(-12, Math.min(12, score));
    return 1 / (1 + Math.exp(-score));
  }

  function shadowModelBlend(shadow) {
    var count = Number((shadow && shadow.count) || 0);
    if (count < ADAPTIVE_SHADOW_MIN) return 0;
    var ruleLoss = Number(shadow.ruleBrier);
    var modelLoss = Number(shadow.modelBrier);
    if (!Number.isFinite(ruleLoss) || !Number.isFinite(modelLoss) || modelLoss > ruleLoss) {
      return 0;
    }
    var progress = Math.max(
      0,
      Math.min(1, (count - ADAPTIVE_SHADOW_MIN) / (ADAPTIVE_SHADOW_FULL - ADAPTIVE_SHADOW_MIN)),
    );
    return 0.15 + progress * 0.65;
  }

  function adaptiveModelBlend(skill) {
    var model = state.adaptive || defaultAdaptiveState();
    if (skill === 'meaning') return shadowModelBlend(model.meaningShadow);
    var coreBlend = shadowModelBlend(model.shadow);
    if (!skill || SKILLS.indexOf(skill) < 0) return coreBlend;
    var observations = Number((model.skillObservations && model.skillObservations[skill]) || 0);
    if (observations < ADAPTIVE_SKILL_MIN) return 0;
    return coreBlend * Math.min(1, observations / ADAPTIVE_SHADOW_MIN);
  }

  function blendAdaptivePredictions(rulePrediction, modelPrediction, skill) {
    var blend = adaptiveModelBlend(skill);
    return normaliseProbability(rulePrediction * (1 - blend) + modelPrediction * blend);
  }

  function updateAdaptiveModel(
    wordId,
    skill,
    features,
    correct,
    rulePrediction,
    modelPrediction,
    now,
    eventMetadata,
  ) {
    if (!state.adaptive) state.adaptive = defaultAdaptiveState();
    var model = state.adaptive;
    var skillObservations = Number(
      (model.skillObservations && model.skillObservations[skill]) || 0,
    );
    var learningRate = Math.max(0.025, 0.16 / Math.sqrt(1 + skillObservations / 20));
    var evidenceWeight = evidenceWeightForOptionCount((eventMetadata || {}).optionCount);
    learningRate *= evidenceWeight;
    var label = correct ? 1 : 0;
    var error = label - modelPrediction;
    var shadowKey = skill === 'meaning' ? 'meaningShadow' : 'shadow';
    if (!model[shadowKey] || typeof model[shadowKey] !== 'object') {
      model[shadowKey] = { count: 0, ruleBrier: 0, modelBrier: 0 };
    }
    updateAdaptiveShadow(model[shadowKey], label, rulePrediction, modelPrediction, evidenceWeight);
    var weightKey = skill === 'meaning' ? 'meaningWeights' : 'weights';
    if (!model[weightKey] || typeof model[weightKey] !== 'object') {
      model[weightKey] = Object.assign({}, ADAPTIVE_DEFAULT_WEIGHTS);
    }
    ADAPTIVE_WEIGHT_KEYS.forEach(function (key) {
      var current = Number(model[weightKey][key] || 0);
      var updated = current * 0.9995 + learningRate * error * Number(features[key] || 0);
      model[weightKey][key] = constrainAdaptiveWeight(key, updated);
    });
    model.version = ADAPTIVE_MODEL_VERSION;
    model.featureSchemaVersion = ADAPTIVE_FEATURE_SCHEMA_VERSION;
    model.localOnly = true;
    model.observations = Math.min(1000000, Number(model.observations || 0) + 1);
    if (!model.skillObservations || typeof model.skillObservations !== 'object') {
      model.skillObservations = {};
    }
    model.skillObservations[skill] = Math.min(
      1000000,
      Number(model.skillObservations[skill] || 0) + 1,
    );
    model.updatedAt = now;
    appendAdaptiveEvent(wordId, skill, label, rulePrediction, modelPrediction, now, eventMetadata);
  }

  function updateAdaptiveShadow(shadow, label, rulePrediction, modelPrediction, evidenceWeight) {
    var previousCount = Number(shadow.count || 0);
    var count = Math.min(1000000, previousCount + Math.max(0.1, Number(evidenceWeight) || 1));
    var alpha = previousCount === 0 ? 1 : 0.12;
    var ruleLoss = Math.pow(label - rulePrediction, 2);
    var modelLoss = Math.pow(label - modelPrediction, 2);
    shadow.count = count;
    shadow.ruleBrier = normaliseProbability(
      Number(shadow.ruleBrier || 0) + alpha * (ruleLoss - Number(shadow.ruleBrier || 0)),
    );
    shadow.modelBrier = normaliseProbability(
      Number(shadow.modelBrier || 0) + alpha * (modelLoss - Number(shadow.modelBrier || 0)),
    );
  }

  function appendAdaptiveEvent(
    wordId,
    skill,
    label,
    rulePrediction,
    modelPrediction,
    now,
    eventMetadata,
  ) {
    var model = state.adaptive;
    var metadata = eventMetadata || {};
    model.eventSeq = Math.min(1000000000, Number(model.eventSeq || 0) + 1);
    if (!Array.isArray(model.events)) model.events = [];
    model.events.push({
      id: 'local-' + model.eventSeq,
      sequence: model.eventSeq,
      at: now,
      wordId: String(wordId || ''),
      skill: skill,
      taskVersion: String(metadata.taskVersion || 'controlled-v2'),
      label: label,
      labelSource: String(metadata.labelSource || 'controlled_first_attempt'),
      independent: true,
      optionCount: Math.max(0, Math.round(Number(metadata.optionCount || 0))),
      evidenceWeight: roundProbability(evidenceWeightForOptionCount(metadata.optionCount)),
      hintLevel: Math.max(0, Math.round(Number(metadata.hintLevel || 0))),
      replayCount: Math.max(0, Math.round(Number(metadata.replayCount || 0))),
      activeResponseMs: Math.min(
        20 * 60 * 1000,
        Math.max(0, Math.round(Number(metadata.activeResponseMs || 0))),
      ),
      predictedRuleBefore: roundProbability(rulePrediction),
      predictedModelBefore: roundProbability(modelPrediction),
      promptId: normaliseGeneratedAdaptivePromptId(metadata.taskVersion, metadata.promptId),
      attemptCycle: Math.min(10000, Math.max(0, Math.round(Number(metadata.attemptCycle || 0)))),
    });
    model.events = model.events.slice(-160);
  }

  function evidenceWeightForOptionCount(optionCount) {
    var count = Math.max(0, Math.round(Number(optionCount || 0)));
    return count > 1 ? 1 - 1 / count : 1;
  }

  function adaptiveIntervalDays(wordId, skill, level, predictedRecall, interaction, now) {
    var baseDays = INTERVAL_DAYS[Math.max(0, Math.min(5, level))] || 1;
    var quality = 0.78 + Math.max(0, Math.min(1, predictedRecall)) * 0.5;
    var expectedMs = (STAGE_SECONDS[skill] || 60) * 1000;
    if (interaction.responseMs > expectedMs * 1.25) quality *= 0.86;
    if (interaction.hintUses > 0) quality *= Math.max(0.65, 1 - interaction.hintUses * 0.1);
    if (interaction.replayUses > 0) quality *= Math.max(0.75, 1 - interaction.replayUses * 0.06);
    var safeBaseline = Math.max(1, Math.min(45, Math.round(baseDays * quality)));
    var blend = adaptiveModelBlend(skill);
    if (!blend || !wordId) return safeBaseline;
    var model = state.adaptive || defaultAdaptiveState();
    var weights = skill === 'meaning' ? model.meaningWeights : model.weights;
    if (Number((weights && weights.logDays) || 0) > -0.05) return safeBaseline;

    var threshold = learningGoalRetention(skill);
    var maximumModelDays = Math.min(45, Math.max(safeBaseline, safeBaseline * 2));
    var modelDays = maximumModelDays;
    var skillState = peekSkillState(wordId, skill);
    for (var day = 1; day <= maximumModelDays; day += 1) {
      var futureFeatures = adaptiveFeaturesFromState(
        skillState,
        skill,
        null,
        now + day * DAY_MS,
        false,
      );
      var futureRecall = blendAdaptivePredictions(
        predictRuleRecallProbability(futureFeatures),
        predictModelRecallProbability(futureFeatures, skill),
        skill,
      );
      if (futureRecall < threshold) {
        modelDays = Math.max(1, day - 1);
        break;
      }
    }
    return Math.max(1, Math.min(45, Math.round(safeBaseline * (1 - blend) + modelDays * blend)));
  }

  function roundProbability(value) {
    return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
  }

  function clearVisualRepairNeed(wordId, skill) {
    var wordState = getWordState(wordId);
    if (!wordState.visualRepairPending) return;
    delete wordState.visualRepairPending[skill];
  }

  function leaveSessionToToday() {
    if (
      session &&
      history.back &&
      history.state &&
      (history.state.wordlabSession || history.state.wordlabView !== 'today')
    ) {
      history.back();
      return;
    }
    navigate('today');
  }

  function navigate(view, options) {
    clearTimeout(advanceTimer);
    clearTimeout(hardWordMemoryTimer);
    cleanupMedia();
    dualPrototypeState = null;
    syllableTutorialState = null;
    if (currentView === 'hard-word-practice' && view !== 'hard-word-practice') {
      hardWordPracticeState.active = null;
      saveHardWordPracticeState();
    }
    var previousHistoryState = Object.assign({}, history.state || {});
    var isSessionHistoryEntry = Boolean(previousHistoryState.wordlabSession);
    var isLeavingSession = Boolean(session) || isSessionHistoryEntry;
    delete previousHistoryState.wordlabSession;
    delete previousHistoryState.dualPrototype;
    session = null;
    currentView = view;
    if (!(options && options.fromPopState) && history.pushState) {
      var nextHistoryState = Object.assign({}, previousHistoryState, { wordlabView: view });
      if (isLeavingSession && history.replaceState) {
        history.replaceState(nextHistoryState, '', location.href);
      } else if (history.state && history.state.dualPrototype && history.replaceState) {
        history.replaceState(nextHistoryState, '', location.href);
      } else if (!history.state || history.state.wordlabView !== view) {
        history.pushState(nextHistoryState, '', location.href);
      }
    } else if (options && options.fromPopState && isSessionHistoryEntry && history.replaceState) {
      // A completed in-memory session cannot be restored through browser Forward.
      // Convert that stale entry into its safe landing view before another session starts.
      history.replaceState(
        Object.assign({}, previousHistoryState, { wordlabView: view }),
        '',
        location.href,
      );
    }

    if (view === 'today') {
      renderToday();
    } else if (view === 'progress') {
      renderProgress();
    } else if (view === 'practice') {
      renderPracticeHub();
    } else if (view === 'hard-words') {
      renderHardWordsCatalog();
    } else if (view === 'hard-word-practice') {
      resumeHardWordPractice();
    } else if (view === 'syllable-tutorial') {
      startSyllableTutorial({ historyReady: true });
    } else if (view === 'visual') {
      renderVisualLab();
    } else if (SKILLS.indexOf(view) >= 0) {
      startSkillSession(view, { historyReady: true });
    } else if (view === 'learn') {
      startSkillSession('sound', { historyReady: true });
    } else {
      renderToday();
    }
    scrollToTop();
  }

  function setActiveNav(view) {
    var normalised =
      SKILLS.indexOf(view) >= 0 || view === 'learn' || view === 'visual' ? 'practice' : view;
    document.querySelectorAll('[data-view-link]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.viewLink === normalised);
    });
  }

  function currentLearningGoal() {
    return LEARNING_GOALS[normaliseLearningGoal(state.settings.learningGoal)];
  }

  function learningGoalPriority(skill) {
    return Number(currentLearningGoal().priority[skill] || 1);
  }

  function learningGoalRetention(skill) {
    return Number(currentLearningGoal().retention[skill] || 0.7);
  }

  function adaptiveStatusText() {
    var goal = currentLearningGoal().label;
    return goal + (adaptiveModelBlend() > 0 ? ' · 动态复习' : ' · 稳定排期');
  }

  function renderToday() {
    currentView = 'today';
    setActiveNav('today');
    var plan = buildDailyPlan();
    var taskCount = dailyPlanTaskCount(plan);
    var newCount = plan.filter(function (item) {
      return item.kind === 'new';
    }).length;
    var estimatedSeconds = dailyPlanSeconds(plan);
    var summary = progressSummary();
    var dueCount = countDueSkills();
    var rescueSummary = rescueTodaySummary();
    var today = new Intl.DateTimeFormat('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date());

    main.innerHTML =
      '<section class="page-heading compact-page-heading"><div><p class="eyebrow">TODAY</p><h1>今天</h1></div><span class="date-chip">' +
      esc(today) +
      '</span></section>' +
      '<section class="today-focus">' +
      '<article class="panel rescue-entry-card" data-rescue-entry data-rescue-remaining="' +
      rescueSummary.remaining +
      '"><div class="rescue-entry-copy"><span class="mini-metric">' +
      esc(rescueSummary.roundLabel) +
      '</span><h2>声形急救</h2><p>' +
      esc(rescueSummary.copy) +
      '</p></div><div class="rescue-entry-actions"><button class="primary-button" type="button" data-action="start-rescue"' +
      (rescueSummary.canStart ? '' : ' disabled') +
      '>' +
      esc(rescueSummary.buttonLabel) +
      '</button><button class="text-button" type="button" data-action="go-view" data-view="hard-words">查看全部学生难词</button></div></article>' +
      (rescuePendingContextCount()
        ? '<p class="rescue-context-alert" role="status">' +
          rescuePendingContextCount() +
          ' 条词义记录等待原听力句；可在“错题与进度”查看，不计掌握。</p>'
        : '') +
      '<article class="panel start-panel compact-start-panel" data-daily-plan data-new-count="' +
      newCount +
      '" data-estimated-seconds="' +
      estimatedSeconds +
      '" data-adaptive-model="local-online-v2-shadow" data-adaptive-observations="' +
      Number(state.adaptive.observations || 0) +
      '" data-adaptive-blend="' +
      roundProbability(adaptiveModelBlend()) +
      '" data-learning-goal="' +
      esc(normaliseLearningGoal(state.settings.learningGoal)) +
      '" data-relearn-pending="' +
      getRelearnState().queue.length +
      '">' +
      '<div class="focus-summary"><span>' +
      (plan.length ? Math.max(1, Math.ceil(estimatedSeconds / 60)) + ' 分钟' : '已完成') +
      '</span><h2>' +
      (plan.length ? plan.length + ' 个词 · ' + taskCount + ' 个小任务' : '今天的到期词已经练完') +
      '</h2></div>' +
      '<div class="compact-loop" aria-label="听音、拼写与辨义、词形、句用">' +
      '<span>听音</span><i>→</i><span>拼写＋辨义</span><i>→</i><span>词形</span><i>→</i><span>句用</span>' +
      '</div>' +
      '<p class="adaptive-note">' +
      esc(adaptiveStatusText()) +
      ' · 数据仅存本机</p>' +
      '<div class="start-actions primary-start-actions">' +
      '<button class="primary-button" type="button" data-action="start-daily"' +
      (plan.length ? '' : ' disabled') +
      '>' +
      (plan.length ? '继续学习' : '明天再来') +
      '</button>' +
      '</div>' +
      '</article>' +
      '<div class="home-glance" aria-label="学习概览">' +
      metric(summary.started, '已练词') +
      metric(dueCount, '待复习') +
      metric(summary.mistakes, '近期错项') +
      '</div>' +
      '</section>';
  }

  function rescueGatesForWord(word) {
    if (!word) return [];
    if (Number(word.difficulty) === 1) return ['readDecode'];
    if (Number(word.difficulty) === 2) return ['listenForm', 'meaningRecall'];
    return ['readDecode', 'listenForm', 'meaningRecall'];
  }

  function rescueTaskComplete(wordId, gate) {
    var gateState = peekRescueGateState(wordId, gate);
    if (!gateState || !gateState.attempts) return false;
    // A collected pending-context note leaves the main round so Round 2 can
    // continue, but remains explicitly unmastered in Progress.
    if (gate === 'meaningRecall' && gateState.pendingContext) return true;
    return gateState.correct > 0 && !gateState.needsReview;
  }

  function rescueRoundTasks(round) {
    var tasks = [];
    RESCUE_WORDS.filter(function (word) {
      return Number(word.round) === Number(round);
    }).forEach(function (word) {
      rescueGatesForWord(word).forEach(function (gate) {
        var gateState = peekRescueGateState(word.id, gate);
        if (gate === 'meaningRecall' && gateState && gateState.pendingContext) return;
        if (!rescueTaskComplete(word.id, gate)) {
          tasks.push({ wordId: word.id, gate: gate, variant: 0, attemptCycle: 0, relearnKey: '' });
        }
      });
    });
    return tasks;
  }

  function rescueTodaySummary() {
    var roundOne = rescueRoundTasks(1);
    var roundTwo = rescueRoundTasks(2);
    var round = roundOne.length ? 1 : 2;
    var tasks = round === 1 ? roundOne : roundTwo;
    var availableSeconds = Math.max(
      0,
      DAILY_MAX_SECONDS - Number(state.daily.practicedSeconds || 0),
    );
    var pendingKeys = new Set(
      getRelearnState()
        .queue.filter(function (entry) {
          return isRescueGate(entry.skill);
        })
        .map(function (entry) {
          return rescueStateKey(entry.wordId, entry.skill);
        }),
    );
    var readyKeys = new Set(
      readyRescueRelearnTasks(Date.now()).map(function (task) {
        return rescueStateKey(task.wordId, task.gate);
      }),
    );
    var availableTasks = tasks.filter(function (task) {
      var key = rescueStateKey(task.wordId, task.gate);
      return !pendingKeys.has(key) || readyKeys.has(key);
    });
    var seconds = tasks.reduce(function (total, task) {
      return total + Number(RESCUE_GATE_SECONDS[task.gate] || 40);
    }, 0);
    var minimumSeconds = availableTasks.reduce(function (minimum, task) {
      return Math.min(minimum, Number(RESCUE_GATE_SECONDS[task.gate] || 40));
    }, Infinity);
    var budgetAllowsTask = minimumSeconds !== Infinity && availableSeconds >= minimumSeconds;
    var canStart = availableTasks.length > 0 && budgetAllowsTask;
    return {
      roundLabel: round === 1 ? '第 1 轮 · 6 词' : '第 2 轮 · 6 词',
      remaining: tasks.length,
      canStart: canStart,
      minutes: Math.max(1, Math.ceil(seconds / 60)),
      buttonLabel: canStart
        ? '开始 ' + Math.max(1, Math.ceil(Math.min(seconds, availableSeconds) / 60)) + ' 分钟'
        : tasks.length && !availableTasks.length
          ? '等待间隔回测'
          : tasks.length && !budgetAllowsTask
            ? '今日额度已完成'
            : '本轮完成',
      copy: tasks.length
        ? canStart
          ? '只练学生卡住的声音、词形和词义；一次只出现一个动作。'
          : !availableTasks.length
            ? '错项正在拉开间隔；先练其他任务，稍后回来。'
            : '今日有效训练额度已用完；待练关卡已保存。'
        : rescuePendingContextCount()
          ? '受控关卡已完成；仍有原听力句待教师补录，不计掌握。'
          : '12 个难词的独立关卡均已完成。',
    };
  }

  function rescuePendingContextCount() {
    return Object.keys(getRescueState().gates).filter(function (key) {
      return Boolean(getRescueState().gates[key] && getRescueState().gates[key].pendingContext);
    }).length;
  }

  function ensureDailyClock() {
    var dateKey = localDateKey();
    if (!state.daily) state.daily = defaultState().daily;
    if (state.daily.date === dateKey) return;
    var rolledIds = (state.daily.carryoverIds || []).concat(
      (state.daily.newIds || []).filter(function (id) {
        return hasAnyAttempt(id) && hasUnattemptedSkill(id);
      }),
    );
    state.daily = {
      date: dateKey,
      newIds: [],
      carryoverIds: uniqueIds(rolledIds),
      newSelectionDone: false,
      completedAt: 0,
      practicedSeconds: 0,
    };
    saveState();
  }

  function renderPracticeHub() {
    currentView = 'practice';
    setActiveNav('practice');
    var repairCount = buildRepairQueue(10).length;
    main.innerHTML =
      '<section class="page-heading compact-page-heading"><div><p class="eyebrow">PRACTICE</p><h1>专项练习</h1></div></section>' +
      '<section class="practice-hub">' +
      (repairCount
        ? '<article class="panel practice-repair-card"><div><span class="mini-metric">' +
          repairCount +
          ' 项待复习</span><h2>先修复最薄弱的一项</h2></div><button class="primary-button" type="button" data-action="start-weak">开始补弱</button></article>'
        : '') +
      '<section class="practice-grid" aria-label="按能力练习">' +
      compactPracticeCard('◉', '听音', 'sound') +
      compactPracticeCard('⌨', '拼写', 'spell') +
      compactPracticeCard('⇄', '词形', 'forms') +
      compactPracticeCard('¶', '句用', 'sentence') +
      '</section>' +
      '<button class="panel semantic-library-link hard-words-library-link" type="button" data-action="go-view" data-view="hard-words"><span aria-hidden="true">≡</span><span><strong>学生难词总表</strong><small>按不会读、不会意思、两项都不会筛选</small></span><i aria-hidden="true">→</i></button>' +
      '<button class="panel semantic-library-link" type="button" data-action="go-view" data-view="visual"><span aria-hidden="true">◫</span><span><strong>语义与图像题库</strong><small>近反义 · 同音同形 · 分类</small></span><i aria-hidden="true">→</i></button>' +
      '</section>';
  }

  function renderHardWordsCatalog() {
    currentView = 'hard-words';
    setActiveNav('hard-words');
    main.innerHTML =
      '<section class="page-heading compact-page-heading hard-words-heading"><div><p class="eyebrow">LEARNER WORD LIST</p><h1>学生难词总表</h1><p>这里收录学生亲自标记的难词。未经审校的词只显示词形和困难类型，不提前给答案。</p></div></section>' +
      '<section class="hard-words-shell" data-hard-words-view>' +
      '<div data-hard-words-content>' +
      renderHardWordsLoading() +
      '</div></section>';
    if (hardWordsLoadState === 'ready' && hardWordsCatalog) {
      renderHardWordsContent();
    } else if (hardWordsLoadState === 'error') {
      renderHardWordsError();
    } else {
      loadHardWordsCatalog(false);
    }
  }

  function renderHardWordsLoading() {
    return (
      '<div class="panel hard-words-loading" role="status" aria-live="polite">' +
      '<span class="loading-dot" aria-hidden="true"></span><p>正在载入学生难词……</p></div>'
    );
  }

  function loadHardWordsCatalog(force) {
    if (hardWordsLoadState === 'loading' && !force) return;
    hardWordsLoadState = 'loading';
    hardWordsLoadError = '';
    var mount = document.querySelector('[data-hard-words-content]');
    if (mount) mount.innerHTML = renderHardWordsLoading();
    fetchHardWordsCatalog(force ? 'reload' : 'no-cache')
      .then(acceptHardWordsCatalog)
      .catch(failHardWordsCatalog);
  }

  function fetchHardWordsCatalog(cacheMode) {
    var catalogUrl = './corpus/student-hard-words.json';
    var networkError = null;
    return fetch(catalogUrl, { cache: cacheMode })
      .then(function (response) {
        if (!response.ok) throw new Error('服务器返回 ' + response.status);
        return response;
      })
      .catch(function (error) {
        networkError = error;
        if (!('caches' in window)) throw error;
        return caches.match(catalogUrl).then(function (cached) {
          if (cached) return cached;
          throw networkError;
        });
      })
      .then(function (response) {
        return response.json();
      });
  }

  function acceptHardWordsCatalog(payload) {
    validateHardWordsCatalog(payload);
    hardWordsCatalog = payload;
    sanitiseHardWordPracticeForCatalog();
    sanitiseHardWordSoundFormForCatalog();
    hardWordsCatalog.entries.forEach(function (entry) {
      entry._searchText = normaliseAnswer(
        String(entry.displayWord || '') + ' ' + String(entry.normalizedHeadword || ''),
      );
    });
    hardWordsLoadState = 'ready';
    hardWordsLoadError = '';
    if (currentView === 'hard-words') renderHardWordsContent();
  }

  function sanitiseHardWordSoundFormForCatalog() {
    if (!hardWordsCatalog) return;
    var validIds = new Set(
      hardWordsCatalog.entries.map(function (entry) {
        return entry.id;
      }),
    );
    Object.keys(hardWordSoundFormState.entries).forEach(function (wordId) {
      if (!validIds.has(wordId)) delete hardWordSoundFormState.entries[wordId];
    });
    hardWordSoundFormState.journal = hardWordSoundFormState.journal.filter(function (item) {
      return validIds.has(item.wordId);
    });
    hardWordSoundFormState.active = normaliseHardWordSoundFormActive(hardWordSoundFormState.active);
    var active = hardWordSoundFormState.active;
    if (
      active &&
      active.queue.some(function (item) {
        return !validIds.has(item.wordId);
      })
    ) {
      hardWordSoundFormState.active = null;
      dualPrototypeState = null;
    }
    saveHardWordSoundFormState();
    if (hardWordSoundFormState.active && currentView === 'hard-words') {
      ensureHardWordAudioManifest()
        .then(function () {
          if (!hardWordSoundFormState.active || currentView !== 'hard-words') return;
          dualPrototypeState = hardWordSoundFormState.active;
          renderDualPrototype();
        })
        .catch(function () {
          showToast('正式声形练习暂时无法恢复：' + hardWordAudioLoadError);
        });
    }
  }

  function fetchHardWordAudioManifest(cacheMode) {
    var networkError = null;
    return fetch(HARD_WORD_AUDIO_MANIFEST_URL, { cache: cacheMode || 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('练习音频服务器返回 ' + response.status);
        return response;
      })
      .catch(function (error) {
        networkError = error;
        if (!('caches' in window)) throw error;
        return caches.match(HARD_WORD_AUDIO_MANIFEST_URL).then(function (cached) {
          if (cached) return cached;
          throw networkError;
        });
      })
      .then(function (response) {
        return response.json();
      });
  }

  function hasExactObjectKeys(value, expectedKeys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var actual = Object.keys(value).sort();
    var expected = expectedKeys.slice().sort();
    return (
      actual.length === expected.length &&
      actual.every(function (key, index) {
        return key === expected[index];
      })
    );
  }

  function validateHardWordAudioManifest(payload) {
    var manifestKeys = [
      'catalog',
      'coverage',
      'entries',
      'generationProfile',
      'privacy',
      'provenance',
      'schemaVersion',
    ];
    var coverage = payload && payload.coverage;
    if (
      !payload ||
      !hasExactObjectKeys(payload, manifestKeys) ||
      payload.schemaVersion !== 1 ||
      !hasExactObjectKeys(payload.catalog, ['catalogId', 'entryCount', 'path', 'sha256']) ||
      payload.catalog.catalogId !== HARD_WORD_AUDIO_CATALOG_ID ||
      payload.catalog.entryCount !== 751 ||
      payload.catalog.path !== 'public/ielts/corpus/student-hard-words.json' ||
      payload.catalog.sha256 !== HARD_WORD_CATALOG_SHA256 ||
      !hasExactObjectKeys(coverage, [
        'accents',
        'audioLinks',
        'generatedFiles',
        'generatedHeadwords',
        'headwords',
        'sharedAudioLinks',
        'sharedHeadwords',
        'sourceAuditedHeadwords',
      ]) ||
      coverage.headwords !== 751 ||
      coverage.audioLinks !== 1502 ||
      coverage.accents !== 2 ||
      coverage.generatedFiles !== 1456 ||
      coverage.generatedHeadwords !== 728 ||
      coverage.sharedAudioLinks !== 46 ||
      coverage.sharedHeadwords !== 23 ||
      coverage.sourceAuditedHeadwords !== 12 ||
      !hasExactObjectKeys(payload.privacy, [
        'containsLearnerIdentity',
        'generatedTextSentToExternalService',
        'lexicalAnswerFieldsIncluded',
      ]) ||
      payload.privacy.containsLearnerIdentity !== false ||
      payload.privacy.generatedTextSentToExternalService !== false ||
      payload.privacy.lexicalAnswerFieldsIncluded !== false ||
      !hasExactObjectKeys(payload.provenance, [
        'assurance',
        'generatedAudioOrigin',
        'limitation',
        'sharedAudioOrigin',
      ]) ||
      typeof payload.provenance.assurance !== 'string' ||
      typeof payload.provenance.generatedAudioOrigin !== 'string' ||
      typeof payload.provenance.limitation !== 'string' ||
      typeof payload.provenance.sharedAudioOrigin !== 'string' ||
      !hasExactObjectKeys(payload.generationProfile, [
        'appliesToAssetSource',
        'id',
        'parameters',
        'pipelineVersion',
        'synthesisEngine',
        'synthesisEngineVersion',
      ]) ||
      !hasExactObjectKeys(payload.generationProfile.parameters, [
        'channels',
        'between_repetitions_seconds',
        'closing_silence_seconds',
        'codec',
        'ffmpeg_quality',
        'opening_silence_seconds',
        'repeat_count',
        'sample_rate_hz',
        'source_channels',
        'source_codec',
        'source_container',
        'source_sample_rate_hz',
        'speech_rate_wpm',
      ]) ||
      payload.generationProfile.appliesToAssetSource !== 'hard_word_generated' ||
      payload.generationProfile.id !== 'macos-say-hard-word-2026-08-13.2' ||
      payload.generationProfile.pipelineVersion !== '2026-08-13.2' ||
      payload.generationProfile.synthesisEngine !== 'macos-say' ||
      payload.generationProfile.synthesisEngineVersion !== 'macOS-26.5-25F71' ||
      payload.generationProfile.parameters.between_repetitions_seconds !== 0.55 ||
      payload.generationProfile.parameters.channels !== 1 ||
      payload.generationProfile.parameters.closing_silence_seconds !== 0.3 ||
      payload.generationProfile.parameters.codec !== 'mp3' ||
      payload.generationProfile.parameters.ffmpeg_quality !== 2 ||
      payload.generationProfile.parameters.opening_silence_seconds !== 0.7 ||
      payload.generationProfile.parameters.repeat_count !== 3 ||
      payload.generationProfile.parameters.sample_rate_hz !== 24000 ||
      payload.generationProfile.parameters.source_channels !== 1 ||
      payload.generationProfile.parameters.source_codec !== 'pcm_s16be' ||
      payload.generationProfile.parameters.source_container !== 'aiff' ||
      payload.generationProfile.parameters.source_sample_rate_hz !== 22050 ||
      payload.generationProfile.parameters.speech_rate_wpm !== 175 ||
      !Array.isArray(payload.entries) ||
      payload.entries.length !== 751
    ) {
      throw new Error('难词自然语音清单结构或覆盖不完整');
    }
    if (!hardWordsCatalog || hardWordsCatalog.entries.length !== 751) {
      throw new Error('难词表尚未准备好');
    }
    var catalogById = new Map(
      hardWordsCatalog.entries.map(function (entry) {
        return [entry.id, entry];
      }),
    );
    var ids = new Set();
    var sharedAudioLinks = 0;
    var generatedAudioLinks = 0;
    var generatedProfileSha256 =
      '1afdacac57993e5dcf0d787479210ea3a6ca77d526cdbac59ef3643957320bcc';
    var sharedProfileSha256 =
      '07f4cd8abcdf6b72b0b8a75ee4c86ae572c6d0c7ba7acd6beec5e1a34fd4cda3';
    var audioKeys = [
      'accent',
      'assetSource',
      'audioSha256',
      'bindingSha256',
      'bytes',
      'channels',
      'codec',
      'durationSeconds',
      'generationProfile',
      'generationProfileSha256',
      'kind',
      'path',
      'sampleRateHz',
      'src',
      'textSha256',
      'voice',
    ];
    payload.entries.forEach(function (entry) {
      if (!hasExactObjectKeys(entry, ['audio', 'entryId', 'headword', 'lexicalReview'])) {
        throw new Error('难词自然语音条目字段无效');
      }
      var entryId = String(entry.entryId || '');
      var catalogEntry = catalogById.get(entryId);
      var headword = String(entry.headword || '').trim();
      var audio = entry.audio;
      if (
        !catalogEntry ||
        ids.has(entryId) ||
        normaliseAnswer(headword) !== normaliseAnswer(catalogEntry.displayWord) ||
        !hasExactObjectKeys(entry.lexicalReview, ['sourceAudited', 'status']) ||
        entry.lexicalReview.status !== catalogEntry.reviewStatus ||
        entry.lexicalReview.sourceAudited !==
          (catalogEntry.reviewStatus === 'source_audited_for_rescue') ||
        !hasExactObjectKeys(audio, ['uk', 'us'])
      ) {
        throw new Error('难词自然语音条目未通过身份校验');
      }
      ids.add(entryId);
      ['uk', 'us'].forEach(function (accent) {
        var item = audio[accent];
        var src = String((item && item.src) || '');
        var path = String((item && item.path) || '');
        var isGenerated = item && item.assetSource === 'hard_word_generated';
        var isShared = item && item.assetSource === 'shared_reviewed_word';
        var expectedVoice = isGenerated
          ? accent === 'uk'
            ? 'Daniel'
            : 'Samantha'
          : accent === 'uk'
            ? 'en-GB-SoniaNeural'
            : 'en-US-AvaNeural';
        var expectedProfile = isGenerated
          ? 'macos-say-hard-word-2026-08-13.2'
          : 'edge-tts-word-2026-07-30.1';
        var expectedProfileSha256 = isGenerated
          ? generatedProfileSha256
          : sharedProfileSha256;
        if (
          !hasExactObjectKeys(item, audioKeys) ||
          item.accent !== accent ||
          item.kind !== 'word' ||
          item.voice !== expectedVoice ||
          (!isGenerated && !isShared) ||
          item.generationProfile !== expectedProfile ||
          item.generationProfileSha256 !== expectedProfileSha256 ||
          src !== './audio/' + path ||
          path.indexOf('..') >= 0 ||
          !path.endsWith('.mp3') ||
          (isGenerated && path !== 'hard-words/' + accent + '/' + entryId + '.mp3') ||
          (isShared && !path.startsWith(accent + '/')) ||
          !/^[a-f0-9]{64}$/.test(String(item.audioSha256 || '')) ||
          !/^[a-f0-9]{64}$/.test(String(item.bindingSha256 || '')) ||
          !/^[a-f0-9]{64}$/.test(String(item.generationProfileSha256 || '')) ||
          !/^[a-f0-9]{64}$/.test(String(item.textSha256 || '')) ||
          !String(item.generationProfile || '') ||
          Number(item.bytes) <= 1000 ||
          Number(item.durationSeconds) <= 0 ||
          Number(item.sampleRateHz) !== 24000 ||
          Number(item.channels) !== 1 ||
          item.codec !== 'mp3'
        ) {
          throw new Error('难词自然语音文件绑定无效');
        }
        if (isGenerated) generatedAudioLinks += 1;
        if (isShared) sharedAudioLinks += 1;
      });
    });
    if (ids.size !== 751 || generatedAudioLinks !== 1456 || sharedAudioLinks !== 46) {
      throw new Error('难词自然语音清单覆盖或来源数量无效');
    }
  }

  function ensureHardWordAudioManifest() {
    if (hardWordAudioLoadState === 'ready' && hardWordAudioManifest) {
      return Promise.resolve(hardWordAudioManifest);
    }
    if (hardWordAudioLoadState === 'loading' && ensureHardWordAudioManifest.promise) {
      return ensureHardWordAudioManifest.promise;
    }
    hardWordAudioLoadState = 'loading';
    hardWordAudioLoadError = '';
    ensureHardWordAudioManifest.promise = fetchHardWordAudioManifest('no-cache')
      .then(function (payload) {
        validateHardWordAudioManifest(payload);
        hardWordAudioManifest = payload;
        hardWordAudioLoadState = 'ready';
        return payload;
      })
      .catch(function (error) {
        hardWordAudioManifest = null;
        hardWordAudioLoadState = 'error';
        hardWordAudioLoadError = error && error.message ? error.message : '自然语音载入失败';
        throw error;
      })
      .finally(function () {
        ensureHardWordAudioManifest.promise = null;
      });
    return ensureHardWordAudioManifest.promise;
  }

  function findHardWordAudioEntry(wordId) {
    if (!hardWordAudioManifest) return null;
    return (
      hardWordAudioManifest.entries.find(function (entry) {
        return String(entry.entryId || entry.id) === wordId;
      }) || null
    );
  }

  function sanitiseHardWordPracticeForCatalog() {
    if (!hardWordsCatalog) return;
    var changed = false;
    var validIds = new Set(
      hardWordsCatalog.entries.map(function (entry) {
        return entry.id;
      }),
    );
    Object.keys(hardWordPracticeState.entries).forEach(function (wordId) {
      if (!validIds.has(wordId)) {
        delete hardWordPracticeState.entries[wordId];
        changed = true;
      }
    });
    var filteredJournal = hardWordPracticeState.journal.filter(function (item) {
      return validIds.has(item.wordId);
    });
    if (filteredJournal.length !== hardWordPracticeState.journal.length) {
      hardWordPracticeState.journal = filteredJournal;
      changed = true;
    }
    var active = hardWordPracticeState.active;
    if (active) {
      var filteredWordIds = active.wordIds.filter(function (wordId) {
        return validIds.has(wordId);
      });
      if (filteredWordIds.length !== active.wordIds.length) {
        active.wordIds = filteredWordIds;
        changed = true;
      }
      if (!active.wordIds.length || active.index >= active.wordIds.length) {
        hardWordPracticeState.active = null;
        changed = true;
      }
    }
    if (changed) saveHardWordPracticeState();
  }

  function validateHardWordsCatalog(payload) {
    var allowedReviewStatuses = [
      'source_audited_for_rescue',
      'needs_sense_confirmation',
      'needs_lexical_approval',
      'needs_lexical_source',
      'needs_proper_noun_and_sense_review',
    ];
    var allowedPracticeStatuses = ['in_rescue_training', 'awaiting_exercise_authoring'];
    var allowedEntryFields = [
      'id',
      'displayWord',
      'normalizedHeadword',
      'difficultyCode',
      'needsPronunciation',
      'needsMeaning',
      'abilityTags',
      'reportCount',
      'corpusMatchStatus',
      'reviewStatus',
      'practiceStatus',
    ];
    var requiredOmissions = [
      'learner_name',
      'raw_token',
      'received_at',
      'batch_id',
      'lexical_definition',
      'part_of_speech',
      'cefr',
      'ipa',
    ];
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Number(payload.schemaVersion) !== 1 ||
      payload.catalogId !== 'student-hard-words-2026-08-12' ||
      !payload.statistics ||
      typeof payload.statistics !== 'object' ||
      !payload.difficultyLegend ||
      typeof payload.difficultyLegend !== 'object' ||
      !Array.isArray(payload.entries) ||
      !payload.privacy ||
      typeof payload.privacy !== 'object' ||
      payload.privacy.containsLearnerIdentity !== false ||
      !Array.isArray(payload.privacy.omittedFields) ||
      !requiredOmissions.every(function (field) {
        return payload.privacy.omittedFields.indexOf(field) >= 0;
      })
    ) {
      throw new Error('学生难词文件结构或隐私声明不完整');
    }

    var ids = new Set();
    var headwords = new Set();
    var counts = { 1: 0, 2: 0, 3: 0 };
    var trainingHeadwords = new Set();
    var normalizedReportCount = 0;
    payload.entries.forEach(function (entry) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('学生难词条目结构不完整');
      }
      var id = String(entry.id || '');
      var displayWord = String(entry.displayWord || '').trim();
      var headword = normaliseAnswer(entry.normalizedHeadword);
      var code = String(entry.difficultyCode || '');
      var routeValid =
        (code === '1' && entry.needsPronunciation === true && entry.needsMeaning === false) ||
        (code === '2' && entry.needsPronunciation === false && entry.needsMeaning === true) ||
        (code === '3' && entry.needsPronunciation === true && entry.needsMeaning === true);
      var reportCount = Number(entry.reportCount);
      var reportCountValid = Number.isInteger(reportCount) && reportCount >= 1;
      var unexpectedEntryField = Object.keys(entry).some(function (field) {
        return allowedEntryFields.indexOf(field) < 0;
      });
      var expectedAbilityTags =
        code === '1'
          ? ['pronunciation']
          : code === '2'
            ? ['meaning']
            : ['pronunciation', 'meaning'];
      var abilityTagsValid =
        Array.isArray(entry.abilityTags) &&
        entry.abilityTags.length === expectedAbilityTags.length &&
        expectedAbilityTags.every(function (tag) {
          return entry.abilityTags.indexOf(tag) >= 0;
        });
      var sourcePracticePairValid =
        (entry.reviewStatus === 'source_audited_for_rescue') ===
        (entry.practiceStatus === 'in_rescue_training');
      if (
        !id ||
        !displayWord ||
        !headword ||
        normaliseAnswer(displayWord) !== headword ||
        ids.has(id) ||
        headwords.has(headword) ||
        !routeValid ||
        !abilityTagsValid ||
        !reportCountValid ||
        unexpectedEntryField ||
        ['active', 'candidate_only', 'unmatched'].indexOf(entry.corpusMatchStatus) < 0 ||
        allowedReviewStatuses.indexOf(entry.reviewStatus) < 0 ||
        allowedPracticeStatuses.indexOf(entry.practiceStatus) < 0 ||
        !sourcePracticePairValid
      ) {
        throw new Error('学生难词条目未通过一致性或隐私校验');
      }
      ids.add(id);
      headwords.add(headword);
      counts[code] += 1;
      normalizedReportCount += reportCount;
      if (entry.practiceStatus === 'in_rescue_training') trainingHeadwords.add(headword);
    });

    var reportedCounts = payload.statistics.difficulty_counts || {};
    var publishedRescueHeadwords = new Set(
      RESCUE_WORDS.map(function (word) {
        return normaliseAnswer(word.word);
      }),
    );
    var trainingMatchesPublished =
      trainingHeadwords.size === publishedRescueHeadwords.size &&
      Array.from(trainingHeadwords).every(function (headword) {
        return publishedRescueHeadwords.has(headword);
      });
    if (
      payload.entries.length !== 751 ||
      Number(payload.statistics.unique_headwords) !== 751 ||
      normalizedReportCount !== 756 ||
      Number(reportedCounts[1]) !== 215 ||
      Number(reportedCounts[2]) !== 223 ||
      Number(reportedCounts[3]) !== 313 ||
      Number(payload.statistics.normalized_reports) !== normalizedReportCount ||
      Number(payload.statistics.duplicate_report_count) !==
        normalizedReportCount - payload.entries.length ||
      counts[1] !== 215 ||
      counts[2] !== 223 ||
      counts[3] !== 313 ||
      !trainingMatchesPublished
    ) {
      throw new Error('学生难词统计或练习清单与条目不一致');
    }
  }

  function failHardWordsCatalog(error) {
    hardWordsCatalog = null;
    hardWordsLoadState = 'error';
    hardWordsLoadError = error && error.message ? error.message : '网络请求失败';
    if (currentView === 'hard-words') renderHardWordsError();
  }

  function renderHardWordsError() {
    var mount = document.querySelector('[data-hard-words-content]');
    if (!mount) return;
    mount.innerHTML =
      '<div class="panel hard-words-error" role="alert"><strong>难词表暂时没有载入</strong><p>' +
      esc(hardWordsLoadError) +
      '。可以检查网络后重试，其他训练不受影响。</p><button class="primary-button" type="button" data-action="hard-words-retry">重新载入</button></div>';
  }

  function hardWordsCounts(entries) {
    return entries.reduce(
      function (counts, entry) {
        var code = String(entry.difficultyCode || '');
        if (Object.prototype.hasOwnProperty.call(counts, code)) counts[code] += 1;
        return counts;
      },
      { 1: 0, 2: 0, 3: 0 },
    );
  }

  function defaultHardWordPracticeState() {
    return {
      version: 1,
      entries: {},
      journal: [],
      cursors: { spell: 0, sentence: 0 },
      active: null,
    };
  }

  function normaliseHardWordCounter(value, maximum) {
    return Math.min(maximum, Math.max(0, Math.floor(Number(value) || 0)));
  }

  function normaliseHardWordPracticeEntries(savedEntries) {
    if (!savedEntries || typeof savedEntries !== 'object' || Array.isArray(savedEntries)) return {};
    var entries = {};
    Object.keys(savedEntries)
      .slice(0, 1000)
      .forEach(function (wordId) {
        var source = savedEntries[wordId];
        if (!source || typeof source !== 'object' || Array.isArray(source)) return;
        var spell = source.spell && typeof source.spell === 'object' ? source.spell : {};
        var sentence =
          source.sentence && typeof source.sentence === 'object' ? source.sentence : {};
        var sentenceStatus = String(sentence.status || '');
        entries[String(wordId)] = {
          spell: {
            attempts: normaliseHardWordCounter(spell.attempts, 10000),
            blindPasses: normaliseHardWordCounter(spell.blindPasses, 10000),
            repairPasses: normaliseHardWordCounter(spell.repairPasses, 10000),
            skips: normaliseHardWordCounter(spell.skips, 10000),
            lastAt: normaliseHardWordCounter(spell.lastAt, Number.MAX_SAFE_INTEGER),
          },
          sentence: {
            submissions: normaliseHardWordCounter(sentence.submissions, 10000),
            skips: normaliseHardWordCounter(sentence.skips, 10000),
            draft: String(sentence.draft || '').slice(0, 600),
            status:
              ['pending_human_review', 'needs_revision', 'skipped'].indexOf(sentenceStatus) >= 0
                ? sentenceStatus
                : '',
            lastAt: normaliseHardWordCounter(sentence.lastAt, Number.MAX_SAFE_INTEGER),
          },
        };
      });
    return entries;
  }

  function loadHardWordPracticeState(rawOverride) {
    try {
      var saved =
        rawOverride === undefined
          ? JSON.parse(localStorage.getItem(HARD_WORD_PRACTICE_STORAGE_KEY) || 'null')
          : rawOverride;
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        return defaultHardWordPracticeState();
      }
      var active =
        saved.active &&
        typeof saved.active === 'object' &&
        ['spell', 'sentence'].indexOf(saved.active.mode) >= 0 &&
        Array.isArray(saved.active.wordIds)
          ? {
              mode: saved.active.mode,
              wordIds: saved.active.wordIds.map(String).slice(0, 10),
              index: Math.max(0, Math.floor(Number(saved.active.index) || 0)),
              stage:
                saved.active.mode === 'spell' &&
                ['memory', 'recall'].indexOf(saved.active.stage) >= 0
                  ? saved.active.stage
                  : saved.active.mode === 'sentence'
                    ? 'writing'
                    : 'memory',
              repaired: saved.active.mode === 'spell' && Boolean(saved.active.repaired),
              submitted:
                saved.active.mode === 'spell' &&
                ['correct', 'incorrect', 'skipped'].indexOf(saved.active.lastResult) >= 0,
              lastResult:
                saved.active.mode === 'spell' &&
                ['correct', 'incorrect', 'skipped'].indexOf(saved.active.lastResult) >= 0
                  ? saved.active.lastResult
                  : '',
            }
          : null;
      return {
        version: 1,
        entries: normaliseHardWordPracticeEntries(saved.entries),
        journal: Array.isArray(saved.journal)
          ? saved.journal
              .filter(function (item) {
                return (
                  item &&
                  typeof item === 'object' &&
                  ['spell', 'sentence'].indexOf(item.mode) >= 0 &&
                  [
                    'blind_pass',
                    'repair_pass',
                    'incorrect',
                    'skipped',
                    'pending_human_review',
                  ].indexOf(item.outcome) >= 0
                );
              })
              .map(function (item) {
                return {
                  wordId: String(item.wordId || ''),
                  mode: item.mode,
                  outcome: item.outcome,
                  at: normaliseHardWordCounter(item.at, Number.MAX_SAFE_INTEGER),
                };
              })
              .filter(function (item) {
                return Boolean(item.wordId);
              })
              .slice(-240)
          : [],
        cursors: {
          spell: Math.max(0, Math.floor(Number(saved.cursors && saved.cursors.spell) || 0)),
          sentence: Math.max(0, Math.floor(Number(saved.cursors && saved.cursors.sentence) || 0)),
        },
        active: active,
      };
    } catch (error) {
      return defaultHardWordPracticeState();
    }
  }

  function saveHardWordPracticeState() {
    try {
      localStorage.setItem(HARD_WORD_PRACTICE_STORAGE_KEY, JSON.stringify(hardWordPracticeState));
    } catch (error) {
      showToast('这台设备暂时无法保存难词练习进度。');
    }
  }

  function defaultHardWordSoundFormState() {
    return {
      version: 1,
      catalogId: HARD_WORD_AUDIO_CATALOG_ID,
      cursor: 0,
      entries: {},
      journal: [],
      active: null,
    };
  }

  function normaliseSoundFormStatus(value, allowed) {
    var status = String(value || '');
    return allowed.indexOf(status) >= 0 ? status : '';
  }

  function normaliseHardWordSoundFormEntries(savedEntries) {
    if (!savedEntries || typeof savedEntries !== 'object' || Array.isArray(savedEntries)) return {};
    var entries = {};
    Object.keys(savedEntries)
      .slice(0, 1000)
      .forEach(function (wordId) {
        var source = savedEntries[wordId];
        if (!source || typeof source !== 'object' || Array.isArray(source)) return;
        var read = source.read && typeof source.read === 'object' ? source.read : {};
        var spell = source.spell && typeof source.spell === 'object' ? source.spell : {};
        entries[String(wordId)] = {
          read: {
            attempts: normaliseHardWordCounter(read.attempts, 10000),
            recordings: normaliseHardWordCounter(read.recordings, 10000),
            skips: normaliseHardWordCounter(read.skips, 10000),
            lastAt: normaliseHardWordCounter(read.lastAt, Number.MAX_SAFE_INTEGER),
            status: normaliseSoundFormStatus(read.status, [
              'recorded_pending_human_review',
              'skipped',
            ]),
          },
          spell: {
            attempts: normaliseHardWordCounter(spell.attempts, 10000),
            independentPasses: normaliseHardWordCounter(spell.independentPasses, 10000),
            repairNeeded: normaliseHardWordCounter(spell.repairNeeded, 10000),
            skips: normaliseHardWordCounter(spell.skips, 10000),
            lastAt: normaliseHardWordCounter(spell.lastAt, Number.MAX_SAFE_INTEGER),
            status: normaliseSoundFormStatus(spell.status, [
              'independent_correct',
              'needs_repair',
              'skipped',
            ]),
          },
        };
      });
    return entries;
  }

  function normaliseHardWordSoundFormActive(raw, catalogOverride) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.queue)) {
      return null;
    }
    var queue = raw.queue
      .slice(0, HARD_WORD_SOUND_FORM_BATCH_SIZE * 2)
      .map(function (item) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        var type = item.type === 'read' || item.type === 'spell' ? item.type : '';
        var wordId = String(item.wordId || '');
        return type && wordId ? { wordId: wordId, type: type } : null;
      })
      .filter(Boolean);
    if (queue.length !== HARD_WORD_SOUND_FORM_BATCH_SIZE * 2) return null;
    var counts = {};
    queue.forEach(function (item, index) {
      counts[item.wordId] = counts[item.wordId] || { read: 0, spell: 0, positions: [] };
      counts[item.wordId][item.type] += 1;
      counts[item.wordId].positions.push(index);
    });
    var ids = Object.keys(counts);
    if (
      ids.length !== HARD_WORD_SOUND_FORM_BATCH_SIZE ||
      ids.some(function (wordId) {
        var pair = counts[wordId];
        return pair.read !== 1 || pair.spell !== 1 || pair.positions[1] - pair.positions[0] !== 10;
      }) ||
      queue.slice(0, HARD_WORD_SOUND_FORM_BATCH_SIZE).some(function (item, index) {
        var paired = queue[index + HARD_WORD_SOUND_FORM_BATCH_SIZE];
        var expectedType =
          index % 2 === 0 ? queue[0].type : queue[0].type === 'read' ? 'spell' : 'read';
        return (
          item.type !== expectedType ||
          !paired ||
          paired.wordId !== item.wordId ||
          paired.type === item.type
        );
      })
    ) {
      return null;
    }
    var index = Math.max(0, Math.min(queue.length, Math.floor(Number(raw.index) || 0)));
    var item = queue[index] || null;
    var allowedSteps = item
      ? item.type === 'read'
        ? ['read-info', 'read-syllables', 'read-record', 'read-compare']
        : ['spell-count', 'spell-syllables', 'spell-final', 'spell-result']
      : ['summary'];
    var step =
      allowedSteps.indexOf(raw.step) >= 0 ? raw.step : item ? item.type + '-info' : 'summary';
    if (item && item.type === 'spell' && step === 'spell-info') step = 'spell-count';
    if (step === 'read-compare') step = 'read-record';
    var task = raw.task && typeof raw.task === 'object' && !Array.isArray(raw.task) ? raw.task : {};
    var activeEntry =
      item && catalogOverride && Array.isArray(catalogOverride.entries)
        ? catalogOverride.entries.find(function (entry) {
            return entry.id === item.wordId;
          })
        : item && findHardWordEntry(item.wordId);
    var activeLength = activeEntry
      ? Array.from(String(activeEntry.displayWord || activeEntry.normalizedHeadword || '')).length
      : 80;
    var splitBoundaries = Array.isArray(task.splitBoundaries)
      ? task.splitBoundaries
          .map(Number)
          .filter(function (value, boundaryIndex, all) {
            return (
              Number.isInteger(value) &&
              value > 0 &&
              value < activeLength &&
              all.indexOf(value) === boundaryIndex
            );
          })
          .sort(function (a, b) {
            return a - b;
          })
          .slice(0, 30)
      : [];
    var safeResults = Array.isArray(raw.results)
      ? raw.results.slice(0, index).map(function (result, resultIndex) {
          var expected = queue[resultIndex];
          if (
            !result ||
            typeof result !== 'object' ||
            !expected ||
            String(result.wordId || '') !== expected.wordId ||
            result.type !== expected.type ||
            (expected.type === 'read'
              ? ['recorded_pending_human_review', 'skipped', 'technical_deferred']
              : ['independent_correct', 'needs_repair', 'skipped', 'technical_deferred']
            ).indexOf(String(result.status || '')) < 0
          ) {
            return null;
          }
          return {
            wordId: expected.wordId,
            type: expected.type,
            status: String(result.status),
          };
        })
      : [];
    if (
      safeResults.length !== index ||
      safeResults.some(function (result) {
        return !result;
      })
    ) {
      return null;
    }
    var safeSyllableCount = String(task.syllableCount || '').slice(0, 3);
    if (
      item &&
      item.type === 'spell' &&
      ['spell-syllables', 'spell-final', 'spell-result'].indexOf(step) >= 0 &&
      (!/^\d{1,2}$/.test(safeSyllableCount) ||
        Number(safeSyllableCount) < 1 ||
        Number(safeSyllableCount) > 12)
    ) {
      return null;
    }
    return {
      runId: String(raw.runId || '').slice(0, 80) || 'restored-' + Date.now(),
      queue: queue,
      index: index,
      step: item ? step : 'summary',
      results: safeResults,
      task: item
        ? {
            meaning: String(task.meaning || '').slice(0, 160),
            pos: String(task.pos || '').slice(0, 60),
            syllableCount: safeSyllableCount,
            syllables: String(task.syllables || '').slice(0, 160),
            splitBoundaries: splitBoundaries,
            spelling: String(task.spelling || '').slice(0, 120),
            audioReady: false,
            audioFailed: false,
            technicalFailure: false,
            error: '',
          }
        : null,
    };
  }

  function loadHardWordSoundFormState(rawOverride, catalogOverride) {
    try {
      var saved =
        rawOverride === undefined
          ? JSON.parse(localStorage.getItem(HARD_WORD_SOUND_FORM_STORAGE_KEY) || 'null')
          : rawOverride;
      if (
        !saved ||
        typeof saved !== 'object' ||
        Array.isArray(saved) ||
        Number(saved.version) !== 1 ||
        saved.catalogId !== HARD_WORD_AUDIO_CATALOG_ID
      ) {
        return defaultHardWordSoundFormState();
      }
      return {
        version: 1,
        catalogId: HARD_WORD_AUDIO_CATALOG_ID,
        cursor: Math.max(0, Math.floor(Number(saved.cursor) || 0)) % 751,
        entries: normaliseHardWordSoundFormEntries(saved.entries),
        journal: Array.isArray(saved.journal)
          ? saved.journal
              .filter(function (item) {
                return (
                  item &&
                  typeof item === 'object' &&
                  (item.type === 'read' || item.type === 'spell') &&
                  String(item.wordId || '')
                );
              })
              .map(function (item) {
                return {
                  wordId: String(item.wordId),
                  type: item.type,
                  status: normaliseSoundFormStatus(
                    item.status,
                    item.type === 'read'
                      ? ['recorded_pending_human_review', 'skipped', 'technical_deferred']
                      : ['independent_correct', 'needs_repair', 'skipped', 'technical_deferred'],
                  ),
                  at: normaliseHardWordCounter(item.at, Number.MAX_SAFE_INTEGER),
                };
              })
              .filter(function (item) {
                return Boolean(item.status);
              })
              .slice(-500)
          : [],
        active: normaliseHardWordSoundFormActive(saved.active, catalogOverride),
      };
    } catch (error) {
      return defaultHardWordSoundFormState();
    }
  }

  function saveHardWordSoundFormState() {
    hardWordSoundFormState.version = 1;
    hardWordSoundFormState.catalogId = HARD_WORD_AUDIO_CATALOG_ID;
    try {
      localStorage.setItem(
        HARD_WORD_SOUND_FORM_STORAGE_KEY,
        JSON.stringify(hardWordSoundFormState),
      );
    } catch (error) {
      showToast('这台设备暂时无法保存声形练习进度。');
    }
  }

  function validateImportedHardWordSoundFormState(raw, catalogOverride) {
    if (
      !catalogOverride ||
      !Array.isArray(catalogOverride.entries) ||
      catalogOverride.entries.length !== 751 ||
      !hasExactObjectKeys(raw, [
        'active',
        'catalogId',
        'cursor',
        'entries',
        'journal',
        'version',
      ]) ||
      raw.version !== 1 ||
      raw.catalogId !== HARD_WORD_AUDIO_CATALOG_ID ||
      !Number.isInteger(raw.cursor) ||
      raw.cursor < 0 ||
      raw.cursor >= 751 ||
      !raw.entries ||
      typeof raw.entries !== 'object' ||
      Array.isArray(raw.entries) ||
      Object.keys(raw.entries).length > 751 ||
      !Array.isArray(raw.journal) ||
      raw.journal.length > 500 ||
      (raw.active !== null &&
        (!raw.active || typeof raw.active !== 'object' || Array.isArray(raw.active)))
    ) {
      throw new Error('Invalid hard-word sound-form state');
    }
    var readKeys = ['attempts', 'lastAt', 'recordings', 'skips', 'status'];
    var spellKeys = ['attempts', 'independentPasses', 'lastAt', 'repairNeeded', 'skips', 'status'];
    Object.keys(raw.entries).forEach(function (wordId) {
      var entry = raw.entries[wordId];
      if (
        typeof wordId !== 'string' ||
        !wordId ||
        !hasExactObjectKeys(entry, ['read', 'spell']) ||
        !hasExactObjectKeys(entry.read, readKeys) ||
        !hasExactObjectKeys(entry.spell, spellKeys)
      ) {
        throw new Error('Invalid hard-word sound-form entry');
      }
      [
        [entry.read, readKeys],
        [entry.spell, spellKeys],
      ].forEach(function (group) {
        group[1]
          .filter(function (key) {
            return key !== 'status';
          })
          .forEach(function (key) {
            var maximum = key === 'lastAt' ? Number.MAX_SAFE_INTEGER : 10000;
            if (!Number.isInteger(group[0][key]) || group[0][key] < 0 || group[0][key] > maximum) {
              throw new Error('Invalid hard-word sound-form counter');
            }
          });
      });
      if (
        ['', 'recorded_pending_human_review', 'skipped'].indexOf(entry.read.status) < 0 ||
        ['', 'independent_correct', 'needs_repair', 'skipped'].indexOf(entry.spell.status) < 0 ||
        entry.read.recordings + entry.read.skips !== entry.read.attempts ||
        entry.spell.independentPasses + entry.spell.repairNeeded + entry.spell.skips !==
          entry.spell.attempts ||
        (entry.read.attempts === 0
          ? entry.read.status !== '' || entry.read.lastAt !== 0
          : !entry.read.status || entry.read.lastAt === 0) ||
        (entry.spell.attempts === 0
          ? entry.spell.status !== '' || entry.spell.lastAt !== 0
          : !entry.spell.status || entry.spell.lastAt === 0)
      ) {
        throw new Error('Invalid hard-word sound-form status');
      }
    });
    raw.journal.forEach(function (item) {
      var allowed =
        item && item.type === 'read'
          ? ['recorded_pending_human_review', 'skipped', 'technical_deferred']
          : item && item.type === 'spell'
            ? ['independent_correct', 'needs_repair', 'skipped', 'technical_deferred']
            : [];
      if (
        !hasExactObjectKeys(item, ['at', 'status', 'type', 'wordId']) ||
        typeof item.wordId !== 'string' ||
        !item.wordId ||
        allowed.indexOf(item.status) < 0 ||
        !Number.isInteger(item.at) ||
        item.at < 0 ||
        item.at > Number.MAX_SAFE_INTEGER
      ) {
        throw new Error('Invalid hard-word sound-form journal');
      }
    });
    if (raw.active) {
      if (
        !hasExactObjectKeys(raw.active, ['index', 'queue', 'results', 'runId', 'step', 'task']) ||
        typeof raw.active.runId !== 'string' ||
        !raw.active.runId.trim() ||
        raw.active.runId.length > 80 ||
        !Number.isInteger(raw.active.index) ||
        raw.active.index < 0 ||
        raw.active.index > 20 ||
        !Array.isArray(raw.active.queue) ||
        raw.active.queue.length !== 20 ||
        !Array.isArray(raw.active.results) ||
        raw.active.results.length !== raw.active.index
      ) {
        throw new Error('Invalid hard-word sound-form active session');
      }
      raw.active.queue.forEach(function (item) {
        if (
          !hasExactObjectKeys(item, ['type', 'wordId']) ||
          ['read', 'spell'].indexOf(item.type) < 0 ||
          typeof item.wordId !== 'string' ||
          !item.wordId
        ) {
          throw new Error('Invalid hard-word sound-form queue');
        }
      });
      var currentImportedItem = raw.active.queue[raw.active.index] || null;
      var allowedImportedSteps = currentImportedItem
        ? currentImportedItem.type === 'read'
          ? ['read-info', 'read-syllables', 'read-record', 'read-compare']
          : ['spell-count', 'spell-syllables', 'spell-final', 'spell-result']
        : ['summary'];
      if (allowedImportedSteps.indexOf(raw.active.step) < 0) {
        throw new Error('Invalid hard-word sound-form step');
      }
      raw.active.results.forEach(function (result) {
        if (
          !hasExactObjectKeys(result, ['status', 'type', 'wordId']) ||
          typeof result.wordId !== 'string'
        ) {
          throw new Error('Invalid hard-word sound-form result');
        }
      });
      if (raw.active.index < 20) {
        if (
          !hasExactObjectKeys(raw.active.task, [
            'audioFailed',
            'audioReady',
            'error',
            'meaning',
            'pos',
            'spelling',
            'splitBoundaries',
            'syllableCount',
            'syllables',
            'technicalFailure',
          ]) ||
          typeof raw.active.task.audioFailed !== 'boolean' ||
          typeof raw.active.task.audioReady !== 'boolean' ||
          typeof raw.active.task.technicalFailure !== 'boolean' ||
          typeof raw.active.task.meaning !== 'string' ||
          raw.active.task.meaning.length > 160 ||
          typeof raw.active.task.pos !== 'string' ||
          raw.active.task.pos.length > 60 ||
          typeof raw.active.task.spelling !== 'string' ||
          raw.active.task.spelling.length > 120 ||
          typeof raw.active.task.syllableCount !== 'string' ||
          raw.active.task.syllableCount.length > 3 ||
          typeof raw.active.task.syllables !== 'string' ||
          raw.active.task.syllables.length > 160 ||
          typeof raw.active.task.error !== 'string' ||
          raw.active.task.error.length > 240 ||
          !Array.isArray(raw.active.task.splitBoundaries) ||
          raw.active.task.splitBoundaries.length > 30
        ) {
          throw new Error('Invalid hard-word sound-form task');
        }
        var importedEntry =
          catalogOverride && Array.isArray(catalogOverride.entries)
            ? catalogOverride.entries.find(function (entry) {
                return entry.id === currentImportedItem.wordId;
              })
            : null;
        var importedWordLength = importedEntry
          ? Array.from(String(importedEntry.displayWord || importedEntry.normalizedHeadword)).length
          : 0;
        if (
          !importedWordLength ||
          raw.active.task.splitBoundaries.some(function (value, index, list) {
            return (
              !Number.isInteger(value) ||
              value <= 0 ||
              value >= importedWordLength ||
              (index > 0 && list[index - 1] >= value)
            );
          })
        ) {
          throw new Error('Invalid hard-word sound-form split boundaries');
        }
      } else if (raw.active.task !== null || raw.active.step !== 'summary') {
        throw new Error('Invalid hard-word sound-form summary');
      }
    }
    var normalised = loadHardWordSoundFormState(raw, catalogOverride);
    if (raw.active && !normalised.active) {
      throw new Error('Invalid hard-word sound-form active session');
    }
    if (
      Object.keys(normalised.entries).length !== Object.keys(raw.entries).length ||
      normalised.journal.length !== raw.journal.length
    ) {
      throw new Error('Hard-word sound-form state was truncated');
    }
    return normalised;
  }

  function hardWordEntryState(wordId) {
    if (!hardWordPracticeState.entries[wordId]) {
      hardWordPracticeState.entries[wordId] = {
        spell: { attempts: 0, blindPasses: 0, repairPasses: 0, skips: 0, lastAt: 0 },
        sentence: { submissions: 0, skips: 0, draft: '', status: '', lastAt: 0 },
      };
    }
    var entryState = hardWordPracticeState.entries[wordId];
    if (!entryState.spell) {
      entryState.spell = { attempts: 0, blindPasses: 0, repairPasses: 0, skips: 0, lastAt: 0 };
    }
    if (!entryState.sentence) {
      entryState.sentence = { submissions: 0, skips: 0, draft: '', status: '', lastAt: 0 };
    }
    return entryState;
  }

  function hardWordPracticeSummary(entry) {
    var entryState = hardWordPracticeState.entries[entry.id] || {};
    var spell = entryState.spell || {};
    var sentence = entryState.sentence || {};
    var attempts = Math.max(0, Number(spell.attempts) || 0);
    var submissions = Math.max(0, Number(sentence.submissions) || 0);
    if (!attempts && !submissions) return '尚未练习';
    return '拼写 ' + attempts + ' 次 · 造句 ' + submissions + ' 次';
  }

  function hardWordCatalogProgress() {
    if (!hardWordsCatalog) return { independent: 0, sentences: 0 };
    return hardWordsCatalog.entries.reduce(
      function (summary, entry) {
        var entryState = hardWordPracticeState.entries[entry.id] || {};
        if (Number(entryState.spell && entryState.spell.blindPasses) > 0) {
          summary.independent += 1;
        }
        if (
          entryState.sentence &&
          entryState.sentence.status === 'pending_human_review' &&
          Number(entryState.sentence.submissions) > 0
        ) {
          summary.sentences += 1;
        }
        return summary;
      },
      { independent: 0, sentences: 0 },
    );
  }

  function hardWordSoundFormProgress() {
    return Object.keys(hardWordSoundFormState.entries).reduce(
      function (summary, wordId) {
        var entry = hardWordSoundFormState.entries[wordId] || {};
        if (Number(entry.read && entry.read.recordings) > 0) summary.recorded += 1;
        if (Number(entry.spell && entry.spell.independentPasses) > 0) summary.spelled += 1;
        return summary;
      },
      { recorded: 0, spelled: 0 },
    );
  }

  function appendHardWordJournal(wordId, mode, outcome) {
    hardWordPracticeState.journal.push({
      wordId: wordId,
      mode: mode,
      outcome: outcome,
      at: Date.now(),
    });
    hardWordPracticeState.journal = hardWordPracticeState.journal.slice(-240);
  }

  function renderHardWordsContent() {
    var mount = document.querySelector('[data-hard-words-content]');
    if (!mount || !hardWordsCatalog) return;
    var entries = hardWordsCatalog.entries;
    var counts = hardWordsCounts(entries);
    var practiceProgress = hardWordCatalogProgress();
    var soundFormProgress = hardWordSoundFormProgress();
    var soundFormButtonLabel = hardWordSoundFormState.active
      ? '继续上次声形练习'
      : '正式声形练习 · 10 词 20 题';
    mount.innerHTML =
      '<section class="hard-words-stats" aria-label="学生难词统计">' +
      hardWordsStat(entries.length, '全部难词', 'all') +
      hardWordsStat(counts[1], '不会读', '1') +
      hardWordsStat(counts[2], '不会意思', '2') +
      hardWordsStat(counts[3], '两项都不会', '3') +
      '</section>' +
      '<section class="panel hard-words-controls" aria-label="筛选学生难词">' +
      '<label class="hard-words-search"><span>搜索单词或短语</span><input type="search" value="' +
      esc(hardWordsQuery) +
      '" placeholder="例如 maturity" autocomplete="off" data-action="hard-words-search"></label>' +
      '<div class="hard-words-selects">' +
      hardWordsSelect(
        'review',
        '审校状态',
        [
          ['all', '全部审校状态'],
          ['source_audited_for_rescue', '已进入练习'],
          ['needs_sense_confirmation', '待确认原句义项'],
          ['needs_lexical_approval', '待词库审核'],
          ['needs_lexical_source', '待补权威来源'],
          ['needs_proper_noun_and_sense_review', '待专名与义项核对'],
        ],
        hardWordsReviewFilter,
      ) +
      hardWordsSelect(
        'practice',
        '内容审校',
        [
          ['all', '全部内容状态'],
          ['in_rescue_training', '声形急救可用'],
          ['awaiting_exercise_authoring', '基础练习可用'],
        ],
        hardWordsPracticeFilter,
      ) +
      '</div></section>' +
      '<section class="panel hard-words-practice-launch" aria-label="学生难词基础练习"><div><p class="eyebrow">BASIC PRACTICE</p><h2>' +
      entries.length +
      ' 词都能练</h2><p>独立拼对 <strong>' +
      practiceProgress.independent +
      '</strong> / ' +
      entries.length +
      ' · 已交句子 <strong>' +
      practiceProgress.sentences +
      '</strong> / ' +
      entries.length +
      '<br>声形练习：已录朗读 <strong>' +
      soundFormProgress.recorded +
      '</strong> / ' +
      entries.length +
      ' · 独立拼对 <strong>' +
      soundFormProgress.spelled +
      '</strong> / ' +
      entries.length +
      '</p></div><div class="hard-words-launch-actions"><button class="primary-button" type="button" data-action="start-sound-form-practice">' +
      esc(soundFormButtonLabel) +
      '</button><button class="secondary-button" type="button" data-action="hard-words-start-spell">基础拼写 · 10 词</button><button class="secondary-button" type="button" data-action="hard-words-start-sentence">造句草稿 · 5 词</button><button class="text-button hard-words-dual-launch" type="button" data-action="open-syllable-tutorial">先学音节 · 约 7 分钟</button></div></section>' +
      '<section class="hard-words-results" aria-live="polite"><div class="hard-words-result-head"><p>找到 <strong data-hard-words-match-count>0</strong> 个词</p><small>以下每个词都可单独练习</small></div><small class="hard-words-practice-note">未经审校的词不提供词义或标准句答案；造句只保存为待老师评阅。</small><div data-hard-words-results></div></section>';
    renderHardWordsResults(true);
  }

  function hardWordsStat(value, label, difficulty) {
    var active = hardWordsDifficulty === difficulty;
    return (
      '<button class="panel hard-words-stat' +
      (active ? ' is-active' : '') +
      '" type="button" data-action="hard-words-difficulty" data-difficulty="' +
      esc(difficulty) +
      '" aria-pressed="' +
      String(active) +
      '"><strong>' +
      Number(value || 0).toLocaleString('en-US') +
      '</strong><span>' +
      esc(label) +
      '</span></button>'
    );
  }

  function hardWordsSelect(filter, label, options, value) {
    return (
      '<label><span>' +
      esc(label) +
      '</span><select data-action="hard-words-filter" data-filter="' +
      esc(filter) +
      '">' +
      options
        .map(function (option) {
          return (
            '<option value="' +
            esc(option[0]) +
            '"' +
            (option[0] === value ? ' selected' : '') +
            '>' +
            esc(option[1]) +
            '</option>'
          );
        })
        .join('') +
      '</select></label>'
    );
  }

  function filteredHardWords() {
    if (!hardWordsCatalog) return [];
    var query = normaliseAnswer(hardWordsQuery);
    return hardWordsCatalog.entries.filter(function (entry) {
      if (query && String(entry._searchText || '').indexOf(query) < 0) return false;
      if (
        hardWordsDifficulty !== 'all' &&
        String(entry.difficultyCode || '') !== hardWordsDifficulty
      ) {
        return false;
      }
      if (hardWordsReviewFilter !== 'all' && entry.reviewStatus !== hardWordsReviewFilter) {
        return false;
      }
      return hardWordsPracticeFilter === 'all' || entry.practiceStatus === hardWordsPracticeFilter;
    });
  }

  function renderHardWordsResults(resetVisible) {
    var mount = document.querySelector('[data-hard-words-results]');
    if (!mount) return;
    if (resetVisible) hardWordsVisible = 60;
    var matches = filteredHardWords();
    var shown = matches.slice(0, hardWordsVisible);
    var count = document.querySelector('[data-hard-words-match-count]');
    if (count) count.textContent = matches.length.toLocaleString('en-US');
    if (!matches.length) {
      mount.innerHTML =
        '<div class="panel empty-state hard-words-empty">没有符合条件的词。换一个搜索词或筛选条件试试。</div>';
      return;
    }
    mount.innerHTML =
      '<div class="hard-words-list">' +
      shown.map(renderHardWordRow).join('') +
      '</div>' +
      (shown.length < matches.length
        ? '<button class="secondary-button hard-words-more" type="button" data-action="hard-words-more">再显示 ' +
          Math.min(60, matches.length - shown.length) +
          ' 个</button>'
        : '<p class="hard-words-end">已显示全部 ' + matches.length + ' 个词</p>');
  }

  function renderHardWordRow(entry) {
    var rescueWord = findRescueWordForCatalogEntry(entry);
    var difficulty = String(entry.difficultyCode || '');
    var needLabels = [];
    if (entry.needsPronunciation) needLabels.push('读音');
    if (entry.needsMeaning) needLabels.push('意思');
    return (
      '<article class="panel hard-word-row" data-hard-word="' +
      esc(entry.normalizedHeadword || entry.displayWord) +
      '" data-difficulty="' +
      esc(difficulty) +
      '" data-review-status="' +
      esc(entry.reviewStatus) +
      '" data-practice-status="' +
      esc(entry.practiceStatus) +
      '"><div class="hard-word-main"><div class="hard-word-title"><strong>' +
      esc(entry.displayWord || entry.normalizedHeadword) +
      '</strong><span class="difficulty-badge difficulty-' +
      esc(difficulty) +
      '">' +
      esc(hardWordsDifficultyLabel(difficulty)) +
      '</span></div><p>需加强：' +
      esc(needLabels.join('＋') || '待教师确认') +
      (Number(entry.reportCount || 0) > 1
        ? ' · 学生重复标记 ' + Number(entry.reportCount) + ' 次'
        : '') +
      '</p><small data-hard-word-practice-summary>' +
      esc(hardWordPracticeSummary(entry)) +
      '</small></div><div class="hard-word-statuses"><span class="status-chip review-status">' +
      esc(hardWordsReviewLabel(entry.reviewStatus)) +
      '</span><span class="status-chip practice-status' +
      (entry.practiceStatus === 'in_rescue_training' ? ' is-ready' : '') +
      '">' +
      esc(hardWordsPracticeLabel(entry.practiceStatus)) +
      '</span></div>' +
      '<div class="hard-word-actions"><button class="primary-button" type="button" data-action="start-sound-form-practice" data-word-id="' +
      esc(entry.id) +
      '">练声形</button><button class="secondary-button" type="button" data-action="hard-word-spell" data-word-id="' +
      esc(entry.id) +
      '">练拼写</button><button class="secondary-button" type="button" data-action="hard-word-sentence" data-word-id="' +
      esc(entry.id) +
      '">去造句</button>' +
      (rescueWord
        ? '<button class="text-button hard-word-start" type="button" data-action="start-rescue-word" data-word-id="' +
          esc(rescueWord.id) +
          '">声形急救</button>'
        : '') +
      '</div>' +
      '</article>'
    );
  }

  function findRescueWordForCatalogEntry(entry) {
    if (
      !entry ||
      entry.practiceStatus !== 'in_rescue_training' ||
      entry.reviewStatus !== 'source_audited_for_rescue'
    ) {
      return null;
    }
    var headword = normaliseAnswer(entry && (entry.normalizedHeadword || entry.displayWord));
    return (
      RESCUE_WORDS.find(function (word) {
        return normaliseAnswer(word.word) === headword || normaliseAnswer(word.id) === headword;
      }) || null
    );
  }

  function hardWordsDifficultyLabel(code) {
    if (code === '1') return '不会读';
    if (code === '2') return '不会意思';
    if (code === '3') return '读音＋意思';
    return '待确认';
  }

  function hardWordsReviewLabel(status) {
    if (status === 'source_audited_for_rescue') return '已进入练习';
    if (status === 'needs_sense_confirmation') return '待确认原句义项';
    if (status === 'needs_lexical_approval') return '待词库审核';
    if (status === 'needs_lexical_source') return '待补权威来源';
    if (status === 'needs_proper_noun_and_sense_review') return '待专名与义项核对';
    return '待审校';
  }

  function hardWordsPracticeLabel(status) {
    return status === 'in_rescue_training' ? '声形急救可用' : '基础练习可用';
  }

  function findHardWordEntry(wordId) {
    if (!hardWordsCatalog || !Array.isArray(hardWordsCatalog.entries)) return null;
    return (
      hardWordsCatalog.entries.find(function (entry) {
        return entry.id === wordId;
      }) || null
    );
  }

  function startSyllableTutorial(options) {
    cleanupMedia();
    session = null;
    syllableTutorialState = {
      step: 0,
      quizIndex: 0,
      answered: false,
      correct: false,
      feedback: '',
      audioReady: false,
      audioFailed: false,
    };
    currentView = 'syllable-tutorial';
    if (!(options && options.historyReady) && history.pushState) {
      history.pushState(
        Object.assign({}, history.state || {}, { wordlabView: 'syllable-tutorial' }),
        '',
        location.href,
      );
    }
    renderSyllableTutorial();
    scrollToTop();
  }

  function renderSyllableTutorial() {
    if (!syllableTutorialState) return startSyllableTutorial({ historyReady: true });
    currentView = 'syllable-tutorial';
    setActiveNav('hard-words');
    var step = SYLLABLE_TUTORIAL_STEPS[syllableTutorialState.step] || 'finish';
    main.innerHTML =
      '<section class="syllable-tutorial-shell" data-syllable-tutorial data-syllable-step="' +
      esc(step) +
      '"><header class="syllable-tutorial-head"><button class="text-button" type="button" data-action="syllable-exit">← 难词表</button><p>' +
      (syllableTutorialState.step + 1) +
      ' / ' +
      SYLLABLE_TUTORIAL_STEPS.length +
      '</p></header><div class="hard-word-practice-track" aria-hidden="true"><i style="width:' +
      ((syllableTutorialState.step + 1) / SYLLABLE_TUTORIAL_STEPS.length) * 100 +
      '%"></i></div>' +
      renderSyllableTutorialStep(step) +
      '</section>';
  }

  function renderSyllableTutorialStep(step) {
    if (step === 'idea') return renderSyllableIdea();
    if (step === 'layers') return renderSyllableLayers();
    if (step === 'examples') return renderSyllableExamples();
    if (step === 'quiz') return renderSyllableQuiz();
    return renderSyllableFinish();
  }

  function syllableNextButton(label) {
    return (
      '<button class="primary-button" type="button" data-action="syllable-next">' +
      esc(label || '继续') +
      '</button>'
    );
  }

  function renderSyllableIdea() {
    return (
      '<article class="panel syllable-tutorial-card"><p class="eyebrow">第 1 课 · 声音拍</p><h1>音节是声音的“拍”</h1><p class="syllable-lead">先听嘴里发出几拍声音，再看字母。<strong>不要数元音字母。</strong></p>' +
      '<div class="syllable-beat-demo" data-syllable-example="squeeze" data-syllable-count="1" data-primary-stress="0"><span>squeeze</span><strong>●</strong><small>1 拍。ee 有两个字母，却只发一个元音声音。</small></div>' +
      '<div class="syllable-callout"><strong>快速做法</strong><p>自然地读词；轻轻把手放在下巴下；每听见一个元音核，通常就是一拍。少数词尾的 l、n 也能独立成拍，所以最后仍要用词典音频核对。</p></div>' +
      '<footer class="syllable-card-actions">' +
      syllableNextButton('看懂三种“分法”') +
      '</footer></article>'
    );
  }

  function renderSyllableLayers() {
    return (
      '<article class="panel syllable-tutorial-card"><p class="eyebrow">第 2 课 · 三层表示</p><h1>同一个词，有三层表示</h1><div class="syllable-layer-grid">' +
      '<section data-syllable-layer="sound"><span>① 听音音节</span><h2>先数声音拍</h2><p><strong>fountain</strong> 听成两拍：/faʊn/ · /tɪn/。这是本课判断音节数的依据。</p></section>' +
      '<section data-syllable-layer="dictionary"><span>② 词典音标分节</span><h2>用点号核对</h2><p>词典可写 /ˈfaʊn.tɪn/。重音符号在重读音节前；词典和口音之间可能略有差异。</p></section>' +
      '<section data-syllable-layer="spelling"><span>③ 本课拼写分块</span><h2>帮助记字母</h2><p><strong>foun / tain</strong> 是拼写支架。它方便听写，但不等于唯一的书面断词规则。</p></section>' +
      '</div><p class="syllable-caution">不要机械套 VCV/CVC。形态块、书面断词与语音音节可能不同；弱读、成音节辅音及英美口音也会造成差异。</p><footer class="syllable-card-actions"><button class="secondary-button" type="button" data-action="syllable-back">返回</button>' +
      syllableNextButton('看 5 个难词') +
      '</footer></article>'
    );
  }

  function renderSyllableExamples() {
    var accent = state.settings.accent === 'us' ? 'us' : 'uk';
    var rows = Object.keys(SYLLABLE_TUTORIAL_WORDS)
      .map(function (wordId) {
        var word = findRescueWord(wordId);
        var guide = SYLLABLE_TUTORIAL_WORDS[wordId];
        if (!word) return '';
        var spoken = guide.sounds
          .map(function (block, index) {
            return index === guide.stress ? '<strong>' + esc(block) + '</strong>' : esc(block);
          })
          .join(' · ');
        return (
          '<li data-syllable-example="' +
          esc(word.id) +
          '" data-syllable-count="' +
          guide.count +
          '" data-syllable-stress="' +
          guide.stress +
          '" data-primary-stress="' +
          guide.stress +
          '"><button class="audio-button syllable-word-audio" type="button" data-action="syllable-audio" data-word-id="' +
          esc(word.id) +
          '" data-accent="' +
          accent +
          '" data-audio-label="' +
          esc(word.word) +
          ' 范音"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">' +
          esc(word.word) +
          '</span></button><div><span class="syllable-count-chip">' +
          guide.count +
          ' 拍</span><p>' +
          spoken +
          '</p><small>本课拼写块：' +
          guide.spelling.map(esc).join(' / ') +
          '</small></div></li>'
        );
      })
      .join('');
    return (
      '<article class="panel syllable-tutorial-card"><p class="eyebrow">第 3 课 · 例词</p><h1>听一遍，再看分块</h1><p class="syllable-lead">大写的发音音节块表示主重音；下一行斜线分的是记忆用拼写块。</p><ul class="syllable-example-list">' +
      rows +
      '</ul><p class="syllable-audio-status" data-syllable-audio-status role="status" aria-live="polite">音频若加载失败，不算学习错误。</p><div class="syllable-variation" data-syllable-variation><strong>注意变体</strong><p><em>certificate</em> 本课锁定名词读音；<em>controversial</em> 会随口音或说话方式出现可接受的分节差异。本课只按当前播放的范音练习，不把权威词典记录的另一种读法判错。</p></div><footer class="syllable-card-actions"><button class="secondary-button" type="button" data-action="syllable-back">返回</button>' +
      syllableNextButton('试着数声音拍') +
      '</footer></article>'
    );
  }

  function renderSyllableQuiz() {
    var wordId = SYLLABLE_TUTORIAL_QUIZ[syllableTutorialState.quizIndex];
    var word = findRescueWord(wordId);
    var guide = SYLLABLE_TUTORIAL_WORDS[wordId];
    var accent = state.settings.accent === 'us' ? 'us' : 'uk';
    var buttons = [1, 2, 3, 4, 5]
      .map(function (count) {
        return (
          '<button type="button" data-action="syllable-answer" data-count="' +
          count +
          '"' +
          (!syllableTutorialState.audioReady || syllableTutorialState.answered ? ' disabled' : '') +
          '>' +
          count +
          '</button>'
        );
      })
      .join('');
    return (
      '<article class="panel syllable-tutorial-card" data-syllable-quiz' +
      (syllableTutorialState.answered
        ? ' data-syllable-example="' +
          esc(wordId) +
          '" data-syllable-count="' +
          guide.count +
          '" data-syllable-stress="' +
          guide.stress +
          '" data-primary-stress="' +
          guide.stress +
          '"'
        : '') +
      '><p class="eyebrow">小测 · ' +
      (syllableTutorialState.quizIndex + 1) +
      ' / ' +
      SYLLABLE_TUTORIAL_QUIZ.length +
      '</p><h1>你听到几拍？</h1><button class="listen-orb syllable-quiz-audio" type="button" data-action="syllable-audio" data-syllable-audio data-syllable-quiz-audio data-quiz-index="' +
      syllableTutorialState.quizIndex +
      '" data-accent="' +
      accent +
      '" data-audio-label="练习范音" aria-label="播放练习范音"><span class="audio-control-icon" aria-hidden="true">▶</span></button><div class="syllable-count-options" data-syllable-answer data-syllable-quiz-answer>' +
      buttons +
      '</div><p class="feedback' +
      (syllableTutorialState.feedback
        ? syllableTutorialState.correct
          ? ' is-correct'
          : ' is-wrong'
        : '') +
      '" data-syllable-feedback data-syllable-quiz-feedback role="status" aria-live="polite">' +
      esc(
        syllableTutorialState.audioFailed
          ? '音频没有成功播放，本题不判错。请重试或继续。'
          : syllableTutorialState.feedback ||
              (syllableTutorialState.audioReady
                ? '已经听到范音，现在选择拍数。'
                : '先播放范音；声音真正开始后才能作答。'),
      ) +
      '</p>' +
      (syllableTutorialState.answered
        ? '<div class="syllable-reveal"><strong>' +
          esc(word.word) +
          '：' +
          guide.count +
          ' 拍</strong><span>' +
          guide.spelling.map(esc).join(' / ') +
          '</span></div>'
        : '') +
      '<footer class="syllable-card-actions"><button class="secondary-button" type="button" data-action="syllable-back">返回</button>' +
      (syllableTutorialState.answered
        ? '<button class="primary-button" type="button" data-action="syllable-quiz-next">' +
          (syllableTutorialState.quizIndex + 1 === SYLLABLE_TUTORIAL_QUIZ.length
            ? '完成小课'
            : '下一词') +
          '</button>'
        : '<button class="quiet-button" type="button" data-action="syllable-quiz-skip">跳过，不判错</button>') +
      '</footer></article>'
    );
  }

  function renderSyllableFinish() {
    return '<article class="panel syllable-tutorial-card syllable-finish"><p class="eyebrow">小课完成</p><h1>以后按这个顺序分</h1><ol><li><strong>先听</strong>：数声音拍，不数元音字母。</li><li><strong>再核对</strong>：查看该词典的音标、重音标记和音频；若它用点号分节，可用来辅助核对。</li><li><strong>后拼写</strong>：按本课拼写块记字母，但不把它冒充唯一音节答案。</li></ol><p>如果词典或口音之间不同，记录所用口音与来源，不把另一种读法判错。</p><div class="syllable-sources" data-syllable-sources><h2>权威参考</h2><a href="https://dictionary.cambridge.org/dictionary/english/syllable" target="_blank" rel="noreferrer">Cambridge Dictionary：音节的定义</a><a href="https://www.oxfordlearnersdictionaries.com/about/english/pronunciation_english" target="_blank" rel="noreferrer">Oxford Learner’s Dictionaries：发音、重音与成音节辅音</a><a href="https://www.merriam-webster.com/grammar/word-division-dots-and-syllable-pronunciation-hyphens" target="_blank" rel="noreferrer">Merriam-Webster：书面断词与发音音节的区别</a></div><footer class="syllable-card-actions"><button class="secondary-button" type="button" data-action="syllable-restart">再学一次</button><button class="primary-button" type="button" data-action="syllable-exit">返回难词表</button></footer></article>';
  }

  function advanceSyllableTutorial(direction) {
    if (!syllableTutorialState) return;
    stopAudio();
    syllableTutorialState.step = Math.max(
      0,
      Math.min(SYLLABLE_TUTORIAL_STEPS.length - 1, syllableTutorialState.step + direction),
    );
    syllableTutorialState.feedback = '';
    syllableTutorialState.correct = false;
    syllableTutorialState.audioReady = false;
    syllableTutorialState.audioFailed = false;
    renderSyllableTutorial();
    scrollToTop();
  }

  function answerSyllableQuiz(button) {
    if (
      !syllableTutorialState ||
      syllableTutorialState.answered ||
      !syllableTutorialState.audioReady
    )
      return;
    var wordId = SYLLABLE_TUTORIAL_QUIZ[syllableTutorialState.quizIndex];
    var expected = SYLLABLE_TUTORIAL_WORDS[wordId].count;
    var chosen = Number(button.dataset.count);
    syllableTutorialState.answered = true;
    syllableTutorialState.correct = chosen === expected;
    syllableTutorialState.feedback =
      chosen === expected
        ? '听对了：每一拍通常都有一个元音核。'
        : '这条范音是 ' + expected + ' 拍。慢放一次，再跟着节奏读。';
    renderSyllableTutorial();
  }

  function nextSyllableQuiz(skipped) {
    if (!syllableTutorialState) return;
    stopAudio();
    if (skipped) syllableTutorialState.feedback = '已跳过，本题不判错。';
    if (syllableTutorialState.quizIndex + 1 < SYLLABLE_TUTORIAL_QUIZ.length) {
      syllableTutorialState.quizIndex += 1;
      syllableTutorialState.answered = false;
      syllableTutorialState.correct = false;
      syllableTutorialState.feedback = '';
      syllableTutorialState.audioReady = false;
      syllableTutorialState.audioFailed = false;
      renderSyllableTutorial();
      return;
    }
    advanceSyllableTutorial(1);
  }

  function playSyllableTutorialAudio(button) {
    var wordId = button.matches('[data-syllable-quiz-audio]')
      ? SYLLABLE_TUTORIAL_QUIZ[syllableTutorialState.quizIndex]
      : button.dataset.wordId;
    var word = findRescueWord(wordId);
    if (!word) return;
    if (toggleCurrentPlayback(button)) return;
    var accent = button.dataset.accent === 'us' ? 'us' : 'uk';
    var source = rescueAudioSource(word, accent);
    if (!source) {
      if (button.matches('[data-syllable-quiz-audio]')) lockSyllableTutorialAudioFailure();
      else {
        var feedback = main.querySelector('[data-syllable-audio-status]');
        if (feedback) feedback.textContent = '音频没有成功播放，本次不判错。';
      }
      return;
    }
    startAudioPlayback(source + '?v=' + encodeURIComponent(AUDIO_ASSET_VERSION), button, 1, {
      syllableTutorial: button.matches('[data-syllable-quiz-audio]'),
    });
  }

  function unlockSyllableTutorialAnswers(button) {
    if (
      !syllableTutorialState ||
      currentView !== 'syllable-tutorial' ||
      !button ||
      !button.matches('[data-syllable-quiz-audio]')
    )
      return;
    syllableTutorialState.audioReady = true;
    syllableTutorialState.audioFailed = false;
    main.querySelectorAll('[data-action="syllable-answer"]').forEach(function (choice) {
      choice.disabled = false;
    });
    var feedback = main.querySelector('[data-syllable-quiz-feedback]');
    if (feedback) feedback.textContent = '已经听到范音，现在选择拍数。';
  }

  function lockSyllableTutorialAudioFailure() {
    if (!syllableTutorialState || currentView !== 'syllable-tutorial') return;
    syllableTutorialState.audioReady = false;
    syllableTutorialState.audioFailed = true;
    main.querySelectorAll('[data-action="syllable-answer"]').forEach(function (choice) {
      choice.disabled = true;
    });
    var feedback = main.querySelector('[data-syllable-quiz-feedback]');
    if (feedback) {
      feedback.classList.remove('is-correct', 'is-wrong');
      feedback.textContent = '音频没有成功播放，本题不判错。请重试或跳过。';
    }
  }

  function buildHardWordSoundFormQueue(entries, startsWithRead) {
    var firstType = startsWithRead ? 'read' : 'spell';
    var first = entries.map(function (entry, index) {
      return {
        wordId: entry.id,
        type: index % 2 === 0 ? firstType : firstType === 'read' ? 'spell' : 'read',
      };
    });
    return first.concat(
      first.map(function (item) {
        return { wordId: item.wordId, type: item.type === 'read' ? 'spell' : 'read' };
      }),
    );
  }

  function chooseHardWordSoundFormBatch(targetWordId) {
    if (!hardWordsCatalog || hardWordsCatalog.entries.length !== 751) return [];
    var all = hardWordsCatalog.entries;
    var cursor = hardWordSoundFormState.cursor % all.length;
    var selected = [];
    if (targetWordId) {
      var target = findHardWordEntry(targetWordId);
      if (target) selected.push(target);
    }
    for (var offset = 0; selected.length < HARD_WORD_SOUND_FORM_BATCH_SIZE; offset += 1) {
      var candidate = all[(cursor + offset) % all.length];
      if (
        candidate &&
        !selected.some(function (entry) {
          return entry.id === candidate.id;
        })
      ) {
        selected.push(candidate);
      }
    }
    if (!targetWordId) {
      hardWordSoundFormState.cursor = (cursor + HARD_WORD_SOUND_FORM_BATCH_SIZE) % all.length;
    }
    return selected;
  }

  function defaultDualPrototypeState(queue) {
    if (!Array.isArray(queue) || queue.length !== HARD_WORD_SOUND_FORM_BATCH_SIZE * 2) {
      return null;
    }
    var prototype = {
      runId: 'sound-form-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      queue: queue,
      index: 0,
      step: '',
      task: null,
      results: [],
    };
    resetDualPrototypeTask(prototype);
    return prototype;
  }

  function resetDualPrototypeTask(prototype) {
    var item = prototype.queue[prototype.index];
    if (!item) {
      prototype.step = 'summary';
      prototype.task = null;
      return;
    }
    prototype.task = {
      meaning: '',
      pos: '',
      syllableCount: '',
      syllables: '',
      splitBoundaries: [],
      spelling: '',
      audioReady: false,
      audioFailed: false,
      technicalFailure: false,
      error: '',
    };
    prototype.step = item.type === 'read' ? 'read-info' : 'spell-count';
  }

  function currentDualPrototypeItem() {
    return dualPrototypeState && dualPrototypeState.queue[dualPrototypeState.index];
  }

  function currentDualPrototypeWord() {
    var item = currentDualPrototypeItem();
    if (!item) return null;
    var entry = findHardWordEntry(item.wordId);
    if (!entry) return null;
    var rescue = findRescueWordForCatalogEntry(entry);
    return {
      id: entry.id,
      word: entry.displayWord,
      catalogEntry: entry,
      rescue: rescue,
      ipaUk: rescue ? rescue.ipaUk : '',
      ipaUs: rescue ? rescue.ipaUs : '',
      blocks: rescue ? rescue.blocks : [],
      pos: rescue ? rescue.pos : '',
      zh: rescue ? rescue.zh : '',
      senseStatus: rescue ? rescue.senseStatus : '',
      meaningTask: rescue ? rescue.meaningTask : null,
    };
  }

  function startDualPrototype(targetWordId, options) {
    if (!hardWordsCatalog) return showToast('请先载入学生难词表。');
    var resume = Boolean(options && options.resume && hardWordSoundFormState.active);
    cleanupMedia();
    session = null;
    currentView = 'dual-prototype-loading';
    main.innerHTML =
      '<section class="dual-prototype-shell" data-hard-word-sound-form-loading><div class="panel hard-words-loading" role="status" aria-live="polite"><span class="loading-dot" aria-hidden="true"></span><p>正在准备正式声形练习……</p></div></section>';
    ensureHardWordAudioManifest()
      .then(function () {
        dualActionLocked = false;
        if (resume) {
          dualPrototypeState = normaliseHardWordSoundFormActive(hardWordSoundFormState.active);
        } else {
          var startingCursor = hardWordSoundFormState.cursor;
          var selected = chooseHardWordSoundFormBatch(targetWordId);
          if (selected.length !== HARD_WORD_SOUND_FORM_BATCH_SIZE) {
            throw new Error('本组难词数量不足');
          }
          var queue = buildHardWordSoundFormQueue(
            selected,
            targetWordId ? true : Math.floor(startingCursor / 10) % 2 === 0,
          );
          dualPrototypeState = defaultDualPrototypeState(queue);
          hardWordSoundFormState.active = dualPrototypeState;
          saveHardWordSoundFormState();
        }
        if (!dualPrototypeState) throw new Error('已保存的练习进度无效');
        currentView = 'dual-prototype';
        if (!(options && options.historyReady) && history.pushState) {
          history.pushState(
            Object.assign({}, history.state || {}, {
              wordlabView: 'hard-words',
              dualPrototype: true,
            }),
            '',
            location.href,
          );
        }
        renderDualPrototype();
        scrollToTop();
      })
      .catch(function (error) {
        dualPrototypeState = null;
        currentView = 'hard-words';
        renderHardWordsCatalog();
        showToast('正式声形练习暂时无法启动：' + (error.message || hardWordAudioLoadError));
      });
  }

  function renderDualPrototype() {
    if (!dualPrototypeState) return renderHardWordsCatalog();
    currentView = 'dual-prototype';
    setActiveNav('hard-words');
    var prototype = dualPrototypeState;
    var item = currentDualPrototypeItem();
    var queueLength = prototype.queue.length;
    var isBlind = Boolean(item && item.type === 'spell' && prototype.step !== 'spell-result');
    var taskAttributes = item
      ? ' data-dual-task-type="' +
        esc(item.type) +
        '"' +
        (isBlind ? ' data-dual-blind="true"' : ' data-dual-word-id="' + esc(item.wordId) + '"')
      : '';
    var answerHiddenAttribute = isBlind ? ' data-answer-hidden="true"' : '';
    main.innerHTML =
      '<section class="dual-prototype-shell" data-dual-prototype data-dual-mixed-prototype data-hard-word-sound-form data-dual-step="' +
      esc(prototype.step) +
      '" data-step="' +
      esc(prototype.step) +
      '" data-dual-queue-position="' +
      Math.min(prototype.index + 1, queueLength) +
      '" data-task-position="' +
      Math.min(prototype.index + 1, queueLength) +
      '" data-task-type="' +
      esc(item ? item.type : 'summary') +
      '"' +
      answerHiddenAttribute +
      taskAttributes +
      '"><header class="dual-prototype-head"><button class="text-button" type="button" data-action="dual-exit" data-dual-exit>← 难词表</button><p>' +
      Math.min(prototype.index + 1, queueLength) +
      ' / ' +
      queueLength +
      '</p></header><div class="hard-word-practice-track" aria-hidden="true"><i style="width:' +
      (prototype.index / queueLength) * 100 +
      '%"></i></div>' +
      renderDualPrototypeStep(prototype) +
      '</section>';
    var field = main.querySelector('input:not(:disabled)');
    if (field) field.focus({ preventScroll: true });
  }

  function renderDualPrototypeStep(state) {
    if (state.step === 'read-info') return renderDualReadInfo(state);
    if (state.step === 'read-syllables') return renderDualReadSyllables(state);
    if (state.step === 'read-record') return renderDualReadRecord(state);
    if (state.step === 'read-compare') return renderDualReadCompare(state);
    if (state.step === 'spell-count') return renderDualSpellCount(state);
    if (state.step === 'spell-syllables') return renderDualSpellSyllables(state);
    if (state.step === 'spell-final') return renderDualSpellFinal(state);
    if (state.step === 'spell-result') return renderDualSpellResult(state);
    if (state.step === 'summary') return renderDualSummary(state);
    return '';
  }

  function dualTaskHeading(label) {
    return (
      '<p class="eyebrow">' + esc(label) + '</p><p class="dual-task-kicker">这题只做当前一步</p>'
    );
  }

  function renderDualReadInfo(prototype) {
    var word = currentDualPrototypeWord();
    return (
      '<article class="panel dual-prototype-card" data-dual-task-card data-dual-read-info>' +
      dualTaskHeading('看词读音 · 1/3') +
      '<h1 data-dual-visible-word>' +
      esc(word.word) +
      '</h1><p class="dual-source-note">先写你记得的内容；未经审校的答案会留给老师核对。</p><form class="dual-stacked-form" data-dual-read-info-form><label>写出中文意思<input name="meaning" data-dual-read-meaning autocomplete="off" value="' +
      esc(prototype.task.meaning) +
      '"></label><label>写出词性<input name="pos" data-dual-read-pos autocomplete="off" autocapitalize="none" placeholder="例如 n." value="' +
      esc(prototype.task.pos) +
      '"></label><button class="primary-button" type="submit">下一步</button></form>' +
      dualSkipButton() +
      '<p class="feedback" data-dual-feedback role="status" aria-live="polite">' +
      esc(prototype.task.error) +
      '</p></article>'
    );
  }

  function renderDualReadSyllables(prototype) {
    var word = currentDualPrototypeWord();
    var boundaries = Array.isArray(prototype.task.splitBoundaries)
      ? prototype.task.splitBoundaries
      : [];
    return (
      '<article class="panel dual-prototype-card" data-dual-task-card data-dual-read-syllables>' +
      '<p class="eyebrow">看词读音 · 2/3</p>' +
      '<h1>你会怎么分拍？</h1><p class="dual-split-instruction">轻点字母缝隙，按你准备朗读的节奏分组。</p>' +
      renderDualWordSplitter(word.word, boundaries) +
      '<p class="dual-split-preview' +
      (boundaries.length ? ' is-ready' : '') +
      '" data-dual-split-preview aria-live="polite">' +
      esc(dualSplitPreview(word.word, boundaries)) +
      '</p><div class="dual-split-actions"><button class="quiet-button" type="button" data-action="dual-clear-splits"' +
      (boundaries.length ? '' : ' disabled') +
      '>重新切</button><button class="primary-button" type="button" data-action="dual-confirm-splits">切好了，继续</button></div><p class="dual-split-note">这是声音和字母的对应；不同口音，分法可以不同。</p>' +
      dualSkipButton() +
      '<p class="feedback" data-dual-feedback role="status" aria-live="polite">' +
      esc(prototype.task.error) +
      '</p></article>'
    );
  }

  function renderDualWordSplitter(word, boundaries) {
    var letters = Array.from(String(word || ''));
    var selected = Array.isArray(boundaries) ? boundaries : [];
    var chunks = dualSplitChunks(word, selected);
    var chunkOffset = 0;
    return (
      '<div class="dual-word-splitter" data-dual-word-splitter role="group" aria-label="给 ' +
      esc(word) +
      ' 添加本课拼写分块">' +
      chunks
        .map(function (chunk) {
          var chunkStart = chunkOffset;
          chunkOffset += Array.from(chunk).length;
          return (
            '<span class="dual-split-chunk">' +
            Array.from(chunk)
              .map(function (letter, localIndex) {
                var index = chunkStart + localIndex;
                var isLast = index === letters.length - 1;
                var isActive = selected.indexOf(index + 1) >= 0;
                if (isLast) {
                  return (
                    '<span class="dual-split-unit is-last"><span class="dual-split-letter" aria-hidden="true">' +
                    esc(letter) +
                    '</span></span>'
                  );
                }
                return (
                  '<button class="dual-split-unit dual-split-gap' +
                  (isActive ? ' is-active' : '') +
                  '" type="button" data-action="dual-toggle-split" data-boundary="' +
                  (index + 1) +
                  '" aria-pressed="' +
                  String(isActive) +
                  '" aria-label="在第 ' +
                  (index + 1) +
                  ' 个字母后' +
                  (isActive ? '撤销分隔' : '添加分隔') +
                  '"><span class="dual-split-letter" aria-hidden="true">' +
                  esc(letter) +
                  '</span><span class="dual-split-mark" aria-hidden="true"></span></button>'
                );
              })
              .join('') +
            '</span>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function dualSplitChunks(word, boundaries) {
    var text = String(word || '');
    var safe = (Array.isArray(boundaries) ? boundaries : [])
      .map(Number)
      .filter(function (boundary, index, list) {
        return (
          Number.isInteger(boundary) &&
          boundary > 0 &&
          boundary < text.length &&
          list.indexOf(boundary) === index
        );
      })
      .sort(function (a, b) {
        return a - b;
      });
    var chunks = [];
    var start = 0;
    safe.forEach(function (boundary) {
      chunks.push(text.slice(start, boundary));
      start = boundary;
    });
    chunks.push(text.slice(start));
    return chunks;
  }

  function dualSplitPreview(word, boundaries) {
    var chunks = dualSplitChunks(word, boundaries);
    return boundaries.length ? chunks.join(' · ') : '保持完整 · 按 1 拍读';
  }

  function toggleDualSplitBoundary(button) {
    if (!dualPrototypeState || dualPrototypeState.step !== 'read-syllables') return;
    if (button.dataset.splitToggleLocked === 'true') return;
    button.dataset.splitToggleLocked = 'true';
    queueMicrotask(function () {
      if (button.isConnected) delete button.dataset.splitToggleLocked;
    });
    var boundary = Number(button.dataset.boundary);
    var word = currentDualPrototypeWord();
    if (!word || !Number.isInteger(boundary) || boundary <= 0 || boundary >= word.word.length) {
      return;
    }
    var boundaries = dualPrototypeState.task.splitBoundaries;
    var existing = boundaries.indexOf(boundary);
    if (existing >= 0) boundaries.splice(existing, 1);
    else boundaries.push(boundary);
    boundaries.sort(function (a, b) {
      return a - b;
    });
    dualPrototypeState.task.error = '';
    var isActive = boundaries.indexOf(boundary) >= 0;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.setAttribute(
      'aria-label',
      '在第 ' + boundary + ' 个字母后' + (isActive ? '撤销分隔' : '添加分隔'),
    );
    var preview = main.querySelector('[data-dual-split-preview]');
    if (preview) {
      preview.textContent = dualSplitPreview(word.word, boundaries);
      preview.classList.toggle('is-ready', Boolean(boundaries.length));
    }
    var clear = main.querySelector('[data-action="dual-clear-splits"]');
    if (clear) clear.disabled = !boundaries.length;
    var feedback = main.querySelector('[data-dual-feedback]');
    if (feedback) feedback.textContent = '';
    persistDualPrototypeProgress();
  }

  function clearDualSplitBoundaries() {
    if (!dualPrototypeState || dualPrototypeState.step !== 'read-syllables') return;
    dualPrototypeState.task.splitBoundaries = [];
    dualPrototypeState.task.error = '';
    main.querySelectorAll('[data-action="dual-toggle-split"]').forEach(function (button) {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', '在第 ' + button.dataset.boundary + ' 个字母后添加分隔');
    });
    var preview = main.querySelector('[data-dual-split-preview]');
    if (preview) {
      preview.textContent = '保持完整 · 按 1 拍读';
      preview.classList.remove('is-ready');
    }
    var clear = main.querySelector('[data-action="dual-clear-splits"]');
    if (clear) clear.disabled = true;
    var feedback = main.querySelector('[data-dual-feedback]');
    if (feedback) feedback.textContent = '';
    persistDualPrototypeProgress();
  }

  function confirmDualSplitBoundaries() {
    if (!dualPrototypeState || dualPrototypeState.step !== 'read-syllables') return;
    var word = currentDualPrototypeWord();
    var boundaries = dualPrototypeState.task.splitBoundaries;
    if (!word) return;
    dualPrototypeState.task.syllables = dualSplitChunks(word.word, boundaries).join(' / ');
    dualPrototypeState.task.error = '';
    dualPrototypeState.step = 'read-record';
    persistDualPrototypeProgress();
    renderDualPrototype();
  }

  function renderDualReadRecord(prototype) {
    var word = currentDualPrototypeWord();
    return (
      '<article class="panel dual-prototype-card" data-dual-task-card data-dual-read-record>' +
      dualTaskHeading('看词读音 · 3/3') +
      '<h1 data-dual-visible-word>' +
      esc(word.word) +
      '</h1><p>现在读一遍，完成后才显示范音。</p><div class="dual-record-actions"><button class="primary-button" type="button" data-action="dual-record" data-dual-record>● 开始录音</button>' +
      dualSkipButton() +
      '</div><p id="recordStatus" class="dual-status" data-dual-record-status role="status" aria-live="polite">' +
      esc(prototype.task.error || '录音只保留在当前页面。') +
      '</p></article>'
    );
  }

  function renderDualReadCompare(prototype) {
    var word = currentDualPrototypeWord();
    var accent = state.settings.accent === 'us' ? 'us' : 'uk';
    var ipa = accent === 'us' ? word.ipaUs : word.ipaUk;
    var rescue = word.rescue;
    var hasPronunciationReference = Boolean(rescue);
    var hasLexicalReference = Boolean(
      rescue &&
      rescue.senseStatus !== 'pending_context' &&
      !(rescue.meaningTask && rescue.meaningTask.masteryEligible === false),
    );
    var syllables = rescue && Array.isArray(rescue.blocks) ? rescue.blocks : [];
    var referenceHtml = hasLexicalReference
      ? '<p data-sound-form-lexical-reference><span>审校参考</span><strong>' +
        esc(word.zh + ' · ' + word.pos) +
        '</strong></p>'
      : '<p data-sound-form-pending-review><span>意思 / 词性</span><strong>待教师结合原句核对</strong></p>';
    var pronunciationHtml = hasPronunciationReference
      ? '<p class="dual-pronunciation-line" data-sound-form-pronunciation-reference>' +
        esc(ipa) +
        '</p>'
      : '';
    var blockHtml = syllables.length
      ? '<p data-sound-form-block-reference><span>本卡范音的分块</span><strong>' +
        esc(syllables.join(' · ')) +
        '</strong></p>'
      : '<p data-sound-form-pending-review><span>声音—拼写分块</span><strong>你的分法已保存，待教师核对</strong></p>';
    var modelAudioLabel = hasPronunciationReference ? '审校范音' : '本次合成范音';
    return (
      '<article class="panel dual-prototype-card" data-dual-task-card data-dual-read-compare><p class="eyebrow">录音对照 · 待人工核对</p><h1>' +
      esc(word.word) +
      '</h1>' +
      pronunciationHtml +
      '<div class="dual-answer-compare" data-dual-read-answer-compare><p><span>你写的意思 / 词性</span><strong>' +
      esc(prototype.task.meaning + ' · ' + prototype.task.pos) +
      '</strong></p>' +
      referenceHtml +
      '<p><span>你的声音分块</span><strong>' +
      esc(prototype.task.syllables) +
      '</strong></p>' +
      blockHtml +
      '</div><p class="dual-split-note">录音只证明你完成了朗读；请交替听自己与范音，最终由老师核对。' +
      (hasPronunciationReference
        ? ''
        : ' 该词尚未锁定义项，合成范音只是本次练习读法，不代表所有读音。') +
      '</p><div class="dual-compare-actions"><button class="secondary-button" type="button" data-action="play-recording" data-dual-own-audio data-audio-label="自己的朗读"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">听自己</span></button><button class="audio-button" type="button" data-action="dual-model-audio" data-dual-model-audio data-accent="' +
      accent +
      '" data-audio-label="' +
      esc(modelAudioLabel) +
      '" data-status-target="dualModelStatus"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">' +
      esc(modelAudioLabel) +
      '</span></button></div><p id="dualModelStatus" class="dual-status" aria-live="polite">交替听自己与范音。</p><div class="dual-footer-actions"><button class="quiet-button" type="button" data-action="dual-rerecord" data-dual-rerecord>重新录音</button><button class="primary-button" type="button" data-action="dual-finish-read" data-dual-finish-read>下一题</button></div></article>'
    );
  }

  function renderDualBlindAudio(prototype) {
    var disabled = prototype.task.audioReady && !prototype.task.audioFailed ? '' : ' disabled';
    return (
      '<button class="listen-orb dual-listen-orb" type="button" data-action="dual-spell-audio" data-dual-spell-audio data-accent="' +
      (state.settings.accent === 'us' ? 'us' : 'uk') +
      '" data-audio-label="盲听音频" data-status-target="dualSpellAudioStatus" aria-label="播放盲听音频"><span class="audio-control-icon" aria-hidden="true">▶</span></button><p id="dualSpellAudioStatus" class="dual-status" aria-live="polite">' +
      (prototype.task.audioReady ? '可以作答，也可再听。' : '先播放，再作答。') +
      '</p><input type="hidden" data-dual-input-lock' +
      disabled +
      '>'
    );
  }

  function dualBlindDisabled(prototype) {
    return prototype.task.audioReady && !prototype.task.audioFailed ? '' : ' disabled';
  }

  function renderDualSpellCount(prototype) {
    return (
      '<article class="panel dual-prototype-card" data-dual-task-card data-dual-spell-count>' +
      dualTaskHeading('听写 · 1/3') +
      '<h1>听音，写音节数</h1>' +
      renderDualBlindAudio(prototype) +
      '<form class="dual-stacked-form" data-dual-spell-count-form><label>几个音节？<input type="number" min="1" max="12" inputmode="numeric" name="count" data-dual-spell-count-input aria-label="输入音节数"' +
      ' value="' +
      esc(prototype.task.syllableCount) +
      '"' +
      dualBlindDisabled(prototype) +
      '></label><button class="primary-button" type="submit"' +
      dualBlindDisabled(prototype) +
      '>下一步</button></form>' +
      dualSkipButton() +
      dualFeedback(prototype) +
      '</article>'
    );
  }

  function renderDualSpellSyllables(prototype) {
    return (
      '<article class="panel dual-prototype-card" data-dual-task-card data-dual-spell-syllables>' +
      dualTaskHeading('听写 · 2/3') +
      '<h1>把听到的音节写出来</h1>' +
      renderDualBlindAudio(prototype) +
      '<form class="dual-stacked-form" data-dual-spell-syllables-form><label>音节<input name="syllables" data-dual-spell-syllables-input autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="用 / 分开"' +
      ' value="' +
      esc(prototype.task.syllables) +
      '"' +
      dualBlindDisabled(prototype) +
      '></label><button class="primary-button" type="submit"' +
      dualBlindDisabled(prototype) +
      '>下一步</button></form>' +
      dualSkipButton() +
      dualFeedback(prototype) +
      '</article>'
    );
  }

  function renderDualSpellFinal(prototype) {
    return (
      '<article class="panel dual-prototype-card" data-dual-task-card data-dual-spell-final>' +
      dualTaskHeading('听写 · 3/3') +
      '<h1>最后写完整信息</h1>' +
      renderDualBlindAudio(prototype) +
      '<p class="dual-own-work" data-dual-own-syllables>你刚写的音节：' +
      esc(prototype.task.syllables) +
      '</p>' +
      '<form class="dual-stacked-form" data-dual-spell-final-form><label>完整单词<input name="spelling" data-dual-spell-word-input autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"' +
      ' value="' +
      esc(prototype.task.spelling) +
      '"' +
      dualBlindDisabled(prototype) +
      '></label><label>中文意思<input name="meaning" data-dual-spell-meaning-input autocomplete="off"' +
      ' value="' +
      esc(prototype.task.meaning) +
      '"' +
      dualBlindDisabled(prototype) +
      '></label><label>词性<input name="pos" data-dual-spell-pos-input autocomplete="off" autocapitalize="none" placeholder="例如 n."' +
      ' value="' +
      esc(prototype.task.pos) +
      '"' +
      dualBlindDisabled(prototype) +
      '></label><button class="primary-button" type="submit"' +
      dualBlindDisabled(prototype) +
      '>提交后对照</button></form>' +
      dualSkipButton() +
      dualFeedback(prototype) +
      '</article>'
    );
  }

  function renderDualSpellResult(prototype) {
    var word = currentDualPrototypeWord();
    var rescue = word.rescue;
    var syllables = rescue && Array.isArray(rescue.blocks) ? rescue.blocks : [];
    var hasLexicalReference = Boolean(
      rescue &&
      rescue.senseStatus !== 'pending_context' &&
      !(rescue.meaningTask && rescue.meaningTask.masteryEligible === false),
    );
    var spellingCorrect = normaliseAnswer(prototype.task.spelling) === normaliseAnswer(word.word);
    var analysisHtml = syllables.length
      ? '<p data-sound-form-block-reference><span>音节数</span><strong>' +
        esc(prototype.task.syllableCount + ' → ' + syllables.length) +
        '</strong></p><p data-sound-form-block-reference><span>声音—拼写分块</span><strong>' +
        esc(prototype.task.syllables + ' → ' + syllables.join(' · ')) +
        '</strong></p>'
      : '<p data-sound-form-pending-review><span>音节分析</span><strong>' +
        esc(prototype.task.syllableCount + ' 拍 · ' + prototype.task.syllables) +
        ' · 待教师核对</strong></p>';
    var lexicalHtml = hasLexicalReference
      ? '<p data-sound-form-lexical-reference><span>审校参考</span><strong>' +
        esc(word.zh + ' · ' + word.pos) +
        '</strong></p>'
      : '<p data-sound-form-pending-review><span>意思 / 词性</span><strong>你的答案已保存，待教师结合原句核对</strong></p>';
    var pronunciationBoundaryHtml = rescue
      ? ''
      : '<p class="dual-source-note" data-sound-form-synthetic-audio-note>本题按当前合成范音练习；这个词的具体词义和读法尚未锁定，待教师结合原句核对。</p>';
    return (
      '<article class="panel dual-prototype-card" data-dual-task-card data-dual-spell-result data-dual-word-id="' +
      esc(word.id) +
      '"><p class="eyebrow">完整提交后对照</p><h1>' +
      esc(word.word) +
      '</h1><p class="dual-spell-verdict ' +
      (spellingCorrect ? 'is-correct' : 'is-wrong') +
      '">' +
      (spellingCorrect ? '完整拼写正确' : '完整拼写需修订') +
      '</p><div class="dual-answer-compare" data-dual-spell-answer-compare>' +
      analysisHtml +
      '<p><span>你写的意思 / 词性</span><strong>' +
      esc(prototype.task.meaning + ' · ' + prototype.task.pos) +
      '</strong></p>' +
      lexicalHtml +
      '</div>' +
      pronunciationBoundaryHtml +
      '<p class="dual-summary-note">完整拼写按词形判定；意思、词性和分块只在有审校资料时提供参考。</p><div class="dual-footer-actions"><button class="primary-button" type="button" data-action="dual-finish-spell" data-dual-finish-spell>下一题</button></div></article>'
    );
  }

  function dualSkipButton() {
    return '<button class="quiet-button dual-skip-button" type="button" data-action="dual-skip-task" data-dual-skip>跳过这题</button>';
  }

  function dualFeedback(prototype) {
    var feedback = prototype.task.audioFailed
      ? '音频未播放，本次不记错。请重试或跳过。'
      : prototype.task.error;
    return (
      '<p class="feedback' +
      (feedback ? ' is-wrong' : '') +
      '" data-dual-feedback role="status" aria-live="polite">' +
      esc(feedback) +
      '</p>'
    );
  }

  function renderDualSummary(prototype) {
    var readDone = prototype.results.filter(function (result) {
      return result.type === 'read' && result.status === 'recorded_pending_human_review';
    }).length;
    var spellCorrect = prototype.results.filter(function (result) {
      return result.type === 'spell' && result.status === 'independent_correct';
    }).length;
    return (
      '<article class="panel dual-prototype-card dual-summary" data-dual-summary data-sound-form-summary><p class="eyebrow">本组完成</p><h1>10 个词 · 20 道声形题</h1><p>已录朗读 <strong>' +
      readDone +
      '</strong> / 10 · 独立拼对 <strong>' +
      spellCorrect +
      '</strong> / 10</p><div class="dual-evidence">' +
      prototype.results
        .map(function (result, index) {
          return (
            '<p><span>' +
            (index + 1) +
            ' · ' +
            esc((findHardWordEntry(result.wordId) || {}).displayWord || result.wordId) +
            ' · ' +
            esc(result.type === 'read' ? '看词读音' : '听音拼写') +
            '</span><strong>' +
            esc(soundFormStatusLabel(result.status)) +
            '</strong></p>'
          );
        })
        .join('') +
      '</div><p class="dual-summary-note">朗读仍需人工核对；同一个词的第二种题型已用 9 道其他题隔开。</p><div class="dual-footer-actions"><button class="secondary-button" type="button" data-action="sound-form-exit">返回难词表</button><button class="primary-button" type="button" data-action="sound-form-next-batch">继续下一组</button></div></article>'
    );
  }

  function soundFormStatusLabel(status) {
    if (status === 'recorded_pending_human_review') return '已录音 · 待人工核对';
    if (status === 'independent_correct') return '独立拼对';
    if (status === 'needs_repair') return '拼写需修订';
    if (status === 'technical_deferred') return '设备故障 · 未判定';
    return '已跳过 · 未判定';
  }

  function persistDualPrototypeProgress() {
    if (!dualPrototypeState) return;
    hardWordSoundFormState.active = dualPrototypeState;
    saveHardWordSoundFormState();
  }

  function advanceDualPrototype(status) {
    if (!dualPrototypeState || dualActionLocked) return;
    dualActionLocked = true;
    var item = currentDualPrototypeItem();
    var allowed =
      item && item.type === 'read'
        ? ['recorded_pending_human_review', 'skipped', 'technical_deferred']
        : ['independent_correct', 'needs_repair', 'skipped', 'technical_deferred'];
    if (!item || allowed.indexOf(status) < 0) {
      dualActionLocked = false;
      return;
    }
    dualPrototypeState.results.push({ wordId: item.wordId, type: item.type, status: status });
    var entryState = hardWordSoundFormState.entries[item.wordId] || {
      read: { attempts: 0, recordings: 0, skips: 0, lastAt: 0, status: '' },
      spell: {
        attempts: 0,
        independentPasses: 0,
        repairNeeded: 0,
        skips: 0,
        lastAt: 0,
        status: '',
      },
    };
    var eventAt = Date.now();
    if (status !== 'technical_deferred') {
      var target = entryState[item.type];
      target.attempts += 1;
      target.lastAt = eventAt;
      target.status = status;
      if (item.type === 'read' && status === 'recorded_pending_human_review') {
        target.recordings += 1;
      }
      if (item.type === 'spell' && status === 'independent_correct') {
        target.independentPasses += 1;
      }
      if (item.type === 'spell' && status === 'needs_repair') target.repairNeeded += 1;
      if (status === 'skipped') target.skips += 1;
      hardWordSoundFormState.entries[item.wordId] = entryState;
    }
    hardWordSoundFormState.journal.push({
      wordId: item.wordId,
      type: item.type,
      status: status,
      at: eventAt,
    });
    hardWordSoundFormState.journal = hardWordSoundFormState.journal.slice(-500);
    cleanupMedia();
    dualPrototypeState.index += 1;
    resetDualPrototypeTask(dualPrototypeState);
    hardWordSoundFormState.active = dualPrototypeState;
    saveHardWordSoundFormState();
    renderDualPrototype();
    setTimeout(function () {
      dualActionLocked = false;
    }, 650);
    scrollToTop();
  }

  function playDualModelAudio(button, blind) {
    if (!dualPrototypeState) return;
    if (toggleCurrentPlayback(button)) return;
    var word = currentDualPrototypeWord();
    var accent = button.dataset.accent === 'us' ? 'us' : 'uk';
    var audioEntry = findHardWordAudioEntry(word.id);
    var source =
      audioEntry && audioEntry.audio && audioEntry.audio[accent]
        ? audioEntry.audio[accent].src
        : '';
    if (!source) {
      if (blind) lockDualSpellAudioFailure();
      showToast('这条练习音频尚未就绪。');
      return;
    }
    startAudioPlayback(source + '?v=' + encodeURIComponent(AUDIO_ASSET_VERSION), button, 1, {
      dualBlind: Boolean(blind),
    });
  }

  function unlockDualSpellControls() {
    if (!dualPrototypeState || dualPrototypeState.step.indexOf('spell-') !== 0) return;
    dualPrototypeState.task.audioReady = true;
    dualPrototypeState.task.audioFailed = false;
    dualPrototypeState.task.technicalFailure = false;
    persistDualPrototypeProgress();
    main
      .querySelectorAll('[data-dual-task-card] input, [data-dual-task-card] form button')
      .forEach(function (control) {
        control.disabled = false;
      });
    var input = main.querySelector('[data-dual-task-card] input:not([type="hidden"])');
    if (input) input.focus({ preventScroll: true });
  }

  function lockDualSpellAudioFailure() {
    if (!dualPrototypeState || dualPrototypeState.step.indexOf('spell-') !== 0) return;
    dualPrototypeState.task.audioReady = false;
    dualPrototypeState.task.audioFailed = true;
    dualPrototypeState.task.technicalFailure = true;
    persistDualPrototypeProgress();
    main
      .querySelectorAll('[data-dual-task-card] input, [data-dual-task-card] form button')
      .forEach(function (control) {
        control.disabled = true;
      });
    var feedback = main.querySelector('[data-dual-feedback]');
    if (feedback) {
      feedback.className = 'feedback is-wrong';
      feedback.textContent = '音频未播放，本次不记错。请重试或跳过。';
    }
  }

  function markDualTechnicalFailure(message) {
    if (!dualPrototypeState || !dualPrototypeState.task) return;
    dualPrototypeState.task.technicalFailure = true;
    dualPrototypeState.task.error = message;
    persistDualPrototypeProgress();
    renderDualPrototype();
  }

  function startHardWordPractice(mode, wordIds) {
    var ids = (Array.isArray(wordIds) ? wordIds : []).filter(function (wordId) {
      return Boolean(findHardWordEntry(wordId));
    });
    if (!ids.length) {
      showToast('当前没有可练的难词。');
      return;
    }
    hardWordPracticeState.active = {
      mode: mode,
      wordIds: ids.slice(0, mode === 'sentence' ? 5 : 10),
      index: 0,
      stage: mode === 'sentence' ? 'writing' : 'memory',
      repaired: false,
      submitted: false,
      lastResult: '',
    };
    saveHardWordPracticeState();
    pushSessionHistoryState();
    renderHardWordPractice();
  }

  function nextHardWordPracticeIds(mode) {
    var matches = filteredHardWords();
    if (!matches.length) {
      return [];
    }
    var limit = mode === 'sentence' ? 5 : 10;
    var cursor = hardWordPracticeState.cursors[mode] % matches.length;
    var ordered = matches.slice(cursor).concat(matches.slice(0, cursor));
    var newEntries = ordered.filter(function (entry) {
      var entryState = hardWordPracticeState.entries[entry.id] || {};
      var modeState = entryState[mode] || {};
      return mode === 'spell'
        ? !Number(modeState.attempts) && !Number(modeState.skips)
        : !Number(modeState.submissions) && !Number(modeState.skips);
    });
    var practicedEntries = ordered.filter(function (entry) {
      return newEntries.indexOf(entry) < 0;
    });
    var selected = newEntries.concat(practicedEntries).slice(0, limit);
    hardWordPracticeState.cursors[mode] = (cursor + selected.length) % matches.length;
    saveHardWordPracticeState();
    return selected.map(function (entry) {
      return entry.id;
    });
  }

  function startHardWordsBatch(mode) {
    var ids = nextHardWordPracticeIds(mode);
    if (!ids.length) {
      showToast('当前筛选没有可练的词。');
      return;
    }
    startHardWordPractice(mode, ids);
  }

  function activeHardWordMode() {
    var active = hardWordPracticeState.active;
    if (!active) return '';
    if (active.mode !== 'combined') return active.mode;
    return active.index < 5 ? 'spell' : 'sentence';
  }

  function activeHardWordEntry() {
    var active = hardWordPracticeState.active;
    return active ? findHardWordEntry(active.wordIds[active.index]) : null;
  }

  function resumeHardWordPractice() {
    if (hardWordsLoadState === 'ready' && hardWordsCatalog) {
      renderHardWordPractice();
      return;
    }
    currentView = 'hard-word-practice';
    setActiveNav('hard-words');
    main.innerHTML =
      '<section class="hard-words-shell"><div class="panel hard-words-loading" role="status"><span class="loading-dot" aria-hidden="true"></span><p>正在恢复难词练习……</p></div></section>';
    fetchHardWordsCatalog('no-cache')
      .then(function (payload) {
        validateHardWordsCatalog(payload);
        hardWordsCatalog = payload;
        sanitiseHardWordPracticeForCatalog();
        hardWordsCatalog.entries.forEach(function (entry) {
          entry._searchText = normaliseAnswer(
            String(entry.displayWord || '') + ' ' + String(entry.normalizedHeadword || ''),
          );
        });
        hardWordsLoadState = 'ready';
        renderHardWordPractice();
      })
      .catch(function () {
        hardWordPracticeState.active = null;
        saveHardWordPracticeState();
        renderHardWordsCatalog();
      });
  }

  function renderHardWordPractice() {
    clearTimeout(hardWordMemoryTimer);
    var active = hardWordPracticeState.active;
    var entry = activeHardWordEntry();
    if (!active || !entry) {
      finishHardWordPractice();
      return;
    }
    currentView = 'hard-word-practice';
    setActiveNav('hard-words');
    var mode = activeHardWordMode();
    var total = active.wordIds.length;
    main.innerHTML =
      '<section class="hard-word-practice-shell" data-hard-word-practice data-mode="' +
      esc(mode) +
      '"><header class="hard-word-practice-head"><button class="text-button" type="button" data-action="hard-word-exit">← 难词表</button><p>' +
      (active.index + 1) +
      ' / ' +
      total +
      '</p></header><div class="hard-word-practice-track"><i style="width:' +
      Math.round(((active.index + 1) / total) * 100) +
      '%"></i></div><p class="hard-word-practice-summary" data-hard-word-practice-summary>' +
      esc(hardWordPracticeSummary(entry)) +
      '</p>' +
      (mode === 'spell' ? renderHardWordSpelling(entry) : renderHardWordSentence(entry)) +
      '</section>';
    if (mode === 'spell' && active.stage === 'memory') {
      hardWordMemoryTimer = setTimeout(
        hideHardWordForRecall,
        /[ -]/.test(String(entry.normalizedHeadword || '')) ? 4000 : 2500,
      );
    }
  }

  function renderHardWordSpelling(entry) {
    var active = hardWordPracticeState.active;
    if (active.stage === 'memory') {
      return (
        '<article class="panel hard-word-practice-card hard-word-memory" data-hard-word-memory><p class="eyebrow">先看清词形</p><h1>' +
        esc(entry.displayWord) +
        '</h1><p>记住字母、空格和连字符。</p><button class="primary-button" type="button" data-action="hard-word-hide">遮住，开始拼写</button></article>'
      );
    }
    var result = active.lastResult || 'blank';
    var feedback =
      result === 'skipped'
        ? '本词已跳过，答案仍保持隐藏。'
        : result === 'incorrect'
          ? '还不对。检查字母顺序、空格和连字符后再试；答案仍保持隐藏。'
          : result === 'correct'
            ? active.repaired
              ? '纠错拼写完成；这次不计独立拼对。'
              : '首次遮词后独立拼对。'
            : '';
    var actions =
      result === 'correct' || result === 'skipped'
        ? '<button class="primary-button" type="button" data-action="hard-word-next">下一词</button>'
        : result === 'incorrect'
          ? '<button class="primary-button" type="button" data-action="hard-word-retry">再试一次</button><button class="quiet-button" type="button" data-action="hard-word-skip">跳过</button>'
          : '<button class="quiet-button" type="button" data-action="hard-word-show-again">再看一次</button><button class="quiet-button" type="button" data-action="hard-word-skip">跳过</button>';
    return (
      '<article class="panel hard-word-practice-card"><p class="eyebrow">短时正字法回忆</p><h1>写出刚才看到的词</h1>' +
      (result === 'correct' || result === 'skipped'
        ? ''
        : '<form class="hard-word-answer-form" data-hard-word-spell-form><label><span class="sr-only">输入拼写</span><input name="answer" data-hard-word-spell-input autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="输入拼写"></label><button class="primary-button" type="submit">检查拼写</button></form>') +
      '<div class="feedback hard-word-practice-feedback' +
      (result === 'correct' ? ' is-correct' : result === 'incorrect' ? ' is-wrong' : '') +
      '" data-hard-word-spell-feedback data-result="' +
      result +
      '" role="status" aria-live="polite">' +
      esc(feedback) +
      '</div><div class="hard-word-practice-actions">' +
      actions +
      '</div></article>'
    );
  }

  function hideHardWordForRecall() {
    var active = hardWordPracticeState.active;
    if (!active || activeHardWordMode() !== 'spell' || active.stage !== 'memory') return;
    active.stage = 'recall';
    active.submitted = false;
    active.lastResult = '';
    saveHardWordPracticeState();
    renderHardWordPractice();
    var input = main.querySelector('[data-hard-word-spell-input]');
    if (input) input.focus();
  }

  function normaliseHardWordSpelling(value) {
    return normaliseAnswer(value);
  }

  function checkHardWordSpelling(answer) {
    var active = hardWordPracticeState.active;
    var entry = activeHardWordEntry();
    if (!active || !entry || activeHardWordMode() !== 'spell' || active.submitted) return;
    var input = String(answer || '');
    if (!input.trim()) {
      setHardWordSpellFeedback('请先输入拼写。', 'incorrect');
      return;
    }
    active.submitted = true;
    var entryState = hardWordEntryState(entry.id).spell;
    entryState.attempts = Math.max(0, Number(entryState.attempts) || 0) + 1;
    entryState.lastAt = Date.now();
    var correct =
      normaliseHardWordSpelling(input) === normaliseHardWordSpelling(entry.normalizedHeadword);
    var outcome;
    if (correct) {
      outcome = active.repaired ? 'repair_pass' : 'blind_pass';
      if (active.repaired)
        entryState.repairPasses = Math.max(0, Number(entryState.repairPasses) || 0) + 1;
      else entryState.blindPasses = Math.max(0, Number(entryState.blindPasses) || 0) + 1;
    } else {
      outcome = 'incorrect';
      active.repaired = true;
    }
    active.lastResult = correct ? 'correct' : 'incorrect';
    appendHardWordJournal(entry.id, 'spell', outcome);
    saveHardWordPracticeState();
    if (correct) {
      setHardWordSpellFeedback(
        active.repaired ? '纠错拼写完成；这次不计独立拼对。' : '首次遮词后独立拼对。',
        'correct',
      );
      replaceHardWordPracticeActions(
        '<button class="primary-button" type="button" data-action="hard-word-next">下一词</button>',
      );
      return;
    }
    setHardWordSpellFeedback(
      '还不对。检查字母顺序、空格和连字符后再试；答案仍保持隐藏。',
      'incorrect',
    );
    replaceHardWordPracticeActions(
      '<button class="primary-button" type="button" data-action="hard-word-retry">再试一次</button><button class="quiet-button" type="button" data-action="hard-word-skip">跳过</button>',
    );
  }

  function setHardWordSpellFeedback(message, result, allowHtml) {
    var feedback = main.querySelector('[data-hard-word-spell-feedback]');
    if (!feedback) return;
    feedback.dataset.result = result;
    feedback.className =
      'feedback hard-word-practice-feedback ' + (result === 'correct' ? 'is-correct' : 'is-wrong');
    if (allowHtml) feedback.innerHTML = message;
    else feedback.textContent = message;
  }

  function replaceHardWordPracticeActions(html) {
    var actions = main.querySelector('.hard-word-practice-actions');
    if (actions) actions.innerHTML = html;
  }

  function retryHardWordSpelling() {
    var active = hardWordPracticeState.active;
    if (!active) return;
    active.submitted = false;
    active.lastResult = '';
    saveHardWordPracticeState();
    var input = main.querySelector('[data-hard-word-spell-input]');
    if (input) {
      input.value = '';
      input.disabled = false;
      input.focus();
    }
    setHardWordSpellFeedback('', 'blank');
    replaceHardWordPracticeActions(
      '<button class="quiet-button" type="button" data-action="hard-word-skip">跳过</button>',
    );
  }

  function showHardWordAgain() {
    var active = hardWordPracticeState.active;
    if (!active || activeHardWordMode() !== 'spell' || active.submitted) return;
    active.stage = 'memory';
    active.repaired = true;
    active.lastResult = '';
    saveHardWordPracticeState();
    renderHardWordPractice();
  }

  function renderHardWordSentence(entry) {
    var entryState = hardWordEntryState(entry.id).sentence;
    var result = entryState.status || 'blank';
    var feedback =
      result === 'pending_human_review'
        ? '已保存，等待老师人工评阅；这里不自动判定语法或词义。'
        : result === 'needs_revision'
          ? '先按提示修改，再保存给老师评阅。'
          : result === 'skipped'
            ? '本词已跳过；已输入的草稿仍保存在这台设备。'
            : '';
    return (
      '<article class="panel hard-word-practice-card"><p class="eyebrow">造句 · 人工评阅</p><h1>' +
      esc(entry.displayWord) +
      '</h1><p>写一个包含完整目标词的句子。系统只检查表面结构，不判断语法或意思。</p><form data-hard-word-sentence-form><label><span class="sr-only">用目标词造句</span><textarea class="sentence-input" name="sentence" data-hard-word-sentence-input aria-label="用目标词造句" placeholder="在这里写句子……">' +
      esc(entryState.draft || '') +
      '</textarea></label><button class="primary-button" type="submit" data-action="hard-word-sentence-save">保存给老师评阅</button></form><div class="feedback hard-word-practice-feedback' +
      (result === 'needs_revision'
        ? ' is-wrong'
        : result === 'pending_human_review'
          ? ' is-pending'
          : '') +
      '" data-hard-word-sentence-feedback data-result="' +
      esc(result) +
      '" role="status" aria-live="polite">' +
      esc(feedback) +
      '</div><div class="hard-word-practice-actions"><button class="quiet-button" type="button" data-action="hard-word-skip">跳过</button><button class="secondary-button" type="button" data-action="hard-word-next">下一词</button></div></article>'
    );
  }

  function hardWordTargetPattern(target) {
    var escaped = normaliseAnswer(target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z])' + escaped.replace(/ /g, '\\s+') + '(?=$|[^a-z])', 'i');
  }

  function evaluateHardWordSentence(sentence) {
    var active = hardWordPracticeState.active;
    var entry = activeHardWordEntry();
    if (!active || !entry || activeHardWordMode() !== 'sentence' || active.submitted) return;
    var text = String(sentence || '').trim();
    var checks = {
      target: hardWordTargetPattern(entry.normalizedHeadword).test(normaliseAnswer(text)),
      capital: /^[A-Z]/.test(text),
      punctuation: /[.!?]["')\]]?$/.test(text),
      length: (text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || []).length >= 5,
    };
    var ready = checks.target && checks.capital && checks.punctuation && checks.length;
    if (!ready) {
      var missing = [];
      if (!checks.target) missing.push('包含完整目标词');
      if (!checks.capital) missing.push('首字母大写');
      if (!checks.punctuation) missing.push('补上句末标点');
      if (!checks.length) missing.push('写成至少 5 个英文词的完整想法');
      var revisionState = hardWordEntryState(entry.id).sentence;
      revisionState.status = 'needs_revision';
      revisionState.draft = text;
      revisionState.lastAt = Date.now();
      saveHardWordPracticeState();
      var revisionFeedback = main.querySelector('[data-hard-word-sentence-feedback]');
      if (revisionFeedback) {
        revisionFeedback.dataset.result = 'needs_revision';
        revisionFeedback.className = 'feedback hard-word-practice-feedback is-wrong';
        revisionFeedback.textContent =
          '请先修改：' + missing.join('；') + '。这不是语法或词义判分。';
      }
      return;
    }
    active.submitted = true;
    var sentenceState = hardWordEntryState(entry.id).sentence;
    sentenceState.submissions = Math.max(0, Number(sentenceState.submissions) || 0) + 1;
    sentenceState.draft = text;
    sentenceState.status = 'pending_human_review';
    sentenceState.lastAt = Date.now();
    appendHardWordJournal(entry.id, 'sentence', 'pending_human_review');
    saveHardWordPracticeState();
    var feedback = main.querySelector('[data-hard-word-sentence-feedback]');
    if (feedback) {
      feedback.dataset.result = 'pending_human_review';
      feedback.className = 'feedback hard-word-practice-feedback is-pending';
      feedback.textContent = '已保存，等待老师人工评阅；系统没有判定语法、词义或掌握。';
    }
  }

  function skipHardWordPractice() {
    var active = hardWordPracticeState.active;
    var entry = activeHardWordEntry();
    var mode = activeHardWordMode();
    if (!active || !entry || active.submitted) return;
    active.submitted = true;
    if (mode === 'spell') {
      var spell = hardWordEntryState(entry.id).spell;
      spell.skips = Math.max(0, Number(spell.skips) || 0) + 1;
      spell.lastAt = Date.now();
      appendHardWordJournal(entry.id, 'spell', 'skipped');
      active.lastResult = 'skipped';
      saveHardWordPracticeState();
      setHardWordSpellFeedback('本词已跳过，答案仍保持隐藏。', 'skipped');
      replaceHardWordPracticeActions(
        '<button class="primary-button" type="button" data-action="hard-word-next">下一词</button>',
      );
    } else {
      var sentence = hardWordEntryState(entry.id).sentence;
      sentence.skips = Math.max(0, Number(sentence.skips) || 0) + 1;
      sentence.status = 'skipped';
      sentence.lastAt = Date.now();
      appendHardWordJournal(entry.id, 'sentence', 'skipped');
      saveHardWordPracticeState();
      renderHardWordPractice();
    }
  }

  function nextHardWordPractice() {
    var active = hardWordPracticeState.active;
    if (!active) return;
    active.index += 1;
    if (active.index >= active.wordIds.length) {
      finishHardWordPractice();
      return;
    }
    active.stage = activeHardWordMode() === 'sentence' ? 'writing' : 'memory';
    active.repaired = false;
    active.submitted = false;
    active.lastResult = '';
    saveHardWordPracticeState();
    renderHardWordPractice();
  }

  function finishHardWordPractice() {
    clearTimeout(hardWordMemoryTimer);
    hardWordPracticeState.active = null;
    saveHardWordPracticeState();
    currentView = 'hard-words';
    setActiveNav('hard-words');
    main.innerHTML =
      '<section class="panel hard-word-practice-finish"><p class="eyebrow">PRACTICE SAVED</p><h1>这组练习已完成</h1><p>拼写结果和造句草稿已保存在这台设备；造句仍需老师人工评阅。</p><button class="primary-button" type="button" data-action="go-view" data-view="hard-words">返回难词表</button></section>';
  }

  function compactPracticeCard(icon, title, skill) {
    return (
      '<button class="panel compact-practice-card" type="button" data-action="start-skill" data-skill="' +
      esc(skill) +
      '"><span aria-hidden="true">' +
      esc(icon) +
      '</span><strong>' +
      esc(title) +
      '</strong><i aria-hidden="true">→</i></button>'
    );
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
      '<span>关卡无提示完成</span>' +
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
      visualTab(
        'family',
        '看图变词',
        (Array.isArray(VISUAL_LAB.familyAtlases) ? VISUAL_LAB.familyAtlases.length : 0) + ' 组',
      ) +
      visualTab('synonym', '近义辨析', '4 组') +
      visualTab('antonym', '反义对照', '4 组') +
      visualTab(
        'games',
        '词网游戏',
        (Array.isArray(VISUAL_LAB.gameModes) ? VISUAL_LAB.gameModes.length : 0) + ' 类',
      ) +
      visualTab(
        'corpus',
        '词库地图',
        corpusCatalog && corpusCatalog.statistics
          ? Number(corpusCatalog.statistics.active_entries || 0).toLocaleString('en-US') + ' 词'
          : 'PDF 总库',
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
    } else if (visualSection === 'family') {
      container.innerHTML = renderVisualFamilies();
    } else if (visualSection === 'games') {
      container.innerHTML = renderVisualGames();
    } else if (visualSection === 'corpus') {
      renderCorpusCatalog(container);
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
    var complete = taskState.completed && !retrying;
    var step = Math.min(Number(taskState.step) || 0, scene.questions.length - 1);
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
        ? renderVisualPosComplete(scene, taskState)
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

  function renderVisualPosComplete(scene, taskState) {
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
      '</div><div class="visual-result-actions"><span>' +
      (taskState.needsReview
        ? '✓ 已完成待复习；下次再做一次无提示判断'
        : '✓ 四种实词已经全部找对，本关无提示完成') +
      '</span>' +
      '<button class="secondary-button" type="button" data-action="visual-retry" data-task-id="' +
      esc(scene.id) +
      '">再挑战一次</button></div></section>'
    );
  }

  function visualFamilyAtlases() {
    return Array.isArray(VISUAL_LAB.familyAtlases) ? VISUAL_LAB.familyAtlases : [];
  }

  function findVisualFamilyTask(taskId) {
    return visualFamilyAtlases().find(function (task) {
      return task.id === taskId;
    });
  }

  function visualFamilyFoundation(task) {
    if (!task) return null;
    return FORM_FOUNDATIONS.find(function (foundation) {
      return foundation.id === task.targetWordId;
    });
  }

  function visualFamilyPracticeSlots(task) {
    var foundation = visualFamilyFoundation(task);
    if (!foundation || !foundation.formPractice) return [];
    return foundation.formPractice.slots.filter(function (slot) {
      return !slot.given;
    });
  }

  function renderVisualFamilies() {
    var tasks = visualFamilyAtlases();
    if (!tasks.length) {
      return '<div class="empty-state">看图变词课程暂时没有载入，请刷新页面后重试。</div>';
    }
    return (
      '<section class="visual-section-intro visual-family-intro">' +
      '<div><p class="eyebrow">WORD FAMILY ATLAS</p><h2>同一幅图，练会完整词族</h2></div>' +
      '<p>名词作为题面，动词、形容词和副词必须自己拼写。答错只给构词线索；全部拼对以后才显示完整词族。</p></section>' +
      '<div class="visual-family-grid">' +
      tasks.map(renderVisualFamilyCard).join('') +
      '</div>'
    );
  }

  function renderVisualFamilyCard(task) {
    var foundation = visualFamilyFoundation(task);
    if (!foundation || !foundation.formPractice) return '';
    var taskState = getVisualTaskState(task.id);
    var retrying = Boolean(visualRuntime.unlockedTasks[task.id]);
    var skipped = Boolean(taskState.skipped || visualRuntime.skippedTasks[task.id]);
    var complete = taskState.completed && !retrying;
    var practiceSlots = visualFamilyPracticeSlots(task);
    var step = Math.min(Number(taskState.step) || 0, practiceSlots.length - 1);
    var activeSlot = practiceSlots[step];
    var activePanel = activeSlot
      ? task.panels.find(function (panel) {
          return panel.slot === activeSlot.key;
        })
      : null;
    var stateClass = complete ? ' is-complete' : skipped ? ' is-skipped' : '';
    return (
      '<article class="panel visual-family-card' +
      stateClass +
      '" data-visual-task-id="' +
      esc(task.id) +
      '" data-complete="' +
      String(complete) +
      '">' +
      '<header class="visual-family-head"><div><span class="relation-chip family">看图变词</span><h3>' +
      esc(task.title) +
      '</h3></div><span class="visual-family-base"><small>题面名词</small><strong>' +
      esc(foundation.word) +
      '</strong></span></header>' +
      '<div class="visual-family-status" aria-label="词族完成进度">' +
      foundation.formPractice.slots
        .map(function (slot, index) {
          var answered = slot.given || complete || (!skipped && index > 0 && index <= step);
          return (
            '<span class="' +
            (slot.given ? 'is-given' : answered ? 'is-done' : '') +
            '"><small>' +
            esc(slot.label) +
            '</small><strong>' +
            (slot.given
              ? esc(slot.answer)
              : complete
                ? esc(slot.answer)
                : answered
                  ? '已拼对 ✓'
                  : '待拼写') +
            '</strong></span>'
          );
        })
        .join('') +
      '</div>' +
      '<figure class="visual-figure visual-family-figure">' +
      '<div class="visual-image-frame">' +
      '<img src="' +
      esc(task.image) +
      '" data-src="' +
      esc(task.image) +
      '" data-visual-image alt="' +
      esc(task.alt) +
      '" width="' +
      Number(task.width || 1200) +
      '" height="' +
      Number(task.height || 800) +
      '" loading="lazy" decoding="async">' +
      (!complete && !skipped && activePanel
        ? '<span class="visual-family-focus is-' +
          esc(activePanel.area) +
          '" aria-hidden="true"></span><span class="visual-family-cue">观察高亮画格</span>'
        : '') +
      '<div class="visual-image-error" data-image-error hidden role="status">图片暂时没有载入。' +
      '<button type="button" data-action="visual-retry-image">重新加载图片</button></div>' +
      '</div>' +
      '<figcaption>' +
      (complete
        ? '四格场景与完整词族现已同时解锁。'
        : skipped
          ? '本轮没有显示完整词族，稍后可重新挑战。'
          : '先观察高亮画格，再根据词性和句子完成拼写。') +
      '</figcaption></figure>' +
      (complete
        ? renderVisualFamilyResult(task, foundation, taskState)
        : skipped
          ? '<div class="visual-skipped"><strong>本轮已跳过</strong><p>答案仍然隐藏，可以稍后从动词重新开始。</p>' +
            '<button class="secondary-button" type="button" data-action="visual-retry" data-task-id="' +
            esc(task.id) +
            '">重新挑战</button></div>'
          : renderVisualFamilyQuestion(task, activeSlot, activePanel, step, practiceSlots.length)) +
      '</article>'
    );
  }

  function renderVisualFamilyQuestion(task, slot, panel, step, total) {
    if (!slot || !panel) return '';
    return (
      '<section class="visual-question visual-family-question">' +
      '<div class="visual-question-meta"><span>变形 ' +
      (step + 1) +
      ' / ' +
      total +
      '</span><strong>' +
      esc(slot.label) +
      '</strong></div>' +
      '<h4>' +
      esc(panel.prompt) +
      '</h4><p class="visual-family-scene-clue">画面线索：' +
      esc(panel.sceneLabel) +
      '</p>' +
      '<form class="visual-family-form" data-visual-family-form data-task-id="' +
      esc(task.id) +
      '"><label for="visualFamilyInput-' +
      esc(task.id) +
      '">直接输入英文变形</label><div><input id="visualFamilyInput-' +
      esc(task.id) +
      '" name="answer" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="text" data-visual-family-control aria-describedby="visualFamilyFeedback-' +
      esc(task.id) +
      '"><button class="primary-button" type="submit" data-visual-family-control>检查拼写</button></div></form>' +
      '<p id="visualFamilyFeedback-' +
      esc(task.id) +
      '" class="visual-feedback" role="status" aria-live="polite">答案不会从大写、选项或图片说明中泄露。</p>' +
      '<button class="visual-skip-link" type="button" data-action="visual-family-skip" data-task-id="' +
      esc(task.id) +
      '">这组不会 · 先跳过且不看答案</button></section>'
    );
  }

  function renderVisualFamilyResult(task, foundation, taskState) {
    return (
      '<section class="visual-family-result"><p class="eyebrow">FULL FAMILY UNLOCKED</p>' +
      '<div class="visual-family-answer-grid">' +
      foundation.formPractice.slots
        .map(function (slot) {
          return (
            '<article><span>' +
            esc(slot.label) +
            '</span><strong>' +
            esc(slot.answer) +
            '</strong><p>' +
            esc(slot.gloss) +
            '</p></article>'
          );
        })
        .join('') +
      '</div>' +
      renderVisualFamilyMemory(task) +
      '<div class="visual-result-actions"><span>' +
      (taskState.needsReview
        ? '✓ 已完成待复习；本轮用过构词提示'
        : '✓ 三个变形全部独立拼对，本关无提示完成') +
      '</span>' +
      '<button class="secondary-button" type="button" data-action="visual-retry" data-task-id="' +
      esc(task.id) +
      '">遮住答案再练一次</button></div></section>'
    );
  }

  function renderVisualFamilyMemory(task) {
    var story = task && task.story;
    var etymology = task && task.etymology;
    if (!story && !etymology) return '';
    var storyMarkup = story
      ? '<details class="visual-family-story" open><summary><span>四格故事链</span><strong>' +
        esc(story.title || '读一遍，再收起文字复述') +
        '</strong></summary><div><p class="visual-family-story-en" lang="en">' +
        esc(story.english) +
        '</p><p>' +
        esc(story.chinese) +
        '</p></div></details><p class="visual-family-retell"><strong>复述挑战</strong>' +
        esc(story.retellPrompt || '收起故事，只看四格图，用四种词性把事件讲一遍。') +
        '</p>'
      : '';
    var sourceMarkup =
      etymology && Array.isArray(etymology.sources)
        ? etymology.sources
            .map(function (source) {
              return (
                '<a href="' +
                esc(source.url) +
                '" target="_blank" rel="noreferrer noopener">' +
                esc(source.label) +
                '</a>'
              );
            })
            .join('')
        : '';
    var etymologyMarkup = etymology
      ? '<details class="visual-family-etymology"><summary><span>' +
        esc(etymology.level || '词源卡') +
        '</span><strong>词源故事与记忆钩子</strong></summary><div class="visual-family-etymology-grid">' +
        '<article><small>真实词源</small><p>' +
        esc(etymology.fact) +
        '</p></article><article><small>想象镜头</small><p>' +
        esc(etymology.memoryHook) +
        '</p></article><article><small>今天怎么变</small><p>' +
        esc(etymology.modernRule) +
        '</p></article></div>' +
        (sourceMarkup
          ? '<p class="visual-family-sources"><span>核实来源</span>' + sourceMarkup + '</p>'
          : '') +
        '</details>'
      : '';
    return '<div class="visual-family-memory">' + storyMarkup + etymologyMarkup + '</div>';
  }

  function renderVisualComparisonCard(task) {
    var taskState = getVisualTaskState(task.id);
    var retrying = Boolean(visualRuntime.unlockedTasks[task.id]);
    var skipped = Boolean(
      taskState.skipped || (visualRuntime.skippedTasks && visualRuntime.skippedTasks[task.id]),
    );
    var complete = taskState.completed && !retrying;
    var step = Math.min(Number(taskState.step) || 0, task.scenes.length - 1);
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
        ? renderVisualComparisonResult(task, taskState)
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

  function renderVisualComparisonResult(task, taskState) {
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
      '</p><div class="visual-result-actions"><span>' +
      (taskState.needsReview
        ? '✓ 已完成待复习；下次不看提示再判断'
        : '✓ 两个场景都已判断正确，本关无提示完成') +
      '</span>' +
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
    var taskState = getVisualTaskState(task.id);
    var answered = Boolean(visualRuntime.gameAnswered[task.id]);
    var progress = visualGameModeProgress(mode);
    var imageFocus = ['left', 'right', 'all'].indexOf(task.focus) >= 0 ? task.focus : 'left';
    var imageCue =
      imageFocus === 'all'
        ? '<span class="visual-side-cue visual-side-cue-all">观察整图</span>'
        : '<span class="visual-side-cue">只看' +
          (imageFocus === 'right' ? '右' : '左') +
          '图</span>';
    var image = task.image
      ? '<figure class="visual-game-figure"><div class="visual-image-frame focus-' +
        esc(imageFocus) +
        '"><img src="' +
        esc(task.image) +
        '" data-src="' +
        esc(task.image) +
        '" data-visual-image alt="' +
        esc(task.alt) +
        '" width="' +
        Number(task.width || 1200) +
        '" height="' +
        Number(task.height || 800) +
        '" loading="lazy" decoding="async">' +
        imageCue +
        '<div class="visual-image-error" data-image-error hidden role="status">图片暂时没有载入。' +
        '<button type="button" data-action="visual-retry-image">重新加载图片</button></div></div>' +
        '<figcaption>' +
        esc(task.caption || '先观察画面，再结合句子判断。') +
        '</figcaption></figure>'
      : '';
    var audioLabel = task.audioLabel || mode.audioLabel || '单词语音';
    var audioStatus = task.audioStatus || mode.audioStatus || '先听读音，再结合题目判断。';
    var audio = task.audioId
      ? '<div class="visual-game-listen"><button class="audio-button visual-game-audio" type="button" data-action="visual-game-audio" data-audio-id="' +
        esc(task.audioId) +
        '" data-audio-label="' +
        esc(audioLabel) +
        '" data-status-target="visualGameAudioStatus" aria-label="播放' +
        esc(audioLabel) +
        '"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">先听声音</span></button>' +
        '<span id="visualGameAudioStatus" aria-live="polite">' +
        esc(audioStatus) +
        '</span></div>'
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
      '</strong><span>无提示完成</span></div></header>' +
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
          '</p><p><strong>学习状态：</strong>' +
          (taskState.needsReview ? '已完成待复习；下次再做一次无提示判断。' : '本关无提示完成。') +
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
      (remaining ? '这一轮已经走完' : esc(mode.label) + ' 已全部无提示完成') +
      '</h3><p>' +
      (remaining
        ? '还有 ' +
          remaining +
          ' 题需要再做一次无提示判断；跳过或提示后答对的题只记为“已完成待复习”。'
        : replaying
          ? '复习轮完成。无提示完成记录会保留，仍可再玩一轮巩固。'
          : '这一类词义关系已经全部无提示答对，可以重玩来巩固速度。') +
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

  function renderCorpusCatalog(container) {
    if (corpusLoadState === 'idle') {
      container.innerHTML =
        '<section class="panel corpus-loading" aria-live="polite">' +
        '<span class="corpus-loading-mark" aria-hidden="true">↻</span>' +
        '<div><p class="eyebrow">LOADING CORPUS</p><h2>正在载入全量词库地图</h2>' +
        '<p>大词库只在打开这一页时下载，不影响手机进入日常训练的速度。</p></div></section>';
      loadCorpusCatalog(false);
      return;
    }
    if (corpusLoadState === 'loading') {
      container.innerHTML =
        '<section class="panel corpus-loading" aria-live="polite">' +
        '<span class="corpus-loading-mark" aria-hidden="true">↻</span>' +
        '<div><p class="eyebrow">LOADING CORPUS</p><h2>正在载入全量词库地图</h2>' +
        '<p>完成后可以按听、说、读、写、词性和 CEFR 筛选。</p></div></section>';
      return;
    }
    if (corpusLoadState === 'error' || !corpusCatalog) {
      container.innerHTML =
        '<section class="panel corpus-loading corpus-error" role="alert">' +
        '<span class="corpus-loading-mark" aria-hidden="true">!</span>' +
        '<div><p class="eyebrow">CORPUS UNAVAILABLE</p><h2>全量词库暂时没有载入</h2>' +
        '<p>' +
        esc(corpusLoadError || '请检查网络后重试；当前训练和图片题不受影响。') +
        '</p><button class="secondary-button" type="button" data-action="corpus-retry">重新载入</button>' +
        '</div></section>';
      return;
    }

    var stats = corpusCatalog.statistics || {};
    container.innerHTML =
      '<section class="visual-section-intro corpus-intro">' +
      '<div><p class="eyebrow">AUDITABLE IELTS CORPUS</p><h2>从 PDF 词表到可审核的学习地图</h2></div>' +
      '<p>这里展示去重并剔除专名后的索引。听说读写可以重叠；“主分类”只用于浏览。词义、关系词和图片进入正式题目之前仍需教师确认。</p>' +
      '</section>' +
      '<section class="corpus-stat-grid" aria-label="词库统计">' +
      corpusMetric(stats.active_entries, '去重词条') +
      corpusMetric(stats.source_rows, '来源记录') +
      corpusMetric(stats.image_eligible_entries, '待做图实词') +
      corpusMetric(stats.excluded_proper_nouns, '专名词条剔除') +
      '</section>' +
      '<section class="corpus-skill-grid" aria-label="听说读写快捷入口">' +
      corpusSkillButton('listening', '听力', stats.primary_skill_counts) +
      corpusSkillButton('speaking', '口语', stats.primary_skill_counts) +
      corpusSkillButton('reading', '阅读', stats.primary_skill_counts) +
      corpusSkillButton('writing', '写作', stats.primary_skill_counts) +
      '</section>' +
      '<section class="panel corpus-browser">' +
      '<div class="corpus-browser-head"><div><p class="eyebrow">FILTER THE MAP</p><h3>筛选词库</h3></div>' +
      '<p><strong data-corpus-match-count>0</strong><span> 个匹配词条</span></p></div>' +
      '<div class="corpus-controls">' +
      '<label class="corpus-search"><span>查单词或主题</span><input type="search" inputmode="search" autocomplete="off" placeholder="例如 environment / health" value="' +
      esc(corpusQuery) +
      '" data-action="corpus-search"></label>' +
      corpusSelect(
        'skill',
        '主分类',
        [
          ['all', '全部'],
          ['listening', '听力'],
          ['speaking', '口语'],
          ['reading', '阅读'],
          ['writing', '写作'],
        ],
        corpusFilters.skill,
      ) +
      corpusSelect(
        'pos',
        '词性',
        [
          ['all', '全部'],
          ['noun', '名词'],
          ['verb', '动词'],
          ['adjective', '形容词'],
          ['adverb', '副词'],
          ['phrase', '短语'],
        ],
        corpusFilters.pos,
      ) +
      corpusSelect(
        'cefr',
        'CEFR',
        [
          ['all', '全部'],
          ['A1', 'A1'],
          ['A2', 'A2'],
          ['B1', 'B1'],
          ['B2', 'B2'],
          ['C1', 'C1'],
          ['unknown', '待标注'],
        ],
        corpusFilters.cefr,
      ) +
      corpusSelect(
        'image',
        '图片队列',
        [
          ['all', '全部'],
          ['eligible', '可做图'],
          ['review', '需确认词义'],
          ['none', '非实词/暂不做图'],
        ],
        corpusFilters.image,
      ) +
      '</div>' +
      '<div class="corpus-quality-note"><strong>为什么不是直接批量出图？</strong>' +
      '<span>同一个拼写可能有不同词性和词义；先确认 sense，才能避免图片把学生带偏。</span></div>' +
      '<div data-corpus-results></div>' +
      '</section>';
    renderCorpusResults(false);
  }

  function corpusMetric(value, label) {
    return (
      '<article><strong>' +
      Number(value || 0).toLocaleString('en-US') +
      '</strong><span>' +
      esc(label) +
      '</span></article>'
    );
  }

  function corpusSkillButton(skill, label, counts) {
    var active = corpusFilters.skill === skill;
    return (
      '<button class="corpus-skill-button skill-' +
      esc(skill) +
      (active ? ' is-active' : '') +
      '" type="button" data-action="corpus-quick-skill" data-skill="' +
      esc(skill) +
      '" aria-pressed="' +
      String(active) +
      '"><span>' +
      esc(label) +
      '</span><strong>' +
      Number((counts && counts[skill]) || 0).toLocaleString('en-US') +
      '</strong><small>主分类词</small></button>'
    );
  }

  function corpusSelect(filter, label, options, value) {
    return (
      '<label><span>' +
      esc(label) +
      '</span><select data-action="corpus-filter" data-filter="' +
      esc(filter) +
      '">' +
      options
        .map(function (option) {
          return (
            '<option value="' +
            esc(option[0]) +
            '"' +
            (option[0] === value ? ' selected' : '') +
            '>' +
            esc(option[1]) +
            '</option>'
          );
        })
        .join('') +
      '</select></label>'
    );
  }

  function loadCorpusCatalog(force) {
    if (corpusLoadState === 'loading' && !force) {
      return;
    }
    corpusLoadState = 'loading';
    corpusLoadError = '';
    renderVisualSection();
    fetchCorpusCatalogPayload(force ? 'reload' : 'no-cache')
      .then(acceptCorpusCatalog)
      .catch(failCorpusCatalog);
  }

  function fetchCorpusCatalogPayload(cacheMode) {
    var catalogUrl = './corpus/catalog.json';
    var networkError = null;
    return fetch(catalogUrl, { cache: cacheMode })
      .then(function (response) {
        if (!response.ok) throw new Error('服务器返回 ' + response.status);
        return response;
      })
      .catch(function (error) {
        networkError = error;
        if (!('caches' in window)) throw error;
        return caches.match(catalogUrl).then(function (cached) {
          if (cached) return cached;
          throw networkError;
        });
      })
      .then(function (response) {
        return response.json();
      });
  }

  function acceptCorpusCatalog(payload) {
    if (!payload || !Array.isArray(payload.entries) || !payload.statistics) {
      throw new Error('词库文件结构不完整');
    }
    corpusCatalog = payload;
    corpusCatalog.entries.forEach(function (entry) {
      entry._searchText = normaliseAnswer(
        String(entry.headword || '') +
          ' ' +
          (Array.isArray(entry.topics) ? entry.topics.join(' ') : ''),
      );
    });
    corpusLoadState = 'ready';
    corpusLoadError = '';
    var meta = document.querySelector('[data-section="corpus"] small');
    if (meta) {
      meta.textContent =
        Number(payload.statistics.active_entries || 0).toLocaleString('en-US') + ' 词';
    }
    if (currentView === 'visual' && visualSection === 'corpus') renderVisualSection();
  }

  function failCorpusCatalog(error) {
    corpusCatalog = null;
    corpusLoadState = 'error';
    corpusLoadError = error && error.message ? error.message : '网络请求失败';
    if (currentView === 'visual' && visualSection === 'corpus') renderVisualSection();
  }

  function filteredCorpusEntries() {
    if (!corpusCatalog || !Array.isArray(corpusCatalog.entries)) return [];
    var query = normaliseAnswer(corpusQuery);
    return corpusCatalog.entries.filter(function (entry) {
      if (!entry || entry.status !== 'active') return false;
      if (query && String(entry._searchText || '').indexOf(query) < 0) {
        return false;
      }
      if (corpusFilters.skill !== 'all' && entry.primary_skill !== corpusFilters.skill) {
        return false;
      }
      if (corpusFilters.pos !== 'all') {
        var pos = Array.isArray(entry.pos) ? entry.pos : [];
        if (
          corpusFilters.pos === 'phrase' ? !entry.is_phrase : pos.indexOf(corpusFilters.pos) < 0
        ) {
          return false;
        }
      }
      if (corpusFilters.cefr !== 'all') {
        var levels = Array.isArray(entry.cefr) ? entry.cefr : [];
        if (
          corpusFilters.cefr === 'unknown'
            ? levels.length > 0
            : levels.indexOf(corpusFilters.cefr) < 0
        ) {
          return false;
        }
      }
      var imageEligible = entry.image_mode && entry.image_mode !== 'none';
      if (corpusFilters.image === 'eligible' && !imageEligible) return false;
      if (
        corpusFilters.image === 'review' &&
        entry.image_prompt_status !== 'needs_teacher_approved_sense'
      ) {
        return false;
      }
      if (corpusFilters.image === 'none' && imageEligible) return false;
      return true;
    });
  }

  function renderCorpusResults(resetVisible) {
    var mount = document.querySelector('[data-corpus-results]');
    if (!mount) return;
    if (resetVisible) corpusVisible = 60;
    var matches = filteredCorpusEntries();
    var shown = matches.slice(0, corpusVisible);
    var count = document.querySelector('[data-corpus-match-count]');
    if (count) count.textContent = matches.length.toLocaleString('en-US');
    if (!matches.length) {
      mount.innerHTML =
        '<div class="empty-state corpus-empty">没有符合当前条件的词。可以清空搜索词或放宽筛选条件。</div>';
      return;
    }
    mount.innerHTML =
      '<div class="corpus-result-summary"><span>当前显示 ' +
      shown.length.toLocaleString('en-US') +
      ' / ' +
      matches.length.toLocaleString('en-US') +
      '</span><small>来源释义与例句不会在此公开复制</small></div>' +
      '<div class="corpus-list">' +
      shown.map(renderCorpusEntry).join('') +
      '</div>' +
      (shown.length < matches.length
        ? '<button class="secondary-button corpus-more" type="button" data-action="corpus-more">再显示 ' +
          Math.min(60, matches.length - shown.length) +
          ' 个</button>'
        : '');
  }

  function renderCorpusEntry(entry) {
    var pos = Array.isArray(entry.pos) ? entry.pos : [];
    var cefr = Array.isArray(entry.cefr) ? entry.cefr : [];
    var topic = Array.isArray(entry.topics) && entry.topics.length ? entry.topics[0] : '主题待整理';
    var imageEligible = entry.image_mode && entry.image_mode !== 'none';
    var review = entry.proper_noun_sense_removed
      ? '<span class="corpus-flag">专名义项已隔离</span>'
      : '';
    return (
      '<article class="corpus-entry">' +
      '<div class="corpus-entry-word"><strong>' +
      esc(entry.headword) +
      '</strong><span>' +
      esc(topic) +
      '</span></div>' +
      '<div class="corpus-entry-tags">' +
      '<span class="corpus-skill skill-' +
      esc(entry.primary_skill) +
      '">' +
      esc(corpusSkillLabel(entry.primary_skill)) +
      '</span>' +
      pos
        .slice(0, 3)
        .map(function (label) {
          return '<span>' + esc(label) + '</span>';
        })
        .join('') +
      (cefr.length ? '<span>' + esc(cefr.join(' / ')) + '</span>' : '<span>CEFR 待标注</span>') +
      '<span>' +
      Number(entry.source_count || 0) +
      ' 个来源</span>' +
      '<span class="' +
      (imageEligible ? 'image-ready' : 'image-none') +
      '">' +
      (imageEligible ? '待确认词义后做图' : '暂不进入图片队列') +
      '</span>' +
      review +
      '</div></article>'
    );
  }

  function corpusSkillLabel(skill) {
    return (
      {
        listening: '听力',
        speaking: '口语',
        reading: '阅读',
        writing: '写作',
      }[skill] || '待分类'
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

  function replaceVisualFamilyCard(task) {
    var card = document.querySelector('[data-visual-task-id="' + task.id + '"]');
    if (!card) return;
    card.outerHTML = renderVisualFamilyCard(task);
    var nextCard = document.querySelector('[data-visual-task-id="' + task.id + '"]');
    if (!nextCard) return;
    var input = nextCard.querySelector('[data-visual-family-control][name="answer"]');
    focusElement(
      input ||
        nextCard.querySelector('[data-action="visual-retry"]') ||
        nextCard.querySelector('h3, h4'),
    );
  }

  function replaceVisualComparisonCard(task) {
    var card = document.querySelector('[data-visual-task-id="' + task.id + '"]');
    if (!card) return;
    card.outerHTML = renderVisualComparisonCard(task);
    var nextCard = document.querySelector('[data-visual-task-id="' + task.id + '"]');
    if (nextCard) {
      var firstChoice = nextCard.querySelector('[data-action="visual-choice"]');
      focusElement(
        firstChoice ||
          nextCard.querySelector('[data-action="visual-retry"]') ||
          nextCard.querySelector('h3, h4'),
      );
    }
  }

  function focusElement(element) {
    if (!element) return;
    if (!element.matches('button, input, textarea, select, a[href], [tabindex]')) {
      element.setAttribute('tabindex', '-1');
    }
    element.focus({ preventScroll: true });
  }

  function focusVisualSectionTask() {
    var container = document.getElementById('visualContent');
    if (!container) return;
    focusElement(
      container.querySelector(
        '[data-action="visual-pos-token"]:not(:disabled), [data-visual-family-control]:not(:disabled), [data-action="visual-choice"]:not(:disabled), [data-action="visual-retry"], h2, h3, h4',
      ),
    );
  }

  function focusVisualGameStage(answered) {
    var stage = document.querySelector('.visual-game-stage, .visual-game-finish');
    if (!stage) return;
    focusElement(
      (answered && stage.querySelector('[data-action="visual-game-next"]')) ||
        stage.querySelector('[data-action="visual-game-choice"]:not(:disabled)') ||
        stage.querySelector('button:not(:disabled)') ||
        stage.querySelector('h3'),
    );
  }

  function focusCurrentSessionTask() {
    var panel = main.querySelector('.training-panel, .rescue-training-panel');
    focusElement(
      (panel &&
        (panel.querySelector(
          'input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
        ) ||
          panel.querySelector('[data-collocation-recall] summary') ||
          panel.querySelector('button:not(:disabled)') ||
          panel.querySelector('h2, h3'))) ||
        main.querySelector('.session-complete h1, .session-complete h2, .page-heading h1'),
    );
  }

  function pushSessionHistoryState() {
    if (!history.pushState || (history.state && history.state.wordlabSession)) return;
    history.pushState(
      Object.assign({}, history.state || {}, {
        wordlabView: (history.state && history.state.wordlabView) || currentView || 'today',
        wordlabSession: true,
      }),
      '',
      location.href,
    );
  }

  function startDailySession() {
    var plans = buildDailyPlan();
    if (!plans.length) {
      showToast('今天没有到期任务，可以选择一个专项继续练习。');
      return;
    }
    pushSessionHistoryState();
    session = {
      type: 'daily',
      plans: plans,
      words: plans.map(function (plan) {
        return plan.word;
      }),
      wordIndex: 0,
      stageIndex: 0,
      stages: [],
      stats: {},
      taskState: {},
      token: Date.now(),
      relearnKeys: dailyPlanRelearnKeys(plans),
    };
    skipLockedUntil = 0;
    reorderRemainingSession();
    renderSession();
    scrollToTop();
  }

  function findRescueWord(wordId) {
    return (
      RESCUE_WORDS.find(function (word) {
        return word.id === wordId;
      }) || null
    );
  }

  function readyRescueRelearnTasks(now) {
    return readyRelearnEntries(now || Date.now())
      .filter(function (entry) {
        return isRescueGate(entry.skill) && Boolean(findRescueWord(entry.wordId));
      })
      .slice(0, RELEARN_MAX_PER_SESSION)
      .map(function (entry) {
        return {
          wordId: entry.wordId,
          gate: entry.skill,
          variant: Math.max(0, Number(entry.variant) || 0),
          attemptCycle: 1,
          relearnKey: entry.key,
        };
      });
  }

  function startRescueSession() {
    ensureDailyClock();
    var availableSeconds = Math.max(
      0,
      DAILY_MAX_SECONDS - Number(state.daily.practicedSeconds || 0),
    );
    if (!availableSeconds) {
      showToast('今天已完成 12 分钟有效训练，明天再继续。');
      return;
    }
    var rescue = getRescueState();
    var roundOne = rescueRoundTasks(1);
    var roundTwo = rescueRoundTasks(2);
    var round = roundOne.length ? 1 : 2;
    var ordinary = round === 1 ? roundOne : roundTwo;
    var outstandingBeforeDelay = ordinary.length;
    var ready = readyRescueRelearnTasks(Date.now());
    var readyKeys = new Set(
      ready.map(function (task) {
        return rescueStateKey(task.wordId, task.gate);
      }),
    );
    var allPendingKeys = new Set(
      getRelearnState()
        .queue.filter(function (entry) {
          return isRescueGate(entry.skill);
        })
        .map(function (entry) {
          return rescueStateKey(entry.wordId, entry.skill);
        }),
    );
    ordinary = ordinary.filter(function (task) {
      return (
        !readyKeys.has(rescueStateKey(task.wordId, task.gate)) &&
        !allPendingKeys.has(rescueStateKey(task.wordId, task.gate))
      );
    });
    var tasks = [];
    var plannedSeconds = 0;
    ready.concat(ordinary).some(function (task) {
      var seconds = Number(RESCUE_GATE_SECONDS[task.gate] || 40);
      if (plannedSeconds + seconds > availableSeconds) return false;
      tasks.push(task);
      plannedSeconds += seconds;
      return tasks.length >= 18;
    });
    if (!tasks.length) {
      showToast(
        outstandingBeforeDelay && !ordinary.length && !ready.length
          ? '这些错项还在间隔中；先完成其他任务，稍后再练。'
          : outstandingBeforeDelay || ready.length
            ? '今天已完成 12 分钟有效训练，明天再继续。'
            : '声形急救两轮已完成。',
      );
      return;
    }
    rescue.round = round;
    rescue.taskIndex = 0;
    rescue.tasks = tasks;
    saveState();
    pushSessionHistoryState();
    session = {
      type: 'rescue',
      rescueRound: round,
      wordIndex: 0,
      stageIndex: 0,
      stats: {},
      taskState: {},
      token: Date.now(),
      relearnKeys: ready.map(function (task) {
        return task.relearnKey;
      }),
    };
    skipLockedUntil = 0;
    renderSession();
    scrollToTop();
  }

  function startRescueContextSession(wordId) {
    var word = findRescueWord(wordId);
    if (!word || word.senseStatus !== 'pending_context') return;
    ensureDailyClock();
    var rescue = getRescueState();
    rescue.round = Number(word.round) || 1;
    rescue.taskIndex = 0;
    rescue.tasks = [
      { wordId: word.id, gate: 'meaningRecall', variant: 0, attemptCycle: 0, relearnKey: '' },
    ];
    saveState();
    pushSessionHistoryState();
    session = {
      type: 'rescue',
      rescueRound: Number(word.round) || 1,
      wordIndex: 0,
      stageIndex: 0,
      stats: {},
      taskState: {},
      token: Date.now(),
      relearnKeys: [],
    };
    skipLockedUntil = 0;
    renderSession();
    scrollToTop();
  }

  function startRescueWordSession(wordId) {
    var word = findRescueWord(wordId);
    if (!word) return;
    ensureDailyClock();
    var availableSeconds = Math.max(
      0,
      DAILY_MAX_SECONDS - Number(state.daily.practicedSeconds || 0),
    );
    var pendingEntries = getRelearnState().queue.filter(function (entry) {
      return entry.wordId === word.id && isRescueGate(entry.skill);
    });
    var pendingGates = new Set(
      pendingEntries.map(function (entry) {
        return entry.skill;
      }),
    );
    var readyByGate = {};
    pendingEntries.forEach(function (entry) {
      if (isRelearnReady(entry, Date.now())) readyByGate[entry.skill] = entry;
    });
    var tasks = rescueGatesForWord(word)
      .filter(function (gate) {
        var gateState = peekRescueGateState(word.id, gate);
        if (gate === 'meaningRecall' && gateState && gateState.pendingContext) return true;
        if (readyByGate[gate]) return true;
        if (pendingGates.has(gate)) return false;
        return !rescueTaskComplete(word.id, gate);
      })
      .map(function (gate) {
        var readyEntry = readyByGate[gate];
        return {
          wordId: word.id,
          gate: gate,
          variant: readyEntry ? Math.max(0, Number(readyEntry.variant) || 0) : 0,
          attemptCycle: readyEntry ? 1 : 0,
          relearnKey: readyEntry ? readyEntry.key : '',
        };
      })
      .filter(function (task) {
        var seconds = Number(RESCUE_GATE_SECONDS[task.gate] || 40);
        if (seconds > availableSeconds) return false;
        availableSeconds -= seconds;
        return true;
      });
    if (!tasks.length) {
      var waiting = pendingEntries.some(function (entry) {
        return !isRelearnReady(entry, Date.now());
      });
      showToast(
        waiting
          ? '这个词的错项正在拉开间隔，稍后再练。'
          : availableSeconds <= 0
            ? '今天已完成 12 分钟有效训练，明天再继续。'
            : '这个词的现有受控关卡已完成，可在进度页查看记录。',
      );
      return;
    }
    var rescue = getRescueState();
    rescue.round = Number(word.round) || 1;
    rescue.taskIndex = 0;
    rescue.tasks = tasks;
    saveState();
    pushSessionHistoryState();
    session = {
      type: 'rescue',
      rescueRound: Number(word.round) || 1,
      wordIndex: 0,
      stageIndex: 0,
      stats: {},
      taskState: {},
      token: Date.now(),
      relearnKeys: tasks
        .map(function (task) {
          return task.relearnKey;
        })
        .filter(Boolean),
    };
    skipLockedUntil = 0;
    renderSession();
    scrollToTop();
  }

  function startWeakSession() {
    var selectedKeys = new Set();
    var repairItems = buildRepairQueue(10).filter(function (item) {
      var entry = findPendingRelearn(item.word.id, item.skill);
      if (!entry || !isRelearnReady(entry, Date.now())) return true;
      if (selectedKeys.size >= RELEARN_MAX_PER_SESSION) return false;
      item.word = relearnWord(entry);
      selectedKeys.add(entry.key);
      return Boolean(item.word);
    });
    if (!repairItems.length) {
      showToast('还没有足够的错题记录，先完成一轮今日训练。');
      startDailySession();
      return;
    }
    pushSessionHistoryState();
    session = {
      type: 'repair',
      words: repairItems.map(function (item) {
        return item.word;
      }),
      repairSkills: repairItems.map(function (item) {
        return item.skill;
      }),
      wordIndex: 0,
      stageIndex: 0,
      stages: [],
      stats: {},
      taskState: {},
      token: Date.now(),
      relearnKeys: Array.from(selectedKeys),
    };
    skipLockedUntil = 0;
    reorderRemainingSession();
    renderSession();
    scrollToTop();
  }

  function startSkillSession(skill, options) {
    currentView = skill;
    var queue = skill === 'forms' ? buildFormsQueue(12) : buildSkillQueue(skill, 10);
    var selectedKeys = new Set();
    var relearnWords = [];
    var ordinaryWords = [];
    queue.forEach(function (word) {
      var entry = findPendingRelearn(word.id, skill);
      if (!entry) {
        ordinaryWords.push(word);
        return;
      }
      if (!isRelearnReady(entry, Date.now())) return;
      if (selectedKeys.size >= RELEARN_MAX_PER_SESSION) return;
      var preparedWord = relearnWord(entry);
      if (!preparedWord) return;
      relearnWords.push(preparedWord);
      selectedKeys.add(entry.key);
    });
    queue = relearnWords.concat(ordinaryWords);
    if (!(options && options.historyReady)) pushSessionHistoryState();
    session = {
      type: 'skill',
      words: queue,
      wordIndex: 0,
      stageIndex: 0,
      stages: [skill],
      stats: {},
      taskState: {},
      token: Date.now(),
      relearnKeys: Array.from(selectedKeys),
    };
    skipLockedUntil = 0;
    renderSession();
    scrollToTop();
  }

  function renderSession() {
    if (session && session.type === 'rescue') {
      renderRescueSession();
      return;
    }
    if (!session || session.wordIndex >= session.words.length) {
      renderSessionComplete();
      return;
    }
    cleanupMedia();

    var word = currentWord();
    var skill = currentSkill();
    var relearnAttempt = Boolean(currentRelearnKey());
    initialiseTaskActivity(skill);
    var currentTaskNumber = session.type === 'daily' ? dailyTaskNumber() : session.wordIndex + 1;
    var totalTasks = session.type === 'daily' ? dailyTaskTotal() : session.words.length;

    setActiveNav(session.type === 'daily' ? 'today' : 'practice');
    currentView = skill;
    main.innerHTML =
      renderQueuePanel() +
      '<section class="training-shell streamlined-training-shell">' +
      '<article class="panel training-panel" data-word-id="' +
      esc(word.id) +
      '" data-adaptive-priority="' +
      Math.round(adaptivePriority(word.id, skill, Date.now())) +
      '" data-adaptive-reason="' +
      esc(adaptiveReason(word.id, skill, Date.now())) +
      '" data-relearn-attempt="' +
      (relearnAttempt ? 'true' : 'false') +
      '" data-session-estimated-seconds="' +
      (session.type === 'daily' ? dailyPlanSeconds(session.plans) : 0) +
      '">' +
      renderTask(word, skill, currentTaskNumber, totalTasks) +
      '</article>' +
      '</section>';
    syncRenderedSkipControls();

    if (skill === 'forms' && !session.taskState.completed) {
      var formExercise = getFormExercise(word);
      if (formExercise.type !== 'context' || session.taskState.posPassed) {
        focusCurrentFormInput(formExercise, session.taskState);
      }
    }
  }

  function currentRescueTask() {
    if (!session || session.type !== 'rescue') return null;
    return getRescueState().tasks[session.wordIndex] || null;
  }

  function rescueVariant(task) {
    return Math.max(0, Math.min(2, Number(task && task.variant) || 0));
  }

  function renderRescueSession() {
    var rescue = getRescueState();
    var task = currentRescueTask();
    if (!task || session.wordIndex >= rescue.tasks.length) {
      renderSessionComplete();
      return;
    }
    cleanupMedia();
    var word = findRescueWord(task.wordId);
    if (!word || !isRescueGate(task.gate)) {
      session.wordIndex += 1;
      rescue.taskIndex = session.wordIndex;
      saveState();
      renderRescueSession();
      return;
    }
    var taskSeconds = Number(RESCUE_GATE_SECONDS[task.gate] || 40);
    var remainingBudget = Math.max(
      0,
      DAILY_MAX_SECONDS - Number(state.daily.practicedSeconds || 0),
    );
    if (remainingBudget < taskSeconds) {
      showToast('今天的 12 分钟有效训练预算已经用完。');
      renderSessionComplete();
      return;
    }
    session.taskState.rescueVariant = rescueVariant(task);
    initialiseTaskActivity(task.gate);
    setActiveNav('today');
    currentView = 'rescue';
    var total = rescue.tasks.length;
    main.innerHTML =
      '<nav class="panel queue-panel compact-queue-panel" aria-label="声形急救进度"><div class="queue-progress"><span>第 ' +
      (session.wordIndex + 1) +
      ' / ' +
      total +
      ' 题 · ' +
      esc(RESCUE_GATE_LABELS[task.gate]) +
      '</span><button class="quiet-button" type="button" data-action="leave-session">退出</button></div></nav>' +
      '<section class="training-shell rescue-training-shell"><article class="panel rescue-training-panel">' +
      renderRescueTask(word, task) +
      '</article></section>';
    syncRenderedSkipControls();
    var field = main.querySelector('input:not(:disabled)');
    if (field) field.focus({ preventScroll: true });
  }

  function renderRescueTask(word, task) {
    var attemptCycle = Number(task.attemptCycle) === 1 ? 1 : 0;
    var attrs =
      ' data-rescue-task data-gate="' +
      esc(task.gate) +
      '" data-variant="' +
      rescueVariant(task) +
      '" data-attempt-cycle="' +
      attemptCycle +
      '"';
    var kicker =
      '<div class="training-kicker"><span class="skill-badge">' +
      esc(RESCUE_GATE_LABELS[task.gate]) +
      '</span>' +
      (attemptCycle ? '<span class="topic-badge">延迟重测 · 无提示</span>' : '') +
      '</div>';
    if (task.gate === 'listenForm')
      return '<div' + attrs + '>' + kicker + renderRescueListenForm(task) + '</div>';
    if (task.gate === 'readDecode')
      return '<div' + attrs + '>' + kicker + renderRescueReadDecode(word, task) + '</div>';
    return '<div' + attrs + '>' + kicker + renderRescueMeaning(word, task) + '</div>';
  }

  function rescuePrimaryAction(label, disabled) {
    return (
      '<button class="primary-button" type="submit" data-rescue-primary-action' +
      (disabled ? ' disabled' : '') +
      '>' +
      esc(label) +
      '</button>'
    );
  }

  function rescueSkipButton() {
    return '<button class="quiet-button rescue-skip-button" type="button" data-action="rescue-skip" data-rescue-skip aria-label="先跳过，稍后重练">先跳过</button>';
  }

  function renderRescueListenForm(task) {
    var preferredAccent = state.settings.accent === 'us' ? 'us' : 'uk';
    var accent =
      rescueVariant(task) % 2 ? (preferredAccent === 'us' ? 'uk' : 'us') : preferredAccent;
    var unlocked = Boolean(session.taskState.rescueAudioReady);
    var failed = Boolean(session.taskState.rescueAudioFailed);
    return (
      '<div class="rescue-stage rescue-listen-stage"><p class="question-lead">听到后，写出完整单词。</p>' +
      '<button class="listen-orb rescue-listen-orb" type="button" data-action="rescue-play" data-rescue-play data-accent="' +
      accent +
      '" data-audio-label="盲听音频" data-status-target="rescueListenStatus" aria-label="播放盲听音频" aria-describedby="rescueListenStatus"><span class="audio-control-icon" aria-hidden="true">▶</span></button>' +
      '<p class="listen-status" id="rescueListenStatus" aria-live="polite">播放后才能作答；可暂停或继续。</p>' +
      '<form class="answer-form rescue-answer-form" data-rescue-form' +
      (failed ? ' aria-disabled="true"' : '') +
      '><label class="eyebrow" for="rescueListenInput">TYPE WHAT YOU HEAR</label><input class="answer-input" id="rescueListenInput" name="answer" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="在这里拼写"' +
      ' data-rescue-answer-controls' +
      (unlocked && !failed ? '' : ' disabled') +
      '><div class="rescue-actions">' +
      rescuePrimaryAction('检查', !unlocked || failed) +
      rescueSkipButton() +
      '</div></form><p class="feedback" data-rescue-feedback aria-live="polite"></p></div>'
    );
  }

  function renderRescueReadDecode(word, task) {
    var taskState = session.taskState;
    var completed = Boolean(taskState.rescueAnswered);
    var decode = word.decodeTask || {
      prompt: '选择主重音所在的拼读块。',
      choices: word.blocks,
      answerIndex: word.stress,
    };
    var decodeChoices = rotatedRescueChoices(decode.choices, rescueVariant(task));
    return (
      '<div class="rescue-stage"><p class="question-lead">先自己读，再完成字音辨识。</p><h2 class="rescue-target-word">' +
      esc(word.word) +
      '</h2><p class="rescue-context">' +
      esc(decode.prompt) +
      '</p><form data-rescue-form><div class="rescue-block-options" data-rescue-answer-controls role="group" aria-label="字音辨识选项">' +
      decodeChoices
        .map(function (choice) {
          return (
            '<label><input type="radio" name="answer" value="' +
            choice.index +
            '"' +
            (completed ? ' disabled' : '') +
            '><span>' +
            esc(String(choice.label)) +
            '</span></label>'
          );
        })
        .join('') +
      '</div><div class="rescue-actions">' +
      rescuePrimaryAction('检查字音', completed) +
      (completed
        ? '<button class="primary-button" type="button" data-action="rescue-next" data-rescue-primary-action>下一题</button>'
        : rescueSkipButton()) +
      '</div></form><p class="feedback" data-rescue-feedback aria-live="polite">' +
      esc(taskState.rescueFeedback || '') +
      '</p>' +
      (completed ? renderRescueReveal(word) : '') +
      '</div>'
    );
  }

  function renderRescueMeaning(word) {
    var taskState = session.taskState;
    var completed = Boolean(taskState.rescueAnswered);
    var pending =
      word.senseStatus === 'pending_context' || word.meaningTask.masteryEligible === false;
    var meaningChoices = rotatedRescueChoices(
      word.meaningTask.choices,
      rescueVariant(currentRescueTask()),
    );
    return (
      '<div class="rescue-stage"><p class="question-lead">根据语境选择最贴切的意思。</p><h2 class="rescue-target-word">' +
      esc(word.word) +
      '</h2><p class="rescue-context">' +
      esc(word.meaningTask.prompt) +
      '</p><form data-rescue-form><div class="rescue-meaning-options" data-rescue-answer-controls role="group" aria-label="词义选项">' +
      meaningChoices
        .map(function (choice) {
          return (
            '<label><input type="radio" name="answer" value="' +
            choice.index +
            '"' +
            (completed ? ' disabled' : '') +
            '><span>' +
            esc(choice.label) +
            '</span></label>'
          );
        })
        .join('') +
      '</div>' +
      (pending
        ? '<p class="rescue-pending-note">本题只收集原句线索，不计掌握。</p><label class="rescue-context-note"><span>如果找得到原句，可补录在这里（可留空）</span><textarea name="contextNote" rows="3" maxlength="500" placeholder="粘贴原句或描述当时语境">' +
          esc(getRescueState().contextNotes[word.id] || '') +
          '</textarea></label>'
        : '') +
      '<div class="rescue-actions">' +
      rescuePrimaryAction(pending ? '保存线索' : '检查词义', completed) +
      (completed
        ? '<button class="primary-button" type="button" data-action="rescue-next" data-rescue-primary-action>下一题</button>'
        : rescueSkipButton()) +
      '</div></form><p class="feedback" data-rescue-feedback aria-live="polite">' +
      esc(taskState.rescueFeedback || '') +
      '</p>' +
      (completed && !pending ? renderRescueReveal(word) : '') +
      '</div>'
    );
  }

  function rotatedRescueChoices(choices, variant) {
    var indexed = (choices || []).map(function (label, index) {
      return { label: label, index: index };
    });
    if (indexed.length < 2) return indexed;
    var offset = Math.max(0, Number(variant) || 0) % indexed.length;
    return indexed.slice(offset).concat(indexed.slice(0, offset));
  }

  function renderRescueReveal(word) {
    var accent = state.settings.accent === 'us' ? 'us' : 'uk';
    var ipa = accent === 'us' ? word.ipaUs : word.ipaUk;
    return (
      '<aside class="rescue-reveal"><strong>' +
      esc(word.word) +
      '</strong><span>' +
      esc(ipa) +
      ' · ' +
      esc(word.pos) +
      ' · ' +
      esc(word.zh) +
      '</span><small>' +
      esc(word.collocation) +
      '</small><button class="audio-button secondary-audio" type="button" data-action="rescue-play-reveal" data-accent="' +
      accent +
      '" data-audio-label="核对读音"><span class="audio-control-icon" aria-hidden="true">▶</span><span class="audio-control-label">核对读音</span></button></aside>'
    );
  }

  function monotonicNow() {
    return window.performance && typeof window.performance.now === 'function'
      ? window.performance.now()
      : Date.now();
  }

  function initialiseTaskActivity(skill) {
    if (!session || session.taskState.activityInitialised) return;
    var task = session.taskState;
    task.activityInitialised = true;
    task.activeElapsedMs = 0;
    task.activityStarted = skill === 'forms' || skill === 'sentence';
    task.activeSince = task.activityStarted && !document.hidden ? monotonicNow() : 0;
  }

  function startTaskActivity() {
    if (!session) return;
    var task = session.taskState;
    if (!task.activityInitialised) initialiseTaskActivity(currentSkill());
    if (!task.activityStarted) task.activityStarted = true;
    if (!document.hidden && !task.activeSince) task.activeSince = monotonicNow();
  }

  function pauseTaskActivity() {
    if (!session || !session.taskState.activeSince) return;
    var task = session.taskState;
    task.activeElapsedMs =
      Math.max(0, Number(task.activeElapsedMs || 0)) +
      Math.max(0, monotonicNow() - Number(task.activeSince));
    task.activeSince = 0;
  }

  function syncTaskActivityVisibility() {
    if (!session || !session.taskState.activityStarted) return;
    if (document.hidden) {
      pauseTaskActivity();
    } else if (!session.taskState.activeSince) {
      session.taskState.activeSince = monotonicNow();
    }
  }

  function currentTaskResponseMs() {
    if (!session || !session.taskState.activityStarted) return 0;
    var task = session.taskState;
    var active = Math.max(0, Number(task.activeElapsedMs || 0));
    if (task.activeSince && !document.hidden) {
      active += Math.max(0, monotonicNow() - Number(task.activeSince));
    }
    return active;
  }

  function renderTask(word, skill, currentTaskNumber, totalTasks) {
    var relearnLabel = currentRelearnKey()
      ? '<span class="topic-badge">延迟重测 · 提示已重置</span>'
      : '';
    var badge =
      '<div class="training-kicker"><span class="skill-badge">' +
      SKILL_LABELS[skill] +
      '</span>' +
      relearnLabel +
      '<span class="training-count">' +
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
          SKILL_CHAIN_LABELS[currentSkill()]
        : '第 ' + wordPosition + ' / ' + session.words.length + ' 题';
    return (
      '<nav class="panel queue-panel compact-queue-panel" aria-label="本轮进度">' +
      renderLearningStageTrack() +
      '<div class="queue-progress"><span>' +
      esc(stageText) +
      '</span><button class="quiet-button" type="button" data-action="leave-session">退出</button></div>' +
      '</nav>'
    );
  }

  function renderLearningStageTrack() {
    if (!session || session.type !== 'daily') return '';
    var stages = currentStages();
    return (
      '<ol class="learning-stage-track" aria-label="本词学习步骤">' +
      stages
        .map(function (stage, index) {
          var skill = stage.skill;
          var className =
            index < session.stageIndex
              ? 'is-done'
              : index === session.stageIndex
                ? 'is-current'
                : '';
          return (
            '<li class="' +
            className +
            '" data-skill="' +
            esc(skill) +
            '" data-role="' +
            esc(stage.role || 'practice') +
            '"><span>' +
            String(index + 1).padStart(2, '0') +
            '</span><strong>' +
            esc(SKILL_CHAIN_LABELS[skill] || SKILL_LABELS[skill]) +
            '</strong></li>'
          );
        })
        .join('') +
      '</ol>'
    );
  }

  function renderSoundTask(word) {
    if (!session.taskState.soundObserved) {
      return renderSoundPrecheck(word);
    }
    var displayedAccent = state.settings.accent === 'us' ? 'us' : 'uk';
    var alternateAccent = displayedAccent === 'us' ? 'uk' : 'us';
    var sourceBadge = word.sourceError
      ? '<span class="source-badge">原输入误拼：' +
        esc(word.sourceError) +
        '；正确拼写见上方</span>'
      : word.source && normaliseAnswer(word.source) !== normaliseAnswer(word.word)
        ? '<span class="source-badge">原输入形式：' + esc(word.source) + '</span>'
        : '';
    return (
      '<div class="word-stage">' +
      '<h2>' +
      esc(word.word) +
      '</h2>' +
      '<div class="word-meta"><span class="ipa" data-ipa-display>' +
      esc(accentLabel(displayedAccent) + ' ' + wordIpa(word, displayedAccent)) +
      '</span>' +
      '</div>' +
      '<p class="syllable-line">' +
      syllableHtml(word) +
      '</p>' +
      '<div class="audio-row primary-sound-row">' +
      audioButton(
        displayedAccent,
        word.id,
        1,
        displayedAccent === 'us' ? '单词 · 美' : '单词 · 英',
      ) +
      '</div>' +
      renderSoundDiagnostic(word) +
      '<details class="sound-more"><summary>更多练习</summary><div class="audio-row">' +
      audioButton(
        alternateAccent,
        word.id,
        1,
        alternateAccent === 'us' ? '单词 · 美' : '单词 · 英',
        true,
      ) +
      exampleAudioButton(displayedAccent, word.id, '例句 · 主口音') +
      '</div><div class="record-box compact-record-box">' +
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
      '</span>' +
      sourceBadge +
      '</div>' +
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
      '</div></details>' +
      '<div class="card-actions">' +
      '<button class="secondary-button" type="button" data-action="mark-sound" data-correct="false">仍听不清，再排期</button>' +
      '<button class="primary-button" type="button" data-action="mark-sound" data-correct="true">完成声音对照 →</button>' +
      '</div>' +
      '</div>'
    );
  }

  function renderSoundPrecheck(word) {
    var accent = state.settings.accent === 'us' ? 'us' : 'uk';
    var accentLabel = accent === 'us' ? '先听 · 美音' : '先听 · 英音';
    var buttons = [1, 2, 3, 4, 5]
      .map(function (count) {
        return (
          '<button type="button" data-action="sound-syllables" data-value="' +
          count +
          '"' +
          (session.taskState.soundPlayed ? '' : ' disabled') +
          '>' +
          count +
          ' 个</button>'
        );
      })
      .join('');
    return (
      '<div class="word-stage sound-precheck" data-sound-precheck>' +
      '<h2 id="soundSyllablePrompt">听音，选音节数</h2>' +
      '<div class="audio-row">' +
      audioButton(accent, word.id, 1, accentLabel) +
      '</div>' +
      '<p class="sound-precheck-status" id="soundPrecheckStatus" aria-live="polite">' +
      (session.taskState.soundPlayed ? '现在选择音节数。' : '播放后即可作答。') +
      '</p>' +
      '<div class="sound-syllable-options" role="group" aria-labelledby="soundSyllablePrompt">' +
      buttons +
      '</div>' +
      '<button class="quiet-button sound-precheck-skip" type="button" data-action="sound-precheck-skip">听不出来，先看拼写</button>' +
      '</div>'
    );
  }

  function renderSoundDiagnostic(word) {
    var task = session.taskState;
    var count = word.syllables.length;
    if (task.soundDiagnosticSkipped) {
      return (
        '<div class="sound-diagnostic is-review"><strong>稍后再练</strong>' +
        '<span>先对照 ' +
        count +
        ' 个音节和重音位置跟读。</span></div>'
      );
    }
    if (task.soundDiagnosticCorrect) {
      return '<div class="sound-diagnostic"><strong>判断正确</strong><span>再听一遍，跟着重音读。</span></div>';
    }
    return (
      '<div class="sound-diagnostic is-review"><strong>再留意重音</strong><span>实际是 ' +
      count +
      ' 个音节。</span></div>'
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
    var meaningTask = integratedMeaningTask(word);
    if (meaningTask && !stateForTask.meaningResolved) {
      return renderIntegratedMeaningTask(word, meaningTask);
    }
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

  function integratedMeaningTask(word) {
    var mode = visualGameModes().find(function (candidate) {
      return candidate && candidate.id === 'guess';
    });
    if (!mode || !Array.isArray(mode.tasks)) return null;
    return (
      mode.tasks.find(function (task) {
        return (
          task &&
          task.targetWordId === word.id &&
          task.image &&
          Array.isArray(task.meaningChoices) &&
          task.meaningChoices.indexOf(task.meaningAnswer) >= 0
        );
      }) || null
    );
  }

  function renderIntegratedMeaningTask(word, task) {
    var attempts = Math.max(0, Number(session.taskState.meaningAttempts) || 0);
    var focusClass = task.focus === 'left' || task.focus === 'right' ? ' focus-' + task.focus : '';
    return (
      '<div class="word-stage integrated-meaning-stage" data-integrated-meaning="' +
      esc(task.id) +
      '" data-visual-task-id="' +
      esc(task.id) +
      '" aria-busy="false">' +
      '<p class="eyebrow">IMAGE → MEANING</p>' +
      '<h2>看图，选出最贴切的意思</h2>' +
      '<figure class="integrated-meaning-figure visual-image-frame' +
      focusClass +
      '"><img src="' +
      esc(task.image) +
      '" data-src="' +
      esc(task.image) +
      '" data-visual-image loading="eager" decoding="async' +
      '" width="' +
      Number(task.width || 1200) +
      '" height="' +
      Number(task.height || 800) +
      '" alt="' +
      esc(task.alt || '') +
      '"><div class="visual-image-error" data-image-error hidden role="status">图片暂时没有载入。<button type="button" data-action="visual-retry-image">重新加载图片</button></div></figure>' +
      '<p class="integrated-meaning-prompt">' +
      esc(task.prompt) +
      '</p>' +
      '<div class="integrated-meaning-choices" role="group" aria-label="词义选项">' +
      task.meaningChoices
        .map(function (choice) {
          return (
            '<button type="button" data-action="integrated-meaning-choice" data-choice="' +
            esc(choice) +
            '">' +
            esc(choice) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<p class="feedback" id="integratedMeaningFeedback" aria-live="polite">' +
      (attempts ? '再看画面和语境；答案仍然隐藏。' : '') +
      '</p>' +
      '<button class="quiet-button" type="button" data-action="integrated-meaning-skip">先跳过</button>' +
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
    var requiredPos = normaliseRequiredPos(exercise.need);
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
            className += pos === requiredPos ? ' is-selected' : ' is-wrong';
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
    var atlas = (Array.isArray(VISUAL_LAB.familyAtlases) ? VISUAL_LAB.familyAtlases : []).find(
      function (candidate) {
        return candidate && candidate.targetWordId === word.id;
      },
    );
    var storyReview = atlas
      ? '<figure class="form-family-atlas"><div class="visual-image-frame"><img src="' +
        esc(atlas.image) +
        '" alt="' +
        esc(atlas.alt) +
        '" width="' +
        Number(atlas.width || 1200) +
        '" height="' +
        Number(atlas.height || 800) +
        '" loading="lazy" decoding="async"></div><figcaption>四格场景已解锁：读完故事后收起文字，只看图片复述。</figcaption></figure>' +
        renderVisualFamilyMemory(atlas)
      : '';
    return (
      '<div class="reveal-card form-family-review">' +
      '<strong>答对后复盘</strong><span>完整词族只在完成后出现。</span>' +
      '<div class="family-strip">' +
      familyHtml(word) +
      '</div>' +
      storyReview +
      (task.formExercise && task.formExercise.type === 'family'
        ? '<div class="card-actions"><button class="primary-button" type="button" data-action="advance-form">读完了，下一题 →</button></div>'
        : '') +
      '</div>'
    );
  }

  function getFormExercise(word) {
    var task = session.taskState;
    if (task.formExercise) return task.formExercise;
    var stage = currentStage();
    var forceContextTransfer =
      session.type === 'daily' && stage && stage.role === 'transfer' && stage.variant === 'context';
    var relearnVariant =
      (stage && stage.role === 'relearn' && stage.variant) || word.relearnVariant || '';
    if (word.formPractice && (word.isFoundation || (!forceContextTransfer && !relearnVariant))) {
      task.formExercise = word.formPractice;
      return task.formExercise;
    }

    var requestedMode = relearnVariant || word.practiceMode;
    if (forceContextTransfer) {
      requestedMode = 'context';
    } else if (!requestedMode && session.type === 'daily') {
      requestedMode = session.wordIndex % 2 === 1 ? 'direct' : 'context';
    }
    if (requestedMode === 'direct') {
      var directExercise = makeDirectFormExercise(word);
      if (directExercise) {
        task.formExercise = directExercise;
        return task.formExercise;
      }
    }

    if (!word.form) {
      task.formExercise = word.formPractice || {
        type: 'family',
        base: word.word,
        slots: [],
      };
      return task.formExercise;
    }

    task.formExercise = {
      type: 'context',
      sentence: word.form.sentence,
      answer: word.form.answer,
      answers: Array.isArray(word.form.answers) ? word.form.answers.slice() : [],
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
      (task.evaluated
        ? ''
        : '<div class="form-skip-row"><button class="secondary-button form-skip-button" type="button" data-action="skip-sentence" aria-label="先跳过表达任务，稍后复习">先跳过（稍后复习）</button></div>') +
      renderCollocationRecall(word) +
      '<section class="sentence-step">' +
      '<div class="sentence-step-header"><span class="step-number">2</span><div><h3>搭出正确句子骨架</h3><p>大小写和句末标点已隐藏；请只根据语法和语义排序。</p></div></div>' +
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
          ? '<span class="fine-print">标准骨架已遮住；请只看中文完成标准句复现。</span>'
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
            : '<button class="primary-button" type="button" data-action="start-sentence-writing">遮住骨架，开始复现</button>')
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

  function renderCollocationRecall(word) {
    return (
      '<section class="sentence-step collocation-recall">' +
      '<div class="sentence-step-header"><span class="step-number">1</span><div><h3>先从记忆中提取自然搭配</h3>' +
      '<p>不要先看答案。口头说出或写下一个包含目标词的自然词块，再打开核对。</p></div></div>' +
      '<details data-collocation-recall><summary>想好后，核对自然搭配</summary>' +
      '<div class="collocation-answer"><small>本词高频搭配</small><code lang="en">' +
      esc(word.collocation) +
      '</code><p>把整个词块连起来朗读两遍，然后带着它进入下一步。</p></div></details>' +
      '</section>'
    );
  }

  function renderSentenceWritingStep(word, task) {
    if (!task.chunksCorrect || !task.writingUnlocked) {
      var lockedTitle = task.chunksCorrect ? '遮住骨架后开始复现' : '完成排序后再复现';
      var lockedNote = task.chunksCorrect
        ? '先读一遍标准骨架，再点击“遮住骨架，开始复现”。'
        : '中文提示和复现检查项将在第二步完成后出现。';
      return (
        '<section class="sentence-step sentence-step-locked" aria-label="第三步尚未解锁">' +
        '<div class="sentence-step-header"><span class="step-number">3</span><div><h3>' +
        lockedTitle +
        '</h3><p>' +
        lockedNote +
        '</p></div></div>' +
        '</section>'
      );
    }
    return (
      '<section class="sentence-step">' +
      '<div class="sentence-step-header"><span class="step-number">3</span><div><h3>按中文复现标准句</h3><p>只有首次完整复现标准句才计自动证据；其他表达只保存为待人工评阅草稿。</p></div></div>' +
      '<p class="model-sentence">' +
      esc(word.exampleCn) +
      '</p>' +
      '<form data-skill-form="sentence">' +
      '<label class="eyebrow" for="sentenceInput">HIDDEN SENTENCE RECALL</label>' +
      '<textarea class="sentence-input" id="sentenceInput" name="sentence" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="不看英文，按中文写出刚才的标准句……"' +
      (task.chunksCorrect ? '' : ' disabled') +
      '>' +
      esc(task.writing || '') +
      '</textarea>' +
      '<div class="sentence-toolbar">' +
      '<button class="primary-button" type="submit"' +
      (task.chunksCorrect ? '' : ' disabled') +
      '>提交复现并对照</button>' +
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
      '<button class="secondary-button" type="button" data-action="finish-sentence" data-correct="false">保存草稿，待老师评阅</button>' +
      '<button class="primary-button" type="button" data-action="finish-sentence" data-correct="true">记录本次练习 →</button>' +
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
    var isRescueSession = session.type === 'rescue';
    if (isRescueSession) {
      var rescue = getRescueState();
      rescue.tasks = [];
      rescue.taskIndex = 0;
      saveState();
    }
    setActiveNav('today');
    main.innerHTML =
      '<section class="page-heading"><div><p class="eyebrow">SESSION COMPLETE</p><h1>本轮训练完成</h1><p>错项会先与其他任务拉开距离，再在预算允许时无提示重测；每项能力仍独立排期。</p></div></section>' +
      '<article class="panel training-panel">' +
      '<div class="word-stage"><span class="topic-badge">训练小结</span><h2 style="font-size:42px">准确比刷量更重要</h2>' +
      '<div class="metric-grid" style="max-width:680px;margin:26px auto">' +
      (isRescueSession ? Object.keys(RESCUE_GATE_SECONDS) : SKILLS)
        .map(function (skill) {
          var skillStats = stats[skill] || { attempts: 0, correct: 0, pending: 0 };
          if (!skillStats.attempts && skillStats.pending) {
            return metric(
              '待确认',
              (RESCUE_GATE_LABELS[skill] || SKILL_SHORT[skill]) + '（不计正误）',
            );
          }
          if (!skillStats.attempts) {
            return metric('—', (RESCUE_GATE_LABELS[skill] || SKILL_SHORT[skill]) + '（未安排）');
          }
          var score = skillStats.attempts
            ? Math.round((skillStats.correct / skillStats.attempts) * 100)
            : 0;
          return metric(score + '%', RESCUE_GATE_LABELS[skill] || SKILL_SHORT[skill]);
        })
        .join('') +
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
        return item.correct === false && Boolean(effectiveCoreMistakeSkill(item));
      })
      .slice(-18)
      .reverse();
    var rescueHistory = state.history
      .filter(function (item) {
        return item && isRescueGate(item.skill);
      })
      .slice(-18)
      .reverse();
    var pendingRescue = RESCUE_WORDS.filter(function (word) {
      var gateState = peekRescueGateState(word.id, 'meaningRecall');
      return Boolean(gateState && gateState.pendingContext);
    });
    var journal = state.journal.slice(-12).reverse();

    main.innerHTML =
      '<section class="page-heading"><div><p class="eyebrow">LOCAL PROGRESS</p><h1>错题与进度</h1><p>声音、拼写、词形和标准句复现分别记录；其他表达只保存为待人工评阅草稿。</p></div></section>' +
      '<section class="progress-layout">' +
      '<article class="panel progress-panel">' +
      '<h2>' +
      WORDS.length +
      ' 词能力表</h2>' +
      '<div class="metric-grid">' +
      metric(summary.started, '已开始') +
      metric(summary.stable, '四项受控任务达标且无待复习') +
      metric(summary.mistakes, '近期错项') +
      '</div>' +
      '<div class="word-table-wrap"><table class="word-table"><thead><tr><th>词汇</th><th>辨音</th><th>拼写</th><th>词形</th><th>句架复现</th><th>下次复习</th></tr></thead><tbody>' +
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
      '<article class="panel progress-panel" style="margin-top:18px"><h3>声形急救记录</h3>' +
      (pendingRescue.length
        ? '<p class="fine-print">待补原句：' +
          pendingRescue
            .map(function (word) {
              return esc(word.word);
            })
            .join('、') +
          '。这类记录不会被算作掌握。</p><div class="data-actions">' +
          pendingRescue
            .map(function (word) {
              return (
                '<button class="secondary-button" type="button" data-action="resume-rescue-context" data-word-id="' +
                esc(word.id) +
                '">补录 ' +
                esc(word.word) +
                ' 原句</button>'
              );
            })
            .join('') +
          '</div>'
        : '') +
      (rescueHistory.length
        ? '<ul class="mistake-list">' +
          rescueHistory
            .map(function (item) {
              var status = item.correct === null ? '待原句确认' : item.correct ? '正确' : '待重练';
              return (
                '<li><strong>' +
                esc(item.word) +
                ' · ' +
                esc(RESCUE_GATE_LABELS[item.skill]) +
                '</strong><span>' +
                esc(status + ' · ' + item.detail) +
                '</span></li>'
              );
            })
            .join('') +
          '</ul>'
        : '<div class="empty-state">完成一题声形急救后，独立关卡记录会出现在这里。</div>') +
      '</article>' +
      '<article class="panel progress-panel" style="margin-top:18px"><h3>表达草稿</h3>' +
      (journal.length
        ? '<ul class="journal-list">' +
          journal
            .map(function (item) {
              return (
                '<li><strong>' +
                esc(item.word) +
                ' · ' +
                esc(journalStatusLabel(item.status)) +
                '</strong><span>' +
                esc(item.text) +
                '</span></li>'
              );
            })
            .join('') +
          '</ul>'
        : '<div class="empty-state">句子工坊中的草稿会保存在本机。</div>') +
      '</article>' +
      '<article class="panel progress-panel" style="margin-top:18px"><h3>数据备份</h3><p class="fine-print">换设备或清理浏览器数据前，请先导出 JSON；文件可能包含本机造句草稿，请妥善保管。</p>' +
      '<div class="data-actions"><button class="secondary-button" type="button" data-action="export-data">导出进度</button><label class="import-label">导入进度<input type="file" accept="application/json" data-action="import-data"></label><button class="danger-button" type="button" data-action="reset-data">清空本机进度</button></div>' +
      '</article>' +
      '</div>' +
      '</section>';
  }

  function wordProgressRow(word) {
    var scores = SKILLS.map(function (skill) {
      var skillState = peekSkillState(word.id, skill);
      var visualPending = hasVisualRepair(word.id, skill);
      var score = skillState.attempts
        ? Math.round((skillState.correct / skillState.attempts) * 100)
        : null;
      var pendingOnly = !skillState.attempts && Number(skillState.pending || 0) > 0;
      var relearnRequired = !skillState.attempts && Boolean(skillState.relearnRequired);
      var className =
        score === null && !pendingOnly && !relearnRequired && !visualPending
          ? 'score-chip'
          : !skillState.needsReview && !visualPending && score !== null && score >= 80
            ? 'score-chip good'
            : 'score-chip weak';
      return (
        '<td><span class="' +
        className +
        '">' +
        (visualPending
          ? score === null
            ? '图义待练'
            : score + '% · 待修复'
          : pendingOnly
            ? '待评'
            : relearnRequired
              ? '需重练'
              : score === null
                ? '—'
                : score + '%') +
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

  function journalStatusLabel(status) {
    if (status === 'controlled_recall') return '标准句复现';
    if (status === 'corrected_practice') return '纠错练习';
    if (status === 'legacy_unverified') return '旧版未核实';
    return '待人工评阅';
  }

  function handleMainClick(event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.dataset.action;

    if (action === 'start-daily') return startDailySession();
    if (action === 'start-rescue') return startRescueSession();
    if (action === 'start-rescue-word') return startRescueWordSession(button.dataset.wordId);
    if (action === 'resume-rescue-context') return startRescueContextSession(button.dataset.wordId);
    if (action === 'start-weak') return startWeakSession();
    if (action === 'start-skill') return startSkillSession(button.dataset.skill);
    if (action === 'go-view') return navigate(button.dataset.view);
    if (action === 'go-today') return leaveSessionToToday();
    if (action === 'go-progress') return navigate('progress');
    if (action === 'leave-session') return leaveSessionToToday();
    if (action === 'visual-section') return changeVisualSection(button.dataset.section);
    if (action === 'visual-pos-token') return chooseVisualPosToken(button);
    if (action === 'visual-family-skip') return skipVisualFamily(button);
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
    if (action === 'corpus-retry') return loadCorpusCatalog(true);
    if (action === 'hard-words-retry') return loadHardWordsCatalog(true);
    if (action === 'hard-word-spell') {
      return startHardWordPractice('spell', [button.dataset.wordId]);
    }
    if (action === 'hard-word-sentence') {
      return startHardWordPractice('sentence', [button.dataset.wordId]);
    }
    if (action === 'hard-words-start-spell') return startHardWordsBatch('spell');
    if (action === 'hard-words-start-sentence') return startHardWordsBatch('sentence');
    if (action === 'hard-word-hide') return hideHardWordForRecall();
    if (action === 'hard-word-show-again') return showHardWordAgain();
    if (action === 'hard-word-retry') return retryHardWordSpelling();
    if (action === 'hard-word-skip') return skipHardWordPractice();
    if (action === 'hard-word-next') return nextHardWordPractice();
    if (action === 'hard-word-exit') return navigate('hard-words');
    if (action === 'start-sound-form-practice') {
      var directWordId = String(button.dataset.wordId || '');
      return startDualPrototype(directWordId, {
        resume: !directWordId && Boolean(hardWordSoundFormState.active),
      });
    }
    if (action === 'start-dual-prototype') {
      return startDualPrototype('', { resume: Boolean(hardWordSoundFormState.active) });
    }
    if (action === 'open-syllable-tutorial') return startSyllableTutorial();
    if (action === 'syllable-exit') return navigate('hard-words');
    if (action === 'syllable-next') return advanceSyllableTutorial(1);
    if (action === 'syllable-back') return advanceSyllableTutorial(-1);
    if (action === 'syllable-audio') return playSyllableTutorialAudio(button);
    if (action === 'syllable-answer') return answerSyllableQuiz(button);
    if (action === 'syllable-quiz-next') return nextSyllableQuiz(false);
    if (action === 'syllable-quiz-skip') return nextSyllableQuiz(true);
    if (action === 'syllable-restart') return startSyllableTutorial({ historyReady: true });
    if (action === 'dual-exit') {
      persistDualPrototypeProgress();
      return navigate('hard-words');
    }
    if (action === 'dual-toggle-split') return toggleDualSplitBoundary(button);
    if (action === 'dual-clear-splits') return clearDualSplitBoundaries();
    if (action === 'dual-confirm-splits') return confirmDualSplitBoundaries();
    if (action === 'dual-record') return toggleRecording(button);
    if (action === 'dual-rerecord') {
      cleanupMedia();
      dualPrototypeState.step = 'read-record';
      dualPrototypeState.task.error = '';
      persistDualPrototypeProgress();
      return renderDualPrototype();
    }
    if (action === 'dual-finish-read') {
      if (!dualPrototypeState || !recordUrl) return;
      return advanceDualPrototype('recorded_pending_human_review');
    }
    if (action === 'dual-model-audio') return playDualModelAudio(button, false);
    if (action === 'dual-spell-audio') return playDualModelAudio(button, true);
    if (action === 'dual-finish-spell') {
      var finishedWord = currentDualPrototypeWord();
      var spellingCorrect =
        finishedWord &&
        normaliseAnswer(dualPrototypeState.task.spelling) === normaliseAnswer(finishedWord.word);
      return advanceDualPrototype(spellingCorrect ? 'independent_correct' : 'needs_repair');
    }
    if (action === 'dual-skip-task') {
      var technical = Boolean(
        dualPrototypeState && dualPrototypeState.task && dualPrototypeState.task.technicalFailure,
      );
      return advanceDualPrototype(technical ? 'technical_deferred' : 'skipped');
    }
    if (action === 'sound-form-next-batch') {
      hardWordSoundFormState.active = null;
      dualPrototypeState = null;
      saveHardWordSoundFormState();
      return startDualPrototype('', { historyReady: true });
    }
    if (action === 'sound-form-exit') {
      cleanupMedia();
      hardWordSoundFormState.active = null;
      dualPrototypeState = null;
      saveHardWordSoundFormState();
      return navigate('hard-words');
    }
    if (action === 'dual-restart') {
      cleanupMedia();
      var restartQueue = dualPrototypeState ? dualPrototypeState.queue.slice() : [];
      dualPrototypeState = defaultDualPrototypeState(restartQueue);
      persistDualPrototypeProgress();
      return renderDualPrototype();
    }
    if (action === 'hard-words-difficulty') {
      hardWordsDifficulty = String(button.dataset.difficulty || 'all');
      renderHardWordsContent();
      return;
    }
    if (action === 'hard-words-more') {
      hardWordsVisible += 60;
      renderHardWordsResults(false);
      return;
    }
    if (action === 'corpus-quick-skill') {
      corpusFilters.skill =
        corpusFilters.skill === button.dataset.skill ? 'all' : button.dataset.skill;
      return renderVisualSection();
    }
    if (action === 'corpus-more') {
      corpusVisible += 60;
      return renderCorpusResults(false);
    }
    if (action === 'reveal-word') return revealWord();
    if (action === 'play-word') return playWordFromButton(button);
    if (action === 'rescue-play') return playRescueAudio(button, false);
    if (action === 'rescue-play-reveal') return playRescueAudio(button, true);
    if (action === 'rescue-skip') return skipRescueTask();
    if (action === 'rescue-next') return advanceRescueSession();
    if (action === 'play-example') return playExample(button);
    if (action === 'record-toggle') return toggleRecording(button);
    if (action === 'play-recording') return playRecording(button);
    if (action === 'sound-syllables') return chooseSoundSyllables(button.dataset.value);
    if (action === 'sound-precheck-skip') return skipSoundPrecheck();
    if (action === 'mark-sound') return markSound(button.dataset.correct === 'true');
    if (action === 'integrated-meaning-choice') return chooseIntegratedMeaning(button);
    if (action === 'integrated-meaning-skip') return skipIntegratedMeaning();
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
    if (action === 'skip-sentence') return skipSentenceExercise();
    if (action === 'finish-sentence') return finishSentence(button.dataset.correct === 'true');
    if (action === 'export-data') return exportData();
    if (action === 'reset-data') return resetData();
  }

  function changeVisualSection(section) {
    if (['pos', 'family', 'synonym', 'antonym', 'games', 'corpus'].indexOf(section) < 0) return;
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
    var taskState = getVisualTaskState(scene.id);
    var step = Math.min(Number(taskState.step) || 0, scene.questions.length - 1);
    var question = scene.questions[step];
    var choice = String(button.dataset.token || '');
    var correct = question.answers.indexOf(choice) >= 0;
    card.dataset.locked = 'true';
    recordVisualResult(scene.id, correct, choice, 'question-' + step);
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
      taskState.step = step + 1;
      visualRuntime.posStep = taskState.step;
      if (taskState.step >= scene.questions.length) {
        completeVisualTask(scene.id);
        taskState.step = 0;
        visualRuntime.posStep = 0;
        delete visualRuntime.unlockedTasks[scene.id];
      }
      saveVisualState();
      renderVisualSection();
      updateVisualProgress();
      focusVisualSectionTask();
    }, 620);
  }

  function findVisualTask(taskId) {
    return VISUAL_LAB.groups.find(function (task) {
      return task.id === taskId;
    });
  }

  function checkVisualFamilyAnswer(form) {
    var task = findVisualFamilyTask(form.dataset.taskId);
    var card = form.closest('[data-visual-task-id]');
    if (!task || !card || card.dataset.locked === 'true') return;
    var taskState = getVisualTaskState(task.id);
    var practiceSlots = visualFamilyPracticeSlots(task);
    var step = Math.min(Number(taskState.step) || 0, practiceSlots.length - 1);
    var slot = practiceSlots[step];
    var input = form.querySelector('input[name="answer"]');
    var answer = String(new FormData(form).get('answer') || '').trim();
    if (!slot || !input) return;
    if (!answer) {
      input.setAttribute('aria-invalid', 'true');
      setFeedback(
        'visualFamilyFeedback-' + task.id,
        '先写出一个英文词形；空白不会计次。',
        'is-wrong',
      );
      input.focus();
      return;
    }

    var correct = normaliseAnswer(answer) === normaliseAnswer(slot.answer);
    card.dataset.locked = 'true';
    recordVisualResult(task.id, correct, answer, 'form-' + step);
    if (!correct) {
      input.setAttribute('aria-invalid', 'true');
      setFeedback(
        'visualFamilyFeedback-' + task.id,
        '还不对。构词线索：' + slot.hint + ' 正确拼写仍然隐藏。',
        'is-wrong',
      );
      setTimeout(function () {
        card.dataset.locked = 'false';
      }, 0);
      updateVisualProgress();
      return;
    }

    input.removeAttribute('aria-invalid');
    card.querySelectorAll('[data-visual-family-control]').forEach(function (control) {
      control.disabled = true;
    });
    setFeedback(
      'visualFamilyFeedback-' + task.id,
      '拼写正确。这个形式先保持隐藏，全部完成后再一起核对。',
      'is-correct',
    );
    var nextStep = step + 1;
    taskState.skipped = false;
    if (nextStep >= practiceSlots.length) {
      completeVisualTask(task.id);
      taskState.step = 0;
      visualRuntime.taskSteps[task.id] = 0;
      delete visualRuntime.unlockedTasks[task.id];
    } else {
      taskState.step = nextStep;
      visualRuntime.taskSteps[task.id] = nextStep;
    }
    delete visualRuntime.skippedTasks[task.id];
    saveVisualState();
    setTimeout(function () {
      replaceVisualFamilyCard(task);
      updateVisualProgress();
    }, 560);
  }

  function skipVisualFamily(button) {
    var task = findVisualFamilyTask(button.dataset.taskId);
    var card = button.closest('[data-visual-task-id]');
    if (!task || !card || card.dataset.locked === 'true') return;
    var taskState = getVisualTaskState(task.id);
    var step = Math.min(Number(taskState.step) || 0, visualFamilyPracticeSlots(task).length - 1);
    card.dataset.locked = 'true';
    recordVisualResult(task.id, false, 'skip', 'form-' + step);
    taskState.step = 0;
    taskState.skipped = true;
    visualRuntime.skippedTasks[task.id] = true;
    visualRuntime.taskSteps[task.id] = 0;
    saveVisualState();
    replaceVisualFamilyCard(task);
    updateVisualProgress();
  }

  function chooseVisualWord(button) {
    var task = findVisualTask(button.dataset.taskId);
    var card = button.closest('[data-visual-task-id]');
    if (!task || !card || card.dataset.locked === 'true') return;
    var taskState = getVisualTaskState(task.id);
    var step = Math.min(Number(taskState.step) || 0, task.scenes.length - 1);
    var scene = task.scenes[step];
    var choice = String(button.dataset.choice || '');
    var correct = choice === scene.answer;
    card.dataset.locked = 'true';
    recordVisualResult(task.id, correct, choice, 'scene-' + step);
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
        completeVisualTask(task.id);
        taskState.step = 0;
        taskState.skipped = false;
        visualRuntime.taskSteps[task.id] = 0;
        delete visualRuntime.unlockedTasks[task.id];
      } else {
        taskState.step = nextStep;
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
    var taskState = getVisualTaskState(task.id);
    var step = Math.min(Number(taskState.step) || 0, task.scenes.length - 1);
    card.dataset.locked = 'true';
    recordVisualResult(task.id, false, 'skip', 'scene-' + step);
    if (step + 1 < task.scenes.length) {
      taskState.step = step + 1;
      taskState.skipped = false;
      visualRuntime.taskSteps[task.id] = step + 1;
    } else {
      if (!visualRuntime.skippedTasks) visualRuntime.skippedTasks = {};
      taskState.step = 0;
      taskState.skipped = true;
      visualRuntime.skippedTasks[task.id] = true;
      visualRuntime.taskSteps[task.id] = 0;
    }
    saveVisualState();
    replaceVisualComparisonCard(task);
    updateVisualProgress();
  }

  function retryVisualTask(taskId) {
    beginNewVisualModelCycle(taskId);
    delete visualRuntime.unlockedTasks[taskId];
    visualRuntime.unlockedTasks[taskId] = true;
    delete visualRuntime.repairRecorded[taskId];
    getVisualTaskState(taskId).hadError = false;
    if (visualRuntime.skippedTasks) delete visualRuntime.skippedTasks[taskId];
    if (VISUAL_LAB.posScene && VISUAL_LAB.posScene.id === taskId) {
      getVisualTaskState(taskId).step = 0;
      getVisualTaskState(taskId).skipped = false;
      visualRuntime.posStep = 0;
      saveVisualState();
      renderVisualSection();
      return;
    }
    var familyTask = findVisualFamilyTask(taskId);
    if (familyTask) {
      var familyState = getVisualTaskState(taskId);
      familyState.step = 0;
      familyState.skipped = false;
      visualRuntime.taskSteps[taskId] = 0;
      saveVisualState();
      replaceVisualFamilyCard(familyTask);
      return;
    }
    var task = findVisualTask(taskId);
    if (!task) return;
    getVisualTaskState(taskId).step = 0;
    getVisualTaskState(taskId).skipped = false;
    visualRuntime.taskSteps[taskId] = 0;
    saveVisualState();
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
    focusVisualGameStage(false);
  }

  function chooseVisualGameAnswer(button) {
    var found = findVisualGameTask(button.dataset.taskId);
    var card = button.closest('[data-visual-task-id]');
    if (!found || !card || card.dataset.locked === 'true') return;
    var task = found.task;
    var choice = String(button.dataset.choice || '');
    var correct = choice === task.answer;
    card.dataset.locked = 'true';
    recordVisualResult(task.id, correct, choice, 'prompt-0');
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

    completeVisualTask(task.id);
    visualRuntime.gameAnswered[task.id] = true;
    saveVisualState();
    renderVisualSection();
    updateVisualProgress();
    focusVisualGameStage(true);
  }

  function skipVisualGame(button) {
    var found = findVisualGameTask(button.dataset.taskId);
    var card = button.closest('[data-visual-task-id]');
    if (!found || !card || card.dataset.locked === 'true') return;
    card.dataset.locked = 'true';
    stopAudio();
    recordVisualResult(found.task.id, false, 'skip', 'prompt-0');
    delete visualRuntime.gameAnswered[found.task.id];
    visualRuntime.gameIndices[found.mode.id] =
      (Number(visualRuntime.gameIndices[found.mode.id]) || 0) + 1;
    renderVisualSection();
    updateVisualProgress();
    delete visualRuntime.repairRecorded[found.task.id];
    focusVisualGameStage(false);
  }

  function advanceVisualGame(modeId) {
    var mode = findVisualGameMode(modeId);
    if (!mode) return;
    stopAudio();
    var index = Math.max(0, Number(visualRuntime.gameIndices[mode.id]) || 0);
    if (mode.tasks[index]) delete visualRuntime.gameAnswered[mode.tasks[index].id];
    if (mode.tasks[index]) delete visualRuntime.repairRecorded[mode.tasks[index].id];
    visualRuntime.gameIndices[mode.id] = index + 1;
    renderVisualSection();
    focusVisualGameStage(false);
  }

  function continueVisualGame(modeId) {
    var mode = findVisualGameMode(modeId);
    if (!mode) return;
    stopAudio();
    delete visualRuntime.gameReplay[mode.id];
    var firstIncomplete = mode.tasks.findIndex(function (task) {
      return !(visualState.tasks[task.id] && visualState.tasks[task.id].mastered);
    });
    mode.tasks.forEach(function (task) {
      if (!(visualState.tasks[task.id] && visualState.tasks[task.id].mastered)) {
        beginNewVisualModelCycle(task.id);
      }
    });
    saveVisualState();
    visualRuntime.gameIndices[mode.id] = firstIncomplete < 0 ? mode.tasks.length : firstIncomplete;
    renderVisualSection();
    focusVisualGameStage(false);
  }

  function replayVisualGame(modeId) {
    var mode = findVisualGameMode(modeId);
    if (!mode) return;
    stopAudio();
    visualRuntime.gameReplay[mode.id] = true;
    visualRuntime.gameIndices[mode.id] = 0;
    mode.tasks.forEach(function (task) {
      beginNewVisualModelCycle(task.id);
      delete visualRuntime.gameAnswered[task.id];
      delete visualRuntime.repairRecorded[task.id];
      getVisualTaskState(task.id).hadError = false;
    });
    saveVisualState();
    renderVisualSection();
    focusVisualGameStage(false);
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
        '[data-action="visual-choice"], [data-action="visual-pos-token"], [data-action="visual-game-choice"], [data-action="integrated-meaning-choice"], [data-visual-family-control]',
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
          '[data-action="visual-choice"], [data-action="visual-pos-token"], [data-action="visual-game-choice"], [data-action="integrated-meaning-choice"], [data-visual-family-control]',
        )
        .forEach(function (answerButton) {
          answerButton.disabled = false;
        });
    }
  }

  function handleMainSubmit(event) {
    var dualReadInfoForm = event.target.closest('[data-dual-read-info-form]');
    if (dualReadInfoForm) {
      event.preventDefault();
      var readInfo = new FormData(dualReadInfoForm);
      var readMeaning = String(readInfo.get('meaning') || '').trim();
      var readPos = String(readInfo.get('pos') || '').trim();
      if (!readMeaning || !readPos) return setDualTaskError('请先写出意思和词性。');
      dualPrototypeState.task.meaning = readMeaning;
      dualPrototypeState.task.pos = readPos;
      dualPrototypeState.task.error = '';
      dualPrototypeState.step = 'read-syllables';
      persistDualPrototypeProgress();
      renderDualPrototype();
      return;
    }
    var dualSpellCountForm = event.target.closest('[data-dual-spell-count-form]');
    if (dualSpellCountForm) {
      event.preventDefault();
      if (!dualPrototypeState.task.audioReady) return setDualTaskError('先播放音频。');
      var syllableCount = String(new FormData(dualSpellCountForm).get('count') || '').trim();
      if (!syllableCount) return setDualTaskError('请先写出音节数。');
      dualPrototypeState.task.syllableCount = syllableCount;
      persistDualPrototypeProgress();
      return changeDualSpellStep('spell-syllables');
    }
    var dualSpellSyllablesForm = event.target.closest('[data-dual-spell-syllables-form]');
    if (dualSpellSyllablesForm) {
      event.preventDefault();
      if (!dualPrototypeState.task.audioReady) return setDualTaskError('先播放音频。');
      var heardSyllables = String(
        new FormData(dualSpellSyllablesForm).get('syllables') || '',
      ).trim();
      if (!heardSyllables) return setDualTaskError('请先写出听到的音节。');
      dualPrototypeState.task.syllables = heardSyllables;
      persistDualPrototypeProgress();
      return changeDualSpellStep('spell-final');
    }
    var dualSpellFinalForm = event.target.closest('[data-dual-spell-final-form]');
    if (dualSpellFinalForm) {
      event.preventDefault();
      if (!dualPrototypeState.task.audioReady) return setDualTaskError('先播放音频。');
      var finalAnswer = new FormData(dualSpellFinalForm);
      var spelling = String(finalAnswer.get('spelling') || '').trim();
      var meaning = String(finalAnswer.get('meaning') || '').trim();
      var pos = String(finalAnswer.get('pos') || '').trim();
      if (!spelling || !meaning || !pos) {
        return setDualTaskError('请把单词、意思和词性都写完。');
      }
      dualPrototypeState.task.spelling = spelling;
      dualPrototypeState.task.meaning = meaning;
      dualPrototypeState.task.pos = pos;
      dualPrototypeState.task.error = '';
      dualPrototypeState.step = 'spell-result';
      stopAudio();
      persistDualPrototypeProgress();
      renderDualPrototype();
      return;
    }
    var hardWordSpellForm = event.target.closest('[data-hard-word-spell-form]');
    if (hardWordSpellForm) {
      event.preventDefault();
      checkHardWordSpelling(new FormData(hardWordSpellForm).get('answer'));
      return;
    }
    var hardWordSentenceForm = event.target.closest('[data-hard-word-sentence-form]');
    if (hardWordSentenceForm) {
      event.preventDefault();
      evaluateHardWordSentence(new FormData(hardWordSentenceForm).get('sentence'));
      return;
    }
    var rescueForm = event.target.closest('[data-rescue-form]');
    if (rescueForm) {
      event.preventDefault();
      var rescueFormData = new FormData(rescueForm);
      checkRescueAnswer(rescueFormData.get('answer'), rescueFormData.get('contextNote'));
      return;
    }
    var familyForm = event.target.closest('[data-visual-family-form]');
    if (familyForm) {
      event.preventDefault();
      checkVisualFamilyAnswer(familyForm);
      return;
    }
    var form = event.target.closest('[data-skill-form]');
    if (!form) return;
    event.preventDefault();
    var skill = form.dataset.skillForm;
    if (skill === 'spell') checkSpelling(new FormData(form).get('answer'));
    if (skill === 'forms') checkFormAnswer(form);
    if (skill === 'sentence') evaluateSentence(new FormData(form).get('sentence'));
  }

  function setDualTaskError(message) {
    if (!dualPrototypeState || !dualPrototypeState.task) return;
    dualPrototypeState.task.error = message;
    var feedback = main.querySelector('[data-dual-feedback]');
    if (feedback) {
      feedback.className = 'feedback is-wrong';
      feedback.textContent = message;
    }
  }

  function changeDualSpellStep(step) {
    stopAudio();
    dualPrototypeState.step = step;
    dualPrototypeState.task.audioReady = true;
    dualPrototypeState.task.audioFailed = false;
    dualPrototypeState.task.technicalFailure = false;
    dualPrototypeState.task.error = '';
    persistDualPrototypeProgress();
    renderDualPrototype();
  }

  function handleMainChange(event) {
    var input = event.target;
    if (input.matches('[data-action="hard-words-filter"]')) {
      if (input.dataset.filter === 'review') hardWordsReviewFilter = input.value;
      if (input.dataset.filter === 'practice') hardWordsPracticeFilter = input.value;
      renderHardWordsResults(true);
      return;
    }
    if (input.matches('[data-action="corpus-filter"]')) {
      var filter = String(input.dataset.filter || '');
      if (Object.prototype.hasOwnProperty.call(corpusFilters, filter)) {
        corpusFilters[filter] = input.value;
        renderCorpusResults(true);
      }
      return;
    }
    if (input.matches('input[data-action="import-data"]') && input.files && input.files[0]) {
      importData(input.files[0]);
    }
  }

  function handleMainInput(event) {
    if (dualPrototypeState && event.target.closest('[data-hard-word-sound-form]')) {
      var name = String(event.target.name || '');
      if (['meaning', 'pos', 'count', 'syllables', 'spelling'].indexOf(name) >= 0) {
        if (name === 'count') dualPrototypeState.task.syllableCount = event.target.value;
        else if (name === 'spelling') dualPrototypeState.task.spelling = event.target.value;
        else dualPrototypeState.task[name] = event.target.value;
        persistDualPrototypeProgress();
      }
      return;
    }
    if (event.target.matches('[data-hard-word-sentence-input]')) {
      var activeEntry = activeHardWordEntry();
      if (activeEntry) {
        var sentenceState = hardWordEntryState(activeEntry.id).sentence;
        sentenceState.draft = event.target.value;
        sentenceState.status = '';
        sentenceState.lastAt = Date.now();
        if (hardWordPracticeState.active) hardWordPracticeState.active.submitted = false;
        saveHardWordPracticeState();
      }
      return;
    }
    if (event.target.matches('[data-action="hard-words-search"]')) {
      hardWordsQuery = event.target.value;
      clearTimeout(hardWordsSearchTimer);
      hardWordsSearchTimer = setTimeout(function () {
        renderHardWordsResults(true);
      }, 90);
      return;
    }
    if (event.target.matches('[data-action="corpus-search"]')) {
      corpusQuery = event.target.value;
      clearTimeout(corpusSearchTimer);
      corpusSearchTimer = setTimeout(function () {
        renderCorpusResults(true);
      }, 90);
      return;
    }
    if (!session) return;
    if (event.target.matches('input, textarea, select')) startTaskActivity();
    if (currentSkill() === 'sentence' && event.target.id === 'sentenceInput') {
      var task = session.taskState;
      task.writing = event.target.value;
      if (task.evaluated && String(event.target.value).trim() !== task.submittedWriting) {
        task.hadError = true;
        task.evaluated = false;
        task.controlledRecallPass = false;
        task.mechanicsPass = false;
        task.checks = null;
        task.sentenceFeedback =
          '文本已在对照后修改，旧检查已失效。本次只能保存为纠错练习或待人工评阅草稿。';
        var checklist = document.getElementById('sentenceChecklist');
        var model = document.getElementById('modelSentence');
        var actions = document.getElementById('sentenceFinishActions');
        if (checklist) checklist.innerHTML = defaultChecklistHtml();
        if (model) model.hidden = true;
        if (actions) actions.hidden = true;
        setFeedback('sentenceFeedback', task.sentenceFeedback, 'is-wrong');
      }
      return;
    }
    if (currentSkill() !== 'spell' || event.target.id !== 'spellInput') return;
    session.taskState.answerValue = event.target.value;
  }

  function revealWord() {
    var card = document.getElementById('wordReveal');
    if (card) {
      card.hidden = false;
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function chooseSoundSyllables(rawValue) {
    if (!session || currentSkill() !== 'sound') return;
    var task = session.taskState;
    if (!task.soundPlayed || task.soundObserved) return;
    var choice = Number(rawValue);
    var expected = currentWord().syllables.length;
    task.soundObserved = true;
    task.soundDiagnosticChoice = choice;
    task.soundDiagnosticCorrect = choice === expected;
    task.soundDiagnosticSkipped = false;
    stopAudio();
    renderSession();
    focusCurrentSessionTask();
  }

  function skipSoundPrecheck() {
    if (!session || currentSkill() !== 'sound') return;
    startTaskActivity();
    var task = session.taskState;
    if (task.soundObserved) return;
    task.soundObserved = true;
    task.soundDiagnosticChoice = 0;
    task.soundDiagnosticCorrect = false;
    task.soundDiagnosticSkipped = true;
    stopAudio();
    renderSession();
    focusCurrentSessionTask();
  }

  function markSound(correct) {
    if (!session || currentSkill() !== 'sound' || !session.taskState.soundObserved) return;
    var word = currentWord();
    var task = session.taskState;
    var evidenceCorrect = Boolean(correct && task.soundDiagnosticCorrect);
    var diagnosticDetail = task.soundDiagnosticSkipped
      ? '预听音节：主动跳过'
      : task.soundDiagnosticCorrect
        ? '预听音节：正确'
        : '预听音节：错误';
    recordResult(
      word,
      'sound',
      evidenceCorrect,
      diagnosticDetail +
        '；' +
        (correct ? '声音对照已完成；录音跟读不计自动评分' : '声音仍不清楚；录音跟读不计自动评分'),
    );
    advanceSession();
  }

  function checkSpelling(rawAnswer) {
    if (!session || currentSkill() !== 'spell') return;
    startTaskActivity();
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
      if (integratedMeaningTask(word) && !task.meaningResolved) {
        task.spellingFirstTry = firstTry;
        task.spellingVariant = variant;
        stopAudio();
        renderSession();
        focusCurrentSessionTask();
        return;
      }
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
    startTaskActivity();
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

  function chooseIntegratedMeaning(button) {
    if (!session || currentSkill() !== 'spell') return;
    var task = integratedMeaningTask(currentWord());
    if (!task || session.taskState.meaningResolved || button.disabled) return;
    var choice = String(button.dataset.choice || '');
    var correct = choice === task.meaningAnswer;
    recordVisualResult(task.id, correct, choice, 'prompt-0');
    if (!correct) {
      session.taskState.meaningAttempts =
        Math.max(0, Number(session.taskState.meaningAttempts) || 0) + 1;
      button.disabled = true;
      button.classList.add('is-wrong');
      setFeedback('integratedMeaningFeedback', '再看画面和语境；答案仍然隐藏。', 'is-wrong');
      return;
    }
    completeVisualTask(task.id);
    session.taskState.meaningResolved = true;
    session.taskState.meaningSkipped = false;
    delete visualRuntime.repairRecorded[task.id];
    saveVisualState();
    renderSession();
    focusCurrentSessionTask();
  }

  function skipIntegratedMeaning() {
    if (!session || currentSkill() !== 'spell') return;
    var task = integratedMeaningTask(currentWord());
    if (!task || session.taskState.meaningResolved || !acquireSkipLock()) return;
    recordVisualResult(task.id, false, 'skip', 'prompt-0');
    session.taskState.meaningResolved = true;
    session.taskState.meaningSkipped = true;
    delete visualRuntime.repairRecorded[task.id];
    saveVisualState();
    renderSession();
    focusCurrentSessionTask();
  }

  function skipSpelling() {
    if (!session || currentSkill() !== 'spell') return;
    startTaskActivity();
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
      null,
      { skipped: true },
    );
    showToast('已跳过，不显示答案；这道题已加入待复习。');
    advanceSession();
  }

  function consumeRescueRelearn(task) {
    if (!task || Number(task.attemptCycle) !== 1 || !task.relearnKey) return false;
    var key = rescueKey(task.wordId, task.gate);
    if (task.relearnKey !== key) return false;
    var relearn = getRelearnState();
    var exists = relearn.queue.some(function (entry) {
      return entry && entry.key === key;
    });
    if (!exists) return false;
    relearn.queue = relearn.queue.filter(function (entry) {
      return entry && entry.key !== key;
    });
    return true;
  }

  function recordRescueResult(word, task, correct, options) {
    var now = Date.now();
    var gateState = getRescueGateState(word.id, task.gate);
    var pendingContext = Boolean(options && options.pendingContext);
    var skipped = Boolean(options && options.skipped);
    var relearnAttempt = consumeRescueRelearn(task);
    gateState.attempts += 1;
    gateState.last = now;
    gateState.pendingContext = pendingContext;
    if (skipped) gateState.skipCount += 1;
    if (pendingContext) {
      gateState.needsReview = false;
    } else if (correct) {
      gateState.correct += 1;
      gateState.needsReview = false;
    } else {
      gateState.needsReview = true;
    }
    state.history.push({
      wordId: word.id,
      word: word.word,
      skill: task.gate,
      correct: pendingContext ? null : Boolean(correct),
      detail: pendingContext
        ? '原句语境待确认；不计掌握'
        : skipped
          ? '主动跳过；未显示答案'
          : correct
            ? '声形急救受控作答正确'
            : '声形急救受控作答错误',
      at: now,
      coreAttempt: false,
      rescue: {
        attemptCycle: relearnAttempt ? 1 : 0,
        variant: rescueVariant(task),
        pendingContext: pendingContext,
      },
    });
    state.history = state.history.slice(-240);
    if (!pendingContext) noteRelearnPracticeCompletion(task.gate);
    // Context collection is still deliberate study time and shares the daily
    // cap, but it must never advance the delayed-retest clock as mastery work.
    noteDailyPracticeCompletion(task.gate);
    if (!correct && !pendingContext && !relearnAttempt)
      scheduleAutomaticRelearn(word.id, task.gate, now);
    if (!session.stats[task.gate])
      session.stats[task.gate] = { attempts: 0, correct: 0, pending: 0 };
    if (pendingContext) {
      session.stats[task.gate].pending += 1;
    } else {
      session.stats[task.gate].attempts += 1;
      if (correct) session.stats[task.gate].correct += 1;
    }
    saveState();
  }

  function checkRescueAnswer(rawAnswer, rawContextNote) {
    if (!session || session.type !== 'rescue') return;
    var task = currentRescueTask();
    var word = task && findRescueWord(task.wordId);
    if (!word || session.taskState.rescueAnswered) return;
    var answer = String(rawAnswer == null ? '' : rawAnswer).trim();
    var feedback = main.querySelector('[data-rescue-feedback]');
    if (!answer) {
      if (feedback) feedback.textContent = '先作答，或选择“先跳过”。';
      return;
    }
    if (task.gate === 'listenForm' && !session.taskState.rescueAudioReady) {
      if (feedback) feedback.textContent = '音频真正开始播放后才开放作答。';
      return;
    }
    var pending =
      task.gate === 'meaningRecall' &&
      (word.senseStatus === 'pending_context' || word.meaningTask.masteryEligible === false);
    if (pending) {
      getRescueState().contextNotes[word.id] = String(rawContextNote || '')
        .trim()
        .slice(0, 500);
    }
    var correct = false;
    if (task.gate === 'listenForm')
      correct = normaliseAnswer(answer) === normaliseAnswer(word.word);
    if (task.gate === 'readDecode') {
      var decode = word.decodeTask || { answerIndex: word.stress };
      correct = Number(answer) === Number(decode.answerIndex);
    }
    if (task.gate === 'meaningRecall') {
      var selected = word.meaningTask.choices[Number(answer)];
      correct = pending ? false : selected === word.meaningTask.answer;
    }
    recordRescueResult(word, task, correct, { pendingContext: pending });
    session.taskState.rescueAnswered = true;
    session.taskState.rescueCorrect = correct;
    session.taskState.rescueFeedback = pending
      ? '已保存这条线索；原句缺失，所以不计入掌握。'
      : correct
        ? '正确。现在核对声音、拼读块和核心义。'
        : '还没掌握。答案会在核对区出现，并安排延迟重测。';
    if (task.gate === 'listenForm') {
      renderRescueListenReview(word, task);
    } else {
      renderRescueSession();
    }
  }

  function renderRescueListenReview(word, task) {
    stopAudio();
    var root = main.querySelector('[data-rescue-task]');
    if (!root) return renderRescueSession();
    root.innerHTML =
      '<div class="training-kicker"><span class="skill-badge">' +
      esc(RESCUE_GATE_LABELS[task.gate]) +
      '</span></div><div class="rescue-stage"><p class="feedback ' +
      (session.taskState.rescueCorrect ? 'is-correct' : 'is-wrong') +
      '" data-rescue-feedback aria-live="polite">' +
      esc(session.taskState.rescueFeedback) +
      '</p>' +
      renderRescueReveal(word) +
      '<div class="rescue-actions"><button class="primary-button" type="button" data-action="rescue-next" data-rescue-primary-action>下一题</button></div></div>';
  }

  function skipRescueTask() {
    if (!session || session.type !== 'rescue' || session.taskState.skipping) return;
    if (!acquireSkipLock()) return;
    var task = currentRescueTask();
    var word = task && findRescueWord(task.wordId);
    if (!word) return;
    session.taskState.skipping = true;
    stopAudio();
    if (task.gate === 'listenForm' && session.taskState.rescueAudioFailed) {
      session.taskState.technicalDeferred = true;
      showToast('因音频故障已延后本题；不记为学生错题。');
      advanceRescueSession();
      return;
    }
    var pendingContext =
      task.gate === 'meaningRecall' &&
      (word.senseStatus === 'pending_context' || word.meaningTask.masteryEligible === false);
    recordRescueResult(word, task, false, {
      skipped: !pendingContext,
      pendingContext: pendingContext,
    });
    showToast(
      pendingContext
        ? '已暂缓词义确认；没有原句时不判错。'
        : '已跳过，不显示答案；稍后会无提示重测。',
    );
    advanceRescueSession();
  }

  function appendReadyRescueRelearn() {
    if (!session || session.type !== 'rescue') return;
    var rescue = getRescueState();
    var selectedKeys = new Set(Array.isArray(session.relearnKeys) ? session.relearnKeys : []);
    var slots = Math.max(0, RELEARN_MAX_PER_SESSION - selectedKeys.size);
    if (!slots) return;
    var remainingBudget = Math.max(
      0,
      DAILY_MAX_SECONDS - Number(state.daily.practicedSeconds || 0),
    );
    readyRescueRelearnTasks(Date.now()).some(function (task) {
      if (slots <= 0 || selectedKeys.has(task.relearnKey)) return slots <= 0;
      var taskSeconds = Number(RESCUE_GATE_SECONDS[task.gate] || 40);
      if (taskSeconds > remainingBudget) return false;
      var alreadyQueued = rescue.tasks.slice(session.wordIndex).some(function (candidate) {
        return candidate.wordId === task.wordId && candidate.gate === task.gate;
      });
      if (!alreadyQueued) rescue.tasks.push(task);
      selectedKeys.add(task.relearnKey);
      remainingBudget -= taskSeconds;
      slots -= 1;
      return false;
    });
    session.relearnKeys = Array.from(selectedKeys);
  }

  function advanceRescueSession() {
    if (!session || session.type !== 'rescue') return;
    cleanupMedia();
    session.wordIndex += 1;
    appendReadyRescueRelearn();
    var rescue = getRescueState();
    rescue.taskIndex = session.wordIndex;
    saveState();
    session.taskState = {};
    renderRescueSession();
    scrollToTop();
  }

  function acquireSkipLock() {
    var now = Date.now();
    if (now < skipLockedUntil) return false;
    skipLockedUntil = now + 650;
    return true;
  }

  function syncRenderedSkipControls() {
    var controls = main.querySelectorAll(
      '[data-action="skip-spell"], [data-action="skip-form"], [data-action="skip-sentence"], [data-rescue-skip]',
    );
    if (!controls.length) return;
    var remaining = Math.max(0, skipLockedUntil - Date.now());
    controls.forEach(function (control) {
      control.disabled = remaining > 0;
    });
    if (!remaining) return;
    setTimeout(function () {
      if (Date.now() < skipLockedUntil) {
        syncRenderedSkipControls();
        return;
      }
      main
        .querySelectorAll(
          '[data-action="skip-spell"], [data-action="skip-form"], [data-action="skip-sentence"], [data-rescue-skip]',
        )
        .forEach(function (control) {
          control.disabled = false;
        });
    }, remaining + 20);
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
    var requiredPos = normaliseRequiredPos(exercise.need);
    if (pos === requiredPos) {
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
    var acceptedAnswers = [exercise.answer].concat(exercise.answers || []);
    var correct = acceptedAnswers.some(function (candidate) {
      return normaliseAnswer(answer) === normaliseAnswer(candidate);
    });
    if (correct) {
      completeFormExercise(word, exercise, task, answer);
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

  function completeFormExercise(word, exercise, task, acceptedAnswer) {
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
      var completedAnswer = acceptedAnswer || exercise.answer;
      task.answerValue = completedAnswer;
      task.formFeedbackHtml =
        (firstTry ? '正确：' : '已经改对，本次仍进入复习：') +
        '<strong>' +
        esc(completedAnswer) +
        '</strong>。' +
        (normaliseAnswer(completedAnswer) !== normaliseAnswer(exercise.answer)
          ? '这是可接受的标准变体；本卡首选形式是 <strong>' + esc(exercise.answer) + '</strong>。'
          : '') +
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
      null,
      { skipped: true },
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
              label:
                exercise.type === 'context'
                  ? POS_LABELS[normaliseRequiredPos(exercise.need)] || exercise.need
                  : exercise.targetLabel,
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
    task.submittedWriting = '';
    task.checks = null;
    task.mechanicsPass = false;
    task.controlledRecallPass = false;
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
      task.chunkFeedback = '顺序正确。先读一遍标准骨架，再遮住英文完成复现。';
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
    task.chunkFeedback = '骨架已遮住。现在只看中文，独立复现刚才的标准句。';
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
    task.submittedWriting = text;
    task.checks = checks;
    task.mechanicsPass = allPass;
    task.controlledRecallPass =
      normaliseControlledSentence(text) === normaliseControlledSentence(joinChunks(word.chunks));
    task.evaluated = true;
    task.sentenceFeedback = task.controlledRecallPass
      ? task.hadError
        ? '已经复现标准句，但本轮看过答案或有过错误，只记录为纠错练习。'
        : '首次完整复现标准句。这里只证明受控短时复现，不代表自由造句或语法已通过。'
      : allPass
        ? '表面检查通过，但与标准句不完全一致。你的表达将只保存为待人工评阅草稿，不自动判对或判错。'
        : '表面检查仍有缺项。请对照参考句；静态页面不会把机械检查当作完整语法评分。';

    document.getElementById('sentenceChecklist').innerHTML = checklistHtml(checks);
    document.getElementById('modelSentence').hidden = false;
    document.getElementById('sentenceFinishActions').hidden = false;
    var skipButton = main.querySelector('[data-action="skip-sentence"]');
    if (skipButton) {
      var skipRow = skipButton.closest('.form-skip-row');
      if (skipRow) skipRow.remove();
      else skipButton.remove();
    }
    setFeedback(
      'sentenceFeedback',
      task.sentenceFeedback,
      task.controlledRecallPass && !task.hadError ? 'is-correct' : allPass ? '' : 'is-wrong',
    );
  }

  function finishSentence(selfRatedCorrect) {
    if (!session || currentSkill() !== 'sentence') return;
    var word = currentWord();
    var task = session.taskState;
    var text = String(task.submittedWriting || '').trim();
    if (!task.evaluated || !text) {
      setFeedback('sentenceFeedback', '请先点击“提交复现并对照”。', 'is-wrong');
      return;
    }
    var controlledCorrect = Boolean(
      selfRatedCorrect && task.controlledRecallPass && task.mechanicsPass && !task.hadError,
    );
    var status = controlledCorrect
      ? 'controlled_recall'
      : task.controlledRecallPass
        ? 'corrected_practice'
        : 'pending_human_review';
    state.journal.push({
      wordId: word.id,
      word: word.word,
      text: text,
      revisedText: String(task.writing || text).trim(),
      reviewed: false,
      teacherVerified: false,
      status: status,
      surfaceChecks: task.checks,
      at: Date.now(),
    });
    state.journal = state.journal.slice(-120);
    if (controlledCorrect) {
      recordResult(word, 'sentence', true, '标准句在隐藏后首次完整复现');
    } else if (task.controlledRecallPass || !task.mechanicsPass || !selfRatedCorrect) {
      recordResult(
        word,
        'sentence',
        false,
        task.controlledRecallPass
          ? '看过答案或纠错后复现；不计独立证据'
          : !task.mechanicsPass
            ? '表面检查未通过；需修改'
            : '学习者标记为需要人工帮助',
      );
    } else {
      recordPendingResult(word, 'sentence', '表达与标准句不同；已保存为待人工评阅草稿，不计正误');
    }
    saveState();
    advanceSession();
  }

  function skipSentenceExercise() {
    if (!session || currentSkill() !== 'sentence') return;
    var task = session.taskState;
    if (task.skipping || task.evaluated) return;
    if (!acquireSkipLock()) return;
    task.skipping = true;
    recordResult(currentWord(), 'sentence', false, '主动跳过搭配与句架任务；稍后复习', null, {
      skipped: true,
    });
    showToast('已跳过；这道表达题已加入待复习。');
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

  function normaliseControlledSentence(value) {
    return String(value || '')
      .trim()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ');
  }

  function containsTargetForm(word, sentence) {
    var candidates = [word.word]
      .concat(
        word.family.map(function (familyItem) {
          return familyItem[0];
        }),
      )
      .concat(word.form ? [word.form.answer].concat(word.form.answers || []) : [])
      .join(' ')
      .toLowerCase()
      .split(/[^a-z-]+/)
      .filter(function (token) {
        return token.length > 1 && ['the', 'base', 'past', 'singular', 'plural'].indexOf(token) < 0;
      });
    candidates = Array.from(
      new Set(
        candidates.reduce(function (forms, candidate) {
          return forms.concat(commonSurfaceForms(candidate));
        }, []),
      ),
    );
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

  function commonSurfaceForms(candidate) {
    var forms = [candidate];
    if (!/^[a-z]+$/.test(candidate) || candidate.length < 3) return forms;
    if (/[^aeiou]y$/.test(candidate)) {
      forms.push(candidate.slice(0, -1) + 'ies', candidate.slice(0, -1) + 'ied');
    } else if (/(?:s|x|z|ch|sh|o)$/.test(candidate)) {
      forms.push(candidate + 'es');
    } else {
      forms.push(candidate + 's');
    }
    if (/e$/.test(candidate)) {
      forms.push(candidate + 'd', candidate.slice(0, -1) + 'ing');
    } else {
      forms.push(candidate + 'ed', candidate + 'ing');
    }
    return forms;
  }

  function advanceSession() {
    if (!session) return;
    cleanupMedia();
    if (session.type === 'daily') {
      session.stageIndex += 1;
      if (session.stageIndex >= currentStages().length) {
        session.stageIndex = 0;
        session.wordIndex += 1;
        reorderRemainingSession();
      }
      appendReadyRelearnToSession();
      if (session.stageIndex === 0) reorderRemainingSession();
      if (session.wordIndex >= session.words.length) {
        state.daily.completedAt = Date.now();
        saveState();
      }
    } else {
      session.wordIndex += 1;
      reorderRemainingSession();
      appendReadyRelearnToSession();
      reorderRemainingSession();
    }
    session.taskState = {};
    renderSession();
    scrollToTop();
    focusCurrentSessionTask();
  }

  function reorderRemainingSession() {
    if (!session || session.wordIndex >= session.words.length) return;
    var planningNow = Date.now();
    if (session.type === 'daily') {
      var completedPlans = session.plans.slice(0, session.wordIndex);
      var remainingPlans = session.plans
        .slice(session.wordIndex)
        .map(function (plan) {
          return makeDailyPlan(plan.word, plan.kind, plan.stages, planningNow);
        })
        .sort(compareAdaptivePlansWithinStructure);
      session.plans = completedPlans.concat(remainingPlans);
      session.words = session.plans.map(function (plan) {
        return plan.word;
      });
      return;
    }
    if (session.type === 'repair') {
      var remainingRepairs = session.words
        .slice(session.wordIndex)
        .map(function (word, offset) {
          var absoluteIndex = session.wordIndex + offset;
          var skill = session.repairSkills[absoluteIndex];
          return {
            word: word,
            skill: skill,
            priority: adaptivePriority(word.id, skill, planningNow),
          };
        })
        .sort(function (a, b) {
          return (
            Number(Boolean(b.word.relearnKey)) - Number(Boolean(a.word.relearnKey)) ||
            b.priority - a.priority ||
            a.word.id.localeCompare(b.word.id) ||
            SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill)
          );
        });
      session.words.splice(
        session.wordIndex,
        remainingRepairs.length,
        ...remainingRepairs.map(function (item) {
          return item.word;
        }),
      );
      session.repairSkills.splice(
        session.wordIndex,
        remainingRepairs.length,
        ...remainingRepairs.map(function (item) {
          return item.skill;
        }),
      );
      return;
    }
    var skill = session.stages[0];
    var originalRemaining = session.words.slice(session.wordIndex);
    var sortByPriority = function (words) {
      return words.sort(function (a, b) {
        var relearnDifference = Number(Boolean(b.relearnKey)) - Number(Boolean(a.relearnKey));
        if (relearnDifference) return relearnDifference;
        var difference =
          adaptivePriority(b.id, skill, planningNow) - adaptivePriority(a.id, skill, planningNow);
        return difference || a.id.localeCompare(b.id);
      });
    };
    var remainingWords = sortByPriority(originalRemaining.slice());
    if (skill === 'forms') {
      var foundationIds = new Set(
        FORM_FOUNDATIONS.map(function (word) {
          return word.id;
        }),
      );
      var formStructureKey = function (word) {
        if (foundationIds.has(word.id)) return 'foundation';
        return word.practiceMode === 'direct' ? 'direct' : 'context';
      };
      var formQueues = {};
      var formQueueIndices = {};
      originalRemaining.forEach(function (word) {
        var key = formStructureKey(word);
        if (!formQueues[key]) formQueues[key] = [];
        formQueues[key].push(word);
      });
      Object.keys(formQueues).forEach(function (key) {
        formQueues[key] = sortByPriority(formQueues[key]);
        formQueueIndices[key] = 0;
      });
      remainingWords = originalRemaining.map(function (word) {
        var key = formStructureKey(word);
        var nextWord = formQueues[key][formQueueIndices[key]];
        formQueueIndices[key] += 1;
        return nextWord;
      });
      remainingWords = remainingWords
        .filter(function (word) {
          return Boolean(word.relearnKey);
        })
        .concat(
          remainingWords.filter(function (word) {
            return !word.relearnKey;
          }),
        );
    }
    session.words.splice(session.wordIndex, remainingWords.length, ...remainingWords);
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
    if (session.type === 'rescue') {
      var rescueTask = currentRescueTask();
      return rescueTask ? findRescueWord(rescueTask.wordId) : null;
    }
    if (session.type === 'daily') {
      var plan = currentPlan();
      return plan && plan.word;
    }
    return session.words[session.wordIndex];
  }

  function currentPlan() {
    if (!session || session.type !== 'daily' || !Array.isArray(session.plans)) return null;
    return session.plans[session.wordIndex] || null;
  }

  function currentStages() {
    if (!session) return [];
    if (session.type === 'rescue') {
      var rescueTask = currentRescueTask();
      return rescueTask ? [{ skill: rescueTask.gate, role: 'rescue' }] : [];
    }
    if (session.type === 'daily') {
      var plan = currentPlan();
      return (plan && plan.stages) || [];
    }
    return (session.stages || []).map(function (skill) {
      return { skill: skill, role: 'practice' };
    });
  }

  function currentStage() {
    return currentStages()[session.stageIndex] || null;
  }

  function currentSkill() {
    if (session.type === 'rescue') {
      var rescueTask = currentRescueTask();
      return rescueTask && rescueTask.gate;
    }
    if (session.type === 'repair') {
      return session.repairSkills[session.wordIndex];
    }
    var stage = currentStage();
    return stage && stage.skill;
  }

  function dailyTaskNumber() {
    var completedBefore = session.plans.slice(0, session.wordIndex).reduce(function (total, plan) {
      return total + plan.stages.length;
    }, 0);
    return completedBefore + session.stageIndex + 1;
  }

  function dailyTaskTotal() {
    return dailyPlanTaskCount(session.plans || []);
  }

  function dailyPlanTaskCount(plans) {
    return plans.reduce(function (total, plan) {
      return total + plan.stages.length;
    }, 0);
  }

  function dailyPlanSeconds(plans) {
    return plans.reduce(function (total, plan) {
      return (
        total +
        plan.stages.reduce(function (stageTotal, stage) {
          return stageTotal + (Number(stage.estimatedSeconds) || STAGE_SECONDS[stage.skill] || 60);
        }, 0)
      );
    }, 0);
  }

  function dailyRemainingPlanSeconds(plans, startIndex, firstStageIndex) {
    return (plans || []).reduce(function (total, plan, planIndex) {
      if (planIndex < Number(startIndex || 0)) return total;
      var stageStart = planIndex === Number(startIndex || 0) ? Number(firstStageIndex || 0) : 0;
      return (
        total +
        (Array.isArray(plan.stages) ? plan.stages : []).slice(stageStart).reduce(function (
          stageTotal,
          stage,
        ) {
          return stageTotal + (Number(stage.estimatedSeconds) || STAGE_SECONDS[stage.skill] || 60);
        }, 0)
      );
    }, 0);
  }

  function buildDailyPlan() {
    var today = startOfToday();
    var planningNow = Date.now();
    var dateKey = localDateKey();
    if (!state.daily) state.daily = defaultState().daily;
    if (state.daily.date !== dateKey) {
      var rolledIds = (state.daily.carryoverIds || []).concat(
        (state.daily.newIds || []).filter(function (id) {
          return hasAnyAttempt(id) && hasUnattemptedSkill(id);
        }),
      );
      state.daily = {
        date: dateKey,
        newIds: [],
        carryoverIds: uniqueIds(rolledIds),
        newSelectionDone: false,
        completedAt: 0,
        practicedSeconds: 0,
      };
      saveState();
    }

    var availableTodaySeconds = Math.max(
      0,
      DAILY_MAX_SECONDS - Number(state.daily.practicedSeconds || 0),
    );
    if (Number(state.daily.completedAt || 0) > 0) {
      return appendReadyRelearnPlans(
        [],
        planningNow,
        0,
        0,
        RELEARN_MAX_PER_SESSION,
        availableTodaySeconds,
      ).sort(compareAdaptivePlansWithinStructure);
    }

    state.daily.carryoverIds = (state.daily.carryoverIds || []).filter(function (id) {
      return Boolean(findWord(id) && hasUnattemptedSkill(id));
    });
    state.daily.newIds = (state.daily.newIds || []).filter(function (id) {
      return Boolean(findWord(id));
    });

    var currentNewPlans = state.daily.newIds
      .map(function (id) {
        var word = findWord(id);
        var remaining = word ? unattemptedSkills(word.id) : [];
        return remaining.length
          ? makeDailyPlan(word, 'new', makeNewStages(remaining), planningNow)
          : null;
      })
      .filter(Boolean);
    currentNewPlans = plansWithinSeconds(currentNewPlans, availableTodaySeconds);
    var reservedNewSeconds = dailyPlanSeconds(currentNewPlans);
    var reviewBudget = Math.max(0, availableTodaySeconds - reservedNewSeconds);
    var excludedIds = new Set(state.daily.newIds.concat(state.daily.carryoverIds || []));

    var carryoverCandidates = state.daily.carryoverIds
      .map(function (id) {
        var word = findWord(id);
        if (!word) return null;
        var skills = uniqueSkills(
          dueSkills(word.id, today, planningNow).concat(unattemptedSkills(word.id)),
        );
        return skills.length
          ? makeDailyPlan(
              word,
              'carryover',
              makeReviewStages(skills, word.id, planningNow),
              planningNow,
            )
          : null;
      })
      .filter(Boolean)
      .sort(compareAdaptivePlans);

    var dueCandidates = WORDS.filter(function (word) {
      return !excludedIds.has(word.id);
    })
      .map(function (word) {
        var skills = dueSkills(word.id, today, planningNow);
        return skills.length
          ? makeDailyPlan(
              word,
              'review',
              makeReviewStages(skills, word.id, planningNow),
              planningNow,
            )
          : null;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        var priorityDifference = b.adaptivePriority - a.adaptivePriority;
        if (priorityDifference) return priorityDifference;
        var dueDifference = nextDueTime(a.word.id) - nextDueTime(b.word.id);
        if (dueDifference) return dueDifference;
        var scoreDifference = overallWordScore(a.word.id) - overallWordScore(b.word.id);
        if (scoreDifference) return scoreDifference;
        return a.word.id.localeCompare(b.word.id);
      });

    var reviewPlans = [];
    var reviewSeconds = 0;
    carryoverCandidates.concat(dueCandidates).forEach(function (plan) {
      var seconds = dailyPlanSeconds([plan]);
      if (reviewSeconds + seconds > reviewBudget) return;
      reviewPlans.push(plan);
      reviewSeconds += seconds;
    });

    if (!state.daily.newSelectionDone) {
      var fullNewSeconds = dailyPlanSeconds([
        makeDailyPlan(WORDS[0], 'new', makeNewStages(SKILLS), planningNow),
      ]);
      var availableForNew = Math.max(0, availableTodaySeconds - reviewSeconds);
      var allowedNew = Math.min(
        normaliseDailyNew(state.settings.dailyNew),
        Math.floor(availableForNew / fullNewSeconds),
      );
      state.daily.newIds = seededWords(
        WORDS.filter(function (word) {
          return !hasAnyAttempt(word.id) && !excludedIds.has(word.id);
        }),
      )
        .slice(0, allowedNew)
        .map(function (word) {
          return word.id;
        });
      state.daily.newSelectionDone = true;
      saveState();
      currentNewPlans = state.daily.newIds
        .map(function (id) {
          var word = findWord(id);
          return word ? makeDailyPlan(word, 'new', makeNewStages(SKILLS), planningNow) : null;
        })
        .filter(Boolean);
    }

    return appendReadyRelearnPlans(
      reviewPlans.concat(currentNewPlans),
      planningNow,
      0,
      0,
      RELEARN_MAX_PER_SESSION,
      availableTodaySeconds,
    ).sort(compareAdaptivePlansWithinStructure);
  }

  function plansWithinSeconds(plans, limit) {
    var selected = [];
    var seconds = 0;
    (plans || []).forEach(function (plan) {
      var planSeconds = dailyPlanSeconds([plan]);
      if (seconds + planSeconds > Number(limit || 0)) return;
      selected.push(plan);
      seconds += planSeconds;
    });
    return selected;
  }

  function findWord(wordId) {
    return WORDS.find(function (word) {
      return word.id === wordId;
    });
  }

  function findCoreStudyWord(wordId) {
    return (
      findWord(wordId) ||
      FORM_FOUNDATIONS.find(function (word) {
        return word.id === wordId;
      }) ||
      findRescueWord(wordId)
    );
  }

  function hasUnattemptedSkill(wordId) {
    return SKILLS.some(function (skill) {
      return !hasSkillActivity(peekSkillState(wordId, skill));
    });
  }

  function unattemptedSkills(wordId) {
    return SKILLS.filter(function (skill) {
      return !hasSkillActivity(peekSkillState(wordId, skill));
    });
  }

  function dueSkills(wordId, today, planningNow) {
    var now = planningNow || Date.now();
    return SKILLS.filter(function (skill) {
      if (findPendingRelearn(wordId, skill)) return false;
      var skillState = peekSkillState(wordId, skill);
      return hasSkillActivity(skillState) && skillState.due <= today && skillState.last < today;
    }).sort(function (a, b) {
      var difference = adaptivePriority(wordId, b, now) - adaptivePriority(wordId, a, now);
      return difference || SKILLS.indexOf(a) - SKILLS.indexOf(b);
    });
  }

  function hasSkillActivity(skillState) {
    return (
      Number(skillState.attempts || 0) > 0 ||
      Number(skillState.pending || 0) > 0 ||
      Boolean(skillState.relearnRequired)
    );
  }

  function adaptivePriority(wordId, skill, now) {
    var skillState = peekSkillState(wordId, skill);
    var predictedRecall = predictRecallProbability(wordId, skill, null, now || Date.now());
    var due = Number(skillState.due || 0);
    var overdueDays = due ? Math.max(0, ((now || Date.now()) - due) / DAY_MS) : 0;
    var attempts = Number(skillState.attempts || 0);
    var unresolvedError = hasUnresolvedControlledError(wordId, skill, skillState);
    var pendingOnly = Number(skillState.pending || 0) > 0 && !unresolvedError;
    return (
      (1 - predictedRecall) * 100 * learningGoalPriority(skill) +
      (unresolvedError ? 22 : 0) +
      (skillState.relearnRequired ? 24 : 0) +
      (pendingOnly ? 8 : 0) +
      (hasVisualRepair(wordId, skill) ? 30 : 0) +
      Math.min(18, overdueDays * 1.5) +
      Math.max(0, 3 - attempts) * 2
    );
  }

  function adaptiveReason(wordId, skill, now) {
    var skillState = peekSkillState(wordId, skill);
    if (hasVisualRepair(wordId, skill)) return '图像错项回流';
    var unresolvedError = hasUnresolvedControlledError(wordId, skill, skillState);
    if (Number(skillState.pending || 0) > 0 && !unresolvedError) return '等待评阅';
    if (unresolvedError) {
      return Number(skillState.skipCount || 0) > 0 ? '跳过后重学' : '最近错项';
    }
    if (Number(skillState.hintUses || 0) > 0) return '提示依赖';
    if (Number(skillState.replayUses || 0) > 0) return '听音需要巩固';
    return predictRecallProbability(wordId, skill, null, now || Date.now()) < 0.55
      ? '临近遗忘'
      : '间隔复习';
  }

  function uniqueSkills(skills) {
    return SKILLS.filter(function (skill) {
      return skills.indexOf(skill) >= 0;
    });
  }

  function uniqueIds(ids) {
    var seen = new Set();
    return ids.filter(function (id) {
      if (!findWord(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function makeNewStages(skills) {
    return uniqueSkills(skills).map(function (skill) {
      return {
        skill: skill,
        role: 'learn',
        estimatedSeconds: STAGE_SECONDS[skill],
      };
    });
  }

  function makeReviewStages(skills, wordId, planningNow) {
    var now = planningNow || Date.now();
    var ordered = uniqueSkills(skills);
    var exitSkill = '';
    if (ordered.indexOf('sentence') >= 0) {
      exitSkill = 'sentence';
    } else if (ordered.indexOf('forms') >= 0) {
      exitSkill = 'forms';
    } else {
      ordered.push('forms');
      exitSkill = 'forms';
    }
    ordered = ordered
      .filter(function (skill) {
        return skill !== exitSkill;
      })
      .sort(function (a, b) {
        var difference = adaptivePriority(wordId, b, now) - adaptivePriority(wordId, a, now);
        return difference || SKILLS.indexOf(a) - SKILLS.indexOf(b);
      })
      .concat(exitSkill);
    return ordered.map(function (skill) {
      var isTransfer = skill === exitSkill;
      return {
        skill: skill,
        role: isTransfer ? 'transfer' : 'review',
        variant: isTransfer && skill === 'forms' ? 'context' : '',
        estimatedSeconds: STAGE_SECONDS[skill],
      };
    });
  }

  function makeDailyPlan(word, kind, stages, planningNow) {
    var now = planningNow || Date.now();
    var preparedStages = stages.slice();
    var priorityStages = preparedStages.filter(function (stage) {
      return stage.role !== 'transfer';
    });
    if (!priorityStages.length) priorityStages = preparedStages;
    var rankedStages = priorityStages
      .map(function (stage) {
        return {
          skill: stage.skill,
          priority: adaptivePriority(word.id, stage.skill, now),
        };
      })
      .sort(function (a, b) {
        return b.priority - a.priority;
      });
    var urgentStage = rankedStages[0];
    return {
      word: word,
      kind: kind,
      stages: preparedStages,
      adaptivePriority: urgentStage ? urgentStage.priority : 0,
      adaptiveReason: urgentStage ? adaptiveReason(word.id, urgentStage.skill, now) : '间隔复习',
    };
  }

  function compareAdaptivePlans(a, b) {
    var difference = b.adaptivePriority - a.adaptivePriority;
    if (difference) return difference;
    return a.word.id.localeCompare(b.word.id);
  }

  function compareAdaptivePlansWithinStructure(a, b) {
    var kindOrder = { relearn: 0, carryover: 1, review: 2, new: 3 };
    var kindDifference =
      Number(kindOrder[a.kind] === undefined ? 9 : kindOrder[a.kind]) -
      Number(kindOrder[b.kind] === undefined ? 9 : kindOrder[b.kind]);
    return kindDifference || compareAdaptivePlans(a, b);
  }

  function buildRepairQueue(limit) {
    var today = startOfToday();
    var planningNow = Date.now();
    var recentBoundary = planningNow - 14 * DAY_MS;
    var latestCoreResults = {};
    state.history.forEach(function (item) {
      if (!item || item.coreAttempt === false || SKILLS.indexOf(item.skill) < 0) return;
      var key = item.wordId + ':' + item.skill;
      if (
        !latestCoreResults[key] ||
        Number(item.at || 0) >= Number(latestCoreResults[key].at || 0)
      ) {
        latestCoreResults[key] = item;
      }
    });
    var items = [];
    WORDS.forEach(function (word) {
      SKILLS.forEach(function (skill) {
        var skillState = peekSkillState(word.id, skill);
        var wordState = state.words[word.id] || {};
        var visualPending = Boolean(
          wordState.visualRepairPending && wordState.visualRepairPending[skill],
        );
        if (!hasSkillActivity(skillState) && !visualPending) return;
        var pendingRelearn = findPendingRelearn(word.id, skill);
        if (pendingRelearn && !isRelearnReady(pendingRelearn, planningNow)) return;
        var accuracy = skillState.attempts ? skillState.correct / skillState.attempts : 0;
        var latest = latestCoreResults[word.id + ':' + skill];
        var unresolvedRecentError = Boolean(
          latest && latest.correct === false && Number(latest.at || 0) >= recentBoundary,
        );
        var due = skillState.due <= today;
        if (!unresolvedRecentError && !skillState.needsReview && !visualPending) return;
        items.push({
          word: word,
          skill: skill,
          priority:
            adaptivePriority(word.id, skill, planningNow) +
            (1 - accuracy) * 12 +
            (unresolvedRecentError ? 8 : 0) +
            (due ? 4 : 0) +
            (visualPending ? 8 : 0),
          due: skillState.due || 0,
        });
      });
    });
    return items
      .sort(function (a, b) {
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (a.due !== b.due) return a.due - b.due;
        if (a.word.id !== b.word.id) return a.word.id.localeCompare(b.word.id);
        return SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill);
      })
      .slice(0, limit);
  }

  function buildSkillQueue(skill, limit) {
    var now = startOfToday();
    var planningNow = Date.now();
    var active = WORDS.filter(function (word) {
      var skillState = peekSkillState(word.id, skill);
      var pendingRelearn = findPendingRelearn(word.id, skill);
      if (pendingRelearn && !isRelearnReady(pendingRelearn, planningNow)) return false;
      var weak = skillState.attempts > 0 && skillState.correct / skillState.attempts < 0.8;
      var due = hasSkillActivity(skillState) && skillState.due <= now;
      return due || weak || skillState.needsReview || hasVisualRepair(word.id, skill);
    }).sort(function (a, b) {
      var difference =
        adaptivePriority(b.id, skill, planningNow) - adaptivePriority(a.id, skill, planningNow);
      if (difference) return difference;
      var dueDifference = peekSkillState(a.id, skill).due - peekSkillState(b.id, skill).due;
      return dueDifference || a.id.localeCompare(b.id);
    });
    var unseen = seededWords(
      WORDS.filter(function (word) {
        return !hasSkillActivity(peekSkillState(word.id, skill));
      }),
    );
    return uniqueWords(active.concat(unseen)).slice(0, limit);
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
      return (
        !hasVisualRepair(word.id) &&
        SKILLS.every(function (skill) {
          var skillState = peekSkillState(word.id, skill);
          return skillState.level >= 4 && !skillState.needsReview;
        })
      );
    }).length;
    var recentBoundary = Date.now() - 14 * 86400000;
    var mistakes = state.history.filter(function (item) {
      return (
        item.correct === false &&
        item.at >= recentBoundary &&
        Boolean(effectiveCoreMistakeSkill(item))
      );
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

  function effectiveCoreMistakeSkill(item) {
    if (!item || SKILLS.indexOf(item.skill) < 0) return '';
    if (item.coreAttempt !== false) return item.skill;
    if (item.source !== 'visual') return '';
    var repairSkill = VISUAL_REPAIR_SKILLS[String(item.visualGameType || '')];
    return repairSkill === item.skill && SKILLS.indexOf(repairSkill) >= 0 ? repairSkill : '';
  }

  function countDueSkills() {
    var now = startOfToday();
    var count = 0;
    WORDS.forEach(function (word) {
      SKILLS.forEach(function (skill) {
        var skillState = peekSkillState(word.id, skill);
        if (
          hasVisualRepair(word.id, skill) ||
          (hasSkillActivity(skillState) && skillState.due <= now && skillState.last < now)
        ) {
          count += 1;
        }
      });
    });
    return count;
  }

  function hasAnyAttempt(wordId) {
    return (
      hasVisualRepair(wordId) ||
      SKILLS.some(function (skill) {
        return hasSkillActivity(peekSkillState(wordId, skill));
      })
    );
  }

  function hasVisualRepair(wordId, skill) {
    var wordState = state.words[wordId];
    var pending = wordState && wordState.visualRepairPending;
    if (!pending || typeof pending !== 'object') return false;
    if (skill) return Boolean(pending[skill]);
    return SKILLS.some(function (candidate) {
      return Boolean(pending[candidate]);
    });
  }

  function overallWordScore(wordId) {
    var attempted = 0;
    var total = 0;
    SKILLS.forEach(function (skill) {
      var skillState = peekSkillState(wordId, skill);
      if (hasSkillActivity(skillState)) {
        attempted += 1;
        total += skillState.attempts ? skillState.correct / skillState.attempts : 0;
      }
    });
    return attempted ? total / attempted : -1;
  }

  function nextDueTime(wordId) {
    var times = SKILLS.map(function (skill) {
      var skillState = peekSkillState(wordId, skill);
      return hasSkillActivity(skillState) ? skillState.due : Infinity;
    });
    if (hasVisualRepair(wordId)) times.push(startOfToday());
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

  function addCalendarDays(timestamp, days) {
    var date = new Date(timestamp);
    date.setDate(date.getDate() + Number(days || 0));
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
    var seed = Number(localDateKey().replace(/-/g, ''));
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
    updateDisplayedAccent(currentWord(), accent);
    playFixedAudio(currentWord(), accent, rate, button, 'word');
  }

  function wordIpa(word, accent) {
    if (accent === 'us') return word.ipaUs || word.ipa || '';
    return word.ipaUk || word.ipa || '';
  }

  function accentLabel(accent) {
    return accent === 'us' ? 'US' : 'UK';
  }

  function updateDisplayedAccent(word, accent) {
    var display = document.querySelector('[data-ipa-display]');
    if (!display) return;
    display.textContent = accentLabel(accent) + ' ' + wordIpa(word, accent);
  }

  function unlockSoundPrecheck(button) {
    if (
      !session ||
      currentSkill() !== 'sound' ||
      session.taskState.soundObserved ||
      !button.closest('[data-sound-precheck]')
    ) {
      return;
    }
    session.taskState.soundPlayed = true;
    document.querySelectorAll('[data-action="sound-syllables"]').forEach(function (choice) {
      choice.disabled = false;
    });
    var status = document.getElementById('soundPrecheckStatus');
    if (status) status.textContent = '已经听到范音，请选择音节数。';
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
    startAudioPlayback(source, button, rate, {
      sessionToken: session && session.token,
      taskState: session && session.taskState,
      wordId: word.id,
    });
  }

  function rescueAudioSource(word, accent) {
    var pronunciation = word && word.pronunciation && word.pronunciation[accent];
    return pronunciation && pronunciation.wordAudio ? pronunciation.wordAudio : '';
  }

  function playRescueAudio(button, reveal) {
    if (!session || session.type !== 'rescue') return;
    var task = currentRescueTask();
    var word = task && findRescueWord(task.wordId);
    if (!word) return;
    if (toggleCurrentPlayback(button)) return;
    var accent = button.dataset.accent === 'us' ? 'us' : 'uk';
    var source = rescueAudioSource(word, accent);
    if (!source) {
      if (!reveal) lockRescueAudioFailure();
      showToast('这条自然语音尚未就绪。');
      return;
    }
    startAudioPlayback(source + '?v=' + encodeURIComponent(AUDIO_ASSET_VERSION), button, 1, {
      sessionToken: session.token,
      taskState: session.taskState,
      wordId: word.id,
      rescueBlind: !reveal,
    });
  }

  function unlockRescueAnswerControls(button) {
    if (!session || session.type !== 'rescue' || currentRescueTask().gate !== 'listenForm') return;
    if (!button || !button.matches('[data-rescue-play]')) return;
    session.taskState.rescueAudioReady = true;
    session.taskState.rescueAudioFailed = false;
    main
      .querySelectorAll('[data-rescue-answer-controls], [data-rescue-primary-action]')
      .forEach(function (control) {
        control.disabled = false;
      });
    var input = document.getElementById('rescueListenInput');
    if (input) input.focus({ preventScroll: true });
  }

  function lockRescueAudioFailure() {
    if (!session || session.type !== 'rescue') return;
    session.taskState.rescueAudioFailed = true;
    session.taskState.rescueAudioReady = false;
    main
      .querySelectorAll('[data-rescue-answer-controls], [data-rescue-primary-action]')
      .forEach(function (control) {
        control.disabled = true;
      });
    var feedback = main.querySelector('[data-rescue-feedback]');
    if (feedback) feedback.textContent = '音频未成功播放，本题不会开放作答。你可以重试或先跳过。';
  }

  function startAudioPlayback(source, button, rate, adaptiveEvidence) {
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
    var adaptivePlaybackCounted = false;

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
      if (adaptiveEvidence && adaptiveEvidence.rescueBlind) lockRescueAudioFailure();
      if (adaptiveEvidence && adaptiveEvidence.dualBlind) lockDualSpellAudioFailure();
      if (adaptiveEvidence && adaptiveEvidence.syllableTutorial) {
        lockSyllableTutorialAudioFailure();
      }
      showToast('自然语音加载失败，请检查网络后重试。');
    };

    audio.addEventListener('playing', function () {
      if (!isCurrent() || playbackDesired !== 'playing') return;
      clearTimeout(playbackTimer);
      playbackStatus = 'playing';
      updatePlaybackButton(button, 'playing');
      updatePlaybackMessage(button, 'playing');
      if (
        !adaptivePlaybackCounted &&
        adaptiveEvidence &&
        session &&
        session.token === adaptiveEvidence.sessionToken &&
        session.taskState === adaptiveEvidence.taskState &&
        currentWord() &&
        currentWord().id === adaptiveEvidence.wordId
      ) {
        adaptivePlaybackCounted = true;
        session.taskState.audioPlays = Math.max(0, Number(session.taskState.audioPlays || 0)) + 1;
        startTaskActivity();
      }
      unlockSoundPrecheck(button);
      if (adaptiveEvidence && adaptiveEvidence.rescueBlind) unlockRescueAnswerControls(button);
      if (adaptiveEvidence && adaptiveEvidence.dualBlind) unlockDualSpellControls();
      if (adaptiveEvidence && adaptiveEvidence.syllableTutorial) {
        unlockSyllableTutorialAnswers(button);
      }
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
    armPlaybackTimeout(token, audio, button, adaptiveEvidence);
    audio.play().catch(fail);
  }

  function playExample(button) {
    if (!session) return;
    var accent = button.dataset.accent || state.settings.accent;
    updateDisplayedAccent(currentWord(), accent);
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
    armPlaybackTimeout(token, audio, button, {
      rescueBlind: Boolean(button && button.matches('[data-rescue-play]')),
      dualBlind: Boolean(button && button.matches('[data-dual-spell-audio]')),
      syllableTutorial: Boolean(button && button.matches('[data-syllable-quiz-audio]')),
    });
    audio.play().catch(function (error) {
      if (playbackToken !== token || currentAudio !== audio || playingButton !== button) return;
      if (error && error.name === 'AbortError') return;
      if (button && button.matches('[data-rescue-play]')) lockRescueAudioFailure();
      if (button && button.matches('[data-dual-spell-audio]')) lockDualSpellAudioFailure();
      if (button && button.matches('[data-syllable-quiz-audio]')) {
        lockSyllableTutorialAudioFailure();
      }
      stopAudio();
      updatePlaybackMessage(button, 'error');
      showToast('自然语音无法继续播放，请重新点击播放。');
    });
    return true;
  }

  function armPlaybackTimeout(token, audio, button, adaptiveEvidence) {
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
      if (adaptiveEvidence && adaptiveEvidence.rescueBlind) lockRescueAudioFailure();
      if (adaptiveEvidence && adaptiveEvidence.dualBlind) lockDualSpellAudioFailure();
      if (adaptiveEvidence && adaptiveEvidence.syllableTutorial) {
        lockSyllableTutorialAudioFailure();
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
    if (recordRequestPending) return;
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      if (dualPrototypeState && dualPrototypeState.step === 'read-record') {
        markDualTechnicalFailure('当前浏览器未检测到录音能力。本项不判错，可跳过。');
      } else {
        showToast('当前浏览器不支持本地录音；听音和其余训练仍可使用。');
      }
      return;
    }
    var requestToken = ++recordingToken;
    var requestedDualRunId =
      dualPrototypeState && dualPrototypeState.step === 'read-record'
        ? dualPrototypeState.runId
        : '';
    var requestedDualIndex = dualPrototypeState ? dualPrototypeState.index : -1;
    var requestedSessionToken = session ? session.token : '';
    var requestedStream = null;
    try {
      recordRequestPending = true;
      button.disabled = true;
      revokeRecording();
      recordingTechnicalFailure = false;
      requestedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var dualRequestStillCurrent = Boolean(
        requestedDualRunId &&
        dualPrototypeState &&
        currentView === 'dual-prototype' &&
        dualPrototypeState.runId === requestedDualRunId &&
        dualPrototypeState.index === requestedDualIndex &&
        dualPrototypeState.step === 'read-record',
      );
      var coreRequestStillCurrent = Boolean(
        !requestedDualRunId &&
        session &&
        session.token === requestedSessionToken &&
        currentSkill() === 'sound',
      );
      if (
        requestToken !== recordingToken ||
        (!dualRequestStillCurrent && !coreRequestStillCurrent)
      ) {
        requestedStream.getTracks().forEach(function (track) {
          track.stop();
        });
        return;
      }
      var localChunks = [];
      var localRecorder = new MediaRecorder(requestedStream);
      var localStartedAt = Date.now();
      recordStream = requestedStream;
      recordChunks = localChunks;
      recorder = localRecorder;
      localRecorder.addEventListener('dataavailable', function (event) {
        if (requestToken === recordingToken && event.data.size) localChunks.push(event.data);
      });
      localRecorder.addEventListener(
        'error',
        function () {
          if (requestToken !== recordingToken || recorder !== localRecorder) return;
          recordingTechnicalFailure = true;
          clearTimeout(recordTimer);
          requestedStream.getTracks().forEach(function (track) {
            track.stop();
          });
          if (recordStream === requestedStream) {
            recordStream = null;
          }
          if (
            dualPrototypeState &&
            dualPrototypeState.runId === requestedDualRunId &&
            dualPrototypeState.index === requestedDualIndex &&
            dualPrototypeState.step === 'read-record'
          ) {
            markDualTechnicalFailure('录音设备在处理中断。本项不会判错，可重试或跳过。');
          } else if (session && session.token === requestedSessionToken) {
            showToast('录音设备在处理中断，请重新录音。');
          }
        },
        { once: true },
      );
      localRecorder.addEventListener(
        'stop',
        function () {
          finishRecording(
            requestToken,
            localRecorder,
            requestedStream,
            localChunks,
            localStartedAt,
          );
        },
        { once: true },
      );
      localRecorder.start();
      recordStartedAt = localStartedAt;
      button.textContent = '■ 停止录音';
      button.classList.add('recording-state');
      button.disabled = false;
      var status = document.getElementById('recordStatus');
      if (status) status.textContent = '正在录音… 最多 8 秒，只保留在当前页面。';
      clearTimeout(recordTimer);
      recordTimer = setTimeout(function () {
        if (
          requestToken === recordingToken &&
          recorder === localRecorder &&
          localRecorder.state === 'recording'
        ) {
          localRecorder.stop();
        }
      }, 8000);
    } catch (error) {
      if (requestedStream) {
        requestedStream.getTracks().forEach(function (track) {
          track.stop();
        });
      }
      if (requestToken !== recordingToken) return;
      recordingTechnicalFailure = false;
      if (dualPrototypeState && dualPrototypeState.step === 'read-record') {
        markDualTechnicalFailure('麦克风未授权。本项不会判错，可重试或跳过。');
      } else {
        showToast('未获得麦克风权限。你仍可继续听音、拼写和词形训练。');
      }
    } finally {
      if (requestToken === recordingToken) {
        recordRequestPending = false;
        if (button && button.isConnected) button.disabled = false;
      }
    }
  }

  function finishRecording(token, finishedRecorder, finishedStream, finishedChunks, startedAt) {
    if (token !== recordingToken || recorder !== finishedRecorder) {
      finishedStream.getTracks().forEach(function (track) {
        track.stop();
      });
      return;
    }
    clearTimeout(recordTimer);
    var isDualRead = Boolean(
      dualPrototypeState &&
      currentView === 'dual-prototype' &&
      dualPrototypeState.step === 'read-record',
    );
    if (recordingTechnicalFailure) {
      recordingTechnicalFailure = false;
      finishedStream.getTracks().forEach(function (track) {
        track.stop();
      });
      if (recordStream === finishedStream) recordStream = null;
      recordChunks = [];
      recorder = null;
      recordStartedAt = 0;
      return;
    }
    if ((!session || currentSkill() !== 'sound') && !isDualRead) {
      finishedStream.getTracks().forEach(function (track) {
        track.stop();
      });
      if (recordStream === finishedStream) recordStream = null;
      recordChunks = [];
      recorder = null;
      return;
    }
    var elapsed = Math.max(0, Date.now() - startedAt);
    var type = finishedRecorder.mimeType || 'audio/webm';
    var blob = new Blob(finishedChunks, { type: type });
    finishedStream.getTracks().forEach(function (track) {
      track.stop();
    });
    if (recordStream === finishedStream) recordStream = null;
    if (isDualRead && (elapsed < 450 || blob.size < 100)) {
      recordChunks = [];
      recorder = null;
      recordStartedAt = 0;
      dualPrototypeState.task.error = '录音太短，没有形成可核对的朗读。请完整读一遍。';
      persistDualPrototypeProgress();
      renderDualPrototype();
      return;
    }
    recordUrl = URL.createObjectURL(blob);
    if (isDualRead) {
      recorder = null;
      recordStartedAt = 0;
      dualPrototypeState.step = 'read-compare';
      persistDualPrototypeProgress();
      renderDualPrototype();
      return;
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
    recordStartedAt = 0;
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
    recordingToken += 1;
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
    recordRequestPending = false;
    recordingTechnicalFailure = false;
    recordStartedAt = 0;
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
    form.elements.learningGoal.value = normaliseLearningGoal(state.settings.learningGoal);
    settingsDialog.showModal();
  }

  function saveSettings() {
    var form = document.getElementById('settingsForm');
    state.settings.accent = form.elements.accent.value === 'us' ? 'us' : 'uk';
    var nextDailyNew = normaliseDailyNew(form.elements.dailyNew.value);
    if (
      nextDailyNew !== state.settings.dailyNew &&
      state.daily.date === localDateKey() &&
      !state.daily.newIds.some(function (id) {
        return hasAnyAttempt(id);
      })
    ) {
      state.daily.newIds = [];
      state.daily.newSelectionDone = false;
    }
    state.settings.dailyNew = nextDailyNew;
    state.settings.learningGoal = normaliseLearningGoal(form.elements.learningGoal.value);
    saveState();
    settingsDialog.close();
    showToast('训练设置已保存。');
    if (currentView === 'today') renderToday();
  }

  function exportData() {
    var payload = {
      app: 'WordLab',
      version: STATE_VERSION,
      exportedAt: new Date().toISOString(),
      state: state,
      visualState: visualState,
      hardWordPracticeState: hardWordPracticeState,
      hardWordSoundFormState: hardWordSoundFormState,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'wordlab-progress-' + new Date().toISOString().slice(0, 10) + '.json';
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
      if (!payload || ['WordLab', 'WordLab 50'].indexOf(payload.app) < 0 || !payload.state) {
        throw new Error('Invalid WordLab export');
      }
      var importedState = normaliseState(payload.state);
      var importedVisualState = normaliseVisualState(payload.visualState);
      var importedHardWordPracticeState = payload.hardWordPracticeState
        ? loadHardWordPracticeState(payload.hardWordPracticeState)
        : hardWordPracticeState;
      var importedHardWordsCatalog = hardWordsCatalog;
      if (
        payload.hardWordSoundFormState &&
        (!importedHardWordsCatalog || importedHardWordsCatalog.entries.length !== 751)
      ) {
        importedHardWordsCatalog = await fetchHardWordsCatalog('no-cache');
        validateHardWordsCatalog(importedHardWordsCatalog);
      }
      var importedSoundFormState = payload.hardWordSoundFormState
        ? validateImportedHardWordSoundFormState(
            payload.hardWordSoundFormState,
            importedHardWordsCatalog,
          )
        : defaultHardWordSoundFormState();
      if (payload.hardWordSoundFormState) {
        if (
          !importedHardWordsCatalog ||
          importedHardWordsCatalog.entries.length !== 751 ||
          (importedSoundFormState.active === null && payload.hardWordSoundFormState.active)
        ) {
          throw new Error('Invalid hard-word sound-form state');
        }
        var validSoundIds = new Set(
          importedHardWordsCatalog.entries.map(function (entry) {
            return entry.id;
          }),
        );
        var importedSoundIds = Object.keys(importedSoundFormState.entries).concat(
          importedSoundFormState.journal.map(function (item) {
            return item.wordId;
          }),
          importedSoundFormState.active
            ? importedSoundFormState.active.queue.map(function (item) {
                return item.wordId;
              })
            : [],
        );
        if (
          importedSoundIds.some(function (wordId) {
            return !validSoundIds.has(wordId);
          })
        ) {
          throw new Error('Unknown hard-word sound-form entry');
        }
      }
      state = importedState;
      visualState = importedVisualState;
      hardWordPracticeState = importedHardWordPracticeState;
      hardWordSoundFormState = importedSoundFormState;
      dualPrototypeState = null;
      visualRuntime = defaultVisualRuntime();
      if (!hardWordsCatalog && importedHardWordsCatalog) {
        hardWordsCatalog = importedHardWordsCatalog;
        hardWordsCatalog.entries.forEach(function (entry) {
          entry._searchText = normaliseAnswer(
            String(entry.displayWord || '') + ' ' + String(entry.normalizedHeadword || ''),
          );
        });
        hardWordsLoadState = 'ready';
        hardWordsLoadError = '';
      }
      saveState();
      saveVisualState();
      saveHardWordPracticeState();
      saveHardWordSoundFormState();
      showToast('词汇与图像课程进度已导入。');
      renderProgress();
    } catch (error) {
      showToast('导入失败：请选择由 WordLab 导出的 JSON 文件。');
    }
  }

  function resetData() {
    if (!window.confirm('确定清空这台设备上的 WordLab 练习记录吗？此操作无法撤销。')) {
      return;
    }
    state = defaultState();
    visualState = defaultVisualState();
    visualRuntime = defaultVisualRuntime();
    hardWordPracticeState = defaultHardWordPracticeState();
    hardWordSoundFormState = defaultHardWordSoundFormState();
    dualPrototypeState = null;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VISUAL_STORAGE_KEY);
    localStorage.removeItem(HARD_WORD_PRACTICE_STORAGE_KEY);
    localStorage.removeItem(HARD_WORD_SOUND_FORM_STORAGE_KEY);
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

  function normaliseRequiredPos(value) {
    var text = String(value || '')
      .trim()
      .toLowerCase();
    if (/^(n\.|noun)/.test(text)) return 'n.';
    if (/^(v\.|verb|past v\.)/.test(text)) return 'v.';
    if (/^(adj\.|adjective)/.test(text)) return 'adj.';
    if (/^(adv\.|adverb)/.test(text)) return 'adv.';
    return text;
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
