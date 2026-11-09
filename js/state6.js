/* CognitionScope · state6.js —— L2 事件层（schema v6，append-only，本地一致性校验链）
 * ============================================================================
 * 架构决策（v6）：
 *   L1 = CS（v3 主状态，schemaVersion 4，可变：items / reviews / lab / pcm）
 *   L2 = CS6（本模块，schemaVersion 6，独立事件流，带本地一致性校验）
 *
 * 为什么分开：
 *   ① v5 规格要求「每次排期时的 r / S / 参数版本必须冻结，与 reviews 分开存」。
 *      一旦用拟合后的新参数重算 stateAt，历史预测会被静默重写，旧模型永远无法评估。
 *   ② L1 的 reviews 有 200 条滚动归档；校准所需的 (r,y) 配对会永久丢失。
 *   ③ 独立键让「导入 L1 历史数据」不会误伤已冻结的观测事件。
 *
 * 不变量（由 append / verifyChain 保证）：
 *   - 每个 stream 只追加，已有记录不可修改、不可删除、不可重排
 *   - 每条记录带 seq / at / paramVersion / prevHash / hash（非密码学 FNV-1a 一致性链）
 *   - 普通意外修改可被 verifyChain() 发现；不能抵御拥有本地写权限者重算整条链
 *   - 事件与 L1 只通过 itemId / reviewKey 弱关联，绝不回写 L1
 *
 * 零 DOM 依赖：可在 Node 中 `global.window=global` 后直接 require 测试。
 */
