/* CognitionScope · tests/verify.js —— 逻辑层回归测试（Node，无 DOM）
 * 运行：node tests/verify.js
 * 覆盖：v3 修复回归 + v2 声明过的核心算法断言。全部断言基于公开导出，不 mock 内部状态。
 */
"use strict";

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; fails.push(name + " :: " + e.message); console.log("FAIL  " + name + " :: " + e.message); }
}
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy, got " + v); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
function near(a, b, eps, msg) { if (typeof a !== "number" || Math.abs(a - b) > eps) throw new Error((msg || "") + " expected ~" + b + " got " + a); }

/* ---------- 环境桩 ---------- */
const store = {};
global.window = global;
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.performance = { now: () => Date.now() };

const DAY = 24 * 3600 * 1000;
require("../js/core.js");
require("../js/engine2.js");
require("../js/lab.js");
require("../js/protocols.js");
require("../js/ai.js");
require("../js/lab-ui.js");
require("../js/observe.js");
const CS = window.CS, E2 = window.E2, LAB = window.LAB, PROTO = window.PROTO, AI = window.AI, LABUI = window.LABUI, OBS = window.OBS;
ok(CS && E2 && LAB && PROTO && AI && LABUI && OBS, "全局导出齐全");
CS.load();

const MTYPES = ["fact", "concept", "paper", "skill"];
const mkItem = o => Object.assign({ id: "x" + Math.random().toString(36).slice(2, 8), content: "c", answer: "", domain: "通用", mtype: "fact", learnedAt: Date.now() - 10 * DAY, reviews: [], prereq: [], relates: [] }, o);

/* ---------- 1. 遗忘曲线核心 ---------- */
t("retention(1,5)≈0.871", () => near(CS.retention(1, 5), 0.871, 0.001));
t("retention(5,5)=0.5（半衰期定义）", () => eq(CS.retention(5, 5), 0.5));
t("retention 非法 S 回落 5；dt=0 → r=1", () => { near(CS.retention(0, NaN), 1, 1e-9); near(CS.retention(3, -1), Math.pow(2, -3 / 5), 1e-9); });
t("nextS：grade2 翻倍、grade3 翻倍再翻倍，含夹取", () => { eq(CS.nextS(5, 2), 10); eq(CS.nextS(5, 3), 20); eq(CS.nextS(200, 3), 365); });
t("stateAt：新条目 r=1", () => { const it = mkItem({ learnedAt: Date.now() }); near(CS.stateAt(it).r, 1, 1e-6); });
t("stateAt【v3】跳过 NaN 时间戳的复习记录", () => {
  const now = Date.now();
  const a = mkItem({ learnedAt: now, reviews: [] });
  const b = mkItem({ learnedAt: now, reviews: [{ t: NaN, grade: 3, conf: 1 }] });
  eq(CS.stateAt(b).S, CS.stateAt(a).S, "NaN 记录不得改变 S");
  near(CS.stateAt(b).r, 1, 1e-9);
});
t("stateAt：1 天前 grade3 复习 → S=R0*4", () => {
  const it = mkItem({ mtype: "fact", learnedAt: Date.now() - 5 * DAY, reviews: [{ t: Date.now() - 1 * DAY, grade: 3, conf: 0.9 }] });
  eq(CS.stateAt(it).S, 12);
});
t("masteryOf 夹取 0-3", () => eq(CS.masteryOf(mkItem({ learnedAt: Date.now() })), 3));

