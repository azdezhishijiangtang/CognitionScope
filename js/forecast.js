/* CognitionScope · forecast.js —— 校准后排期与干预保真度（v6）
 * ============================================================================
 * 把「每天替用户做决定的那个模型」从黑箱变成可审计对象：
 *   ① 每次排期冻结 rPred / S / paramVersion / 校准状态到 L2
 *   ② 校准未通过（modelHasSignal=false）时退回基线策略，并在所有下游实验上标
 *      「干预保真度不足」
 *   ③ 输出剂量报告：不同实验条件实际拿到的复习次数与时机，
 *      用于发现「剂量被未校准调度器污染」——依从性日志只能发现偏离，发现不了错配
 *
 * 关键洞察（v5 §5）：v4 Sprint 3 的实验若比较复习策略，干预必须经由 findDue 落地；
 * 不同条件实际拿到的「剂量」不完全由实验条件决定，还受未校准模型的系统误差影响。
 */
"use strict";
(function () {
  const VERSION = "forecast/6.0";
  const DAY = 86400000;
  const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const sigmoid = z => 1 / (1 + Math.exp(-z));
  const logit = p => Math.log(clip(p, 1e-6, 1 - 1e-6) / (1 - clip(p, 1e-6, 1 - 1e-6)));

  /** 应用校准层；返回预测值与所用方法，未校准时原样返回并标注 */
  function applyCalibration(r, fit) {
    if (!fit || !fit.method) return { rCal: r, applied: false, method: "none", note: "无校准层" };
    if (fit.method === "platt") {
      const z = logit(r) / (fit.T || 1) + (fit.b || 0);
      return { rCal: +sigmoid(z).toFixed(6), applied: true, method: "platt",
        params: { T: fit.T, b: fit.b } };
    }
    if (fit.method === "isotonic" && Array.isArray(fit.blocks)) {
      for (const k of fit.blocks) if (r <= k.hi + 1e-9)
        return { rCal: +(k.sum / k.n).toFixed(6), applied: true, method: "isotonic" };
      const last = fit.blocks[fit.blocks.length - 1];
      return { rCal: last ? +(last.sum / last.n).toFixed(6) : r, applied: true, method: "isotonic" };
    }
    return { rCal: r, applied: false, method: "unknown", note: "未知校准方法，拒绝应用" };
  }

  /** 策略选择：模型有信号才用 r(t)；否则退回基线，且必须显式告知 */
  function choosePolicy(calibration) {
    const c = calibration || {};
    if (c.status !== "evaluated") return { policy: "insufficient_data", modelHasSignal: null,
      reason: "尚无校准评估结论；排期结果不得当作个性化模型输出",
      fallback: true, disclaimer: "样本不足，当前仅按录入顺序与固定间隔排队" };
    if (c.modelHasSignal === false) return { policy: "constant_baseline", modelHasSignal: false,
      reason: "校准后仍不优于常数基线 → r(t) 无预测价值",
      fallback: true, disclaimer: "已退回常数/固定间隔基线，进入参数重写流程" };
    return { policy: c.needCalibration ? "calibrated_model" : "raw_model",
      modelHasSignal: true, needCalibration: !!c.needCalibration,
      reason: c.needCalibration ? "模型有信号但需挂校准层（同时启动参数重写）" : "原始 r 已有预测价值",
      fallback: false, disclaimer: "模型估计，须附 paramVersion 与校准状态" };
  }

  /**
   * 生成到期决策。rOf(item,t) 为模型留存函数（默认 CS.stateAt）。
   * 每条决策都自带冻结所需字段，交由 freezeDecisions 写入 L2。
   */
  function schedule(items, opts) {
    const o = opts || {};
    const t = Number.isFinite(o.t) ? o.t : Date.now();
    const rOf = o.rOf || (it => ({ r: 0.9, S: 5 }));
    const calibration = o.calibration || {};
    const pol = choosePolicy(calibration);
    const tau = Number.isFinite(o.tau) ? o.tau : (calibration.tau || 0.9);
    const fit = calibration.fit || null;
    const paramVersion = o.paramVersion || "v7-init";
    const capacity = Number.isFinite(o.capacity) ? o.capacity : 20;

    const decisions = (items || []).map(it => {
      const st = rOf(it, t) || { r: 0.9, S: 5 };
      const cal = applyCalibration(st.r, fit);
      const rPred = pol.fallback ? st.r : cal.rCal;
      let due, reason;
      if (pol.fallback) {
        // 基线：距上次复习超过固定间隔即到期（不依赖 r）
        const last = (it.reviews || []).reduce((m, r) => Math.max(m, r.t), it.learnedAt);
        const gapDays = (t - last) / DAY;
        due = gapDays >= (o.fixedIntervalDays || 3);
        reason = "固定间隔基线（" + (o.fixedIntervalDays || 3) + " 天）";
      } else {
        due = rPred < tau;
        reason = "校准后 r=" + rPred.toFixed(3) + (due ? " < τ" : " ≥ τ");
      }
      return {
        itemId: it.id, t, rPredRaw: st.r, rPred: +rPred.toFixed(6), S: st.S,
        rPredSource: pol.fallback ? "baseline" : (cal.applied ? "calibrated" : "model"),
        calibrationMethod: cal.method, due, reason,
        dueThreshold: tau, policy: pol.policy,
        paramVersion, modelHasSignal: pol.modelHasSignal,
        needCalibration: !!pol.needCalibration,
        fallback: pol.fallback
      };
    });
    const queue = decisions.filter(d => d.due).sort((a, b) => a.rPred - b.rPred).slice(0, capacity);
    return {
      t, policy: pol, tau, capacity, paramVersion, decisions, queue,
      disclaimer: pol.disclaimer,
      note: "queue 为建议顺序，不是数学最优调度；每条预测须在展示前冻结到 L2",
      definitionVersion: VERSION
    };
  }

  /** 冻结排期决策：批量写 predictions + events（调用 CS6，失败不静默） */
  function freezeDecisions(result, CS6) {
    if(!CS6)return{ok:false,reason:"L2 未装载：禁止展示未冻结的预测"};
    const before=CS6.snapshot();let rawBefore=null;
    try{rawBefore=localStorage.getItem(CS6.KEY);}catch(e){return{ok:false,reason:e.message};}
    const frozen=[];
    try{
      for(const d of result.decisions){
        const r=CS6.append("predictions",{kind:"scheduling_prediction",itemId:d.itemId,t:d.t,rPred:d.rPred,S:d.S,
          rPredSource:d.rPredSource,dueThreshold:d.dueThreshold,context:"scheduling",policy:d.policy,
          modelHasSignal:d.modelHasSignal,needCalibration:d.needCalibration},{persist:false,paramVersion:result.paramVersion});
        if(!r.ok)throw new Error(r.error||"prediction append failed");
        const ev=CS6.append("events",{kind:"prediction_frozen",itemId:d.itemId,t:d.t,r:d.rPred,
          rPredSource:d.rPredSource==="baseline"?"replayed":"frozen",y:null,ySource:null,
          srcRef:"predictions#"+r.record.seq,policy:d.policy,modelHasSignal:d.modelHasSignal},
          {persist:false,paramVersion:result.paramVersion});
        if(!ev.ok)throw new Error(ev.error||"event append failed");
        frozen.push(r.record.seq);
      }
      if(!CS6.save())throw new Error("本地存储失败");
      return{ok:true,count:frozen.length,seqs:frozen,paramVersion:result.paramVersion,note:"预测已冻结；后续参数变更不会重写这些记录"};
    }catch(e){CS6.replaceState(before);try{if(rawBefore===null)localStorage.removeItem(CS6.KEY);else localStorage.setItem(CS6.KEY,rawBefore);}catch(_){}return{ok:false,reason:"冻结预测事务已回滚："+e.message};}
  }

  /**
   * 干预保真度：实验期间的调度器是否可信。
   * 判定任一失败即降权（不删除实验，结论标注「保真度不足」）。
   */
  function interventionFidelity(experiment, predictions, opts) {
    const o = opts || {};
    const preds = (predictions || []).filter(p =>
      !experiment || (Number.isFinite(p.t) && p.t >= (experiment.startedAt || 0) &&
        p.t <= (experiment.endedAt || Infinity)));
    const versions = [...new Set(preds.map(p => p.paramVersion).filter(Boolean))];
    const noSignal = preds.filter(p => p.modelHasSignal === false).length;
    const fallbacks = preds.filter(p => p.policy === "constant_baseline" || p.policy === "insufficient_data").length;
    const checks = [
      { id: "F1", ok: versions.length <= 1, text: "实验期间参数版本未变更（否则剂量不可比）", detail: versions },
      { id: "F2", ok: noSignal === 0, text: "调度器未被判定为无预测价值", detail: noSignal },
      { id: "F3", ok: fallbacks === 0, text: "未退回基线策略", detail: fallbacks },
      { id: "F4", ok: preds.length >= (o.minPredictions || 10), text: "冻结预测数充足", detail: preds.length }
    ];
    const failed = checks.filter(c => !c.ok);
    return {
      adequate: failed.length === 0, failed, checks,
      paramVersions: versions, nPredictions: preds.length,
      verdict: failed.length === 0
        ? "干预保真度充足：条件剂量差异可归因于实验设计"
        : "干预保真度不足：不同条件实际拿到的复习次数/时机可能由未校准调度器的系统误差驱动，结论必须降权",
      actions: failed.length ? [
        "冻结调度器参数版本直至实验结束",
        "在实验结论中标注「保真度不足」，禁止报因果结论",
        "补跑校准或改用固定间隔基线重做实验"
      ] : []
    };
  }

  /** 剂量报告：按条件汇总实际复习次数与时机，暴露调度器污染 */
  function doseReport(trialEvents, opts) {
    const o = opts || {};
    const evs = (trialEvents || []).filter(e => e && !e.excluded);
    const by = {};
    for (const e of evs) {
      const k = e.conditionId || "unassigned";
      const b = by[k] = by[k] || { n: 0, reviews: 0, rPredSum: 0, rPredN: 0, firstT: null, lastT: null, gaps: [] };
      b.n++;
      if (e.reviewed) b.reviews++;
      if (Number.isFinite(e.rPredAtAssignment)) { b.rPredSum += e.rPredAtAssignment; b.rPredN++; }
      if (Number.isFinite(e.t)) {
        if (b.firstT == null || e.t < b.firstT) b.firstT = e.t;
        if (b.lastT == null || e.t > b.lastT) b.lastT = e.t;
      }
    }
    const rows = Object.keys(by).map(k => {
      const b = by[k];
      return { conditionId: k, n: b.n, reviews: b.reviews,
        meanRPredAtAssignment: b.rPredN ? +(b.rPredSum / b.rPredN).toFixed(3) : null,
        spanDays: (b.firstT != null && b.lastT != null) ? +((b.lastT - b.firstT) / DAY).toFixed(1) : null };
    });
    const vals = rows.map(r => r.reviews).filter(Number.isFinite);
    const imbalance = vals.length >= 2 ? +(Math.max(...vals) / Math.max(1, Math.min(...vals))).toFixed(2) : null;
    return {
      rows, imbalance,
      suspicious: imbalance != null && imbalance > (o.maxImbalance || 1.5),
      note: imbalance != null && imbalance > (o.maxImbalance || 1.5)
        ? "条件间复习剂量明显失衡：可能不是依从性问题，而是调度器按未校准 r 分配了不同剂量"
        : "剂量大致均衡；仍须结合 interventionFidelity 判断",
      definitionVersion: VERSION
    };
  }

  window.FORECAST = {
    VERSION, DAY, clip, applyCalibration, choosePolicy, schedule,
    freezeDecisions, interventionFidelity, doseReport
  };
})();
