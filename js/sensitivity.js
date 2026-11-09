/* CognitionScope · 缺失数据敏感性分析
 * 输入 EXP.ittPairs() 的结果（pairs + incomplete），输出 best/worst 边界、
 * tipping point 与稳健性分级。
 * 严格声明：这只量化结论对缺失数据的稳健性，不修复/插补缺失数据、不产生新点估计，
 * 也不把 complete-case 结果包装成「完整 ITT」。
 */
"use strict";
window.SENS = (function () {
  const VERSION = "sensitivity/9.0";
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  function rnd(x) { return Number.isFinite(x) ? +x.toFixed(6) : null; }

  /** 每个不完整配对在 [lo,hi] 观测范围内可能的 B-A 区间 */
  function missingRanges(incomplete, lo, hi) {
    return (incomplete || []).map(x => {
      const a = Number.isFinite(x.a) ? x.a : null;
      const b = Number.isFinite(x.b) ? x.b : null;
      if (a == null && b == null) return [lo - hi, hi - lo];
      if (a == null) return [b - hi, b - lo];
      if (b == null) return [lo - a, hi - a];
      return [b - a, b - a];
    });
  }

  /** 从 delta=0 向正负方向扫描，找到使结论符号翻转的最小 |delta| */
  function tippingPoint(diffs, ranges, opts) {
    const o = opts || {}, n = diffs.length, m = ranges.length;
    if (!n || !m) return null;
    const base = diffs.reduce((a, b) => a + b, 0) +
      ranges.reduce((a, r) => a + (r[0] + r[1]) / 2, 0);
    const effectAt = d => (base + m * d) / (n + m);
    const e0 = effectAt(0);
    if (e0 === 0) return null;
    const sign0 = Math.sign(e0);
    const maxD = (o.maxDelta == null ? 3 : o.maxDelta) * Math.max(1, o.scale || 1);
    const steps = o.steps || 400;
    for (let i = 1; i <= steps; i++) {
      const d = maxD * i / steps;
      for (const s of [1, -1]) {
        const e = effectAt(s * d);
        if (e !== 0 && Math.sign(e) !== sign0) return +d.toFixed(4);
      }
    }
    return null;
  }

  function analyze(itt, opts) {
    const o = opts || {};
    const pairs = (itt && itt.pairs) || [], incomplete = (itt && itt.incomplete) || [];
    const n = pairs.length, m = incomplete.length;
    const diffs = pairs.map(p => p.b - p.a).filter(Number.isFinite);
    const values = pairs.reduce((acc, p) => acc.concat([p.a, p.b]), []).filter(Number.isFinite);
    let lo = Number.isFinite(o.lower) ? o.lower : (values.length ? Math.min(...values) : 0);
    let hi = Number.isFinite(o.upper) ? o.upper : (values.length ? Math.max(...values) : 1);
    if (hi < lo) { const t = lo; lo = hi; hi = t; }

    const cc = n ? mean(diffs) : null;
    const ranges = missingRanges(incomplete, lo, hi);
    const best = (n + m) ? (diffs.reduce((a, b) => a + b, 0) +
      ranges.reduce((a, r) => a + r[1], 0)) / (n + m) : null;
    const worst = (n + m) ? (diffs.reduce((a, b) => a + b, 0) +
      ranges.reduce((a, r) => a + r[0], 0)) / (n + m) : null;
    const robust = n > 0 && cc !== null && ((cc > 0 && worst > 0) || (cc < 0 && best < 0));
    const tip = tippingPoint(diffs, ranges, { maxDelta: o.maxDelta, scale: hi - lo, steps: o.steps });
    const missingRate = (n + m) ? m / (n + m) : 0;

    let verdict;
    if (!n) verdict = "无完整配对，无法给出点估计：不确定";
    else if (robust) verdict = "结论对缺失数据稳健：best/worst 边界同号";
    else if (tip !== null) verdict = "结论脆弱：缺失组偏移 " + tip + " 即可翻转方向";
    else verdict = "结论不确定：缺失数据在合理范围内可改变方向";

    return {
      VERSION, status: "analyzed",
      nComplete: n, nIncomplete: m, missingRate: rnd(missingRate),
      completeCase: rnd(cc), bounds: { lo: rnd(lo), hi: rnd(hi), best: rnd(best), worst: rnd(worst),
        nRanges: ranges.length },
      tippingPoint: tip, robust, verdict,
      note: "敏感性分析只量化结论稳健性，不修复或插补缺失数据、不产生新的点估计；不得替换主要结论，也不能把 complete-case 结果改称完整 ITT。",
      method: "以观测值范围 [lo,hi] 为界，对不完整配对做 best/worst 边界与 tipping-point 扫描；边界是描述性界限，不是缺失数据的估计值"
    };
  }

  return { VERSION, mean, missingRanges, tippingPoint, analyze };
})();
