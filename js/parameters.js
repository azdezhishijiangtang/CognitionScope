/* CognitionScope · parameters.js —— 参数拟合与版本冻结（v6）
 * ============================================================================
 * v3 的 R0={fact:3,concept:5,paper:7,skill:10}、nextS(grade3→×4, grade2→×2,
 * 答错→×0.7)、findDue 阈值 0.9 全是拍脑袋的工程假设，从未用数据校准过。
 * 本模块把它们变成可估计参数，并强制时间序列前推验证。
 *
 * 关键陷阱（v5 §1.3）：
 *   stateAt 是纯函数，所以现在能回放；但一旦换成拟合参数，历史预测会被新参数"重写"。
 *   因此：① 训练集允许用候选参数重放 S 演化；
 *         ② 测试集必须使用 L2 events 中冻结的 rPred，绝不用新参数重算；
 *         ③ 每次切换参数都生成 paramVersion 并留审计，旧预测保持原版本可评估。
 *   没有 L2 冻结日志时，fit() 直接返回 blocked，不允许"悄悄重算"。
 *
 * 验证纪律：forward chaining（按时间前推切分），随机 k-fold 会把未来泄漏进训练集。
 */
"use strict";
(function () {
  const VERSION = "params/7.0";
  const DAY = 86400000;
  const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  const DEFAULT_PARAMS = {
    R0: { fact: 3, concept: 5, paper: 7, skill: 10 },
    gainPass2: 2, gainPass3: 4, failFactor: 0.7,
    Smin: 0.3, Smax: 365, tau: 0.9
  };
  const GRID = {
    r0Scale: [0.5, 0.75, 1.0, 1.5, 2.0, 3.0],
    gainPass2: [1.2, 1.5, 2.0, 2.5, 3.0],
    gainPass3: [2.0, 3.0, 4.0, 6.0, 8.0],
    failFactor: [0.4, 0.55, 0.7, 0.85, 1.0],
    tau: [0.7, 0.8, 0.85, 0.9, 0.95]
  };

  function fnv1a(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  const stable = x => JSON.stringify(x, (_k, v) =>
    (v && typeof v === "object" && !Array.isArray(v))
      ? Object.keys(v).sort().reduce((o, k) => (o[k] = v[k], o), {}) : v);
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const brier = (pairs, f) => mean(pairs.map(p => (f(p) - p.y) ** 2));

  /** 参数化重放 stateAt（与 core.js 同语义，但参数可注入；纯函数不改 item） */
  function simulateStateAt(item, t, params) {
    const P = Object.assign({}, DEFAULT_PARAMS, params || {});
    const R0 = Object.assign({}, DEFAULT_PARAMS.R0, (params || {}).R0 || {});
    let S = R0[item.mtype] || 5, last = item.learnedAt;
    const reviews = (item.reviews || []).slice().sort((a, b) => a.t - b.t);
    for (const rv of reviews) {
      if (!Number.isFinite(rv.t)) continue;
      if (rv.t > t) break;
      const g = Number.isFinite(rv.gradeSelf) ? rv.gradeSelf : rv.grade;
      if (g >= 3) S = clip(S * P.gainPass3, P.Smin, P.Smax);
      else if (g >= 2) S = clip(S * P.gainPass2, P.Smin, P.Smax);
      else S = clip(S * P.failFactor, P.Smin, P.Smax);
      last = Math.max(last, rv.t);
    }
    const dtDays = Math.max(0, (t - last) / DAY);
    return { r: Math.pow(2, -dtDays / (S > 0 ? S : 5)), S, last };
  }

  /** 用候选参数给训练条目重算 (r,y) —— 只允许用于训练集拟合 */
  function replayTraining(items, params, opts) {
    const o = opts || {};
    const out = [];
    for (const it of items || []) {
      for (const rv of (it.reviews || []).slice().sort((a, b) => a.t - b.t)) {
        if (!Number.isFinite(rv.t) || rv.t - 1 <= it.learnedAt) continue;
        const v = rv.verification;
        const verified = v && v.status === "verified";
        const y = verified
          ? (v.outcome === "correct" ? 1 : v.outcome === "partial" ? 0.5 : 0)
          : ((rv.gradeSelf != null ? rv.gradeSelf : rv.grade) >= 2 ? 1 : 0);
        const st = simulateStateAt(it, rv.t - 1, params);
        out.push({ itemId: it.id, t: rv.t, r: st.r, y,
          ySource: verified ? "verified" : "self", src: "review_replay",
          paramVersion: rv.paramVersion || "v3-legacy" });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  /** 时间序列前推切分：第 k 折训练集 = 前 k/(K+1)，测试集 = 紧随其后的一段 */
  function forwardChainingSplits(pairs, K) {
    const k = Math.max(1, K || 3);
    const s = (pairs || []).slice().sort((a, b) => a.t - b.t);
    const out = [];
    for (let i = 0; i < k; i++) {
      const cut1 = Math.floor(s.length * (i + 1) / (k + 1));
      const cut2 = Math.floor(s.length * (i + 2) / (k + 1));
      out.push({ fold: i + 1, train: s.slice(0, cut1), test: s.slice(cut1, cut2),
        trainRange: [s[0] ? s[0].t : null, s[cut1 - 1] ? s[cut1 - 1].t : null],
        testRange: [s[cut1] ? s[cut1].t : null, s[cut2 - 1] ? s[cut2 - 1].t : null],
        note: "严格按时间前推；测试集时间全部晚于训练集，无未来泄漏" });
    }
    return out;
  }

  function logLikelihood(train, eps) {
    const e = eps || 1e-6;
    let ll = 0;
    for (const p of train) {
      const q = clip(p.r, e, 1 - e);
      ll += p.y * Math.log(q) + (1 - p.y) * Math.log(1 - q);
    }
    return ll;
  }

  /** 网格搜索：目标 = 最小化训练集 Brier（也可切到对数似然） */
  function gridSearch(items, opts) {
    const o = Object.assign({ objective: "brier", maxCandidates: 4000 }, opts || {});
    const space = o.grid || GRID;
    const candidates = [];
    for (const r0Scale of space.r0Scale)
      for (const gainPass2 of space.gainPass2)
        for (const gainPass3 of space.gainPass3)
          for (const failFactor of space.failFactor) {
            if (candidates.length >= o.maxCandidates) break;
            const R0 = {};
            for (const k of Object.keys(DEFAULT_PARAMS.R0)) R0[k] = +(DEFAULT_PARAMS.R0[k] * r0Scale).toFixed(3);
            candidates.push({ r0Scale, gainPass2, gainPass3, failFactor,
              Smin: DEFAULT_PARAMS.Smin, Smax: DEFAULT_PARAMS.Smax, tau: o.tau || 0.9, R0 });
          }
    let best = null;
    for (const p of candidates) {
      const tr = replayTraining(items, p);
      if (tr.length < 10) continue;
      const score = o.objective === "loglik" ? -logLikelihood(tr) : brier(tr, x => x.r);
      if (!Number.isFinite(score)) continue;
      if (!best || score < best.score) best = { params: p, score, n: tr.length };
    }
    return {
      best, evaluated: candidates.length, objective: o.objective,
      note: "网格拟合只用于训练段；测试段一律使用 L2 冻结的 rPred，不用拟合参数重算"
    };
  }

  /** 参数版本 = 参数内容的稳定哈希；切换版本必须留审计 */
  function paramVersionOf(params, prefix) {
    return (prefix || "v7-fit") + "-" + fnv1a(stable(params));
  }

  /**
   * 完整拟合流程。
   * frozenPairs 为 L2 events 中冻结的 (rPred,y) 配对；缺失时直接 blocked。
   */
  function itemsThrough(items, cutoff) {
    return (items || []).filter(it => Number.isFinite(it.learnedAt) && it.learnedAt <= cutoff)
      .map(it => Object.assign({}, it, { reviews: (it.reviews || []).filter(rv => Number.isFinite(rv.t) && rv.t <= cutoff).slice() }));
  }

  function predictAt(item, t, params) {
    if (!item || !Number.isFinite(t) || t <= item.learnedAt) return null;
    return simulateStateAt(item, t - 1, params).r;
  }

  /**
   * Strict rolling-origin evaluation. Each fold fits only items/reviews available
   * by the end of that fold's training window. Test outcomes are never used to fit.
   * Test predictions are generated from each item's history strictly before t.
   */
  function fit(items, frozenPairs, opts) {
    const o = Object.assign({ folds: 3, MISD: 0.01 }, opts || {});
    if (!Array.isArray(frozenPairs) || !frozenPairs.length) return {
      status: "blocked", reason: "缺少 L2 冻结预测配对：禁止用新参数重算历史并冒充评估",
      required: "CS6.events 中的冻结 (rPred,y)", definitionVersion: VERSION
    };
    const aligned = frozenPairs.filter(p => Number.isFinite(p.r) && Number.isFinite(p.y) &&
      p.y >= 0 && p.y <= 1 && !p.orphan && Number.isFinite(p.t) && p.itemId)
      .slice().sort((a,b)=>a.t-b.t);
    if (aligned.length < 30) return {status:"insufficient",n:aligned.length,reason:"冻结配对不足 30 条",definitionVersion:VERSION};
    const byId = new Map((items||[]).map(it=>[it.id,it]));
    const splits = forwardChainingSplits(aligned,o.folds), folds=[];
    for (const sp of splits) {
      if (!sp.train.length || !sp.test.length) {folds.push({fold:sp.fold,status:"insufficient_split"});continue;}
      const cutoff=sp.train[sp.train.length-1].t;
      const trainItems=itemsThrough(items,cutoff);
      const gs=gridSearch(trainItems,{objective:"brier",tau:o.tau,maxCandidates:o.maxCandidates});
      if (!gs.best) {folds.push({fold:sp.fold,status:"no_candidate",nTrain:sp.train.length,nTest:sp.test.length});continue;}
      const pBar=mean(sp.train.map(x=>x.y));
      const testPred=[];
      for (const pair of sp.test) {
        const item=byId.get(pair.itemId);
        const pred=predictAt(item,pair.t,gs.best.params);
        if (Number.isFinite(pred)) testPred.push({y:pair.y,pred,baseline:pBar,frozen:pair.r});
      }
      if (!testPred.length) {folds.push({fold:sp.fold,status:"no_test_history",nTrain:sp.train.length,nTest:sp.test.length});continue;}
      const testBrier=mean(testPred.map(x=>(x.pred-x.y)**2));
      const base=mean(testPred.map(x=>(x.baseline-x.y)**2));
      const frozen=mean(testPred.map(x=>(x.frozen-x.y)**2));
      folds.push({fold:sp.fold,status:"evaluated",nTrain:sp.train.length,nTest:sp.test.length,nPredicted:testPred.length,
        params:gs.best.params,trainBrier:+gs.best.score.toFixed(4),testBrier:+testBrier.toFixed(4),
        frozenBrier:+frozen.toFixed(4),constBaseline:+base.toFixed(4),trainRange:sp.trainRange,testRange:sp.testRange,
        beatsBaseline:testBrier<base-o.MISD,beatsFrozen:testBrier<frozen-o.MISD});
    }
    const valid=folds.filter(f=>f.status==="evaluated");
    if(!valid.length)return{status:"insufficient",nFrozenPairs:aligned.length,folds,reason:"没有可完成的独立前推测试折",definitionVersion:VERSION};
    const beats=valid.filter(f=>f.beatsBaseline).length;
    const gaps=valid.map(f=>f.testBrier-f.trainBrier),chosen=valid[valid.length-1].params;
    const version=paramVersionOf(chosen,"v7-fit");
    return {status:"evaluated",definitionVersion:VERSION,folds,nFrozenPairs:aligned.length,
      foldsBeatingBaseline:beats,foldsTotal:valid.length,meanGeneralizationGap:+mean(gaps).toFixed(4),
      chosenParams:chosen,paramVersion:version,
      verdict:beats<Math.ceil(valid.length/2)?"未能在多数真正独立的未来折优于常数基线：不得启用该拟合参数":"前推测试有初步支持；仍需持续冻结预测并在新数据上复验",
      caveats:["每折仅用训练时间截止点之前的条目和复习记录拟合","测试预测使用测试时点之前的历史，不使用当前测试结果","冻结生产预测仅作为比较基准，不作为拟合输入","参数版本仅供该用户后续前瞻验证，不代表跨用户泛化"]};
  }

  /** 版本对比：同一批冻结配对上比较两个参数版本的校准表现 */
  function compareVersions(frozenPairs, versions) {
    const ps = (frozenPairs || []).filter(p => Number.isFinite(p.r) && Number.isFinite(p.y));
    if (!ps.length) return { status: "insufficient" };
    const pBar = mean(ps.map(p => p.y));
    const rows = (versions || []).map(v => {
      const g = ps.filter(p => !v.paramVersion || p.paramVersion === v.paramVersion);
      const raw = g.length ? brier(g, p => p.r) : null;
      return { paramVersion: v.paramVersion || "(全部)", n: g.length,
        brier: raw == null ? null : +raw.toFixed(4),
        constBaseline: +(brier(g, () => pBar) || 0).toFixed(4),
        note: g.length < 30 ? "样本不足，不产出优劣结论" : "可比较" };
    });
    return { status: "compared", rows,
      note: "对比基于冻结预测；任何用当前参数重算历史的版本对比都无效" };
  }

  /** 反自检：确认冻结配对没有被新参数改动 */
  function assertNoRewrite(frozenBefore, frozenAfter) {
    const a = JSON.stringify(frozenBefore), b = JSON.stringify(frozenAfter);
    return { ok: a === b,
      note: a === b ? "冻结预测未被重写" : "冻结预测被改动：版本对比与校准评估立即失效" };
  }

  window.PARAMS = {
    VERSION, DAY, DEFAULT_PARAMS, GRID, fnv1a, stable,
    simulateStateAt, replayTraining, forwardChainingSplits, logLikelihood,
    gridSearch, paramVersionOf, fit, compareVersions, assertNoRewrite
  };
})();
