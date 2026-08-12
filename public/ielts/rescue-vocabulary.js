(function () {
  'use strict';

  // A deliberately small, source-audited rescue set. The learner difficulty
  // codes route practice only: 1 = pronunciation, 2 = meaning, 3 = both.
  // They are not mastery claims. Source senses stay narrow until the original
  // listening sentence is available.
  var batch = [
    {
      id: 'controversial',
      word: 'controversial',
      difficulty: 1,
      round: 1,
      ipaUk: '/ˌkɒn.trəˈvɜː.ʃəl/',
      ipaUs: '/ˌkɑːn.trəˈvɝː.ʃəl/',
      blocks: ['con', 'tro', 'VER', 'sial'],
      stress: 2,
      secondaryStress: [0],
      blockType: 'pronunciation_chunks',
      decodeTask: {
        kind: 'grapheme_sound',
        prompt: '词尾 -sial 对应哪个音？',
        choices: ['/\u0283\u0259l/', '/si\u02d0\u0259l/', '/sa\u026a\u0259l/'],
        answerIndex: 0,
      },
      pos: 'adj.',
      zh: '有争议的；引发分歧的',
      collocation: 'a controversial issue',
      meaningTask: {
        prompt: '新规则让公众意见分裂，并引发激烈辩论。这条规则是……',
        choices: ['有争议的', '普通的', '私人的'],
        answer: '有争议的',
      },
      senseStatus: 'locked_core_sense',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/controversial',
        'https://www.oxfordlearnersdictionaries.com/definition/english/controversial',
      ],
      chunks: ['The proposal', 'became', 'a controversial issue', 'in the town', '.'],
    },
    {
      id: 'fountain',
      word: 'fountain',
      difficulty: 1,
      round: 1,
      ipaUk: '/ˈfaʊn.tɪn/',
      ipaUs: '/ˈfaʊn.tən/',
      blocks: ['FOUN', 'tain'],
      stress: 0,
      blockType: 'pronunciation_chunks',
      decodeTask: {
        kind: 'grapheme_sound',
        prompt: '开头 foun- 对应哪个音？',
        choices: ['/fa\u028an/', '/f\u0259\u028an/', '/f\u0254\u02d0n/'],
        answerIndex: 0,
      },
      pos: 'n. [C]',
      zh: '喷泉',
      collocation: 'a decorative fountain',
      meaningTask: {
        prompt: '广场上，水从一座装饰性设施中向上喷出。它是……',
        choices: ['喷泉', '隧道', '证书'],
        answer: '喷泉',
      },
      senseStatus: 'locked_core_sense',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/fountain',
        'https://www.oxfordlearnersdictionaries.com/definition/english/fountain',
      ],
      chunks: ['Water', 'rose from', 'the decorative fountain', 'in the square', '.'],
    },
    {
      id: 'pronunciation',
      word: 'pronunciation',
      difficulty: 2,
      round: 1,
      ipaUk: '/prəˌnʌn.siˈeɪ.ʃən/',
      ipaUs: '/prəˌnʌn.siˈeɪ.ʃən/',
      blocks: ['pro', 'nun', 'ci', 'A', 'tion'],
      stress: 3,
      secondaryStress: [1],
      blockType: 'pronunciation_chunks',
      pos: 'n. [C/U]',
      zh: '发音；读音',
      collocation: 'correct pronunciation',
      meaningTask: {
        prompt: '老师纠正了 Mia 说某个单词的方式。老师纠正的是她的……',
        choices: ['发音', '标点', '书写'],
        answer: '发音',
      },
      senseStatus: 'locked_core_sense',
      spellingWarning: 'pronunciation，不是 pronounciation',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/pronunciation',
        'https://www.oxfordlearnersdictionaries.com/definition/english/pronunciation',
      ],
      chunks: ['The teacher', 'helped Mia improve', 'her pronunciation', 'of the word', '.'],
    },
    {
      id: 'instant',
      word: 'instant',
      difficulty: 2,
      round: 1,
      ipaUk: '/ˈɪn.stənt/',
      ipaUs: '/ˈɪn.stənt/',
      blocks: ['IN', 'stant'],
      stress: 0,
      blockType: 'pronunciation_chunks',
      pos: 'adj. / n.',
      zh: '原句缺失，词义待确认',
      collocation: 'instant access / instant coffee / in an instant',
      meaningTask: {
        prompt: '原听力句缺失；先标记你当时听到的搭配或语境。',
        choices: ['记得前后词', '记得大致场景', '能补回原句', '我不确定'],
        answer: null,
        masteryEligible: false,
        unscored: true,
      },
      senseStatus: 'pending_context',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/instant',
        'https://www.oxfordlearnersdictionaries.com/definition/english/instant_1',
      ],
      chunks: [
        'We need',
        'the original sentence',
        'before choosing the intended sense',
        'of instant',
        '.',
      ],
    },
    {
      id: 'certificate',
      word: 'certificate',
      difficulty: 3,
      round: 1,
      ipaUk: '/səˈtɪf.ɪ.kət/',
      ipaUs: '/sɚˈtɪf.ə.kət/',
      blocks: ['cer', 'TIF', 'i', 'cate'],
      stress: 1,
      blockType: 'pronunciation_chunks',
      pos: 'n. [C]',
      zh: '证书；证明文件',
      collocation: 'a birth certificate',
      meaningTask: {
        prompt: '她出示了一份记录自己出生信息的正式文件。这是……',
        choices: ['出生证明', '收据', '邀请函'],
        answer: '出生证明',
      },
      senseStatus: 'locked_noun_sense',
      senseId: 'certificate-noun-official-document',
      pronunciationNote: '名词词尾读 /ət/；本轮不使用动词读音 /eɪt/。',
      decodeTask: {
        kind: 'noun_ending',
        prompt: '作为名词时，词尾 -cate 读什么？',
        choices: ['/kət/', '/keɪt/', '/sət/'],
        answerIndex: 0,
      },
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/certificate',
        'https://www.oxfordlearnersdictionaries.com/definition/english/certificate_1',
      ],
      chunks: ['She', 'showed', 'her birth certificate', 'at the office', '.'],
    },
    {
      id: 'squeeze',
      word: 'squeeze',
      difficulty: 3,
      round: 1,
      ipaUk: '/skwiːz/',
      ipaUs: '/skwiːz/',
      blocks: ['squ', 'ee', 'ze'],
      stress: 0,
      blockType: 'spelling_blocks',
      decodeTask: {
        kind: 'grapheme_sound',
        prompt: '单词中的 /iː/ 由哪个拼写块表示？',
        choices: ['squ', 'ee', 'ze'],
        answerIndex: 1,
      },
      pos: 'v. [T]',
      zh: '挤压；挤出液体',
      collocation: 'squeeze the juice',
      meaningTask: {
        prompt: '为了让柠檬汁流进碗里，你需要怎样做？',
        choices: ['挤压柠檬', '冷冻柠檬', '只削外皮'],
        answer: '挤压柠檬',
      },
      senseStatus: 'locked_core_sense',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/squeeze',
        'https://www.oxfordlearnersdictionaries.com/definition/english/squeeze_1',
      ],
      chunks: ['Squeeze', 'the juice', 'from the lemon', 'into the bowl', '.'],
    },
    {
      id: 'botanical',
      word: 'botanical',
      difficulty: 1,
      round: 2,
      ipaUk: '/bəˈtæn.ɪ.kəl/',
      ipaUs: '/bəˈtæn.ɪ.kəl/',
      blocks: ['bo', 'TAN', 'i', 'cal'],
      stress: 1,
      blockType: 'pronunciation_chunks',
      decodeTask: {
        kind: 'grapheme_sound',
        prompt: '重读块 -tan- 对应哪个音？',
        choices: ['/t\u00e6n/', '/te\u026an/', '/t\u0251\u02d0n/'],
        answerIndex: 0,
      },
      pos: 'adj.',
      zh: '植物的；植物学的',
      collocation: 'a botanical garden',
      meaningTask: {
        prompt: '这门课研究罕见植物，因此它的内容是……',
        choices: ['植物学的', '地质学的', '天文学的'],
        answer: '植物学的',
      },
      senseStatus: 'locked_core_sense',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/botanical',
        'https://www.oxfordlearnersdictionaries.com/definition/english/botanical',
      ],
      chunks: ['The class', 'studied rare plants', 'in the botanical garden', '.'],
    },
    {
      id: 'ridiculous',
      word: 'ridiculous',
      difficulty: 1,
      round: 2,
      ipaUk: '/rɪˈdɪk.jə.ləs/',
      ipaUs: '/rɪˈdɪk.jə.ləs/',
      blocks: ['ri', 'DIC', 'u', 'lous'],
      stress: 1,
      blockType: 'pronunciation_chunks',
      decodeTask: {
        kind: 'grapheme_sound',
        prompt: '重读块 -dic- 对应哪个音？',
        choices: ['/d\u026ak/', '/da\u026as/', '/di\u02d0s/'],
        answerIndex: 0,
      },
      pos: 'adj.',
      zh: '荒谬的；可笑的',
      collocation: 'a ridiculous idea',
      meaningTask: {
        prompt: '花大价钱买一个空瓶子极不合理。这个主意很……',
        choices: ['荒谬的', '实用的', '常规的'],
        answer: '荒谬的',
      },
      senseStatus: 'locked_core_sense',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/ridiculous',
        'https://www.oxfordlearnersdictionaries.com/definition/english/ridiculous',
      ],
      chunks: ['Paying so much', 'for an empty bottle', 'seemed ridiculous', '.'],
    },
    {
      id: 'alcohol',
      word: 'alcohol',
      difficulty: 1,
      round: 2,
      ipaUk: '/ˈæl.kə.hɒl/',
      ipaUs: '/ˈæl.kə.hɔːl/',
      blocks: ['AL', 'co', 'hol'],
      stress: 0,
      blockType: 'pronunciation_chunks',
      decodeTask: {
        kind: 'grapheme_sound',
        prompt: '开头 al- 对应哪个音？',
        choices: ['/\u00e6l/', '/e\u026al/', '/\u0254\u02d0l/'],
        answerIndex: 0,
      },
      pos: 'n. [U]',
      zh: '酒；酒精',
      collocation: 'alcohol consumption',
      meaningTask: {
        prompt: '医生建议他减少啤酒、红酒等饮品的摄入。他要减少的是……',
        choices: ['酒精', '蛋白质', '水分'],
        answer: '酒精',
      },
      senseStatus: 'locked_core_sense',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/alcohol',
        'https://www.oxfordlearnersdictionaries.com/definition/english/alcohol',
      ],
      chunks: ['The doctor', 'advised him to reduce', 'his alcohol consumption', '.'],
    },
    {
      id: 'architecture',
      word: 'architecture',
      difficulty: 2,
      round: 2,
      ipaUk: '/ˈɑː.kɪ.tek.tʃə/',
      ipaUs: '/ˈɑːr.kɪ.tek.tʃɚ/',
      blocks: ['AR', 'chi', 'tec', 'ture'],
      stress: 0,
      blockType: 'pronunciation_chunks',
      pos: 'n. [U]',
      zh: '建筑学；建筑设计',
      collocation: 'study architecture',
      meaningTask: {
        prompt: '她想学习如何设计建筑物。她打算学习……',
        choices: ['建筑学', '考古学', '农业'],
        answer: '建筑学',
      },
      senseStatus: 'locked_core_sense',
      pronunciationNote: 'ch 在这里读 /k/。',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/architecture',
        'https://www.oxfordlearnersdictionaries.com/definition/english/architecture',
      ],
      chunks: ['She', 'hopes to study', 'architecture', 'at university', '.'],
    },
    {
      id: 'distinguish',
      word: 'distinguish',
      difficulty: 3,
      round: 2,
      ipaUk: '/dɪˈstɪŋ.ɡwɪʃ/',
      ipaUs: '/dɪˈstɪŋ.ɡwɪʃ/',
      blocks: ['di', 'STIN', 'guish'],
      stress: 1,
      blockType: 'pronunciation_chunks',
      decodeTask: {
        kind: 'grapheme_sound',
        prompt: '词尾 -guish 对应哪个音？',
        choices: ['/\u0261w\u026a\u0283/', '/\u0261\u026a\u0283/', '/\u0261a\u026a\u0283/'],
        answerIndex: 0,
      },
      pos: 'v.',
      zh: '区分；辨别',
      collocation: 'distinguish between A and B',
      meaningTask: {
        prompt: '两个声音很相似，但你仍需要听出它们的不同。你需要……',
        choices: ['区分它们', '重复它们', '忽略它们'],
        answer: '区分它们',
      },
      senseStatus: 'locked_core_sense',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/distinguish',
        'https://www.oxfordlearnersdictionaries.com/definition/english/distinguish',
      ],
      chunks: ['Can you', 'distinguish between', 'the two similar sounds', '?'],
    },
    {
      id: 'sculpture',
      word: 'sculpture',
      difficulty: 3,
      round: 2,
      ipaUk: '/ˈskʌlp.tʃə/',
      ipaUs: '/ˈskʌlp.tʃɚ/',
      blocks: ['SCULP', 'ture'],
      stress: 0,
      blockType: 'pronunciation_chunks',
      decodeTask: {
        kind: 'grapheme_sound',
        prompt: '开头 sculp- 对应哪个音？',
        choices: ['/sk\u028clp/', '/sku\u02d0lp/', '/s\u028clp/'],
        answerIndex: 0,
      },
      pos: 'n. [C]',
      zh: '雕塑；雕刻品',
      collocation: 'a bronze sculpture',
      meaningTask: {
        prompt: '广场中央立着一件用青铜制成的立体艺术品。它是……',
        choices: ['雕塑', '壁画', '乐谱'],
        answer: '雕塑',
      },
      senseStatus: 'locked_core_sense',
      senseId: 'sculpture-noun-three-dimensional-artwork',
      sourceUrls: [
        'https://dictionary.cambridge.org/dictionary/english/sculpture',
        'https://www.oxfordlearnersdictionaries.com/definition/english/sculpture',
      ],
      chunks: ['A bronze sculpture', 'stood', 'in the centre', 'of the square', '.'],
    },
  ];

  var voices = {
    uk: 'en-GB-SoniaNeural',
    us: 'en-US-AvaNeural',
  };

  batch.forEach(function (entry) {
    var needs = [];
    if (entry.difficulty === 1 || entry.difficulty === 3) needs.push('pronunciation');
    if (entry.difficulty === 2 || entry.difficulty === 3) needs.push('meaning');
    entry.reportedUnknownCode = entry.difficulty;
    entry.reportedNeeds = needs;
    entry.editorialStatus =
      entry.senseStatus === 'pending_context'
        ? 'verified_pronunciation_pending_sense'
        : 'verified_for_mvp';
    if (typeof entry.meaningTask.masteryEligible !== 'boolean') {
      entry.meaningTask.masteryEligible = true;
    }
    if (!entry.decodeTask) {
      entry.decodeTask = {
        kind: 'primary_stress',
        prompt: '主重音落在哪个读音块？',
        choices: entry.blocks.map(function (block) {
          return String(block).toLowerCase();
        }),
        answerIndex: entry.stress,
      };
    }
    entry.pronunciation = {
      blockType: entry.blockType,
      blocks: entry.blocks.slice(),
      primaryStressIndex: entry.stress,
      secondaryStressIndices: (entry.secondaryStress || []).slice(),
      uk: {
        ipa: entry.ipaUk,
        text: entry.word,
        voice: voices.uk,
        wordAudio: './audio/uk/' + entry.id + '.mp3',
        sentenceAudio: './audio/uk/' + entry.id + '_sentence.mp3',
      },
      us: {
        ipa: entry.ipaUs,
        text: entry.word,
        voice: voices.us,
        wordAudio: './audio/us/' + entry.id + '.mp3',
        sentenceAudio: './audio/us/' + entry.id + '_sentence.mp3',
      },
    };
    entry.audio = {
      uk: entry.pronunciation.uk,
      us: entry.pronunciation.us,
    };
  });

  window.IELTS_RESCUE_VOCABULARY = batch;
})();
