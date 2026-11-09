/* CognitionScope · observe.js —— 观测站渲染（v3：证据分级 + 双负荷曲线） */
"use strict";
window.OBS = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bar = (v, color) => '<div class="bar"><i style="width:' + Math.round(Math.max(0, Math.min(1, v)) * 100) + '%;background:' + color + '"></i></div>';
  const MT = { fact: "事实", concept: "概念", paper: "文献", skill: "技能" };
  const EV = {
    direct: '<span class="badge g">直接记录</span>',
    model: '<span class="badge a">模型估计</span>',
    explore: '<span class="badge w">探索性</span>'
  };

  function ticker() {
    const st = CS.state, fit = CS.fitParams();
    const due = CS.findDue().length;
    const pcm = CS.buildPCM();
    const items = [
      { k: "到期复习", v: due, s: "模型 r<0.9 的条目数", e: EV.model },
      { k: "复习经验正确率", v: (fit.rHat * 100).toFixed(0) + "%", s: fit.status + " · n=" + fit.n, e: EV.model }, // v3：rHat 是收缩估计，不是直接记录
      { k: "元认知偏差", v: pcm.metacog.biasPct == null ? "积累中" : (pcm.metacog.biasPct > 0 ? "+" : "") + pcm.metacog.biasPct + "%", s: pcm.metacog.note + " · n=" + pcm.metacog.n, e: EV.explore },
      { k: "知识条目", v: st.items.length, s: Object.keys(pcm.domains).length + " 个学科", e: EV.direct }
    ];
    $("#ticker").innerHTML = items.map(i => '<div class="tick"><div class="k">' + i.k + ' ' + i.e + '</div><div class="v">' + i.v + '</div><div class="s">' + esc(i.s) + '</div></div>').join(""); // v3：口径说明与数字同级展示，不再做小字免责
  }

  function render() {
    ticker();
    const st = CS.state, pane = $("#pane-observe");
    const doms = E2.fitByDomain(st); // v3：签名收敛为 (state)
    const tod = E2.timeOfDay(st);
    const sess = E2.sessionCurve(st);
    const ab = E2.abCompare(st);
    const net = E2.netAnalysis(st);
    const load = CS.futureLoad(7);
    const maxLoad = Math.max(1, ...load.map(l => Math.max(l.due, l.noActionDue)));

    pane.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h2>未来 7 天负荷 ${EV.model}</h2>
        <div class="dim" style="margin-bottom:6px">蓝＝假设每天按容量 20 条复习并成功回忆；黄＝完全不复习的对照外推。两条线分离度＝计划干预的价值。</div>
        ${load.map(l => '<div class="row"><span class="dim">D+' + l.d + '</span><div style="flex:1">' +
          bar(l.due / maxLoad, "#3B82F6") + bar(l.noActionDue / maxLoad, "#D9A441") + '</div>' +
          '<span class="mono">' + l.due + '/' + l.noActionDue + '</span></div>').join("")}
        <div class="dim" style="margin-top:6px">峰值出现在 D+${(load.reduce((a, b) => b.due > a.due ? b : a, load[0]) || {}).d || 0}；按计划复习可让负荷回落，超过容量的部分记为 carry。</div>
      </div>
      <div class="card">
        <h2>学科复习表现 ${EV.explore}</h2>
        ${doms.status !== "ok" ? '<div class="dim">复习满 5 次后开始绘制。</div>' :
          '<table><tr><th>学科</th><th>n</th><th>收缩正确率</th><th>校准差(预测-实际)</th></tr>' +
          doms.rows.map(r => '<tr><td>' + esc(r.domain) + (r.shrunk ? ' <span class="badge">收缩</span>' : '') + '</td><td>' + r.n + '</td><td>' + Math.round(r.post * 100) + '%</td><td>' + (r.eff >= 0 ? "+" : "") + (r.eff * 100).toFixed(0) + '% ' + (Math.abs(r.eff) > 0.25 ? '<span class="badge w">校准偏差</span>' : "") + '</td></tr>').join("") + '</table>'}
        <div class="dim" style="margin-top:6px">${esc(doms.note || "探索性分组统计，不构成学科能力排名")}；预测值取该次复习前的模型留存；按样本量 n 排序展示，非排名。</div>
      </div>
      <div class="card">
        <h2>时段 × 正确率 ${EV.direct}</h2>
        ${tod.rows.map(r => '<div class="row"><span class="dim">' + r.label + '</span>' + (r.show ? bar(r.ok, r.ok === Math.max(...tod.rows.filter(x => x.show).map(x => x.ok)) ? "#61AB83" : "#3B82F6") + '<span class="mono">' + (r.ok * 100).toFixed(0) + '%</span>' : '<span class="dim">n<10</span>') + '</div>').join("")}
        ${tod.best ? '<div class="dim">已达标时段中正确率最高：' + tod.best.label + '（' + (tod.best.ok * 100).toFixed(0) + '%，n=' + tod.best.n + '）</div>' : ""}
        <div class="dim">${esc(tod.note || "")}不能据此认定「黄金时段」。</div>
      </div>
      <div class="card">
        <h2>会话续航 ${EV.explore}</h2>
        ${sess.length ? sess.slice(0, 5).map(s => '<div class="row"><span class="mono">' + esc(s.sid.slice(0, 8)) + '</span><span class="dim">n=' + s.n + '</span><span>基线 ' + (s.base * 100).toFixed(0) + '%</span><span class="badge ' + (s.slump ? "b" : "g") + '">' + (s.slump ? esc(s.slump) + "滑坡" : "稳定") + '</span></div>').join("") : '<div class="dim">带 sessionId 的复习满 5 题后显示续航。</div>'}
      </div>
      <div class="card">
        <h2>交错 vs 集中 ${EV.explore}</h2>
        ${ab.status !== "ok" ? '<div class="dim">' + esc(ab.status) + '</div>' :
          '<div class="kpi"><div class="c"><b>' + (ab.interleaved * 100).toFixed(0) + '%</b><span>交错（n=' + ab.nI + '）</span></div><div class="c"><b>' + (ab.massed * 100).toFixed(0) + '%</b><span>集中（n=' + ab.nM + '）</span></div><div class="c"><b>' + (ab.interleaved > ab.massed ? "+" : "") + Math.round((ab.interleaved - ab.massed) * 100) + '%</b><span>差值</span></div></div>'}
        <div class="dim">${esc(ab.note || "观察性分组，不是随机对照试验，不能推断因果")}</div>
      </div>
      <div class="card">
        <h2>网络健康 ${EV.direct}</h2>
        <div class="row"><span>节点 / 边</span><span class="mono">${net.nodes} / ${net.edges}</span></div>
        <div class="row"><span>平均连接度</span><span class="mono">${net.avgDeg}</span></div>
        <div class="row"><span>孤立节点（未登记关联）</span><span class="badge ${net.orphans.length ? "w" : "g"}">${net.orphans.length}</span></div>
        <div class="row"><span>前置依赖环</span><span class="badge ${net.cycles.length ? "b" : "g"}">${net.cycles.length}</span></div>
        ${net.cycles.length ? '<details><summary>查看环</summary><div class="mono dim">' + esc(net.cycles.slice(0, 3).map(c => c.join(" → ")).join("\n")) + '</div></details>' : ""}
        <div class="dim" style="margin-top:6px">${esc(net.note)}</div>
      </div>
    </div>
    <div class="card">
      <h2>条目行情表 ${EV.model}</h2>
      <div class="dim" style="margin-bottom:6px">r(t) 与 S 来自自定义指数半衰期原型，不是 FSRS，也不是客观掌握度。</div>
      <table><tr><th>内容</th><th>学科</th><th>类型</th><th>r(t)</th><th>S</th><th>分档</th><th></th></tr>
      ${st.items.slice().sort((a, b) => CS.stateAt(a).r - CS.stateAt(b).r).slice(0, 20).map(it => {
        const s = CS.stateAt(it), m = CS.masteryOf(it);
        return '<tr><td>' + esc(it.content.slice(0, 26)) + '</td><td>' + esc(it.domain) + '</td><td>' + esc(MT[it.mtype] || it.mtype) + '</td><td class="mono">' + Math.round(s.r * 100) + '%</td><td class="mono">' + s.S.toFixed(1) + 'd</td><td>' + "●".repeat(m + 1) + '</td><td><button class="btn ghost sm" data-review="' + esc(it.id) + '">复习</button></td></tr>';
      }).join("") + '</table>'}
      <div class="dim" style="margin-top:6px">按 r(t) 升序——模型认为最濒危的在前。</div>
    </div>
    ${v6Block()}`;
    pane.querySelectorAll("[data-review]").forEach(b => b.onclick = () => window.APP.reviewFlow(b.dataset.review));
    bindV6();
  }

  /* ---------- v6 工具层增强（模块缺失时返回空串，不影响历史 8 页回归） ---------- */
  function v6Block() {
    if (!window.CS6 || !window.METRICS || !window.VERIFY) return "";
    const st = CS.state;
    const reviews = st.items.flatMap(i => (i.reviews || []).map(r => Object.assign({ itemId: i.id }, r)));
    const acc = window.VERIFY.verifiedAccuracy(reviews);
    const self = window.VERIFY.selfRatedPassRate(reviews);
    const l2 = window.CS6.ensure();
    const pairs = window.CAL ? window.CAL.collectFromEvents(l2) : [];
    const cal = window.CAL ? window.CAL.evaluateFrozen(l2, { minPairs: 30, MISD: 0.01 }) : null;
    const chain = window.CS6.verifyChain();
    const ctx = { paramVersion: l2.paramVersion, calibrationStatus: cal ? cal.status : "unknown",
      modelHasSignal: cal ? cal.modelHasSignal !== false : true, n: pairs.length,
      dataRange: pairs.length ? [pairs[0].t, pairs[pairs.length - 1].t] : {} };
    const shown = window.METRICS.filterForLayer("tool", ctx).shown.length;

    const calText = !cal || cal.status === "insufficient"
      ? `<span class="badge w">校准数据积累中（${pairs.length} 条冻结配对）</span>`
      : cal.modelHasSignal
        ? `<span class="badge g">模型有信号</span> ${cal.needCalibration ? '<span class="badge w">需校准层</span>' : ""}`
        : `<span class="badge b">模型无信号 · 已退回基线</span>`;
    const accText = acc.accuracy == null ? "积累中（n=" + acc.n + "）"
      : (acc.accuracy * 100).toFixed(1) + "%（n=" + acc.n + "，95% 区间 " + acc.ci95.map(x => (x * 100).toFixed(0) + "%").join("–") + "）";
    return `<div class="card"><h2>工具层 · 高信息量指标 <span class="badge a">v6 瘦身</span></h2>
      <div class="dim" style="margin-bottom:8px">指标变少、信息量变大：删掉同源自评与占位常模派生值，保留可行动输出与可校准量。
      当前工具层显示 ${shown} 项，其余全部移入研究层；所有数字附 n、范围与等级。</div>
      <div class="grid2">
        <div class="card"><h3>已核验正确率 <span class="badge g">A · 直接记录</span></h3>
          <div class="row"><span>按 rubricVersion 核验</span><span class="mono">${esc(accText)}</span></div>
          <div class="dim">分母只含 verified；未核验/放弃一律排除。${esc(acc.note || "")}</div></div>
        <div class="card"><h3>留存模型校准状态 <span class="badge a">B · 模型估计</span></h3>
          <div class="row"><span>判定</span><span>${calText}</span></div>
          <div class="row"><span>参数版本 / 冻结配对</span><span class="mono">${esc(l2.paramVersion)} / ${pairs.length}</span></div>
          <div class="row"><span>事件链</span><span class="badge ${chain.ok ? "g" : "b"}">${chain.ok ? "完整" : "异常"}</span></div>
          <div class="dim">${esc(cal && cal.verdict ? cal.verdict : "样本不足时不得展示掌握度或个性化结论")}</div></div>
        <div class="card"><h3>自评达标率 <span class="badge a">B · 模型估计</span></h3>
          <div class="row"><span>学习者自评</span><span class="mono">${self.rate == null ? "积累中" : (self.rate * 100).toFixed(1) + "%"}（n=${self.n}）</span></div>
          <div class="dim">${esc(self.note || "与 outcome 同源，不等于客观正确率")}</div></div>
        <div class="card"><h3>今日可行动输出</h3>
          <div class="row"><span>到期队列</span><span class="mono">${CS.findDue().length} 条</span></div>
          <div class="dim">这是本工具唯一直接可行动的输出；其余均为观测，不构成能力结论。</div>
          <div style="margin-top:8px"><button class="btn sm" id="obsGoResearch">前往研究层查看校准曲线 →</button></div></div>
      </div></div>`;
  }

  function bindV6() {
    const b = document.querySelector("#obsGoResearch");
    if (b && window.APP && APP.go) b.onclick = () => APP.go("calib");
  }

  return { render, ticker, esc, MT, EV, v6Block, bindV6 };
})();
