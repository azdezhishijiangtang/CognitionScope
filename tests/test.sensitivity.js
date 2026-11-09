/* v9 · 缺失数据敏感性分析（不插补、不冒充完整 ITT） */
"use strict";
const H = require("./harness"), { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, done } = createHarness("test.sensitivity.js");
setupEnv(); const W = loadLogic(); const S = W.SENS;

t("版本与方法学声明", () => {
  eq(S.VERSION, "sensitivity/9.0");
  const r = S.analyze({ pairs: [], incomplete: [] });
  ok(r.note.includes("不修复或插补"));
  ok(r.method.includes("描述性界限"));
});

t("无缺失时 best = worst = complete-case，且判定稳健", () => {
  const r = S.analyze({ pairs: [{ a: 1, b: 3 }, { a: 2, b: 4 }], incomplete: [] });
  eq(r.nComplete, 2); eq(r.nIncomplete, 0); eq(r.missingRate, 0);
  eq(r.completeCase, 2); eq(r.bounds.best, 2); eq(r.bounds.worst, 2);
  ok(r.robust); eq(r.tippingPoint, null);
  ok(r.verdict.includes("稳健"));
});

t("全缺失时不产出点估计，结论为不确定", () => {
  const r = S.analyze({ pairs: [], incomplete: [{ a: null, b: null }] });
  eq(r.nComplete, 0); eq(r.completeCase, null); eq(r.missingRate, 1);
  ok(!r.robust); ok(r.verdict.includes("不确定"));
});

t("缺失配对的 best/worst 区间由观测范围决定", () => {
  const r = S.analyze({ pairs: [{ a: 0, b: 2 }], incomplete: [{ a: 0, b: null }, { a: null, b: 2 }] },
    { lower: 0, upper: 10 });
  eq(r.bounds.lo, 0); eq(r.bounds.hi, 10); eq(r.bounds.nRanges, 2);
  const rg = S.missingRanges([{ a: 0, b: null }, { a: null, b: 2 }], 0, 10);
  eq(JSON.stringify(rg[0]), "[0,10]");
  eq(JSON.stringify(rg[1]), "[-8,2]");
  ok(r.bounds.best >= r.bounds.worst);
});

t("结论脆弱时能给出 tipping point", () => {
  const r = S.analyze({
    pairs: [{ a: 0, b: 1 }, { a: 0, b: 1 }],
    incomplete: [{ a: 0, b: null }, { a: 0, b: null }]
  }, { lower: 0, upper: 2, maxDelta: 5, steps: 200 });
  ok(r.tippingPoint !== null, "应能找到翻转点");
  ok(Number.isFinite(r.tippingPoint));
  ok(!r.robust || r.tippingPoint !== null);
  ok(r.verdict.length > 0);
});

t("tippingPoint 无翻转时返回 null", () => {
  eq(S.tippingPoint([10, 10], [[0, 0]], { maxDelta: 1, steps: 50 }), null);
  eq(S.tippingPoint([], [[0, 1]], {}), null);
});

t("与 EXP.ittPairs 直接对接", () => {
  const itt = W.EXP.ittPairs([
    { experimentId: "e", randomizationUnitId: "u1", conditionId: "A", value: 1 },
    { experimentId: "e", randomizationUnitId: "u1", conditionId: "B", value: 3 },
    { experimentId: "e", randomizationUnitId: "u2", conditionId: "A", value: 2 },
    { experimentId: "e", randomizationUnitId: "u2", conditionId: "B", value: null }
  ]);
  const r = S.analyze(itt);
  eq(r.nComplete, 1); eq(r.nIncomplete, 1); eq(r.completeCase, 2);
  ok(r.status === "analyzed");
});

done();
