/* CognitionScope · protocols.js —— 硅基启发协议库 + N=1 实验设计说明（v3）
   v2：撤销「强/中证据」标签；按钮文案与实际行为对齐；置换检验降级为独立数值函数。 */
"use strict";
window.PROTO = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // 全部为「待验证假设」；硅基机制不能直接证明人类学习策略有效。
  const LIB = [
    { id: "P1", title: "滑动窗口回放", src: "SWA Bounded Replay", tr: "高强度回放最近2周所学", hook: "队列中近2周条目置顶加权" },
    { id: "P2", title: "编码态输出检验", src: "Causal Encoder-Decoder", tr: "输出只准凭记忆（盲出模式）", hook: "复习弹层默认只展示条目名" },
    { id: "P3", title: "三级复习深度", src: "Full/Reindex/Reuse", tr: "新条目全推导；稳定期只测主旨", hook: "按 mastery 自动分档" },
    { id: "P4", title: "主旨级记忆许可", src: "KV 量化", tr: "要点级记忆是否足够", hook: "主旨正确即 grade≥2" },
    { id: "P5", title: "线索依赖测试", src: "条件记忆", tr: "同知识轮换线索提取", hook: "复习时变换提问角度" },
    { id: "P6", title: "渐进负荷", src: "渐进上下文扩展", tr: "新领域先短会话多次", hook: "会话长度参考续航" },
    { id: "P7", title: "材料管道优先", src: "数据管道配方", tr: "材料数量/梯度优先于技巧微调", hook: "变式难度随掌握爬坡" },
    { id: "P8", title: "自评-修正闭环", src: "RL with self-feedback", tr: "先自评再对答案", hook: "校准引擎" },
    { id: "P9", title: "认知努力旋钮", src: "reasoning_effort", tr: "思考深度可调度", hook: "任务标注建议档位" },
    { id: "P10", title: "模块化分域学习", src: "MoE 稀疏激活", tr: "多学科按域隔离会话", hook: "会话内不混学科" }
  ];

  const DESIGN = [
    "主要结果（预注册）：延迟 7 天测验的回忆正确率，而不是当日自评等级",
    "随机化单位：条目（item），按到期日分层随机分派 A/B，保存分派表与分派时间",
    "实验周期：≥14 天，含 washout；同一 item 不得同时进入两个实验",
    "依从性：记录协议是否真正应用到该条目的复习流程；当前版本尚未接入",
    "最小有意义差异（MISD）与样本量：实验前确定，不看结果再定",
    "多重比较：多个协议并行时控制 FDR；重复测量用混合效应或置换检验",
    "分析：意向性治疗（ITT）为主，per-protocol 为辅；报告效应量与区间"
  ];

  function render() {
    const pane = $("#pane-proto");
    const enabled = PROTO_LIB();
    pane.innerHTML = `
      <div class="card"><h2>硅基启发训练协议库</h2>
        <div class="dim">协议 = 硅基机制 → 认知科学假设 → 平台参数挂点。全部标为「待验证假设」，不标注证据强度；是否有效必须由真实随机对照实验裁决。当前「启用」只写入 enabled 标志，尚未接入复习调度。</div>
        ${LIB.map(p => { const en = enabled[p.id]; return `
        <div class="card" style="margin-top:8px">
          <div class="row"><span><b>${p.id} · ${esc(p.title)}</b> <span class="badge">待验证假设</span></span>
          <span><button class="btn sm ${en ? "" : "ghost"}" data-toggle="${p.id}">${en ? "已启用（仅记录）" : "启用"}</button></span></div>
          <div class="dim">硅基：${esc(p.src)}　→　碳基：${esc(p.tr)}</div>
          <div class="dim">挂点：${esc(p.hook)}　·　裁决：<span class="mono">${esc(verdict(p.id))}</span></div>
        </div>`; }).join("")}
      </div>
      <div class="card"><h2>N=1 实验设计说明（当前不可裁决）</h2>
        <div class="dim">当前版本没有保存随机分派、协议执行依从性或延迟测验结果。用模型留存估计值做 A/B 分组会产生误导，因此不提供「一键裁决」。</div>
        <div style="margin-top:8px"><button class="btn" id="expDesign">查看预注册设计清单</button></div>
        <div id="expOut" style="margin-top:8px"></div>
      </div>`;
    pane.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => toggle(b.dataset.toggle));
    const btn = $("#expDesign");
    if (btn) btn.onclick = showDesign;
  }

  function showDesign() {
    $("#expOut").innerHTML = '<div class="card"><h3>开始实验前必须落实的 7 项</h3><ol style="margin-left:18px;line-height:1.9">' +
      DESIGN.map(d => '<li>' + esc(d) + '</li>').join("") + '</ol>' +
      '<div class="dim" style="margin-top:8px">permTest 仍作为独立数值函数导出（Fisher–Yates + Monte Carlo p 值修正），供将来实现真实随机化后调用；它现在不接收用户数据，也不产生任何协议结论。</div></div>';
  }

  function PROTO_LIB() { const m = {}; (CS.state.protocols || []).forEach(p => m[p.id] = p.enabled); return m; }
  function toggle(id) {
    const s = CS.state, rec = s.protocols.find(p => p.id === id);
    if (rec) rec.enabled = !rec.enabled; else s.protocols.push({ id, enabled: true, verdict: null });
    CS.save(); render();
  }
  function verdict(id) {
    const rec = (CS.state.protocols || []).find(p => p.id === id);
    if (!rec || !rec.verdict) return "待裁决";
    return typeof rec.verdict === "string" ? rec.verdict
      : (rec.verdict.verdict || "待裁决") + (rec.verdict.p != null ? "（p=" + rec.verdict.p + "）" : "");
  }

  /* 独立数值函数：仅用于将来真实 A/B 数据，不接当前界面 */
  function permTest(exp, perms) {
    perms = perms || 5000;
    const all = exp.A.concat(exp.B);
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const obs = mean(exp.A) - mean(exp.B);
    let extreme = 0;
    for (let k = 0; k < perms; k++) {
      const sh = all.slice();
      for (let i = sh.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sh[i], sh[j]] = [sh[j], sh[i]];
      }
      const nA = exp.A.length;
      if (Math.abs(mean(sh.slice(0, nA)) - mean(sh.slice(nA))) >= Math.abs(obs)) extreme++;
    }
    return { observed: +obs.toFixed(3), p: +((extreme + 1) / (perms + 1)).toFixed(4), n: all.length,
      verdict: "仅为给定 A/B 数值的置换检验结果；因果解释取决于真实随机化设计" };
  }

  /* ======================================================================
     v6 新增：把「启用（仅记录）」升级为可预注册的实验
     v3 的协议库只有 enabled 标志，v5 指出这是最可惜的闲置；
     v6 接上 EXP.validateRegistry / EXP.preregister，并明确「草稿 ≠ 启动」。
     ====================================================================== */
  const PREREG_FIELDS = ["experimentId", "hypothesis", "primaryOutcome", "expectedDelta",
    "MISD", "baselineDays", "interventionDays", "washoutDays", "followUpDays",
    "minimumSessionsPerCondition", "randomizationHint", "exchangeabilityAssumption",
    "stoppingRule", "analysisPlan", "source"];

  /** 由某条协议生成预注册草稿（status 恒为 draft，用户须逐项确认） */
  function createDraft(protocolId, cfg) {
    const p = LIB.find(x => x.id === protocolId);
    if (!p) return { ok: false, error: "未知协议：" + protocolId };
    const c = cfg || {};
    return {
      ok: true, autoStart: false,
      draft: {
        experimentId: "exp_" + protocolId + "_" + Date.now().toString(36),
        status: "draft", source: "protocol:" + protocolId,
        hypothesis: "若应用「" + p.title + "」（" + p.tr + "），延迟 7 天测验的已核验正确率将变化 " + (c.expectedDelta || 0.05),
        primaryOutcome: "delayed_verified_accuracy",
        secondaryOutcomes: [], expectedDelta: c.expectedDelta || 0.05, MISD: c.MISD || 0.05,
        baselineDays: 7, interventionDays: 14, washoutDays: 3, followUpDays: 7,
        minimumSessionsPerCondition: 5,
        randomizationHint: { itemLevelMeasurable: true, itemsStableOverPeriod: true, carryoverRisk: /轮换|渐进|深度/.test(p.tr) },
        exchangeabilityAssumption: "同一条目在 A/B 两条件下可重复观测，配对差值符号可交换；条目难度在条件内保持稳定",
        stoppingRule: "周期与门槛达成前禁止查看组间比较（EXP.mayRevealComparison 强制）",
        analysisPlan: "ITT 配对差值 + 符号翻转置换 + bootstrap 95% 区间",
        caveats: "单次 N=1 不可推广；协议来源为硅基启发假设，未经人群验证"
      },
      protocol: { id: p.id, title: p.title, src: p.src, tr: p.tr, hook: p.hook },
      note: "草稿写入协议库；须调用 preregisterFromProtocol 并逐项确认后才封存"
    };
  }

  /** 封存预注册；校验不过直接拒绝，不产生任何实验记录 */
  function preregisterFromProtocol(draft) {
    if (!window.EXP) return { ok: false, error: "EXP 模块未装载" };
    const r = window.EXP.preregister(draft);
    if (!r.ok) return { ok: false, errors: r.errors };
    const stored = saveExperiment(r.registry);
    return { ok: true, registry: r.registry, hash: r.hash, stored,
      note: "预注册已封存；分配表须另调 EXP.sealAssignment 一次性生成" };
  }

  /** 写入 L2 experiments 流；L2 未装载时降级到 L1 protocols（并标注降级） */
  function saveExperiment(reg) {
    if (window.CS6 && typeof window.CS6.append === "function") {
      const r = window.CS6.append("experiments", Object.assign({}, reg, { kind: "preregistration" }));
      return { layer: "L2", seq: r.record.seq };
    }
    const s = CS.state;
    s.protocols.push({ id: reg.experimentId, enabled: true, verdict: null,
      preregistrationHash: reg.preregistrationHash, degraded: true });
    CS.save();
    return { layer: "L1-degraded", note: "L2 未装载，已降级写入 L1.protocols（不建议用于正式实验）" };
  }

  function listExperiments() {
    if (window.CS6) return (window.CS6.state.experiments || []).slice();
    return (CS.state.protocols || []).filter(p => p.preregistrationHash).slice();
  }

  /** 生成分配表并封存（运行期只读） */
  function sealFromDraft(registry, itemIds, seed) {
    if (!window.EXP) return { ok: false, error: "EXP 模块未装载" };
    const a = window.EXP.sealAssignment(registry, itemIds, seed);
    if (window.CS6) window.CS6.append("assignments", Object.assign({}, a, { kind: "sealed_assignment" }));
    return { ok: true, assignment: a, note: "分配表已封存；运行期不可修改，随机序列不可事后挑选" };
  }

  return { render, permTest, LIB, DESIGN, PREREG_FIELDS,
    createDraft, preregisterFromProtocol, saveExperiment, listExperiments, sealFromDraft,
    PROTO_LIB, toggle, verdict };
})();
