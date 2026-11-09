/* CognitionScope · timing.js —— 三段计时状态机（v6）
 * ============================================================================
 * 目标：让「回忆反应时」成为可用指标，而不是把整次作答时长当成回忆时间。
 * 状态：idle → recalling → checking → rating → completed / abandoned
 *
 * 关键纪律（对应 v5 §3.2 与改进建议书）：
 *   ① confidenceSelf 必须在答案揭示之前冻结；揭示后不可修改
 *   ② recallDurationMs = 从 beginAttempt 到 submitRecallAndReveal，不含核对与评分
 *   ③ totalAttemptDurationMs 只作会话总时长，禁止用于反应时分析
 *   ④ 恢复草稿后不得延续已停止的 recall 计时（会制造虚假的超长反应时）
 *   ⑤ abandoned 只写事件日志，不写 reviews、不进任何正确率分母
 *   ⑥ completeAttempt 在 checking 状态下自动调用 beginRating 兜底（修 v4 §3152 陷阱）
 *   ⑦ beginRating 幂等；所有时间参数由调用方注入，便于假时钟测试（行为断言而非静态断言）
 *
 * 零 DOM、零 Date.now() 硬依赖：now 由参数传入，测试可用假时钟。
 */
"use strict";
(function () {
  const VERSION = "timing/6.0";
  const STATES = ["idle", "recalling", "checking", "rating", "completed", "abandoned"];

  function uid() { return "a" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  /** 开始一次尝试。now 单位 ms（相对或绝对均可，只要一致） */
  function beginAttempt(itemId, now, opts) {
    const o = opts || {};
    if (!Number.isFinite(now)) throw new Error("now 必须是有限数（建议用单调时钟）");
    return {
      attemptId: o.attemptId || uid(), itemId: String(itemId),
      state: "recalling", definitionVersion: VERSION,
      startedAt: now, recallStartedAt: now,
      confidenceTiming: "before_reveal",
      userResponse: "", confidenceSelf: null,
      recallDurationMs: null, checkingDurationMs: null, ratingDurationMs: null,
      totalAttemptDurationMs: null,
      gradeSelf: null, verification: { status: "unverified" },
      timingReset: false, resumed: false, abandonedReason: null,
      log: [{ state: "recalling", at: now }]
    };
  }

  function transition(a, next, now) {
    const allowed = {
      idle: ["recalling"], recalling: ["checking", "abandoned"],
      checking: ["rating", "completed", "abandoned"], rating: ["completed", "abandoned"],
      completed: [], abandoned: []
    };
    if (!allowed[a.state] || !allowed[a.state].includes(next))
      throw new Error("非法状态迁移：" + a.state + " → " + next);
    a.state = next;
    a.log.push({ state: next, at: now });
    return a;
  }

  /** 提交回忆文本 + 揭示前信心，同时揭示答案；此后 confidenceSelf 冻结 */
  function submitRecallAndReveal(a, userResponse, confidenceSelf, now) {
    if (!Number.isFinite(now)) throw new Error("now 必须是有限数");
    if (a.state !== "recalling") throw new Error("只能在 recalling 状态提交回忆（当前 " + a.state + "）");
    if (now < a.recallStartedAt) throw new Error("时间倒流：now 早于回忆开始");
    const c = Number(confidenceSelf);
    if (!Number.isFinite(c) || c < 0 || c > 1) throw new Error("confidenceSelf 须为 0-1");
    a.userResponse = String(userResponse || "").slice(0, 500);
    a.confidenceSelf = c;
    a.recallDurationMs = Math.round(now - a.recallStartedAt);
    a.checkingStartedAt = now;
    transition(a, "checking", now);
    return a;
  }

  /** 开始自评（幂等：重复调用不抛错、不重复计时） */
  function beginRating(a, now) {
    if (a.state === "rating") return { changed: false, attempt: a };
    if (a.state === "completed" || a.state === "abandoned") return { changed: false, attempt: a };
    if (a.state === "checking") {
      a.checkingDurationMs = Math.round(now - (a.checkingStartedAt != null ? a.checkingStartedAt : now));
      a.ratingStartedAt = now;
      transition(a, "rating", now);
      return { changed: true, attempt: a };
    }
    // recalling 状态直接点「评分」：缺少揭示步骤，拒绝（防止把揭示后信心写进来）
    throw new Error("必须先 submitRecallAndReveal 才能进入评分");
  }

  /** 完成：自动兜底 beginRating（v4 里此处会抛错）；verification 由 VERIFY 生成 */
  function completeAttempt(a, gradeSelf, verification, now) {
    if (!Number.isFinite(now)) throw new Error("now 必须是有限数");
    if (a.state === "checking") beginRating(a, now);        // ← 自动兜底
    if (a.state !== "rating") throw new Error("只能在 rating/checking 状态完成（当前 " + a.state + "）");
    const g = Number(gradeSelf);
    if (!Number.isFinite(g) || g < 0 || g > 3) throw new Error("gradeSelf 须为 0-3");
    a.gradeSelf = g;
    a.verification = verification || { status: "unverified" };
    a.ratingDurationMs = Math.round(now - (a.ratingStartedAt != null ? a.ratingStartedAt : now));
    a.totalAttemptDurationMs = Math.round(now - a.startedAt);
    a.completedAt = now;
    transition(a, "completed", now);
    return a;
  }

  /** 放弃：只产出事件记录，绝不返回可写入 reviews 的对象 */
  function abandonAttempt(a, reason, now) {
    if (a.state === "completed") throw new Error("已完成的尝试不可放弃");
    if (a.state === "abandoned") return { changed: false, event: null };
    a.abandonedReason = String(reason || "user_abandon").slice(0, 100);
    a.totalAttemptDurationMs = Math.round(now - a.startedAt);
    transition(a, "abandoned", now);
    return {
      changed: true,
      event: {
        kind: "attempt_abandoned", attemptId: a.attemptId, itemId: a.itemId,
        t: now, state: "abandoned", elapsedMs: a.totalAttemptDurationMs,
        reason: a.abandonedReason,
        note: "仅写入 events/timingLog，不写 reviews、不进任何正确率分母"
      }
    };
  }

  /** 恢复草稿：绝不延续已停止的 recall 计时，重置为「新的回忆段」并留痕 */
  function resumeDraft(draft, now) {
    if (!draft || typeof draft !== "object") throw new Error("草稿无效");
    const a = JSON.parse(JSON.stringify(draft));
    if (a.state !== "recalling") throw new Error("只有 recalling 状态的草稿可恢复，避免把核对/评分时长混入回忆");
    a.recallStartedAt = now;
    a.startedAt = now;
    a.timingReset = true;
    a.resumed = true;
    a.confidenceSelf = null;       // 恢复草稿后必须重新采集揭示前信心
    a.userResponse = "";
    a.log.push({ state: "recalling_resumed", at: now, note: "计时重置，不延续已停止的 recall 段" });
    return a;
  }

  /** 转成可写入 L1 reviews 的记录（只有 completed 才允许） */
  function toReviewRecord(a, opts) {
    if (a.state !== "completed") throw new Error("只有 completed 的尝试能转成复习记录");
    const o = opts || {};
    return {
      t: o.t != null ? o.t : a.completedAt,
      grade: a.gradeSelf,                    // 兼容 v3 stateAt（读 rv.grade）
      gradeSelf: a.gradeSelf,               // v6 规范字段
      confidenceSelf: a.confidenceSelf,
      confidenceTiming: "before_reveal",
      recallDurationMs: a.recallDurationMs,
      totalAttemptDurationMs: a.totalAttemptDurationMs,
      userResponse: a.userResponse,
      sessionId: o.sessionId || null,
      attemptId: a.attemptId,
      paramVersion: o.paramVersion || "v6",
      verification: a.verification,
      timingVersion: VERSION
    };
  }

  /** 行为断言集合：供测试逐条验证（替代 v3 的 indexOf 静态断言） */
  const ASSERTIONS = [
    "submitRecallAndReveal 之后 confidenceSelf 不可变",
    "recallDurationMs 不含核对与评分时长",
    "recallDurationMs <= totalAttemptDurationMs",
    "completeAttempt 在 checking 状态下自动调用 beginRating 而不抛错",
    "beginRating 重复调用幂等",
    "abandonAttempt 只产出事件，不产出复习记录",
    "恢复草稿后 timingReset=true 且 recall 计时重置",
    "confidenceTiming 恒为 before_reveal（历史数据由导入标记 legacy_unknown）"
  ];

  /** 校验一个 attempt 是否满足全部纪律，返回违规列表 */
  function validateAttempt(a) {
    const v = [];
    if (!a || typeof a !== "object") return ["attempt 不是对象"];
    if (!STATES.includes(a.state)) v.push("非法状态：" + a.state);
    if (a.state === "completed") {
      if (a.confidenceSelf == null) v.push("completed 但缺 confidenceSelf");
      if (a.confidenceTiming !== "before_reveal") v.push("confidenceTiming 非 before_reveal");
      if (!Number.isFinite(a.recallDurationMs) || a.recallDurationMs < 0) v.push("recallDurationMs 无效");
      if (!Number.isFinite(a.totalAttemptDurationMs)) v.push("totalAttemptDurationMs 无效");
      if (a.recallDurationMs > a.totalAttemptDurationMs) v.push("回忆时长超过总时长");
      if (a.totalAttemptDurationMs && a.totalAttemptDurationMs > 30 * 60000) v.push("总时长 >30 分钟，疑似挂机，需标记排除");
      if (a.verification && a.verification.status === "verified" && !a.verification.rubricVersion)
        v.push("已核验但缺 rubricVersion");
    }
    if (a.state === "abandoned" && a.gradeSelf != null) v.push("abandoned 不应带 gradeSelf");
    if (!Array.isArray(a.log) || !a.log.length) v.push("缺状态迁移日志");
    return v;
  }

  window.TIMING = {
    VERSION, STATES, ASSERTIONS, uid,
    beginAttempt, submitRecallAndReveal, beginRating, completeAttempt,
    abandonAttempt, resumeDraft, toReviewRecord, validateAttempt, transition
  };
})();
