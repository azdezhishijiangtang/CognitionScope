/* CognitionScope · calibration.js —— 留存预测校准（v5 新增模块）
 * 运行：node tests/calibration.test.js（零依赖、零 DOM）
 * 纪律（对应 v5 规格 1.5 / 1.6 / 8.4）：
 *   ① 只用 stateAt(it, rv.t - 1)，绝不用本次复习结果预测本次结果
 *   ② 探针数据只进 probeLog / events，绝不写 reviews、不更新 S、不进 findDue
 *   ③ 严格时间切分（forward chaining），禁止随机 k-fold
 *   ④ y 分 ySource 分层：verified / self，未核验历史不得冒充客观正确率
 *   ⑤ 所有结论附 n、时间范围、paramVersion；不产出「掌握度」
 */
"use strict";
(function () {
  const DAY = 86400000;
  const VERSION = "calibration/7.0";
  const clip = (x, a, b) => Math.max(a, Math.min(b, x));
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const logit = p => Math.log(clip(p, 1e-6, 1 - 1e-6) / (1 - clip(p, 1e-6, 1 - 1e-6)));
  const sigmoid = z => 1 / (1 + Math.exp(-z));

  /* Wilson 区间：小样本桶不给「看起来很准」的点估计 */
  function wilson(k, n, z = 1.96) {
    if (!n) return null;
    const p = k / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d;
    const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [+(c - h).toFixed(3), +(c + h).toFixed(3)];
  }

  /* 1. 收集 (预测 r, 实际 y) 配对。CS 为 v3 core.js 导出的命名空间。 */
  function collectPairs(CS, items, probeLog) {
    const out = [];
    for (const it of items || []) {
      for (const rv of it.reviews || []) {
        if (!Number.isFinite(rv.t) || rv.t - 1 <= it.learnedAt) continue; // 伪样本：负 dt 会被夹成 r=1
        const verified = rv.verification && rv.verification.status === "verified";
        const y = verified
          ? (rv.verification.outcome === "correct" ? 1 : rv.verification.outcome === "partial" ? 0.5 : 0)
          : ((rv.gradeSelf != null ? rv.gradeSelf : rv.grade) >= 2 ? 1 : 0);
        out.push({
          itemId: it.id, t: rv.t,
          r: CS.stateAt(it, rv.t - 1).r,          // ← 标签泄漏防线
          y, ySource: verified ? "verified" : "self",
          src: "review", paramVersion: rv.paramVersion || "v3-legacy"
        });
      }
    }
    for (const p of probeLog || []) {
      out.push({
        itemId: p.itemId, t: p.t, r: p.r, y: p.y,
        ySource: p.ySource || "self", src: "probe",
        paramVersion: p.paramVersion || "unknown"
      });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  /* 2. 可靠性曲线：分桶 + n 门槛 + 区间 */
  function reliability(pairs, opts) {
    const o = Object.assign({ buckets: 10, minN: 20 }, opts || {});
    const rows = [];
    for (let b = 0; b < o.buckets; b++) {
      const g = pairs.filter(p => Math.min(o.buckets - 1, Math.floor(p.r * o.buckets)) === b);
      const enough = g.length >= o.minN;
      rows.push({
        range: [+(b / o.buckets).toFixed(2), +((b + 1) / o.buckets).toFixed(2)],
        n: g.length,
        predMean: g.length ? +mean(g.map(p => p.r)).toFixed(3) : null,
        obsRate: enough ? +mean(g.map(p => p.y)).toFixed(3) : null,
        ci95: enough && g.every(p => p.y === 0 || p.y === 1) ? wilson(g.reduce((s, p) => s + p.y, 0), g.length) : null,
        note: g.length === 0 ? "无观测（调度截断或探针未覆盖）" : (!enough ? "样本不足" : (g.some(p => p.y !== 0 && p.y !== 1) ? "含部分得分，二项 Wilson 区间不适用" : ""))
      });
    }
    return rows;
  }

  /* 3. Brier 与双基线 */
  const brier = (pairs, f) => mean(pairs.map(p => (f(p.r) - p.y) ** 2));
  function scoreTable(pairs) {
    const pBar = mean(pairs.map(p => p.y));
    return {
      n: pairs.length,
      brierRetention: brier(pairs, r => r),
      brierConstBaseline: brier(pairs, () => pBar),
      brierAlwaysRemember: brier(pairs, () => 1),
      actualRate: pBar
    };
  }

  /* 4. 轻量校准层：Platt 缩放（网格搜索）+ isotonic（PAVA）二选一 */
  function fitPlatt(train) {
    let best = null;
    for (let T = 0.4; T <= 3.0001; T += 0.1) {
      for (let b = -1.5; b <= 1.5001; b += 0.1) {
        const f = r => sigmoid(logit(r) / T + b);
        const s = brier(train, f);
        if (!best || s < best.s) best = { T: +T.toFixed(2), b: +b.toFixed(2), s, f };
      }
    }
    return { method: "platt", T: best.T, b: best.b, predict: best.f, trainBrier: best.s };
  }

  function fitIsotonic(train) {
    // 简化 PAVA：按 r 排序、相邻桶合并直至 y 均值单调不减
    const s = train.slice().sort((a, b) => a.r - b.r);
    const blocks = s.map(p => ({ lo: p.r, hi: p.r, sum: p.y, n: 1 }));
    for (let i = 0; i < blocks.length - 1;) {
      const a = blocks[i], b = blocks[i + 1];
      if (a.sum / a.n <= b.sum / b.n) { i++; continue; }
      blocks.splice(i, 2, { lo: a.lo, hi: b.hi, sum: a.sum + b.sum, n: a.n + b.n });
      if (i > 0) i--;
    }
    const predict = r => {
      for (const k of blocks) if (r <= k.hi + 1e-9) return k.sum / k.n;
      return blocks.length ? blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n : r;
    };
    return { method: "isotonic", blocks, predict, trainBrier: brier(train, predict) };
  }

  /* 5. v5 双决策门槛（比 v4/改进建议书更细）：
   *    modelHasSignal  = 校准后是否显著优于常数基线 → 决定 r(t) 有没有预测价值
   *    needCalibration = 校准层是否显著优于原始 r   → 决定要不要加校准层
   *    两者独立判定，避免「模型本来就准却仍挂一层校准」或「错配模型靠校准蒙混过关」
   */
  function predictorFromModel(model) {
    if (model.method === "platt") return r => sigmoid(logit(r) / model.T + model.b);
    if (model.method === "isotonic") {
      const blocks=Array.isArray(model.blocks)?model.blocks:[];
      return r => { for(const k of blocks) if(r<=k.hi+1e-9)return k.sum/k.n;
        return blocks.length?blocks[blocks.length-1].sum/blocks[blocks.length-1].n:r; };
    }
    throw new Error("未知校准器");
  }
  function evaluate(pairs, opts) {
    const o=Object.assign({trainRatio:0.6,validationRatio:0.2,MISD:0.01,minPairs:100},opts||{});
    const sorted=(pairs||[]).slice().sort((a,b)=>a.t-b.t);
    if(sorted.length<o.minPairs)return{status:"insufficient",n:sorted.length,reason:"配对数不足 "+o.minPairs,definitionVersion:VERSION};
    const n=sorted.length, nTrain=Math.floor(n*o.trainRatio), nVal=Math.floor(n*o.validationRatio);
    const tr=sorted.slice(0,nTrain), val=sorted.slice(nTrain,nTrain+nVal), te=sorted.slice(nTrain+nVal);
    if(tr.length<20||val.length<10||te.length<10)return{status:"insufficient",n,reason:"训练/验证/最终测试分段样本不足",definitionVersion:VERSION};
    const platt=fitPlatt(tr), iso=fitIsotonic(tr);
    const candidates=[platt,iso].map(model=>({model,score:brier(val,r=>predictorFromModel(model)(r))})).sort((a,b)=>a.score-b.score);
    const selected=candidates[0].model, predict=predictorFromModel(selected);
    const raw=brier(te,r=>r), calibrated=brier(te,r=>predict(r)), pBar=mean(tr.map(p=>p.y)), base=brier(te,()=>pBar);
    const modelHasSignal=calibrated<base-o.MISD, needCalibration=calibrated<raw-o.MISD;
    const verdict=!modelHasSignal?"最终测试集未优于训练集常数基线：不应将模型作为排期依据":needCalibration?"校准层在独立最终测试集上改善表现；保留并继续前瞻验证":"原始模型在独立最终测试集未显示需校准的实质改善";
    const serializable=selected.method==="platt"?{method:"platt",T:selected.T,b:selected.b}:{method:"isotonic",blocks:selected.blocks.map(x=>({lo:x.lo,hi:x.hi,sum:x.sum,n:x.n}))};
    return {status:"evaluated",definitionVersion:VERSION,nTrain:tr.length,nValidation:val.length,nTest:te.length,
      selectionMetric:"validation Brier",finalTestUsedForSelection:false,
      brierRaw:+raw.toFixed(4),brierConst:+base.toFixed(4),brierCalibrated:+calibrated.toFixed(4),
      method:selected.method,params:serializable,fit:serializable,gainVsRawPct:raw?+(100*(raw-calibrated)/raw).toFixed(1):null,
      gainVsBasePct:base?+(100*(base-calibrated)/base).toFixed(1):null,MISD:o.MISD,modelHasSignal,needCalibration,
      keepScheduleModel:modelHasSignal,verdict,reliability:reliability(te),scores:scoreTable(te),
      timeRanges:{train:[tr[0].t,tr[tr.length-1].t],validation:[val[0].t,val[val.length-1].t],test:[te[0].t,te[te.length-1].t]},
      caveats:["候选校准器只在训练集拟合、验证集选择，最终测试集只评估一次","若数据存在强时间漂移，单次时间切分仍需滚动复验","部分得分不使用二项 Wilson 区间"]};
  }

  /* 6. 到期阈值 τ 的帕累托评估：只能用探针数据或带探针的全集 */
  function thresholdFrontier(pairs, taus) {
    const ts = taus || [0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
    const wrong = pairs.filter(p => p.y === 0).length;
    const rMin = pairs.length ? Math.min(...pairs.map(p => p.r)) : null;
    const rMax = pairs.length ? Math.max(...pairs.map(p => p.r)) : null;
    const rows = ts.map(tau => {
      const flagged = pairs.filter(p => p.r < tau);
      const missed = pairs.filter(p => p.r >= tau && p.y === 0).length;
      const evaluable = flagged.length > 0 && (rMin == null || rMin < tau);
      return {
        tau, flaggedN: flagged.length,
        reviewShare: pairs.length ? +(flagged.length / pairs.length).toFixed(3) : null,
        missedForget: missed, missedShare: wrong ? +(missed / wrong).toFixed(3) : null,
        evaluable,
        counterfactualIdentified: false,
        note: evaluable
          ? "仅为已观测样本的描述性阈值统计，不识别改变阈值后的反事实结果"
          : "描述性覆盖不足：样本 r 下限高于该 τ；需延迟探针补低位观测，仍不能自动识别反事实"
      };
    });
    return { coverage: { n: pairs.length, rMin: rMin == null ? null : +rMin.toFixed(3),
                          rMax: rMax == null ? null : +rMax.toFixed(3) }, rows };
  }

  /* 7. 自检：无泄漏、探针隔离、时间切分 */
  function assertNoLeakage(CS, item) {
    const rv = item.reviews[item.reviews.length - 1];
    const clone = Object.assign({}, item, { reviews: item.reviews.slice(0, -1) });
    const before = CS.stateAt(clone, rv.t - 1).S;
    const full = CS.stateAt(item, rv.t - 1).S;
    if (before !== full) throw new Error("标签泄漏：本次复习结果影响了复习前预测");
    // 只做真正的泄漏检查：-1 偏移下的 S 必须等于「尚未发生本次复习」的状态。
    // 是否包含当前记录另由 checkOffset() 在 S 未触下限时验证。
    return { ok: true, S_before: before, S_atMinusOne: full };
  }

  function checkOffset(CS, item) {
    const rv = item.reviews[item.reviews.length - 1];
    const minusOne = CS.stateAt(item, rv.t - 1).S;
    const atNow = CS.stateAt(item, rv.t).S;
    return { minusOne, atNow, offsetWorks: minusOne !== atNow,
             note: minusOne === atNow ? "S 已触 0.3 下限，本用例无法区分；请换未触底的条目" : "-1 正确排除了当前记录" };
  }

  /* ======================================================================
     v6 新增：从 L2 冻结事件读取配对（校准主线的关键一步）
     与 collectPairs 的本质区别：collectPairs 用 CS.stateAt 现算 r，
     一旦参数被拟合就会静默重写历史；collectFromEvents 只读取当时冻结的 r，
     绝不调用 stateAt，因此可以做跨参数版本的公平对比。
     ====================================================================== */
  function collectFromEvents(l2, opts) {
    const o = opts || {};
    const events = (l2 && Array.isArray(l2.events)) ? l2.events : [];
    const out = [];
    for (const e of events) {
      if (e.y == null || !Number.isFinite(e.y)) continue;           // 纯预测记录跳过
      if (!Number.isFinite(e.r)) continue;
      if (e.orphan && !o.includeOrphans) continue;                   // 孤儿隔离出分母
      if (o.ySource && (e.ySource || "self") !== o.ySource) continue;
      if (o.paramVersion && e.paramVersion !== o.paramVersion) continue;
      out.push({
        itemId: e.itemId, t: e.t != null ? e.t : e.at,
        r: e.r, y: e.y, ySource: e.ySource || "self",
        src: e.src || "review", srcRef: e.srcRef || null,
        probeType: e.probeType || null,
        rPredSource: e.rPredSource || "frozen",
        paramVersion: e.paramVersion || "unknown",
        _frozen: true
      });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  /** 断言配对全部来自冻结预测，没有一条是"现算"的 */
  function assertFrozenOnly(pairs) {
    const bad = (pairs || []).filter(p => !p._frozen || p.rPredSource === "computed");
    return { ok: bad.length === 0, n: (pairs || []).length, recomputed: bad.length,
      note: bad.length ? "含现算预测，版本对比无效" : "全部为冻结预测，未被新参数重写" };
  }

  /** 冻结数据上的评估：复用 evaluate 的严格时间切分与双门槛，附数据来源声明 */
  function evaluateFrozen(l2, opts) {
    const o = opts || {};
    const pairs = collectFromEvents(l2, o);
    const frozen = assertFrozenOnly(pairs);
    if (!frozen.ok) return { status: "invalid", reason: frozen.note };
    const res = evaluate(pairs, o);
    return Object.assign({}, res, {
      provenance: {
        source: "L2.events.frozenPredictions",
        recomputedWithCurrentParams: false,
        paramVersions: [...new Set(pairs.map(p => p.paramVersion))],
        ySourceBreakdown: pairs.reduce((m, p) => (m[p.ySource] = (m[p.ySource] || 0) + 1, m), {}),
        timeRange: pairs.length ? [pairs[0].t, pairs[pairs.length - 1].t] : null
      },
      note: "评估基于排期时冻结的 r；参数变更不会重写这些记录"
    });
  }

  /** 按参数版本分层评估：只能比较冻结数据，且每层的 n 都须达标 */
  function compareParamVersions(l2, opts) {
    const o = opts || {};
    const pairs = collectFromEvents(l2);
    const groups = {};
    pairs.forEach(p => (groups[p.paramVersion] = groups[p.paramVersion] || []).push(p));
    const rows = Object.keys(groups).map(v => {
      const g = groups[v];
      if (g.length < (o.minPairs || 30)) return { paramVersion: v, n: g.length, status: "insufficient" };
      const sc = scoreTable(g);
      return { paramVersion: v, n: g.length, status: "evaluated",
        brierRetention: +sc.brierRetention.toFixed(4),
        brierConstBaseline: +sc.brierConstBaseline.toFixed(4),
        actualRate: +sc.actualRate.toFixed(3),
        coverage: PROBE_COVERAGE(g) };
    });
    return { rows, frozen: assertFrozenOnly(pairs),
      note: "跨版本比较仅在各自冻结预测上有效；用当前参数重算历史的对比一律无效" };
  }

  /** 样本覆盖概览（与 probes.coverageReport 互补，供校准报告内联） */
  function PROBE_COVERAGE(pairs) {
    const n = (pairs || []).length;
    if (!n) return { n: 0, emptyBuckets: 10, identifiable: false };
    let empty = 0;
    for (let b = 0; b < 10; b++)
      if (!(pairs || []).some(p => Math.min(9, Math.floor(p.r * 10)) === b)) empty++;
    return { n, emptyBuckets: empty, identifiable: empty <= 2,
      note: empty > 2 ? "超过 2 个桶无观测 → 曲线形状不可识别，需增加三类探针" : "覆盖基本充分" };
  }

  window.CAL = {
    DAY, VERSION, wilson, predictorFromModel, collectPairs, reliability, brier, scoreTable,
    fitPlatt, fitIsotonic, evaluate, thresholdFrontier, assertNoLeakage, checkOffset,
    collectFromEvents, assertFrozenOnly, evaluateFrozen, compareParamVersions, PROBE_COVERAGE
  };
})();