/* ---------- 2. 数据校验与迁移【v3】 ---------- */
t("migrate：未知 mtype 归为 fact", () => { const m = CS.migrate({ items: [{ content: "x", mtype: "<script>alert(1)</script>" }] }); eq(m.items[0].mtype, "fact"); });
t("migrate：schemaVersion=4、数组兜底", () => { const m = CS.migrate({ items: [] }); eq(m.schemaVersion, 4); [ "lab", "protocols", "plans", "pcm", "sessions" ].forEach(k => eq(Array.isArray(m[k]), true, k)); });
t("addItem【v3】mtype 白名单", () => { const it = CS.addItem({ content: "合法内容", mtype: "virus" }); ok(MTYPES.includes(it.mtype), "mtype 必须在白名单内"); });
t("addItem【v3】prereq/relates 去重", () => { const it = CS.addItem({ content: "y", prereq: ["p", "p", "p"], relates: ["q", "q"] }); eq(it.prereq.length, 1); eq(it.relates.length, 1); });
t("addItem【v3】content 截断 500", () => { const it = CS.addItem({ content: "长".repeat(600) }); eq(it.content.length, 500); });
t("reviewItem【v3】grade/conf 夹取到合法域", () => {
  const it = CS.addItem({ content: "复习夹取" });
  const r = CS.reviewItem(it.id, 9, 5);
  eq(r.reviews[r.reviews.length - 1].grade, 3); eq(r.reviews[r.reviews.length - 1].conf, 1);
  const r2 = CS.reviewItem(it.id, -1, 0.5); eq(r2.reviews[r2.reviews.length - 1].grade, 0);
});
t("reviewItem【v3】NaN grade/conf 拒绝写入", () => {
  const it = CS.addItem({ content: "NaN 拒绝" });
  const n0 = it.reviews.length;
  eq(CS.reviewItem(it.id, NaN, 0.5), null);
  eq(CS.reviewItem(it.id, 2, NaN), null);
  eq(it.reviews.length, n0);
});
t("reviewItem【v3】userResponse 截断 500", () => {
  const it = CS.addItem({ content: "回忆截断" });
  const r = CS.reviewItem(it.id, 2, 0.7, 1200, "sT", "回".repeat(600));
  eq(r.reviews[r.reviews.length - 1].userResponse.length, 500);
});
t("save【v3】存储异常返回 false 而非崩溃", () => {
  const orig = global.localStorage.setItem;
  global.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  try { eq(CS.save(), false); } finally { global.localStorage.setItem = orig; }
});

/* ---------- 3. 导入导出与隐私【v3·高危】 ---------- */
t("exportJSON【高危修复】不导出 aiCfg.key 明文", () => {
  CS.state.aiCfg.key = "sk-SECRET-123";
  const s = CS.exportJSON();
  ok(!s.includes("sk-SECRET-123"), "导出串不得含明文 key");
  eq(CS.state.aiCfg.key, "sk-SECRET-123", "内存中的 key 不被破坏");
});
t("importJSON【v3】拒绝更高 schemaVersion", () => {
  let threw = null;
  try { CS.importJSON(JSON.stringify({ schemaVersion: 5, items: [] })); } catch (e) { threw = e; }
  ok(threw, "schemaVersion 5 必须被拒绝");
  ok(String(threw.message).indexOf("4") >= 0, "报错需说明当前支持版本 4");
});
t("importJSON【v3】导入前自动备份到 cogscope_v1_preimport", () => {
  CS.state.items = [mkItem({ content: "旧数据-标记物" })]; CS.save();
  CS.importJSON(JSON.stringify({ schemaVersion: 4, items: [Object.assign(mkItem({ content: "新数据" }), { id: "new1" })] }));
  eq(CS.state.items.length, 1); eq(CS.state.items[0].content, "新数据");
  const bak = JSON.parse(store["cogscope_v1_preimport"]);
  ok(bak.items.some(i => i.content === "旧数据-标记物"), "备份须包含导入前状态");
});
t("importJSON：坏 JSON 拒绝", () => {
  let threw = null; try { CS.importJSON("{oops"); } catch (e) { threw = e; }
  ok(threw, "坏 JSON 必须抛错");
});

