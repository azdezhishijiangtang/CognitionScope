/* CognitionScope · hypothesis.js —— 可检验假设卡（v6）
 * ============================================================================
 * v5 建议：AI 从「给一段流畅建议」改成「生成可证伪的假设」。
 * 本模块把 AI 输出约束为结构化假设卡，并在进入协议库之前做硬校验：
 *   若做 X → 主要结局 Y 预计变化 Z → 用 signFlipPermutation 检验
 *
 * 硬约束：
 *   - 只能引用 brief 中真实存在的字段（防编造）
 *   - 主要结局必须在预注册允许值内，且唯一
 *   - expectedDelta 必须 ≥ MISD，horizonDays 有界
 *   - 必须声明交换性前提与局限
 *   - 校验通过只生成 protocol 草稿，绝不自动创建或启动实验
 *   - 不提供「AI 已证明有效」这类结论措辞
 */
"use strict";
(function () {
  const VERSION = "hypothesis/6.0";
  const HYP_TOP = ["refFields", "intervention", "primaryOutcome", "expectedDelta",
    "horizonDays", "test", "assumption", "caveat", "secondaryOutcomes", "rationale"];
  const ALLOWED_OUTCOMES = ["delayed_verified_accuracy", "recallDurationMs",
    "selfRatedPassRate", "verifiedAccuracy"];
  const ALLOWED_TESTS = ["signFlipPermutation"];
  const BANNED_PHRASES = [/已证明/, /显著提升能力/, /一定有效/, /保证/, /智力/, /诊断/];

  /** 校验假设卡；briefFields 为本次外发 brief 的字段清单 */
  function validateHypothesis(card, briefFields, cfg) {
    const c = Object.assign({ MISD: 0.05, maxHorizonDays: 90 }, cfg || {});
    const errors = [], warnings = [];
    if (!card || typeof card !== "object" || Array.isArray(card)) return { ok: false, errors: ["假设卡不是对象"] };
    const unknown = Object.keys(card).filter(k => !HYP_TOP.includes(k));
    if (unknown.length) errors.push("含未知字段：" + unknown.join(","));
    const fields = briefFields || [];
    for (const f of card.refFields || []) {
      if (typeof f !== "string") { errors.push("refFields 含非字符串"); continue; }
      if (!fields.includes(f)) errors.push("引用了 brief 中不存在的字段：" + f);
    }
    if (!(card.refFields || []).length) warnings.push("未引用任何 brief 字段：假设可能无数据依据");
    if (typeof card.intervention !== "string" || !card.intervention.trim() || card.intervention.length > 300)
      errors.push("intervention 缺失/过长");
    if (!ALLOWED_OUTCOMES.includes(card.primaryOutcome))
      errors.push("主要结局不在预注册允许值内：" + card.primaryOutcome);
    if (!Number.isFinite(card.expectedDelta) || Math.abs(card.expectedDelta) < c.MISD)
      errors.push("expectedDelta 须为有限数且绝对值 ≥ MISD(" + c.MISD + ")");
    if (!Number.isInteger(card.horizonDays) || card.horizonDays < 1 || card.horizonDays > c.maxHorizonDays)
      errors.push("horizonDays 越界（1–" + c.maxHorizonDays + "）");
    if (!ALLOWED_TESTS.includes(card.test)) errors.push("未指定与交换性匹配的检验：" + card.test);
    if (!card.assumption || String(card.assumption).length < 10) errors.push("缺交换性前提声明");
    if (!card.caveat || String(card.caveat).length < 10) errors.push("缺局限声明");
    if ((card.secondaryOutcomes || []).length > 2) errors.push("次要结局最多 2 个（多重比较）");
    const text = [card.intervention, card.rationale, card.caveat, card.assumption].join(" ");
    for (const re of BANNED_PHRASES) if (re.test(text)) errors.push("含禁止措辞：" + re.source);
    return { ok: errors.length === 0, errors, warnings,
      note: errors.length ? "拒绝生成协议草稿" : "校验通过；仅生成 protocol 草稿，不自动创建实验" };
  }

  /** 可证伪性评分：把「不可证伪的漂亮话」挡在实验之外 */
  function falsifiability(card) {
    const checks = [
      { id: "H1", ok: ALLOWED_OUTCOMES.includes(card.primaryOutcome), text: "有可测量的主要结局" },
      { id: "H2", ok: Number.isFinite(card.expectedDelta) && card.expectedDelta !== 0, text: "有明确预期方向与幅度" },
      { id: "H3", ok: Number.isInteger(card.horizonDays) && card.horizonDays > 0, text: "有明确观测窗口" },
      { id: "H4", ok: ALLOWED_TESTS.includes(card.test), text: "指定了可执行的统计检验" },
      { id: "H5", ok: !!(card.assumption && card.caveat), text: "声明了前提与局限" },
      { id: "H6", ok: (card.refFields || []).length > 0, text: "锚定到真实数据字段" }
    ];
    const passed = checks.filter(c => c.ok).length;
    return { score: +(passed / checks.length).toFixed(2), passed, total: checks.length, checks,
      falsifiable: passed >= 5,
      note: passed >= 5 ? "可证伪，可进入预注册" : "不可证伪：缺少可测量结局/预期/检验，不得进入实验流程" };
  }

  /** 转成 EXP 预注册模板草稿（仍需用户确认，绝不自动封存） */
  function toProtocolDraft(card, opts) {
    const o = opts || {};
    const v = validateHypothesis(card, o.briefFields, o.cfg);
    if (!v.ok) return { ok: false, errors: v.errors };
    const f = falsifiability(card);
    if (!f.falsifiable) return { ok: false, errors: ["可证伪性不足：" + f.checks.filter(c => !c.ok).map(c => c.text).join("、")] };
    return {
      ok: true, autoStart: false,
      draft: {
        experimentId: "exp_" + Date.now().toString(36),
        status: "draft",
        hypothesis: card.intervention + " → " + card.primaryOutcome + " 预计变化 " + card.expectedDelta,
        primaryOutcome: card.primaryOutcome,
        secondaryOutcomes: card.secondaryOutcomes || [],
        expectedDelta: card.expectedDelta,
        MISD: (o.cfg && o.cfg.MISD) || 0.05,
        baselineDays: 7, interventionDays: Math.max(14, card.horizonDays), washoutDays: 3, followUpDays: 7,
        minimumSessionsPerCondition: 5,
        randomizationHint: { itemLevelMeasurable: true, itemsStableOverPeriod: true },
        analysisPlan: "ITT 配对差值 + " + card.test + " + bootstrap 95% 区间",
        exchangeabilityAssumption: card.assumption,
        stoppingRule: "周期与门槛达成前禁止查看组间比较",
        caveats: card.caveat,
        source: "ai_hypothesis_card", sourceVersion: VERSION
      },
      falsifiability: f,
      note: "草稿写入协议库待用户逐项确认；调用 EXP.preregister 前 status 恒为 draft"
    };
  }

  /** 给 AI 的系统提示词：强制结构化 JSON，禁止散文式建议 */
  const SYSTEM_PROMPT = [
    "角色：学习科学研究设计助手（CognitionScope 内置）。",
    "任务：基于给定 brief 生成一条「可证伪的假设卡」，不是给学习建议。",
    "只输出 JSON，字段：refFields(字符串数组，只能引用 brief 中存在的字段名)、",
    "intervention(具体可执行的干预)、primaryOutcome(只允许 " + ALLOWED_OUTCOMES.join("/") + ")、",
    "expectedDelta(数值，方向与幅度)、horizonDays(1-90 整数)、test(signFlipPermutation)、",
    "assumption(交换性前提)、caveat(局限)、rationale(一句话依据)、secondaryOutcomes(最多2个)。",
    "红线：禁止编造 brief 中不存在的字段；禁止诊断、能力/智力结论、'已证明有效'等措辞；",
    "不得声称假设已被验证；不确定时把局限写进 caveat。"
  ].join("\n");

  /** 从 AI 原始文本中安全抽取假设卡（拒绝散文、拒绝多余字段） */
  function parseHypothesisText(text, briefFields, cfg) {
    let j;
    try {
      const s = String(text || "").trim();
      const start = s.indexOf("{"), end = s.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("未找到 JSON 对象");
      j = JSON.parse(s.slice(start, end + 1));
    } catch (e) { return { ok: false, errors: ["假设卡 JSON 解析失败：" + e.message] }; }
    return Object.assign({ card: j }, validateHypothesis(j, briefFields, cfg));
  }

  window.HYP = {
    VERSION, HYP_TOP, ALLOWED_OUTCOMES, ALLOWED_TESTS, BANNED_PHRASES, SYSTEM_PROMPT,
    validateHypothesis, falsifiability, toProtocolDraft, parseHypothesisText
  };
})();
