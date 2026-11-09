/* CognitionScope · N=1 单案例设计统计（SCED）
 * 随机化检验（小样本精确枚举 / 大样本固定种子蒙特卡洛）、百分位 bootstrap CI、
 * NAP 非重叠对比例、lag-1 自相关。
 * 全部结果只描述「该个体、该观测窗」；不做因果宣称、不输出人群百分位、不可推广。
 */
"use strict";
window.SCED = (function () {
  const VERSION = "sced/9.0";
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  function values(series, phase) {
    return (series || []).filter(x => x && x.phase === phase && Number.isFinite(x.value)).map(x => x.value);
  }
  function combinations(n, k, cb) {
    const idx = [];
    (function go(start) {
      if (idx.length === k) { cb(idx.slice()); return; }
      for (let i = start; i < n; i++) { idx.push(i); go(i + 1); idx.pop(); }
    })(0);
  }

  function randomizationTest(series, opts) {
    const o = opts || {};
    const A = values(series, "A"), B = values(series, "B");
    const vals = (series || []).filter(x => x && Number.isFinite(x.value)).map(x => x.value);
    const n = vals.length, nA = A.length, nB = B.length;
    const observed = (A.length && B.length) ? mean(B) - mean(A) : null;
    if (observed == null || n < 2 || !nA || !nB) {
      return { VERSION, status: "insufficient", observed, p: null, n, nA, nB,
        reason: "A、B 两期各需至少 1 个有效观测" };
    }
    let count = 0, total = 0;
    const exact = n <= 12;
    if (exact) {
      combinations(n, nA, combo => {
        const set = new Set(combo);
        let sa = 0, sb = 0;
        for (let i = 0; i < n; i++) { if (set.has(i)) sa += vals[i]; else sb += vals[i]; }
        if (Math.abs(sb / nB - sa / nA) >= Math.abs(observed) - 1e-12) count++;
        total++;
      });
    } else {
      const rand = rng(o.seed == null ? 20261106 : o.seed);
      const perms = o.permutations || 5000;
      for (let k = 0; k < perms; k++) {
        const a = vals.slice();
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
        let sa = 0, sb = 0;
        for (let i = 0; i < nA; i++) sa += a[i];
        for (let i = nA; i < n; i++) sb += a[i];
        if (Math.abs(sb / nB - sa / nA) >= Math.abs(observed) - 1e-12) count++;
        total++;
      }
    }
    return { VERSION, status: "evaluated", observed: +observed.toFixed(6),
      p: +(total ? (count + 1) / (total + 1) : 1).toFixed(6), n, nA, nB,
      permutations: total, exact, method: exact ? "精确随机化检验" : "蒙特卡洛随机化检验（固定种子）",
      note: "p 值回答「A/B 标签可交换假设下，出现同样或更大差异的概率」；不是因果证明，且只对该个体观测窗有效。" };
  }

  function bootstrapCI(vals, opts) {
    const o = opts || {}, v = (vals || []).filter(Number.isFinite);
    if (v.length < 2) return { VERSION, status: "insufficient", ci: null, reason: "至少需要 2 个观测" };
    const B = o.iterations || 2000, rand = rng(o.seed == null ? 424242 : o.seed), out = [];
    for (let k = 0; k < B; k++) {
      let s = 0; for (let i = 0; i < v.length; i++) s += v[Math.floor(rand() * v.length)];
      out.push(s / v.length);
    }
    out.sort((a, b) => a - b);
    const q = p => out[Math.min(out.length - 1, Math.max(0, Math.floor(p * (out.length - 1))))];
    const alpha = o.alpha || 0.05;
    return { VERSION, status: "evaluated", mean: +mean(v).toFixed(6),
      ci: [+q(alpha / 2).toFixed(6), +q(1 - alpha / 2).toFixed(6)], level: 1 - alpha,
      iterations: B, method: "百分位 bootstrap（固定种子）",
      note: "区间只描述该样本的重抽样不确定性，不代表总体参数或个体间变异。" };
  }

  function nap(A, B) {
    const a = (A || []).filter(Number.isFinite), b = (B || []).filter(Number.isFinite);
    if (!a.length || !b.length) return null;
    let win = 0, tie = 0;
    for (const x of a) for (const y of b) { if (y > x) win++; else if (y === x) tie++; }
    return +((win + 0.5 * tie) / (a.length * b.length)).toFixed(6);
  }
  function lag1(vals) {
    const v = (vals || []).filter(Number.isFinite);
    if (v.length < 3) return null;
    const m = mean(v); let num = 0, den = 0;
    for (let i = 1; i < v.length; i++) num += (v[i] - m) * (v[i - 1] - m);
    for (let i = 0; i < v.length; i++) den += Math.pow(v[i] - m, 2);
    return den ? +(num / den).toFixed(6) : null;
  }

  function report(series, opts) {
    const A = values(series, "A"), B = values(series, "B");
    return { VERSION, scope: "单一个体、单一观测窗；不做因果宣称、不输出人群百分位、不可推广",
      nA: A.length, nB: B.length,
      randomizationTest: randomizationTest(series, opts),
      effectCI: bootstrapCI((series || []).map(x => x.value), opts),
      nap: nap(A, B), lag1: lag1(B),
      readingGuide: [
        "随机化检验 p 小只说明该个体 A/B 期差异不太像标签随机产生，不等于干预有效",
        "bootstrap CI 覆盖 0 时不宜宣称存在稳定效应",
        "NAP 是所有 A×B 配对中 B 优于 A 的比例，属描述性效应量",
        "lag-1 自相关明显时，上述 p 值与区间会过于乐观，需增加观测或改用时间序列方法",
        "单案例结果不可推广到其他人；不输出 z 分数、常模百分位或能力画像"
      ] };
  }

  return { VERSION, rng, mean, values, combinations, randomizationTest,
    bootstrapCI, nap, lag1, report };
})();
