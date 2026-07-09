/* AI-authored exam-style question bank (Shenzhen 初中/中考 style).
   Original items written to match 沪教版 vocabulary; not copied from real exams.
   kinds: mcq (单项选择), fill (词形变化/语法填空), passage (完形填空), reading (阅读理解)
   Each item tags words[] so results feed the per-word mastery engine. */
window.BANK = {
 version: 1,
 items: [
  /* ---------- Unit 1 · 单项选择 ---------- */
  {id:"u1-mc-1", unit:1, cat:"单项选择", kind:"mcq", words:["talented"],
   stem:"— Who is the girl over there?<br>— She is a very ___ painter. Her works are shown in many museums.",
   options:["talented","tired","tiny","terrible"], answer:0,
   explain:"talented 有才能的。由“作品在博物馆展出”可知她很有才华。"},
  {id:"u1-mc-2", unit:1, cat:"单项选择", kind:"mcq", words:["intelligent"],
   stem:"Leonardo da Vinci was so ___ that he was good at both art and science.",
   options:["intelligent","boring","lazy","careless"], answer:0,
   explain:"intelligent 聪明的，与“艺术和科学都擅长”相符。"},
  {id:"u1-mc-3", unit:1, cat:"单项选择", kind:"mcq", words:["die out"],
   stem:"Many kinds of dinosaurs ___ millions of years ago, and we can only see them in books now.",
   options:["died out","put on","looked after","got up"], answer:0,
   explain:"die out 灭绝；millions of years ago 用一般过去时 died out。"},
  {id:"u1-mc-4", unit:1, cat:"单项选择", kind:"mcq", words:["perhaps"],
   stem:"— Will Tom come to the art show this weekend?<br>— ___. He hasn't decided yet.",
   options:["Perhaps","Never","Sorry","Certainly not"], answer:0,
   explain:"perhaps 也许，表示不确定，与“还没决定”相符。"},
  {id:"u1-mc-5", unit:1, cat:"单项选择", kind:"mcq", words:["piece"],
   stem:"He played a beautiful ___ of music on the piano at the school show.",
   options:["piece","group","pair","pile"], answer:0,
   explain:"a piece of music 一首/段乐曲，固定搭配。"},
  {id:"u1-mc-6", unit:1, cat:"单项选择", kind:"mcq", words:["be related to"],
   stem:"In some ways a tiger ___ a cat, because they are in the same family.",
   options:["is related to","is afraid of","is different from","is far from"], answer:0,
   explain:"be related to 与……有关/同类，与 “same family” 相符。"},
  {id:"u1-mc-7", unit:1, cat:"单项选择", kind:"mcq", words:["order"],
   stem:"Before you write the words, please put them in the right ___.",
   options:["order","idea","piece","birth"], answer:0,
   explain:"in the right order 按正确顺序。"},

  /* ---------- Unit 1 · 词形变化（用所给词的适当形式填空） ---------- */
  {id:"u1-gf-1", unit:1, cat:"词形变化", kind:"fill", words:["art"],
   stem:"My cousin is very ___ (art), so she often draws pictures for our school magazine.",
   accept:["artistic"], explain:"be 动词后作表语，用形容词 artistic 有艺术天赋的。"},
  {id:"u1-gf-2", unit:1, cat:"词形变化", kind:"fill", words:["complete"],
   stem:"After the long trip, I was ___ (complete) tired and fell asleep at once.",
   accept:["completely"], explain:"修饰形容词 tired，用副词 completely。"},
  {id:"u1-gf-3", unit:1, cat:"词形变化", kind:"fill", words:["organize"],
   stem:"The teacher asked us to ___ (organization) the books in alphabetical order.",
   accept:["organize","organise"], explain:"情态动词/to 后用动词原形 organize（英式 organise）。"},
  {id:"u1-gf-4", unit:1, cat:"词形变化", kind:"fill", words:["die"],
   stem:"People often wonder why the dinosaurs ___ (die) out so long ago.",
   accept:["died"], explain:"so long ago 表过去，用一般过去时 died。"},
  {id:"u1-gf-5", unit:1, cat:"词形变化", kind:"fill", words:["suffering"],
   stem:"The book tells us about the ___ (suffer) of people during the war.",
   accept:["suffering"], explain:"the 后作名词，用 suffering 苦难。"},

  /* ---------- Unit 1 · 完形填空（原创短文，6空） ---------- */
  {id:"u1-cloze-1", unit:1, cat:"完形填空", kind:"passage",
   words:["artist","whole","original","record","notebook","piece"],
   passage:"Vincent van Gogh was a great [1]. He loved painting so much that he spent his [2] life making pictures. Today his [3] paintings, not copies, are worth a lot of money. Van Gogh often kept a small [4] with him. In it he would [5] his new ideas and make quick drawings. Each finished [6] of work shows his deep love for colour and life.",
   blanks:[
     {options:["artist","editor","soldier","captain"], answer:0, words:["artist"]},
     {options:["whole","empty","free","busy"], answer:0, words:["whole"]},
     {options:["original","boring","weak","silver"], answer:0, words:["original"]},
     {options:["notebook","chessboard","balloon","fork"], answer:0, words:["notebook"]},
     {options:["record","forget","hide","fail"], answer:0, words:["record"]},
     {options:["piece","type","pair","group"], answer:0, words:["piece"]}
   ],
   explain:"短文讲梵高：伟大的画家(artist)、用一生(whole)作画、原作(original)、随身笔记本(notebook)、记录(record)想法、每件(piece)作品。"},

  /* ---------- Unit 1 · 阅读理解（原创短文，3题） ---------- */
  {id:"u1-read-1", unit:1, cat:"阅读理解", kind:"reading",
   words:["talented","artist","original","piece"],
   passage:"Zhang Mei is a Grade 8 student, but she is already a talented young artist. She started drawing when she was only four. Now she draws almost every day after school. Her art teacher says Zhang Mei never copies other people's pictures; all of her works are original. Last month, one of her paintings, a piece called \"My Grandmother's Garden\", won first prize in a city art show. Many people were surprised to learn that the painter was just a young girl. Zhang Mei says she wants to be a real artist one day and show her paintings all over the world.",
   questions:[
     {stem:"When did Zhang Mei start drawing?", options:["When she was four.","When she was eight.","Last month.","After the art show."], answer:0},
     {stem:"The word “original” in the passage means her works are ___.", options:["copied from others","her own new ideas","about gardens only","drawn by her teacher"], answer:1},
     {stem:"Which of the following is TRUE?", options:["Zhang Mei only draws on weekends.","Her painting won first prize in a city art show.","She wants to be a science teacher.","She copies other painters' works."], answer:1}
   ],
   explain:"细节题看第一句“when she was only four”；词义题 original=她自己的原创；判断题对应获奖句。"}
 ]
};