/* ---------- 4. 负荷预测 ---------- */
t("futureLoad【v3】capacity 显式 0 生效", () => {
  CS.state.items = [mkItem({}), mkItem({}), mkItem({})];
  const out = CS.futureLoad(3, Date.now(), { capacity: 0 });
  ok(out.length === 3 && out[0].due > 0, "新条目第 0 天应全部到期");
  out.forEach(d => { eq(d.reviewed, 0, "容量 0 不复习"); eq(d.carry, d.due, "未复习全部顺延"); });
});
t("futureLoad：noActionDue 单调不减（对照曲线）", () => {
  const out = CS.futureLoad(7, Date.now(), { capacity: 20 });
  for (let i = 1; i < out.length; i++) ok(out[i].noActionDue >= out[i - 1].noActionDue, "第 " + i + " 天 noActionDue 回落");
});
t("futureLoad：按容量复习后 due 回落", () => {
  CS.state.items = [mkItem({}), mkItem({}), mkItem({})];
  const out = CS.futureLoad(7, Date.now(), { capacity: 20 });
  ok(out[0].due >= 3 && out[0].reviewed === 3, "第 0 天复习全部到期条目");
  ok(out[1].due < out[0].due, "复习后第 1 天到期数应下降，got " + out[1].due + " vs " + out[0].due);
});
t("futureLoad【v3】threshold 显式 0：已复习条目不再到期", () => {
  const it = mkItem({ reviews: [{ t: Date.now() - DAY, grade: 3, conf: 0.9 }] });
  CS.state.items = [it];
  const out = CS.futureLoad(3, Date.now(), { capacity: 20, threshold: 0 });
  out.forEach(d => eq(d.due, 0, "r<0 不可能，不应到期"));
});

/* ---------- 5. 统计引擎【v3】 ---------- */
t("fitByDomain：n≥5 出数、rows 按样本量 n 降序（非排名）", () => {
  const t0 = Date.now();
  const mk = (dom, n, id) => mkItem({
    id, domain: dom, learnedAt: t0 - 10 * DAY,
    reviews: Array.from({ length: n }, (_, i) => ({ t: t0 - (6 - (i % 5)) * DAY, grade: 2, conf: 0.8 }))
  });
  const state = { items: [mk("甲", 6, "a1"), mk("乙", 12, "b1"), mk("乙", 12, "b2")] };
  const d = E2.fitByDomain(state);
  eq(d.status, "ok");
  ok(d.rows.length >= 2, "应有两个学科行");
  for (let i = 1; i < d.rows.length; i++) ok(d.rows[i - 1].n >= d.rows[i].n, "rows 必须按 n 降序");
  ok(d.note.indexOf("排名") >= 0, "note 必须声明非排名");
});
t("fitByDomain：全局复习 <5 条时返回积累中", () => {
  const d = E2.fitByDomain({ items: [mkItem({ reviews: [{ t: Date.now() - DAY, grade: 2, conf: 0.8 }] })] });
  eq(d.status, "积累中"); eq(d.rows.length, 0);
});
t("sessionCurve【v3】base=0 不产生假阴性 slump", () => {
  const t0 = Date.now();
  const rv = (i, g) => ({ t: t0 - (20 - i) * 60000, grade: g, conf: 0.5, sessionId: "s1" });
  const it = mkItem({ reviews: Array.from({ length: 10 }, (_, i) => rv(i, i < 5 ? 0 : 3)) });
  const out = E2.sessionCurve({ items: [it] });
  const row = out.find(r => r.sid === "s1");
  ok(row, "应有 s1 行"); eq(row.base, 0); eq(row.slump, null, "base=0 时不得报滑坡");
});
t("sessionCurve：正常滑坡仍可检出", () => {
  const t0 = Date.now();
  const grades = [3, 3, 3, 3, 3, 0, 0, 0, 3, 3];
  const it = mkItem({ reviews: grades.map((g, i) => ({ t: t0 - (20 - i) * 60000, grade: g, conf: 0.5, sessionId: "s2" })) });
  const row = E2.sessionCurve({ items: [it] }).find(r => r.sid === "s2");
  eq(row.slump, "第6题起");
});
t("netAnalysis【v3】重复 prereq 边去重", () => {
  const a = mkItem({ id: "na", content: "A" });
  const b = mkItem({ id: "nb", content: "B", prereq: ["na", "na", "na"] });
  const net = E2.netAnalysis({ items: [a, b] });
  eq(net.edges, 1, "三条重复 prereq 只算一条边（edges 为边数）");
});
t("netAnalysis：relates 双向只记一条", () => {
  const a = mkItem({ id: "ra", content: "A" });
  const b = mkItem({ id: "rb", content: "B", relates: ["ra"] });
  const net = E2.netAnalysis({ items: [a, b] });
  eq(net.edges, 1);
});

