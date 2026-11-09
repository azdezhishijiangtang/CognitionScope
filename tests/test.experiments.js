/* CognitionScope · tests/test.experiments.js —— 预注册 / ITT / 保真度 / 假设卡 / 同意 / AI 安全（v6） */
"use strict";
const H = require("./harness");
const { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, throws, done } = createHarness("test.experiments.js");
setupEnv();
const W = loadLogic();
const { CS, CS6, EXP, PROTO, HYP, CONSENT, AI } = W;
CS.load(); CS6.load();
CONSENT.attach((stream, rec) => { CS6.append(stream, rec, { persist: false }); });

const draft = PROTO.createDraft("P1", { expectedDelta: 0.08 });
const good = EXP.preregister(Object.assign({}, draft.draft, {
  exchangeabilityAssumption: "同一条目在 A/B 两条件下可重复观测，配对差值符号可交换，条目难度稳定"
}));
const reg = good.registry;
const assign = PROTO.sealFromDraft(reg, ["k0", "k1", "k2", "k3", "k4", "k5", "k6"], "seed-9").assignment;
const evs = Array.from({ length: 14 }, (_v, i) => ({ experimentId: reg.experimentId,
  conditionId: i < 7 ? "A" : "B", itemId: "k" + (i % 7), value: i < 7 ? 0.5 : 0.62,
  reviewed: true, adherence: "applied", t: Date.now() + i * 86400000, rPredAtAssignment: 0.85 }));
const later = assign.sealedAt + 40 * 86400000;

