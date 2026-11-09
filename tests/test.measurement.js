/* CognitionScope · tests/test.measurement.js —— 核验 / 计时 / 指标治理 / 信效度（v6） */
"use strict";
const H = require("./harness");
const { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, near, throws, done } = createHarness("test.measurement.js");
setupEnv();
const W = loadLogic();
const { VERIFY, TIMING, METRICS, LABM } = W;

const item = { mtype: "fact", rubricVersion: "rb1", rubric: "答出三点", keypoints: ["光合", "叶绿体", "ATP"] };

t("有要点 + rubricVersion 才可核验", () => {
  ok(VERIFY.validateRubric(item).verifiable);
  ok(!VERIFY.validateRubric({ mtype: "fact" }).verifiable);
  ok(!VERIFY.validateRubric(Object.assign({}, item, { mtype: "skill" })).verifiable);
});
t("要点全命中判 correct 且 y=1", () => {
  const v = VERIFY.verifyReview(item, "光合作用在叶绿体产生ATP");
  eq(v.status, "verified"); eq(v.outcome, "correct"); eq(v.y, 1);
  eq(v.hitKeypoints, 3);
});
t("部分命中判 partial（0.5），全不命中判 incorrect", () => {
  // 3 个要点命中 2 个 = 0.667 ≥ 0.4 → partial；命中 1 个 = 0.333 < 0.4 → incorrect
  eq(VERIFY.verifyReview(item, "光合叶绿体").outcome, "partial");
  eq(VERIFY.verifyReview(item, "无关内容").outcome, "incorrect");
  eq(VERIFY.verifyReview(item, "叶绿体").outcome, "incorrect");
});
t("字符串匹配明确标注不是语义理解", () => {
  const v = VERIFY.verifyReview(item, "光合作用在叶绿体产生ATP");
  ok(/不是语义理解|规范化字符串/.test(v.caveat + v.definitionVersion) || v.method === "normalized_substring_match");
});
t("A 级分母只含 verified，未核验/abandoned 一律排除", () => {
  const rv = [
    { itemId: "i1", gradeSelf: 3, verification: VERIFY.verifyReview(item, "光合叶绿体ATP") },
    { itemId: "i2", gradeSelf: 3, verification: { status: "unverified" } },
    { itemId: "i3", gradeSelf: 1, abandoned: true, verification: VERIFY.verifyReview(item, "x") },
    { itemId: "i4", gradeSelf: 1, verification: { status: "verified", outcome: "incorrect" } }
  ];
  const a = VERIFY.verifiedAccuracy(rv);
  eq(a.n, 2); eq(a.accuracy, 0.5); eq(a.grade, "A");
  ok(a.ci95 && a.ci95.length === 2);
});
t("n=0 不显示 0%（避免把没数据写成表现差）", () => {
  const a = VERIFY.verifiedAccuracy([]);
  eq(a.n, 0); eq(a.accuracy, null);
});
t("自评达标率与客观正确率分开报告", () => {
  const s = VERIFY.selfRatedPassRate([{ gradeSelf: 3 }, { gradeSelf: 1 }]);
  eq(s.grade, "B"); eq(s.rate, 0.5); ok(/同源/.test(s.note));
});
t("修掉同源自评：样本不足时不产出元认知偏差", () => {
  const rv = [{ itemId: "i1", confidenceSelf: 0.9, confidenceTiming: "before_reveal", verification: { status: "verified", outcome: "correct" } }];
  eq(VERIFY.metacogCalibration(rv).biasPct, null);
});
t("独立核验配对可算 bias / Brier（outcome 与 conf 不同源）", () => {
  const many = Array.from({ length: 40 }, (_v, i) => ({ itemId: "j" + i, confidenceSelf: 0.8,
    confidenceTiming: "before_reveal", verification: { status: "verified", outcome: i % 2 ? "correct" : "incorrect" } }));
  const m = VERIFY.metacogCalibration(many);
  ok(m.biasPct !== null && m.brier !== null); eq(m.grade, "C");
  ok(/不同源/.test(m.note));
});
t("自评 vs 核验落差可暴露自评虚高", () => {
  const rv = Array.from({ length: 12 }, (_v, i) => ({ gradeSelf: 3,
    verification: { status: "verified", outcome: i % 2 ? "correct" : "incorrect" } }));
  const c = VERIFY.compareSelfVsVerified(rv);
  ok(c.inflationPct > 0); eq(c.n, 12);
});
t("三段计时：回忆时长不含核对与评分", () => {
  let a = TIMING.beginAttempt("i1", 1000);
  a = TIMING.submitRecallAndReveal(a, "我的回忆", 0.7, 1800);
  eq(a.recallDurationMs, 800); eq(a.confidenceSelf, 0.7);
  TIMING.beginRating(a, 2100);
  a = TIMING.completeAttempt(a, 3, { status: "unverified" }, 2600);
  eq(a.totalAttemptDurationMs, 1600);
  ok(a.recallDurationMs <= a.totalAttemptDurationMs);
});
t("beginRating 幂等，重复调用不重复计时", () => {
  let a = TIMING.beginAttempt("i", 0);
  a = TIMING.submitRecallAndReveal(a, "x", 0.5, 100);
  eq(TIMING.beginRating(a, 200).changed, true);
  eq(TIMING.beginRating(a, 300).changed, false);
  eq(a.state, "rating");
});
t("checking 状态下 completeAttempt 自动兜底 beginRating（修 v4 陷阱）", () => {
  let a = TIMING.beginAttempt("i", 0);
  a = TIMING.submitRecallAndReveal(a, "x", 0.6, 100);
  a = TIMING.completeAttempt(a, 2, { status: "unverified" }, 500);
  eq(a.state, "completed");
});
t("从 recalling 直接完成被拒绝（保护揭示前信心）", () => {
  throws(() => TIMING.completeAttempt(TIMING.beginAttempt("i", 0), 2, null, 10), /只能在 rating/);
});
t("揭示后信心不可被改写，行为断言零违规", () => {
  let a = TIMING.beginAttempt("i", 0);
  a = TIMING.submitRecallAndReveal(a, "x", 0.7, 100);
  const c = a.confidenceSelf;
  TIMING.beginRating(a, 200);
  a = TIMING.completeAttempt(a, 3, { status: "verified", rubricVersion: "rb1", outcome: "correct" }, 300);
  eq(a.confidenceSelf, c);
  eq(TIMING.validateAttempt(a).length, 0);
});
t("放弃只产出事件，不产出可写入 reviews 的记录", () => {
  const r = TIMING.abandonAttempt(TIMING.beginAttempt("i", 0), "离开", 300);
  ok(r.event && r.changed);
  throws(() => TIMING.toReviewRecord(r.event), /只有 completed/);
});
t("恢复草稿重置计时、标记 timingReset、要求重采信心", () => {
  let d = TIMING.beginAttempt("i", 5000);
  d = TIMING.resumeDraft(d, 9000);
  ok(d.timingReset && d.resumed);
  eq(d.startedAt, 9000); eq(d.confidenceSelf, null);
});
t("toReviewRecord 同时含 grade（兼容 stateAt）与 gradeSelf（v6）", () => {
  let a = TIMING.beginAttempt("i", 0);
  a = TIMING.submitRecallAndReveal(a, "x", 0.6, 100);
  a = TIMING.completeAttempt(a, 3, { status: "unverified" }, 500);
  const r = TIMING.toReviewRecord(a, {});
  eq(r.grade, 3); eq(r.gradeSelf, 3); eq(r.confidenceTiming, "before_reveal");
  eq(r.recallDurationMs, 100);
});
t("红线 R5：D 级占位百分位与 banned 指标被拦截", () => {
  ok(METRICS.checkRedLines("pcmLabPct").some(x => x.id === "R5"));
  ok(METRICS.checkRedLines("mastery").some(x => x.id === "R5"));
});
t("红线 R1：探索性指标排名/能力措辞被拦截", () => {
  ok(METRICS.checkRedLines("domainEff", { ranked: true }).some(x => x.id === "R1"));
  ok(METRICS.checkRedLines("zMean", { text: "能力高低" }).some(x => x.id === "R1"));
});
t("红线 R3/R4/R6：B 级溯源、A 级分母、校准门禁", () => {
  ok(METRICS.checkRedLines("dueCount", { paramVersion: null }).some(x => x.id === "R3"));
  ok(METRICS.checkRedLines("verifiedAccuracy", { denominatorIncludesSelf: true }).some(x => x.id === "R4"));
  ok(METRICS.checkRedLines("dueCount", { modelHasSignal: false }).some(x => x.id === "R6"));
});
t("工具层瘦身：保留 A 级与可行动输出，移走 C/D", () => {
  const f = METRICS.filterForLayer("tool", { paramVersion: "v6", calibrationStatus: "ok", modelHasSignal: true, n: 10, dataRange: {} });
  ok(f.shown.includes("verifiedAccuracy"));
  ok(f.shown.includes("itemsTotal"));
  ok(!f.shown.includes("zMean"));
  ok(!f.shown.includes("pcmLabPct"));
});
t("模型未校准时依赖校准的指标自动隐藏", () => {
  const f = METRICS.filterForLayer("tool", { paramVersion: "v6", calibrationStatus: "ok", modelHasSignal: false, n: 10, dataRange: {} });
  ok(!f.shown.includes("dueCount"));
});
t("present 强制附 n/范围/版本/同屏免责，违规时隐藏数值", () => {
  const p = METRICS.present("mastery", 3, {});
  ok(p.hidden && p.value === null);
  const q = METRICS.present("itemsTotal", 12, { n: 12, dataRange: {}, definitionVersion: "x" });
  eq(q.value, 12); ok(q.disclaimer.length > 0); ok(q.badge.label);
});
t("pearson / ICC / Cronbach α 数值正确", () => {
  near(LABM.pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1);
  const m = [[10, 11, 10.5], [20, 20, 21], [30, 29, 31], [40, 41, 39], [50, 49, 51]];
  ok(LABM.icc(m, "ICC(2,1)").value > 0.9);
  ok(LABM.cronbachAlpha(m).alpha > 0.9);
});
t("重测报告同时给相关系数与 Bland–Altman LOA", () => {
  const tr = LABM.testRetest(Array.from({ length: 8 }, (_v, i) => ({ a: 10 + i, b: 10.4 + i })));
  ok(tr.r > 0.99); eq(tr.loa95.length, 2); ok(/Bland/.test(tr.note));
});
t("单调序列检出显著练习效应（AB/BA 平衡的必要性）", () => {
  const pe = LABM.practiceEffect([1, 2, 3, 4, 5, 6, 7, 8], { perms: 500 });
  ok(pe.significant === true && pe.slope > 0);
});
t("低波动 CV 达标；信度门槛全达标→收敛、不达标→下线", () => {
  ok(LABM.intraIndividualCV([10, 10.2, 9.8, 10.1]).cv < 0.25);
  eq(LABM.reliabilityGate({ icc: 0.82, cv: 0.12, practice: { significant: false }, taskCount: 2,
    deviceControlled: true, validityFilled: ["content"] }).decision, "keep_converge");
  eq(LABM.reliabilityGate({ icc: 0.2, cv: 0.6, practice: { significant: true }, taskCount: 7 }).decision, "retire");
});
t("效度清单缺项被明确列出，不能只用一个系数宣称有效", () => {
  const g = LABM.reliabilityGate({ icc: 0.82, cv: 0.12, practice: { significant: false },
    taskCount: 2, deviceControlled: true, validityFilled: ["content"] });
  ok(g.validityMissing.includes("常模研究"));
  ok(/不能只用一个系数/.test(g.caveat));
});
done();
