/* CognitionScope · app.js —— 装配、双层路由、录入与档案
 * 兼容纪律：完整保留 v3 的 8 个 tab / renderAdd / renderNet / renderPlan /
 *   reviewFlow / init 的接口与行为，使历史 9 项 smoke 断言继续成立。
 * v6 新增：工具层 / 研究层切换、5 个研究层页面、L2 装载与同意审计挂载。
 */
"use strict";
window.APP = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => (window.OBS && OBS.esc) ? OBS.esc(s) : String(s);

  /* 历史 8 页（不可删改：smoke 逐页检查 pane 内容） */
  const TABS = [["observe", "总览"], ["review", "复习"], ["lab", "实验室"], ["net", "网络"],
    ["plan", "计划"], ["proto", "协议库"], ["ai", "AI"], ["add", "录入"]];
  /* v6 新增研究层页面 */
  const V6_TABS = [["calib", "校准与模型"], ["exp", "预注册实验"], ["labdiag", "实验室信效度"],
    ["metrics", "指标治理"], ["data", "数据与导出"],
    ["find", "检索与回放"], ["methods", "方法与完整性"]];
  const TOOL_TABS = ["observe", "review", "add", "plan", "ai", "data", "find", "home", "glossary", "demo"];
  const RESEARCH_TABS = ["calib", "exp", "labdiag", "metrics", "methods", "lab", "net", "proto"];
  /* v10 新增：导览页与名词解释页，两端导航都可见，不属于任何一层 */
  const V10_TABS = [["home", "开始使用"], ["glossary", "名词解释"]];
  /* v11 新增：示例内容馆（日常使用组，默认零写入） */
  const V11_TABS = [["demo", "示例内容馆"]];
  let layer = "tool";

  function nav() {
    document.querySelectorAll("#tabs button[data-t]").forEach(b => b.onclick = () => go(b.dataset.t));
    const bt = $("#btnLayerTool"), br = $("#btnLayerResearch");
    if (bt) bt.onclick = () => setLayer("tool");
    if (br) br.onclick = () => setLayer("research");
    const vb = $("#verBadge"); if (vb) vb.textContent = "schema v4 + L2 v6";
  }

  function setLayer(l) {
    layer = (l === "research") ? "research" : "tool";
    document.querySelectorAll("#tabs button[data-layer]").forEach(b => {
      const show = b.dataset.layer === layer || b.dataset.layer === "both";
      // v10：两组导航常驻可见，非当前组只淡化，避免「原来还有 10 个页面」被藏起来
      if (b.classList && b.classList.toggle) b.classList.toggle("muted", !show);
    });
    const bt = $("#btnLayerTool"), br = $("#btnLayerResearch");
    if (bt) bt.classList.toggle("on", layer === "tool");
    if (br) br.classList.toggle("on", layer === "research");
    const label = $("#layerHint");
    if (label) label.textContent = layer === "tool"
      ? "日常使用 · 记内容、复习、看趋势。下面的「进阶功能」不点也完全不影响使用。"
      : "进阶功能 · 用来检查数字准不准、结论稳不稳；B/C/D 级指标禁止排名与能力结论。";
    go(layer === "tool" ? "home" : "calib");
  }

  function go(tab) {
    // 历史行为：隐藏全部 pane、取消全部按钮高亮
    document.querySelectorAll(".pane").forEach(p => p.classList.remove("on"));
    document.querySelectorAll("#tabs button").forEach(t => t.classList.remove("on"));
    const pane = $("#pane-" + tab);
    if (pane) pane.classList.add("on");
    const btn = document.querySelector('[data-t="' + tab + '"]');
    if (btn) btn.classList.add("on");

    // 历史 8 页分发（完全保留）
    if (tab === "observe") OBS.render();
    if (tab === "review") REVIEW.render();
    if (tab === "lab") LABUI.render();
    if (tab === "net") renderNet();
    if (tab === "plan") renderPlan();
    if (tab === "proto") PROTO.render();
    if (tab === "ai") AI.render();
    if (tab === "add") renderAdd();

    // v6 研究层分发（模块缺失时降级提示，不抛错）
    if (V6_TABS.some(x => x[0] === tab)) {
      if (window.RESEARCH) window.RESEARCH.render(tab);
      else if (pane) pane.innerHTML = '<div class="card"><h2>研究层</h2><div class="warn-box">RESEARCH 模块未装载，请检查脚本加载顺序。</div></div>';
      layer = "research";
    }
    if (TOOL_TABS.includes(tab)) layer = "tool";

    // v11：示例内容馆（由 DEMOUI 渲染；PLAIN.mount 随后在页首插入白话说明卡）
    if (tab === "demo" && window.DEMOUI) window.DEMOUI.render();
    // v10：导览页 / 名词解释页由通俗化层提供内容
    if (window.PLAIN && window.PLAIN.hasPage && window.PLAIN.hasPage(tab)) {
      window.PLAIN.renderPage(tab, pane);
    }
    // v10：每个功能页顶部插入「本页说明」卡；通俗模式关闭时自动跳过
    if (window.PLAIN && window.PLAIN.mount) window.PLAIN.mount(tab, pane);
  }

  /* ---------- 网络页（v3 原样） ---------- */
  function renderNet() {
    const pane = $("#pane-net");
    const st = CS.state, net = E2.netAnalysis(st);
    pane.innerHTML = `
      <div class="card"><h2>知识网络</h2>
        <div class="dim">两种边：prereq（前置）/relates（关联）。${esc(net.note)}</div>
        <div class="row"><span>节点 / 边 / 孤立 / 环</span><span class="mono">${net.nodes} / ${net.edges} / ${net.orphans.length} / ${net.cycles.length}</span></div>
        ${st.items.length ? `<div class="row"><span>建立关联</span><select id="netA" class="inp">${st.items.map(i => '<option value="' + i.id + '">' + esc(i.content.slice(0, 18)) + '</option>').join("")}</select>
          <select id="netType" class="inp"><option>prereq</option><option>relates</option></select>
          <select id="netB" class="inp">${st.items.map(i => '<option value="' + i.id + '">' + esc(i.content.slice(0, 18)) + '</option>').join("")}</select>
          <button class="btn sm" id="netGo">连边</button></div>` : '<div class="dim">先录入条目。</div>'}
      </div>
      <div class="card"><h2>重学节省率 savings（简化代理值）</h2>
        ${st.items.filter(i => i.reviews.filter(r => r.grade >= 2).length >= 4).slice(0, 8).map(it => {
          const sv = CS.savings(it);
          return sv == null ? "" : '<div class="row"><span>' + esc(it.content.slice(0, 22)) + '</span><span class="mono">' + Math.round(sv.savings * 100) + '%</span><span class="dim">' + esc(sv.limitation) + '</span></div>';
        }).join("") || '<div class="dim">出现「遗忘后重新答对」的周期后自动计算；未恢复成功不报告节省率。</div>'}
      </div>`;
    const goBtn = $("#netGo");
    if (goBtn) goBtn.onclick = () => {
      const a = $("#netA").value, b = $("#netB").value, ty = $("#netType").value;
      if (a === b) return;
      const A = st.items.find(i => i.id === a), B = st.items.find(i => i.id === b);
      if (ty === "prereq") { if (!B.prereq.includes(a)) B.prereq.push(a); }
      else { if (!A.relates.includes(b)) A.relates.push(b); if (!B.relates.includes(a)) B.relates.push(a); }
      CS.save(); renderNet();
    };
  }

  /* ---------- 计划页（v3 原样 + v6 匿名 ID 说明） ---------- */
  function renderPlan() {
    const pane = $("#pane-plan");
    const sk = E2.planSkeleton(CS.state);
    pane.innerHTML = `
      <div class="card"><h2>PlanGen · 双阶段生成</h2>
        <div class="dim">阶段一：本地启发式骨架（到期+容量线+参考时段）。隐私隔离模式禁止将个人排期、条目 ID 或学习数据发送给 AI 服务商。</div>
        <div class="dim" style="margin-top:6px">${esc(sk.assumption)}</div>
        <div class="warn-box">隐私保护：计划只在本地生成和展示；AI 计划修饰已关闭，平台不会把计划或条目数据发送给外部模型。</div>
        <h3>算法骨架（${sk.items.length} 条 / 容量 ${sk.capacity}）</h3>
        ${sk.items.map(i => '<div class="row"><span>' + esc(i.type) + (i.domain ? " · " + esc(i.domain) : "") + '</span><span class="mono">' + esc(i.why || "") + '</span></div>').join("") || '<div class="dim">当前队列没有待处理条目；是否新增学习应由用户决定。</div>'}
        <h3>AI 修饰</h3>
        <button class="btn" id="planGo" disabled>已关闭（不外发个人计划）</button>
        <div id="planOut" class="mono" style="white-space:pre-wrap;margin-top:8px">如需 AI 辅助，请在 AI 页输入不含个人数据的通用研究问题。</div>
      </div>`;
    $("#planGo").onclick = () => {
      $("#planOut").textContent = "";
      AI.planDecorate(t => $("#planOut").textContent += t).catch(e => $("#planOut").textContent += "\n[错误：" + e.message + "]");
    };
  }

  /* ---------- PCM 全览与快照 diff（v3 原样） ---------- */
  function renderPCMView() {
    const p = CS.buildPCM();
    const rows = [
      ["版本 / 生成时间", "pcm v" + p.pcmVersion + " · " + p.generatedAt],
      ["条目数", p.itemCount],
      ["记忆（模型估计）", "rHat=" + p.memory.rHat + " · n=" + p.memory.obs + " · " + p.memory.status],
      ["元认知（探索性）", "bias=" + (p.metacog.biasPct == null ? "积累中" : p.metacog.biasPct + "%") + " · brier=" + (p.metacog.brier == null ? "—" : p.metacog.brier) + " · n=" + p.metacog.n],
      ["速度（直接记录）", "meanRt=" + (p.speed.meanRt == null ? "—" : p.speed.meanRt + "ms") + " · autoIdx=" + (p.speed.autoIdx == null ? "—" : p.speed.autoIdx) + " · n=" + p.speed.n],
      ["学科分布（直接记录）", Object.keys(p.domains).length + " 个"],
      ["知识网络（直接记录）", p.knowledgeNet ? p.knowledgeNet.nodes + " 节点 / " + p.knowledgeNet.edges + " 边 / " + p.knowledgeNet.cycles + " 环" : "—"],
      ["近 7 天（直接记录）", "新增 " + p.growth.newItems7d + " · 复习 " + p.growth.reviews7d],
      ["实验室（原型）", p.lab.length + " 次施测 · " + (p.cognition.zMean == null ? "z 均值积累中" : "z 均值 " + p.cognition.zMean) + "（探索性）"],
      ["协议", p.protocols.length ? p.protocols.map(x => x.id + ":" + x.verdict).join("、") : "未启用"]
    ];
    const snaps = CS.state.pcm || [];
    const a = snaps[snaps.length - 2], b = snaps[snaps.length - 1];
    const g = (o, path) => { try { return path.split(".").reduce((x, k) => x[k], o); } catch (e) { return "—"; } };
    const diffRows = (a && b) ? [
      ["快照时间", new Date(a.at).toLocaleDateString() + " → " + new Date(b.at).toLocaleDateString()],
      ["条目数", g(a, "itemCount") + " → " + g(b, "itemCount")],
      ["rHat", g(a, "memory.rHat") + " → " + g(b, "memory.rHat")],
      ["元认知偏差", g(a, "metacog.biasPct") + " → " + g(b, "metacog.biasPct")],
      ["7 天复习量", g(a, "growth.reviews7d") + " → " + g(b, "growth.reviews7d")]
    ] : null;
    return '<div class="card" style="margin-top:8px"><h3>个人学习数据档案（PCM）</h3>' +
      '<table>' + rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td class="mono">' + esc(r[1]) + '</td></tr>').join("") + '</table>' +
      '<div class="dim" style="margin-top:6px">PCM 是个人学习数据档案，不是「大脑模型」；各段已标注证据等级。</div>' +
      (diffRows ? '<h3>最近两次快照 diff</h3><table>' + diffRows.map(r => '<tr><td>' + esc(r[0]) + '</td><td class="mono">' + esc(r[1]) + '</td></tr>').join("") + '</table>'
                : '<div class="dim" style="margin-top:6px">生成两次快照后可查看 diff。</div>') +
      '</div>';
  }

  /* ---------- 录入页（v3 主体 + v6 要点清单字段） ---------- */
  function renderAdd() {
    const pane = $("#pane-add");
    const v6Fields = `
      <div class="card"><h2>v6 · 要点核验设置 <span class="badge a">A 级数据基础</span></h2>
        <div class="dim">登记要点清单与评分标准版本后，复习时可核验「命中要点数 / 总要点数」，
        产出 A 级客观正确率；未登记则只能自评且 status=unverified，不进客观正确率分母。</div>
        <div class="row"><span>要点清单（逗号分隔）</span><input class="inp" id="inKP" placeholder="如：定义,适用条件,反例" style="flex:1"></div>
        <div class="row"><span>rubricVersion</span><input class="inp" id="inRV" placeholder="如：rb-2026-01" style="width:160px"></div>
        <div class="dim">修改评分标准须升版本号，历史记录不重判。</div>
      </div>`;
    pane.innerHTML = `
      <div class="card"><h2>录入学习内容</h2>
        <div class="row"><span>题目/提示</span><input class="inp" id="inC" placeholder="写成一个可回忆、可回答的问题" style="flex:1"></div>
        <div class="row"><span>参考答案</span><input class="inp" id="inA" placeholder="可选；没有答案时只能做自评"></div>
        <div class="row"><span>评分标准</span><input class="inp" id="inR" placeholder="可选；说明哪些要点算正确"></div>
        <div class="row"><span>学科</span><input class="inp" id="inD" placeholder="如：数学" style="width:120px"></div>
        <div class="row"><span>类型</span><select class="inp" id="inT"><option value="fact">事实</option><option value="concept">概念</option><option value="paper">文献</option><option value="skill">技能</option></select></div>
        <button class="btn" id="inGo">加入队列</button>
      </div>
      ${window.VERIFY ? v6Fields : ""}
      <div class="card"><h2>隐私保护说明</h2>
        <div class="dim">已关闭 AI 个人打卡解析。个人学习内容只通过本地录入表单保存，不会发送给 AI 服务商。</div>
      </div>
      <div class="card"><h2>数据档案（PCM）</h2>
        <div class="row"><span>个人学习数据档案</span><span class="mono">schema v${CS.state.schemaVersion} · ${CS.state.items.length} 条目 · ${CS.state.lab.length} 次施测</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn" id="pcmGo">生成快照并导出 PCM</button>
          <button class="btn ghost" id="expAll">全量导出</button>
          <button class="btn ghost" id="impAll">导入</button>
        </div>
        <div id="pcmView">${renderPCMView()}</div>
      </div>`;
    $("#inGo").onclick = () => {
      const c = $("#inC").value.trim(); if (!c) return;
      const kpRaw = $("#inKP") ? $("#inKP").value.trim() : "";
      const rv = $("#inRV") ? $("#inRV").value.trim() : "";
      const it = CS.addItem({ content: c, answer: $("#inA").value.trim(), rubric: $("#inR").value.trim(),
        domain: $("#inD").value.trim() || "未分类", mtype: $("#inT").value });
      if (kpRaw && it) {
        it.keypoints = kpRaw.split(/[,，、]/).map(s => s.trim()).filter(Boolean).slice(0, 20);
        it.rubricVersion = rv || "rb-" + new Date().toISOString().slice(0, 10);
        CS.save();
      }
      $("#inC").value = ""; $("#inA").value = ""; $("#inR").value = "";
      go("add"); OBS.ticker();
    };
    $("#pcmGo").onclick = () => {
      const snap = CS.recordPCM();
      download("PCM-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(snap, null, 2));
      renderAdd();
    };
    $("#expAll").onclick = () => {
      if (window.EXPORTM) {
        const b = window.EXPORTM.buildBundle({});
        download("cognitionscope-bundle.json", b.text);
      } else download("cogscope-backup.json", CS.exportJSON());
    };
    $("#impAll").onclick = () => $("#fileImport").click();
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function toast(msg) {
    const t = $("#toast"); if (!t) return;
    t.textContent = msg; t.classList.add("on");
    setTimeout(() => t.classList.remove("on"), 2200);
  }

  function init() {
    CS.load();
    // migration: remove API credentials persisted by older releases from the personal-data store.
    if (CS.state.aiCfg && Object.prototype.hasOwnProperty.call(CS.state.aiCfg, "key")) { delete CS.state.aiCfg.key; CS.save(); }
    if (window.CS6) window.CS6.load();                          // v6：装载 L2 事件层
    if (window.CONSENT && window.CS6)                          // v6：同意审计写入 L2
      window.CONSENT.attach((stream, rec) => window.CS6.append(stream, rec, { persist: false }));
    LAB.hydrate(CS.state.lab);
    nav();
    $("#btnExport").onclick = () => {
      if (window.EXPORTM) {
        const b = window.EXPORTM.buildBundle({});
        download("cognitionscope-bundle.json", b.text);
      } else download("cogscope-backup.json", CS.exportJSON());
    };
    $("#btnPCM").onclick = () => { CS.recordPCM(); go("add"); };
    $("#btnImport").onclick = () => $("#fileImport").click();
    $("#fileImport").onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          if (window.PERSIST && window.IMPORTV) {
            const res = window.PERSIST.importBundle(r.result);
            if (!res.ok) throw new Error(res.error.message);
            toast("导入成功（双键事务），警告：" + res.warnings.length + " 条");
          } else { CS.importJSON(r.result); toast("导入成功"); }
          go("observe");
        } catch (err) { alert("导入失败：" + err.message); }
      };
      r.readAsText(f);
      e.target.value = "";
    };
    if (window.OBS && OBS.ticker) OBS.ticker();   // v10：概览卡与默认页解耦
    if (window.DEMOUI && window.DEMOUI.syncBanner) window.DEMOUI.syncBanner(); // v11：演示模式横幅
    go("home");
    if (!CS.state.items.length) setTimeout(() => toast("录入第一条学习内容，开始记录"), 600);
  }

  return { init, go, setLayer, renderNet, renderPlan, renderAdd, renderPCMView, toast, download,
    TABS, V6_TABS, V10_TABS, V11_TABS, TOOL_TABS, RESEARCH_TABS,
    reviewFlow(id) { go("review"); REVIEW.reviewFlow(id); },
    reviewFlowV6(id) { if (window.REVIEW && REVIEW.reviewFlowV6) REVIEW.reviewFlowV6(id); else this.reviewFlow(id); } };
})();

document.addEventListener("DOMContentLoaded", APP.init);
