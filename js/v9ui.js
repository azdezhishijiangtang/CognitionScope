/* CognitionScope · v9 研究层页面装配（检索/回放、方法与完整性）
 * 只做 DOM 呈现与交互，全部计算委托给纯模块。模块缺失时优雅降级，不抛错。
 * 不读取 L1/L2 之外的任何外部数据；AI 口令只在本页内存使用，绝不持久化。
 */
"use strict";
window.V9UI = (function () {
  const VERSION = "v9ui/9.0";
  const $ = s => document.querySelector(s);
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function has(k) { return !!window[k]; }
  function toast(m) { if (window.APP && APP.toast) APP.toast(m); }
  function box(title, body) { return `<div class="card"><h2>${esc(title)}</h2>${body}</div>`; }
  function warn(t) { return `<div class="warn-box">${esc(t)}</div>`; }
  function missing(names) {
    return box("模块未装载", warn("以下模块不可用：" + names.join("、") + "。请检查 index.html 脚本顺序；历史页面不受影响。"));
  }
  function download(name, text) {
    if (window.APP && APP.download) return APP.download(name, text);
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function stateNow() {
    return (window.CS && CS.state) ? CS.state : { items: [] };
  }

  /* ---------------- 检索与回放 ---------------- */
  function renderFind() {
    const pane = $("#pane-find"); if (!pane) return;
    const need = ["SEARCH", "SNAP", "REPLAY"].filter(k => !has(k));
    let h = box("本地检索与知识图谱", `<div class="dim">索引只在当前页面内存构建，不产生任何网络请求。中英文混合分词 + BM25；图谱坐标是确定性布局，仅用于可视化。</div>
      <div class="row" style="margin-top:10px"><input class="inp" id="v9q" placeholder="输入关键词，例如：间隔重复 / retrieval"><button class="btn" id="v9Search">检索</button></div>
      <div id="v9Results" class="dim" style="margin-top:8px">（等待检索）</div>
      <div id="v9GraphWrap" style="margin-top:10px"></div>`);
    h += box("环形快照与时间旅行", `<div class="dim">回滚只恢复 L1 主状态；L2 事件层 append-only 不回滚，恢复动作记为 audit 事件。摘要仅检测意外损坏。</div>
      <div class="row" style="margin-top:10px"><button class="btn" id="v9SnapNew">创建快照</button><span class="dim" id="v9SnapCount"></span></div>
      <div id="v9SnapList" class="dim" style="margin-top:8px">（无快照）</div>`);
    h += box("导出包浏览器端回放", `<div class="dim">只读回放：解析 → manifest 复算 → 脱敏复核 → 与当前状态差异。不写入当前存储、不修改 L1/L2、不联网。</div>
      <div class="row" style="margin-top:10px"><input type="file" id="v9File" accept=".json,.txt" class="inp"><button class="btn" id="v9Replay">回放校验</button></div>
      <div id="v9ReplayOut" class="mono" style="white-space:pre-wrap;margin-top:8px">（等待选择导出包）</div>`);
    pane.innerHTML = need.length ? missing(need) : h;
    if (need.length) return;

    const items = stateNow().items || [];
    const index = SEARCH.buildIndex(items);
    $("#v9Search").onclick = () => {
      const q = $("#v9q").value;
      const res = SEARCH.search(index, q, { limit: 20 });
      $("#v9Results").innerHTML = res.length
        ? res.map(r => `<div class="row"><span>[${esc(r.domain)}] ${esc(r.snippet)}</span><span class="badge">${r.score}</span></div>`).join("")
        : `<div class="dim">无匹配（索引 ${index.N} 条）。换个关键词再试。</div>`;
    };
    const g = SEARCH.graphLayout(items, { iterations: 40 });
    if (g.nodes.length) {
      const W = 560, H = 220, P = 18;
      const px = n => (P + n.x * (W - 2 * P)).toFixed(1), py = n => (P + n.y * (H - 2 * P)).toFixed(1);
      const pos = Object.fromEntries(g.nodes.map(n => [n.id, n]));
      const lines = g.edges.map(e => `<line x1="${px(pos[e.from])}" y1="${py(pos[e.from])}" x2="${px(pos[e.to])}" y2="${py(pos[e.to])}" stroke="#3B82F6" stroke-width="1" opacity=".55"/>`).join("");
      const dots = g.nodes.map(n => `<circle cx="${px(n)}" cy="${py(n)}" r="${3 + Math.min(5, n.degree)}" fill="#61AB83"/><title>${esc(n.label)}</title>`).join("");
      $("#v9GraphWrap").innerHTML = `<div class="dim">节点 ${g.nodes.length} · 关系 ${g.edges.length} · 确定性布局</div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:220px;background:#121A2B;border-radius:8px">${lines}${dots}</svg>`;
    } else $("#v9GraphWrap").innerHTML = `<div class="dim">录入条目后显示关系图。</div>`;

    function snapList() {
      const list = SNAP.loadAll();
      $("#v9SnapCount").textContent = `已保存 ${list.length} / ${SNAP.DEFAULT_CAP} 份`;
      $("#v9SnapList").innerHTML = list.length ? list.slice().reverse().map((s, i) =>
        `<div class="row"><span>${esc(s.label)} · ${new Date(s.at).toLocaleString()} · ${s.nItems} 条</span>
         <button class="btn ghost sm" data-snap="${list.length - 1 - i}">恢复 L1</button></div>`).join("")
        : `<div class="dim">（无快照）</div>`;
      $("#v9SnapList").querySelectorAll("button[data-snap]").forEach(b => b.onclick = () => {
        const rec = list[+b.dataset.snap];
        if (!rec || !window.PERSIST) { toast("PERSIST 不可用，未执行恢复"); return; }
        if (!confirm("确认恢复该快照？仅 L1 主状态回滚，L2 事件层保持不变。")) return;
        const r = SNAP.restore(rec, PERSIST, window.CS6);
        toast(r.ok ? "已恢复 L1（L2 未回滚）" : ("恢复失败：" + r.reason));
        if (r.ok) setTimeout(() => window.APP && APP.go("find"), 300);
      });
    }
    $("#v9SnapNew").onclick = () => {
      const l2 = window.CS6 ? CS6.stats() : {};
      const rec = SNAP.capture(stateNow(), l2, { label: "手动快照" });
      const list = SNAP.push(SNAP.loadAll(), rec, SNAP.DEFAULT_CAP);
      const w = SNAP.saveWithEviction(list);
      if (!w.ok) { toast("快照写入失败（存储配额不足，已淘汰全部仍无法写入）"); return; }
      toast(w.dropped ? `已创建快照；配额不足，自动淘汰 ${w.dropped} 份最旧快照` : "已创建快照");
      snapList();
    };
    snapList();

    $("#v9Replay").onclick = () => {
      const f = $("#v9File").files && $("#v9File").files[0];
      if (!f) { toast("请先选择导出包"); return; }
      const rd = new FileReader();
      rd.onload = () => {
        const r = REPLAY.replay(String(rd.result), stateNow());
        $("#v9ReplayOut").textContent = r.ok === false && r.stage !== "verified"
          ? `回放中止（${r.stage}）：${r.reason}`
          : [`结论：${r.ok ? "包内自洽" : "存在校验失败"}`,
             `失败项：${(r.summary.failedChecks || []).join("、") || "无"}`,
             `manifest 复算：${r.checks.manifest.ok === null ? "未提供" : r.checks.manifest.ok}`,
             `脱敏复核：${r.checks.redaction.ok === null ? "未提供" : r.checks.redaction.ok}`,
             `链完整性：${r.checks.chain.ok === null ? "未提供" : r.checks.chain.ok}`,
             `条目数：${r.summary.nItems}`,
             `差异：新增 ${r.diff ? r.diff.added.length : "-"} / 删除 ${r.diff ? r.diff.removed.length : "-"} / 变更 ${r.diff ? r.diff.changed.length : "-"}`,
             "", ...r.report].join("\n");
      };
      rd.onerror = () => { $("#v9ReplayOut").textContent = "文件读取失败"; };
      rd.readAsText(f);
    };
  }

  /* ---------------- 方法与完整性 ---------------- */
  function renderMethods() {
    const pane = $("#pane-methods"); if (!pane) return;
    const need = ["INTEGRITY", "SENS", "SCED"].filter(k => !has(k));
    const av = has("INTEGRITY") ? INTEGRITY.available() : { ok: false, note: "模块未装载" };
    let h = box("完整性锚点（HMAC-SHA256 / PBKDF2）", `<div class="dim">把本地 FNV 链升级为「无口令者无法重签」的外部锚点。${esc(av.note)}</div>
      <div class="row" style="margin-top:10px"><span>口令（≥8 位，不保存）</span><input class="inp" id="v9Pass" type="password" autocomplete="off" placeholder="仅本次使用"></div>
      <div class="row"><button class="btn" id="v9Seal">生成锚点</button><button class="btn ghost" id="v9Verify">校验当前链</button></div>
      <div id="v9AnchorOut" class="mono" style="white-space:pre-wrap;margin-top:8px">${esc(av.ok ? "（等待生成）" : "Web Crypto 不可用：密封功能拒绝降级为弱校验")}</div>
      ${warn("锚点必须保存到本设备之外才有意义。页面可被本地替换、口令可被截获；这不是密码学防伪，不建立信任根。")}`);
    h += box("缺失数据敏感性分析", `<div class="dim">基于 L2 试验事件，对不完整配对做 best/worst 边界与 tipping-point 扫描。</div>
      <div class="row" style="margin-top:10px"><button class="btn" id="v9Sens">运行分析</button></div>
      <div id="v9SensOut" class="mono" style="white-space:pre-wrap;margin-top:8px">（等待运行）</div>
      ${warn("敏感性分析只量化结论稳健性，不修复或插补缺失数据，也不能把 complete-case 结果改称完整 ITT。")}`);
    h += box("N=1 单案例统计（SCED）", `<div class="dim">随机化检验、百分位 bootstrap CI、NAP、lag-1 自相关。全部结果只描述该个体、该观测窗。</div>
      <div class="row" style="margin-top:10px"><button class="btn" id="v9Sced">生成报告</button></div>
      <div id="v9ScedOut" class="mono" style="white-space:pre-wrap;margin-top:8px">（等待运行）</div>`);
    h += box("运行时能力自检", `<div class="dim">目标设备自检，用于替代「声称已完成三浏览器兼容矩阵」。未在本仓库实测 Firefox / Safari / WebKit。</div>
      <div id="v9Caps" class="mono" style="white-space:pre-wrap;margin-top:8px"></div>`);
    pane.innerHTML = need.length ? missing(need) : h;
    if (need.length) return;

    const caps = [
      ["localStorage", (() => { try { localStorage.setItem("__cs9", "1"); localStorage.removeItem("__cs9"); return true; } catch (_) { return false; } })()],
      ["Web Crypto subtle", !!(window.crypto && crypto.subtle)],
      ["ReadableStream", typeof ReadableStream === "function"],
      ["TextDecoder", typeof TextDecoder === "function"],
      ["AbortController", typeof AbortController === "function"],
      ["FileReader", typeof FileReader === "function"],
      ["structuredClone", typeof structuredClone === "function"],
      ["SVG (createElementNS)", !!(document.createElementNS)]
    ];
    $("#v9Caps").textContent = caps.map(([k, v]) => `${v ? "✓" : "✗"} ${k}${v ? "" : "（相关功能将降级或不可用）"}`).join("\n") +
      "\n\n说明：这是当前浏览器的能力探测，不构成跨浏览器兼容矩阵；请在目标设备上逐项复核。";

    let anchor = null;
    function snapshot() { return window.CS6 ? INTEGRITY.fromCS6(CS6) : { note: "CS6 未装载" }; }
    $("#v9Seal").onclick = async () => {
      const out = $("#v9AnchorOut"), pass = $("#v9Pass").value;
      if (!av.ok) { out.textContent = "Web Crypto 不可用，拒绝降级"; return; }
      out.textContent = "正在派生密钥…";
      const r = await INTEGRITY.seal(snapshot(), pass, { label: "L2 链锚点" });
      $("#v9Pass").value = "";
      if (!r.ok) { out.textContent = "生成失败：" + r.reason; return; }
      anchor = r.anchor;
      out.textContent = `格式：${anchor.format}\n算法：${anchor.algo} / ${anchor.kdf}（${anchor.iterations} 次迭代）\n时间：${new Date(anchor.sealedAt).toLocaleString()}\nMAC：${anchor.mac}\n摘要长度：${anchor.payload.length}\n\n${anchor.externalAction}\n\n${anchor.humanNote}`;
      download("cognitionscope-anchor.json", JSON.stringify(anchor, null, 2));
      toast("锚点已生成并导出，请保存到本设备之外");
    };
    $("#v9Verify").onclick = async () => {
      const out = $("#v9AnchorOut"), pass = $("#v9Pass").value;
      if (!anchor) { out.textContent = "请先生成锚点（或在同一页面内生成后校验）"; return; }
      const r = await INTEGRITY.verify(anchor, snapshot(), pass);
      $("#v9Pass").value = "";
      out.textContent = (r.ok ? "校验通过：" : "校验失败：") + r.reason + "\n\n" + (r.humanNote || "");
    };

    function events() {
      if (!window.CS6) return [];
      try { const st = CS6.state; return st && Array.isArray(st.trialEvents) ? st.trialEvents : []; }
      catch (_) { return []; }
    }
    $("#v9Sens").onclick = () => {
      const evs = events();
      const itt = window.EXP ? EXP.ittPairs(evs) : { pairs: [], incomplete: [] };
      const r = SENS.analyze(itt);
      $("#v9SensOut").textContent = [
        `完整配对 ${r.nComplete} · 不完整配对 ${r.nIncomplete} · 缺失率 ${r.missingRate}`,
        `complete-case 效应：${r.completeCase}`,
        `best / worst 边界：${r.bounds.best} / ${r.bounds.worst}（观测范围 ${r.bounds.lo}~${r.bounds.hi}）`,
        `tipping point：${r.tippingPoint === null ? "扫描范围内未翻转" : r.tippingPoint}`,
        `稳健：${r.robust}`, `结论：${r.verdict}`, "", r.note
      ].join("\n");
    };
    $("#v9Sced").onclick = () => {
      const evs = events();
      const series = evs.filter(e => e && Number.isFinite(e.value))
        .map(e => ({ phase: e.conditionId === "A" ? "A" : "B", value: e.value }));
      const r = SCED.report(series, { iterations: 1000 });
      const t = r.randomizationTest, ci = r.effectCI;
      $("#v9ScedOut").textContent = [
        `范围：${r.scope}`, `A 期 ${r.nA} 点 · B 期 ${r.nB} 点`,
        `随机化检验：${t.status} · 观测差 ${t.observed} · p ${t.p} · ${t.method || ""}`,
        `均值 bootstrap CI：${ci.ci ? ci.ci.join(" ~ ") : "样本不足"}（${ci.level} 水平）`,
        `NAP：${r.nap} · lag-1 自相关：${r.lag1}`, "",
        ...r.readingGuide
      ].join("\n");
    };
  }

  function render(tab) {
    if (tab === "find") renderFind();
    else if (tab === "methods") renderMethods();
  }
  return { VERSION, render, renderFind, renderMethods };
})();
