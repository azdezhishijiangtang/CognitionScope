/* CognitionScope · persistence.js —— 统一事务写入（v5 新增模块）
 * 修复 v4 规格 §2.2 的两处实施陷阱：
 *   (a) v3 core.js 的 state 是 getter-only；严格模式下 `CS.state = draft` 抛 TypeError
 *       → v5 由 core.js 导出 replaceState(next)，禁止直接赋值
 *   (b) v4「先写存储、再换内存」在 catch 里只恢复内存，存储未回滚
 *       → v5 先换内存、再写存储；任一失败同时回滚内存与存储原值
 * 依赖：CS.replaceState / CS.KEY / normalizeState / validateState（由 core 提供）
 */
"use strict";
(function () {
  const okResult = value => ({ ok: true, persisted: true, value, error: null });
  const failResult = (code, message) => ({ ok: false, persisted: false, value: null, error: { code, message } });

  function safeClone(x) {
    return typeof structuredClone === "function"
      ? structuredClone(x)
      : JSON.parse(JSON.stringify(x));
  }

  /* 原子提交：内存与持久化要么一起变，要么一起不变 */
  function commitState(mutator, hooks) {
    const h = hooks || {};
    const normalize = h.normalizeState || (x => x);
    const validate = h.validateState || (() => true);
    const CS = window.CS;
    const KEY = CS.KEY || "cogscope_v1";
    const before = CS.state;
    const rawBefore = localStorage.getItem(KEY);       // 用于失败回滚（可能为 null）
    let draft;
    try {
      draft = safeClone(before);
      mutator(draft);
      normalize(draft);
      validate(draft);                                  // 抛错即整体失败
      const serialized = JSON.stringify(draft);
      CS.replaceState(draft);                           // ① 内存先行（v5 修正）
      localStorage.setItem(KEY, serialized);            // ② 存储后写
      return okResult(draft);
    } catch (err) {
      // 双向回滚：内存恢复 + 存储恢复原值（含「原本不存在」的情形）
      try { CS.replaceState(before); } catch (_) { /* noop：保持只读时至少存储正确 */ }
      try {
        if (rawBefore === null) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, rawBefore);
      } catch (_) { /* 存储不可用时在结果中标记 */ }
      const quota = err && (err.name === "QuotaExceededError" || /quota/i.test(String(err.message)));
      const getter = /only a getter|Cannot set property state/.test(String(err && err.message));
      return failResult(
        quota ? "QUOTA" : getter ? "READONLY_STATE" : "PERSISTENCE",
        quota ? "本地存储空间不足" : getter ? "state 为只读，请使用 CS.replaceState" : ("保存失败：" + (err && err.message))
      );
    }
  }

  /* 导入：备份 → 原子提交；失败时可从备份键完整恢复（覆盖全部新增键） */
  function atomicImport(newState, opts) {
    const o = opts || {};
    const CS = window.CS;
    const keys = o.keys || [CS.KEY];                  // v5：events/predictions/probes/registry/assign 全部纳入
    const snapshots = {};
    for (const k of keys) snapshots[k] = localStorage.getItem(k);
    try {
      localStorage.setItem(o.backupKey || "cogscope_v1_preimport", JSON.stringify({ at: Date.now(), snapshots }));
    } catch (e) { return failResult("BACKUP", "导入前备份失败：" + e.message); }
    const r = commitState(draft => { for (const k of Object.keys(newState)) draft[k] = newState[k]; }, o);
    if (!r.ok) return r;
    return { ok: true, persisted: true, value: r.value, backup: o.backupKey || "cogscope_v1_preimport", error: null };
  }

  function restoreBackup(backupKey) {
    const raw = localStorage.getItem(backupKey || "cogscope_v1_preimport");
    if (!raw) return failResult("NO_BACKUP", "未找到导入前备份");
    const { snapshots } = JSON.parse(raw);
    for (const [k, v] of Object.entries(snapshots)) {
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    }
    window.CS.load();
    return okResult(window.CS.state);
  }

  /* ======================================================================
     v6 新增：L1 + L2 双键事务
     L1 = CS（可变主状态，cogscope_v1）
     L2 = CS6（append-only 事件层，cogscope_v6_events）
     纪律：内存先行、存储后写；任一失败两个键与两份内存一起回滚。
     ====================================================================== */
  const L2KEY = "cogscope_v6_events";

  function defaultHooks() {
    const CS = window.CS || {};
    return {
      normalizeState: typeof CS.normalizeState === "function" ? CS.normalizeState : (x => x),
      validateState: typeof CS.validateState === "function" ? CS.validateState : (() => true)
    };
  }

  function rollbackAll(l1Mem, l1Raw, l2Mem, l2Raw) {
    try { window.CS.replaceState(l1Mem); } catch (_) {}
    try { if (window.CS6) window.CS6.replaceState(l2Mem); } catch (_) {}
    try {
      if (l1Raw === null) localStorage.removeItem(window.CS.KEY);
      else localStorage.setItem(window.CS.KEY, l1Raw);
    } catch (_) {}
    try {
      if (l2Raw === null) localStorage.removeItem(L2KEY);
      else localStorage.setItem(L2KEY, l2Raw);
    } catch (_) {}
  }

  /**
   * 一次业务动作同时改 L1 与 L2。
   * @param mutatorL1  (draft) => void，修改 L1 草稿
   * @param eventSpecs [{ stream, record }]，全部先 dryRun 构造再提交
   * @param opts       { hooks, at, paramVersion }
   */
  function commitBoth(mutatorL1, eventSpecs, opts) {
    const o = opts || {};
    const CS = window.CS, CS6 = window.CS6;
    if (!CS || !CS6) return failResult("NO_LAYER", "L1/L2 数据层未装载");
    const hooks = Object.assign(defaultHooks(), o.hooks || {});
    const l1Mem = CS.state, l2Mem = CS6.snapshot();
    const l1Raw = localStorage.getItem(CS.KEY), l2Raw = localStorage.getItem(L2KEY);
    let serializedL1;
    try {
      const draft = safeClone(l1Mem);
      mutatorL1(draft);
      hooks.normalizeState(draft);
      hooks.validateState(draft);
      serializedL1 = JSON.stringify(draft);

      // ① 事件先在内存构造（persist:false），任何一条非法都会抛错、两个层都未落盘
      const built = [];
      for (const spec of eventSpecs || []) {
        if (!CS6.STREAMS[spec.stream]) throw new Error("未登记的事件流：" + spec.stream);
        built.push(CS6.append(spec.stream, spec.record,
          { persist: false, at: o.at, paramVersion: o.paramVersion }).record);
      }
      // ② 内存先行
      CS.replaceState(draft);
      // ③ 存储后写（L1 → L2；L2 写失败会把 L1 一起回滚）
      localStorage.setItem(CS.KEY, serializedL1);
      localStorage.setItem(L2KEY, JSON.stringify(CS6.state));
      return { ok: true, persisted: true, value: draft, events: built, error: null };
    } catch (err) {
      rollbackAll(l1Mem, l1Raw, l2Mem, l2Raw);
      const quota = err && (err.name === "QuotaExceededError" || /quota/i.test(String(err.message)));
      return failResult(quota ? "QUOTA" : "PERSISTENCE", "双键事务失败并已回滚：" + (err && err.message));
    }
  }

  /** 只提交 L2（例如记录一次同意、一条探针结果），不动 L1 */
  function commitEvent(stream, record, opts) {
    const CS6 = window.CS6;
    if (!CS6) return failResult("NO_LAYER", "L2 数据层未装载");
    const o = opts || {};
    const before = CS6.snapshot(), raw = localStorage.getItem(L2KEY);
    try {
      const r = CS6.append(stream, record, { persist: false, at: o.at, paramVersion: o.paramVersion });
      if (!r || !r.ok) throw new Error(r && r.error || "事件构造失败");
      localStorage.setItem(L2KEY, JSON.stringify(CS6.state));
      return { ok: true, persisted: true, value: r.record, error: null };
    } catch (err) {
      const CS = window.CS;
      rollbackAll(CS ? CS.state : null, CS ? localStorage.getItem(CS.KEY) : null, before, raw);
      return failResult("PERSISTENCE", "事件写入失败并已回滚：" + err.message);
    }
  }

  /** 导入完整 bundle：校验 → 投影 → 备份 → 双键原子提交 */
  function importBundle(text, opts) {
    const o = opts || {};
    if (!window.IMPORTV) return failResult("NO_VALIDATOR", "导入校验模块未装载");
    let parsed;
    try { parsed = window.IMPORTV.normalizeImport(text, o); }
    catch (e) { return failResult("VALIDATION", e.message); }
    const CS = window.CS, CS6 = window.CS6;
    const backupKey = o.backupKey || "cogscope_v6_preimport";
    const snapshots = { [CS.KEY]: localStorage.getItem(CS.KEY), [L2KEY]: localStorage.getItem(L2KEY) };
    try { localStorage.setItem(backupKey, JSON.stringify({ at: Date.now(), snapshots })); }
    catch (e) { return failResult("BACKUP", "导入前备份失败：" + e.message); }

    const l1Mem = CS.state, l2Mem = CS6.snapshot();
    const l1Raw = snapshots[CS.KEY], l2Raw = snapshots[L2KEY];
    try {
      const newL1 = CS.migrate(parsed.state);       // 用 v3 迁移器保持 schema v4 语义
      const newL2 = parsed.eventStore ? CS6.migrate(parsed.eventStore) : CS6.migrate({});
      CS.replaceState(newL1);
      CS6.replaceState(newL2);
      localStorage.setItem(CS.KEY, JSON.stringify(newL1));
      localStorage.setItem(L2KEY, JSON.stringify(newL2));
      // 审计：导入必须留痕
      const a = CS6.append("audit", { action: "import_bundle", warnings: parsed.warnings.join("；"),
        manifestHash: parsed.manifest ? parsed.manifest.manifestHash : null });
      localStorage.setItem(L2KEY, JSON.stringify(CS6.state));
      return { ok: true, persisted: true, value: newL1, backup: backupKey,
        warnings: parsed.warnings, report: parsed.report, auditSeq: a.record.seq, error: null };
    } catch (err) {
      rollbackAll(l1Mem, l1Raw, l2Mem, l2Raw);
      return failResult("PERSISTENCE", "导入失败并已回滚：" + err.message);
    }
  }

  window.PERSIST = {
    commitState, atomicImport, restoreBackup, safeClone,
    commitBoth, commitEvent, importBundle, rollbackAll, L2KEY
  };
})();
