/* CognitionScope · js/demo.js —— 示例内容包（v11）
 * 职责：给「空壳」补上一批可浏览、可载入、可清除的真实结构内容，让检索 / 图谱 /
 *       复习 / 要点核验等能力一打开就有东西可看；同时严格不污染个人观测数据。
 *
 * 设计纪律（对应《GitHub 仓库数据借鉴评估》第五节的红线）：
 *   ① 本文件是【纯数据 + 纯逻辑】：零 DOM、零 fetch、零 localStorage、零定时器。
 *   ② 文本 100% 为本项目原创编写，未复制任何外部仓库原文；只借鉴了
 *      「课程 → 章节 → 知识点」层级、要点清单 / 常见错因 / 分层提示的字段结构。
 *      详见根目录 ATTRIBUTION.md。
 *   ③ 默认零写入：不调用本模块 load() 时，L1/L2/导出包与 v10 逐字一致。
 *   ④ 载入是显式动作，条目带 demo:true + demoVersion + source 三标记；
 *      clear() 只删带演示标记的条目，绝不碰用户真实条目。
 *   ⑤ 演示条目不进入经验正确率 / PCM / 导出包（由 core.js 与 export-manifest.js
 *      的 isDemoItem 闸门统一排除）；但保留在复习队列 / 负荷图 / 图谱里供功能试用。
 *   ⑥ 绝不接入 AI 外发路径，绝不冒充认知能力常模。
 */
