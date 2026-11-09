/* CognitionScope · import-validator.js —— 导入管线（v6）
 * 防护（对应 v5 规格 R10/R11 与 v4 §导入安全）：
 *   R10 禁止 Object.assign 展开任意外部对象 → 一律显式字段投影
 *   R11 递归拒绝 __proto__ / prototype / constructor → 防原型污染
 *   v6 新增：事件完整性校验、孤儿事件隔离（不猜测归属）、大小与深度上限
 * 纯函数：不触碰 localStorage，由 persistence.atomicImport 调用。
 */
"use strict";
(function () {
  const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const LIMITS = {
    maxBytes: 8 * 1024 * 1024,
    maxItems: 50000,
    maxReviewsPerItem: 200,
    maxEvents: 200000,
    maxDepth: 8,
    contentLen: 500,
    answerLen: 2000,
    rubricLen: 2000,
    keypoints: 20,
    domainLen: 40
  };
  const MTYPES = ["fact", "concept", "paper", "skill"];
  const isPlainObject = x => x !== null && typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
  const str = (x, max) => String(x == null ? "" : x).slice(0, max);
  const finite = (x, dflt) => Number.isFinite(x) ? x : dflt;

  /* ① 递归危险键检查 + 深度限制 */
  function assertSafeObject(obj, path, depth) {
    path = path || "root"; depth = depth || 0;
    if (depth > LIMITS.maxDepth) throw new Error(path + " 嵌套过深（上限 " + LIMITS.maxDepth + "）");
    if (!isPlainObject(obj)) throw new Error(path + " 必须是普通对象");
    for (const key of Object.keys(obj)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Error(path + " 含危险字段：" + key);
      const v = obj[key];
      if (v && typeof v === "object") {
        if (Array.isArray(v)) v.forEach((e, i) => {
          if (e && typeof e === "object") assertSafeObject(e, path + "." + key + "[" + i + "]", depth + 1);
        });
        else assertSafeObject(v, path + "." + key, depth + 1);
      }
    }
    return true;
  }

  /* ② L1 显式字段投影：任何未登记字段一律丢弃 */
  function projectState(raw) {
    const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, LIMITS.maxItems);
    return {
      schemaVersion: 4,                         // L1 保持 v4 语义，见 core.js 架构说明
      appName: "CognitionScope",
      profile: {
        ageBand: str(raw.profile && raw.profile.ageBand, 20) || "adult",
        goldenHour: (raw.profile && typeof raw.profile.goldenHour === "object") ? raw.profile.goldenHour : null
      },
      // API Key 永不从导入文件恢复（只能由用户在界面里重新输入）
      aiCfg: { provider: str(raw.aiCfg && raw.aiCfg.provider, 20) || "glm", key: "", baseUrl: "" },
      items: items.map(i => projectItem(i)),
      lab: projectLab(raw.lab),
      protocols: projectProtocols(raw.protocols),
      plans: [], pcm: [], sessions: []          // 派生/缓存数据不导入，重建即可
    };
  }

  function projectItem(i) {
    i = i || {};
    const reviews = (Array.isArray(i.reviews) ? i.reviews : [])
      .slice(-LIMITS.maxReviewsPerItem).map(projectReview).filter(Boolean);
    return {
      id: str(i.id, 64) || "i" + Math.random().toString(36).slice(2, 10),
      content: str(i.content, LIMITS.contentLen),
      answer: str(i.answer, LIMITS.answerLen),
      rubric: str(i.rubric, LIMITS.rubricLen),
      rubricVersion: i.rubricVersion == null ? null : str(i.rubricVersion, 40),
      keypoints: Array.isArray(i.keypoints)
        ? i.keypoints.slice(0, LIMITS.keypoints).map(x => str(x, 200)) : null,
      domain: str(i.domain, LIMITS.domainLen) || "通用",
      mtype: MTYPES.includes(i.mtype) ? i.mtype : "fact",
      learnedAt: finite(i.learnedAt, Date.now()),
      reviews,
      prereq: Array.isArray(i.prereq) ? [...new Set(i.prereq.map(x => str(x, 64)))] : [],
      relates: Array.isArray(i.relates) ? [...new Set(i.relates.map(x => str(x, 64)))] : [],
      transfer: !!i.transfer,
      claims: null, source: i.source == null ? null : str(i.source, 64)
    };
  }

  function projectReview(r) {
    if (!r || typeof r !== "object" || !Number.isFinite(r.t)) return null;
    const g = Number.isFinite(r.gradeSelf) ? r.gradeSelf : r.grade;
    if (!Number.isFinite(g)) return null;
    const out = {
      t: r.t,
      grade: Math.max(0, Math.min(3, Math.round(g))),      // 兼容 v3 stateAt
      gradeSelf: Math.max(0, Math.min(3, Math.round(g))),   // v6 规范字段
      confidenceSelf: Number.isFinite(r.confidenceSelf) ? Math.max(0, Math.min(1, r.confidenceSelf))
                     : (Number.isFinite(r.conf) ? Math.max(0, Math.min(1, r.conf)) : null),
      confidenceTiming: r.confidenceTiming === "before_reveal" ? "before_reveal" : "legacy_unknown",
      rt: Number.isFinite(r.rt) ? r.rt : null,
      legacyDurationMs: Number.isFinite(r.rt) ? r.rt : null,   // 不冒充回忆反应时
      sessionId: r.sessionId == null ? null : str(r.sessionId, 64),
      userResponse: str(r.userResponse, 500),
      paramVersion: r.paramVersion == null ? "v3-legacy" : str(r.paramVersion, 40),
      verification: projectVerification(r.verification)
    };
    return out;
  }

  function projectVerification(v) {
    if (!v || typeof v !== "object") return { status: "unverified", method: null, rubricVersion: null, outcome: null };
    const status = ["verified", "partial", "unverified", "not_applicable"].includes(v.status) ? v.status : "unverified";
    return {
      status,
      method: v.method == null ? null : str(v.method, 40),
      rubricVersion: v.rubricVersion == null ? null : str(v.rubricVersion, 40),
      outcome: ["correct", "partial", "incorrect"].includes(v.outcome) ? v.outcome : null,
      hitKeypoints: Number.isFinite(v.hitKeypoints) ? v.hitKeypoints : null,
      totalKeypoints: Number.isFinite(v.totalKeypoints) ? v.totalKeypoints : null
    };
  }

  function projectLab(lab) {
    return (Array.isArray(lab) ? lab : []).slice(-5000).map(l => ({
      kind: str(l.kind, 40), name: str(l.name || l.kind, 40),
      at: finite(l.at, Date.now()), score: finite(l.score, null),
      zRaw: Number.isFinite(l.zRaw) ? l.zRaw : null,
      unit: l.unit == null ? null : str(l.unit, 40),
      attempt: Number.isFinite(l.attempt) ? l.attempt : null,
      source: "imported"       // 来源标记：导入的历史不冒充本设备实测
    })).filter(l => l.kind);
  }

  function projectProtocols(ps) {
    return (Array.isArray(ps) ? ps : []).slice(0, 200).map(p => ({
      id: str(p.id, 20), enabled: !!p.enabled, verdict: null   // 裁决结论不导入
    })).filter(p => p.id);
  }

  /* ③ L2 事件投影 + 完整性校验 */
  /* 与 state6.STREAMS 同名的流清单（本模块保持零依赖，故内置一份） */
  const EVENT_STREAMS = ["events", "predictions", "probeLog", "verificationLog", "timingLog",
    "experiments", "assignments", "trialEvents", "hypothesisCards", "calibrationRuns",
    "paramFits", "consentLog", "audit"];

  function projectEventStore(raw, streams) {
    const allowed = streams || EVENT_STREAMS;
    const out = { schemaVersion: 6, appName: "CognitionScope", layer: "L2-event-store",
      createdAt: finite(raw && raw.createdAt, Date.now()),
      paramVersion: str(raw && raw.paramVersion, 40) || "v7-init",
      chainAlgorithm: "fnv1a-1", counters: {}, archives: [] };
    const report = { kept: 0, dropped: 0, orphans: [], byStream: {} };
    for (const s of allowed) {
      const arr = (raw && Array.isArray(raw[s])) ? raw[s].slice(0, LIMITS.maxEvents) : [];
      const kept = [];
      for (const e of arr) {
        const reason = eventInvalidReason(e);
        if (reason) { report.dropped++; continue; }
        kept.push(projectEvent(e));
      }
      out[s] = kept;
      out.counters[s] = kept.reduce((m, e) => Math.max(m, Number.isFinite(e.seq) ? e.seq : 0), 0);
      report.byStream[s] = kept.length;
      report.kept += kept.length;
    }
    return { store: out, report };
  }

  function eventInvalidReason(e) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return "非对象";
    if (!Number.isFinite(e.t) && !Number.isFinite(e.at)) return "缺时间戳";
    if (e.y != null && (typeof e.y !== "number" || e.y < 0 || e.y > 1)) return "y 越界";
    if (e.r != null && (typeof e.r !== "number" || e.r < 0 || e.r > 1)) return "r 越界";
    if (e.rPred != null && (typeof e.rPred !== "number" || e.rPred < 0 || e.rPred > 1)) return "rPred 越界";
    if (e.ySource != null && !["self", "verified", "probe_self", "unknown"].includes(e.ySource)) return "ySource 非法";
    if (e.rPredSource != null && !["frozen", "replayed", "model", "unknown"].includes(e.rPredSource)) return "rPredSource 非法";
    return null;
  }

  function projectEvent(e) {
    const out = {};
    const allowed = ["seq", "at", "t", "hash", "prevHash", "paramVersion", "kind", "itemId",
      "experimentId", "regId", "feature", "action", "primaryOutcome", "n", "r", "rPred", "S",
      "rPredSource", "dueThreshold", "context", "y", "ySource", "src", "srcRef", "probeType",
      "verificationStatus", "conditionId", "excluded", "note", "from", "to", "count", "stream",
      "beforeT", "firstSeq", "lastSeq", "reason", "method", "status", "outcome", "hitKeypoints",
      "totalKeypoints", "state", "elapsedMs", "attemptId", "rubricVersion", "rPredAtAssignment",
      "modelHasSignal", "adherence", "ittIncluded", "orphan"];
    for (const k of allowed) if (e[k] !== undefined) out[k] = e[k];
    if (out.at == null) out.at = out.t;
    if (out.t == null) out.t = out.at;
    return out;
  }

  /** 孤儿事件：srcRef 指向的预测不存在 → 标记 orphan，不猜测归属、不删除 */
  function markOrphans(events, predictions) {
    const known = new Set((predictions || []).map(p => "predictions#" + p.seq));
    let n = 0;
    for (const e of events) {
      if (e.srcRef && /^predictions#/.test(e.srcRef) && !known.has(e.srcRef)) { e.orphan = true; n++; }
    }
    return { events, orphans: n, note: "孤儿事件仅标记并隔离出分析分母，不猜测归属、不物理删除" };
  }

  function fnv1a(str) {
    let h=2166136261; for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);} return (h>>>0).toString(16).padStart(8,"0");
  }
  const stable = x => JSON.stringify(x,(_k,v)=>(v&&typeof v==="object"&&!Array.isArray(v))?Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),{}):v);
  function verifyRawEventStore(raw) {
    if(!raw || !raw.events) return {ok:true,skipped:true};
    if(!raw.chainAlgorithm){
      const hasChain=(raw.events||[]).some(e=>e && (e.hash || e.prevHash || e.seq));
      return hasChain?{ok:false,reason:"缺少链算法声明但存在链字段，无法安全验证"}:{ok:true,legacyUnchained:true};
    }
    if(raw.chainAlgorithm !== "fnv1a-1" && raw.chainAlgorithm !== "fnv1a-1-integrity-only")
      return {ok:false,reason:"不支持的原始事件链算法"};
    const streams=EVENT_STREAMS,broken=[];
    for(const stream of streams){let prev="genesis";const arr=Array.isArray(raw[stream])?raw[stream]:[];
      for(let i=0;i<arr.length;i++){const e=arr[i],body=Object.assign({},e);delete body.hash;
        const h=fnv1a(stream+"|"+stable(body));
        if(e.seq!==i+1||e.prevHash!==prev||e.hash!==h){broken.push({stream,index:i});break;} prev=e.hash;
      }}
    return {ok:broken.length===0,broken};
  }
  function rechainProjectedStore(store) {
    store.chainAlgorithm="fnv1a-1-integrity-only";
    for(const stream of EVENT_STREAMS){let prev="genesis";const arr=Array.isArray(store[stream])?store[stream]:[];
      for(let i=0;i<arr.length;i++){const e=arr[i];e.seq=i+1;e.prevHash=prev;delete e.hash;e.hash=fnv1a(stream+"|"+stable(e));prev=e.hash;}
      store.counters[stream]=arr.length;
    }
    store.migrationNote="字段白名单投影后重新建立本地一致性链；该链不是来源真实性或防篡改签名";
    return store;
  }

  /** 完整导入管线：文本 → 安全对象（L1 + L2），任何一步失败都抛错且不落盘 */
  function normalizeImport(text, opts) {
    const o = opts || {};
    if (typeof text !== "string" || new TextEncoder().encode(text).length > LIMITS.maxBytes)
      throw new Error("导入文件超过 " + (LIMITS.maxBytes / 1048576) + "MB 上限");
    let raw;
    try { raw = JSON.parse(text); }
    catch (e) { throw new Error("JSON 解析失败：" + e.message); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("无效数据：期望对象");
    assertSafeObject(raw);

    // 新格式 bundle：{ state: {...}, eventStore: {...}, manifest: {...} }
    // 旧格式：直接是 L1 state
    const l1raw = raw.state || raw;
    if (!Array.isArray(l1raw.items)) throw new Error("无效数据：缺少 items 数组");
    const l1 = projectState(l1raw);
    let l2 = null;
    if (raw.eventStore) {
      const chain = verifyRawEventStore(raw.eventStore);
      if (!chain.ok) throw new Error("原始 L2 事件链校验失败，拒绝导入：" + JSON.stringify(chain.broken));
      l2 = projectEventStore(raw.eventStore, null);
      rechainProjectedStore(l2.store);
      markOrphans(l2.store.events || [], l2.store.predictions || []);
    }

    // 交叉校验：events 引用的 itemId 必须存在于 L1（否则标记，不丢）
    const ids = new Set(l1.items.map(i => i.id));
    if (l2) for (const e of l2.store.events || [])
      if (e.itemId && !ids.has(e.itemId)) { e.orphan = true; e.orphanReason = "itemId 不在 L1"; }

    const warnings = [];
    if (l2 && l2.report.dropped) warnings.push("丢弃 " + l2.report.dropped + " 条非法事件");
    if (l2 && (l2.store.events || []).some(e => e.orphan)) warnings.push("存在孤儿事件，已隔离出分析分母");
    warnings.push("隐私边界：API Key 不随导入导出；AI 仅允许手动通用研究问题，不读取平台个人数据");
    warnings.push("历史 grade 一律映射为 gradeSelf 且 confidenceTiming=legacy_unknown，不冒充客观正确率");
    return { state: l1, eventStore: l2 ? l2.store : null, report: l2 ? l2.report : null,
      warnings, manifest: raw.manifest || null };
  }

  window.IMPORTV = {
    LIMITS, FORBIDDEN_KEYS, MTYPES, EVENT_STREAMS,
    assertSafeObject, projectState, projectItem, projectReview, projectVerification,
    projectEventStore, eventInvalidReason, projectEvent, markOrphans, verifyRawEventStore, rechainProjectedStore, normalizeImport
  };
})();
