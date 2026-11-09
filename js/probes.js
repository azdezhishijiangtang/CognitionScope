/* CognitionScope · probes.js —— 三类探针调度与可识别性保障（v6）
 * ============================================================================
 * 实测发现（v5 §1 / 改进建议书 P0）：
 *   按 r < 0.9 固定阈值调度，所有常规复习观测都被压在 r ∈ [0.719, 0.898] 的窄带，
 *   r≥0.9 与 r<0.7 均无样本 → 留存曲线左右两半在数学上不可识别，
 *   模型永远无法被验证。随机探针不是可选项，而是校准的前置条件。
 *
 * 三类探针：
 *   routine  未到期（r≥τ）条目按小概率抽测 → 补高留存区
 *   delayed  刻意推迟复习到低 r 再测        → 补低留存区（v5 实测为「必需」）
 *   random   与调度状态无关的随机时刻抽样    → 无偏参照，检查前两类的选择偏差
 *
 * 铁律（由 assertIsolation 可断言）：
 *   探针结果只写 L2 probeLog / events；绝不写 L1 reviews、绝不更新 S、绝不进 findDue。
 *   否则探针本身会改变它要测量的对象（观测者效应），校准立即失效。
 */
"use strict";
(function () {
  const VERSION = "probes/6.0";
  const PROBE_TYPES = {
    routine: { label: "常规探针", target: "r ≥ τ（未到期）", purpose: "补高留存区间观测", defaultP: 0.05,
      caveat: "只在未到期条目中抽样，本身带选择偏差；不能单独用于阈值评估" },
    delayed: { label: "延迟探针", target: "r < τ_low（刻意推迟）", purpose: "补低留存区间观测", defaultP: 0.03,
      caveat: "刻意延迟复习有真实遗忘成本，必须用户知情同意并记录；不得对高价值条目强制启用" },
    random:  { label: "随机时刻探针", target: "与 r 无关", purpose: "无偏参照，检查选择偏差", defaultP: 0.01,
      caveat: "会在任意时刻打断用户；频率须严格受限" }
  };

  const DEFAULT_CFG = {
    tau: 0.9,            // findDue 的到期阈值
    tauLow: 0.7,         // 低留存区目标上界
    pRoutine: 0.05, pDelayed: 0.03, pRandom: 0.01,
    minGapDays: 2,       // 同一条目两次探针的最小间隔
    maxPerSession: 3,    // 单次会话最多探针数（控制负担）
    enabled: { routine: true, delayed: true, random: false },
    consentRequired: ["delayed"],   // 延迟探针必须显式同意
    seed: 20261105
  };

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  }

  /** 生成一轮探针计划。rOf(item,t) → 模型留存 r；probeHistory 为 L2 probeLog 快照 */
  function planProbes(items, cfg, ctx) {
    const c = Object.assign({}, DEFAULT_CFG, cfg || {});
    const x = ctx || {};
    const t = Number.isFinite(x.t) ? x.t : Date.now();
    const rOf = x.rOf || (() => null);
    const rnd = rng(c.seed ^ Math.floor(t / 86400000));
    const history = x.probeHistory || [];
    const lastByItem = {};
    history.forEach(h => { lastByItem[h.itemId] = Math.max(lastByItem[h.itemId] || 0, h.t || 0); });
    const consent = x.consent || {};
    const plans = [];
    for (const it of items || []) {
      if (plans.length >= c.maxPerSession) break;
      // rOf 兼容两种签名：直接返回 r（数字），或返回 CS.stateAt 风格的 {r, S, lastReview}
      const out = rOf(it, t);
      const r = typeof out === "number" ? out : (out && Number.isFinite(out.r) ? out.r : null);
      if (!Number.isFinite(r)) continue;
      const gapOk = !lastByItem[it.id] || (t - lastByItem[it.id]) >= c.minGapDays * 86400000;
      if (!gapOk) continue;

      // 固定次序各取一个随机数，保证计划可复现（与用户是否同意无关）
      const rollRandom = rnd(), rollRoutine = rnd(), rollDelayed = rnd();
      let type = null, p = 0, reason = "", blocked = false;
      if (c.enabled.random && rollRandom < c.pRandom) {
        type = "random"; p = c.pRandom; reason = "随机时刻抽样，与到期状态无关";
      } else if (r >= c.tau && c.enabled.routine && rollRoutine < c.pRoutine) {
        type = "routine"; p = c.pRoutine; reason = "未到期条目抽测，补 r≥τ 区间";
      } else if (r < c.tau && c.enabled.delayed && rollDelayed < c.pDelayed) {
        type = "delayed"; p = c.pDelayed; reason = "刻意推迟复习，补 r<τ_low 区间";
        if (c.consentRequired.includes("delayed") && consent.delayed !== true) {
          blocked = true; reason = "缺延迟探针知情同意，已阻止执行";
        }
      }
      if (!type) continue;
      plans.push({ itemId: it.id, type, r, t, p, reason, blocked,
        label: PROBE_TYPES[type].label, caveat: PROBE_TYPES[type].caveat });
    }
    return {
      t, plans, executable: plans.filter(p => !p.blocked), blocked: plans.filter(p => p.blocked),
      cfg: c, note: "仅生成计划；是否执行由用户决定，结果只写 L2"
    };
  }

  /** 探针结果记录：结构上不含任何可写回 reviews 的字段 */
  function makeProbeRecord(plan, y, opts) {
    const o = opts || {};
    if (plan.blocked) throw new Error("被阻止的探针不得执行");
    if (!Number.isFinite(y) || y < 0 || y > 1) throw new Error("y 须为 0-1（partial 用 0.5）");
    return {
      itemId: plan.itemId, t: Number.isFinite(o.t) ? o.t : plan.t,
      r: plan.r, y, ySource: o.ySource || "probe_self",
      probeType: plan.type, rPredSource: "frozen",
      paramVersion: o.paramVersion || "unknown",
      verificationStatus: o.verificationStatus || "unverified",
      src: "probe",
      note: "探针结果不写 L1 reviews、不更新 S、不进 findDue"
    };
  }

  /** 断言探针未污染 L1：reviews 长度、S、到期判定三项必须完全不变 */
  function assertIsolation(before, after, itemId, rOf) {
    const a = (before.items || []).find(i => i.id === itemId);
    const b = (after.items || []).find(i => i.id === itemId);
    const violations = [];
    if (!a || !b) violations.push("条目不存在");
    else {
      if ((a.reviews || []).length !== (b.reviews || []).length) violations.push("reviews 被写入（观测者效应）");
      const sa = rOf ? rOf(a) : null, sb = rOf ? rOf(b) : null;
      if (sa != null && sb != null && Math.abs(sa.S - sb.S) > 1e-12) violations.push("S 被更新");
      if (sa != null && sb != null && Math.abs(sa.r - sb.r) > 1e-12) violations.push("r 被改变");
      if (JSON.stringify(a) !== JSON.stringify(b)) violations.push("条目对象整体被修改");
    }
    return { ok: violations.length === 0, violations, note: "不变量：探针只测量，不干预" };
  }

  /** 覆盖度报告：按预测 r 分桶，标出不可识别区间 */
  function coverageReport(pairs, opts) {
    const o = Object.assign({ buckets: 10, minN: 20 }, opts || {});
    const rows = [];
    for (let b = 0; b < o.buckets; b++) {
      const g = (pairs || []).filter(p => Math.min(o.buckets - 1, Math.floor(p.r * o.buckets)) === b);
      const byType = {};
      g.forEach(p => { const k = p.src || p.probeType || "review"; byType[k] = (byType[k] || 0) + 1; });
      rows.push({
        range: [+(b / o.buckets).toFixed(2), +((b + 1) / o.buckets).toFixed(2)],
        n: g.length, identifiable: g.length >= o.minN, byType,
        note: g.length === 0 ? "无观测（不可识别）" : g.length < o.minN ? "样本不足（区间宽）" : "可识别"
      });
    }
    const empty = rows.filter(r => r.n === 0).length;
    const insufficient = rows.filter(r => r.n > 0 && !r.identifiable).length;
    const identifiable = rows.filter(r => r.identifiable).length;
    return {
      buckets: o.buckets, minN: o.minN, rows, empty, insufficient, identifiable,
      identifiableFraction: +(identifiable / o.buckets).toFixed(2),
      verdict: identifiable >= 8 ? "覆盖充分，可拟合留存曲线"
        : identifiable >= 5 ? "部分可识别，右删失/左截断区间仍不可评估"
        : "不可识别：必须增加探针，当前任何参数拟合都不可信",
      note: "常规复习观测集中在 τ 附近；routine+delayed 探针分别补高/低区间，random 检查选择偏差"
    };
  }

  /** 自适应抽样率：空桶越多越提高探针率，但设硬上限避免打扰用户 */
  function adaptiveRate(cov, cfg) {
    const c = Object.assign({}, DEFAULT_CFG, cfg || {});
    const pressure = (cov.empty + 0.5 * cov.insufficient) / cov.buckets;
    const scale = 1 + Math.min(2, pressure * 2.5);
    const cap = x => +Math.min(0.15, x * scale).toFixed(3);   // 硬上限 15%
    return {
      pRoutine: cap(c.pRoutine), pDelayed: cap(c.pDelayed), pRandom: cap(c.pRandom),
      scale: +scale.toFixed(2), pressure: +pressure.toFixed(3),
      note: "自适应只调抽样率，不改变「探针不干预」铁律；超过 15% 需用户重新确认"
    };
  }

  /** 可识别性所需的数据条件（写成可执行清单，而不是一句提醒） */
  function identifiabilityChecklist() {
    return [
      { id: "I1", need: "events/predictions 使用冻结的 r，禁止用拟合后新参数重算历史", met: false },
      { id: "I2", need: "routine 探针覆盖 r≥τ 区间", met: false },
      { id: "I3", need: "delayed 探针覆盖 r<τ_low 区间（实测：仅常规探针时低 τ 阈值 1/6 可评估）", met: false },
      { id: "I4", need: "random 探针提供无偏参照，检查前两类选择偏差", met: false },
      { id: "I5", need: "每条事件带 paramVersion，参数切换后旧预测仍可评估", met: false },
      { id: "I6", need: "y 按 ySource 分层（verified / self），未核验不冒充客观正确率", met: false },
      { id: "I7", need: "严格时间切分（forward chaining），禁止随机 k-fold 泄漏未来", met: false }
    ];
  }

  window.PROBES = {
    VERSION, PROBE_TYPES, DEFAULT_CFG, rng, planProbes, makeProbeRecord,
    assertIsolation, coverageReport, adaptiveRate, identifiabilityChecklist
  };
})();