"use strict";
window.DEMO = (function () {
  const VERSION = "demo/11.0";
  const DEMO_PREFIX = "demo__";

  const META = {
    packVersion: VERSION,
    isDemo: true,
    defaultEnabled: false,
    synthetic: false,
    origin: "本项目原创编写",
    attribution: "字段结构借鉴自账号 azdezhishijiangtang 下 Principia / wenji / wenqu 的内容组织方式；全部题目、答案、要点、提示与错因文本为本项目原创，未复制任何仓库原文。",
    license: "随 CognitionScope 一并交付给作者本人使用；不授予第三方再分发权。详见 ATTRIBUTION.md。",
    note: "示例内容用于试用功能，不构成学习成效证据，也不是认知能力常模。"
  };

  /* ---------- 学科分类词表（替代录入页的自由文本） ---------- */
  const DOMAINS = [
    { id: "数学", focus: "定义、定理、运算与证明", chapters: ["极限与连续", "导数与微分", "积分", "概率与统计", "代数与数列", "几何与向量"] },
    { id: "物理", focus: "概念、定律与量纲", chapters: ["力学", "能量", "电磁学", "热学", "波动与光学"] },
    { id: "化学", focus: "物质、反应与平衡", chapters: ["物质的量", "化学平衡", "氧化还原", "酸碱与溶液"] },
    { id: "生物", focus: "结构、过程与系统", chapters: ["细胞", "遗传", "代谢", "生态"] },
    { id: "语文", focus: "文言、手法与表达", chapters: ["文言词义", "论证与修辞", "意象与鉴赏"] },
    { id: "英语", focus: "语法、词义与语用", chapters: ["时态与语态", "从句", "词汇辨析"] },
    { id: "学习方法", focus: "怎么学，以及怎么判断有没有效", chapters: ["练习设计", "自我观测", "证据与结论"] }
  ];

  /* ---------- 错因分类法（结构借鉴通用逻辑谬误 + 学科失分点） ---------- */
  const ERROR_TYPES = [
    { id: "偷换概念", plain: "把 A 当成 B 来用，词没变但意思变了。", kind: "逻辑" },
    { id: "以偏概全", plain: "拿一两次经历当成普遍规律。", kind: "逻辑" },
    { id: "强加因果", plain: "两件事一起发生，就断定是前者导致后者。", kind: "逻辑" },
    { id: "无中生有", plain: "题干没给的条件自己补上了。", kind: "逻辑" },
    { id: "绝对化", plain: "把「有时成立」说成「一定成立」。", kind: "逻辑" },
    { id: "混淆充要", plain: "把「只要…就够」和「非它不可」搞反了。", kind: "逻辑" },
    { id: "忽略前提", plain: "公式或定理的适用条件没检查就直接套。", kind: "学科" },
    { id: "符号/单位", plain: "正负号、方向或单位弄错。", kind: "学科" },
    { id: "边界遗漏", plain: "只算了一般情形，漏掉端点、零或特殊值。", kind: "学科" }
  ];

  /* ---------- 示例条目 ----------
   * 字段对齐 CS.addItem({content, answer, rubric, domain, mtype})，并补充：
   * keypoints[] → 要点核验；commonErrors[] / errorTypes[] → 错因归类；
   * hints[] → 由浅入深的分层提示；prereq[] / relates[] → 知识网络先验边。
   * course / chapter 组成「课程 → 章节 → 知识点」层级，用于生成图谱与筛选。
   */
  const ITEMS = [
    // ============ 数学 · 极限与连续 ============
    {
      id: "m01", course: "微积分", chapter: "极限与连续", domain: "数学", mtype: "concept", difficulty: 2,
      content: "函数在某点「连续」需要同时满足哪三个条件？",
      answer: "① 该点有定义 f(a) 存在；② 极限 lim(x→a) f(x) 存在；③ 极限值等于函数值。三者缺一不可。",
      rubric: "答出「有定义、极限存在、两者相等」三点即算正确；只说「图像不断开」不算。",
      keypoints: ["f(a) 有定义", "极限存在", "极限值 = 函数值"],
      commonErrors: ["把「图像看起来连着」当成定义", "只检查左右极限相等，忘了函数值"],
      hints: ["先想：一个点连不上，可能有几种断法？", "其中一种是「压根没这个点」，对应哪个条件？", "再对比「有洞」和「跳开」，第三个条件是什么？"],
      errorTypes: ["混淆充要", "边界遗漏"], tags: ["连续", "极限"],
      prereq: [], relates: ["m02", "m03"]
    },
    {
      id: "m02", course: "微积分", chapter: "极限与连续", domain: "数学", mtype: "fact", difficulty: 1,
      content: "lim(x→0) sin(x)/x 等于多少？为什么不能直接代入？",
      answer: "等于 1。直接代入得到 0/0 型未定式，没有定义；需要用夹逼定理或几何面积比较证明。",
      rubric: "数值 1，且说明 0/0 未定式不能代入。",
      keypoints: ["结果为 1", "0/0 是未定式", "需夹逼或几何证明"],
      commonErrors: ["认为 0/0 = 1 或 = 0", "把「代数化简」和「重要极限」混为一谈"],
      hints: ["代入后分子分母各是多少？", "这个形状叫什么？", "回忆单位圆里扇形面积的比较。"],
      errorTypes: ["忽略前提", "偷换概念"], tags: ["重要极限", "未定式"],
      prereq: ["m01"], relates: ["m04"]
    },
    {
      id: "m03", course: "微积分", chapter: "极限与连续", domain: "数学", mtype: "concept", difficulty: 3,
      content: "「左右极限都存在且相等」是「函数在该点连续」的充分条件吗？",
      answer: "不是。它只保证极限存在，还要求该点有定义且函数值等于极限值。所以它是必要不充分条件。",
      rubric: "明确答「不是 / 必要不充分」，并指出缺少的两个条件。",
      keypoints: ["必要不充分", "还需 f(a) 有定义", "还需 f(a) = 极限值"],
      commonErrors: ["把可去间断点当成连续", "把「极限存在」与「连续」等同"],
      hints: ["想象一个「挖掉一个点」的图像。", "那个点左右极限相等吗？函数连续吗？", "所以还差什么？"],
      errorTypes: ["混淆充要", "无中生有"], tags: ["间断点", "充要条件"],
      prereq: ["m01"], relates: ["m02"]
    },
    // ============ 数学 · 导数与微分 ============
    {
      id: "m04", course: "微积分", chapter: "导数与微分", domain: "数学", mtype: "concept", difficulty: 2,
      content: "导数的定义式是什么？它描述的是「变化量」还是「变化率」？",
      answer: "f'(a) = lim(h→0) [f(a+h) − f(a)] / h。它描述瞬时变化率（比值极限），不是变化量本身。",
      rubric: "写出差商极限，并说明是瞬时变化率。",
      keypoints: ["差商 [f(a+h)−f(a)]/h", "h→0 取极限", "瞬时变化率"],
      commonErrors: ["漏掉分母的 h", "把导数说成「函数值变化了多少」"],
      hints: ["平均速度怎么算？", "把时间间隔无限缩小会怎样？", "所以是比值还是差值？"],
      errorTypes: ["偷换概念", "忽略前提"], tags: ["导数定义", "差商"],
      prereq: ["m02"], relates: ["m05", "m06"]
    },
    {
      id: "m05", course: "微积分", chapter: "导数与微分", domain: "数学", mtype: "skill", difficulty: 3,
      content: "用导数判断函数单调性时，f'(x)>0 是单调递增的充分条件还是必要条件？",
      answer: "在区间内 f'(x)>0 是严格递增的充分条件，但不是必要条件；例如 f(x)=x³ 在 x=0 处导数为 0，仍在整个实数轴严格递增。",
      rubric: "答「充分不必要」并举出反例（如 x³）。",
      keypoints: ["充分不必要", "反例 x³", "导数为 0 的孤立点不破坏严格递增"],
      commonErrors: ["把「导数非负」和「严格大于零」混用", "认为导数为 0 就一定不单调"],
      hints: ["先想：导数大于零能不能推出递增？能。", "反过来，递增能不能推出处处大于零？", "试试 y = x³ 在原点。"],
      errorTypes: ["混淆充要", "绝对化"], tags: ["单调性", "充要条件"],
      prereq: ["m04"], relates: ["m06", "m01"]
    },
    {
      id: "m06", course: "微积分", chapter: "导数与微分", domain: "数学", mtype: "fact", difficulty: 1,
      content: "复合函数求导的链式法则怎么写？",
      answer: "若 y = f(g(x))，则 y' = f'(g(x)) · g'(x)，即「外层导数（保持内层不变）乘以内层导数」。",
      rubric: "写出乘积形式，并强调外层在内层处求值。",
      keypoints: ["外层导数", "在内层 g(x) 处求值", "乘内层导数"],
      commonErrors: ["只求外层导数漏乘内层", "把 f'(g(x)) 写成 f'(x)"],
      hints: ["把 g(x) 先当作一个整体 u。", "先对 u 求导，再对 x 求导。", "两步怎么合起来？"],
      errorTypes: ["符号/单位", "边界遗漏"], tags: ["链式法则", "复合函数"],
      prereq: ["m04"], relates: ["m05", "m07"]
    },
    // ============ 数学 · 积分 ============
    {
      id: "m07", course: "微积分", chapter: "积分", domain: "数学", mtype: "concept", difficulty: 3,
      content: "微积分基本定理把哪两件事连了起来？",
      answer: "把「求导数」与「求定积分」连起来：若 F' = f，则 ∫[a,b] f(x)dx = F(b) − F(a)。它把面积计算转化为找原函数。",
      rubric: "写出牛顿-莱布尼茨公式并说明「求导与积分互逆」。",
      keypoints: ["F' = f", "∫[a,b] f = F(b) − F(a)", "求导与积分互逆"],
      commonErrors: ["把定积分说成「原函数」", "忘记上下限都要代入"],
      hints: ["先想「面积」和「斜率」看起来是不是两回事。", "如果 F 是 f 的原函数，F 的变化量怎么算？", "那个变化量正好等于什么？"],
      errorTypes: ["偷换概念", "符号/单位"], tags: ["牛顿-莱布尼茨", "原函数"],
      prereq: ["m04", "m06"], relates: ["m08"]
    },
    {
      id: "m08", course: "微积分", chapter: "积分", domain: "数学", mtype: "skill", difficulty: 3,
      content: "换元积分时最容易漏掉哪一步？",
      answer: "漏掉同步替换积分上下限（定积分）或漏乘 dx 的变换因子，以及最后忘记回代（不定积分）。",
      rubric: "答出「换元必须同时换限 / 换 dx」，并说明不定积分要回代。",
      keypoints: ["dx 随 u 一起变换", "定积分要换上下限", "不定积分最后回代"],
      commonErrors: ["只换了被积函数没换 dx", "定积分换元后仍用原来的上下限"],
      hints: ["设 u = g(x) 之后，du 等于什么？", "积分变量变了，区间端点还是原来的数吗？", "不定积分最后答案该用谁表示？"],
      errorTypes: ["边界遗漏", "符号/单位"], tags: ["换元积分", "定积分"],
      prereq: ["m07"], relates: ["m06"]
    },
    // ============ 数学 · 概率与统计 ============
    {
      id: "m09", course: "概率统计", chapter: "概率与统计", domain: "数学", mtype: "concept", difficulty: 2,
      content: "两个事件「互斥」和「独立」有什么区别？",
      answer: "互斥指不能同时发生，P(A∩B)=0；独立指一个发生不影响另一个，P(A∩B)=P(A)P(B)。除非某事件概率为 0，两者一般不能同时成立。",
      rubric: "给出两个等式并说明「互斥通常不独立」。",
      keypoints: ["互斥：交集为空", "独立：概率相乘", "一般不能兼得"],
      commonErrors: ["觉得「互不干扰」就是独立", "把互斥当成独立的特例"],
      hints: ["互斥说的是「能不能一起发生」。", "独立说的是「一个发生会不会改变另一个的概率」。", "若 A、B 互斥且概率都大于 0，A 发生会让 B 的概率变成多少？"],
      errorTypes: ["偷换概念", "混淆充要"], tags: ["互斥", "独立性"],
      prereq: [], relates: ["m10", "b03"]
    },
    {
      id: "m10", course: "概率统计", chapter: "概率与统计", domain: "数学", mtype: "fact", difficulty: 2,
      content: "条件概率 P(A|B) 的分母是什么？为什么不是全体样本？",
      answer: "分母是 P(B)，即「已知 B 发生」这个缩小后的样本空间。因为额外信息已经把可能范围限制在 B 内。",
      rubric: "写出 P(A|B)=P(A∩B)/P(B)，并说明样本空间缩到 B。",
      keypoints: ["公式 P(A∩B)/P(B)", "样本空间缩小为 B", "P(B)>0"],
      commonErrors: ["用 P(A∩B)/P(A)", "忘记 P(B) 必须大于 0"],
      hints: ["「已知 B 发生」意味着哪些结果已经被排除了？", "剩下的总概率是多少？", "A 在这部分里占多少？"],
      errorTypes: ["忽略前提", "符号/单位"], tags: ["条件概率", "样本空间"],
      prereq: ["m09"], relates: ["m11"]
    },
    {
      id: "m11", course: "概率统计", chapter: "概率与统计", domain: "数学", mtype: "concept", difficulty: 4,
      content: "为什么「检验显著」不等于「效应很大」？",
      answer: "显著性受样本量影响：样本极大时极小的差异也能显著。效应量（如差值、NAP）才描述差异大小；两者要一起报告，还要给置信区间。",
      rubric: "答出「样本量影响显著性」并区分 p 值与效应量。",
      keypoints: ["p 值受 n 影响", "效应量描述大小", "需同时报告区间"],
      commonErrors: ["把 p<0.05 说成「效果明显」", "只看 p 值不看方向与大小"],
      hints: ["样本从 20 增加到 20000，同样的差值会怎样？", "哪一个数字在描述「差多少」？", "报告时还缺什么？"],
      errorTypes: ["以偏概全", "强加因果"], tags: ["显著性", "效应量"],
      prereq: ["m10"], relates: ["s04", "s06"]
    },
    // ============ 数学 · 代数与数列 / 几何 ============
    {
      id: "m12", course: "代数", chapter: "代数与数列", domain: "数学", mtype: "skill", difficulty: 2,
      content: "等差数列前 n 项和公式是什么？怎么自己推出来？",
      answer: "S_n = n(a₁ + aₙ)/2 = n·a₁ + n(n−1)d/2。推导用倒序相加：正写与倒写两式逐项相加，每项都是 a₁+aₙ，共 n 项。",
      rubric: "给出公式并说明倒序相加的推导。",
      keypoints: ["S_n = n(a₁+aₙ)/2", "倒序相加", "共 n 对"],
      commonErrors: ["把 n 写成 n−1", "只记公式说不出为什么"],
      hints: ["把 S_n 正着写一遍，再倒着写一遍。", "上下两式对应项相加等于多少？", "一共有几对？"],
      errorTypes: ["符号/单位", "边界遗漏"], tags: ["等差数列", "倒序相加"],
      prereq: [], relates: ["m13"]
    },
    {
      id: "m13", course: "代数", chapter: "代数与数列", domain: "数学", mtype: "concept", difficulty: 3,
      content: "数学归纳法为什么能证明对所有自然数成立？",
      answer: "因为自然数良序：验证起点 n=1（奠基），再证明「若 n=k 成立则 n=k+1 成立」（递推），两步合起来覆盖全部自然数，缺一不可。",
      rubric: "答出「奠基 + 递推」两步，并说明依赖自然数良序性。",
      keypoints: ["奠基 n=1", "递推 k→k+1", "两步缺一不可"],
      commonErrors: ["只验证前几项就下结论", "递推步里偷偷用了待证结论"],
      hints: ["只有递推、没有起点会怎样？", "只有起点、没有递推能走多远？", "是什么保证不会漏掉某个自然数？"],
      errorTypes: ["以偏概全", "无中生有"], tags: ["数学归纳法", "良序"],
      prereq: ["m12"], relates: ["m05"]
    },
    {
      id: "m14", course: "几何", chapter: "几何与向量", domain: "数学", mtype: "fact", difficulty: 1,
      content: "两个向量点积为 0，一定说明它们垂直吗？",
      answer: "不一定。若其中一个是零向量，点积也为 0，但零向量没有方向，谈不上垂直。非零向量点积为 0 才等价于垂直。",
      rubric: "答「不一定」并指出零向量这个例外。",
      keypoints: ["非零前提", "零向量点积恒为 0", "零向量无方向"],
      commonErrors: ["忽略零向量", "把点积为 0 无条件当成垂直"],
      hints: ["点积公式里有个 cosθ。", "如果某个向量长度是 0 呢？", "零向量有方向角吗？"],
      errorTypes: ["忽略前提", "绝对化"], tags: ["点积", "零向量"],
      prereq: [], relates: ["m15"]
    },
    {
      id: "m15", course: "几何", chapter: "几何与向量", domain: "数学", mtype: "skill", difficulty: 3,
      content: "用向量法求两平面夹角时，为什么有时取补角？",
      answer: "两平面法向量夹角可能等于平面夹角，也可能等于其补角；平面夹角定义为不超过 90° 的锐角或直角，因此通常取法向量夹角余弦的绝对值。",
      rubric: "说明取绝对值 / 取锐角，并解释法向量方向可任选。",
      keypoints: ["法向量方向任选", "取 |cos|", "平面夹角 ∈ [0°,90°]"],
      commonErrors: ["直接把法向量夹角当成答案", "忘记法向量可以取相反方向"],
      hints: ["一个平面有几个法向量方向？", "把法向量反向，夹角变成多少？", "平面夹角的定义域是什么？"],
      errorTypes: ["符号/单位", "边界遗漏"], tags: ["法向量", "二面角"],
      prereq: ["m14"], relates: []
    },
    // ============ 物理 ============
    {
      id: "p01", course: "力学", chapter: "力学", domain: "物理", mtype: "concept", difficulty: 2,
      content: "牛顿第三定律中的作用力与反作用力，为什么不能相互抵消？",
      answer: "因为它们作用在两个不同物体上，而力的合成/抵消只针对同一个物体的受力。大小相等、方向相反、共线，但受力对象不同。",
      rubric: "答出「作用在不同物体上」，并说明同体才能合成。",
      keypoints: ["大小相等方向相反", "作用在两个物体上", "受力分析只对同一物体"],
      commonErrors: ["把一对相互作用力与一对平衡力混淆", "认为合力为零所以物体不动"],
      hints: ["先画两个物体，各自标出受到的力。", "这两个力画在同一个物体上了吗？", "平衡力又是什么情况？"],
      errorTypes: ["偷换概念", "无中生有"], tags: ["牛顿第三定律", "受力分析"],
      prereq: [], relates: ["p02", "p03"]
    },
    {
      id: "p02", course: "力学", chapter: "力学", domain: "物理", mtype: "fact", difficulty: 1,
      content: "「质量」和「重量」有什么区别？单位分别是什么？",
      answer: "质量是物体惯性大小，单位 kg，不随地点变；重量是重力大小 W=mg，单位 N，随重力加速度 g 变化。",
      rubric: "区分标量惯性 / 力，给出 kg 与 N。",
      keypoints: ["质量 kg 不变", "重量 N = mg", "g 随地点变"],
      commonErrors: ["用 kg 表示重量", "说「到月球质量变小」"],
      hints: ["到了月球，物体含有的物质变少了吗？", "弹簧秤读数会变吗？", "两个量的单位分别是什么？"],
      errorTypes: ["符号/单位", "偷换概念"], tags: ["质量", "重力"],
      prereq: ["p01"], relates: ["p04"]
    },
    {
      id: "p03", course: "力学", chapter: "力学", domain: "物理", mtype: "skill", difficulty: 3,
      content: "为什么在加速上升的电梯里，体重秤读数会变大？",
      answer: "秤读数是支持力 N。由 N − mg = ma 得 N = m(g+a) > mg，属于超重；读数变大不是重力变大，而是支持力变大。",
      rubric: "写出 N = m(g+a)，并说明读数测的是支持力。",
      keypoints: ["读数 = 支持力 N", "牛顿第二定律 N−mg=ma", "超重不是重力变大"],
      commonErrors: ["说成重力增加了", "把加速度方向搞反"],
      hints: ["秤实际测的是哪个力？", "对人列牛顿第二定律，加速度朝哪？", "解出 N 与 mg 比大小。"],
      errorTypes: ["偷换概念", "符号/单位"], tags: ["超重失重", "牛顿第二定律"],
      prereq: ["p01", "p02"], relates: ["p04"]
    },
    {
      id: "p04", course: "力学", chapter: "能量", domain: "物理", mtype: "concept", difficulty: 3,
      content: "机械能守恒的条件是什么？有摩擦力做功时还能用吗？",
      answer: "只有重力/弹力等保守力做功（非保守力做功为零）时机械能守恒。有摩擦做功则不守恒，应改用功能关系：W_非保守 = ΔE_机械。",
      rubric: "答出「只有保守力做功」，并给出摩擦情形的替代关系。",
      keypoints: ["仅保守力做功", "非保守力功 = 机械能变化", "能量仍守恒但机械能不守恒"],
      commonErrors: ["把能量守恒与机械能守恒混为一谈", "有摩擦仍直接套 mgh = ½mv²"],
      hints: ["总能量什么时候都守恒吗？", "摩擦把机械能变成了什么？", "此时该用哪个关系式？"],
      errorTypes: ["忽略前提", "偷换概念"], tags: ["机械能守恒", "功能关系"],
      prereq: ["p02"], relates: ["p03", "p05"]
    },
    {
      id: "p05", course: "电磁学", chapter: "电磁学", domain: "物理", mtype: "fact", difficulty: 2,
      content: "电场强度 E = F/q 中的 q 是试探电荷还是场源电荷？",
      answer: "是试探电荷。E 由场源电荷与位置决定，与试探电荷的大小、正负无关；定义式只是用比值来测量它。",
      rubric: "答「试探电荷」并说明 E 与 q 无关。",
      keypoints: ["q 为试探电荷", "E 由场源与位置决定", "定义式≠决定式"],
      commonErrors: ["认为 q 变大 E 就变小", "把定义式当成因果关系"],
      hints: ["把试探电荷加倍，F 会怎样？", "F/q 变了吗？", "所以 E 由谁决定？"],
      errorTypes: ["强加因果", "偷换概念"], tags: ["电场强度", "定义式"],
      prereq: [], relates: ["p06"]
    },
    {
      id: "p06", course: "电磁学", chapter: "电磁学", domain: "物理", mtype: "concept", difficulty: 3,
      content: "闭合电路欧姆定律里，为什么电源端电压小于电动势？",
      answer: "因为电源有内阻 r，电流通过时产生内电压降 Ir，端电压 U = E − Ir。只有开路（I=0）时端电压才等于电动势。",
      rubric: "写出 U = E − Ir 并说明内阻分压。",
      keypoints: ["内阻 r", "U = E − Ir", "开路时 U = E"],
      commonErrors: ["把电动势与端电压等同", "短路时仍套用 U=E−Ir 求输出功率"],
      hints: ["电源内部的电阻算不算进回路？", "电流经过它会不会有电压降？", "没有电流时还有这个降吗？"],
      errorTypes: ["忽略前提", "符号/单位"], tags: ["电动势", "内阻"],
      prereq: ["p05"], relates: ["p04"]
    },
    {
      id: "p07", course: "热学", chapter: "热学", domain: "物理", mtype: "concept", difficulty: 3,
      content: "温度高的物体，内能一定更大吗？",
      answer: "不一定。内能还与物质的量、物态、分子势能有关；一杯热水温度高，但内能可能小于一大桶温水。温度只反映分子平均动能。",
      rubric: "答「不一定」，指出内能还取决于质量/物质的量与物态。",
      keypoints: ["温度 ↔ 平均动能", "内能还含物质的量与势能", "反例：一杯热水 vs 一桶温水"],
      commonErrors: ["把温度与内能等同", "忽略物态变化的潜热"],
      hints: ["温度描述的是「平均」还是「总量」？", "两杯水和一桶水，分子数一样吗？", "冰化成水温度不变，内能变了吗？"],
      errorTypes: ["以偏概全", "偷换概念"], tags: ["内能", "温度"],
      prereq: [], relates: ["p08"]
    },
    {
      id: "p08", course: "波动与光学", chapter: "波动与光学", domain: "物理", mtype: "fact", difficulty: 2,
      content: "光从空气斜射入水中，频率、波长、速度各怎么变？",
      answer: "频率由光源决定，保持不变；速度变小（v=c/n）；由 v=λf 得波长也变短。",
      rubric: "频率不变、速度变小、波长变短，三者齐全。",
      keypoints: ["频率不变", "v = c/n 变小", "λ = v/f 变短"],
      commonErrors: ["认为折射时频率改变", "把波长变化方向说反"],
      hints: ["界面两侧的光振动由同一个源驱动吗？", "水的折射率大于 1，速度怎么变？", "v = λf 里谁不变？"],
      errorTypes: ["符号/单位", "强加因果"], tags: ["折射", "波速公式"],
      prereq: [], relates: ["p07"]
    },
    // ============ 化学 ============
    {
      id: "c01", course: "化学基础", chapter: "物质的量", domain: "化学", mtype: "fact", difficulty: 1,
      content: "1 mol 的定义是什么？阿伏伽德罗常数约等于多少？",
      answer: "1 mol 含有与 12 g 碳-12 中原子数相同的基本单元，约为 6.022×10²³ 个，该数值即阿伏伽德罗常数 N_A。",
      rubric: "给出 6.022×10²³ mol⁻¹ 与「基本单元数目」的含义。",
      keypoints: ["N_A ≈ 6.022×10²³ mol⁻¹", "对应基本单元数目", "与 12 g 碳-12 关联"],
      commonErrors: ["把 mol 当成质量单位", "漏写单位 mol⁻¹"],
      hints: ["mol 是数「个数」还是称「重量」？", "一打是 12 个，一 mol 是多少个？", "它的单位怎么写？"],
      errorTypes: ["符号/单位", "偷换概念"], tags: ["摩尔", "阿伏伽德罗常数"],
      prereq: [], relates: ["c02"]
    },
    {
      id: "c02", course: "化学基础", chapter: "物质的量", domain: "化学", mtype: "skill", difficulty: 2,
      content: "配制一定物质的量浓度溶液时，为什么不能直接在容量瓶里溶解固体？",
      answer: "溶解常伴随放热/吸热，会导致溶液体积与容量瓶标定温度不一致，且容量瓶不耐热、不便搅拌；应先在烧杯中溶解冷却后再转移、洗涤、定容。",
      rubric: "答出「热效应影响体积」并说明烧杯溶解 → 冷却 → 转移 → 定容。",
      keypoints: ["溶解有热效应", "容量瓶按标定温度校准", "冷却后转移并洗涤"],
      commonErrors: ["未冷却就定容", "忘记洗涤烧杯与玻璃棒"],
      hints: ["溶解放热时液体体积会怎样？", "容量瓶是在哪个温度下标定的？", "转移后杯壁上还留着什么？"],
      errorTypes: ["忽略前提", "边界遗漏"], tags: ["容量瓶", "配制溶液"],
      prereq: ["c01"], relates: ["c04"]
    },
    {
      id: "c03", course: "化学平衡", chapter: "化学平衡", domain: "化学", mtype: "concept", difficulty: 3,
      content: "达到化学平衡后，反应停止了吗？增大压强一定使平衡移动吗？",
      answer: "没有停止，是正逆反应速率相等的动态平衡。增压只在反应前后气体分子数不等、且通过改变体积实现时才使平衡移动；充入惰性气体（恒容）不改变分压，平衡不移动。",
      rubric: "答「动态平衡」并指出增压移动的两个前提。",
      keypoints: ["v正 = v逆 ≠ 0", "气体分子数不等", "恒容充惰气不移动"],
      commonErrors: ["说成反应停止", "认为只要加压就一定移动"],
      hints: ["平衡时正反应还在进行吗？", "若左右气体分子数相同，压缩会偏向哪边？", "恒容下加不参与反应的气体，各组分分压变了吗？"],
      errorTypes: ["绝对化", "忽略前提"], tags: ["勒夏特列原理", "动态平衡"],
      prereq: [], relates: ["c04"]
    },
    {
      id: "c04", course: "化学平衡", chapter: "酸碱与溶液", domain: "化学", mtype: "fact", difficulty: 2,
      content: "pH = 3 的溶液稀释 100 倍，pH 一定等于 5 吗？",
      answer: "不一定。对强酸近似为 5，但极稀时必须考虑水的电离，pH 只能趋近 7 而不会超过 7；弱酸稀释还会促进电离，pH 变化小于 2 个单位。",
      rubric: "答「不一定」，指出水的电离下限与弱酸电离被促进。",
      keypoints: ["强酸稀释近似 +2", "极稀时水的电离不可忽略", "弱酸稀释促进电离"],
      commonErrors: ["机械地加 2", "认为酸稀释后能变成碱性"],
      hints: ["pH 的算法里 [H⁺] 从哪来？", "稀释到很稀时，水自己电离的 [H⁺] 还忽略得了吗？", "弱酸稀释会怎样影响电离度？"],
      errorTypes: ["绝对化", "边界遗漏"], tags: ["pH", "稀释", "电离平衡"],
      prereq: ["c03"], relates: ["c05"]
    },
    {
      id: "c05", course: "氧化还原", chapter: "氧化还原", domain: "化学", mtype: "skill", difficulty: 3,
      content: "配平氧化还原方程式时，最先要守的是哪两个守恒？",
      answer: "先守电子得失守恒（化合价升降相等），再守电荷守恒与原子守恒；酸性介质用 H⁺/H₂O、碱性介质用 OH⁻/H₂O 补齐氢氧。",
      rubric: "答出「电子守恒 + 电荷/原子守恒」并说明介质补项。",
      keypoints: ["化合价升降相等", "电荷守恒", "按酸碱性补 H⁺/OH⁻ 与 H₂O"],
      commonErrors: ["只配原子不检查电荷", "酸性条件下写出 OH⁻"],
      hints: ["还原剂失去的电子去哪了？", "离子方程式两边总电荷相等吗？", "缺氧或氢时用什么补？"],
      errorTypes: ["符号/单位", "忽略前提"], tags: ["氧化还原", "配平"],
      prereq: ["c01"], relates: ["c04"]
    },
    // ============ 生物 ============
    {
      id: "b01", course: "细胞生物学", chapter: "细胞", domain: "生物", mtype: "fact", difficulty: 1,
      content: "原核细胞与真核细胞最本质的区别是什么？",
      answer: "是否有由核膜包被的成形细胞核；此外真核细胞有膜性细胞器，原核细胞只有核糖体。两者都有细胞膜、细胞质、核糖体与 DNA。",
      rubric: "答「有无核膜包被的细胞核」并列出共有结构。",
      keypoints: ["核膜 / 成形细胞核", "膜性细胞器有无", "共有：膜、质、核糖体、DNA"],
      commonErrors: ["说原核细胞没有 DNA", "把「有无细胞壁」当成本质区别"],
      hints: ["细菌有细胞核吗？", "它的 DNA 放在哪里？", "两类细胞都一定有的结构有哪些？"],
      errorTypes: ["偷换概念", "以偏概全"], tags: ["原核细胞", "真核细胞"],
      prereq: [], relates: ["b02"]
    },
    {
      id: "b02", course: "遗传学", chapter: "遗传", domain: "生物", mtype: "concept", difficulty: 3,
      content: "「基因型相同，表现型一定相同」对吗？",
      answer: "不对。表现型 = 基因型 + 环境。同卵双胞胎或克隆个体在不同营养、温度、光照下也会有差异；还有不完全外显、表观修饰等情况。",
      rubric: "答「不对」并写出「表现型 = 基因型 + 环境」。",
      keypoints: ["表现型 = 基因型 + 环境", "同基因型可有不同表现", "外显率 / 表观修饰"],
      commonErrors: ["把遗传决定当成唯一因素", "把环境引起的变异说成基因突变"],
      hints: ["同一批种子种在肥沃和贫瘠土壤里，长得一样高吗？", "基因变了吗？", "所以表现型由几部分决定？"],
      errorTypes: ["绝对化", "强加因果"], tags: ["基因型", "表现型"],
      prereq: ["b01"], relates: ["b03"]
    },
    {
      id: "b03", course: "遗传学", chapter: "遗传", domain: "生物", mtype: "skill", difficulty: 3,
      content: "为什么孟德尔分离比 3:1 需要「样本足够大」？",
      answer: "3:1 是概率意义上的期望值。配子结合是随机的，样本小的时候抽样波动很大；样本越大，观测比例才越接近理论值（大数定律）。",
      rubric: "答出「随机抽样波动」并提到大数定律 / 期望值。",
      keypoints: ["3:1 是期望比例", "小样本波动大", "大数定律"],
      commonErrors: ["认为每 4 株必然恰好 3 高 1 矮", "把偏差当成实验失败"],
      hints: ["抛 4 次硬币一定 2 正 2 反吗？", "抛 4000 次呢？", "3:1 描述的是次数还是比例？"],
      errorTypes: ["以偏概全", "绝对化"], tags: ["分离定律", "抽样波动"],
      prereq: ["b02"], relates: ["m09", "m11"]
    },
    {
      id: "b04", course: "生态学", chapter: "生态", domain: "生物", mtype: "concept", difficulty: 2,
      content: "食物链中能量为什么逐级减少？能量能循环吗？",
      answer: "每一营养级只有约 10%–20% 的能量传递到下一级，其余用于呼吸消耗、以热能散失或未被利用。能量单向流动、逐级递减，不能循环；循环的是物质。",
      rubric: "答出「单向流动、逐级递减」并区分能量与物质。",
      keypoints: ["传递效率约 10%–20%", "呼吸耗散为热", "物质循环、能量不循环"],
      commonErrors: ["说能量循环利用", "把能量金字塔与数量金字塔混同"],
      hints: ["生物呼吸消耗的能量还能被下一级用到吗？", "热散出去还能收回来吗？", "那碳、氮这些元素呢？"],
      errorTypes: ["偷换概念", "绝对化"], tags: ["能量流动", "营养级"],
      prereq: [], relates: ["b02"]
    },
    // ============ 语文 ============
    {
      id: "w01", course: "文言文", chapter: "文言词义", domain: "语文", mtype: "fact", difficulty: 2,
      content: "「之」在文言文中常见哪几种用法？各举一例。",
      answer: "① 代词（代人/事/物）：「学而时习之」；② 结构助词「的」：「水陆草木之花」；③ 主谓之间取消句子独立性：「予独爱莲之出淤泥而不染」；④ 动词「到、往」：「送杜少府之任蜀州」；⑤ 宾语前置标志：「何陋之有」。",
      rubric: "至少答出三种用法并各配一例。",
      keypoints: ["代词", "结构助词", "取消句子独立性", "动词「往」", "提宾标志"],
      commonErrors: ["把所有「之」都译成「的」", "忽略取消独立性的用法"],
      hints: ["先看它后面跟的是名词还是动词。", "放在主语和谓语之间的那个呢？", "「何陋之有」的语序正常吗？"],
      errorTypes: ["以偏概全", "忽略前提"], tags: ["虚词", "之"],
      prereq: [], relates: ["w02"]
    },
    {
      id: "w02", course: "文言文", chapter: "文言词义", domain: "语文", mtype: "concept", difficulty: 3,
      content: "判断古今异义词时，最容易犯什么错？",
      answer: "用现代汉语的常用义去套文言词（以今律古）。例如「去」古义常为「离开」，「牺牲」古义为祭祀用的牲畜，「交通」古义为「交错相通」。应结合语境与时代义项判断。",
      rubric: "答「以今律古」并举出至少一个例子。",
      keypoints: ["以今律古", "结合语境", "例子如 去 / 牺牲 / 交通"],
      commonErrors: ["把「去国怀乡」译成「前往」", "只看单字不看搭配"],
      hints: ["「去国怀乡」是离开国都还是前往国都？", "「牺牲玉帛」里是动词还是名词？", "你用的义项是哪个时代的？"],
      errorTypes: ["偷换概念", "忽略前提"], tags: ["古今异义", "以今律古"],
      prereq: ["w01"], relates: ["w03"]
    },
    {
      id: "w03", course: "现代文阅读", chapter: "论证与修辞", domain: "语文", mtype: "skill", difficulty: 3,
      content: "「举例论证」和「比喻论证」的区别是什么？",
      answer: "举例论证用真实、具体的事例作归纳支撑，论据本身要可靠；比喻论证用相似事物打比方帮助说理，属于类比，不能当作事实证据。混淆二者会把「打个比方」误当成「给出证明」。",
      rubric: "区分「事例作证据」与「类比助理解」，并指出比喻不能当论据。",
      keypoints: ["举例：事实论据", "比喻：类比说理", "类比不等于证明"],
      commonErrors: ["把比喻句当成事实论据", "认为举的例子越生动越有证明力"],
      hints: ["「就像水滴石穿」是在给证据还是在打比方？", "「某年某实验数据」又是什么？", "哪个能直接支撑结论？"],
      errorTypes: ["偷换概念", "无中生有"], tags: ["论证方法", "类比"],
      prereq: [], relates: ["w04", "m13"]
    },
    {
      id: "w04", course: "现代文阅读", chapter: "论证与修辞", domain: "语文", mtype: "concept", difficulty: 2,
      content: "议论文里「观点」和「论题」有什么不同？",
      answer: "论题是「讨论什么」（一个范围或话题，常为短语），观点是「主张什么」（一个可判断真假的判断句）。「谈诚信」是论题，「诚信是立身之本」才是观点。",
      rubric: "答出「话题 vs 判断句」并给出识别方法。",
      keypoints: ["论题：范围 / 短语", "观点：可判断真假的句子", "识别：能否加「我认为…对/不对」"],
      commonErrors: ["把标题当成中心论点", "把描写句当成观点"],
      hints: ["「谈读书」能说它对还是不对吗？", "「读书应当求精」呢？", "所以差别在哪？"],
      errorTypes: ["偷换概念", "混淆充要"], tags: ["中心论点", "论题"],
      prereq: ["w03"], relates: ["w05"]
    },
    {
      id: "w05", course: "诗歌鉴赏", chapter: "意象与鉴赏", domain: "语文", mtype: "fact", difficulty: 2,
      content: "「意象」和「意境」有什么区别？",
      answer: "意象是融入作者情感的具体物象（如月、雁、孤舟）；意境是若干意象组合后整体形成的氛围与情感空间（如苍凉、空寂）。前者是零件，后者是整体效果。",
      rubric: "答「个别物象 vs 整体氛围」并说明组合关系。",
      keypoints: ["意象：含情的具体物象", "意境：整体氛围", "意象组合生成意境"],
      commonErrors: ["把两者互换使用", "只罗列意象不说氛围"],
      hints: ["「枯藤老树昏鸦」里列出来的是几个东西？", "读完这几句整体是什么感觉？", "哪个是零件，哪个是整体？"],
      errorTypes: ["偷换概念", "以偏概全"], tags: ["意象", "意境"],
      prereq: [], relates: ["w04"]
    },
    // ============ 英语 ============
    {
      id: "e01", course: "英语语法", chapter: "时态与语态", domain: "英语", mtype: "concept", difficulty: 2,
      content: "现在完成时与一般过去时最关键的差别是什么？",
      answer: "现在完成时强调过去动作对现在的影响或延续到现在，不与明确的过去时间状语连用；一般过去时只陈述过去某个已结束的时间点发生的事，常配 yesterday / in 2020 等。",
      rubric: "答出「与现在的关联」并说明时间状语限制。",
      keypoints: ["完成时：影响/延续到现在", "过去时：已结束的过去", "完成时不用明确过去时间点"],
      commonErrors: ["写出 I have seen him yesterday", "把「去过」和「去了」混用"],
      hints: ["I lost my key 和 I have lost my key，哪句暗示现在还没找到？", "yesterday 能和完成时一起用吗？", "差别是时间还是「和现在的关系」？"],
      errorTypes: ["忽略前提", "偷换概念"], tags: ["现在完成时", "一般过去时"],
      prereq: [], relates: ["e02"]
    },
    {
      id: "e02", course: "英语语法", chapter: "从句", domain: "英语", mtype: "skill", difficulty: 3,
      content: "定语从句里什么时候只能用 that 而不用 which？",
      answer: "先行词被 all / everything / the only / 序数词 / 最高级修饰，或先行词同时含人和物，或主句以 who/which 开头的疑问句时，通常用 that。非限制性定语从句则绝不能用 that。",
      rubric: "至少列出两类情形，并说明非限制性从句不用 that。",
      keypoints: ["不定代词 / 最高级 / 序数词修饰", "先行词含人与物", "非限制性从句禁用 that"],
      commonErrors: ["非限制性从句里用 that", "认为 that 和 which 永远可互换"],
      hints: ["「all that I know」能换成 all which 吗？", "逗号隔开的补充说明从句呢？", "先行词既有 the man 又有 the dog 时呢？"],
      errorTypes: ["绝对化", "忽略前提"], tags: ["定语从句", "关系代词"],
      prereq: [], relates: ["e03"]
    },
    {
      id: "e03", course: "英语词汇", chapter: "词汇辨析", domain: "英语", mtype: "fact", difficulty: 2,
      content: "affect 与 effect 怎么区分？",
      answer: "affect 通常是动词「影响」，effect 通常是名词「效果、结果」；effect 作动词时意为「引起、实现」（effect change）。记忆法：A=Action（动词），E=End（结果）。",
      rubric: "给出动词/名词区分，并提到 effect 作动词的特殊义。",
      keypoints: ["affect = 动词影响", "effect = 名词结果", "effect v. 引起/实现"],
      commonErrors: ["写出 have an affect on", "忽略 effect 的动词用法"],
      hints: ["句子里缺的是动作还是东西？", "前面有 an / the 吗？", "「effect change」里它是什么词性？"],
      errorTypes: ["符号/单位", "以偏概全"], tags: ["形近词", "词性"],
      prereq: [], relates: ["e01"]
    },
    // ============ 学习方法 / 元认知（与平台自身最相关） ============
    {
      id: "s01", course: "学习科学", chapter: "练习设计", domain: "学习方法", mtype: "concept", difficulty: 2,
      content: "为什么「先自己回忆再对答案」比「直接重读」更有效？",
      answer: "主动提取会强化记忆通路并暴露真实缺口，重读容易产生「我懂了」的熟悉感错觉。这叫检索练习（测试效应）；本平台的「先试后看」就是按这个思路设计的。",
      rubric: "答出「主动提取 / 暴露缺口」并指出熟悉感错觉。",
      keypoints: ["检索练习 / 测试效应", "熟悉感 ≠ 掌握", "先试后看"],
      commonErrors: ["把「读得很顺」当成「记住了」", "认为自测只是检验不是学习"],
      hints: ["合上书复述一遍，和再读一遍，哪个更费劲？", "费劲的那个暴露了什么？", "读得很顺时你确定能写出来吗？"],
      errorTypes: ["偷换概念", "强加因果"], tags: ["检索练习", "测试效应"],
      prereq: [], relates: ["s02", "s03"]
    },
    {
      id: "s02", course: "学习科学", chapter: "练习设计", domain: "学习方法", mtype: "fact", difficulty: 2,
      content: "间隔重复与集中练习的差别是什么？",
      answer: "间隔重复把复习分散到多天、在临近遗忘时安排；集中练习把同一内容短时间反复练。前者短期表现提升慢，但长期保持更好（spacing effect）。",
      rubric: "答出「分散 vs 集中」并说明长期保持的差异。",
      keypoints: ["分散到多天", "临近遗忘时复习", "长期保持更好"],
      commonErrors: ["以「当天记得牢」判断方法好坏", "把间隔重复说成「越多越好」"],
      hints: ["考前一晚突击，一周后还剩多少？", "分三天各复习一次呢？", "用哪天的成绩来判断方法更公平？"],
      errorTypes: ["以偏概全", "强加因果"], tags: ["间隔重复", "spacing effect"],
      prereq: ["s01"], relates: ["s03", "s05"]
    },
    {
      id: "s03", course: "学习科学", chapter: "练习设计", domain: "学习方法", mtype: "concept", difficulty: 3,
      content: "把不同题型混着练（交错练习）为什么反而感觉更差？",
      answer: "因为每次都要先判断「该用哪种方法」，增加了难度、降低了当次正确率；但它训练的是辨别与选择，长期迁移更好。感受上的费力不等于学习效果差。",
      rubric: "答出「增加了辨别成本、短期成绩下降但迁移更好」。",
      keypoints: ["需先判断题型", "当次表现下降", "长期迁移 / 辨别力更好"],
      commonErrors: ["用当次正确率判定方法无效", "把「练得顺」等同于「学得好」"],
      hints: ["分块练时，方法是不是已经告诉你了？", "混着练时多出来了哪一步？", "考试时题目会按章节排好吗？"],
      errorTypes: ["以偏概全", "偷换概念"], tags: ["交错练习", "合意困难"],
      prereq: ["s01", "s02"], relates: ["s04"]
    },
    {
      id: "s04", course: "自我观测", chapter: "自我观测", domain: "学习方法", mtype: "concept", difficulty: 4,
      content: "为什么一个人记录自己的学习数据（N=1），不能推广成「这个方法对所有人都有效」？",
      answer: "样本只有一个个体，个体特质、环境、时间与任务都和结论缠在一起；没有随机分配与代表性抽样，无法排除混杂，也无法估计人群差异。结论只对该个体、该观测窗成立。",
      rubric: "答出「无代表性样本 / 无法排除混杂 / 仅限该个体与观测窗」。",
      keypoints: ["单个个体无代表性", "混杂因素无法排除", "结论限个体与观测窗"],
      commonErrors: ["把「我有效」说成「普遍有效」", "用长期趋势直接宣称因果"],
      hints: ["换一个人、换个学期，还一定一样吗？", "你同时改了几件事？", "能分清是哪件起了作用吗？"],
      errorTypes: ["以偏概全", "强加因果", "绝对化"], tags: ["N=1", "外部效度", "混杂"],
      prereq: [], relates: ["s05", "m11"]
    },
    {
      id: "s05", course: "自我观测", chapter: "证据与结论", domain: "学习方法", mtype: "skill", difficulty: 4,
      content: "想比较两种学习方法，为什么要在开始前就把规则写死（预注册）？",
      answer: "防止事后挑对自己有利的指标、时间窗或子集，也防止中途偷看结果后改规则（peeking）。先固定「比什么、怎么分组、怎样算赢」，结论才可信；中途放弃的也要计入分母。",
      rubric: "答出「防事后挑选 / 防 peeking」并提到固定规则与分母。",
      keypoints: ["先定指标与判定规则", "防事后挑选与 peeking", "ITT 分母含中途放弃"],
      commonErrors: ["看到结果后再换指标", "只统计坚持到底的那些天"],
      hints: ["如果先看结果再定「怎样算赢」，会怎样？", "中途放弃的那几天该不该算？", "规则应该什么时候写？"],
      errorTypes: ["以偏概全", "无中生有"], tags: ["预注册", "防 peeking", "ITT"],
      prereq: ["s04"], relates: ["s02", "m11"]
    },
    {
      id: "s06", course: "自我观测", chapter: "证据与结论", domain: "学习方法", mtype: "concept", difficulty: 3,
      content: "「缺失的数据就先不算」会带来什么问题？",
      answer: "这叫 complete-case（只分析完整记录）。如果缺失不是完全随机的（例如状态差的那天更不想记录），剩下的样本会偏乐观，结论可能翻转。应报告缺失量，并做最好/最坏情形的敏感性分析。",
      rubric: "答出「可能系统性偏乐观」并提到敏感性分析。",
      keypoints: ["complete-case", "缺失可能非随机", "报告缺失 + 敏感性分析"],
      commonErrors: ["把完整配对说成完整 ITT", "不报告缺失比例"],
      hints: ["最不想记录的是哪几天？", "把那几天删掉，平均分会往哪边走？", "要不要把最好和最坏都算一遍？"],
      errorTypes: ["以偏概全", "无中生有"], tags: ["complete-case", "缺失数据", "敏感性分析"],
      prereq: ["s04"], relates: ["s05"]
    }
  ];

  /* ---------- 纯逻辑 API ---------- */
  const DEMO_MARK = "demo__";

  function isDemoItem(it) {
    return !!(it && it.demo === true && typeof it.source === "string" && it.source.indexOf("demo/") === 0);
  }

  function prefixId(id, prefix) { return String(prefix == null ? DEMO_PREFIX : prefix) + id; }

  function materialize(d, id, prefix, now) {
    return {
      id: id,
      content: String(d.content).slice(0, 500),
      answer: String(d.answer || ""),
      rubric: String(d.rubric || ""),
      domain: d.domain,
      mtype: d.mtype,
      course: d.course,
      chapter: d.chapter,
      difficulty: d.difficulty,
      keypoints: (d.keypoints || []).slice(),
      commonErrors: (d.commonErrors || []).slice(),
      errorTypes: (d.errorTypes || []).slice(),
      hints: (d.hints || []).slice(),
      tags: (d.tags || []).slice(),
      prereq: (d.prereq || []).map(x => prefixId(x, prefix)),
      relates: (d.relates || []).map(x => prefixId(x, prefix)),
      learnedAt: now,
      reviews: [],
      transfer: false,
      claims: null,
      demo: true,
      demoVersion: VERSION,
      source: "demo/" + VERSION + "#" + d.id
    };
  }

  /** 自检：结构完整、引用闭合、无占位文案、规模达标 */
  function validate() {
    const errors = [];
    const ids = new Set();
    for (const d of ITEMS) {
      if (!d || !d.id || ids.has(d.id)) errors.push("条目 id 缺失或重复：" + (d && d.id));
      if (d && d.id) ids.add(d.id);
      for (const k of ["content", "answer", "rubric", "domain", "mtype", "course", "chapter"])
        if (!d || !d[k]) errors.push((d && d.id) + " 缺字段 " + k);
      if (!d || !DOMAINS.some(x => x.id === d.domain)) errors.push((d && d.id) + " domain 未登记");
      if (!d || ["fact", "concept", "paper", "skill"].indexOf(d.mtype) < 0) errors.push((d && d.id) + " mtype 非法");
      if (!d || !(d.difficulty >= 1 && d.difficulty <= 5)) errors.push((d && d.id) + " difficulty 越界");
      if (!d || !Array.isArray(d.keypoints) || d.keypoints.length < 2) errors.push((d && d.id) + " 要点不足");
      if (!d || !Array.isArray(d.hints) || d.hints.length < 2) errors.push((d && d.id) + " 分层提示不足");
      if (!d || !Array.isArray(d.commonErrors) || !d.commonErrors.length) errors.push((d && d.id) + " 缺常见错误");
      if (!d || !Array.isArray(d.errorTypes)) errors.push((d && d.id) + " 缺错因分类");
      if (d && /TODO|待补充|待填写|占位/.test(JSON.stringify(d))) errors.push(d.id + " 含占位文案");
    }
    for (const d of ITEMS) {
      for (const r of (d.prereq || []).concat(d.relates || []))
        if (!ids.has(r)) errors.push(d.id + " 引用不存在的条目 " + r);
      for (const e of d.errorTypes || [])
        if (!ERROR_TYPES.some(x => x.id === e)) errors.push(d.id + " 错因未登记：" + e);
    }
    const edgeCount = edges().length;
    if (ITEMS.length < 40) errors.push("示例条目少于 40 条");
    if (edgeCount < 20) errors.push("先验边少于 20 条");
    return { ok: errors.length === 0, errors, count: ITEMS.length, edgeCount,
      domains: DOMAINS.map(x => x.id) };
  }

  /** 全部先验边（去重，双向 relates 只算一条） */
  function edges() {
    const out = [], seen = new Set();
    for (const d of ITEMS) {
      for (const r of d.prereq || []) {
        const key = "prereq|" + d.id + "|" + r;
        if (!seen.has(key)) { seen.add(key); out.push({ from: d.id, to: r, type: "prereq" }); }
      }
      for (const r of d.relates || []) {
        const a = d.id < r ? d.id : r, b = d.id < r ? r : d.id;
        const key = "relates|" + a + "|" + b;
        if (!seen.has(key)) { seen.add(key); out.push({ from: a, to: b, type: "relates" }); }
      }
    }
    return out;
  }

  /** 「课程 → 章节 → 知识点」层级，供 UI 与分类下拉使用 */
  function topics() {
    const map = new Map();
    for (const d of ITEMS) {
      const key = d.course + "|" + d.chapter;
      if (!map.has(key)) map.set(key, { course: d.course, chapter: d.chapter, domain: d.domain, ids: [] });
      map.get(key).ids.push(d.id);
    }
    return [...map.values()];
  }

  /** 本地筛选：关键词 / 学科 / 难度；零网络、零外部索引 */
  function catalog(q, domain, difficulty) {
    const needle = String(q == null ? "" : q).trim().toLowerCase();
    const dif = Number(difficulty) || 0;
    return ITEMS.filter(d => {
      if (domain && domain !== "全部" && d.domain !== domain) return false;
      if (dif && d.difficulty !== dif) return false;
      if (!needle) return true;
      const hay = [d.content, d.answer, d.rubric, d.domain, d.chapter, d.course,
        ...(d.keypoints || []), ...(d.tags || []), ...(d.commonErrors || []), ...(d.hints || [])]
        .join(" ").toLowerCase();
      return hay.indexOf(needle) >= 0;
    });
  }

  function byId(id) { return ITEMS.find(d => d.id === id) || null; }

  /** 当前 state 中的演示条目概况（不修改任何数据） */
  function status(state) {
    const items = (state && Array.isArray(state.items)) ? state.items.filter(isDemoItem) : [];
    return {
      loaded: items.length > 0,
      count: items.length,
      total: ITEMS.length,
      version: VERSION,
      allFromThisPack: items.every(x => x.demoVersion === VERSION),
      realCount: state && Array.isArray(state.items) ? state.items.length - items.length : 0
    };
  }

  /** 真实条目（排除演示）。无演示数据时返回原数组的等价副本，不改变历史行为 */
  function realItems(state) {
    const items = (state && Array.isArray(state.items)) ? state.items : [];
    if (!items.some(isDemoItem)) return items.slice();
    return items.filter(x => !isDemoItem(x));
  }

  /** 显式载入：只向传入 state 追加带标记的条目，返回是否需调用方 save()。
   *  绝不自己写 localStorage，绝不写 L2，绝不发起网络请求。 */
  function load(state, opts) {
    const o = opts || {};
    if (!state || !Array.isArray(state.items)) return { ok: false, added: 0, reason: "state 无效" };
    const v = validate();
    if (!v.ok) return { ok: false, added: 0, reason: "示例包自检未通过：" + v.errors[0] };
    const prefix = o.prefix == null ? DEMO_PREFIX : String(o.prefix);
    const now = Number.isFinite(o.now) ? o.now : Date.now();
    const existing = new Set(state.items.map(x => x && x.id));
    const ids = [];
    for (const d of ITEMS) {
      const id = prefixId(d.id, prefix);
      if (existing.has(id)) continue;
      state.items.push(materialize(d, id, prefix, now));
      existing.add(id);
      ids.push(id);
    }
    return { ok: true, added: ids.length, skipped: ITEMS.length - ids.length,
      version: VERSION, ids, writeRequired: ids.length > 0 };
  }

  /** 一键清除：只删带演示标记的条目，用户真实条目一条不动 */
  function clear(state) {
    if (!state || !Array.isArray(state.items)) return { ok: false, removed: 0, reason: "state 无效" };
    const before = state.items.length;
    state.items = state.items.filter(x => !isDemoItem(x));
    const removed = before - state.items.length;
    return { ok: true, removed, kept: state.items.length, writeRequired: removed > 0 };
  }

  /** 生成可下载的示例包文本（只有示例，绝不含用户数据） */
  function exportPack() {
    return JSON.stringify({
      format: "cognitionscope.demo/1",
      meta: Object.assign({}, META, { exportedAt: new Date().toISOString() }),
      domains: DOMAINS, errorTypes: ERROR_TYPES, topics: topics(),
      items: ITEMS, edges: edges(), validation: validate()
    }, null, 2);
  }

  return {
    VERSION, META, DEMO_PREFIX, DOMAINS, ERROR_TYPES, ITEMS,
    isDemoItem, prefixId, materialize, validate, edges, topics, catalog, byId,
    status, realItems, load, clear, exportPack
  };
})();
