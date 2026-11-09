/* CognitionScope · tests/test.ui.v6.js —— 可视化与路由装配（v6）
 * 纯 Node 环境：验证 SVG 生成、研究层数据装配、路由常量与降级行为。
 * 真实浏览器渲染由 tests/browser-check.js 负责。
 */
"use strict";
const H = require("./harness");
const { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, throws, done } = createHarness("test.ui.v6.js");
setupEnv();
const W = loadLogic();
require("../js/calibration-ui.js");
require("../js/research.js");
const { CS, CS6, CAL, PROBES, CALUI, RESEARCH } = W;
CS.load(); CS6.load();

/* 构造冻结事件，使研究层走「完整校准报告」分支而非「样本不足」分支 */
const T0 = Date.now() - 120 * 86400000;
for (let i = 0; i < 140; i++) {
  CS6.append("events", {
    kind: "outcome", itemId: "u" + (i % 20), t: T0 + i * 86400000,
    r: 0.05 + 0.9 * (i / 140), y: i % 3 ? 1 : 0, ySource: "self",
    src: i % 2 ? "probe" : "review", srcRef: "predictions#" + (i + 1), rPredSource: "frozen"
  }, { persist: false });
}
CS6.save();

/* 最小 DOM 桩，供 RESEARCH.render 装配 */
const els = {};
function FakeEl() {
  return { innerHTML: "", textContent: "", value: "", checked: false, disabled: false,
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    onclick: null, onchange: null, focus() {}, click() {}, remove() {}, appendChild() {},
    querySelectorAll: () => [], querySelector: () => null };
}
global.document = {
  addEventListener() {}, body: FakeEl(), createElement: () => FakeEl(),
  querySelectorAll: () => [],
  querySelector(sel) { if (!els[sel]) els[sel] = FakeEl(); return els[sel]; }
};
global.alert = () => {};
global.URL = global.URL || require("url").URL;
global.Blob = global.Blob || class Blob {};

const rows = CAL.reliability([{ r: 0.15, y: 0 }, { r: 0.15, y: 1 }, { r: 0.85, y: 1 }], { minN: 1 });
const pairs = Array.from({ length: 120 }, (_v, i) => ({ r: 0.05 + 0.9 * (i / 120), y: i % 3 ? 1 : 0, t: i * 86400000 }));
const frontier = CAL.thresholdFrontier(pairs);
const cov = PROBES.coverageReport(pairs, { minN: 5 });

t("svgReliability 产出合法 SVG 且空桶标注「无观测」", () => {
  const s = CALUI.svgReliability(rows);
  ok(s.startsWith("<svg") && /viewBox=/.test(s));
  ok(/无观测/.test(s));
  ok(!/<script/i.test(s) && !/undefined/.test(s));
});
t("svgThreshold 对不可评估 τ 灰显并标注", () => {
  const s = CALUI.svgThreshold(frontier);
  ok(s.startsWith("<svg") && /τ=/.test(s));
  ok(/不可评估/.test(s));
  ok(!/<script/i.test(s));
});
t("svgBrier / svgCoverage 产出合法图形", () => {
  const b = CALUI.svgBrier({ brierRetention: 0.3, brierConstBaseline: 0.25 }, { brierCalibrated: 0.22 });
  const c = CALUI.svgCoverage(cov);
  ok(b.startsWith("<svg") && /0\.3000/.test(b));
  ok(c.startsWith("<svg") && /样本覆盖/.test(c));
});
t("renderCalibrationReport 样本不足时给出 warn-box 且不显示掌握度", () => {
  const h = CALUI.renderCalibrationReport({ status: "insufficient", reason: "配对数不足 30" }, cov, frontier);
  ok(/warn-box/.test(h) && /配对数不足/.test(h));
  ok(!/掌握度 \d/.test(h));
});
t("renderCalibrationReport 完整报告含决策结论与溯源", () => {
  const ev = CAL.evaluate(pairs, { minPairs: 30 });
  const h = CALUI.renderCalibrationReport(ev, cov, frontier);
  ok(/留存模型校准/.test(h) && /Brier/.test(h));
  ok(/决策结论/.test(h));
});
t("CALUI.esc 转义 XSS 载荷", () => {
  ok(CALUI.esc("<img src=x onerror=alert(1)>").indexOf("<img") < 0);
});
t("RESEARCH.calibrationData 返回完整结构", () => {
  const d = RESEARCH.calibrationData();
  ok(d.available);
  ok(Array.isArray(d.pairs) && d.rep && d.cov && d.frontier);
  ok(typeof d.paramVersion === "string" && d.chain);
});
t("RESEARCH.render 五个研究层页面均不抛错且产出内容", () => {
  ["calib", "exp", "data", "metrics", "labdiag"].forEach(tab => {
    RESEARCH.render(tab);
    const p = document.querySelector("#pane-" + tab);
    ok(p.innerHTML.length > 30, tab + " 应渲染内容");
    ok(!/渲染失败/.test(p.innerHTML), tab + " 不应渲染失败");
  });
});
t("APP 路由常量：8 历史页 + 7 研究页 + 2 导览页 + 1 示例馆（v11），日常/进阶分组完整", () => {
  require("../js/app.js");
  const A = W.APP;
  eq(A.TABS.length, 8);
  eq(A.V6_TABS.length, 7);
  eq(A.V10_TABS.length, 2);
  eq(A.V11_TABS.length, 1);
  eq(A.TOOL_TABS.length, 10);
  eq(A.RESEARCH_TABS.length, 8);
  ok(A.V6_TABS.some(x => x[0] === "find") && A.V6_TABS.some(x => x[0] === "methods"), "v9 新页应登记");
  ok(A.V10_TABS.some(x => x[0] === "home") && A.V10_TABS.some(x => x[0] === "glossary"), "v10 导览/名词解释页应登记");
  ok(A.V11_TABS.some(x => x[0] === "demo"), "v11 示例内容馆页应登记");
  ok(A.TABS.every(x => A.TOOL_TABS.includes(x[0]) || A.RESEARCH_TABS.includes(x[0])));
});
t("APP.go 对 13 个 tab 均不抛错（含模块降级路径）", () => {
  // 补装载呈现层模块，模拟 index.html 顺序
  ["observe", "review", "lab-ui", "calibration-ui"].forEach(f => { try { require("../js/" + f + ".js"); } catch (e) {} });
  const A = W.APP;
  ["observe", "review", "add", "plan", "ai", "calib", "exp", "labdiag", "metrics", "data", "lab", "net", "proto"]
    .forEach(tab => { try { A.go(tab); } catch (e) { throw new Error(tab + " → " + e.message); } });
  ok(true);
});
t("研究层页面含红线措辞：空桶不插值、指标定义版本、N=1 不可推广", () => {
  RESEARCH.render("calib");
  const h = document.querySelector("#pane-calib").innerHTML;
  ok(/不插值/.test(h) && /无观测/.test(h));
  RESEARCH.render("metrics");
  const m = document.querySelector("#pane-metrics").innerHTML;
  ok(/红线/.test(m) && /definitionVersion/.test(m));
  RESEARCH.render("exp");
  const e = document.querySelector("#pane-exp").innerHTML;
  ok(/不可推广/.test(e) || /禁止/.test(e));
});
done();
