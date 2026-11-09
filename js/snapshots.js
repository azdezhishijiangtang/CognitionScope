/* CognitionScope · 环形快照与时间旅行
 * 关键决策（研究诚信）：回滚只恢复 L1 可变主状态；L2 事件层是 append-only，
 * 绝不回滚（回滚会破坏冻结预测与哈希链），恢复动作本身记为一条 audit 事件。
 * 摘要为 FNV 双哈希，仅用于检测意外损坏，不是密码学防伪（见 js/integrity.js）。
 */
"use strict";
window.SNAP = (function () {
  const VERSION = "snap/9.0";
  const KEY = "cogscope_v9_snapshots";
  const DEFAULT_CAP = 20;

  function stable(v) {
    if (v == null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  }
  function digest(payload) {
    const s = stable(payload);
    let h1 = 2166136261, h2 = 0x9e3779b9;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822519);
    }
    return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  }

  function capture(l1, l2, opts) {
    const o = opts || {};
    const payload = { l1: l1 || {}, l2: l2 || {} };
    return {
      schema: 1, VERSION,
      id: "snap-" + (o.now == null ? Date.now() : o.now) + "-" + digest(payload).slice(0, 6),
      at: o.now == null ? Date.now() : o.now,
      label: String(o.label || "手动快照"),
      l1: payload.l1, l2: payload.l2,
      digest: digest(payload),
      l1Schema: payload.l1.schemaVersion == null ? null : payload.l1.schemaVersion,
      nItems: Array.isArray(payload.l1.items) ? payload.l1.items.length : 0,
      note: "摘要仅检测意外损坏；L2 只存轻量摘要（stats），事件层不随快照回滚"
    };
  }

  function verify(rec) {
    if (!rec || typeof rec !== "object" || typeof rec.digest !== "string") return false;
    return rec.digest === digest({ l1: rec.l1 || {}, l2: rec.l2 || {} });
  }

  function push(list, rec, cap) {
    const c = Math.max(1, cap || DEFAULT_CAP);
    return (Array.isArray(list) ? list : []).concat([rec]).slice(-c);
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(verify) : [];
    } catch (_) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (_) { return false; }
  }
  /** 配额不足时自动淘汰最旧快照，避免新功能自己撑爆 localStorage */
  function saveWithEviction(list, opts) {
    const o = opts || {};
    let arr = Array.isArray(list) ? list.slice() : [], dropped = 0;
    const maxDrops = o.maxDrops == null ? 50 : o.maxDrops;
    while (arr.length) {
      try { localStorage.setItem(KEY, JSON.stringify(arr)); return { ok: true, dropped, kept: arr.length }; }
      catch (_) { arr = arr.slice(1); dropped++; if (dropped > maxDrops) break; }
    }
    return { ok: false, dropped, kept: 0 };
  }

  /** 结构化差异：按 items[].id 比较，输出可直接展示的摘要 */
  function diff(a, b) {
    const A = new Map((((a || {}).items) || []).map(x => [String(x.id), x]));
    const B = new Map((((b || {}).items) || []).map(x => [String(x.id), x]));
    const added = [], removed = [], changed = [];
    for (const [id, v] of B) if (!A.has(id)) added.push(id);
    for (const [id, v] of A) {
      if (!B.has(id)) { removed.push(id); continue; }
      if (stable(v) !== stable(B.get(id))) changed.push(id);
    }
    return { added, removed, changed,
      nBefore: A.size, nAfter: B.size,
      identical: !added.length && !removed.length && !changed.length };
  }

  /**
   * 恢复 L1。P 需提供 commitState(mutator)；CS6 可选，用于留痕。
   * 任何一步失败都交给 PERSIST 的双键回滚，本函数不直接写存储。
   */
  function restore(rec, P, CS6) {
    if (!verify(rec)) return { ok: false, reason: "快照摘要不匹配，拒绝恢复" };
    if (!P || typeof P.commitState !== "function") return { ok: false, reason: "PERSIST 不可用" };
    let r;
    try {
      r = P.commitState(d => {
        for (const k of Object.keys(d)) delete d[k];
        Object.assign(d, rec.l1);
      });
    } catch (e) { return { ok: false, reason: "提交异常：" + e.message }; }
    if (!r || !r.ok) return { ok: false, reason: "提交失败，已由 PERSIST 回滚", detail: r && r.error };
    let audit = null;
    if (CS6 && typeof CS6.append === "function") {
      try { audit = CS6.append("audit", { action: "snapshot_restore", snapshotId: rec.id,
        at: Date.now(), note: "L2 事件层未回滚（append-only）" }); }
      catch (_) { audit = null; }
    }
    return { ok: true, restoredL1: true, l2RolledBack: false, auditSeq: audit && audit.record ? audit.record.seq : null,
      note: "仅恢复 L1 主状态；L2 冻结预测与事件链保持不变" };
  }

  return { VERSION, KEY, DEFAULT_CAP, stable, digest, capture, verify, push,
    loadAll, save, saveWithEviction, diff, restore };
})();
