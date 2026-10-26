/* ============================================================
 * 拾词 · 词库数据文件
 * ------------------------------------------------------------
 * 所有单词按「组」组织，每组 20 个词，是一个独立记忆单元。
 * 主人以后把生词发给助手，助手按下面的格式追加进 GROUPS
 * 数组即可，网页会自动读取，无需改动其他任何文件。
 *
 * 字段说明（每个 word 对象）：
 *   word         必填  单词本身
 *   phoneticUs   必填  美式音标（不含方括号，页面会自动加 [ ]）
 *   phoneticUk   必填  英式音标
 *   definition   必填  词性 + 中文释义，可多个义项用「；」分隔
 *   examples     必填  例句数组，每条 { en: 英文, zh: 中文翻译 }
 *   usage        必填  用法说明（语法特点、常作表语/定语、常见句型等）
 *   confusables  必填  近形词数组，每条 { word, note }（note 写辨析）
 *   synonyms     必填  近义词数组，每条 { word, note }（note 写辨析）
 *   collocations 必填  常用词组搭配数组（字符串，可带中文释义）
 *   mnemonic     必填  记忆口诀（词根词缀联想 / 谐音 / 场景串记）
 *
 * 数据契约（扩词库前必读）：
 *   - 组的 id 只能用英文字母、数字、下划线、连字符（[A-Za-z0-9_-]），
 *     中文 / 空格 / 点号会导致路由匹配失败、整组无法进入。
 *   - word 字段必填，且同一组内不可重复（进度按「组id:单词」记录，重复会互相覆盖）。
 *   - 各字段尽量填全；缺失的板块会自动隐藏，但学习效果会打折扣。
 *   - 字符串里需要引号时用中文「」，避免与 JS 引号冲突。
 * ============================================================ */

const GROUPS = [
  {
    id: "demo",
    name: "示例组 · 演示格式",
    note: "这是演示数据，等主人把生词发来后会替换成正式的组",
    words: [
      {
        word: "resilient",
        phoneticUs: "rɪˈzɪliənt",
        phoneticUk: "rɪˈzɪliənt",
        definition: "adj. 有弹性的；适应力强的，能快速恢复的",
        examples: [
          { en: "Children are usually very resilient and bounce back quickly.", zh: "孩子们通常适应力很强，能很快恢复过来。" },
          { en: "The economy proved resilient to the external shocks.", zh: "经济对外部冲击表现出很强的韧性。" }
        ],
        usage: "多作表语（be resilient）；修饰人或经济体、材料皆可；常见介词搭配 resilient to sth（对……有抗性、恢复力）。名词形式 resilience（韧性）。",
        confusables: [
          { word: "resistant", note: "adj. 抵抗的、抗拒的（强调「对抗」，如 drug-resistant 耐药）；resilient 强调「被打倒后能弹回来」" },
          { word: "brilliant", note: "adj. 明亮的；杰出的（词形相近，注意首音节）" }
        ],
        synonyms: [
          { word: "tough", note: "强调「坚韧、扛得住」" },
          { word: "adaptable", note: "强调「善于适应变化」" },
          { word: "buoyant", note: "强调「有浮力、乐观上扬」" }
        ],
        collocations: [
          "resilient economy 韧性经济",
          "highly resilient 极具韧性",
          "mentally resilient 心理抗压能力强"
        ],
        mnemonic: "re(回) + sili(跳，词根 sal/sil 表「跳」) + ent(形容词后缀) → 被压弯了还能「跳回来」的 → 有弹性的、恢复力强的。联想：硅谷 Silicon Valley 的人被裁员后 resilience 十足，跳回职场。"
      },
      {
        word: "ambiguous",
        phoneticUs: "æmˈbɪɡjuəs",
        phoneticUk: "æmˈbɪɡjuəs",
        definition: "adj. 模棱两可的，有歧义的；不明确的",
        examples: [
          { en: "His ambiguous reply left us guessing his real intention.", zh: "他模棱两可的回答让我们只能猜测他的真实意图。" },
          { en: "The contract contains several ambiguous clauses.", zh: "这份合同里有几处含义不明确的条款。" }
        ],
        usage: "常修饰 statement / reply / clause / smile 等；be ambiguous about sth（对某事态度含糊）。名词 ambiguity（歧义）。反义词 unambiguous / explicit。",
        confusables: [
          { word: "ambitious", note: "adj. 有雄心的（ambition 雄心），一词之差，考试高频混淆" },
          { word: "ambidextrous", note: "adj. 左右手都灵活的（同样含 ambi-「两」）" }
        ],
        synonyms: [
          { word: "vague", note: "模糊不清（因信息不足）" },
          { word: "obscure", note: "晦涩难懂（因复杂或少见）" },
          { word: "equivocal", note: "故意含糊、可疑的" }
        ],
        collocations: [
          "an ambiguous answer 含糊其辞的回答",
          "ambiguous wording 措辞含糊",
          "legal ambiguity 法律上的歧义"
        ],
        mnemonic: "ambi(两边、双，如 ambulance 来回跑的车) + ig(驱动，ag 的变体) + uous → 把意思「往两边驱赶」→ 两边都说得通 → 模棱两可。口诀：ambi 两边摆，意思猜不透。"
      },
      {
        word: "meticulous",
        phoneticUs: "məˈtɪkjələs",
        phoneticUk: "məˈtɪkjələs",
        definition: "adj. 一丝不苟的，细致入微的；谨小慎微的",
        examples: [
          { en: "She kept meticulous records of every experiment.", zh: "她对每一次实验都做了细致入微的记录。" },
          { en: "The restoration required meticulous attention to detail.", zh: "这项修复工作需要对细节一丝不苟的关注。" }
        ],
        usage: "多修饰人及其工作态度（meticulous planning / preparation / research）；常与介词 in / about 连用（meticulous about hygiene 对卫生一丝不苟）。近义表达 attention to detail。",
        confusables: [
          { word: "suspicious", note: "adj. 怀疑的（词尾同为 -ous，词义完全不同）" },
          { word: "curious", note: "adj. 好奇的（-ous 形容词家族，注意前半部分区分）" }
        ],
        synonyms: [
          { word: "scrupulous", note: "恪守细节、有原则的" },
          { word: "painstaking", note: "下苦功、煞费苦心的" },
          { word: "thorough", note: "全面彻底的（侧重广度）" }
        ],
        collocations: [
          "meticulous attention to detail 对细节的极致关注",
          "meticulous planning 周密的计划",
          "meticulous in one's work 工作一丝不苟"
        ],
        mnemonic: "谐音「没提裤勒死」→ 裤腰带没提好都能被发现的细节控 → 一丝不苟。正经拆：源自拉丁 metus（恐惧），因为怕出错所以每个细节都要检查——怕错，所以细。"
      }
    ]
  }
];

/* 冻结数据，防止运行时被意外修改 */
GROUPS.forEach(g => {
  Object.freeze(g);
  g.words.forEach(w => Object.freeze(w));
  Object.freeze(g.words);
});
Object.freeze(GROUPS);
