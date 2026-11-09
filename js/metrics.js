/* CognitionScope · metrics.js —— 指标注册表 / 证据分级 / 红线 / 层间瘦身（v6）
 * ============================================================================
 * 把 v3 的「A/B/C/D 证据分级 + 5 条红线」从 UI 文案升级为可执行的数据契约。
 * 每个指标必须先登记才能显示；未登记的数字一律不得出现在界面上。
 * 每个指标带 definitionVersion，口径变化必须升版本，旧快照不重判。
 *
 * 双层架构（v5 §7）：
 *   工具层（日常）：只放 A 级 + 已通过校准的少量 B 级，界面干净
 *   研究层（独立页）：全量 B/C/D，全部带免责、n、时间范围、定义版本
 */
"use strict";
(function () {
  const VERSION = "metrics/6.0";

  const GRADES = {
    A: { label: "直接记录", color: "#61AB83", desc: "来自录入/核验的客观计数，可复算", rankable: true },
    B: { label: "模型估计", color: "#3B82F6", desc: "依赖 r(t) 等模型假设，须附校准状态与 paramVersion", rankable: false },
    C: { label: "探索性", color: "#D9A441", desc: "观察性分组/相关，禁止排名与能力结论", rankable: false },
    D: { label: "占位/假设", color: "#D26A5C", desc: "常模占位或待验证假设，不得导出为结论", rankable: false }
  };

  /* 指标注册表：id → 定义。compute 为惰性函数（由宿主注入数据源） */
  const METRICS = {
    dueCount:        { label: "到期复习条数", grade: "B", source: "CS.findDue", requiresCalibration: true,
                       toolLayer: true, unit: "条", disclaimer: "由未校准的 r<0.9 阈值生成" },
    itemsTotal:      { label: "知识条目数", grade: "A", source: "state.items.length", toolLayer: true,
                       unit: "条", disclaimer: "直接计数" },
    reviews7d:       { label: "近 7 天复习次数", grade: "A", source: "state.items[].reviews", toolLayer: true,
                       unit: "次", disclaimer: "直接计数" },
    verifiedAccuracy:{ label: "已核验正确率", grade: "A", source: "VERIFY.verifiedAccuracy", toolLayer: true,
                       unit: "%", disclaimer: "仅 verified 记录进分母；附 n 与 Wilson 区间" },
    selfRatedPass:   { label: "自评达标率", grade: "B", source: "VERIFY.selfRatedPassRate", toolLayer: true,
                       unit: "%", disclaimer: "与 outcome 同源，不等于客观正确率" },
    calibrationBrier:{ label: "留存预测 Brier", grade: "B", source: "CAL.scoreTable", requiresCalibration: true,
                       toolLayer: true, unit: "", disclaimer: "须与常数基线同屏比较，单独数字无意义" },
    calibrationVerdict:{ label: "模型判定", grade: "B", source: "CAL.evaluate", requiresCalibration: true,
                       toolLayer: false, unit: "", disclaimer: "须附 nTrain/nTest/paramVersion/MISD" },
    reliabilityCurve:{ label: "可靠性曲线", grade: "B", source: "CAL.reliability", requiresCalibration: true,
                       toolLayer: false, unit: "", disclaimer: "空桶必须显示「无观测」，不得插值" },
    thresholdFrontier:{ label: "阈值前沿", grade: "C", source: "CAL.thresholdFrontier", toolLayer: false,
                       unit: "", disclaimer: "反事实估计；低 τ 不可评估时须标注需延迟探针" },
    mastery:         { label: "掌握度", grade: "B", source: "CS.masteryOf", toolLayer: false,
                       banned: true, disclaimer: "模型未校准前禁止展示；校准后仍须更名「留存分档」" },
    rHat:            { label: "经验正确率 rHat", grade: "B", source: "CS.fitParams", toolLayer: false,
                       unit: "", disclaimer: "固定先验收缩，不是模型收敛；不得写作能力值" },
    biasPct:         { label: "元认知偏差", grade: "C", source: "VERIFY.metacogCalibration", toolLayer: false,
                       unit: "%", disclaimer: "v3 口径同源自评；v6 仅在有独立核验配对时计算" },
    zMean:           { label: "实验室 z 均值", grade: "C", source: "state.lab[].zRaw", toolLayer: false,
                       unit: "", disclaimer: "占位常模下的探索性均值，无人群可比性" },
    pcmLabPct:       { label: "PCM 实验室百分位", grade: "D", source: "占位常模 pct", toolLayer: false,
                       banned: true, disclaimer: "占位常模，导出必须移除，避免脱离免责被误读成人群百分位" },
    timeOfDayBest:   { label: "黄金时段", grade: "C", source: "E2.timeOfDay", toolLayer: false,
                       unit: "", disclaimer: "未控制难度/学科/疲劳与选择偏差，不能据此认定黄金时段" },
    domainEff:       { label: "学科校准差", grade: "C", source: "E2.fitByDomain", toolLayer: false,
                       unit: "", disclaimer: "探索性分组统计，禁止按 eff 排名" },
    interleavedDiff: { label: "交错 vs 集中差值", grade: "C", source: "E2.abCompare", toolLayer: false,
                       disclaimer: "观察性分组，不是随机对照试验，不能推断因果" },
    experimentEffect:{ label: "实验效应量", grade: "C", source: "EXP.analyze", toolLayer: false,
                       disclaimer: "须附 bootstrap 区间、置换 p、ITT、N=1 不可推广声明" },
    icc:             { label: "任务重测信度 ICC", grade: "C", source: "LABM.icc", toolLayer: false,
                       disclaimer: "单一系数不能宣称任务有效；须同时报 CV 与练习效应" },
    futureLoad:      { label: "未来 7 天负荷", grade: "B", source: "CS.futureLoad", requiresCalibration: true,
                       toolLayer: false, disclaimer: "假设每天按容量复习且全部成功回忆；非数学最优" }
  };

  /* 五条红线（v3 已有，v6 变成可执行检查） */
  const RED_LINES = [
    { id: "R1", rule: "探索性指标（C/D）禁止排名、禁止「能力/智力/强弱」措辞",
      test: (m, ctx) => (m.grade === "C" || m.grade === "D") && ctx && (ctx.ranked || /能力|智力|强弱|高低/.test(ctx.text || "")) },
    { id: "R2", rule: "免责声明必须与数字同屏、等权（不得缩成小字或折叠）",
      test: (m, ctx) => ctx && ctx.disclaimerHidden === true },
    { id: "R3", rule: "B 级模型估计必须标注 paramVersion 与校准状态",
      test: (m, ctx) => m.grade === "B" && ctx && (ctx.paramVersion == null || ctx.calibrationStatus == null) },
    { id: "R4", rule: "A 级正确率分母必须只含 verified；禁止用 grade 回填",
      test: (m, ctx) => m.id === "verifiedAccuracy" && ctx && ctx.denominatorIncludesSelf === true },
    { id: "R5", rule: "D 级占位值与 banned 指标不得展示、不得导出为结论",
      test: (m, ctx) => m.banned === true || m.grade === "D" },
    { id: "R6", rule: "模型未通过校准（modelHasSignal=false）时禁止输出「掌握度」类结论",
      test: (m, ctx) => m.requiresCalibration && ctx && ctx.modelHasSignal === false },
    { id: "R7", rule: "任何结论必须附 n、时间范围与 definitionVersion",
      test: (_m, ctx) => ctx && ctx.hasConclusion && (ctx.n == null || ctx.dataRange == null || ctx.definitionVersion == null) }
  ];

  /** 检查一个指标在给定上下文下是否触碰红线，返回违规列表 */
  function checkRedLines(metricId, ctx) {
    const m = METRICS[metricId];
    if (!m) return [{ id: "R0", rule: "未登记的指标不得展示：" + metricId }];
    const full = Object.assign({ id: metricId }, m);
    const hits = [];
    for (const r of RED_LINES) {
      try { if (r.test(full, ctx || {})) hits.push({ id: r.id, rule: r.rule }); }
      catch (e) { hits.push({ id: r.id, rule: "检查异常：" + e.message }); }
    }
    return hits;
  }

  /** 层间过滤：工具层只留 A + 已校准的少量 B；研究层全量但 D/banned 仍排除 */
  function filterForLayer(layer, ctx) {
    const c = ctx || {};
    const list = Object.keys(METRICS).map(id => {
      const m = Object.assign({ id }, METRICS[id]);
      return { metric: m, violations: checkRedLines(id, Object.assign({ layer }, c)) };
    });
    if (layer === "tool") {
      return {
        layer, shown: list.filter(x => x.metric.toolLayer && !x.metric.banned && x.metric.grade !== "D" &&
          (!x.metric.requiresCalibration || c.modelHasSignal !== false) && x.violations.length === 0)
          .map(x => x.metric.id),
        suppressed: list.filter(x => !x.metric.toolLayer || x.metric.banned || x.metric.grade === "D" ||
          (x.metric.requiresCalibration && c.modelHasSignal === false) || x.violations.length)
          .map(x => ({ id: x.metric.id, reason: x.violations.length ? x.violations.map(v => v.id).join(",") : "研究层指标" }))
      };
    }
    return {
      layer: "research",
      shown: list.filter(x => !x.metric.banned && x.metric.grade !== "D").map(x => x.metric.id),
      suppressed: list.filter(x => x.metric.banned || x.metric.grade === "D")
        .map(x => ({ id: x.metric.id, reason: x.metric.disclaimer }))
    };
  }

  function badge(grade) {
    const g = GRADES[grade] || GRADES.D;
    return { grade, label: g.label, color: g.color, rankable: g.rankable,
      html: '<span class="badge" style="color:' + g.color + '">' + g.label + '</span>' };
  }

  /** 指标瘦身表：把 v3 观测站的一堆 C 级卡片替换成少量高信息量指标 */
  function slimReport(ctx) {
    const c = ctx || {};
    const f = filterForLayer("tool", c);
    const keep = [
      { id: "itemsTotal", why: "直接记录，无需模型" },
      { id: "reviews7d", why: "直接记录，反映投入" },
      { id: "verifiedAccuracy", why: "A 级，替代一批自评衍生指标" },
      { id: "dueCount", why: "唯一可行动输出；须标注校准状态" }
    ];
    const drop = [
      { id: "rHat", why: "固定先验收缩值，与「正确率」重复且易被误读" },
      { id: "biasPct", why: "v3 口径同源自评，移入研究层并改为独立核验配对" },
      { id: "zMean", why: "占位常模，移入研究层" },
      { id: "timeOfDayBest", why: "混淆严重，移入研究层" },
      { id: "domainEff", why: "探索性分组，移入研究层" },
      { id: "interleavedDiff", why: "观察性分组，移入研究层" },
      { id: "mastery", why: "模型未校准前禁用；校准后更名「留存分档」" },
      { id: "pcmLabPct", why: "占位常模，禁止展示与导出" }
    ];
    return { version: VERSION, toolLayerShown: f.shown, keep, drop,
      note: "指标变少，信息量变大：删掉同源自评与占位常模派生值，保留可行动输出与可校准量",
      rule: "任何新增指标必须先在 METRICS 登记并带 definitionVersion，否则界面不得显示" };
  }

  /** 给任意指标值套上统一的呈现包装（强制 n / 范围 / 版本 / 同屏免责） */
  function present(metricId, value, ctx) {
    const m = METRICS[metricId];
    if (!m) throw new Error("未登记的指标：" + metricId);
    const c = ctx || {};
    const violations = checkRedLines(metricId, c);
    return {
      id: metricId, label: m.label, grade: m.grade, badge: badge(m.grade),
      value: violations.length ? null : value,
      hidden: violations.length > 0, violations,
      unit: m.unit || "", disclaimer: m.disclaimer,
      n: c.n == null ? null : c.n,
      dataRange: c.dataRange || null,
      definitionVersion: c.definitionVersion || VERSION,
      paramVersion: c.paramVersion || null,
      calibrationStatus: c.calibrationStatus || null,
      note: c.note || null
    };
  }

  window.METRICS = {
    VERSION, GRADES, METRICS, RED_LINES,
    checkRedLines, filterForLayer, badge, slimReport, present
  };
})();
