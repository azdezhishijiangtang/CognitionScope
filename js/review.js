/* CognitionScope · review.js —— 今日复习：队列 + 复习弹层（v3：会话跨切页保持） */
"use strict";
window.REVIEW = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => (window.OBS && OBS.esc) ? OBS.esc(s) : String(s);
  let queue = [], idx = 0, sessionId = "s" + Date.now().toString(36), t0 = 0;
  let stats = { n: 0, ok: 0 };
  let sessionActive = false, sessionStart = Date.now();
  let lastSummary = "尚未开始";

  function paintPanel() {
    const remaining = Math.max(0, queue.length - idx);
    $("#pane-review").innerHTML = `
      <div class="card">
        <h2>今日复习队列</h2>
        <div class="row"><span>队列剩余</span><span class="mono">${remaining}</span></div>
        <div class="row"><span>会话 ID</span><span class="mono">${esc(sessionId)}</span></div>
        <div class="row"><span>会话进度</span><span class="mono" id="rvProg">${stats.n} 已答</span></div>
        <div class="warn-box">每条都要真实作答；「自评把握」在看到参考答案之前采集，用于校准元认知。评分是学习者自评，不是独立核验的正确率。</div>
        <div style="margin-top:10px"><button class="btn" id="rvStart" ${remaining ? "" : "disabled"}>${sessionActive ? "继续复习" : "开始复习"}（${remaining} 条）</button></div>
      </div>
      <div class="card"><h2>进度</h2><div id="rvBar">${lastSummary}</div></div>`;
    const btn = $("#rvStart");
    if (btn) btn.onclick = () => showNext();
  }

  function render() {
    // v2：会话进行中时切走再切回，不再重建队列、不再清零 idx
    if (sessionActive && idx < queue.length) { paintPanel(); return; }
    queue = CS.findDue().map(d => d.it);
    idx = 0;
    paintPanel();
  }

  function showNext() {
    if (idx >= queue.length) return finish();
    sessionActive = true;
    const it = queue[idx];
    const m = $("#modal");
    m.innerHTML = `<h2>先试后看 · 第 ${idx + 1}/${queue.length} 条</h2>
      <p class="dim">${esc(it.domain)} · ${esc((window.OBS && OBS.MT) ? (OBS.MT[it.mtype] || it.mtype) : it.mtype)}</p>
      <div style="margin:12px 0;font-size:16px;font-weight:600">${esc(it.content)}</div>
      <div class="dim">先独立回忆。可将回忆写在下方；信心必须在查看参考答案前选择：</div>
      <textarea id="rvResponse" rows="3" placeholder="写下你回忆出的答案（可选）"></textarea>
      <div class="choice">
        <button class="btn ghost" data-c="0">空白 0%</button>
        <button class="btn ghost" data-c="0.35">模糊 35%</button>
        <button class="btn ghost" data-c="0.7">想起大半 70%</button>
        <button class="btn ghost" data-c="0.95">轻松想起 95%</button>
      </div>`;
    $("#overlay").classList.add("on");
    t0 = performance.now();
    m.querySelectorAll("[data-c]").forEach(b => b.onclick = () => grade(parseFloat(b.dataset.c), ($("#rvResponse") || {}).value || ""));
  }

  function grade(conf, userResponse) {
    const it = queue[idx];
    const m = $("#modal");
    userResponse = (userResponse || "").trim();
    m.innerHTML = `<h2>参考答案与自评核对</h2>
      <div style="margin:10px 0"><b>题目：</b>${esc(it.content)}</div>
      ${it.answer ? `<div style="margin:10px 0"><b>参考答案：</b>${esc(it.answer)}</div>` : '<div class="dim">此条目未设置参考答案；本次评分只能视为主观自评。</div>'}
      ${it.rubric ? `<div class="dim"><b>评分标准：</b>${esc(it.rubric)}</div>` : ""}
      ${userResponse ? `<div class="dim"><b>你的回忆：</b>${esc(userResponse)}</div>` : '<div class="dim">未填写回忆文本。</div>'}
      <div class="dim">对照参考答案/评分标准后，选择实际回忆质量。无参考答案时请谨慎自评。</div>
      <div class="choice">
        <button class="btn ghost" data-g="0">想不起来</button>
        <button class="btn ghost" data-g="1">模糊</button>
        <button class="btn ghost" data-g="2">想起或背过</button>
        <button class="btn ghost" data-g="3">轻松想起</button>
      </div>`;
    m.querySelectorAll("[data-g]").forEach(b => b.onclick = () => {
      const g = parseInt(b.dataset.g, 10);
      CS.reviewItem(it.id, g, conf, performance.now() - t0, sessionId, userResponse);
      stats.n++; if (g >= 2) stats.ok++;
      idx++;
      const elapsed = (Date.now() - sessionStart) / 60000;
      $("#overlay").classList.remove("on");
      if (elapsed > 45) restModal(); else showNext();
    });
  }

  function restModal() {
    const m = $("#modal");
    m.innerHTML = `<h2>休息提示</h2><p>本次会话已超过 45 分钟。休息时长由你自行决定；平台没有证据证明此刻正确率必然下降。</p><div class="choice"><button class="btn" id="rvContinue">继续</button></div>`;
    $("#overlay").classList.add("on");
    $("#rvContinue").onclick = () => { $("#overlay").classList.remove("on"); sessionStart = Date.now(); showNext(); }; // v3：重置计时，休息提示不再每题重复
  }

  function finish() {
    sessionActive = false;
    const acc = stats.n ? stats.ok / stats.n : 0;
    $("#overlay").classList.remove("on");
    lastSummary = `<div class="row"><span>本次会话</span><span class="mono">${stats.n} 条 · 自评达标率 ${(acc * 100).toFixed(0)}%</span></div>` +
      '<div class="dim">该比例来自学习者自评，不等同于独立核验正确率。</div>';
    sessionId = "s" + Date.now().toString(36);
    stats = { n: 0, ok: 0 }; sessionStart = Date.now();
    paintPanel();
  }

  /* ======================================================================
     v6 复习流程（三段计时 + 要点核验 + 冻结预测 + 双键事务）
     与 v3 的 reviewFlow 完全分离：历史 9 项 smoke 仍走原流程，不受影响。
     ====================================================================== */
  let v6Attempt = null, v6Item = null, v6FrozenSeq = null, v6FrozenR = null, v6SessionId = null;
  const nowMs = () => (window.performance && performance.now) ? performance.now() : Date.now();

  function reviewFlowV6(id, opts) {
    const o = opts || {};
    if (!window.TIMING || !window.VERIFY || !window.PERSIST || !window.CS6) {
      if (window.APP && APP.toast) APP.toast("v6 模块未装载，已回退到 v3 复习流程");
      return reviewFlow(id);
    }
    v6Item = CS.state.items.find(i => i.id === id);
    if (!v6Item) return;
    v6SessionId = "s6_" + Date.now().toString(36);
    v6Attempt = window.TIMING.beginAttempt(id, nowMs(), { attemptId: o.attemptId });
    // ① 复习开始前冻结留存预测（此后参数变更不会重写它）
    const st = CS.stateAt(v6Item, Date.now() - 1);
    v6FrozenR = st.r;                         // 冻结的复习前留存，供校准配对使用
    const fp = window.PERSIST.commitEvent("predictions", {
      kind: "pre_review_prediction", itemId: id, t: Date.now(),
      rPred: st.r, S: st.S, dueThreshold: 0.9, context: "review_v6",
      rPredSource: "frozen"
    });
    v6FrozenSeq = fp.ok ? fp.value.seq : null;
    showRecallingV6();
  }

  function showRecallingV6() {
    const m = $("#modal"), it = v6Item;
    m.innerHTML = `<h2>v6 复习 · 先试后看</h2>
      <p class="dim">${esc(it.domain)} · ${esc((window.OBS && OBS.MT) ? (OBS.MT[it.mtype] || it.mtype) : it.mtype)}</p>
      <div style="margin:12px 0;font-size:16px;font-weight:600">${esc(it.content)}</div>
      <div class="warn-box">先在下方独立回忆，并选择「揭示前信心」。看到参考答案后，信心将被冻结且不可修改。</div>
      <textarea id="v6Response" rows="3" placeholder="写下你回忆出的答案（用于要点核验）"></textarea>
      <div class="choice">
        <button class="btn ghost" data-c6="0">空白 0%</button>
        <button class="btn ghost" data-c6="0.35">模糊 35%</button>
        <button class="btn ghost" data-c6="0.7">想起大半 70%</button>
        <button class="btn ghost" data-c6="0.95">轻松想起 95%</button>
      </div>
      <div style="margin-top:10px"><button class="btn ghost sm" id="v6Abandon">放弃本次（只记事件，不进分母）</button></div>`;
    $("#overlay").classList.add("on");
    m.querySelectorAll("[data-c6]").forEach(b => b.onclick = () => {
      try {
        v6Attempt = window.TIMING.submitRecallAndReveal(v6Attempt,
          ($("#v6Response") || {}).value || "", parseFloat(b.dataset.c6), nowMs());
        showCheckingV6();
      } catch (e) { if (window.APP) APP.toast("提交失败：" + e.message); }
    });
    const ab = $("#v6Abandon");
    if (ab) ab.onclick = () => {
      const r = window.TIMING.abandonAttempt(v6Attempt, "user_abandon", nowMs());
      if (r.event && window.PERSIST) window.PERSIST.commitEvent("timingLog",
        Object.assign({}, r.event, { itemId: v6Item.id }));
      $("#overlay").classList.remove("on");
      if (window.APP) APP.toast("已放弃：只写事件日志，不进任何正确率分母");
    };
  }

  function showCheckingV6() {
    const m = $("#modal"), it = v6Item;
    const gate = window.VERIFY.validateRubric(it);
    const kp = gate.keypoints || [];
    m.innerHTML = `<h2>参考答案与要点核验</h2>
      <div style="margin:10px 0"><b>题目：</b>${esc(it.content)}</div>
      ${it.answer ? `<div style="margin:10px 0"><b>参考答案：</b>${esc(it.answer)}</div>` : '<div class="dim">未设置参考答案。</div>'}
      ${it.rubric ? `<div class="dim"><b>评分标准：</b>${esc(it.rubric)}（版本 ${esc(it.rubricVersion || "未登记")}）</div>` : ""}
      <div class="dim"><b>你的回忆：</b>${esc(v6Attempt.userResponse || "（未填写）")}　<b>揭示前信心：</b>${v6Attempt.confidenceSelf}</div>
      ${gate.verifiable
        ? `<div class="dim" style="margin-top:8px">对照要点清单，勾选实际命中的要点（由学习者勾选，非第三方盲评）：</div>
           <div style="margin:6px 0">${kp.map((k, i) => `<label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px"><input type="checkbox" data-kp6="${i}" style="width:auto"> ${esc(k)}</label>`).join("")}</div>`
        : `<div class="warn-box">${esc(gate.note)}　本次只能自评，status=unverified，不进 A 级分母。</div>`}
      <div class="dim" style="margin-top:8px">选择实际回忆质量（gradeSelf，辅助数据）：</div>
      <div class="choice">
        <button class="btn ghost" data-g6="0">想不起来</button>
        <button class="btn ghost" data-g6="1">模糊</button>
        <button class="btn ghost" data-g6="2">想起或背过</button>
        <button class="btn ghost" data-g6="3">轻松想起</button>
      </div>`;
    $("#overlay").classList.add("on");
    m.querySelectorAll("[data-g6]").forEach(b => b.onclick = () => {
      const hits = gate.verifiable ? m.querySelectorAll("[data-kp6]:checked").length : null;
      const v = window.VERIFY.verifyReview(it, v6Attempt.userResponse,
        hits == null ? {} : { manualHits: hits });
      try {
        v6Attempt = window.TIMING.completeAttempt(v6Attempt, parseInt(b.dataset.g6, 10), v, nowMs());
        finishV6();
      } catch (e) { if (window.APP) APP.toast("完成失败：" + e.message); }
    });
  }

  function finishV6() {
    const p = window.CS6.ensure().paramVersion;
    const rec = window.TIMING.toReviewRecord(v6Attempt, {
      t: Date.now(), sessionId: v6SessionId, paramVersion: p
    });
    const y = window.VERIFY.yFromVerification(rec.verification);
    const specs = [
      { stream: "events", record: {
          kind: "review_outcome", itemId: v6Item.id, t: rec.t,
          r: Number.isFinite(v6FrozenR) ? v6FrozenR : null,   // 用冻结预测，绝不现算
          y: y == null ? (rec.gradeSelf >= 2 ? 1 : 0) : y,
          ySource: rec.verification.status === "verified" ? "verified" : "self",
          src: "review", srcRef: v6FrozenSeq != null ? "predictions#" + v6FrozenSeq : null,
          rPredSource: "frozen", verificationStatus: rec.verification.status } },
      { stream: "timingLog", record: {
          itemId: v6Item.id, t: rec.t, state: "completed",
          attemptId: rec.attemptId, elapsedMs: rec.recallDurationMs,
          note: "recallDurationMs 不含核对与评分" } },
      { stream: "verificationLog", record: {
          itemId: v6Item.id, t: rec.t, status: rec.verification.status,
          method: rec.verification.method || null,
          rubricVersion: rec.verification.rubricVersion || null,
          outcome: rec.verification.outcome || null,
          hitKeypoints: rec.verification.hitKeypoints || null,
          totalKeypoints: rec.verification.totalKeypoints || null } }
    ];
    const r = window.PERSIST.commitBoth(draft => {
      const target = draft.items.find(x => x.id === v6Item.id);
      if (target) target.reviews.push(rec);
    }, specs, { paramVersion: p });
    $("#overlay").classList.remove("on");
    if (!r.ok) {
      if (window.APP) APP.toast("写入失败并已回滚：" + r.error.message);
      return;
    }
    if (window.APP) {
      APP.toast("已记录（" + (rec.verification.status === "verified" ? "已核验" : "自评") + "，双键事务）");
      if (OBS.ticker) OBS.ticker();
    }
  }

  return { render, reviewFlow(id) {
    const found = CS.state.items.find(i => i.id === id); if (!found) return;
    // v3：单条复习也开新会话——重置计数、会话 ID 与起始时间，避免继承上一会话的统计虚高
    queue = [found]; idx = 0; sessionActive = true;
    sessionId = "s" + Date.now().toString(36);
    stats = { n: 0, ok: 0 }; sessionStart = Date.now();
    showNext();
  }, reviewFlowV6 };
})();
