/* CognitionScope · js/demo-ui.js —— 示例内容馆（v11）
 * 职责：① 只读浏览示例内容包（学科 / 难度 / 关键词筛选、分层提示、要点与错因）
 *       ② 显式「载入示例 / 清除示例 / 导出示例包」三个动作
 *       ③ 全站「演示模式」横幅：提醒哪些数字不计入个人证据
 *
 * 纪律：不读取 L1/L2 的个人记录（只读条目数量与演示标记）、不发起 fetch、
 *       不写 localStorage（load/clear 由 CS.save() 落盘，且只写带演示标记的条目）。
 *       所有 DOM 操作限制在 #pane-demo 与 #demoBanner 内。
 */
"use strict";
window.DEMOUI = (function () {
  const VERSION = "demo-ui/11.0";
  const D = () => window.DEMO;
  const filter = { q: "", domain: "全部", diff: 0, open: new Set(), hint: new Map() };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const $ = s => document.querySelector ? document.querySelector(s) : null;

  /* ---------------- 状态条 ---------------- */
  function statusHTML() {
    const st = D().status(window.CS && window.CS.state);
    const badge = st.loaded
      ? '<span class="badge w">演示模式已开启</span>'
      : '<span class="badge g">未载入 · 你的数据保持原样</span>';
    const n = st.loaded
      ? `库中有 <b>${st.count}</b> 条示例内容，另有 <b>${st.realCount}</b> 条你自己的条目。`
      : `示例包共 <b>${st.total}</b> 条内容，全部是本项目原创编写的示例，默认不写入你的任何数据。`;
    return `<div class="card demo-status">
      <div class="demo-status-head"><h2>示例内容馆 ${badge}</h2>
        <span class="dim">${esc(D().VERSION)} · ${esc(D().META.origin)}</span></div>
      <p class="demo-lead">这个平台以前打开是空的：检索没东西可搜、知识网络没节点、复习队列也是空的。这里放一批<b>带答案、要点、常见错误和分层提示</b>的示例，让你先看清每个功能到底怎么用。</p>
      <p class="dim">${n}</p>
      <div class="demo-actions">
        <button class="btn" id="demoLoad">载入示例到我的库</button>
        <button class="btn ghost" id="demoClear"${st.loaded ? "" : " disabled"}>清除我载入的示例</button>
        <button class="btn ghost" id="demoExport">只导出示例包（不含我的数据）</button>
      </div>
      <div class="warn-box">载入是<b>你主动点才会发生</b>的动作。载入后示例会出现在概览卡、复习队列、未来负荷图和知识网络里方便试用（这些数字不代表你的学习情况），但<b>不会</b>计入经验正确率、个人学习数据档案（PCM），也不会出现在任何导出包里。「清除示例」只删带演示标记的条目，你自己记的内容一条都不动。演示期间若做了复习，由此产生的事件会按 append-only 规则留在流水账里，不可抹除。</div>
    </div>`;
  }

  /* ---------------- 字段映射说明（专业性 + 白话） ---------------- */
  function mappingHTML() {
    const rows = [
      ["题目 / 提示", "录入页的「题目/提示」", "当成一条要回忆的卡片"],
      ["参考答案", "录入页的「参考答案」", "先自己想，再对答案"],
      ["评分标准 rubric", "要点核验的判分依据", "知道「答到什么程度算对」"],
      ["要点清单 keypoints", "A 级客观正确率的要点库", "一条条数命中了几个要点"],
      ["常见错误 / 错因", "复习答错时的归因选项", "知道自己错在哪一类，不只是「错了」"],
      ["分层提示 hints", "「先试后看」的渐进提示", "卡住时一次给一条，不直接剧透"],
      ["前置 / 关联边", "知识网络的初始关系", "一打开就有一张真实结构的图"],
      ["课程 → 章节 → 知识点", "学科分类词表", "录入时不用再手打自由文本"]
    ];
    return `<div class="card"><h2>这些字段对应平台里的什么</h2>
      <div class="dim">示例包不是随便塞的一堆题目，它的字段是照着平台已有的能力对齐的。</div>
      <table class="demo-map"><thead><tr><th>示例里的字段</th><th>平台里对应</th><th>你能拿它做什么</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td class="mono">${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}</tbody></table>
    </div>`;
  }

  /* ---------------- 筛选工具条 ---------------- */
  function toolsHTML() {
    const domains = ["全部"].concat(D().DOMAINS.map(x => x.id));
    const dchips = domains.map(x =>
      `<button type="button" class="cat-chip${filter.domain === x ? " on" : ""}" data-demo-domain="${esc(x)}">${esc(x)}</button>`).join("");
    const lvl = ["全部难度", 1, 2, 3, 4, 5].map((x, i) =>
      `<button type="button" class="cat-chip${filter.diff === (i ? i : 0) ? " on" : ""}" data-demo-diff="${i}">${esc(typeof x === "number" ? "难度 " + x : x)}</button>`).join("");
    return `<div class="card"><h2>挑一挑想看的内容</h2>
      <div class="demo-tools">
        <input class="inp demo-search" id="demoQ" type="search" placeholder="搜题目、要点、错因，例如：因果 / 极限 / 充要" value="${esc(filter.q)}">
        <span class="dim" id="demoCount"></span>
      </div>
      <div class="cat-chips">${dchips}</div>
      <div class="cat-chips">${lvl}</div>
      <div class="glos-tip">学科词表共 ${D().DOMAINS.length} 类，由示例包统一登记；录入页也用同一份词表，不再只靠手打。</div>
    </div>`;
  }

  /* ---------------- 条目卡片 ---------------- */
  function cardHTML(d) {
    const open = filter.open.has(d.id);
    const step = filter.hint.get(d.id) || 0;
    const errNames = (d.errorTypes || []).map(e => {
      const t = D().ERROR_TYPES.find(x => x.id === e);
      return `<span class="demo-tag" title="${t ? esc(t.plain) : ""}">${esc(e)}</span>`;
    }).join("");
    const body = open ? `<div class="demo-card-body">
      <div class="demo-field"><span>参考答案</span><p>${esc(d.answer)}</p></div>
      <div class="demo-field"><span>评分标准</span><p>${esc(d.rubric)}</p></div>
      <div class="demo-field"><span>要点清单（命中几条可核验）</span><ul>${(d.keypoints || []).map(k => "<li>" + esc(k) + "</li>").join("")}</ul></div>
      <div class="demo-field"><span>常见错误</span><ul>${(d.commonErrors || []).map(k => "<li>" + esc(k) + "</li>").join("")}</ul>
        <div class="demo-tags">错因分类：${errNames || "—"}</div></div>
      <div class="demo-field"><span>分层提示（卡住时一条一条看）</span>
        ${(d.hints || []).slice(0, step).map((h, i) => `<p class="demo-hint"><b>提示 ${i + 1}</b>　${esc(h)}</p>`).join("") || '<p class="dim">还没展开提示。下面的按钮一次只给一条。</p>'}
        ${step < (d.hints || []).length ? `<button type="button" class="btn ghost sm" data-demo-hint="${esc(d.id)}">再来一条提示（${step}/${d.hints.length}）</button>` : '<span class="dim">提示已全部给出。</span>'}
      </div>
      <div class="demo-field"><span>关系</span><p class="dim">前置：${(d.prereq || []).map(esc).join("、") || "无"}　·　关联：${(d.relates || []).map(esc).join("、") || "无"}</p></div>
    </div>` : "";
    return `<article class="demo-card${open ? " open" : ""}" data-demo-card="${esc(d.id)}">
      <button type="button" class="demo-card-head" data-demo-toggle="${esc(d.id)}">
        <span class="demo-card-lv">难度 ${d.difficulty}</span>
        <span class="demo-card-domain">${esc(d.domain)} · ${esc(d.chapter)}</span>
        <span class="demo-card-q">${esc(d.content)}</span>
        <span class="demo-card-more">${open ? "收起" : "展开答案 / 要点 / 提示"} →</span>
      </button>${body}</article>`;
  }

  function listHTML() {
    const rows = D().catalog(filter.q, filter.domain, filter.diff);
    const count = rows.length;
    // 计数在渲染后回填，避免模板里重复计算
    setTimeout(() => { const c = $("#demoCount"); if (c) c.textContent = `显示 ${count} / ${D().ITEMS.length} 条`; }, 0);
    return `<div class="card"><h2>示例条目</h2>
      <div class="dim">共 ${count} 条。点开任意一条可看答案、要点、常见错因，以及逐条给出的分层提示。</div>
      <div class="demo-list">${rows.map(cardHTML).join("") ||
        '<div class="empty">没有匹配的内容，换个词或点「全部」。</div>'}</div>
    </div>`;
  }

  /* ---------------- 知识网络预览（确定性布局） ---------------- */
  function graphHTML() {
    const rows = D().catalog(filter.q, filter.domain, filter.diff);
    if (!window.SEARCH || !rows.length)
      return '<div class="card"><h2>示例知识网络</h2><div class="dim">当前筛选没有可绘制的条目。</div></div>';
    const g = window.SEARCH.graphLayout(rows, { iterations: 32 });
    const W = 720, H = 260, pad = 22;
    const px = n => pad + n.x * (W - 2 * pad), py = n => pad + n.y * (H - 2 * pad);
    const pos = new Map(g.nodes.map(n => [n.id, n]));
    const lines = g.edges.map(e => {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) return "";
      return `<line x1="${px(a).toFixed(1)}" y1="${py(a).toFixed(1)}" x2="${px(b).toFixed(1)}" y2="${py(b).toFixed(1)}" stroke="var(--line2)" stroke-width="1"/>`;
    }).join("");
    const dots = g.nodes.map(n => {
      const r = 4 + Math.min(5, n.degree);
      return `<circle cx="${px(n).toFixed(1)}" cy="${py(n).toFixed(1)}" r="${r}" fill="var(--acc2)" opacity=".82"><title>${esc(n.label)}</title></circle>`;
    }).join("");
    return `<div class="card"><h2>示例知识网络预览</h2>
      <div class="dim">${g.nodes.length} 个节点 / ${g.edges.length} 条边。边来自示例条目登记的前置与关联关系，不是随机连线；坐标是确定性布局，只用于看清结构，不表示语义距离或统计结论。</div>
      <svg viewBox="0 0 ${W} ${H}" class="demo-graph" role="img" aria-label="示例知识网络预览">${lines}${dots}</svg>
      <div class="dim">载入示例后，「知识网络」页会显示同一批关系（可在那里继续手动连边）。</div>
    </div>`;
  }

  /* ---------------- 来源与版权 ---------------- */
  function creditHTML() {
    const m = D().META;
    return `<div class="card demo-credit"><h2>内容与版权说明</h2>
      <p>${esc(m.attribution)}</p>
      <p class="dim">${esc(m.license)}</p>
      <p class="dim">${esc(m.note)} 示例文本不构成学习成效证据，也不作为认知能力常模使用；平台「实验室」页的常模占位仍保持无来源状态。</p>
      <p class="dim">完整说明见交付包根目录的 <span class="mono">ATTRIBUTION.md</span>。</p>
    </div>`;
  }

  function render() {
    const pane = $("#pane-demo");
    if (!pane) return;
    pane.innerHTML = `<div class="demo-page" data-demo-page>
      ${statusHTML()}${mappingHTML()}${toolsHTML()}${listHTML()}${graphHTML()}${creditHTML()}
    </div>`;
    bind();
    // 本页任意筛选 / 展开都会重渲染 pane，会覆盖 go() 插入的页首说明卡；
    // 这里补挂一次（PLAIN.mount 先移除旧卡再插入，幂等），保证白话说明不丢失。
    if (window.PLAIN && window.PLAIN.mount) window.PLAIN.mount("demo", pane);
    syncBanner();
  }

  function bind() {
    const pane = $("#pane-demo");
    if (!pane || !pane.querySelectorAll) return;
    const on = (sel, fn) => Array.prototype.forEach.call(pane.querySelectorAll(sel), el => { el.onclick = fn; });
    on("[data-demo-toggle]", e => {
      const id = e.currentTarget.getAttribute("data-demo-toggle");
      if (filter.open.has(id)) filter.open.delete(id); else filter.open.add(id);
      render();
    });
    on("[data-demo-hint]", e => {
      const id = e.currentTarget.getAttribute("data-demo-hint");
      const d = D().byId(id);
      const max = d ? d.hints.length : 0;
      filter.hint.set(id, Math.min(max, (filter.hint.get(id) || 0) + 1));
      filter.open.add(id);
      render();
    });
    on("[data-demo-domain]", e => { filter.domain = e.currentTarget.getAttribute("data-demo-domain"); render(); });
    on("[data-demo-diff]", e => { filter.diff = +(e.currentTarget.getAttribute("data-demo-diff") || 0); render(); });
    const q = $("#demoQ");
    if (q) q.oninput = () => {
      filter.q = q.value;
      // 只重渲染列表与图谱，保留输入框焦点
      const page = pane.querySelector("[data-demo-page]");
      if (page) {
        const cards = page.querySelectorAll(".card");
        // 定位到「示例条目」与「示例知识网络」两张卡并替换
        Array.prototype.forEach.call(cards, c => {
          if (/示例条目<\/h2>/.test(c.innerHTML)) c.outerHTML = listHTML();
          else if (/示例知识网络预览<\/h2>/.test(c.innerHTML)) c.outerHTML = graphHTML();
        });
        const again = $("#demoQ");
        if (again && again.focus) { again.focus(); try { again.setSelectionRange(filter.q.length, filter.q.length); } catch (_) {} }
        bind();
      }
    };
    const b1 = $("#demoLoad"), b2 = $("#demoClear"), b3 = $("#demoExport");
    if (b1) b1.onclick = loadAll;
    if (b2) b2.onclick = clearAll;
    if (b3) b3.onclick = () => {
      if (window.APP && window.APP.download) window.APP.download("cognitionscope-demo-pack.json", D().exportPack());
    };
  }

  function loadAll() {
    if (!window.CS || !window.CS.state) return;
    const r = D().load(window.CS.state);
    if (r.writeRequired) window.CS.save();
    if (window.APP && window.APP.toast)
      window.APP.toast(r.added ? `已载入 ${r.added} 条示例（可随时清除）` : "示例已经在库里了，无需重复载入");
    render(); syncBanner();
    if (window.OBS && window.OBS.ticker) window.OBS.ticker();
    return r;
  }

  function clearAll() {
    if (!window.CS || !window.CS.state) return;
    const r = D().clear(window.CS.state);
    if (r.writeRequired) window.CS.save();
    if (window.APP && window.APP.toast)
      window.APP.toast(r.removed ? `已清除 ${r.removed} 条示例，你自己的内容保持不变` : "库里没有示例内容");
    render(); syncBanner();
    if (window.OBS && window.OBS.ticker) window.OBS.ticker();
    return r;
  }

  /** 全站横幅：任何页面都能看到「当前是演示模式」 */
  function syncBanner() {
    const b = $("#demoBanner");
    if (!b) return;
    const st = D().status(window.CS && window.CS.state);
    if (!st.loaded) { b.hidden = true; b.innerHTML = ""; return; }
    b.hidden = false;
    b.innerHTML = `<span class="demo-banner-tag">演示模式</span>
      <span>库中有 <b>${st.count}</b> 条示例内容。它们会出现在概览卡、复习队列和知识网络里方便试用，但<b>不计入</b>经验正确率、个人学习数据档案，也不会出现在导出包里；这些数字不代表你的学习情况。</span>
      <button type="button" class="btn ghost sm" id="demoBannerGo">去示例内容馆</button>
      <button type="button" class="btn ghost sm" id="demoBannerClear">一键清除</button>`;
    const go = $("#demoBannerGo"), cl = $("#demoBannerClear");
    if (go) go.onclick = () => { if (window.APP && window.APP.go) window.APP.go("demo"); };
    if (cl) cl.onclick = clearAll;
  }

  return { VERSION, render, syncBanner, loadAll, clearAll, statusHTML, mappingHTML,
    toolsHTML, listHTML, graphHTML, creditHTML, filter };
})();
