/* CognitionScope · engine2.js —— 扩展统计引擎（v3） */
"use strict";
window.E2 = (function () {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const DAY = 86400000;

  /* 学科指纹：v2 用「该次复习之前」的模型留存作预测，口径与 core.stateAt 一致 */
  function fitByDomain(state) { // v3：移除未使用的 retention/R0 形参（内部全走 CS.stateAt）
    const global = [];
    state.items.forEach(it => {
      (it.reviews || []).slice().sort((a, b) => a.t - b.t).forEach(rv => {
        const pre = CS.stateAt(it, rv.t - 1);   // 不含本次复习本身
        global.push({ pred: pre.r, ok: rv.grade >= 2 ? 1 : 0, domain: it.domain });
      });
    });
    if (global.length < 5) return { status: "积累中", rows: [], n: global.length };
    const gPred = avg(global.map(g => g.pred)), gOk = avg(global.map(g => g.ok));
    const by = {};
    global.forEach(g => { (by[g.domain] = by[g.domain] || []).push(g); });
    const rows = Object.keys(by).map(d => {
      const g = by[d], n = g.length, pd = avg(g.map(x => x.pred)), ok = avg(g.map(x => x.ok));
      const w = clamp(n / 8, 0, 1);
      const post = w * ok + (1 - w) * gOk;
      const eff = n >= 8 ? (pd - ok) : (gPred - gOk);   // 校准差：预测留存 - 实际正确率
      return { domain: d, n, post: +post.toFixed(3), eff: +eff.toFixed(3), w: +w.toFixed(2), shrunk: n < 8 };
    }).sort((a, b) => b.n - a.n); // v3：按样本量排序（展示口径），避免按校准差排名；eff 仅作展示
    return { status: "ok", rows, n: global.length, note: "探索性分组统计，非层级模型，不构成学科能力排名" };
  }

  /* 时段分析：六桶（0-3/4-7/8-11/12-15/16-19/20-23），桶内 n≥10 才显示 */
  function timeOfDay(state) {
    const buckets = [[0,3],[4,7],[8,11],[12,15],[16,19],[20,23]];
    const rows = buckets.map(([a, b]) => {
      const xs = [];
      state.items.forEach(it => it.reviews.forEach(rv => {
        const h = new Date(rv.t).getHours();
        if (h >= a && h <= b) xs.push(rv.grade >= 2 ? 1 : 0);
      }));
      return { label: a + "-" + b + "时", n: xs.length, ok: xs.length ? +avg(xs).toFixed(2) : null, show: xs.length >= 10 };
    });
    const shown = rows.filter(r => r.show);
    // v2：明确为「已达标时段中正确率最高者」，不再暗示样本最足
    const best = shown.length ? shown.reduce((a, b) => a.ok > b.ok ? a : b) : null;
    return { rows, best, note: "未控制任务难度、学科构成与选择偏差；" };
  }

  /* 会话续航：按 sessionId 分组，检测滑坡点（正确率掉到 base-0.15 以下且 ≥3 题） */
  function sessionCurve(state) {
    const out = [];
    const byS = {};
    state.items.forEach(it => it.reviews.forEach(rv => {
      if (rv.sessionId) (byS[rv.sessionId] = byS[rv.sessionId] || []).push({ ok: rv.grade >= 2 ? 1 : 0, t: rv.t });
    }));
    Object.keys(byS).forEach(sid => {
      const arr = byS[sid].sort((a, b) => a.t - b.t);
      if (arr.length < 5) return;
      const half = Math.floor(arr.length / 2);
      const base = avg(arr.slice(0, half).map(x => x.ok));
      let slump = null;
      if (base > 0) { // v3：base=0 时窗口恒不可能低于基线-0.15，检测无意义，跳过
        for (let i = half; i < arr.length - 2; i++) {
          const win = avg(arr.slice(i, i + 3).map(x => x.ok));
          if (win < base - 0.15) { slump = i; break; }
        }
      }
      // v2：语义钉死为「第 k 题起出现滑坡窗口」，与验收标准一致
      out.push({ sid, n: arr.length, base: +base.toFixed(2), slump: slump == null ? null : "第" + (slump + 1) + "题起" });
    });
    return out.sort((a, b) => b.n - a.n);
  }

  /* 知识网络：度数 / 孤立节点 / prereq 依赖环检测（DFS 找回边 + 环去重） */
  function netAnalysis(state) {
    const deg = {}, adj = {};
    state.items.forEach(it => { deg[it.id] = 0; adj[it.id] = []; });
    const edges = [], edgeSeen = new Set();
    const pushEdge = (a, b, type) => {
      const sig = type + ":" + a + "->" + b;
      if (edgeSeen.has(sig)) return; // v3：同一关系只计一次，防重复边重复计数
      edgeSeen.add(sig);
      edges.push([a, b, type]); deg[a]++; deg[b]++;
    };
    state.items.forEach(it => {
      (it.prereq || []).forEach(p => {
        if (deg[p] != null && p !== it.id) {
          pushEdge(p, it.id, "prereq");
          if (!adj[p].includes(it.id)) adj[p].push(it.id);
        }
      });
      (it.relates || []).forEach(p => {
        if (deg[p] != null && p !== it.id) pushEdge(it.id, p, "relates");
      });
    });
    const orphans = state.items.filter(it => deg[it.id] === 0).map(it => it.id);
    const color = {}, stack = [], cycles = [], seen = new Set();
    function dfs(u) {
      color[u] = 1; stack.push(u);
      for (const v of adj[u]) {
        if (color[v] === 1) {
          const cyc = stack.slice(stack.indexOf(v)).concat(v)
            .map(id => state.items.find(i => i.id === id)?.content || id);
          const sig = cyc.slice().sort().join("|");
          if (!seen.has(sig)) { seen.add(sig); cycles.push(cyc); }
        } else if (!color[v]) dfs(v);
      }
      stack.pop(); color[u] = 2;
    }
    state.items.forEach(it => { if (!color[it.id]) dfs(it.id); });
    const avgDeg = state.items.length ? +(2 * edges.length / state.items.length).toFixed(2) : 0;
    const orphanPct = state.items.length ? orphans.length / state.items.length : 0;
    return { nodes: state.items.length, edges: edges.length, avgDeg, orphans, orphanPct, cycles,
      note: "孤立节点只表示未登记关联，不等于知识脆弱" };
  }

  /* PlanGen 阶段一：规则骨架（确定性调度；AI 只做白名单修饰） */
  function planSkeleton(state, opts) {
    opts = opts || {};
    const cap = Number.isFinite(opts.capacity) ? opts.capacity : 30; // v3：显式传 0 也生效
    const dur = CS.findDue().slice(0, cap);
    // v3【高危修复·隐私】：骨架不再携带任何条目原文（content），只留 id/学科/类型/理由
    const items = dur.map(({ it, st }) => ({
      itemId: it.id, domain: it.domain, type: "review",
      why: "r=" + Math.round(st.r * 100) + "%·S=" + st.S.toFixed(1) + "d"
    }));
    const load = CS.futureLoad(7, Date.now(), { capacity: cap });
    const peak = load.reduce((a, b) => b.due > a.due ? b : a, load[0]);
    return {
      date: new Date().toISOString().slice(0, 10),
      items,
      capacity: cap,
      sessionTemplate: { duration: "25m",
        advice: (state.profile.goldenHour && typeof state.profile.goldenHour === "object" && state.profile.goldenHour.label)
          ? "建议放在 " + state.profile.goldenHour.label : "按你最近的黄金时段安排" }, // v3：goldenHour 非对象时兜底
      forecast: { today: items.length, peakDay: peak ? "D+" + peak.d + "（" + peak.due + " 条）" : "-" },
      assumption: "预测假设每天按容量 " + cap + " 条复习且成功回忆；启发式方案，非数学最优调度",
      aiModifiable: ["reorder", "shiftTime"],
      hardRule: "AI 不得增删学习内容总量，不得修改目标"
    };
  }

  /* 交错 vs 集中：按复习日期数做观察性分组；不是随机 A/B 实验 */
  function abCompare(state) {
    const inter = [], mass = [];
    state.items.forEach(it => {
      if (it.reviews.length < 4) return;
      const uniqDays = new Set(it.reviews.map(r => new Date(r.t).toDateString())).size;
      const late = it.reviews.slice(-3);
      const ok = avg(late.map(r => r.grade >= 2 ? 1 : 0));
      (uniqDays >= 3 ? inter : mass).push(ok);
    });
    if (inter.length < 3 || mass.length < 3) return { status: "积累中（两组各需≥3条目）", inter: inter.length, mass: mass.length };
    return { status: "ok", interleaved: +avg(inter).toFixed(2), massed: +avg(mass).toFixed(2), nI: inter.length, nM: mass.length,
      note: "按历史复习日期数分组，存在选择偏差；不能推断因果" };
  }

  return { fitByDomain, timeOfDay, sessionCurve, netAnalysis, planSkeleton, abCompare, avg, clamp, DAY };
})();
