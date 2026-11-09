/* v9 · N=1 单案例统计（固定种子、可复现） */
"use strict";
const H = require("./harness"), { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, done } = createHarness("test.sced.js");
setupEnv(); const W = loadLogic(); const S = W.SCED;

t("版本与伪随机数确定性", () => {
  eq(S.VERSION, "sced/9.0");
  const a = S.rng(42), b = S.rng(42);
  eq(JSON.stringify([a(), a(), a()]), JSON.stringify([b(), b(), b()]));
});

t("随机化检验：强分离得到小 p，精确枚举", () => {
  const series = [{ phase: "A", value: 1 }, { phase: "A", value: 1 }, { phase: "A", value: 2 },
    { phase: "B", value: 8 }, { phase: "B", value: 8 }, { phase: "B", value: 9 }];
  const r = S.randomizationTest(series, {});
  eq(r.status, "evaluated"); ok(r.exact); eq(r.n, 6);
  eq(r.observed, 7);
  ok(r.p > 0 && r.p <= 0.2, "p=" + r.p);
  ok(r.note.includes("不是因果证明"));
});

t("样本不足时不产出 p 值", () => {
  const r = S.randomizationTest([{ phase: "A", value: 1 }], {});
  eq(r.status, "insufficient"); eq(r.p, null);
});

t("大样本走固定种子蒙特卡洛且可复现", () => {
  const series = [];
  for (let i = 0; i < 20; i++) series.push({ phase: i < 10 ? "A" : "B", value: i < 10 ? 1 + i * 0.1 : 5 + i * 0.1 });
  const a = S.randomizationTest(series, { permutations: 500, seed: 7 });
  const b = S.randomizationTest(series, { permutations: 500, seed: 7 });
  ok(!a.exact); eq(a.p, b.p); eq(a.permutations, 500);
  ok(a.p > 0 && a.p <= 1);
});

t("bootstrap CI 覆盖样本均值且确定性", () => {
  const a = S.bootstrapCI([1, 2, 3, 4, 5], { iterations: 800, seed: 9 });
  const b = S.bootstrapCI([1, 2, 3, 4, 5], { iterations: 800, seed: 9 });
  eq(a.status, "evaluated"); eq(JSON.stringify(a.ci), JSON.stringify(b.ci));
  ok(a.ci[0] <= a.mean && a.mean <= a.ci[1], "区间应包含均值 " + JSON.stringify(a.ci));
  eq(S.bootstrapCI([1], {}).status, "insufficient");
});

t("NAP 非重叠对比例边界", () => {
  eq(S.nap([1, 2], [3, 4]), 1);
  eq(S.nap([3, 4], [1, 2]), 0);
  eq(S.nap([1, 1], [1, 1]), 0.5);
  eq(S.nap([], [1]), null);
});

t("lag-1 自相关：常数序列返回 null", () => {
  eq(S.lag1([2, 2, 2, 2]), null);
  eq(S.lag1([1, 2]), null);
  ok(Number.isFinite(S.lag1([1, 3, 2, 5, 4, 7])));
});

t("report 明确限定个体内范围且不含人群百分位", () => {
  const r = S.report([{ phase: "A", value: 1 }, { phase: "A", value: 2 },
    { phase: "B", value: 4 }, { phase: "B", value: 5 }], { iterations: 300 });
  ok(r.scope.includes("不可推广"));
  ok(r.readingGuide.join(" ").includes("不输出 z 分数"));
  ok(r.randomizationTest.status === "evaluated");
  eq(r.nA, 2); eq(r.nB, 2);
});

done();
