/* CognitionScope · research.js —— 研究层页面（v6）
 * 双层架构：工具层只放 A 级 + 已校准的少量 B 级；研究层承载全部 B/C/D 并附免责。
 * 所有计算委托给纯模块，本文件只负责装配与交互；模块缺失时优雅降级。
 */
"use strict";
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => (window.CALUI ? window.CALUI.esc(s)
    : String(s == null ? "" : s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const has = k => !!window[k];

  function missing(mods) {
    return `<div class="card"><h2>模块未装载</h2><div class="warn-box">以下模块不可用：${esc(mods.join("、"))}。
      请确认 index.html 的脚本加载顺序；历史 8 页不受影响。</div></div>`;
  }
  function toast(msg) { if (window.APP && APP.toast) APP.toast(msg); }
  function download(name, text) {
    if (window.APP && APP.download) return APP.download(name, text);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- 校准与模型 ---------------- */
  function calibrationData() {
    if (!has("CS6") || !has("CAL")) return { available: false, reason: "缺少 CS6 / CAL" };
    const l2 = window.CS6.ensure();
    const pairs = window.CAL.collectFromEvents(l2);
    const rep = window.CAL.evaluateFrozen(l2, { minPairs: 30, MISD: 0.01 });
    const cov = has("PROBES") ? window.PROBES.coverageReport(pairs) : null;
    const frontier = window.CAL.thresholdFrontier(pairs);
    const fits = (l2.paramFits || []).slice(-5);
    return { available: true, pairs, rep, cov, frontier, fits,
      paramVersion: l2.paramVersion, chain: window.CS6.verifyChain() };
  }

  function renderCalib() {
    if (!has("CALUI") || !has("CAL")) return missing(["CAL", "CALUI", "CS6"]);
    const d = calibrationData();
    const pane = $("#pane-calib");
    let html = `<div class="card"><h2>研究层 · 留存模型校准</h2>
      <div class="dim">所有数字来自排期时冻结的预测，不用拟合后的新参数重算历史。
      当前参数版本 <span class="mono">${esc(d.paramVersion || "—")}</span>；
      事件链 <span class="badge ${d.chain && d.chain.ok ? "g" : "b"}">${d.chain && d.chain.ok ? "完整" : "异常"}</span>；
      冻结配对 <span class="mono">${d.pairs.length}</span> 条。</div>
      <div class="choice"><button class="btn sm" id="calRerun">重跑校准</button>
        <button class="btn ghost sm" id="calFit">拟合参数（前推验证）</button>
        <button class="btn ghost sm" id="calProbe">生成探针计划</button></div>
      <div id="calExtra" class="dim" style="margin-top:8px"></div></div>`;
    html += window.CALUI.renderCalibrationReport(d.rep, d.cov, d.frontier);
    if (d.fits.length) html += `<div class="card"><h2>参数拟合历史</h2>` +
      d.fits.map(f => `<div class="row"><span class="mono">${esc(f.paramVersion)}</span><span>${esc(f.status || "")} · ${esc((f.verdict || "").slice(0, 60))}</span></div>`).join("") + `</div>`;
    html += `<div class="card"><h2>可识别性清单</h2>` +
      (has("PROBES") ? window.PROBES.identifiabilityChecklist().map(x =>
        `<div class="row"><span class="mono">${x.id}</span><span>${esc(x.need)}</span></div>`).join("")
        : "") +
      `<div class="dim" style="margin-top:6px">实测：按 r&lt;0.9 固定阈值调度会把观测压在窄带，
        r≥0.9 与 r&lt;0.7 均无样本；必须三类探针齐备，留存曲线形状才可识别。</div></div>`;
    pane.innerHTML = html;

    const rerun = $("#calRerun"); if (rerun) rerun.onclick = () => { renderCalib(); toast("已重跑校准"); };
    const fitBtn = $("#calFit"); if (fitBtn) fitBtn.onclick = () => {
      const out = $("#calExtra");
      if (!has("PARAMS") || !has("CS")) { out.textContent = "PARAMS 模块未装载"; return; }
      const items = window.CS.state.items || [];
      const fit = window.PARAMS.fit(items, d.pairs, { folds: 3 });
      out.innerHTML = `<b>拟合结果</b>：${esc(fit.status)} · ${esc(fit.reason || fit.verdict || "")}` +
        (fit.paramVersion ? ` · paramVersion=<span class="mono">${esc(fit.paramVersion)}</span>` : "") +
        `<div class="dim">${esc((fit.caveats || []).join("；"))}</div>`;
    };
    const probeBtn = $("#calProbe"); if (probeBtn) probeBtn.onclick = () => {
      const out = $("#calExtra");
      if (!has("PROBES") || !has("CS")) { out.textContent = "PROBES 模块未装载"; return; }
      const items = window.CS.state.items || [];
      const plan = window.PROBES.planProbes(items, { enabled: { routine: true, delayed: true, random: true }, seed: Date.now() },
        { t: Date.now(), rOf: it => window.CS.stateAt(it), consent: { delayed: false } });
      out.innerHTML = `<b>本轮探针计划</b>：可执行 ${plan.executable.length} 条，因缺同意被阻止 ${plan.blocked.length} 条。` +
        `<div class="dim">延迟探针会刻意推迟复习、有真实遗忘成本，必须单独知情同意；结果只写 L2，不写 reviews。</div>`;
    };
  }

  /* ---------------- 实验 ---------------- */
  function renderExp() {
    if (!has("EXP") || !has("PROTO")) return missing(["EXP", "PROTO"]);
    const pane = $("#pane-exp");
    const l2 = has("CS6") ? window.CS6.ensure() : {};
    const exps = (l2.experiments || []).slice(-8);
    const lib = window.PROTO.LIB;
    pane.innerHTML = `<div class="card"><h2>研究层 · N=1 预注册实验</h2>
      <div class="dim">实验结论只有「支持 / 不支持 / 不确定」三档；防 peeking、ITT 口径、干预保真度三关全过才显示组间比较。</div>
      <div class="row"><span>从协议库生成预注册草稿</span>
        <select id="expProto" class="inp" style="width:220px">${lib.map(p => `<option value="${p.id}">${esc(p.id + " · " + p.title)}</option>`).join("")}</select>
        <button class="btn sm" id="expDraft">生成草稿</button></div>
      <div id="expDraftOut" class="mono" style="white-space:pre-wrap;margin-top:8px"></div>
      <div class="choice"><button class="btn sm" id="expSeal" disabled>封存预注册 + 分配表</button>
        <button class="btn ghost sm" id="expReport">生成完整报告</button></div>
      <div id="expReportOut" style="margin-top:8px"></div></div>
      <div class="card"><h2>已封存实验（${exps.length}）</h2>
        ${exps.length ? exps.map(e => `<div class="row"><span class="mono">${esc(e.experimentId)}</span>
          <span>${esc((e.hypothesis || "").slice(0, 50))}</span><span class="badge a">${esc(e.status)}</span></div>`).join("")
          : '<div class="dim">尚无预注册实验。协议库目前只记录 enabled 标志，不能直接裁决。</div>'}
      </div>
      <div class="card"><h2>预注册必填清单</h2>
        ${Object.keys(window.EXP.PREREG_TEMPLATE).map(k => `<div class="row"><span class="mono">${esc(k)}</span><span>${esc(String(window.EXP.PREREG_TEMPLATE[k]).slice(0, 60))}</span></div>`).join("")}
      </div>`;
    let currentDraft = null;
    const out = $("#expDraftOut"), seal = $("#expSeal");
    const draftBtn = $("#expDraft"); if (draftBtn) draftBtn.onclick = () => {
      const r = window.PROTO.createDraft($("#expProto").value, { expectedDelta: 0.08 });
      currentDraft = r.draft;
      const v = window.EXP.validateRegistry(r.draft);
      out.textContent = "draft（未封存）\n" + JSON.stringify(r.draft, null, 2) +
        "\n\n校验：" + (v.ok ? "通过" : "未通过 → " + v.errors.join("；"));
      if (seal) seal.disabled = !v.ok;
    };
    if (seal) seal.onclick = () => {
      if (!currentDraft) return;
      const reg = window.EXP.preregister(currentDraft);
      if (!reg.ok) { out.textContent += "\n封存失败：" + reg.errors.join("；"); return; }
      const s = window.PROTO.sealFromDraft(reg.registry, ["i1", "i2", "i3", "i4", "i5", "i6"], "seed-" + Date.now());
      out.textContent += `\n\n已封存：hash=${reg.hash} 分配表=${s.ok ? s.assignment.contentHash : "失败"}`;
      toast("预注册已封存"); renderExp();
    };
    const repBtn = $("#expReport"); if (repBtn) repBtn.onclick = () => {
      const box = $("#expReportOut");
      const r = window.EXP.fullReport({ registry: currentDraft || {}, assignment: null, events: [], now: Date.now() });
      box.innerHTML = `<div class="warn-box">${esc(r.status)}：${esc(r.reason || r.conclusion || "")}</div>` +
        `<div class="dim">周期未满时 UI 不得显示任何组间比较；此处演示防 peeking 的锁定态。</div>`;
    };
  }

  /* ---------------- 数据与导出 ---------------- */
  function renderData() {
    if (!has("EXPORTM") || !has("CS6")) return missing(["EXPORTM", "CS6"]);
    const pane = $("#pane-data");
    const bundle = window.EXPORTM.buildBundle({ sources: window.CS6 && window.CS6.SOURCE_MAP ? window.CS6.SOURCE_MAP : null });
    const m = bundle.bundle.manifest, v = window.EXPORTM.verifyBundle(bundle.bundle);
    const chain = window.CS6.verifyChain();
    const lines = bundle.jsonl.trim() ? bundle.jsonl.trim().split("\n") : [];
    pane.innerHTML = `<div class="card"><h2>研究层 · 数据与导出</h2>
      <div class="dim">导出附 manifest（schema / paramVersion / codeHash / 数据时间范围）+ 扁平 JSONL 复习明细，便于外部独立复算。</div>
      <div class="choice"><button class="btn sm" id="dExpBundle">导出完整包（JSON）</button>
        <button class="btn ghost sm" id="dExpJsonl">导出 JSONL</button>
        <button class="btn ghost sm" id="dExpCsv">导出 CSV（A 级字段）</button>
        <button class="btn ghost sm" id="dChain">校验事件链</button></div>
      <div id="dMsg" class="dim" style="margin-top:8px"></div></div>
      <div class="card"><h2>Manifest 自检 <span class="badge ${v.ok ? "g" : "b"}">${v.ok ? "自洽" : "异常"}</span></h2>
        <div class="row"><span>bundle / schema</span><span class="mono">${esc(bundle.bundle.format)} · L1=${m.schemaVersion.l1} / L2=${m.schemaVersion.l2}</span></div>
        <div class="row"><span>paramVersion / codeHash</span><span class="mono">${esc(m.paramVersion)} · ${esc(m.codeHash ? m.codeHash.digest : "未提供源码映射")}</span></div>
        <div class="row"><span>数据范围</span><span class="mono">${m.dataRange.from ? new Date(m.dataRange.from).toISOString().slice(0, 10) : "—"} → ${m.dataRange.to ? new Date(m.dataRange.to).toISOString().slice(0, 10) : "—"}（${m.dataRange.observations} 观测）</span></div>
        <div class="row"><span>计数</span><span class="mono">${esc(JSON.stringify(m.counts))}</span></div>
        <div class="row"><span>哈希链</span><span class="badge ${chain.ok ? "g" : "b"}">${chain.ok ? "完整" : "断裂"} · 已校验 ${chain.checked} 条</span></div>
        <div class="row"><span>脱敏复核</span><span class="badge ${bundle.leaks.length ? "b" : "g"}">${bundle.leaks.length ? "未通过：" + esc(bundle.leaks.join("、")) : "通过"}</span></div>
      </div>
      <div class="card"><h2>JSONL 预览（前 5 行 / 共 ${lines.length} 行）</h2>
        <div class="mono" style="white-space:pre-wrap;overflow:auto">${esc(lines.slice(0, 5).join("\n")) || "（暂无复习明细）"}</div>
        <div class="dim" style="margin-top:6px">每行含 ySource / rPredFrozen / paramVersion；占位常模 pct 已从导出移除。</div>
      </div>
      <div class="card"><h2>导入</h2>
        <div class="dim">导入前自动备份；拒绝原型污染字段，API Key 不恢复，旧 grade 映射为 gradeSelf 且标记 legacy_unknown。</div>
        <button class="btn ghost sm" id="dImport">选择备份文件</button></div>`;
    const msg = $("#dMsg");
    const b1 = $("#dExpBundle"); if (b1) b1.onclick = () => { download("cognitionscope-bundle.json", bundle.text); msg.textContent = "已导出完整包（" + bundle.text.length + " 字节）"; };
    const b2 = $("#dExpJsonl"); if (b2) b2.onclick = () => { download("cognitionscope-reviews.jsonl", bundle.jsonl); msg.textContent = "已导出 JSONL"; };
    const b3 = $("#dExpCsv"); if (b3) b3.onclick = () => { download("cognitionscope-reviews.csv", bundle.csv); msg.textContent = "已导出 CSV（含公式注入防护）"; };
    const b4 = $("#dChain"); if (b4) b4.onclick = () => { const c = window.CS6.verifyChain(); msg.textContent = c.ok ? "事件链完整（" + c.checked + " 条）" : "事件链断裂：" + JSON.stringify(c.broken); };
    const b5 = $("#dImport"); if (b5) b5.onclick = () => { if ($("#fileImport")) $("#fileImport").click(); };
  }

  /* ---------------- 指标治理 ---------------- */
  function renderMetrics() {
    if (!has("METRICS")) return missing(["METRICS"]);
    const pane = $("#pane-metrics");
    const M = window.METRICS;
    const ctx = { paramVersion: has("CS6") ? window.CS6.ensure().paramVersion : "v7-init",
      calibrationStatus: "unknown", modelHasSignal: true, n: 0, dataRange: {} };
    const tool = M.filterForLayer("tool", ctx), research = M.filterForLayer("research", ctx);
    const slim = M.slimReport(ctx);
    pane.innerHTML = `<div class="card"><h2>研究层 · 指标注册表与红线</h2>
      <div class="dim">每个指标必须先登记才能显示；口径变化必须升 definitionVersion，旧快照不重判。</div>
      <table><tr><th>ID</th><th>名称</th><th>等级</th><th>工具层</th><th>约束</th></tr>
        ${Object.keys(M.METRICS).map(id => { const m = M.METRICS[id]; return `<tr><td class="mono">${esc(id)}</td><td>${esc(m.label)}</td>
          <td>${M.badge(m.grade).html}</td><td>${m.toolLayer ? "是" : "否"}</td><td class="dim">${esc(m.disclaimer)}</td></tr>`; }).join("")}
      </table></div>
      <div class="card"><h2>红线（可执行检查）</h2>
        ${M.RED_LINES.map(r => `<div class="row"><span class="mono">${r.id}</span><span>${esc(r.rule)}</span></div>`).join("")}
      </div>
      <div class="grid2">
        <div class="card"><h2>工具层显示（${tool.shown.length}）</h2>
          ${tool.shown.map(x => `<div class="row"><span class="mono">${esc(x)}</span><span>${esc(M.METRICS[x].label)}</span></div>`).join("")}
          <div class="dim" style="margin-top:6px">被抑制 ${tool.suppressed.length} 项；研究层显示 ${research.shown.length} 项。</div></div>
        <div class="card"><h2>指标瘦身建议</h2>
          <h3>保留</h3>${slim.keep.map(k => `<div class="row"><span class="mono">${esc(k.id)}</span><span class="dim">${esc(k.why)}</span></div>`).join("")}
          <h3>移入研究层 / 停用</h3>${slim.drop.map(k => `<div class="row"><span class="mono">${esc(k.id)}</span><span class="dim">${esc(k.why)}</span></div>`).join("")}
        </div>
      </div>`;
  }

  /* ---------------- 实验室信效度 ---------------- */
  function renderLabDiag() {
    if (!has("LABM") || !has("CS")) return missing(["LABM", "CS"]);
    const pane = $("#pane-labdiag");
    const lab = window.CS.state.lab || [];
    const byKind = {};
    lab.forEach(l => { const k = l.kind || l.name || "unknown"; (byKind[k] = byKind[k] || []).push(l); });
    const reports = Object.keys(byKind).map(k => ({ kind: k,
      rep: window.LABM.analyzeTask(byKind[k], { taskCount: Object.keys(byKind).length,
        days: 14, deviceControlled: false, validityFilled: ["content"] }) }));
    pane.innerHTML = `<div class="card"><h2>研究层 · 实验室信效度诊断</h2>
      <div class="dim">NORMS 全为 source:null 占位常模；本页不输出 z / 百分位 / 能力结论。
      信度门槛不达标时自动建议「收敛为每日状态观测」或「下线」。</div></div>
      ${reports.length ? reports.map(({ kind, rep }) => `<div class="card"><h2>${esc(kind)} <span class="badge ${rep.gate.decision === "keep_converge" ? "g" : rep.gate.decision === "retire" ? "b" : "w"}">${esc(rep.gate.decision)}</span></h2>
        <div class="row"><span>施测次数 / 时间跨度</span><span class="mono">${rep.n} · ${rep.span ? Math.round((rep.span.to - rep.span.from) / 86400000) + " 天" : "—"}</span></div>
        <div class="row"><span>个体内 CV</span><span class="mono">${esc(rep.cv.cv == null ? "积累中" : rep.cv.cv)}</span></div>
        <div class="row"><span>练习效应</span><span class="mono">slope=${esc(rep.practice.slope == null ? "—" : rep.practice.slope)} p=${esc(rep.practice.permutationP == null ? "—" : rep.practice.permutationP)}</span></div>
        <div class="row"><span>ICC / 重测 r</span><span class="mono">${esc(rep.icc ? rep.icc.value : "—")} / ${esc(rep.testRetest.r == null ? "—" : rep.testRetest.r)}</span></div>
        <div class="row"><span>门槛未通过</span><span>${esc(rep.gate.failed.map(f => f.id).join("、") || "无")}</span></div>
        <div class="row"><span>效度缺项</span><span>${esc(rep.gate.validityMissing.join("、") || "无")}</span></div>
        <div class="dim" style="margin-top:6px">${esc(rep.gate.reason)}　${esc(rep.gate.caveat)}</div></div>`).join("")
        : '<div class="card"><div class="dim">尚无实验室施测记录。两周内算不出可接受信度即应收敛或下线。</div></div>'}`;
  }

  function render(tab) {
    const map = { calib: renderCalib, exp: renderExp, data: renderData,
      metrics: renderMetrics, labdiag: renderLabDiag,
      find: () => window.V9UI && window.V9UI.render("find"),
      methods: () => window.V9UI && window.V9UI.render("methods") };
    const fn = map[tab];
    if (!fn) return;
    try { fn(); }
    catch (e) {
      const pane = $("#pane-" + tab);
      if (pane) pane.innerHTML = `<div class="card"><h2>渲染失败</h2><div class="warn-box">${esc(e.message)}</div>
        <div class="dim">研究层渲染异常不影响工具层与已持久化的数据。</div></div>`;
      console.error("RESEARCH.render " + tab, e);
    }
  }

  window.RESEARCH = { render, calibrationData };
})();