/* ---------- 6. 计划骨架与 AI 白名单【v3·高危】 ---------- */
t("planSkeleton【高危修复】条目不含 content 原文", () => {
  CS.state.items = [mkItem({ id: "sk1", content: "机密内容不应外发" }), mkItem({ id: "sk2", content: "第二条" })];
  const sk = E2.planSkeleton(CS.state, { capacity: 5 });
  ok(sk.items.length >= 1, "应有条目");
  sk.items.forEach(i => {
    ok(!("content" in i), "骨架条目不得含 content 字段");
    ok(Object.keys(i).every(k => ["itemId", "domain", "type", "why"].includes(k)), "条目字段白名单外的键: " + Object.keys(i));
  });
});
t("planSkeleton【v3】capacity 显式 0 生效", () => {
  const sk = E2.planSkeleton(CS.state, { capacity: 0 });
  eq(sk.capacity, 0); eq(sk.items.length, 0);
});
t("planSkeleton【v3】goldenHour 非对象时兜底", () => {
  CS.state.profile.goldenHour = "晚上八点"; // 故意给字符串
  const sk = E2.planSkeleton(CS.state, { capacity: 1 });
  ok(sk.sessionTemplate.advice.indexOf("undefined") < 0, "不得输出 undefined");
  CS.state.profile.goldenHour = null;
});
t("validatePlan：合法 plan（含 changes/slot）通过", () => {
  CS.state.items = [mkItem({ id: "vp1" })];
  const sk = E2.planSkeleton(CS.state, { capacity: 1 });
  const plan = AI.validatePlan({ items: [{ itemId: sk.items[0].itemId, domain: sk.items[0].domain, type: sk.items[0].type, why: sk.items[0].why, slot: "09:00" }], changes: ["reorder"], aiNotes: "仅重排" }, sk);
  eq(plan.items[0].slot, "09:00");
});
t("validatePlan【v3】拒未知条目字段（content 等）", () => {
  CS.state.items = [mkItem({ id: "vp2" })];
  const sk = E2.planSkeleton(CS.state, { capacity: 1 });
  let threw = null;
  try { AI.validatePlan({ items: [Object.assign({}, sk.items[0], { content: "注入" })] }, sk); } catch (e) { threw = e; }
  ok(threw, "条目携带 content 必须被拒");
});
t("validatePlan【v3】changes 只允许 ALLOWED 动作", () => {
  CS.state.items = [mkItem({ id: "vp3" })];
  const sk = E2.planSkeleton(CS.state, { capacity: 1 });
  let threw = null;
  try { AI.validatePlan({ items: [sk.items[0]], changes: ["addMore"] }, sk); } catch (e) { threw = e; }
  ok(threw, "changes=addMore 不在 ALLOWED 内必须被拒");
});
t("validateParse：坏 mtype 拒绝、好输入通过", () => {
  const bad = AI.validateParse(JSON.stringify({ operations: [{ op: "add", content: "x", domain: "d", mtype: "evil" }], reviews: [], unparsed: null }));
  eq(bad.ok, false);
  const good = AI.validateParse(JSON.stringify({ operations: [{ op: "add", content: "x", domain: "d", mtype: "fact" }], reviews: [{ match: "x", grade: 2, conf: 0.7 }], unparsed: null }));
  eq(good.ok, true); eq(good.operations[0].mtype, "fact");
});
t("隐私隔离：buildBrief 永久关闭，个人摘要不得产出", () => {
  const t0 = Date.now();
  const it = mkItem({
    id: "bb1", content: "SECRET-CONTENT-不得外发", learnedAt: t0 - 8 * DAY,
    reviews: Array.from({ length: 6 }, (_, i) => ({ t: t0 - (7 - i) * DAY, grade: 2, conf: 0.8 }))
  });
  CS.state.items = [it];
  CS.state.profile.ageBand = "adult";
  const s = AI.buildBrief();
  ok(s === null, "个人摘要构建必须返回 null（fail-closed）");
  eq(AI.briefBytes(s), 0);
  eq(AI.briefFields().length, 0);
  ok(String(s).indexOf("SECRET-CONTENT") < 0, "不得含条目原文");
});

