/* CognitionScope · experiments.js —— N=1 实验：决策规则 / 分配 / 防 peeking / 分析
 * v5 相对 v4 的三处升级：
 *   ① 随机化单位不再「由用户随手选」，给出可执行的决策规则 chooseUnit()
 *   ② 防 peeking 由 UI 规格升级为可断言的 mayRevealComparison()
 *   ③ 分析必须报效应量 + bootstrap 区间，置换检验须声明交换性前提
 */
"use strict";
(function () {
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  const stable = x => JSON.stringify(x,(_k,v)=>(v&&typeof v==="object"&&!Array.isArray(v))?Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),{}):v);

  /* ① 随机化单位决策规则（v4 只说「依据实验问题选择」，未给判据） */
  function chooseUnit(q) {
    const x = q || {};
    if (x.unitOverride) {
      if (!["item","day_block","session_block"].includes(x.unitOverride)) throw new Error("非法随机化单位");
      return { unit: x.unitOverride, reason: "用户在预注册时显式指定并已锁定", locked: true };
    }
    if (x.carryoverRisk)
      return { unit: "day_block", reason: "存在携带效应，改用随机区块 + 洗脱期，避免条件内污染", design: "randomized_block_crossover", washoutRequired: true };
    if (x.itemLevelMeasurable && x.itemsStableOverPeriod)
      return { unit: "item", reason: "同一条目可在 A/B 两条件下都被观测（within-item），消除条目难度差异", design: "AB/BA within-item" };
    return { unit: "session_block", reason: "条目无法跨条件重复测量，退回到区块级并强制报告混淆限制", design: "randomized_block", caveat: "难度/学科/疲劳可能与区块混淆，结论需降权" };
  }

  /* ② 预注册封存：分配表一次性生成，运行期只读 */
  function sealAssignment(registry, itemIds, seed) {
    if (registry.status !== "preregistered") throw new Error("必须先预注册锁定");
    const u=chooseUnit(registry.randomizationHint), ids=(itemIds||[]).map(String);
    let state=(Number(seed)||1)>>>0; if(!state)state=1;
    const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const table={};
    if(u.unit==="item"){
      for(const id of ids) table[id]=(rnd()<0.5?["A","B","B","A"]:["B","A","A","B"]);
    }else{
      const shuffled=ids.slice();
      for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
      shuffled.forEach((id,i)=>{table[id]=[i%2===0?"A":"B"];});
    }
    const body=JSON.stringify({regId:registry.experimentId,unit:u.unit,seed,table});
    return {regId:registry.experimentId,regHash:registry.preregistrationHash,unit:u.unit,design:u.design,
      reason:u.reason,caveat:u.caveat||null,algorithmVersion:"lcg-fy-1",seed,sealedAt:Date.now(),table,
      contentHash:hash(body),note:u.unit==="item"?"条目内平衡交叉序列":"输入 ID 必须是实际日期/会话区块 ID；区块级 A/B 随机分配"};
  }

  /* ③ 防 peeking：门槛 + 周期双重达标前，UI 不得显示组间比较 */
  function mayRevealComparison(registry, assignment, events, now) {
    const t = now || Date.now();
    if (registry.status !== "preregistered") return { allow: false, reason: "未预注册" };
    if (!assignment || !assignment.sealedAt) return { allow: false, reason: "分配表未封存" };
    const elapsedDays = (t - assignment.sealedAt) / 86400000;
    const required = (registry.baselineDays || 0) + (registry.interventionDays || 0) + (registry.washoutDays || 0) + (registry.followUpDays || 0);
    if (elapsedDays < required) return { allow: false, reason: `周期未满（${elapsedDays.toFixed(1)}/${required} 天）` };
    const per = (registry.minimumSessionsPerCondition || 0);
    const valid = (events || []).filter(e => e && (e.conditionId === "A" || e.conditionId === "B"));
    const unitOf = e => assignment.unit === "item" ? e.itemId : (e.randomizationUnitId || (assignment.unit === "day_block" ? e.dayId : e.sessionId));
    const table=assignment.table||{};
    const unassigned=valid.filter(e=>{const id=unitOf(e),seq=id!=null?table[id]:null;return !Array.isArray(seq)||!seq.includes(e.conditionId);});
    if(unassigned.length)return{allow:false,reason:"存在不属于封存分配表的观测（"+unassigned.length+" 条），拒绝解锁比较"};
    const unitsA = new Set(valid.filter(e=>e.conditionId==="A").map(unitOf));
    const unitsB = new Set(valid.filter(e=>e.conditionId==="B").map(unitOf));
    const nA = unitsA.size, nB = unitsB.size;
    if (nA < per || nB < per) return { allow: false, reason: `配对数不足（A=${nA}, B=${nB}, 需各 ${per}）` };
    return { allow: true, reason: "周期与门槛均达标", nA, nB };
  }

  /* ④ 分析：ITT 配对差值 + 符号翻转置换 + bootstrap 区间，绝不报裸 p */
  function analyze(pairs, opts) {
    const o = Object.assign({ perms: 5000, boots: 2000, seed: 1 }, opts || {});
    const d = pairs.map(p => p.b - p.a);
    const n = d.length;
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const effect = mean(d);
    let s = o.seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    // 符号翻转置换（配对设计下与随机化机制匹配）
    let extreme = 0;
    for (let k = 0; k < o.perms; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += (rnd() < 0.5 ? -1 : 1) * d[i];
      if (Math.abs(sum / n) >= Math.abs(effect) - 1e-12) extreme++;
    }
    const p = (extreme + 1) / (o.perms + 1);
    // bootstrap 区间
    const bs = [];
    for (let k = 0; k < o.boots; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += d[Math.floor(rnd() * n)];
      bs.push(sum / n);
    }
    bs.sort((a, b) => a - b);
    const q = x => bs[Math.min(bs.length - 1, Math.floor(x * bs.length))];
    return {
      n, effectSize: +effect.toFixed(4),
      ci95: [+q(0.025).toFixed(4), +q(0.975).toFixed(4)],
      permutationP: +p.toFixed(4),
      assumption: "配对符号可交换；若随机化单位与配对单位不一致，本检验无效",
      conclusion: p < 0.05 ? "支持（个体内、该时间段）" : "不支持/不确定",
      caveat: "单次 N=1 结果不可推广；不得表述为「已证明有效」"
    };
  }

  /* ======================================================================
     v6 新增：预注册校验 / ITT 依从性 / 干预保真度接入 / 完整报告
     v5 只做了「决策规则 + 封存 + 防 peeking + 分析」；
     v6 补齐「实验能否被相信」的三道关：预注册完整性、ITT 依从性、调度器保真度。
     ====================================================================== */
  const ALLOWED_OUTCOMES = ["delayed_verified_accuracy", "recallDurationMs",
    "selfRatedPassRate", "verifiedAccuracy"];
  const CONCLUSIONS = ["支持（个体内、该时间段）", "不支持/不确定"];

  const PREREG_TEMPLATE = {
    experimentId: null, status: "draft",
    hypothesis: null, primaryOutcome: "delayed_verified_accuracy",
    secondaryOutcomes: [], expectedDelta: null, MISD: 0.05,
    baselineDays: 7, interventionDays: 14, washoutDays: 3, followUpDays: 7,
    minimumSessionsPerCondition: 5,
    randomizationHint: { itemLevelMeasurable: true, itemsStableOverPeriod: true },
    unitOverride: null, analysisPlan: "ITT 配对差值 + 符号翻转置换 + bootstrap 95% 区间",
    exchangeabilityAssumption: null, stoppingRule: "周期与门槛达成前不看组间比较",
    preregistrationHash: null, preregisteredAt: null,
    caveats: "单次 N=1 结果不可推广；不得表述为「已证明有效」"
  };

  /** 预注册必填校验：缺一项都不允许封存分配表 */
  function validateRegistry(reg) {
    const r = reg || {}, errors = [];
    if (!r.experimentId) errors.push("缺 experimentId");
    if (!r.hypothesis) errors.push("缺可检验假设");
    if (!ALLOWED_OUTCOMES.includes(r.primaryOutcome)) errors.push("主要结局不在允许值内");
    if (!Array.isArray(r.secondaryOutcomes) || r.secondaryOutcomes.length > 2) errors.push("次要结局最多 2 个（多重比较）");
    if ((r.secondaryOutcomes || []).some(x=>!ALLOWED_OUTCOMES.includes(x)||x===r.primaryOutcome)) errors.push("次要结局必须是允许值且不得重复主要结局");
    if (!r.analysisPlan || typeof r.analysisPlan !== "string") errors.push("缺预先指定的分析计划");
    try { chooseUnit(r.randomizationHint || {}); } catch(e) { errors.push("随机化单位无效："+e.message); }
    if (!Number.isFinite(r.MISD) || r.MISD <= 0) errors.push("MISD 须为正有限数");
    if (!Number.isFinite(r.expectedDelta) || Math.abs(r.expectedDelta) < (r.MISD || 0.05))
      errors.push("expectedDelta 须为有限数且不小于 MISD");
    if (!Number.isInteger(r.baselineDays) || r.baselineDays < 0 || !Number.isInteger(r.interventionDays) || r.interventionDays < 7 ||
        !Number.isInteger(r.washoutDays) || r.washoutDays < 0 || !Number.isInteger(r.followUpDays) || r.followUpDays < 0)
      errors.push("基线/洗脱/随访须为非负整数，干预周期须为整数且 ≥7 天");
    if (!Number.isInteger(r.minimumSessionsPerCondition) || r.minimumSessionsPerCondition < 5)
      errors.push("最少配对数须为整数且 ≥5");
    if (!r.exchangeabilityAssumption) errors.push("缺交换性前提声明");
    if (!r.stoppingRule || !/不看|禁止|达标前/.test(r.stoppingRule)) errors.push("缺防 peeking 停止规则");
    if (r.primaryOutcome === "delayed_verified_accuracy" && !/延迟|delayed/.test(String(r.hypothesis)))
      errors.push("主要结局为延迟正确率，但假设未提及延迟测验");
    return { ok: errors.length === 0, errors,
      note: "预注册一旦封存，周期/主要结局/MISD/随机化单位均不可修改" };
  }

  /** 封存预注册：生成不可变 hash，status → preregistered */
  function preregister(reg) {
    const v = validateRegistry(reg);
    if (!v.ok) return { ok: false, errors: v.errors };
    const r = Object.assign({}, PREREG_TEMPLATE, reg);
    const frozenFields = Object.assign({}, r);
    delete frozenFields.preregistrationHash; delete frozenFields.preregisteredAt; delete frozenFields.status;
    const body = stable(frozenFields);
    r.preregistrationHash = hash(body);
    r.preregisteredAt = Date.now();
    r.status = "preregistered";
    return { ok: true, registry: r, hash: r.preregistrationHash };
  }

  /** 依从性报告：ITT 保留所有随机化的事件，per-protocol 仅作敏感性分析 */
  function adherenceReport(events, opts) {
    const o = opts || {};
    const evs = (events || []).filter(e => e && e.experimentId);
    // ITT denominator is every randomized event; exclusion flags are retained as missingness metadata.
    const itt = evs;
    const deviated = itt.filter(e => e.adherence === "deviated" || e.protocolApplied === false);
    const perProtocol = itt.filter(e => !deviated.includes(e) && !e.excluded);
    return {
      randomized: evs.length, ittN: itt.length, perProtocolN: perProtocol.length,
      deviations: deviated.length, deviationRate: itt.length ? +(deviated.length / itt.length).toFixed(3) : null,
      excluded: evs.filter(e=>e.excluded).length,
      primary: "随机分配事件保留；当前数值估计为 complete-case 完整配对分析，不等于缺失数据已解决的完整 ITT", sensitivity: "per-protocol（仅作对照，不得替换主要结论）",
      note: "偏离事件必须保留在 ITT 分母；事后剔除会破坏随机化并制造虚假效应",
      verdict: deviated.length && itt.length && deviated.length / itt.length > (o.maxDeviationRate || 0.2)
        ? "依从性偏低：结论须标注并考虑重跑" : "依从性可接受"
    };
  }

  /** ITT 配对构造：按 itemId 配 A/B，缺失条件保留为 null（不静默丢弃） */
  function ittPairs(events) {
    const by = {};
    for (const e of (events || []).filter(Boolean)) {
      const k = e.randomizationUnitId || e.sessionId || e.dayId || e.itemId || e.pairId || "unknown";
      const b = by[k] = by[k] || { A: [], B: [], missingA: 0, missingB: 0 };
      if (e.conditionId === "A" || e.conditionId === "B") {
        if (Number.isFinite(e.value)) b[e.conditionId].push(e.value);
        else b[e["missing" + e.conditionId]]++;
      }
    }
    const pairs = [], incomplete = [];
    for (const k of Object.keys(by)) {
      const b = by[k];
      const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      const a = mean(b.A), v = mean(b.B);
      if (a == null || v == null) { incomplete.push({ id: k, a, b: v }); continue; }
      pairs.push({ a, b: v, id: k });
    }
    return { pairs, incomplete, nPairs: pairs.length,
      note: "不完整配对单列报告；完整配对均值是 complete-case 分析，不得冒称完整 ITT，须另做预注册缺失数据敏感性分析" };
  }

  /** 接 FORECAST：调度器保真度（不重复实现，显式依赖） */
  function fidelityOf(registry, predictions, forecast) {
    const F = forecast || window.FORECAST;
    // 保守原则：无法判定保真度时一律视为不足，不得放行因果结论
    if (!F || typeof F.interventionFidelity !== "function")
      return { adequate: false, reason: "FORECAST 模块未装载，无法判定保真度 → 结论降权",
        failed: [{ id: "F0", text: "缺少保真度判定模块" }], nPredictions: 0 };
    return F.interventionFidelity(registry, predictions, { minPredictions: 10 });
  }

  /**
   * 完整实验报告：按固定顺序过五关，任一不过都不产出因果结论。
   * ① 防 peeking ② 预注册完整性 ③ ITT 依从性 ④ 调度器保真度 ⑤ 置换检验
   */
  function fullReport(ctx) {
    const c = ctx || {};
    const reg = c.registry || {}, assignment = c.assignment, events = c.events || [];
    const gate = mayRevealComparison(reg, assignment, events, c.now);
    if (!gate.allow) return {
      status: "locked", reason: gate.reason,
      note: "周期/门槛未达成前，UI 不得显示任何组间比较（防 peeking）",
      conclusion: null, showComparison: false
    };
    const regV = validateRegistry(reg);
    if (!regV.ok) return { status: "invalid_preregistration", errors: regV.errors,
      conclusion: null, showComparison: false };
    const adh = adherenceReport(events);
    const fid = fidelityOf(reg, c.predictions || [], c.forecast);
    const dose = (c.forecast && c.forecast.doseReport) ? c.forecast.doseReport(events) : null;
    const ip = ittPairs(events);
    let analysis = null;
    if (ip.nPairs >= 3) analysis = analyze(ip.pairs, c.analyzeOpts || { perms: 2000, boots: 1000, seed: 7 });
    const downgraded = (fid.adequate === false) || (dose && dose.suspicious) ||
      (adh.verdict && /偏低/.test(adh.verdict));
    const conclusion = !analysis ? "不确定（配对不足）"
      : ip.incomplete.length ? "不确定（存在缺失结局；当前为完整配对分析，不得称为完整 ITT）"
      : downgraded ? "不确定（干预保真度/依从性不足，结论降权）"
      : "探索性个体内差异（不是普遍因果证明）";
    return {
      status: "reported", showComparison: true,
      peeking: gate, preregistration: regV, adherence: adh,
      fidelity: fid, dose, itt: { nPairs: ip.nPairs, incomplete: ip.incomplete.length },
      analysis, downgraded, conclusion,
      conclusionPolicy: CONCLUSIONS,
      caveats: [
        "单次 N=1 结果不可推广；不得表述为「已证明有效」",
        "结论只在预注册的时间窗与主要结局上成立",
        "不显著也须存档，禁止只报告显著结果",
        downgraded ? "已降权：调度器未校准或依从性偏低，剂量可能不是实验条件造成的" : null
      ].filter(Boolean),
      reportHash: hash(JSON.stringify({ reg: reg.preregistrationHash, conclusion, ip: ip.nPairs }))
    };
  }

  window.EXP = {
    hash, chooseUnit, sealAssignment, mayRevealComparison, analyze,
    ALLOWED_OUTCOMES, CONCLUSIONS, PREREG_TEMPLATE,
    validateRegistry, preregister, adherenceReport, ittPairs, fidelityOf, fullReport
  };
})();
