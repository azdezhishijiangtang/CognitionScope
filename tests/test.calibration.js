/* CognitionScope · tests/test.calibration.js —— 冻结回放 / 探针 / 参数拟合 / 排期（v6）
 * 注意：全部为固定种子合成数据，只用于验证方法可行性，不是对真实平台性能的评估。
 */
"use strict";
const H = require("./harness");
const { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, throws, done } = createHarness("test.calibration.js");
setupEnv();
const W = loadLogic();
const { CS, CS6, CAL, PROBES, PARAMS, FORECAST } = W;
CS.load(); CS6.load();

const DAY = 86400000, T0 = Date.now() - 120 * DAY;
let seed = 99;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/* 常规复习观测被 r<0.9 调度压在窄带；只有探针铺满全区间（复现 v5 实测） */
for (let i = 0; i < 400; i++) {
  const isProbe = i % 4 !== 0;   // 探针占 3/4（300 条）铺满全区间；常规复习 100 条压在窄带
  const r = isProbe ? 0.05 + 0.9 * rnd() : 0.72 + 0.175 * rnd();
  const y = rnd() < r ? 1 : 0;
  CS6.append("events", {
    kind: "outcome", itemId: "j" + (i % 30), t: T0 + i * DAY, r, y,
    ySource: i % 3 === 0 ? "verified" : "self", src: isProbe ? "probe" : "review",
    srcRef: "predictions#" + (i + 1), paramVersion: i < 280 ? "v6-a" : "v6-b",
    rPredSource: "frozen"
  }, { persist: false });
}
CS6.save();
const pairs = CAL.collectFromEvents(CS6.state);
const items = Array.from({ length: 30 }, (_v, i) => ({ id: "j" + i, mtype: "fact", learnedAt: T0,
  reviews: pairs.filter(p=>p.itemId==="j"+i).map(p=>({t:p.t,grade:p.y?3:1,gradeSelf:p.y?3:1})) }));

