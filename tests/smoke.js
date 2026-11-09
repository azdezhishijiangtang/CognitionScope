/* CognitionScope · tests/smoke.js —— 端到端冒烟（Node + 最小 DOM 桩）
 * 运行：node tests/smoke.js
 * 覆盖：APP 启动渲染、8 页切换、复习闭环落盘、一句话打卡（AI 解析→白名单→写入）、
 *       歧义匹配拒绝写入、consent 门、XSS 转义。
 */
"use strict";

let pass = 0, fail = 0;
const fails = [];
let chain = Promise.resolve(); // 串行队列：测试间共享全局桩，必须顺序执行
function t(name, fn) {
  chain = chain.then(() => fn()).then(
    () => { pass++; console.log("  ok  " + name); },
    e => { fail++; fails.push(name + " :: " + e.message); console.log("FAIL  " + name + " :: " + e.message); }
  );
}
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy, got " + v); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }

/* ---------- DOM 桩 ---------- */
const store = {};
global.window = global;
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.performance = { now: () => Date.now() };

function FakeEl() {
  return {
    innerHTML: "", textContent: "", value: "", checked: false, disabled: false,
    className: "", style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    onclick: null, onchange: null,
    focus() {}, click() {}, remove() {}, appendChild() {},
    addEventListener() {},
    _all: {}, // selector -> fake nodes（仅 #modal 的 data-c/data-g 需要非空）
    querySelectorAll(sel) { return this._all[sel] || []; },
    querySelector(sel) { return global.document.querySelector(sel); }
  };
}
const els = {};
const modals = { // 复习弹层的假按钮
  "[data-c]": ["0", "0.35", "0.7", "0.95"].map(c => Object.assign(FakeEl(), { dataset: { c } })),
  "[data-g]": ["0", "1", "2", "3"].map(g => Object.assign(FakeEl(), { dataset: { g } }))
};
global.document = {
  addEventListener() {},
  body: FakeEl(),
  createElement: () => FakeEl(),
  querySelectorAll: () => [],
  querySelector(sel) {
    if (!els[sel]) { els[sel] = FakeEl(); if (sel === "#modal") els[sel]._all = modals; }
    return els[sel];
  }
};
global.alert = () => {};

/* ---------- 装载（与 index.html 相同顺序） ---------- */
require("../js/core.js");
require("../js/engine2.js");
require("../js/lab.js");
require("../js/lab-ui.js");
require("../js/observe.js");
require("../js/review.js");
require("../js/protocols.js");
require("../js/ai.js");
require("../js/app.js");
const CS = window.CS, APP = window.APP, AI = window.AI, OBS = window.OBS;
const $ = sel => global.document.querySelector(sel);
const pane = tab => $("#pane-" + tab);

const drain = ms => new Promise(r => setTimeout(r, ms || 60));

/* ---------- 1. 启动与 8 页渲染 ---------- */
t("APP.init 启动 + hydrate 生效", () => {
  APP.init();
  ok(typeof APP.go === "function", "APP.go 应存在");
  ok(window.LAB && typeof window.LAB.history === "object", "LAB 已装载");
});
t("8 个页面均可渲染（pane 非空）", () => {
  const tabs = ["observe", "review", "lab", "net", "plan", "proto", "ai", "add"];
  tabs.forEach(tab => {
    APP.go(tab);
    ok(pane(tab).innerHTML.length > 30, "pane-" + tab + " 应渲染出内容");
  });
});

/* ---------- 2. 复习闭环 ---------- */
t("reviewFlow 单条闭环：conf→grade 落盘", () => {
  const it = CS.addItem({ content: "复习条目A", answer: "答案A", domain: "测试", mtype: "fact" });
  APP.reviewFlow(it.id);
  ok($("#overlay"), "overlay 应存在");
  const confBtns = $("#modal").querySelectorAll("[data-c]");
  eq(confBtns.length, 4, "应有 4 个把握按钮");
  confBtns[2].onclick(); // conf=0.7
  const gradeBtns = $("#modal").querySelectorAll("[data-g]");
  eq(gradeBtns.length, 4, "grade 阶段应有 4 个按钮");
  gradeBtns[2].onclick(); // grade=2
  const fresh = CS.state.items.find(x => x.id === it.id);
  eq(fresh.reviews.length, 1, "复习必须落盘");
  eq(fresh.reviews[0].grade, 2);
  eq(fresh.reviews[0].conf, 0.7);
  ok(/^s/.test(fresh.reviews[0].sessionId), "sessionId 以 s 开头");
  eq(fresh.reviews[0].userResponse, "");
});

/* ---------- 3. 隐私隔离：个人打卡解析已关闭（v8 迁移后的历史断言） ---------- */
let fetchCalls = 0;
global.fetch = async () => { fetchCalls++; throw new Error("不得发起网络请求"); };

t("打卡入口已移除，录入页明确告知不外发", () => {
  APP.go("add");
  const html = pane("add").innerHTML;
  ok(html.indexOf("已关闭 AI 个人打卡解析") >= 0, "录入页应声明打卡解析已关闭");
  ok($("#quickGo").onclick === null, "旧打卡按钮不应绑定任何处理器");
});
t("parseInput fail-closed 且不触发任何网络请求", async () => {
  fetchCalls = 0;
  let msg = null;
  try { await AI.parseInput("今天背了 ubiquitous"); } catch (e) { msg = e.message; }
  ok(msg && msg.indexOf("已关闭") >= 0, "应明确提示功能已关闭，got: " + msg);
  ok(msg.indexOf("不会将") >= 0, "应说明个人数据不外发");
  eq(fetchCalls, 0, "fail-closed 路径不得调用 fetch");
});
t("setConsent 无法重新开放个人数据外发，摘要构建保持关闭", () => {
  eq(AI.setConsent(true).ok, false);
  ok(AI.buildBrief() === null, "个人摘要构建应永久关闭");
  eq(AI.briefBytes(null), 0);
});
t("旧版打卡写入路径不产生条目，也不产生网络调用", () => {
  const before = CS.state.items.length;
  fetchCalls = 0;
  ok($("#quickApply").onclick === null, "旧写入按钮不应存在处理器");
  eq(CS.state.items.length, before, "不得写入任何条目");
  eq(fetchCalls, 0, "不得发起网络请求");
});

/* ---------- 4. XSS 转义 ---------- */
t("总览渲染：恶意条目内容被转义", () => {
  CS.addItem({ content: "<img src=x onerror=alert(1)>", domain: "安全", mtype: "fact" });
  APP.go("observe");
  const html = pane("observe").innerHTML;
  ok(html.indexOf("<img src=x") < 0, "不得出现未转义 img 标签");
  ok(html.indexOf("&lt;img") >= 0, "应出现转义后的文本");
});
t("复习弹层：恶意内容被转义", () => {
  const it = CS.state.items.find(x => x.content.indexOf("<img") === 0);
  APP.reviewFlow(it.id);
  const html = $("#modal").innerHTML;
  ok(html.indexOf("<img src=x") < 0, "弹层不得出现未转义标签");
});

/* ---------- 汇总 ---------- */
chain.then(() => {
  console.log("\n===== smoke.js: " + pass + " passed, " + fail + " failed =====");
  if (fail > 0) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  process.exit(0);
});