/* ---------- 7. 实验室 ---------- */
t("digit span【v3】= 最长连续答对段口径（独立复算）", () => {
  let res;
  LAB.run("digit", 10, { show: (item, i, n, diff, cb) => cb(diff <= 4, 300) }, r => { res = r; });
  // 独立实现：按连续答对段取段内最大难度 + 2
  let best = 0, run = 0;
  res.results.forEach(r => { if (r.ok) { run++; best = Math.max(best, r.diff); } else run = 0; });
  const expected = best ? best + 2 : null;
  eq(res.span, expected);
  eq(res.n, 10);
  ok(res.results.every(r => (r.ok === 0 || r.ok === 1) && typeof r.diff === "number"), "结果须含 ok(0/1)/diff");
});
t("digit 全错 → span=null（不伪造记录）", () => {
  let res;
  LAB.run("digit", 10, { show: (item, i, n, diff, cb) => cb(false, 100) }, r => { res = r; });
  eq(res.span, null); eq(res.acc, 0);
});
t("saveResult：val 非 null 才落盘", () => {
  eq(LAB.saveResult("digit", null, { rt: 0 }), null, "span null 不得写入记录");
});
t("stroop【v3】干扰量统计全部有效作答（独立复算）", () => {
  let res, wrongCon = 0;
  LAB.run("stroop", 10, {
    show: (item, i, n, diff, cb) => {
      const isInc = item.cond === "incongruent";
      const okAns = isInc || wrongCon >= 2; // 前两道一致题故意答错
      if (!isInc && !okAns) wrongCon++;
      cb(okAns, isInc ? 200 : (okAns ? 100 : 300));
    }
  }, r => { res = r; });
  const inc = res.results.filter(r => r.cond === "incongruent").map(r => r.rt);
  const con = res.results.filter(r => r.cond === "congruent").map(r => r.rt);
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  near(res.interference, avg(inc) - avg(con), 0.5, "interference 必须等于全部作答的组间差");
  ok(inc.length + con.length === 10, "全部作答都须计入");
});
t("pearson：退化输入返回 null", () => {
  eq(LAB.pearson([1, 2], [1, 2]), null, "样本 <3");
  eq(LAB.pearson([1, 2, 3], [1, 1, 1]), null, "零方差");
  eq(LAB.pearson([1, 2, 3], [1, 2]), null, "长度不等");
  near(LAB.pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1, 1e-9);
});
t("hydrate + saveResult：练习次数连续编号", () => {
  LAB.hydrate([{ kind: "matrix", z: 0.5, zRaw: 0.5, at: 1 }, { kind: "matrix", z: 1, zRaw: 1, at: 2 }]);
  const r1 = LAB.saveResult("matrix", 8, { rt: 1000 });
  eq(r1.attempt, 1, "state.lab 为空时 attempt 从 1 起");
  eq(r1.z, 1, "attempt1 不打折：z=(8-6)/2");
  near(r1.zSelf, 1, 1e-9, "历史 2 条基线：zSelf=(1-0.75)/0.25");
  const r2 = LAB.saveResult("matrix", 8, { rt: 1000 });
  eq(r2.attempt, 2);
  near(r2.z, 0.85, 1e-9, "默认 β=0.15：z=1-0.15*1");
});
t("ipsative：历史不足 2 条时 zSelf=null", () => {
  const ip = LAB.ipsative("series", 1); // series 无历史
  eq(ip.zSelf, null);
});
t("makeLearnStats【v3】firstPassRate=首次复习正确率", () => {
  const t0 = Date.now();
  const a = mkItem({ id: "f1", reviews: [{ t: t0 - DAY, grade: 2, conf: 0.5 }, { t: t0 - 3600000, grade: 0, conf: 0.5 }] });
  const b = mkItem({ id: "f2", reviews: [{ t: t0 - DAY, grade: 0, conf: 0.5 }] });
  const st = LAB.makeLearnStats({ items: [a, b] });
  near(st.firstPassRate, 0.5, 1e-9);
});
t("windowMetric：firstPassRate 同口径；未知 key=null", () => {
  const t0 = Date.now();
  const a = mkItem({ id: "w1", reviews: [{ t: t0 - DAY, grade: 2, conf: 0.5 }, { t: t0 - 3600000, grade: 0, conf: 0.5 }] });
  const b = mkItem({ id: "w2", reviews: [{ t: t0 - DAY, grade: 0, conf: 0.5 }] });
  near(LAB.windowMetric({ items: [a, b] }, t0, 7, "firstPassRate"), 0.5, 1e-9);
  eq(LAB.windowMetric({ items: [a, b] }, t0, 7, "noSuchKey"), null);
});
t("savings：失败-恢复节拍", () => {
  const t0 = Date.now();
  const it = mkItem({ reviews: [
    { t: t0 - 9 * DAY, grade: 0 }, { t: t0 - 8 * DAY, grade: 2 },
    { t: t0 - 3 * DAY, grade: 0 }, { t: t0 - 2 * DAY, grade: 2 }
  ] });
  near(CS.savings(it).savings, 0.5, 1e-9, "首过 2 次成功，恢复只用 1 次 → 0.5");
  eq(CS.savings(mkItem({ reviews: [{ t: t0, grade: 0 }] })), null, "从未成功 → null");
});

