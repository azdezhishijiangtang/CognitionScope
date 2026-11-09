/* CognitionScope · lab-metrics.js —— 认知任务信效度与「收敛/下线」判定（v6）
 * ============================================================================
 * 背景：v3 的认知实验室 NORMS 全是 source:null（占位常模），与主流程无数据流耦合。
 * 改进建议书 ID-19 / v5 §6：不再维持现状，用信度门槛自动决定「收敛 or 下线」。
 *
 * 本模块提供：
 *   - pearson / ICC(2,1) 绝对一致 / ICC(3,1) 一致性
 *   - Cronbach α（多要点/多次试次的内部一致性）
 *   - 测试-重测：相关系数 + Bland–Altman bias 与 95% 一致性界限
 *   - 个体内变异 CV、练习效应（线性回归斜率 + 符号翻转置换检验）
 *   - reliabilityGate()：可判定的门槛，不靠主观感觉
 *
 * 诚实边界：
 *   - 单一系数不能宣称「任务有效」；必须同时报内容效度、信度、练习效应、设备校准
 *   - 没有人群常模就不输出 z / 百分位；定位为「每日状态观测」
 *   - 设备/浏览器差异会进入误差方差，跨设备数据须分层
 */
"use strict";
(function () {
  const VERSION = "labmetrics/6.0";
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const variance = (a, ddof) => {
    if (!a.length) return null;
    const m = mean(a), d = (ddof == null ? 1 : ddof);
    return a.length <= d ? null : a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - d);
  };
  const sd = (a, ddof) => { const v = variance(a, ddof); return v == null ? null : Math.sqrt(v); };

  function pearson(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    const mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n));
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx, b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return (dx === 0 || dy === 0) ? null : +(num / Math.sqrt(dx * dy)).toFixed(4);
  }

  /** 单因素随机/混合 ICC：rows=被试(或条目)，cols=重复测量 occasions */
  function icc(matrix, model) {
    const m = (matrix || []).filter(r => Array.isArray(r) && r.length >= 2);
    const k = m.length ? m[0].length : 0;
    if (m.length < 3 || k < 2 || m.some(r => r.length !== k)) return null;
    const n = m.length, grand = mean(m.flat());
    const rowMeans = m.map(r => mean(r));
    const colMeans = Array.from({ length: k }, (_c, j) => mean(m.map(r => r[j])));
    const grandVar = variance(m.flat(), 1);
    let MSR = 0; for (const rm of rowMeans) MSR += (rm - grand) ** 2; MSR *= k / (n - 1);
    let MSC = 0; for (const cm of colMeans) MSC += (cm - grand) ** 2; MSC *= n / (k - 1);
    let MSE = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++)
      MSE += (m[i][j] - rowMeans[i] - colMeans[j] + grand) ** 2;
    MSE /= ((n - 1) * (k - 1));
    const type = model || "ICC(2,1)";
    const value = type === "ICC(3,1)"
      ? (MSR - MSE) / (MSR + (k - 1) * MSE)                       // 一致性（不看绝对水平）
      : (MSR - MSE) / (MSR + (k - 1) * MSE + k * (MSC - MSE) / n); // 绝对一致
    if (!Number.isFinite(value)) return null;
    return { type, value: +Math.max(-1, Math.min(1, value)).toFixed(4), n, k,
      MSR: +MSR.toFixed(3), MSC: +MSC.toFixed(3), MSE: +MSE.toFixed(3), grandVar: +grandVar.toFixed(3),
      note: "ICC 高只说明重复测量稳定，不代表测到了目标构念；须另报效度" };
  }

  /** Cronbach α：items × observations（每列一个试次/要点） */
  function cronbachAlpha(matrix) {
    const m = (matrix || []).filter(r => Array.isArray(r) && r.length >= 2);
    const k = m.length ? m[0].length : 0;
    if (!m.length || k < 2 || m.some(r => r.length !== k)) return null;
    const colVars = Array.from({ length: k }, (_c, j) => variance(m.map(r => r[j]), 1));
    if (colVars.some(v => v == null)) return null;
    const totals = m.map(r => r.reduce((a, b) => a + b, 0));
    const totalVar = variance(totals, 1);
    if (!totalVar) return null;
    const a = (k / (k - 1)) * (1 - colVars.reduce((x, y) => x + y, 0) / totalVar);
    return { alpha: +Math.max(-1, Math.min(1, a)).toFixed(4), k, n: m.length,
      note: "α 高可能只是题目冗余；不是单维性或效度的证明" };
  }

  /** 测试-重测：两列配对观测 → r + Bland–Altman */
  function testRetest(pairs) {
    const p = (pairs || []).filter(x => x && Number.isFinite(x.a) && Number.isFinite(x.b));
    if (p.length < 5) return { n: p.length, status: "积累中（需 ≥5 配对）" };
    const a = p.map(x => x.a), b = p.map(x => x.b), d = p.map(x => x.b - x.a);
    const r = pearson(a, b), bias = mean(d), s = sd(d, 1);
    return {
      n: p.length, r, bias: +bias.toFixed(4), sdDiff: s == null ? null : +s.toFixed(4),
      loa95: s == null ? null : [+(bias - 1.96 * s).toFixed(4), +(bias + 1.96 * s).toFixed(4)],
      status: "已计算",
      note: "r 高也可能存在系统性漂移（看 bias/LOA）；Bland–Altman 与相关系数必须同时报告" };
  }

  /** 个体内变异 CV（按条目/任务分组） */
  function intraIndividualCV(series) {
    const xs = (series || []).filter(Number.isFinite);
    if (xs.length < 3) return { n: xs.length, cv: null, status: "积累中（需 ≥3 次）" };
    const m = mean(xs), s = sd(xs, 1);
    if (!m || s == null) return { n: xs.length, cv: null, status: "均值为 0，CV 无定义" };
    return { n: xs.length, mean: +m.toFixed(4), sd: +s.toFixed(4), cv: +(s / Math.abs(m)).toFixed(4),
      status: "已计算", note: "CV 含真实状态波动与测量误差，不能单独归因" };
  }

  /** 练习效应：随试次序号的线性斜率 + 符号翻转置换 p（配对/单序列） */
  function practiceEffect(series, opts) {
    const o = Object.assign({ perms: 2000, seed: 11 }, opts || {});
    const y = (series || []).filter(Number.isFinite);
    const n = y.length;
    if (n < 5) return { n, slope: null, p: null, status: "积累中（需 ≥5 次）" };
    const x = Array.from({ length: n }, (_v, i) => i);
    const mx = mean(x), my = mean(y);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) ** 2; }
    const slope = den ? num / den : 0;
    // 去趋势后的残差做符号翻转置换，检验斜率是否显著偏离 0
    const resid = y.map((v, i) => v - (my + slope * (x[i] - mx)));
    let s = o.seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let extreme = 0;
    for (let k = 0; k < o.perms; k++) {
      let stat = 0;
      for (let i = 0; i < n; i++) stat += (x[i] - mx) * (rnd() < 0.5 ? -1 : 1) * resid[i];
      if (Math.abs(stat / den) >= Math.abs(slope) - 1e-12) extreme++;
    }
    const p = (extreme + 1) / (o.perms + 1);
    return { n, slope: +slope.toFixed(5), permutationP: +p.toFixed(4),
      significant: p < 0.05, status: "已计算",
      note: "显著斜率表示存在练习/疲劳趋势，此时前几次施测不能当基线；须用 AB/BA 平衡或弃用早期数据" };
  }

  /** 效度清单：必须由人填写，代码不能自动判定构念效度 */
  const VALIDITY_CHECKLIST = [
    { key: "content", label: "内容效度", need: "任务是否覆盖目标构念的专家论证" },
    { key: "testRetest", label: "重测信度", need: "同一条件下两次施测的 ICC / Pearson" },
    { key: "internal", label: "内部一致性", need: "多试次 Cronbach α" },
    { key: "construct", label: "构念效度", need: "与理论相关/无关变量的分离证据" },
    { key: "criterion", label: "效标效度", need: "与外部独立标准的相关" },
    { key: "norm", label: "常模研究", need: "代表性人群常模；无则禁止 z / 百分位" },
    { key: "device", label: "设备/浏览器校准", need: "输入延迟、刷新率、显示时长的测量与分层" }
  ];

  /**
   * 可判定的收敛/下线门槛（v5 §6）。
   * 输入：{ icc, cv, practice, taskCount, days, deviceControlled, validityFilled }
   * 输出：decision = keep_converge | downgrade_to_daily_state | retire
   */
  function reliabilityGate(input) {
    const x = input || {};
    const rules = [
      { id: "G1", ok: Number.isFinite(x.icc) && x.icc >= 0.60, text: "ICC ≥ 0.60（最低可接受重测信度）" },
      { id: "G2", ok: Number.isFinite(x.cv) && x.cv <= 0.25, text: "个体内 CV ≤ 0.25（波动不过大）" },
      { id: "G3", ok: x.practice && x.practice.significant === false, text: "无显著练习/疲劳趋势" },
      { id: "G4", ok: Number.isFinite(x.taskCount) && x.taskCount <= 2, text: "任务数收敛到 1–2 个" },
      { id: "G5", ok: x.deviceControlled === true, text: "设备/浏览器条件已固定或分层" }
    ];
    const failed = rules.filter(r => !r.ok);
    let decision, reason;
    if (failed.length === 0) {
      decision = "keep_converge";
      reason = "信度与条件均达标：保留为「每日状态观测」，禁止输出 z / 常模百分位 / 能力结论";
    } else if (failed.length <= 2 && (rules[0].ok || Number.isFinite(x.icc))) {
      decision = "downgrade_to_daily_state";
      reason = "部分门槛未达标：降级为纯状态记录（原始分数 + 时间），去掉所有派生统计";
    } else {
      decision = "retire";
      reason = "两周内无法算出可接受信度：从主产品下线，历史数据只读归档";
    }
    return {
      decision, reason, failed: failed.map(r => ({ id: r.id, text: r.text })),
      passed: rules.filter(r => r.ok).map(r => r.id),
      validityFilled: x.validityFilled || [],
      validityMissing: VALIDITY_CHECKLIST.filter(v => !(x.validityFilled || []).includes(v.key)).map(v => v.label),
      caveat: "即使全部达标，也不能只用一个系数宣称任务有效；N=1 无外部效标时不得推断构念",
      definitionVersion: VERSION
    };
  }

  /** 综合报告：把各统计量一次性算齐，供研究层呈现 */
  function analyzeTask(records, opts) {
    const o = opts || {};
    const rs = (records || []).slice().sort((a, b) => a.at - b.at);
    const scores = rs.map(r => r.score).filter(Number.isFinite);
    const byAttempt = {};
    rs.forEach(r => { const k = r.attempt || 1; (byAttempt[k] = byAttempt[k] || []).push(r.score); });
    const occasions = Object.keys(byAttempt).sort().map(k => byAttempt[k]);
    const matrix = occasions.length >= 2
      ? Array.from({ length: Math.min(...occasions.map(a => a.length)) }, (_v, i) =>
          occasions.map(a => a[i]).filter(Number.isFinite))
      : null;
    const cv = intraIndividualCV(scores);
    const practice = practiceEffect(scores, { perms: o.perms || 1000 });
    const tr = occasions.length >= 2
      ? testRetest(occasions[0].map((v, i) => ({ a: v, b: occasions[1][i] })).filter(p => Number.isFinite(p.b)))
      : { n: 0, status: "需 ≥2 次重复施测" };
    const iccVal = matrix ? icc(matrix, "ICC(2,1)") : null;
    const gate = reliabilityGate({
      icc: iccVal ? iccVal.value : null, cv: cv.cv, practice,
      taskCount: o.taskCount, days: o.days, deviceControlled: o.deviceControlled,
      validityFilled: o.validityFilled
    });
    return {
      n: scores.length, span: scores.length ? { from: rs[0].at, to: rs[rs.length - 1].at } : null,
      descriptive: { mean: mean(scores) == null ? null : +mean(scores).toFixed(3), sd: sd(scores, 1) },
      cv, practice, testRetest: tr, icc: iccVal,
      cronbachAlpha: matrix ? cronbachAlpha(matrix) : null,
      gate, validityChecklist: VALIDITY_CHECKLIST,
      outputPolicy: "不输出 z / 百分位 / 能力画像；只输出原始分数、个体内变化与信度诊断",
      definitionVersion: VERSION
    };
  }

  window.LABM = {
    VERSION, VALIDITY_CHECKLIST, mean, variance, sd, pearson, icc, cronbachAlpha,
    testRetest, intraIndividualCV, practiceEffect, reliabilityGate, analyzeTask
  };
})();
