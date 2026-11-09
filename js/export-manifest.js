/* CognitionScope · export-manifest.js —— 可独立复算的导出包（v6）
 * v5 规格要求：导出必须附 schema 版本、参数版本、代码 hash、数据时间范围，
 *   以及扁平 JSONL 复习明细，便于外部用完全不同的实现重算同一结论。
 * 额外红线：
 *   - API Key / Authorization 头绝不出现在任何导出字符串中（导出前复核）
 *   - PCM 中的占位常模 pct 不随导出外流（脱离免责上下文会被误读成人群百分位）
 *   - CSV 导出做公式注入转义
 *   - 所有结论附 n 与时间范围，且明确「合成/真实」
 */
"use strict";
(function () {
  const SCHEMA = { l1: 4, l2: 6, bundle: 1 };

  function fnv1a(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  /* v11：与 CS.isDemoItem / DEMO.isDemoItem 完全相同的判定。
     放在本模块内部，保证纯 Node 复算路径（未装载 CS）也执行同一剔除闸门。 */
  const isDemo = x => !!(x && x.demo === true && typeof x.source === "string" && x.source.indexOf("demo/") === 0);
  const stable = x => JSON.stringify(x, (_k, v) =>
    (v && typeof v === "object" && !Array.isArray(v))
      ? Object.keys(v).sort().reduce((o, k) => (o[k] = v[k], o), {}) : v);

  /** 代码 hash：传入 {文件名: 源码字符串}；用于让第三方核对「结论来自哪份代码」 */
  function codeHash(sources) {
    const parts = Object.keys(sources || {}).sort().map(k => k + "@" + fnv1a(String(sources[k])));
    return { algorithm: "fnv1a-1-per-file", files: parts.length,
      digest: fnv1a(parts.join("|")), perFile: parts };
  }

  function rangeOf(items, events) {
    const ts = [];
    for (const it of items || []) {
      if (Number.isFinite(it.learnedAt)) ts.push(it.learnedAt);
      for (const r of it.reviews || []) if (Number.isFinite(r.t)) ts.push(r.t);
    }
    for (const e of events || []) if (Number.isFinite(e.t || e.at)) ts.push(e.t || e.at);
    return ts.length ? { from: Math.min(...ts), to: Math.max(...ts), observations: ts.length }
                     : { from: null, to: null, observations: 0 };
  }

  function countsOf(l1, l6) {
    const streams = {};
    if (l6) for (const k of Object.keys(l6))
      if (Array.isArray(l6[k])) streams[k] = l6[k].length;
    const reviews = (l1.items || []).reduce((a, i) => a + (i.reviews || []).length, 0);
    return { items: (l1.items || []).length, reviews, lab: (l1.lab || []).length,
      protocols: (l1.protocols || []).length, pcmSnapshots: (l1.pcm || []).length, streams };
  }

  function buildManifest(l1, l6, opts) {
    const o = opts || {};
    const events = (l6 && l6.events) || [];
    const body = {
      bundleVersion: SCHEMA.bundle,
      appName: "CognitionScope",
      generatedAt: new Date().toISOString(),
      schemaVersion: { l1: l1.schemaVersion || SCHEMA.l1, l2: l6 ? (l6.schemaVersion || SCHEMA.l2) : null },
      paramVersion: l6 ? l6.paramVersion : "v3-legacy",
      chainAlgorithm: l6 ? (l6.chainAlgorithm || null) : null,
      codeHash: o.codeHash || null,
      dataRange: rangeOf(l1.items, events),
      counts: countsOf(l1, l6),
      chainIntegrity: l6 && window.CS6 ? window.CS6.verifyChain() : null,
      evidencePolicy: {
        A: "直接记录 / 已核验客观正确率",
        B: "模型估计（须附校准状态）",
        C: "探索性（禁止排名、禁止能力结论）",
        D: "占位常模 / 未验证假设（不得导出为结论）"
      },
      caveats: [
        "本导出为个人学习记录与观测数据，不是大脑模型、不是标准化测验、不构成能力或诊断结论",
        "模型留存 r(t)=2^(-dt/S) 及其 S 更新规则为工程假设，须以本包内校准结果判断是否可用",
        "N=1 数据不可推广；任何实验结论只在预注册的时间窗内成立",
        "PCM 的占位常模百分位字段已移除，避免脱离免责上下文被误读",
        o.demoExcluded ? "已剔除 " + o.demoExcluded + " 条示例内容；本导出包只含个人学习数据" : null,
        o.synthetic ? "本包含合成数据，仅用于方法验证，不代表真实平台性能" : null
      ].filter(Boolean)
    };
    body.manifestHash = fnv1a(stable(body));
    return body;
  }

  /** 扁平 JSONL：一行一次复习，含预测/结果/证据来源，供外部独立重算 */
  function toJSONL(l1, l6) {
    const predByItem = {};
    for (const p of (l6 && l6.predictions) || [])
      (predByItem[p.itemId] = predByItem[p.itemId] || []).push(p);
    const lines = [];
    for (const it of l1.items || []) {
      const preds = (predByItem[it.id] || []).slice().sort((a, b) => a.t - b.t);
      for (const rv of (it.reviews || []).slice().sort((a, b) => a.t - b.t)) {
        const v = rv.verification || { status: "unverified" };
        const y = v.status === "verified"
          ? (v.outcome === "correct" ? 1 : v.outcome === "partial" ? 0.5 : 0)
          : ((rv.gradeSelf != null ? rv.gradeSelf : rv.grade) >= 2 ? 1 : 0);
        // 关联「复习之前最近一次冻结预测」；找不到就留 null，绝不现算冒充冻结值
        const prior = preds.filter(p => p.t <= rv.t).pop();
        lines.push(JSON.stringify({
          itemId: it.id, domain: it.domain, mtype: it.mtype,
          t: rv.t, learnedAt: it.learnedAt,
          gradeSelf: rv.gradeSelf != null ? rv.gradeSelf : rv.grade,
          gradeLegacy: rv.grade,
          confidenceSelf: rv.confidenceSelf != null ? rv.confidenceSelf : (rv.conf != null ? rv.conf : null),
          confidenceTiming: rv.confidenceTiming || "legacy_unknown",
          recallDurationMs: rv.recallDurationMs != null ? rv.recallDurationMs : null,
          legacyDurationMs: rv.legacyDurationMs != null ? rv.legacyDurationMs : (rv.rt != null ? rv.rt : null),
          verificationStatus: v.status, verificationMethod: v.method || null,
          rubricVersion: v.rubricVersion || it.rubricVersion || null,
          hitKeypoints: v.hitKeypoints != null ? v.hitKeypoints : null,
          totalKeypoints: v.totalKeypoints != null ? v.totalKeypoints : null,
          y, ySource: v.status === "verified" ? "verified" : "self",
          rPredFrozen: prior ? prior.rPred : null,
          rPredSource: prior ? "frozen" : "unavailable",
          paramVersion: rv.paramVersion || "v3-legacy",
          sessionId: rv.sessionId || null
        }));
      }
    }
    for (const p of (l6 && l6.probeLog) || [])
      lines.push(JSON.stringify({
        itemId: p.itemId, t: p.t, y: p.y, ySource: p.ySource || "probe_self",
        rPredFrozen: p.r, rPredSource: "frozen_probe",
        probeType: p.probeType || "routine", paramVersion: p.paramVersion || "unknown",
        recordType: "probe"
      }));
    return lines.join("\n") + (lines.length ? "\n" : "");
  }

  /** CSV（公式注入防护）：默认只导出 A 级直接记录字段 */
  function toCSV(l1) {
    const esc = x => {
      let s = String(x == null ? "" : x);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // 阻断公式注入
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const head = ["itemId", "domain", "mtype", "t", "gradeSelf", "confidenceSelf",
      "confidenceTiming", "verificationStatus", "y", "ySource", "paramVersion"];
    const rows = [head.join(",")];
    for (const it of l1.items || []) for (const rv of it.reviews || []) {
      const v = rv.verification || { status: "unverified" };
      rows.push([
        it.id, it.domain, it.mtype, rv.t,
        rv.gradeSelf != null ? rv.gradeSelf : rv.grade,
        rv.confidenceSelf != null ? rv.confidenceSelf : (rv.conf != null ? rv.conf : ""),
        rv.confidenceTiming || "legacy_unknown", v.status,
        (rv.gradeSelf != null ? rv.gradeSelf : rv.grade) >= 2 ? 1 : 0,
        v.status === "verified" ? "verified" : "self",
        rv.paramVersion || "v3-legacy"
      ].map(esc).join(","));
    }
    return rows.join("\n") + "\n";
  }

  /** 脱敏：递归移除敏感字段，返回 {clean, removed[]} */
  function redact(obj) {
    const removed = [];
    const SENSITIVE = new Set(["key", "apiKey", "api_key", "authorization", "token", "secret", "password"]);
    function walk(x) {
      if (Array.isArray(x)) return x.map(walk);
      if (x && typeof x === "object") {
        const out = {};
        for (const k of Object.keys(x)) {
          if (SENSITIVE.has(k.toLowerCase())) { removed.push(k); continue; }
          if (k === "pct" && x.__pcmPlaceholder) { removed.push("pcm.pct"); continue; }
          out[k] = walk(x[k]);
        }
        return out;
      }
      return x;
    }
    return { clean: walk(obj), removed: [...new Set(removed)] };
  }

  /** 完整导出包；sources 为 {文件名:源码}，提供时写入 manifest.codeHash */
  function buildBundle(opts) {
    const o = opts || {};
    const l1raw = o.l1 || (window.CS && window.CS.state) || { items: [] };
    const l6raw = o.l2 || (window.CS6 && window.CS6.snapshot()) || null;
    // v11：示例内容不属于个人数据。state / jsonl / csv / manifest 计数全部基于剔除后的副本，
    //      显式传入 o.l1 的离线复算路径同样生效；无示例条目时输出与 v10 逐字一致。
    const l1src = JSON.parse(JSON.stringify(l1raw));
    const demoExcluded = Array.isArray(l1src.items) ? l1src.items.filter(isDemo).length : 0;
    if (Array.isArray(l1src.items)) l1src.items = l1src.items.filter(x => !isDemo(x));
    const { clean: l1, removed } = redact(l1src);
    // PCM 快照里的占位常模百分位单独剔除
    if (Array.isArray(l1.pcm)) l1.pcm = l1.pcm.map(p => {
      const q = Object.assign({}, p); delete q.pct;
      if (Array.isArray(q.lab)) q.lab = q.lab.map(x => { const y = Object.assign({}, x); delete y.pct; return y; });
      return q;
    });
    const l6 = l6raw ? JSON.parse(JSON.stringify(l6raw)) : null;
    if (l6 && typeof l6 === "object") delete l6.aiCfg;
    const manifest = buildManifest(l1, l6, {
      codeHash: o.sources ? codeHash(o.sources) : null,
      synthetic: !!o.synthetic,
      demoExcluded
    });
    const bundle = {
      format: "cognitionscope.bundle/1",
      manifest,
      state: l1,
      eventStore: l6,
      jsonl: toJSONL(l1, l6),
      csv: toCSV(l1)
    };
    const text = JSON.stringify(bundle);
    const leaks = redactionLeaks(text, o.apiKey);
    return { bundle, text, jsonl: bundle.jsonl, csv: bundle.csv,
      redactedFields: removed, leaks, demoExcluded,
      note: leaks.length ? "导出复核未通过，禁止下载" : "导出复核通过" };
  }

  /** 导出后最后一道闸门：字符串里不得出现 key 值或常见凭据前缀 */
  function redactionLeaks(text, apiKey) {
    const hits = [];
    if (apiKey && String(apiKey).length >= 6 && text.indexOf(String(apiKey)) >= 0) hits.push("apiKey 字面值");
    if (/"key"\s*:\s*"(?!")[^"]{6,}"/.test(text)) hits.push("残留 key 字段");
    if (/Bearer\s+[A-Za-z0-9._-]{12,}/.test(text)) hits.push("Bearer 凭据");
    return hits;
  }

  /** 外部复算用：从 bundle 反推 manifest 计数与哈希是否自洽 */
  function verifyBundle(bundle) {
    if (!bundle || bundle.format !== "cognitionscope.bundle/1") return { ok: false, reason: "格式不符" };
    const m = JSON.parse(JSON.stringify(bundle.manifest || {}));
    const expected = m.manifestHash; delete m.manifestHash;
    const recomputed = fnv1a(stable(m));
    const counts = countsOf(bundle.state || {}, bundle.eventStore || {});
    return {
      ok: expected === recomputed && JSON.stringify(counts) === JSON.stringify(m.counts),
      manifestHashMatch: expected === recomputed,
      countsMatch: JSON.stringify(counts) === JSON.stringify(m.counts),
      jsonlLines: String(bundle.jsonl || "").trim() ? String(bundle.jsonl).trim().split("\n").length : 0,
      chainIntegrity: m.chainIntegrity ? m.chainIntegrity.ok : null
    };
  }

  window.EXPORTM = {
    SCHEMA, fnv1a, stable, codeHash, rangeOf, countsOf, buildManifest,
    toJSONL, toCSV, redact, buildBundle, redactionLeaks, verifyBundle
  };
})();
