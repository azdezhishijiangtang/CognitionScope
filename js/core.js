/* CognitionScope · core.js —— 数据层 + 自定义记忆衰减原型（v3） */
"use strict";
window.CS = (function () {
  const KEY = "cogscope_v1"; // schemaVersion=4；KEY 为历史兼容键，不代表版本号
  const BACKUP_KEY = KEY + "_preimport";
  const DAY = 86400000;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

  /* v11：演示条目的唯一判定。与 js/demo.js 的 isDemoItem 同一口径，
     但不依赖 DEMO 模块（core.js 加载在前）。双重条件避免误删用户条目。
     口径：演示内容可出现在复习队列 / 负荷图 / 图谱里供功能试用，
           但不计入经验正确率、PCM 与任何导出包。 */
  function isDemoItem(it) {
    return !!(it && it.demo === true && typeof it.source === "string" && it.source.indexOf("demo/") === 0);
  }
  function realItems() {
    const items = state && Array.isArray(state.items) ? state.items : [];
    if (!items.some(isDemoItem)) return items.slice(); // 无演示数据时行为与 v10 逐字一致
    return items.filter(x => !isDemoItem(x));
  }

  function blank() {
    return { schemaVersion: 4, profile: { ageBand: "adult", goldenHour: null },
      items: [], lab: [], protocols: [], plans: [], pcm: [], sessions: [],
      aiCfg: { provider: "glm", key: "", baseUrl: "" } };
  }
  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? migrate(JSON.parse(raw)) : blank();
    } catch (e) { console.error("load fail", e); state = blank(); }
    return state;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.error("save fail（可能是存储配额已满）", e); return false; } // v3：配额异常不再炸穿
    return true;
  }
  function migrate(d) {
    const b = blank();
    if (!d || typeof d !== "object" || Array.isArray(d)) d = {};
    const out = Object.assign(b, d);
    out.schemaVersion = 4;
    out.profile = Object.assign(b.profile, d.profile || {});
    out.aiCfg = Object.assign(b.aiCfg, d.aiCfg || {});
    out.items = Array.isArray(d.items) ? d.items : [];
    out.items.forEach(it => {
      it.reviews = Array.isArray(it.reviews) ? it.reviews : [];
      it.mtype = ["fact", "concept", "paper", "skill"].includes(it.mtype) ? it.mtype : "fact"; // v3：mtype 白名单，收窄存储型注入面
      it.domain = it.domain || "通用";
      it.prereq = Array.isArray(it.prereq) ? [...new Set(it.prereq)] : []; // v3：去重，防网络重复计数
      it.relates = Array.isArray(it.relates) ? [...new Set(it.relates)] : [];
      it.learnedAt = Number.isFinite(it.learnedAt) ? it.learnedAt : Date.now();
    });
    ["lab", "protocols", "plans", "pcm", "sessions"].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    return out;
  }
  function uid() { return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- 自定义指数半衰期模型（非 FSRS；S 为半衰期，单位天） ---------- */
  const R0 = { fact: 3, concept: 5, paper: 7, skill: 10 };
  function retention(dtDays, S) {
    if (!(S > 0)) S = 5;
    return Math.pow(2, -dtDays / S);
  }
  function nextS(S, grade) {
    // 仅 grade>=2 时调用；grade 3 增益高于 grade 2，均为待检验的工程假设。
    const d = grade >= 3 ? 2 : 1;
    return clamp(S * Math.pow(2, d), 0.3, 365);
  }
  function stateAt(item, t) {
    let S = R0[item.mtype] || 5, lastReview = item.learnedAt;
    const reviews = (item.reviews || []).slice().sort((a, b) => a.t - b.t);
    const now = t == null ? Date.now() : t;
    for (const rv of reviews) {
      if (!Number.isFinite(rv.t)) continue; // v3：跳过非法时间戳
      if (rv.t > now) break;
      if (rv.grade >= 2) S = nextS(S, rv.grade);
      else S = Math.max(0.3, S * 0.7);
      lastReview = Math.max(lastReview, rv.t);
    }
    return { r: retention(Math.max(0, (now - lastReview) / DAY), S), S, lastReview };
  }
  const masteryOf = it => clamp(Math.round(stateAt(it).r * 4), 0, 3);

  /* ---------- 未来负荷（v2 修复：模拟复习执行路径，曲线可回落） ----------
     假设：每天按 r 升序复习至多 capacity 条，成功回忆后 S 提升、last 重置。
     noActionDue 由一组完全不干预的独立模拟给出，用于显示干预价值。 */
  function futureLoad(days = 7, t0 = Date.now(), opts) {
    opts = opts || {};
    const cap = Number.isFinite(opts.capacity) ? opts.capacity : 20; // v3：显式传 0 也生效
    const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.9;
    const mk = () => state.items.map(it => {
      const st = stateAt(it, t0);
      return { S: st.S, last: st.lastReview, reviewed: (it.reviews || []).length > 0 };
    });
    const sim = mk(), noAction = mk();
    const out = [];
    for (let d = 0; d < days; d++) {
      const t = t0 + d * DAY;
      const rOf = s => retention(Math.max(0, (t - s.last) / DAY), s.S);
      const isDue = s => !s.reviewed || rOf(s) < threshold;
      const noActionDue = noAction.filter(isDue).length;
      const due = sim.filter(isDue);
      const today = due.slice().sort((a, b) => rOf(a) - rOf(b)).slice(0, cap);
      today.forEach(s => { s.S = nextS(s.S, 3); s.last = t; s.reviewed = true; });
      out.push({ d, due: due.length, reviewed: today.length,
        carry: Math.max(0, due.length - today.length), noActionDue });
    }
    return out;
  }

  /* ---------- 全局经验正确率（固定先验收缩；不是 MAP，也不是模型收敛） ---------- */
  function fitParams() {
    let successes = 0, n = 0;
    const seen = new Set();
    for (const it of realItems()) { // v11：演示条目的复习记录不计入个人经验正确率
      for (const rv of (it.reviews || []).slice().sort((a, b) => a.t - b.t)) {
        const key = it.id + ":" + Math.floor(rv.t / DAY);
        if (seen.has(key)) continue;
        seen.add(key);
        successes += rv.grade >= 2 ? 1 : 0;
        n++;
      }
    }
    const priorMean = 0.85, priorStrength = 5;
    const rHat = (successes + priorMean * priorStrength) / (n + priorStrength);
    return { rHat: +rHat.toFixed(3), n, successes,
      observedRate: n ? +(successes / n).toFixed(3) : null,
      status: n < 5 ? "积累中（固定先验收缩估计）" : "经验正确率（描述性，不是模型收敛）",
      evidence: "descriptive", sufficient: n >= 5 };
  }

  /* ---------- savings（简化的重学节省代理指标） ---------- */
  function savings(item) {
    const reviews = (item.reviews || []).slice().sort((a, b) => a.t - b.t);
    const firstSuccess = reviews.findIndex(r => r.grade >= 2);
    if (firstSuccess < 0) return null;
    const firstCount = firstSuccess + 1;
    for (let i = firstSuccess + 1; i < reviews.length; i++) {
      if (reviews[i].grade >= 2) continue;
      let failures = 0, recovered = false;
      for (let j = i; j < reviews.length; j++) {
        if (reviews[j].grade >= 2) { recovered = true; break; }
        failures++;
      }
      if (!recovered) return null;
      return { savings: +clamp(1 - failures / firstCount, 0, 1).toFixed(2),
        note: "首学" + firstCount + "次→遗忘后重学失败" + failures + "次",
        limitation: "仅取首个遗忘-恢复周期；非经典 Ebbinghaus savings 实验测量" };
    }
    return null;
  }

  /* ---------- 导出 / PCM ---------- */
  function exportJSON() {
    // v3【高危修复】：导出前脱敏——API Key 绝不写入导出文件
    // v11：演示条目不属于个人数据，导出前一律剔除（与 EXPORTM.buildBundle 同口径）
    const safe = JSON.parse(JSON.stringify(state));
    if (safe.aiCfg) safe.aiCfg.key = "";
    if (Array.isArray(safe.items)) safe.items = safe.items.filter(x => !isDemoItem(x));
    return JSON.stringify(safe, null, 2);
  }
  function importJSON(text) {
    const d = JSON.parse(text);
    if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("无效数据：期望对象");
    if (!Array.isArray(d.items)) throw new Error("无效数据：缺少 items 数组");
    if (d.schemaVersion != null && typeof d.schemaVersion !== "number") throw new Error("无效数据：schemaVersion 类型错误");
    if (d.schemaVersion != null && d.schemaVersion > 4) // v3：拒绝更高 schemaVersion
      throw new Error("数据 schemaVersion=" + d.schemaVersion + " 高于当前支持的 4，请先升级本应用再导入");
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(state)); } catch (e) { console.warn("导入前备份失败", e); } // v3：导入前自动备份
    state = migrate(d); save(); return true;
  }
  function buildPCM() {
    // v11：PCM 是「个人」学习数据档案，演示条目一律不进入任何统计口径
    const real = realItems();
    const demoCount = (state.items || []).length - real.length;
    const fit = fitParams();
    const mem = { rHat: fit.rHat, obs: fit.n, status: fit.status, sufficient: fit.sufficient, evidence: fit.evidence };
    const eligible = real.flatMap(it => (it.reviews || []).map(rv => ({ it, rv })))
      .filter(x => Number.isFinite(x.rv.conf));
    let bias = null, brier = null;
    const distinctItems = new Set(eligible.map(x => x.it.id)).size;
    if (eligible.length >= 30 && distinctItems >= 5) {
      let sumBias = 0, sumBrier = 0;
      for (const { rv } of eligible) {
        const outcome = rv.grade >= 2 ? 1 : 0;
        sumBias += rv.conf - outcome;
        sumBrier += Math.pow(rv.conf - outcome, 2);
      }
      bias = Math.round(100 * sumBias / eligible.length);
      brier = +(sumBrier / eligible.length).toFixed(3);
    }
    const dom = {};
    real.forEach(it => { dom[it.domain] = (dom[it.domain] || 0) + 1; });
    const lab = state.lab;
    // v3：废弃伪百分位均值（pct 均值无统计意义）；改用各任务 zRaw 的探索性均值
    const zRawList = lab.map(l => l.zRaw).filter(Number.isFinite);
    const zMean = zRawList.length ? +avg(zRawList).toFixed(2) : null;
    const rts = []; real.forEach(i => i.reviews.forEach(r => { if (r.rt) rts.push(r.rt); }));
    const meanRt = rts.length ? Math.round(avg(rts)) : null;
    const autoIdx = rts.length ? +avg(rts.map(t => t < 5000 ? 1 : 0)).toFixed(2) : null;
    const net = window.E2 ? E2.netAnalysis(Object.assign({}, state, { items: real })) : null;
    const wk = Date.now() - 7 * DAY;
    const growth = { newItems7d: real.filter(i => i.learnedAt > wk).length,
      reviews7d: real.reduce((a, i) => a + i.reviews.filter(r => r.t > wk).length, 0) };
    return {
      pcmVersion: 4, generatedAt: new Date().toISOString(),
      memory: mem,
      metacog: { biasPct: bias, brier, n: eligible.length, note: bias == null ? "积累中" : (bias > 5 ? "自评偏高" : bias < -5 ? "自评偏低" : "平均偏差较小") },
      speed: { meanRt, autoIdx, n: rts.length },
      domains: dom,
      knowledgeNet: net ? { nodes: net.nodes, edges: net.edges, orphans: net.orphans.length, orphanPct: +net.orphanPct.toFixed(2), cycles: net.cycles.length } : null,
      growth,
      lab: lab.map(l => ({ name: l.name || l.kind, pct: l.pct, at: l.at })),
      cognition: { zMean, indexPct: null, note: "已停用伪百分位均值；zMean 为各任务 zRaw 的探索性均值，不构成能力结论" },
      itemCount: real.length,
      demo: { loaded: demoCount > 0, count: demoCount, excluded: true,
        note: "示例内容已从 PCM 全部统计口径中剔除；不构成个人学习证据" },
      protocols: state.protocols.filter(p => p.enabled).map(p => ({ id: p.id, verdict: p.verdict || "待裁决" }))
    };
  }
  function recordPCM() {
    const p = buildPCM(); p.at = Date.now();
    state.pcm.push(p); if (state.pcm.length > 200) state.pcm.shift();
    save(); return p;
  }

  /* ---------- 条目操作 ---------- */
  const MTYPES = ["fact", "concept", "paper", "skill"];
  function addItem(o) {
    o = o || {};
    const it = { id: uid(), content: String(o.content || "").slice(0, 500), answer: o.answer || "", rubric: o.rubric || "",
      domain: o.domain || "通用", mtype: MTYPES.includes(o.mtype) ? o.mtype : "fact", // v3：mtype 白名单
      learnedAt: o.learnedAt || Date.now(), reviews: [],
      prereq: Array.isArray(o.prereq) ? [...new Set(o.prereq)] : [], relates: Array.isArray(o.relates) ? [...new Set(o.relates)] : [],
      transfer: !!o.transfer, claims: o.claims || null, source: o.source || null };
    if (o.claims) {
      state.items.push(it);
      (o.claims).forEach(c => state.items.push({ id: uid(), content: "〔主张〕" + c, domain: it.domain,
        mtype: "paper", learnedAt: it.learnedAt, reviews: [], prereq: [], relates: [it.id], transfer: false, source: it.id }));
    } else state.items.push(it);
    save(); return it;
  }
  function reviewItem(id, grade, conf, rt, sessionId, userResponse) {
    const it = state.items.find(x => x.id === id); if (!it) return null;
    const g = clamp(Math.round(Number(grade)), 0, 3);   // v3：grade 收敛到 0-3 整数
    const c = clamp(Number(conf), 0, 1);                // v3：conf 收敛到 0-1
    if (!Number.isFinite(g) || !Number.isFinite(c)) return null;
    it.reviews.push({ t: Date.now(), grade: g, conf: c,
      rt: Number.isFinite(rt) ? rt : null, sessionId: sessionId || null,
      userResponse: String(userResponse || "").slice(0, 500) }); // v3：回忆文本截断到 500 字
    save(); return it;
  }
  function findDue(t) {
    t = t || Date.now();
    return state.items.filter(it => it.reviews.length === 0 || stateAt(it, t).r < 0.9)
      .map(it => ({ it, st: stateAt(it, t) }))
      .sort((a, b) => a.st.r - b.st.r);
  }

  /* ---------- v6 增量：供 persistence.js 事务写入使用的清洗 / 校验 ----------
     纪律：不改变 migrate()/load()/save()/importJSON() 的任何既有行为，
     以保证 v3 的 66 项历史回归断言（含 schemaVersion===4）继续成立。 */
  function normalizeState(s) {
    if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("state 必须是对象");
    ["items", "lab", "protocols", "plans", "pcm", "sessions"].forEach(k => {
      if (!Array.isArray(s[k])) s[k] = [];
    });
    if (!s.profile || typeof s.profile !== "object") s.profile = { ageBand: "adult", goldenHour: null };
    if (!s.aiCfg || typeof s.aiCfg !== "object") s.aiCfg = { provider: "glm", key: "", baseUrl: "" };
    const ids = new Set();
    s.items.forEach(it => {
      if (!it || typeof it !== "object") throw new Error("items 含非对象元素");
      if (!it.id || typeof it.id !== "string") it.id = uid();
      if (ids.has(it.id)) throw new Error("重复条目 id：" + it.id);
      ids.add(it.id);
      it.reviews = Array.isArray(it.reviews) ? it.reviews : [];
      it.mtype = MTYPES.includes(it.mtype) ? it.mtype : "fact";
      it.domain = String(it.domain || "通用").slice(0, 40);
      it.prereq = Array.isArray(it.prereq) ? [...new Set(it.prereq.map(String))] : [];
      it.relates = Array.isArray(it.relates) ? [...new Set(it.relates.map(String))] : [];
      it.learnedAt = Number.isFinite(it.learnedAt) ? it.learnedAt : Date.now();
    });
    return s;
  }
  function validateState(s) {
    if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("state 必须是对象");
    if (!Number.isFinite(s.schemaVersion)) throw new Error("schemaVersion 缺失");
    if (!Array.isArray(s.items)) throw new Error("items 必须是数组");
    const seen = new Set();
    for (const it of s.items) {
      if (typeof it.id !== "string" || !it.id) throw new Error("条目 id 无效");
      if (seen.has(it.id)) throw new Error("重复条目 id：" + it.id);
      seen.add(it.id);
      if (!Array.isArray(it.reviews)) throw new Error("reviews 必须是数组：" + it.id);
      if (!Number.isFinite(it.learnedAt)) throw new Error("learnedAt 无效：" + it.id);
      if (!MTYPES.includes(it.mtype)) throw new Error("mtype 越界：" + it.id);
      if (it.content != null && typeof it.content !== "string") throw new Error("content 类型错误：" + it.id);
      for (const rv of it.reviews) {
        if (!rv || typeof rv !== "object") throw new Error("review 非对象：" + it.id);
        if (!Number.isFinite(rv.t)) throw new Error("review.t 无效：" + it.id);
        const g = rv.gradeSelf != null ? rv.gradeSelf : rv.grade;
        if (!Number.isFinite(g) || g < 0 || g > 3) throw new Error("grade/gradeSelf 越界：" + it.id);
      }
    }
    return true;
  }

  return { get state() { return state; }, replaceState(next) { state = next; }, KEY, load, save, migrate, uid, retention, nextS, stateAt, masteryOf,
    isDemoItem, realItems,
    futureLoad, fitParams, savings, exportJSON, importJSON, buildPCM, recordPCM,
    addItem, reviewItem, findDue, clamp, avg, R0, DAY, normalizeState, validateState, MTYPES };
})();