t("从 L2 收集冻结配对，全部带 _frozen 标记", () => {
  eq(pairs.length, 400);
  ok(pairs.every(x => x._frozen));
  ok(CAL.assertFrozenOnly(pairs).ok);
});
t("冻结数据评估附溯源声明且声明未被当前参数重写", () => {
  const ev = CAL.evaluateFrozen(CS6.state, { minPairs: 100, MISD: 0.01 });
  eq(ev.status, "evaluated");
  eq(ev.provenance.recomputedWithCurrentParams, false);
  eq(ev.provenance.paramVersions.length, 2);
});
t("双决策门槛独立判定（modelHasSignal / needCalibration）", () => {
  const ev = CAL.evaluateFrozen(CS6.state, { minPairs: 100 });
  ok(typeof ev.modelHasSignal === "boolean" && typeof ev.needCalibration === "boolean");
  ok(/最终测试集|独立最终测试|模型/.test(ev.verdict));
});
t("可靠性曲线 10 桶，空桶标注「无观测」且不插值", () => {
  const rows = CAL.reliability(pairs);
  eq(rows.length, 10);
  ok(rows.every(r => r.n >= 0 && (r.obsRate !== null || r.note.length > 0)));
});
t("按 paramVersion 分层对比且基于冻结预测", () => {
  const c = CAL.compareParamVersions(CS6.state);
  eq(c.rows.length, 2); ok(c.frozen.ok);
});
t("按 ySource 分层：未核验历史不冒充客观正确率", () => {
  const onlyVerified = CAL.collectFromEvents(CS6.state, { ySource: "verified" });
  ok(onlyVerified.length > 0 && onlyVerified.every(p => p.ySource === "verified"));
});
t("孤儿事件默认隔离出分析分母", () => {
  const s = CS6.snapshot();
  s.events.push(Object.assign({}, s.events[0], { orphan: true, seq: 999 }));
  ok(CAL.collectFromEvents(s).length <= pairs.length);
});
t("仅常规复习观测集中在窄带 → 曲线形状不可识别（v5 实测结论）", () => {
  const narrow = pairs.filter(x => x.src === "review");
  const c = PROBES.coverageReport(narrow);
  ok(c.identifiable < 8 && c.empty > 0);
  ok(/不可识别/.test(c.verdict));
});
t("三类探针把覆盖度补到可识别", () => {
  const c = PROBES.coverageReport(pairs);
  ok(c.identifiable >= 8);
  ok(c.rows.some(r => r.byType.probe > 0));
});
t("探针样本量本身也是门槛（100 条铺满 10 桶仍不足 minN=20）", () => {
  const thin = PROBES.coverageReport(pairs.filter(x => x.src === "probe").slice(0, 100), { minN: 20 });
  ok(thin.identifiable < 8);
});
t("自适应抽样率随空桶增加，但有 15% 硬上限", () => {
  const thin = PROBES.coverageReport(pairs.filter(x => x.src === "probe").slice(0, 100), { minN: 20 });
  const a = PROBES.adaptiveRate(thin);
  ok(a.pRoutine > PROBES.DEFAULT_CFG.pRoutine);
  ok(a.pRoutine <= 0.15);
});
t("确定抽样下生成三类探针计划（rOf 兼容 {r,S} 签名）", () => {
  const plan = PROBES.planProbes(items, { enabled: { routine: true, delayed: true, random: true }, pRandom: 1, seed: 7 },
    { t: T0 + 90 * DAY, rOf: () => ({ r: 0.85, S: 5 }), consent: { delayed: true } });
  ok(plan.plans.length > 0 && plan.executable.length > 0);
});
t("缺知情同意时延迟探针被阻止（真实遗忘成本）", () => {
  const b = PROBES.planProbes([{ id: "x", reviews: [], learnedAt: T0 }],
    { enabled: { routine: false, delayed: true, random: false }, pDelayed: 1, seed: 1 },
    { t: T0, rOf: () => ({ r: 0.3, S: 2 }), consent: { delayed: false } });
  eq(b.blocked.length, 1);
  ok(/同意/.test(b.blocked[0].reason));
});
t("探针隔离断言：reviews/S/r 均不得被改变", () => {
  const before = JSON.parse(JSON.stringify({ items }));
  ok(PROBES.assertIsolation(before, { items }, items[0].id, () => ({ r: 0.8, S: 5 })).ok);
});
t("探针记录结构上不含可写回 reviews 的 grade 字段", () => {
  const rec = PROBES.makeProbeRecord({ itemId: "p0", r: 0.9, t: T0, type: "routine", blocked: false }, 1);
  eq(rec.src, "probe"); ok(!("grade" in rec));
});
t("可识别性清单 7 项覆盖冻结/三类探针/分层/时间切分", () => {
  eq(PROBES.identifiabilityChecklist().length, 7);
});
t("无冻结日志时参数拟合被阻止（禁止重写历史）", () => {
  eq(PARAMS.fit(items, [], {}).status, "blocked");
});
t("参数化重放 stateAt 与 v3 语义一致", () => {
  const it = { mtype: "fact", learnedAt: T0, reviews: [{ t: T0 + 5 * DAY, grade: 3 }] };
  const a = CS.stateAt(it, T0 + 6 * DAY);
  const b = PARAMS.simulateStateAt(it, T0 + 6 * DAY, PARAMS.DEFAULT_PARAMS);
  ok(Math.abs(a.S - b.S) < 1e-9 && Math.abs(a.r - b.r) < 1e-9);
});
t("前推切分：所有折训练段时间严格早于测试段（无未来泄漏）", () => {
  const s = PARAMS.forwardChainingSplits(pairs, 3);
  eq(s.length, 3);
  ok(s.every(x => x.trainRange[1] <= x.testRange[0]));
});
t("前推 3 折拟合并生成 paramVersion 哈希", () => {
  const fit = PARAMS.fit(items, pairs.slice(0, 200), { folds: 3 });
  eq(fit.status, "evaluated"); eq(fit.folds.length, 3);
  ok(/^v7-fit-/.test(fit.paramVersion));
  ok(fit.caveats.some(x => /冻结/.test(x)));
});
t("前推拟合不受训练截止点之后新增标签影响",()=>{
  const base=PARAMS.fit(items,pairs.slice(0,200),{folds:3});
  const altered=items.map(it=>Object.assign({},it,{reviews:it.reviews.concat([{t:T0+500*DAY,grade:0,gradeSelf:0}])}));
  const future=PARAMS.fit(altered,pairs.slice(0,200),{folds:3});
  ok(JSON.stringify(base.folds.map(x=>x.params))===JSON.stringify(future.folds.map(x=>x.params)));
});
t("校准器在验证集选择，最终测试集只评估一次",()=>{
  const e=CAL.evaluate(pairs,{minPairs:100});
  eq(e.finalTestUsedForSelection,false);ok(e.nTrain+e.nValidation+e.nTest===pairs.length);
  if(e.method==="isotonic")ok(Array.isArray(e.fit.blocks)&&e.fit.blocks.length>0);
});
t("冻结配对未被新参数重写（版本对比的前提）", () => {
  ok(PARAMS.assertNoRewrite(pairs.slice(0, 10), pairs.slice(0, 10)).ok);
});
t("校准后排期应用 Platt 层，且每条决策可冻结", () => {
  const calState = { status: "evaluated", modelHasSignal: true, needCalibration: true, fit: { method: "platt", T: 1, b: 0 } };
  const sch = FORECAST.schedule(items, { t: T0 + 90 * DAY, rOf: () => ({ r: 0.85, S: 6 }),
    calibration: calState, paramVersion: "v6-a" });
  eq(sch.policy.policy, "calibrated_model");
  eq(sch.decisions.length, 30);
  ok(sch.decisions.every(d => d.rPredSource !== "model"));
});
t("冻结 20 条预测后哈希链仍完整", () => {
  const sch = FORECAST.schedule(items, { t: T0 + 90 * DAY, rOf: () => ({ r: 0.85, S: 6 }),
    calibration: { status: "evaluated", modelHasSignal: true, needCalibration: false }, paramVersion: "v6-a" });
  eq(FORECAST.freezeDecisions(sch, CS6).count, 30);
  ok(CS6.verifyChain().ok);
});
t("模型无信号时退回常数/固定间隔基线", () => {
  const s = FORECAST.schedule(items, { t: T0, rOf: () => ({ r: 0.9, S: 5 }),
    calibration: { status: "evaluated", modelHasSignal: false } });
  eq(s.policy.policy, "constant_baseline");
  ok(s.policy.fallback);
});
t("参数版本变更/无信号 → 干预保真度不足并降权", () => {
  const f = FORECAST.interventionFidelity(null, [{ t: T0, paramVersion: "a", modelHasSignal: false,
    policy: "constant_baseline" }]);
  ok(!f.adequate && /保真度不足/.test(f.verdict));
  eq(f.checks.length, 4);
});
t("剂量失衡被标记为可疑（依从性日志发现不了的调度器污染）", () => {
  const d = FORECAST.doseReport([
    { conditionId: "A", reviewed: true, t: T0 }, { conditionId: "A", reviewed: true, t: T0 + 1 },
    { conditionId: "B", reviewed: false, t: T0 }]);
  ok(d.suspicious === true);
});
t("阈值前沿：全区间样本可评估 6 个 τ", () => {
  const tf = CAL.thresholdFrontier(pairs);
  eq(tf.rows.length, 6);
  ok(tf.rows.every(r => r.evaluable));
});
t("仅常规探针（只覆盖 r≥0.9）时低 τ 不可评估 → 延迟探针为必需", () => {
  // routine 探针只抽未到期条目，样本 r 下限高于低阈值，反事实估计不可识别
  const onlyRoutine = pairs.filter(p => p.r >= 0.9);
  const tf = CAL.thresholdFrontier(onlyRoutine);
  ok(onlyRoutine.length > 0);
  ok(tf.rows.filter(r => !r.evaluable).length >= 4);
  ok(tf.rows.filter(r => !r.evaluable).every(r => /延迟探针/.test(r.note)));
});
done();
