/* CognitionScope · lab.js —— 认知实验室：五任务原型 + 自适应楼梯 + 校正引擎（v3）
   v2 重点：修掉题目自泄露答案、选项重复、刺激不呈现、量纲错配、相关系数退化。
   仍然是交互原型：无题库、无常模来源、无信效度证据，不得输出能力或人群百分位结论。 */
"use strict";
window.LAB = (function () {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const DAY = 86400000;
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const pctOf = z => Math.round(100 * (0.5 * (1 + erf(z / Math.SQRT2))));
  function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911; const t=1/(1+p*x); const y=1-(((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t)*Math.exp(-x*x); return s*y; }

  /* ---------- 任务生成器（v2：答案不再写在题干里、选项不重复、刺激可呈现） ---------- */
  const SHAPES = ["▲", "●", "■", "◆"];
  const FILLS = ["", "▮"];
  const COLORS = [["红", "#D26A5C"], ["蓝", "#3B82F6"], ["绿", "#61AB83"], ["黄", "#D9A441"]];

  function gen(kind, diff, cond) {
    diff = diff || 3;
    if (kind === "matrix") {
      // 3 项已知序列：形状循环 +1、填充交替；求第 4 项。题干不含答案。
      const s0 = rnd(4), f0 = rnd(2);
      const cell = i => SHAPES[(s0 + i) % 4] + FILLS[(f0 + i) % 2];
      const shown = [cell(0), cell(1), cell(2)].join("  →  ") + "  →  ?";
      const a = cell(3);
      const opts = new Set([a]);
      let guard = 0;
      while (opts.size < 4 && guard++ < 60) {
        opts.add(SHAPES[rnd(4)] + FILLS[rnd(2)]);
      }
      return { kind, q: "按规律补全序列：" + shown + "　（形状循环、填充交替）", a, opts: shuffle([...opts]),
        render: "text", rule: "shape+1 / fill-alternate" };
    }
    if (kind === "digit") {
      const len = 2 + diff;
      let s = ""; for (let i = 0; i < len; i++) s += rnd(10);
      return { kind, q: s, a: s, opts: null, span: len, render: "flash",
        flashMs: 700 + len * 120, note: "刺激短暂呈现后遮蔽，靠记忆复述" };
    }
    if (kind === "stroop") {
      const [word] = COLORS[rnd(4)];
      let pair;
      if (cond === "congruent") pair = COLORS.find(c => c[0] === word);
      else { const others = COLORS.filter(c => c[0] !== word); pair = others[rnd(others.length)]; }
      if (!pair) pair = COLORS[0];
      return { kind, q: word, ink: pair[1], a: pair[0], opts: shuffle(COLORS.map(c => c[0])),
        cond: cond || "incongruent", render: "stroop", note: "按墨水颜色作答，不是按字义" };
    }
    if (kind === "rotate") {
      const degs = [0, 90, 180, 270], target = degs[rnd(4)];
      // 题干给出目标角度是标准做法；关键是选项必须呈现「旋转后的图形」，而不是角度数字。
      return { kind, q: "原图：◤　下面哪一个是它顺时针旋转 " + target + "° 后的样子？",
        a: String(target), opts: degs.map(String), shape: "◤", target, render: "rotate",
        note: "选项由 UI 用 CSS transform 渲染为旋转后的图形" };
    }
    if (kind === "series") {
      const a0 = 2 + rnd(5), d = 2 + rnd(4);
      const seq = [a0, a0 + d, a0 + 2 * d, a0 + 3 * d, a0 + 4 * d];
      const correct = a0 + 5 * d;
      const opts = new Set([String(correct)]);
      const cands = [correct + d, correct - d, correct + 2 * d, correct - 1, correct + 1, a0 + 4 * d];
      for (const c of cands) { if (opts.size >= 4) break; opts.add(String(c)); }
      return { kind, q: seq.join(", ") + ", ?", a: String(correct), opts: shuffle([...opts]), render: "text",
        rule: "arithmetic progression" };
    }
    return null;
  }

  /* ---------- 自适应楼梯（原型，未经 IRT 验证） ---------- */
  function staircase(history, lastDiff) {
    const h = history.slice(-2);
    if (h.length === 2 && h[0] && h[1]) return Math.min(8, (lastDiff || 3) + 1);
    if (h.length === 2 && !h[0] && !h[1]) return Math.max(1, (lastDiff || 3) - 1);
    return lastDiff || 3;
  }

  /* ---------- 会话运行器 ---------- */
  function run(kind, n, ui, done) {
    n = n || 10;
    // Stroop 固定 5 一致 / 5 不一致并打乱顺序，保证能算出干扰量
    const conds = shuffle(Array.from({ length: n }, (_, i) => i % 2 ? "incongruent" : "congruent"));
    let i = 0, diff = kind === "digit" ? 2 : 3, hist = [], results = [];
    function next() {
      diff = staircase(hist.slice(-2), diff);
      const item = gen(kind, diff, conds[i]);
      ui.show(item, i + 1, n, diff, (ok, rt) => {
        results.push({ ok: ok ? 1 : 0, rt, diff, cond: item.cond || null });
        hist.push(ok); i++;
        if (i < n) next(); else finish();
      });
    }
    function finish() {
      const acc = results.reduce((s, r) => s + r.ok, 0) / results.length;
      const rt = results.reduce((s, r) => s + r.rt, 0) / results.length;
      let span = null, interference = null;
      if (kind === "digit") {
        // v3 修复：真正按「连续答对段」口径——每段连续答对内取最大难度，长度 = 段内最大 diff + 2；
        // 旧实现取「全部答对题的最大难度」，跨段拼接受 glorified。
        let spanBest = 0, runMax = 0;
        results.forEach(r => {
          if (r.ok) { runMax = Math.max(runMax, r.diff); }
          else { if (runMax) spanBest = Math.max(spanBest, runMax + 2); runMax = 0; }
        });
        if (runMax) spanBest = Math.max(spanBest, runMax + 2);
        span = spanBest || null;
      }
      if (kind === "stroop") {
        // v3 修复：干扰量改用全部有效作答（含错题，两条件对称纳入），
        // 避免「只统计答对题」的条件性幸存者偏差。
        const inc = results.filter(r => r.cond === "incongruent").map(r => r.rt);
        const con = results.filter(r => r.cond === "congruent").map(r => r.rt);
        if (inc.length && con.length) interference = avg(inc) - avg(con);
      }
      done({ kind, acc, rt, span, interference, n, results });
    }
    next();
  }

  /* ---------- 暂定参数（v2：单位与 val 对齐；source 一律为 null） ---------- */
  const NORMS = {
    matrix: { mu: 6, sd: 2, unit: "答对/10", source: null },
    digit:  { span: 7, sd: 1.2, unit: "广度（连续答对段长度）", source: null },
    stroop: { mu: 100, sd: 60, unit: "ms（干扰量 = 不一致RT − 一致RT）", source: null },
    rotate: { mu: 75, sd: 15, unit: "%正确", source: null },
    series: { mu: 70, sd: 20, unit: "%正确", source: null }
  };
  function zScore(kind, val) {
    const n = NORMS[kind]; if (!n || !Number.isFinite(val)) return 0;
    if (kind === "matrix") return (val - n.mu) / n.sd;
    if (kind === "digit") return (val - n.span) / n.sd;
    if (kind === "stroop") return (n.mu - val) / n.sd;   // 干扰量越小越好
    if (kind === "rotate" || kind === "series") return (val - n.mu) / n.sd;
    return 0;
  }

  /* ① 练习效应剥离：v2 用未校正的 zRaw 历史估计 β，避免自我抵消 */
  function practiceAdjustedZ(kind, zRaw, attempt) {
    let beta = 0.15;
    const prior = LAB_HISTORY[kind] || [];
    if (prior.length >= 3) {
      const deltas = [];
      for (let i = 1; i < prior.length; i++) deltas.push(prior[i].zRaw - prior[i - 1].zRaw);
      deltas.sort((a, b) => a - b);
      const mid = deltas.slice(1, -1);
      const est = mid.length ? avg(mid) : 0.15;
      if (est > 0 && est < 0.5) beta = est;
    }
    return { z: zRaw - beta * (attempt - 1), beta: +beta.toFixed(3), attempt,
      limitation: "β 由少量历史 zRaw 差分估计，无法区分练习效应、真实进步与测量误差" };
  }

  /* ② ipsative 自比参照：个人历史 z */
  function ipsative(kind, z) {
    const prior = (LAB_HISTORY[kind] || []).map(p => p.z);
    if (prior.length < 2) return { zSelf: null, mu: null, sd: null };
    const mu = avg(prior);
    const sd = Math.sqrt(avg(prior.map(x => (x - mu) ** 2))) || 0.2;
    return { zSelf: (z - mu) / sd, mu, sd };
  }

  /* ③ 纵向关联（v2 替换原「效度校验五对配对」）
     原实现的 x 是全局标量，相关系数在数学上无定义，会输出浮点噪声 ±1。
     现在改为：每次施测的 z 与「该次施测前 7 天」的可计算学习指标配对，
     n≥10 个独立施测才报告 r，且只称为探索性时间序列关联。 */
  function windowMetric(state, at, days, key) {
    const from = at - days * DAY, to = at;
    const rvs = [];
    state.items.forEach(it => it.reviews.forEach(rv => {
      if (rv.t > from && rv.t <= to) rvs.push({ rv, domain: it.domain, id: it.id });
    }));
    if (!rvs.length) return null;
    rvs.sort((a, b) => a.rv.t - b.rv.t);
    if (key === "accuracy") return avg(rvs.map(x => x.rv.grade >= 2 ? 1 : 0));
    if (key === "crossDomainRate") {
      if (rvs.length < 2) return null;
      let c = 0; for (let i = 1; i < rvs.length; i++) if (rvs[i].domain !== rvs[i - 1].domain) c++;
      return c / (rvs.length - 1);
    }
    if (key === "firstPassRate") {
      const seen = new Set(), firsts = [];
      rvs.forEach(x => { if (!seen.has(x.id)) { seen.add(x.id); firsts.push(x.rv.grade >= 2 ? 1 : 0); } });
      return firsts.length ? avg(firsts) : null;
    }
    return null;
  }
  function pearson(x, y) {
    if (x.length < 3 || x.length !== y.length) return null;
    const mx = avg(x), my = avg(y);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < x.length; i++) {
      num += (x[i] - mx) * (y[i] - my);
      dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2;
    }
    // v2 关键修复：任一侧无变异时相关系数无定义，返回 null 而不是 0 或 ±1
    if (dx < 1e-12 || dy < 1e-12) return null;
    return num / Math.sqrt(dx * dy);
  }
  function longitudinalCheck(state, opts) {
    opts = opts || {};
    const minN = opts.minN || 10, days = opts.windowDays || 7;
    const defs = [
      { lab: "digit", metric: "首过正确率", key: "firstPassRate" },
      { lab: "rotate", metric: "跨域复习占比", key: "crossDomainRate" },
      { lab: "matrix", metric: "窗口正确率", key: "accuracy" }
    ];
    return defs.map(p => {
      const xs = [], ys = [];
      (state.lab || []).filter(l => l.kind === p.lab && Number.isFinite(l.z)).forEach(l => {
        const y = windowMetric(state, l.at, days, p.key);
        if (y != null) { xs.push(l.z); ys.push(y); }
      });
      const r = xs.length >= minN ? pearson(xs, ys) : null;
      return { pair: p.lab + " × " + p.metric, n: xs.length, r: r == null ? null : +r.toFixed(2),
        threshold: minN, note: xs.length < minN
          ? "独立施测配对不足 " + minN + "，不报告相关系数"
          : (r == null ? "该侧指标无变异，相关系数无定义" : "探索性时间序列关联，不是效度证据") };
    });
  }

  /* ④ 认知利用率（探索性） */
  function utilization(cog, learn) {
    const cap = cog.digit ? cog.digit.span : null;
    const speedUtil = (learn.firstPassRate || 0) / Math.max(0.2, (cog.matrix ? cog.matrix.acc : 0.7));
    const capUtil = cap ? clamp((learn.dailyNew || 0) / Math.max(1, cap - 1.5), 0, 1.2) : null;
    return { speedUtil: +speedUtil.toFixed(2), capUtil: capUtil == null ? null : +capUtil.toFixed(2), cap };
  }

  /* ⑤ 三源收缩合成（v2：不再编造标准误） */
  function composite(zBase, zLearn, zSelf, histSd) {
    const parts = [{ v: zBase, w: 0.5 }, { v: zLearn, w: 0.3 }, { v: zSelf, w: 0.2 }].filter(p => p.v != null);
    const W = parts.reduce((s, p) => s + p.w, 0);
    if (!W) return null;
    const post = parts.reduce((s, p) => s + p.w * p.v, 0) / W;
    const se = (histSd != null && histSd > 0) ? +(histSd / Math.sqrt(parts.length)).toFixed(2) : null;
    return { post: +post.toFixed(2), se,
      lo: se == null ? null : +(post - 1.96 * se).toFixed(2),
      hi: se == null ? null : +(post + 1.96 * se).toFixed(2),
      note: se == null ? "缺少可用的历史方差，不输出区间" : "区间仅反映个人历史波动，不是测量标准误" };
  }

  /* 共享状态：实验室历史（由 app.js 注入 CS.state.lab） */
  let LAB_HISTORY = {}, LAB_BEST = {};
  function hydrate(labArr) {
    labArr.forEach(l => {
      (LAB_HISTORY[l.kind] = LAB_HISTORY[l.kind] || []).push({
        z: l.z, zRaw: Number.isFinite(l.zRaw) ? l.zRaw : l.z, at: l.at
      });
      if (!LAB_BEST[l.kind] || l.z > LAB_BEST[l.kind]) LAB_BEST[l.kind] = l.z;
    });
  }
  function saveResult(kind, val, res) {
    if (!Number.isFinite(val)) return null;   // 例如 Stroop 未采集到有效干扰量
    const zRaw = zScore(kind, val);
    const att = ((CS.state.lab.filter(l => l.kind === kind).length) || 0) + 1;
    const adj = practiceAdjustedZ(kind, zRaw, att);
    const ip = ipsative(kind, adj.z);
    const rec = { kind, at: Date.now(), raw: val, unit: NORMS[kind] ? NORMS[kind].unit : null,
      z: +adj.z.toFixed(2), zRaw: +zRaw.toFixed(2), beta: adj.beta, attempt: att,
      pct: pctOf(adj.z), pctNote: "暂定正态换算值，非人群百分位",
      acc: res.acc, rt: Math.round(res.rt), span: res.span || null,
      interference: res.interference == null ? null : Math.round(res.interference),
      zSelf: ip.zSelf == null ? null : +ip.zSelf.toFixed(2) };
    CS.state.lab.push(rec); CS.save(); hydrate([rec]);
    return rec;
  }

  /* 学习端统计（供利用率使用；v2 删除恒返回 null 的空壳方法） */
  function makeLearnStats(state) {
    const byDomain = {};
    const all = [], firsts = [], oksPerItem = [];
    state.items.forEach(it => {
      const d = byDomain[it.domain] = byDomain[it.domain] || { oks: [], firsts: [] };
      it.reviews.forEach((r, idx) => {
        const ok = r.grade >= 2 ? 1 : 0;
        d.oks.push(ok); all.push(ok);
        if (idx === 0) { d.firsts.push(ok); firsts.push(ok); } // v3：与 windowMetric.firstPassRate 同口径
      });
      oksPerItem.push(it.reviews.filter(r => r.grade >= 2).length);
    });
    return { byDomain,
      accuracy: all.length ? +avg(all).toFixed(2) : null,
      firstPassRate: firsts.length ? +avg(firsts).toFixed(2) : null, // v3：首次复习正确率（旧实现是 1−平均答对次数/5，同名异义已废）
      oksPerItem: oksPerItem.length ? +avg(oksPerItem).toFixed(2) : null,
      dailyNew: state.items.filter(i => i.learnedAt > Date.now() - DAY).length,
      note: "均为描述性统计，未控制难度与学科构成；firstPassRate=首次复习正确率" };
  }

  return { gen, run, staircase, NORMS, zScore, practiceAdjustedZ, ipsative,
    windowMetric, pearson, longitudinalCheck, validityCheck: longitudinalCheck,
    utilization, composite, pctOf, erf, hydrate, saveResult, makeLearnStats,
    get history() { return LAB_HISTORY; }, get best() { return LAB_BEST; } };
})();