t("协议生成 draft，status 恒为 draft（不自动启动）", () => {
  ok(draft.ok && draft.autoStart === false); eq(draft.draft.status, "draft");
});
t("缺项预注册被拒绝（实验周期/主要结局/MISD 等）", () => {
  const r = EXP.preregister({ experimentId: "e1" });
  ok(!r.ok && r.errors.length >= 5);
});
t("完整预注册封存并生成不可变 hash", () => {
  ok(good.ok && good.hash); eq(reg.status, "preregistered");
  ok(typeof reg.preregistrationHash === "string");
});
t("协议 → 预注册链路打通并落 L2", () => {
  const r = PROTO.preregisterFromProtocol(draft.draft);
  ok(r.ok); ok(CS6.state.experiments.length >= 1);
});
t("分配表一次性封存，contentHash 可复核", () => {
  ok(assign.contentHash === EXP.hash(JSON.stringify({ regId: reg.experimentId,
    unit: assign.unit, seed: "seed-9", table: assign.table })));
});
t("随机化单位决策规则：within-item / 洗脱 / 混淆标注", () => {
  eq(EXP.chooseUnit({ itemLevelMeasurable: true, itemsStableOverPeriod: true }).unit, "item");
  ok(EXP.chooseUnit({ carryoverRisk: true }).washoutRequired === true);
  ok(/混淆/.test(EXP.chooseUnit({}).caveat));
});
t("防 peeking：周期未满禁止显示组间比较", () => {
  ok(!EXP.mayRevealComparison(reg, assign, evs, Date.now()).allow);
});
t("防 peeking：周期与门槛都达标才解锁", () => {
  ok(EXP.mayRevealComparison(reg, assign, evs, later).allow);
  ok(!EXP.mayRevealComparison(reg, assign, evs.slice(0, 3), later).allow);
});
t("ITT 保留偏离事件，per-protocol 只作敏感性分析", () => {
  const a = EXP.adherenceReport(evs.concat([{ experimentId: reg.experimentId, conditionId: "A",
    itemId: "zz", value: 0.1, adherence: "deviated", t: later }]));
  ok(/complete-case/.test(a.primary)); ok(a.ittN > a.perProtocolN);
  ok(/事后剔除/.test(a.note));
});
t("ittPairs 不完整配对单列报告、不静默丢弃", () => {
  const p = EXP.ittPairs([{ itemId: "a", conditionId: "A", value: 1 },
    { itemId: "a", conditionId: "B", value: 0 }, { itemId: "b", conditionId: "A", value: 1 }]);
  eq(p.nPairs, 1); eq(p.incomplete.length, 1);
});
t("analyze 报效应量 + bootstrap 区间 + 置换 p，不报「已证明有效」", () => {
  const r = EXP.analyze(Array.from({ length: 20 }, (_v, i) => ({ a: 0.5 + 0.02 * i, b: 0.62 + 0.02 * i })),
    { perms: 500, boots: 500, seed: 3 });
  eq(r.n, 20); eq(r.ci95.length, 2);
  ok(r.ci95[0] <= r.effectSize && r.effectSize <= r.ci95[1]);
  ok(!/已证明有效/.test(r.conclusion)); ok(/不可推广/.test(r.caveat));
});
t("fullReport 周期未满返回 locked 且 showComparison=false", () => {
  const r = EXP.fullReport({ registry: reg, assignment: assign, events: evs, now: Date.now() });
  eq(r.status, "locked"); eq(r.showComparison, false); eq(r.conclusion, null);
});
t("fullReport 过五关后产出报告，ITT 为主要口径", () => {
  const r = EXP.fullReport({ registry: reg, assignment: assign, events: evs, now: later,
    predictions: Array.from({ length: 12 }, (_v, i) => ({ t: later - i * 86400000,
      paramVersion: "v6-a", modelHasSignal: true, policy: "calibrated_model" })) });
  eq(r.status, "reported"); eq(r.showComparison, true);
  ok(/complete-case/.test(r.adherence.primary));
  ok(r.caveats.join("").includes("不可推广"));
  ok(r.reportHash);
});
t("调度器保真度不足 → 结论降权（v5 关键缺口）", () => {
  const r = EXP.fullReport({ registry: reg, assignment: assign, events: evs, now: later,
    predictions: [{ t: later, paramVersion: "a", modelHasSignal: false, policy: "constant_baseline" }] });
  ok(r.downgraded && /降权/.test(r.conclusion));
});
t("FORECAST 未装载时保守降权，不放行因果结论", () => {
  const saved = W.FORECAST;
  delete W.FORECAST;                       // window === global，模拟模块缺失
  let r;
  try { r = EXP.fidelityOf(reg, [], null); } finally { W.FORECAST = saved; }
  eq(r.adequate, false);
});
t("假设卡：引用不存在字段被拒绝", () => {
  const card = { refFields: ["ghost"], intervention: "每日探针", primaryOutcome: "verifiedAccuracy",
    expectedDelta: 0.1, horizonDays: 14, test: "signFlipPermutation",
    assumption: "同一条目 A/B 可重复观测且配对符号可交换", caveat: "单次 N=1 不可推广且未经外部效标" };
  ok(!HYP.validateHypothesis(card, ["memory", "growth"]).ok);
});
t("假设卡：expectedDelta < MISD 被拒绝", () => {
  const base = { refFields: ["memory"], intervention: "每日探针", primaryOutcome: "verifiedAccuracy",
    expectedDelta: 0.001, horizonDays: 14, test: "signFlipPermutation",
    assumption: "同一条目 A/B 可重复观测且配对符号可交换", caveat: "单次 N=1 不可推广且未经外部效标" };
  ok(!HYP.validateHypothesis(base, ["memory"]).ok);
});
t("合法假设卡通过校验且可证伪", () => {
  const card = { refFields: ["memory", "metacog"], intervention: "每日延迟探针 3%",
    primaryOutcome: "delayed_verified_accuracy", expectedDelta: 0.08, horizonDays: 21,
    test: "signFlipPermutation", assumption: "同一条目 A/B 可重复观测且配对符号可交换",
    caveat: "单次 N=1 不可推广且未经外部效标验证", rationale: "基于历史留存校准差" };
  ok(HYP.validateHypothesis(card, ["memory", "metacog", "growth"]).ok);
  ok(HYP.falsifiability(card).falsifiable);
  const pd = HYP.toProtocolDraft(card, { briefFields: ["memory", "metacog", "growth"] });
  ok(pd.ok && pd.autoStart === false && pd.draft.status === "draft");
});
t("从 AI 输出（含 markdown 围栏）中安全抽取假设卡", () => {
  const card = { refFields: ["memory"], intervention: "每日探针", primaryOutcome: "verifiedAccuracy",
    expectedDelta: 0.1, horizonDays: 14, test: "signFlipPermutation",
    assumption: "同一条目 A/B 可重复观测且配对符号可交换", caveat: "单次 N=1 不可推广且未经外部效标" };
  ok(HYP.parseHypothesisText("```json\n" + JSON.stringify(card) + "\n```", ["memory"]).ok);
});
t("v7 隐私：个人数据外发授权始终被阻止", () => {
  ok(!CONSENT.assertBeforeCall("healthReport", "{}", {targetHost:"api.openai.com"}).allowed);
  ok(!CONSENT.FEATURES.healthReport);
});
t("v7 AI：通用研究请求不含任何平台数据", () => {
  const req=AI.buildRequest("请解释贝叶斯更新的基本思想",{endpoint:"https://api.openai.com/v1/chat/completions",model:"gpt-4o-mini",key:"sk-test"});
  const body=JSON.stringify(req.body);ok(body.includes("贝叶斯更新"));
  ok(!body.includes("profile")&&!body.includes("reviews")&&!body.includes("itemId"));
});
t("v7 AI：疑似个人信息输入被拦截", () => {
  throws(()=>AI.buildRequest("我的邮箱是 person@example.com",{endpoint:"https://api.openai.com/v1/chat/completions",model:"x",key:"k"}),/隐私保护拦截/);
});
t("v7 AI：个人数据解析接口 fail-closed", async () => {
  let failed=false;try{await AI.parseInput("我的复习记录");}catch(e){failed=/已关闭/.test(e.message);}ok(failed);
});
t("AI 运行时域名白名单：放行 PROVIDERS、拒绝任意外域", () => {
  eq(AI.assertAllowedUrl("https://api.deepseek.com/chat/completions"), "api.deepseek.com");
  throws(() => AI.assertAllowedUrl("https://evil.example.com/x"), /白名单/);
});
t("匿名短 ID 本地工具保留", () => {ok(/^x[0-9a-z]{6}$/.test(AI.anonymousShortId("i-secret-123")));});
t("v7 不构建个人数据 brief", () => {eq(AI.buildBrief(),null);eq(AI.briefFields().length,0);});
t("PROTO.permTest 仍为独立数值函数（历史接口保留）", () => {
  const r = PROTO.permTest({ A: [1, 2, 3], B: [0, 1, 1] }, 200);
  ok(Number.isFinite(r.p) && r.p > 0 && r.p <= 1);
});
done();