"use strict";
(function () {
  const KEY = "cogscope_v6_events";
  const BACKUP_KEY = KEY + "_preimport";
  const SCHEMA_VERSION = 6;
  const DAY = 86400000;

  /* 允许的流及其必需字段（新增流必须在此登记，避免任意键注入） */
  const STREAMS = {
    events:            { required: ["kind"],            desc: "冻结的 (预测 r, 实际 y) 配对 / 观测事件" },
    predictions:       { required: ["itemId", "rPred"], desc: "排期时冻结的留存预测" },
    probeLog:          { required: ["itemId", "r", "y"], desc: "探针结果（不写 reviews、不更新 S）" },
    verificationLog:   { required: ["itemId"],          desc: "要点核验结果" },
    timingLog:         { required: ["itemId", "state"], desc: "三段计时事件" },
    experiments:       { required: ["experimentId"],    desc: "预注册实验" },
    assignments:       { required: ["regId"],           desc: "封存分配表（运行期只读）" },
    trialEvents:       { required: ["experimentId"],    desc: "实验观测 / 依从性 / ITT 事件" },
    hypothesisCards:   { required: ["primaryOutcome"],  desc: "可证伪假设卡（本地校验，不外发）" },
    calibrationRuns:   { required: ["n"],               desc: "校准评估结果快照" },
    paramFits:         { required: ["paramVersion"],    desc: "参数拟合结果与版本" },
    consentLog:        { required: ["feature"],         desc: "本地授权台账：授权 / 撤销 / 审计（不外发）" },
    audit:             { required: ["action"],          desc: "数据治理审计（导入、回滚、归档）" }
  };

  function fnv1a(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  const stableStringify = x => JSON.stringify(x, (_k, v) =>
    (v && typeof v === "object" && !Array.isArray(v))
      ? Object.keys(v).sort().reduce((o, k) => (o[k] = v[k], o), {}) : v);

  function blank() {
    const st = {
      schemaVersion: SCHEMA_VERSION,
      appName: "CognitionScope",
      layer: "L2-event-store",
      createdAt: Date.now(),
      paramVersion: "v7-init",
      chainAlgorithm: "fnv1a-1-integrity-only",
      counters: {},
      archives: []
    };
    for (const k of Object.keys(STREAMS)) { st[k] = []; st.counters[k] = 0; }
    return st;
  }

  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? migrate(JSON.parse(raw)) : blank();
    } catch (e) {
      console.error("CS6.load fail", e);
      state = blank();
    }
    return state;
  }

  function migrate(d) {
    const b = blank();
    if (!d || typeof d !== "object" || Array.isArray(d)) d = {};
    b.createdAt = Number.isFinite(d.createdAt) ? d.createdAt : b.createdAt;
    b.paramVersion = typeof d.paramVersion === "string" ? d.paramVersion : b.paramVersion;
    b.counters = (d.counters && typeof d.counters === "object") ? d.counters : b.counters;
    b.archives = Array.isArray(d.archives) ? d.archives.slice() : [];
    for (const k of Object.keys(STREAMS)) {
      const arr = Array.isArray(d[k]) ? d[k] : [];
      // 迁移时保留原记录的 seq/hash；不重新编号（避免把外部导入的事件链"洗白"）
      b[k] = arr.filter(r => r && typeof r === "object" && !Array.isArray(r));
      b.counters[k] = b[k].reduce((m, r) => Math.max(m, Number.isFinite(r.seq) ? r.seq : 0), 0);
    }
    return b;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { console.error("CS6.save fail", e); return false; }
  }

  /* ---------- 核心：只追加 ---------- */
  function ensure() { if (!state) load(); return state; }

  function recordHash(stream, rec) {
    const body = Object.assign({}, rec);
    delete body.hash;                       // hash 本身不参与计算
    return fnv1a(stream + "|" + stableStringify(body));
  }

  function tailHash(stream) {
    const s = ensure();
    const arr = s[stream];
    return arr.length ? arr[arr.length - 1].hash : "genesis";
  }

  function makeRecord(stream, rec, opts) {
    const s = ensure();
    const o = opts || {};
    if (!STREAMS[stream]) throw new Error("未登记的流：" + stream);
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) throw new Error("记录必须是对象");
    const clean = Object.assign({}, rec);
    // 链字段由本地代码生成；本地拥有者可修改并重算，不构成防伪签名
    delete clean.seq; delete clean.hash; delete clean.prevHash; delete clean.at;
    for (const f of STREAMS[stream].required)
      if (clean[f] === undefined || clean[f] === null) throw new Error(stream + " 缺少必需字段 " + f);
    const seq = s.counters[stream] + 1;
    const built = Object.assign({
      seq,
      at: Number.isFinite(o.at) ? o.at : Date.now(),
      paramVersion: o.paramVersion || s.paramVersion
    }, clean);
    built.prevHash = tailHash(stream);
    built.hash = recordHash(stream, built);
    return built;
  }

  /** 追加单条；dryRun=true 只返回将要写入的记录，不改状态、不落盘 */
  function append(stream, rec, opts) {
    const s = ensure();
    const o = opts || {};
    const built = makeRecord(stream, rec, o);
    if (o.dryRun) return { ok: true, dryRun: true, record: built };
    s[stream].push(built);
    s.counters[stream] = built.seq;
    if (o.persist !== false && !save()) {
      s[stream].pop(); s.counters[stream] = built.seq - 1;
      return { ok: false, persisted: false, error: "本地存储失败，事件已回滚" };
    }
    return { ok: true, persisted: o.persist !== false, record: built };
  }

  /** 批量追加：先全部构造成功再一次性写入，避免半途失败污染链 */
  function appendMany(stream, recs, opts) {
    const s = ensure();
    const o = opts || {};
    let prev = tailHash(stream);
    let seq = s.counters[stream];
    const built = [];
    for (const r of (recs || [])) {
      const clean = Object.assign({}, r);
      delete clean.seq; delete clean.hash; delete clean.prevHash; delete clean.at;
      for (const f of STREAMS[stream].required)
        if (clean[f] === undefined || clean[f] === null) throw new Error(stream + " 缺少必需字段 " + f);
      seq += 1;
      const x = Object.assign({ seq, at: Number.isFinite(o.at) ? o.at : Date.now(),
        paramVersion: o.paramVersion || s.paramVersion }, clean);
      x.prevHash = prev;
      x.hash = fnv1a(stream + "|" + stableStringify(Object.assign({}, x, { hash: undefined })));
      // recordHash 会剔除 hash 字段，保持一致
      x.hash = recordHash(stream, x);
      prev = x.hash;
      built.push(x);
    }
    if (o.dryRun) return { ok: true, dryRun: true, records: built };
    const beforeLength=s[stream].length, beforeCounter=s.counters[stream];
    for (const x of built) s[stream].push(x);
    s.counters[stream] = seq;
    if (o.persist !== false && !save()) {
      s[stream].splice(beforeLength); s.counters[stream]=beforeCounter;
      return {ok:false,persisted:false,error:"本地存储失败，批量事件已回滚"};
    }
    return { ok: true, persisted: o.persist !== false, records: built, count: built.length };
  }

  /* ---------- 完整性校验 ---------- */
  function verifyChain() {
    const s = ensure();
    const report = { ok: true, checked: 0, streams: {}, broken: [] };
    for (const stream of Object.keys(STREAMS)) {
      const arr = s[stream];
      let prev = "genesis", streamOk = true;
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        report.checked++;
        if (r.seq !== i + 1 || r.prevHash !== prev || r.hash !== recordHash(stream, r)) {
          streamOk = false;
          report.broken.push({ stream, index: i, seq: r.seq });
          break;
        }
        prev = r.hash;
      }
      report.streams[stream] = { n: arr.length, ok: streamOk };
      if (!streamOk) report.ok = false;
    }
    return report;
  }

  /** 冻结预测：两条流作为一个 L2 事务提交，失败时整体回滚。 */
  function freezePrediction(p) {
    const before=JSON.parse(JSON.stringify(ensure()));
    let rawBefore=null; try{rawBefore=localStorage.getItem(KEY);}catch(e){return{ok:false,error:e.message};}
    try {
      const base={itemId:p.itemId,t:Number.isFinite(p.t)?p.t:Date.now(),rPred:Number(p.rPred),S:Number(p.S),
        rPredSource:p.rPredSource||"model",dueThreshold:p.dueThreshold==null?0.9:p.dueThreshold,context:p.context||"scheduling"};
      const pred=append("predictions",Object.assign({kind:"prediction"},base),{persist:false});
      if(!pred.ok)throw new Error(pred.error||"prediction append failed");
      const ev=append("events",{kind:"prediction_frozen",itemId:base.itemId,t:base.t,r:base.rPred,
        rPredSource:base.rPredSource,srcRef:"predictions#"+pred.record.seq,y:null,ySource:null},{persist:false});
      if(!ev.ok)throw new Error(ev.error||"event append failed");
      if(!save())throw new Error("本地存储失败");
      return {ok:true,prediction:pred.record,event:ev.record,paramVersion:ensure().paramVersion};
    } catch(e){state=before;try{if(rawBefore===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,rawBefore);}catch(_){}return{ok:false,error:"冻结预测事务已回滚："+e.message};}
  }

  /** 观测结果及可选 probeLog 作为单事务提交；失败时整体回滚并抛错。 */
  function recordOutcome(o) {
    const before=JSON.parse(JSON.stringify(ensure()));
    let rawBefore=null; try{rawBefore=localStorage.getItem(KEY);}catch(e){throw e;}
    try {
      const ev=append("events",{kind:o.kind||"outcome",itemId:o.itemId,t:Number.isFinite(o.t)?o.t:Date.now(),
        r:o.r==null?null:Number(o.r),rPredSource:o.rPredSource||"frozen",y:o.y==null?null:Number(o.y),
        ySource:o.ySource||"self",src:o.src||"review",srcRef:o.srcRef||null,probeType:o.probeType||null,
        verificationStatus:o.verificationStatus||"unverified"},{persist:false});
      if(!ev.ok)throw new Error(ev.error||"event append failed");
      if(o.src==="probe"){
        const pr=append("probeLog",{itemId:o.itemId,t:ev.record.t,r:o.r,y:o.y,ySource:o.ySource||"self",
          probeType:o.probeType||"routine",srcRef:"events#"+ev.record.seq},{persist:false});
        if(!pr.ok)throw new Error(pr.error||"probe append failed");
      }
      if(!save())throw new Error("本地存储失败");
      return ev.record;
    }catch(e){state=before;try{if(rawBefore===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,rawBefore);}catch(_){}throw new Error("观测记录事务已回滚："+e.message);}
  }

  /* ---------- 参数版本（一旦切换，旧预测仍保留原 paramVersion） ---------- */
  function setParamVersion(v, note) {
    const before=JSON.parse(JSON.stringify(ensure())); let rawBefore=null;
    try{rawBefore=localStorage.getItem(KEY);}catch(e){return{ok:false,error:e.message};}
    try{if(typeof v!=="string"||!v)throw new Error("paramVersion 必须是非空字符串");
      const from=state.paramVersion;state.paramVersion=v;
      const a=append("audit",{action:"param_version_change",from,to:v,note:note||""},{persist:false});
      if(!a.ok)throw new Error(a.error||"审计事件写入失败");
      if(!save())throw new Error("本地存储失败");
      return{ok:true,from,to:v,auditSeq:a.record.seq};
    }catch(e){state=before;try{if(rawBefore===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,rawBefore);}catch(_){}return{ok:false,error:"参数版本事务已回滚："+e.message};}
  }

  /* ---------- 归档：只标记，不删除（append-only 不允许物理删除） ---------- */
  function archive(stream, beforeT, reason) {
    const s = ensure();
    const arr = s[stream];
    const cut = arr.filter(r => r.at < beforeT).length;
    if (!cut) return { archived: 0 };
    const rec = append("audit", { action: "archive", stream, beforeT, count: cut,
      firstSeq: arr[0].seq, lastSeq: arr[cut - 1].seq, reason: reason || "" });
    s.archives.push({ stream, beforeT, count: cut, at: Date.now(), auditSeq: rec.record.seq });
    save();
    return { archived: cut, note: "仅登记归档范围；原始记录仍完整保留以保证哈希链可验证" };
  }

  function snapshot() {
    const s = ensure();
    return JSON.parse(JSON.stringify(s));
  }

  function stats() {
    const s = ensure();
    const out = { schemaVersion: s.schemaVersion, paramVersion: s.paramVersion, streams: {} };
    for (const k of Object.keys(STREAMS)) {
      const arr = s[k];
      out.streams[k] = {
        n: arr.length,
        firstAt: arr.length ? arr[0].at : null,
        lastAt: arr.length ? arr[arr.length - 1].at : null
      };
    }
    out.chain = verifyChain();
    return out;
  }

  function exportJSON() {
    return JSON.stringify(snapshot(), null, 2);
  }

  function importJSON(text, opts) {
    const o = opts || {};
    const d = typeof text === "string" ? JSON.parse(text) : text;
    if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("无效数据：期望对象");
    if (d.layer && d.layer !== "L2-event-store") throw new Error("不是 L2 事件层导出");
    try { localStorage.setItem(o.backupKey || BACKUP_KEY, localStorage.getItem(KEY) || "null"); }
    catch (e) { console.warn("CS6 导入前备份失败", e); }
    state = migrate(d);
    save();
    return { ok: true, chain: verifyChain() };
  }

  window.CS6 = {
    KEY, BACKUP_KEY, SCHEMA_VERSION, STREAMS, DAY, fnv1a,
    blank, load, save, migrate, ensure, snapshot, stats, exportJSON, importJSON,
    append, appendMany, verifyChain, tailHash, recordHash,
    freezePrediction, recordOutcome, setParamVersion, archive,
    get state() { return state; },
    /* 仅供 persistence 事务回滚使用：一次性替换内存态 */
    replaceState(next) { state = next; }
  };
})();