/* ---------- 8. 转义与安全 ---------- */
t("esc【v3】转义单引号与尖括号", () => {
  eq(OBS.esc("'"), "&#39;");
  eq(OBS.esc("<script>"), "&lt;script&gt;");
  eq(OBS.esc('"a"'), "&quot;a&quot;");
});
t("observe 证据分级【v3】rHat 标模型估计", () => {
  ok(OBS.EV.model.indexOf("模型估计") >= 0, "EV.model 文案须为「模型估计」");
});
t("permTest：分离组 p 显著、p∈(0,1]", () => {
  const r = PROTO.permTest({ A: [8, 9, 7, 8, 9], B: [1, 2, 1, 2, 1] }, 2000);
  ok(r.p > 0 && r.p <= 1);
  ok(r.p < 0.05, "完全分离的两组应显著，p=" + r.p);
});

/* ---------- 9. 静态安全检查 ---------- */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
t("index.html：无外部 script、含 CSP meta", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok(!/<script[^>]+src=["']https?:/i.test(html), "不得引用外部脚本");
  ok(html.indexOf("Content-Security-Policy") >= 0, "须含 CSP meta");
});
t("全部 JS：无 eval / new Function；esc 覆盖单引号", () => {
  const files = fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js"));
  files.forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
    ok(!/\beval\s*\(/.test(src), f + " 含 eval");
    ok(!/new\s+Function/.test(src), f + " 含 new Function");
    if (f === "lab-ui.js" || f === "observe.js" || f === "ai.js") {
      ok(src.indexOf("&#39;") >= 0, f + " 的 esc 未转义单引号");
    }
  });
});
t("ai.js：callNoStream 带 45s 超时（AbortController）", () => {
  const src = fs.readFileSync(path.join(ROOT, "js", "ai.js"), "utf8");
  ok(src.indexOf("AbortController") >= 0, "须用 AbortController 做超时");
  ok(/45000|45_000/.test(src), "超时应为 45000ms");
});
t("review.js：休息提示后重置 sessionStart", () => {
  const src = fs.readFileSync(path.join(ROOT, "js", "review.js"), "utf8");
  ok(/sessionStart\s*=\s*Date\.now\(\)/.test(src), "继续复习时须前移 sessionStart");
});
t("app.js：init 调用 LAB.hydrate", () => {
  const src = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  ok(/LAB\.hydrate\s*\(/.test(src), "init 必须恢复实验室历史");
});

/* ---------- 汇总 ---------- */
console.log("\n===== verify.js: " + pass + " passed, " + fail + " failed =====");
if (fail > 0) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
