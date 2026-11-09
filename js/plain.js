/* CognitionScope · js/plain.js —— v10 通俗化层
 * 职责：① 每个功能页顶部的「这页干嘛 / 你该点哪 / 结果怎么读」说明卡
 *       ② 「开始使用」导览页与「名词解释」页
 *       ③ 全站「通俗说明」开关（默认开，可关）
 * 设计纪律：不改动任何业务模块，只在 APP.go() 之后向 pane 头部插入一张卡；
 *           用 insertAdjacentHTML 保留原有 DOM 节点与事件绑定。
 */
"use strict";
window.PLAIN = (function () {
  const MODE_KEY = "cogscope_v10_plain";
  const G = () => window.GLOSSARY;
  let lastTab = "home";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function isOn() {
    try { return localStorage.getItem(MODE_KEY) !== "off"; } catch (_) { return true; }
  }
  function toggle() {
    const next = !isOn();
    try { localStorage.setItem(MODE_KEY, next ? "on" : "off"); } catch (_) {}
    syncButton();
    if (window.APP && window.APP.go) window.APP.go(lastTab);
    return next;
  }
  function label() { return isOn() ? "通俗说明：开" : "通俗说明：关"; }
  function syncButton() {
    const b = document.querySelector && document.querySelector("#btnPlain");
    if (b) {
      b.textContent = label();
      if (b.classList && b.classList.toggle) b.classList.toggle("off", !isOn());
    }
  }

  /* ---------------- 15 个功能页的白话说明（不写黑话） ---------------- */
  const PAGE = {
    observe: {
      n: "观测站", level: "入门", group: "日常",
      title: "今天该学什么、学得怎么样",
      what: "把你录进去的内容和复习结果，自动汇总成几张图表。",
      why: "不用自己算，一眼看出哪些快忘了、一天里哪段时间状态最好。",
      steps: ["先看「未来 7 天负荷」，数字变大说明欠的复习变多了", "找到「今日可行动输出」，照着它给的建议做", "想开始就点上面的「复习」或直接按卡片里的按钮"],
      read: "这些是给你自己看的趋势，不是分数，更不是能力评级；样本少时波动很正常。",
      terms: ["未来 7 天负荷", "间隔重复", "交错练习", "集中练习", "会话续航", "时段 × 正确率", "工具层", "同屏免责"]
    },
    review: {
      n: "今日复习", level: "入门", group: "日常",
      title: "今天到期、该复习的卡片",
      what: "把今天该复习的条目排成一队，让你一条条过。",
      why: "先自己回忆再对答案，比直接翻答案记得牢得多；顺便让系统知道你判断得准不准。",
      steps: ["点「先试后看」，先在心里回忆答案", "选一个「你觉得自己有多大把握」", "对完参考答案，再选「实际答得怎么样」", "太累可以「放弃本次」，只记事件、不算进统计"],
      read: "请如实自评。把「想不起来」标成「轻松想起」，后面的复习排期就会不准。",
      terms: ["复习队列", "先试后看", "置信度自评 conf", "实际答对程度 grade", "间隔重复"]
    },
    add: {
      n: "录入 / 档案", level: "入门", group: "日常",
      title: "记下一条要学的东西",
      what: "把想记住的内容、答案、分类存进本机，之后才能排复习。",
      why: "这是整个工具的起点。所有图表和计划都来自你在这里记的内容。",
      steps: ["填内容和参考答案，选一个分类", "点「加入队列」保存", "想留个底就点「生成快照并导出 PCM」", "数据只在这台设备上，换设备请用「全量导出」带走"],
      read: "「AI 打卡解析」是关闭状态——你的学习内容不会被送去任何 AI 服务商。",
      terms: ["条目", "域 / domain", "PCM 个人学习数据档案", "隐私隔离 / fail-closed", "L1 主状态"]
    },
    plan: {
      n: "计划 PlanGen", level: "入门", group: "日常",
      title: "自动排出今天的复习计划",
      what: "按「哪些快到期」和「一天最多能学多少」，先排一个计划骨架给你确认。",
      why: "省得自己盘算今天先复习哪个；也不会一口气排出根本做不完的量。",
      steps: ["点「加入队列」生成本地计划骨架", "看看容量线，量太多就手动减一些", "确认后回到「今日复习」开始执行"],
      read: "计划完全在你设备上算，不会把你的日程或条目发给 AI；「AI 修饰」是关闭的。",
      terms: ["PlanGen 双阶段生成", "容量线", "复习队列", "隐私隔离 / fail-closed"]
    },
    ai: {
      n: "AI 引擎", level: "入门", group: "可选",
      title: "问一个通用学习问题（可选）",
      what: "向 AI 服务商请教通用知识或方法，比如「间隔重复的原理是什么」。",
      why: "只想查点通用资料时不用切出去；但这个功能完全可选，不用它也能正常用。",
      steps: ["填服务商和 API Key（只存在当前页面，刷新后要重填）", "输入一个不含个人信息的通用问题", "勾选确认，可开「流式输出」看它逐字回答", "点「调用 API」"],
      read: "服务商会看到你输入的问题和 Key。你的学习记录、成绩、条目一律不会发送；涉及个人数据的 AI 功能全部关闭。",
      terms: ["API Key", "SSE 流式输出", "429 / 5xx 退避重试", "白名单", "CSP", "唯一网络出口", "隐私隔离 / fail-closed"]
    },
    calib: {
      n: "校准与模型", level: "进阶", group: "严谨性",
      title: "检查「系统猜你记不记得住」猜得准不准",
      what: "用一个预测公式估计记忆留存，再拿你的真实记录检验它，必要时调整。",
      why: "公式不准，后面的复习排期就是瞎排。这页负责回答「能不能信这个预测」。",
      steps: ["先点「重跑校准」，看预测和实际的差距", "数据够了再点「拟合参数」，让它更贴合你", "看「可识别性清单」，标着不确定的就别硬用", "需要更多证据就「生成探针计划」"],
      read: "只用过去的数据调、拿后来的数据验（前推验证）。数据太少时，正确结论是「不确定」。",
      terms: ["留存模型", "校准", "前推验证", "参数拟合", "可识别性", "探针", "合成数据", "N=1"]
    },
    exp: {
      n: "预注册实验", level: "进阶", group: "严谨性",
      title: "先说好怎么比，再开始比",
      what: "在收集数据之前，把「要比什么、怎么分组、怎样算赢」写清楚并锁住。",
      why: "防止事后挑对自己有利的数据、或者偷看结果后偷偷改规则。",
      steps: ["按「预注册必填清单」逐项填好", "点「封存预注册 + 分配表」锁定方案", "按分配表执行，别提前下结论", "结束后「生成完整报告」"],
      read: "结论只有三档：支持 / 不支持 / 不确定。中途放弃的也要算进分母（ITT）。",
      terms: ["预注册", "分配表", "封存", "ITT 分母", "防 peeking", "实验结论三档", "N=1"]
    },
    labdiag: {
      n: "实验室信效度", level: "进阶", group: "严谨性",
      title: "检查小测验本身靠不靠谱",
      what: "诊断那几个认知小任务：结果稳不稳、测的是不是真想测的东西。",
      why: "如果测验自己都不稳定，基于它得出的任何变化都说明不了问题。",
      steps: ["先做若干次任务，攒够记录", "打开本页看信效度诊断结果", "指标不理想时，把它当探索性参考，别下结论"],
      read: "这里的任务都是原型，不是标准化测验；不输出分数、排名或能力画像。",
      terms: ["信效度", "探索性", "不做诊断", "N=1"]
    },
    metrics: {
      n: "指标治理", level: "进阶", group: "严谨性",
      title: "决定哪些数字能信、能不能显示",
      what: "给每个指标登记定义、可信等级和使用红线，并决定它出现在哪一层。",
      why: "避免把还在探索的数字当成成绩，甚至拿去排名。",
      steps: ["看「指标注册表」，找到你想了解的那个数字", "对照「红线」检查它有没有被滥用", "用「保留 / 移入研究层 / 停用」调整显示位置"],
      read: "A 级才可直接相信；B/C/D 级必须附带样本量、时间段、算法版本和免责说明。",
      terms: ["指标注册表", "A 级指标", "B / C / D 级指标", "红线", "定义版本 definitionVersion", "同屏免责"]
    },
    data: {
      n: "数据与导出", level: "入门", group: "可选",
      title: "备份、导出、恢复你的数据",
      what: "把数据打包存成文件，或者从备份文件恢复；顺便检查记录有没有断链。",
      why: "数据只在本机浏览器里，清缓存或换设备前一定要导出一份。",
      steps: ["点「导出完整包」保存一份 JSON 到本机", "需要表格就导 JSONL 或 CSV", "换设备时用「导入」选备份文件", "偶尔点「校验事件链」确认流水账没断"],
      read: "导出前会自动遮掉可能暴露隐私的字段并全文复核一遍，但仍建议你自己再看一眼。",
      terms: ["L1 主状态", "L2 事件层", "schema v4 / v6", "脱敏", "manifest 清单", "JSONL / CSV", "FNV 哈希链"]
    },
    lab: {
      n: "实验室（原型）", level: "进阶", group: "探索",
      title: "五个小任务，看看当下的状态",
      what: "做几组简短的认知小任务，留下记录供长期观察。",
      why: "给自己多一个观察维度，但结果只供探索，不用来评判能力强弱。",
      steps: ["点「开始」按提示完成一轮", "看「本轮结果」和「最近成绩」", "想看长期变化，需要攒够 10 次以上独立施测"],
      read: "这是原型任务，不是标准测验；纵向关联只是「一起变」，不代表因果。",
      terms: ["探索性", "纵向关联", "信效度", "不做诊断"]
    },
    net: {
      n: "知识网络", level: "入门", group: "探索",
      title: "把知识点连成关系图",
      what: "给两条内容标上「先学哪个」或「互相关联」，看整体结构。",
      why: "看清哪些是基础、哪些是孤岛，复习时更有章法。",
      steps: ["先去「录入」多记几条内容", "回到本页，选两条内容再选关系类型", "点「连边」保存"],
      read: "「重学节省率」只是粗略估计，出现「忘了又重新答对」之后才会算。",
      terms: ["知识网络", "前置关系 prereq", "关联关系 relates", "重学节省率 savings", "条目"]
    },
    proto: {
      n: "训练协议", level: "进阶", group: "探索",
      title: "一套可以照着做的练习方案",
      what: "收录若干训练协议，并列出做自我实验前必须落实的 7 件事。",
      why: "想认真比较两种学习方法时，先有个成型的方案，不用从零设计。",
      steps: ["先看「开始实验前必须落实的 7 项」", "选一个协议点「启用（仅记录）」", "真要下结论，请配合「预注册实验」页"],
      read: "协议库本身不能裁决哪种方法更好；当前状态明确标为「不可裁决」。",
      terms: ["预注册", "N=1", "实验结论三档", "防 peeking"]
    },
    find: {
      n: "检索与回放", level: "入门", group: "可选",
      title: "搜全库、存快照、检查备份",
      what: "在本机所有记录里搜关键词，保存/恢复快照，或拿一个导出包做只读检查。",
      why: "记多了找不着、或者误导入了想退回去，都在这页解决。",
      steps: ["在搜索框输入词，点「检索」，下面会出结果和关系图", "重要操作前点「创建快照」，需要时按「恢复 L1」", "拿到旧备份，选文件后点「回放校验」"],
      read: "恢复只退回「活页本」，流水账不会退回（历史不能被抹掉），恢复动作本身会被记录。回放只检查包内自洽，不证明来源真实。",
      terms: ["BM25", "倒排索引", "中文分词 / bigram", "确定性布局", "快照", "diff 差异对比", "恢复 L1", "audit 事件", "回放", "manifest 清单"]
    },
    methods: {
      n: "方法与完整性", level: "进阶", group: "严谨性",
      title: "结论稳不稳、数据有没有被动过",
      what: "三件事：给流水账做带口令的封条、评估缺失数据会不会翻结论、给单人数据做统计检验。",
      why: "让「我这个结论到底有多可靠」有据可查，而不是只看一个漂亮数字。",
      steps: ["点「校验当前链」看本地记录是否连贯；要外部比对就「生成锚点」并设口令", "点「运行分析」看缺失数据下结论还稳不稳", "点「生成报告」看单案例统计结果"],
      read: "锚点不是防伪：口令只在本页内存、用完即清，封条必须存到别的设备才有意义。敏感性分析不补齐缺失数据；统计再严谨，N=1 也仍然不能推广。",
      terms: ["FNV 哈希链", "HMAC 锚点", "PBKDF2 / Web Crypto", "append-only", "L2 事件层", "敏感性分析", "tipping point", "complete-case", "随机化检验", "bootstrap 置信区间", "NAP", "lag-1 自相关", "SCED 单案例实验设计", "N=1"]
    },
    demo: {
      n: "示例内容馆", level: "入门", group: "日常",
      title: "先看看有内容的样子，再决定要不要用",
      what: "这里放了一批现成的示例题目，带参考答案、评分要点、常见错误和一条条给的提示，可以随便翻。",
      why: "以前第一次打开，检索是空的、知识网络没有节点、复习队列也没东西。先逛一圈示例，就知道每个功能到底在干嘛。",
      steps: ["用学科、难度或搜索框挑几条，点开看答案和要点", "卡住时点「再来一条提示」，一次只多给一条", "想让其他页面也有东西可试，点「载入示例到我的库」", "试完点「清除我载入的示例」，你自己记的内容一条都不会少"],
      read: "示例默认不写入。载入后概览卡、复习队列和知识网络会有内容可试，但这些数字不代表你的学习情况：不计入经验正确率、个人学习数据档案，也不会进导出包。顶部会出现「演示模式」提示。",
      terms: ["示例内容包", "演示模式", "要点核验", "分层提示", "错因分类", "学科分类词表", "知识网络", "个人数据不外发"]
    }
  };

  const ORDER = ["observe", "review", "add", "plan", "ai", "calib", "exp", "labdiag",
    "metrics", "data", "lab", "net", "proto", "find", "methods", "demo"];

  function hasPage(tab) { return tab === "home" || tab === "glossary"; }
  function guides() { return PAGE; }
  function guideKeys() { return ORDER.slice(); }
  function currentTab() { return lastTab; }

  /* ---------------- 说明卡 ---------------- */
  function guideHTML(tab) {
    const g = PAGE[tab];
    if (!g) return "";
    const chips = g.terms.map(t => {
      const item = G() && G().get(t);
      return `<button type="button" class="term-chip" data-term="${esc(t)}" title="${item ? esc(item.plain) : ""}">${esc(t)}</button>`;
    }).join("");
    return `<section class="guide" data-plain-card data-plain-for="${esc(tab)}">
  <div class="guide-bar">
    <span class="guide-kicker"><i class="dot"></i> 本页说明</span>
    <span class="guide-meta"><span class="lv lv-${g.level === "入门" ? "base" : "adv"}">${esc(g.level)}</span><span class="sep">·</span>${esc(g.n)}</span>
    <button type="button" class="guide-fold" data-guide-fold>收起说明</button>
  </div>
  <h2 class="guide-title">${esc(g.title)}</h2>
  <p class="guide-what">${esc(g.what)}</p>
  <div class="guide-grid">
    <div class="guide-cell"><span class="guide-label">对我有什么用</span><p>${esc(g.why)}</p></div>
    <div class="guide-cell"><span class="guide-label">我该点哪里</span><ol>${g.steps.map(s => "<li>" + esc(s) + "</li>").join("")}</ol></div>
    <div class="guide-cell"><span class="guide-label">结果怎么读</span><p>${esc(g.read)}</p></div>
  </div>
  <div class="guide-terms"><span class="guide-label">本页名词（点开看白话）</span><div class="term-chips">${chips}</div>
    <div class="term-pop" data-term-pop hidden></div>
  </div>
</section>`;
  }

  function mount(tab, pane) {
    lastTab = tab;
    if (!pane) return;
    // 先清掉上一次插入的卡，保证幂等
    try {
      const old = pane.querySelector ? pane.querySelector("[data-plain-card]") : null;
      if (old && old.remove) old.remove();
    } catch (_) {}
    if (!isOn() || !PAGE[tab]) return;
    const html = guideHTML(tab);
    if (typeof pane.insertAdjacentHTML === "function") pane.insertAdjacentHTML("afterbegin", html);
    else pane.innerHTML = html + pane.innerHTML; // 最小 DOM 桩回退（桩无事件，重建无副作用）
    try {
      const fold = pane.querySelector ? pane.querySelector("[data-guide-fold]") : null;
      if (fold) fold.onclick = () => {
        const card = pane.querySelector("[data-plain-card]");
        if (card && card.classList) card.classList.toggle("folded");
        fold.textContent = fold.textContent === "收起说明" ? "展开说明" : "收起说明";
      };
      const pop = pane.querySelector ? pane.querySelector("[data-term-pop]") : null;
      const chips = pane.querySelectorAll ? pane.querySelectorAll(".term-chip[data-term]") : [];
      Array.prototype.forEach.call(chips, c => {
        c.onclick = () => {
          if (!pop) return;
          const item = G() && G().get(c.getAttribute("data-term"));
          if (!item) return;
          pop.innerHTML = `<b>${esc(item.term)}</b>：${esc(item.plain)}${item.detail ? `<span class="term-more">${esc(item.detail)}</span>` : ""}`;
          pop.hidden = false;
        };
      });
    } catch (_) {}
  }

  /* ---------------- 首页导览 ---------------- */
  const GROUPS = [
    { title: "每天都会用", sub: "记录 → 复习 → 看结果", items: [
      ["home", "开始使用", "三分钟看懂这个工具，照着三步走就行"],
      ["demo", "示例内容馆", "打开就有内容可看，先看例子再上手"],
      ["observe", "观测站", "今天该学什么、学得怎么样"],
      ["review", "今日复习", "先回忆再对答案，一条条过"],
      ["add", "录入 / 档案", "记下要学的内容和答案"],
      ["plan", "计划 PlanGen", "自动排出今天能做完的复习量"]
    ]},
    { title: "数据与可选功能", sub: "备份、搜索、问点通用问题", items: [
      ["data", "数据与导出", "换设备前记得导出一份"],
      ["find", "检索与回放", "搜全库、存快照、检查备份"],
      ["ai", "AI 引擎", "只问通用问题，完全可选"],
      ["glossary", "名词解释", "看不懂的词，这里都有白话"]
    ]},
    { title: "想知道数字准不准", sub: "进阶 · 不日常使用也没关系", items: [
      ["calib", "校准与模型", "检查预测猜得准不准"],
      ["metrics", "指标治理", "哪些数字能信、能显示"],
      ["labdiag", "实验室信效度", "小测验本身靠不靠谱"],
      ["methods", "方法与完整性", "结论稳不稳、数据有没有被动过"]
    ]},
    { title: "想认真做一次自我实验", sub: "进阶 · 需要耐心和记录量", items: [
      ["exp", "预注册实验", "先说好怎么比，再开始比"],
      ["proto", "训练协议", "照着做的练习方案"],
      ["lab", "实验室（原型）", "五个小任务，只供探索"],
      ["net", "知识网络", "把知识点连成关系图"]
    ]}
  ];

  function stats() {
    try {
      const st = window.CS && window.CS.state;
      if (!st) return null;
      // v11：概览只数「你自己的」条目，演示内容不把 KPI 撑大
      const real = (window.CS && window.CS.realItems) ? window.CS.realItems()
        : (Array.isArray(st.items) ? st.items : []);
      const items = real.length;
      const due = real.filter(i => i && (!i.reviews || !i.reviews.length)).length;
      return { items, due };
    } catch (_) { return null; }
  }

  function homeHTML() {
    const s = stats();
    const kpi = s ? `<div class="hero-kpi">
        <div><b>${s.items}</b><span>已录入条目</span></div>
        <div><b>${s.due}</b><span>还没复习过</span></div>
        <div><b>本机</b><span>数据存放位置</span></div>
      </div>` : `<div class="hero-kpi"><div><b>本机</b><span>数据存放位置</span></div><div><b>离线</b><span>无需联网</span></div><div><b>0</b><span>第三方依赖</span></div></div>`;
    const groups = GROUPS.map((g, i) => `<section class="map-group">
      <div class="map-head"><span class="map-idx">0${i + 1}</span><div><h3>${esc(g.title)}</h3><p>${esc(g.sub)}</p></div></div>
      <div class="map-cards">${g.items.map(([k, n, d]) => `<button type="button" class="map-card" data-go="${k}">
        <span class="map-card-t">${esc(n)}</span><span class="map-card-d">${esc(d)}</span><span class="map-card-a">打开 →</span>
      </button>`).join("")}</div></section>`).join("");
    return `<section class="hero">
      <div class="hero-tag">个人学习记录与观测平台 · v11</div>
      <h1>把「学过什么、记得牢不牢」<br>变成看得懂的几张图</h1>
      <p class="hero-sub">记下来、按时复习、看看趋势。数据只存在你这台设备的浏览器里，不上传、不联网也能用。</p>
      <div class="hero-actions">
        <button type="button" class="btn primary" data-go="add">录入第一条内容</button>
        <button type="button" class="btn ghost" data-go="demo">先看示例内容 →</button>
        <button type="button" class="btn ghost" data-go="glossary">先看名词解释</button>
      </div>
      ${kpi}
    </section>

    <section class="tryfirst">
      <div class="tryfirst-t"><b>第一次打开，里面是空的？</b><span>正常。所有图表都来自你自己记的内容，所以刚开始什么都没有。</span></div>
      <p>新加的「示例内容馆」放了一批带答案、要点和易错点的现成题目：可以先翻一翻，看看检索、复习、知识网络长什么样；想让其他页面也有东西可试，点一下「载入示例」就行，随时能一键清除，不会算进你的学习数据。</p>
      <button type="button" class="btn" data-go="demo">去示例内容馆看看 →</button>
    </section>

    <section class="steps">
      <div class="sec-head"><span class="sec-kicker">HOW TO START</span><h2>三步开始用</h2><p>不用先学任何概念，照着做完这页就够了。</p></div>
      <div class="step-grid">
        <div class="step"><span class="step-n">01</span><h3>记一条</h3><p>去「录入 / 档案」，写下想记住的内容和参考答案，选个分类保存。</p><button type="button" class="link" data-go="add">去录入 →</button></div>
        <div class="step"><span class="step-n">02</span><h3>每天过一遍</h3><p>「今日复习」会列出到期的条目。先自己回忆，再对答案，如实选把握程度。</p><button type="button" class="link" data-go="review">去复习 →</button></div>
        <div class="step"><span class="step-n">03</span><h3>看一眼趋势</h3><p>「观测站」自动汇总，告诉你哪些快忘了、哪段时间状态好、今天该做什么。</p><button type="button" class="link" data-go="observe">看总览 →</button></div>
      </div>
    </section>

    <section class="map">
      <div class="sec-head"><span class="sec-kicker">FEATURE MAP</span><h2>按你要做的事，找到对应页面</h2><p>共 18 个页面。带「进阶」标注的属于研究层，日常使用可以完全不碰。</p></div>
      ${groups}
    </section>

    <section class="honest">
      <div class="sec-head"><span class="sec-kicker">先说清楚</span><h2>它不是什么</h2></div>
      <div class="honest-grid">
        <div><b>不是诊断工具</b><p>不是体检、不是智商测验、不是医疗器械；不输出分数、排名或能力画像。</p></div>
        <div><b>不是通用结论</b><p>只有你一个人的数据（N=1），结论只对你和这段时间有效，不能推广到别人。</p></div>
        <div><b>不是绝对安全</b><p>本地记录可被有本机权限的人改动；哈希链和封条都不是密码学防伪。</p></div>
        <div><b>不会偷偷上传</b><p>只有 AI 问答这一处能联网，且只发送你手动输入的通用问题；个人数据相关功能全部关闭。</p></div>
        <div><b>示例不等于成绩</b><p>示例内容只用来试用功能，不计入经验正确率与个人学习档案，也不会进导出包；随时可一键清除。</p></div>
      </div>
      <p class="honest-foot">看不懂的词，随时点右上角「名词解释」；每页顶部也可以关掉通俗说明。</p>
    </section>`;
  }

  /* ---------------- 名词解释页 ---------------- */
  function glossaryHTML(q, cat) {
    const g = G();
    const cats = g ? g.cats() : [];
    const rows = g ? g.query(q, cat) : [];
    const chips = ["全部"].concat(cats).map(c =>
      `<button type="button" class="cat-chip${(cat || "全部") === c ? " on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    const body = rows.length ? rows.map(r => `<tr>
        <td class="gt">${esc(r.term)}</td>
        <td>${esc(r.plain)}${r.detail ? `<div class="gd">${esc(r.detail)}</div>` : ""}</td>
        <td class="gw">${esc(r.cat)}<div class="gwhere">${esc(r.where)}</div></td>
      </tr>`).join("") : `<tr><td colspan="3" class="empty">没找到相关名词，换个词试试，或点「全部」。</td></tr>`;
    return `<section class="glos">
      <div class="sec-head"><span class="sec-kicker">GLOSSARY</span><h2>名词解释</h2>
        <p>这里把平台里的专业说法都翻成了一句白话。共 ${g ? g.count() : 0} 条，可搜索、可按类筛选。</p></div>
      <div class="glos-tools">
        <input class="inp glos-search" id="glosQ" type="search" placeholder="搜索术语，例如：预注册 / 快照 / N=1" value="${esc(q || "")}">
        <span class="glos-count" id="glosCount">显示 ${rows.length} 条</span>
      </div>
      <div class="cat-chips">${chips}</div>
      <div class="glos-tip">小技巧：在任何页面顶部点「本页名词」里的词，也能直接看到白话解释。</div>
      <table class="glos-table"><thead><tr><th>术语</th><th>一句话白话</th><th>分类 / 出现在</th></tr></thead><tbody>${body}</tbody></table>
    </section>`;
  }

  function renderPage(tab, pane) {
    if (!pane) return;
    if (tab === "home" || tab === "glossary") {
      pane.innerHTML = tab === "home" ? homeHTML() : glossaryHTML("", "全部");
      bindPage(tab, pane, "", "全部");
    }
  }

  function bindPage(tab, pane, q, cat) {
    try {
      const goBtns = pane.querySelectorAll ? pane.querySelectorAll("[data-go]") : [];
      Array.prototype.forEach.call(goBtns, b => {
        b.onclick = () => { if (window.APP && window.APP.go) window.APP.go(b.getAttribute("data-go")); };
      });
      if (tab === "glossary") {
        const input = pane.querySelector ? pane.querySelector("#glosQ") : null;
        const rerender = (nq, ncat) => {
          pane.innerHTML = glossaryHTML(nq, ncat);
          bindPage("glossary", pane, nq, ncat);
          const again = pane.querySelector ? pane.querySelector("#glosQ") : null;
          if (again && again.focus) again.focus();
          if (again && typeof again.setSelectionRange === "function") {
            try { again.setSelectionRange(String(nq || "").length, String(nq || "").length); } catch (_) {}
          }
        };
        if (input) input.oninput = () => rerender(input.value, cat);
        const chips = pane.querySelectorAll ? pane.querySelectorAll("[data-cat]") : [];
        Array.prototype.forEach.call(chips, c => {
          c.onclick = () => rerender(q, c.getAttribute("data-cat"));
        });
      }
    } catch (_) {}
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", () => {
      const b = document.querySelector && document.querySelector("#btnPlain");
      if (b) b.onclick = () => toggle();
      syncButton();
    });
  }

  return {
    VERSION: "plain/11.0", MODE_KEY, ORDER, GROUPS,
    hasPage, guides, guideKeys, guideHTML, mount, renderPage,
    homeHTML, glossaryHTML, isOn, toggle, label, syncButton, currentTab, stats
  };
})();
