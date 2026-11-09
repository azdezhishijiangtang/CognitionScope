/* CognitionScope · v11 示例内容包测试
 * 目标：证明「补内容」没有破坏任何一条隐私 / 研究诚信边界。
 * 覆盖：数据自检、默认零写入、显式载入与幂等、一键清除只删演示条目、
 *       三处 isDemoItem 口径一致、导出 / PCM / 经验正确率统一剔除、
 *       不接入 AI、不冒充常模、版权声明齐全。
 * 纯离线、零网络、零真实浏览器依赖。
 */
"use strict";
const fs = require("fs"), path = require("path");
const H = require("./harness");
const { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, done } = createHarness("test.demo.js");
const ROOT = path.resolve(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

const { store } = setupEnv();
const W = loadLogic();
require("../js/demo.js");
const CS = W.CS, CS6 = W.CS6, EXPORTM = W.EXPORTM, DEMO = W.DEMO;
const facts = JSON.parse(read("PROJECT-FACTS.json"));
CS.load(); CS6.load();

function freshState() {
  return { schemaVersion: 4, profile: { ageBand: "adult", goldenHour: null },
    items: [], lab: [], protocols: [], plans: [], pcm: [], sessions: [],
    aiCfg: { provider: "glm", key: "", baseUrl: "" } };
}

/* ---------- 1. 数据本身 ---------- */
t("示例包自检通过：字段、引用、错因、规模全部合法", () => {
  const v = DEMO.validate();
  ok(v.ok, "自检失败：" + v.errors.join(" | "));
  eq(v.count, 46);
  eq(v.edgeCount, 80);
  eq(v.domains.length, 7);
});

t("PROJECT-FACTS 的示例包登记与磁盘数据逐项一致", () => {
  const d = facts.demoContent;
  eq(d.packVersion, DEMO.VERSION);
  eq(d.itemCount, DEMO.ITEMS.length);
  eq(d.edgeCount, DEMO.edges().length);
  eq(d.domains, DEMO.DOMAINS.length);
  eq(d.errorTypes, DEMO.ERROR_TYPES.length);
  eq(d.defaultEnabled, false);
  ok(d.origin === "本项目原创编写");
  ok(d.excludedFrom.length >= 4);
});

t("所有先验边引用闭合，且不会指向自身", () => {
  const ids = new Set(DEMO.ITEMS.map(x => x.id));
  for (const e of DEMO.edges()) {
    ok(ids.has(e.from), "起点悬空：" + e.from);
    ok(ids.has(e.to), "终点悬空：" + e.to);
    ok(e.from !== e.to, "自环：" + e.from);
  }
  for (const d of DEMO.ITEMS) {
    for (const r of (d.prereq || []).concat(d.relates || [])) ok(ids.has(r), d.id + " → " + r);
  }
});

t("每条示例都具备可核验的要点、分层提示、常见错因与合法分类", () => {
  const MT = ["fact", "concept", "paper", "skill"];
  const errIds = new Set(DEMO.ERROR_TYPES.map(x => x.id));
  const domIds = new Set(DEMO.DOMAINS.map(x => x.id));
  for (const d of DEMO.ITEMS) {
    ok(d.content && d.answer && d.rubric && d.course && d.chapter, d.id + " 缺正文");
    ok(MT.indexOf(d.mtype) >= 0 && domIds.has(d.domain), d.id + " 分类非法");
    ok(d.difficulty >= 1 && d.difficulty <= 5, d.id + " 难度越界");
    ok(d.keypoints.length >= 2 && d.hints.length >= 2 && d.commonErrors.length >= 1, d.id + " 教学字段不足");
    for (const e of d.errorTypes) ok(errIds.has(e), d.id + " 未登记错因：" + e);
    ok(!/TODO|待补充|待填写|占位/.test(JSON.stringify(d)), d.id + " 含占位文案");
  }
});

t("「课程 → 章节 → 知识点」层级可用，覆盖全部条目", () => {
  const topics = DEMO.topics();
  ok(topics.length >= 20, "章节层级数=" + topics.length);
  const covered = topics.reduce((a, x) => a + x.ids.length, 0);
  eq(covered, DEMO.ITEMS.length);
  ok(topics.every(x => x.course && x.chapter && x.domain && x.ids.length));
});

t("本地筛选按学科 / 难度 / 关键词生效", () => {
  eq(DEMO.catalog("", "全部", 0).length, DEMO.ITEMS.length);
  ok(DEMO.catalog("", "数学", 0).length >= 10);
  ok(DEMO.catalog("", "数学", 0).every(x => x.domain === "数学"));
  ok(DEMO.catalog("", "全部", 1).every(x => x.difficulty === 1));
  ok(DEMO.catalog("因果").length >= 2);
  ok(DEMO.catalog("zzz完全不存在zzz").length === 0);
});

t("导出的示例包只含示例，不含任何用户数据字段", () => {
  const pack = JSON.parse(DEMO.exportPack());
  eq(pack.format, "cognitionscope.demo/1");
  eq(pack.items.length, DEMO.ITEMS.length);
  eq(pack.edges.length, DEMO.edges().length);
  ok(pack.validation.ok);
  ok(pack.meta.isDemo === true && pack.meta.defaultEnabled === false);
  const s = JSON.stringify(pack);
  for (const k of ["apiKey", "Authorization", "Bearer", "sessionKey", "userResponse"])
    ok(s.indexOf(k) < 0, "示例包含敏感字段 " + k);
  ok(s.indexOf("reviews") < 0, "示例包不应含复习记录");
});

/* ---------- 2. 默认零写入 ---------- */
t("默认零写入：未调用 load 时 L1 全空、无任何演示存储键", () => {
  const st = freshState();
  eq(DEMO.status(st).loaded, false);
  eq(DEMO.status(st).count, 0);
  eq(st.items.length, 0);
  ok(Object.keys(store).every(k => !/demo/i.test(k)), "出现演示相关存储键");
});

t("装载 DEMO 模块本身不触碰 localStorage、不发起网络请求", () => {
  const src = read("js/demo.js"), ui = read("js/demo-ui.js");
  for (const [name, s] of [["demo.js", src], ["demo-ui.js", ui]]) {
    ok(!/\bfetch\s*\(/.test(s), name + " 含 fetch");
    ok(!/XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(s), name + " 含其他外发通道");
    ok(!/localStorage\.(setItem|removeItem)/.test(s), name + " 自行写 localStorage");
  }
});

/* ---------- 3. 载入 / 幂等 / 清除 ---------- */
t("load 显式载入：条数正确、三标记齐全、id 稳定且引用已加前缀", () => {
  const st = freshState();
  const r = DEMO.load(st, { now: 1700000000000 });
  ok(r.ok, r.reason);
  eq(r.added, 46);
  eq(r.skipped, 0);
  eq(r.writeRequired, true);
  eq(st.items.length, 46);
  for (const it of st.items) {
    ok(it.demo === true && it.demoVersion === DEMO.VERSION, it.id + " 缺演示标记");
    ok(typeof it.source === "string" && it.source.indexOf("demo/") === 0, it.id + " 缺来源");
    ok(it.id.indexOf(DEMO.DEMO_PREFIX) === 0, it.id + " id 未加前缀");
    ok(Array.isArray(it.reviews) && it.reviews.length === 0);
    for (const p of it.prereq.concat(it.relates))
      ok(p.indexOf(DEMO.DEMO_PREFIX) === 0, it.id + " 边未加前缀：" + p);
  }
  const byId = new Map(st.items.map(x => [x.id, x]));
  for (const it of st.items) for (const p of it.prereq.concat(it.relates))
    ok(byId.has(p), it.id + " 前缀后边悬空：" + p);
});

t("load 幂等：重复载入不产生重复条目", () => {
  const st = freshState();
  DEMO.load(st);
  const r2 = DEMO.load(st);
  eq(r2.added, 0);
  eq(r2.skipped, 46);
  eq(r2.writeRequired, false);
  eq(st.items.length, 46);
  eq(new Set(st.items.map(x => x.id)).size, 46);
});

t("load 不自己写 localStorage（落盘由调用方 CS.save 负责）", () => {
  const st = freshState();
  const before = JSON.stringify(store);
  DEMO.load(st);
  eq(JSON.stringify(store), before);
});

t("isDemoItem 三处口径完全一致（CS / DEMO / EXPORTM 行为）", () => {
  const st = freshState();
  DEMO.load(st);
  const demo = st.items[0];
  ok(CS.isDemoItem(demo) && DEMO.isDemoItem(demo));
  const user = { id: "u1", content: "我自己的", source: "manual" };
  ok(!CS.isDemoItem(user) && !DEMO.isDemoItem(user));
  const fake1 = { id: "x", demo: true };
  const fake2 = { id: "x", source: "demo/x" };
  ok(!CS.isDemoItem(fake1) && !DEMO.isDemoItem(fake1), "单有 demo:true 不应误判");
  ok(!CS.isDemoItem(fake2) && !DEMO.isDemoItem(fake2), "单有 source 不应误判");
  const b = EXPORTM.buildBundle({ l1: st });
  eq(b.demoExcluded, 46, "EXPORTM 的剔除口径应与 CS/DEMO 一致");
});

t("realItems 只返回用户条目；无演示数据时返回等价副本", () => {
  const st = freshState();
  st.items.push({ id: "u1", content: "我的", reviews: [], domain: "通用", mtype: "fact", learnedAt: 1 });
  const r0 = DEMO.realItems(st);
  eq(r0.length, 1);
  DEMO.load(st);
  eq(DEMO.realItems(st).length, 1);
  eq(DEMO.realItems(st)[0].id, "u1");
  eq(st.items.length, 47);
});

t("clear 只删带演示标记的条目，用户条目与相似条目一条不动", () => {
  const st = freshState();
  st.items.push({ id: "u1", content: "我的真实记录", reviews: [{ t: 1, grade: 3, conf: 0.9 }], domain: "通用", mtype: "fact", learnedAt: 1 });
  st.items.push({ id: "u2", content: "长得像示例但不是", demo: true, source: "manual", reviews: [], domain: "通用", mtype: "fact", learnedAt: 1 });
  DEMO.load(st);
  eq(st.items.length, 48);
  const r = DEMO.clear(st);
  ok(r.ok);
  eq(r.removed, 46);
  eq(r.kept, 2);
  eq(st.items.length, 2);
  ok(st.items.some(x => x.id === "u1") && st.items.some(x => x.id === "u2"), "误删了用户条目");
  eq(DEMO.clear(st).removed, 0, "重复 clear 应为空操作");
});

/* ---------- 4. 导出 / 统计剔除 ---------- */
t("CS.exportJSON 剔除全部演示条目，且不改动原 state", () => {
  const st = freshState();
  st.items.push({ id: "u1", content: "我的", reviews: [], domain: "通用", mtype: "fact", learnedAt: 1 });
  DEMO.load(st);
  CS.replaceState(st);
  const text = CS.exportJSON();
  const out = JSON.parse(text);
  eq(out.items.length, 1);
  eq(out.items[0].id, "u1");
  ok(text.indexOf("demo__") < 0, "导出仍含演示 id");
  eq(CS.state.items.length, 47, "导出不应改动内存 state");
});

t("EXPORTM.buildBundle 的 state / jsonl / csv / counts 全部剔除演示", () => {
  const st = freshState();
  st.items.push({ id: "u1", content: "我的", reviews: [], domain: "通用", mtype: "fact", learnedAt: 1, prereq: [], relates: [] });
  DEMO.load(st);
  // 给一个演示条目加复习，确认 jsonl/csv 也不会带出
  st.items.find(x => x.id === "demo__m01").reviews.push({ t: 1700000000000, grade: 3, conf: 0.9 });
  const b = EXPORTM.buildBundle({ l1: st });
  eq(b.demoExcluded, 46);
  eq(b.bundle.state.items.length, 1);
  eq(b.bundle.manifest.counts.items, 1);
  eq(b.bundle.manifest.counts.reviews, 0);
  ok(b.text.indexOf("demo__") < 0, "包内仍含演示 id");
  ok(b.bundle.jsonl.indexOf("demo__") < 0, "JSONL 仍含演示复习");
  ok(b.bundle.csv.indexOf("demo__") < 0, "CSV 仍含演示复习");
  ok(b.bundle.manifest.caveats.some(x => x.indexOf("已剔除 46 条示例内容") >= 0), "缺少剔除声明");
});

t("剔除后的导出包仍能通过 verifyBundle 自洽复算", () => {
  const st = freshState();
  DEMO.load(st);
  const b = EXPORTM.buildBundle({ l1: st });
  const v = EXPORTM.verifyBundle(b.bundle);
  ok(v.ok, "复算失败：" + JSON.stringify(v));
  ok(v.manifestHashMatch && v.countsMatch);
});

t("无演示数据时 manifest 不出现剔除声明（历史导出逐字不变）", () => {
  const st = freshState();
  const b = EXPORTM.buildBundle({ l1: st });
  eq(b.demoExcluded, 0);
  ok(b.bundle.manifest.caveats.every(x => x.indexOf("示例内容") < 0));
});

t("fitParams 不计入演示条目的复习记录", () => {
  const st = freshState();
  CS.replaceState(st);
  const u = CS.addItem({ content: "我的真实条目" });
  DEMO.load(CS.state);
  CS.reviewItem(u.id, 3, 0.9, 1000);
  const d = CS.state.items.find(x => x.demo);
  d.reviews.push({ t: Date.now(), grade: 3, conf: 0.9, rt: 1000, sessionId: null, userResponse: "" });
  const f = CS.fitParams();
  eq(f.n, 1, "演示复习不应进入经验正确率分母");
  eq(f.successes, 1);
});

t("buildPCM 全部统计口径剔除演示，并登记 demo 字段", () => {
  const st = freshState();
  CS.replaceState(st);
  const u = CS.addItem({ content: "我的真实条目", domain: "数学" });
  DEMO.load(CS.state);
  const p = CS.buildPCM();
  eq(p.itemCount, 1);
  eq(p.domains["数学"], 1);
  ok(p.demo && p.demo.loaded === true && p.demo.count === 46 && p.demo.excluded === true);
  eq(p.growth.newItems7d >= 1, true);
  ok(p.knowledgeNet && p.knowledgeNet.nodes === 1, "PCM 的知识网络不应含示例节点");
  eq(p.memory.obs, 0, "PCM 记忆段不应含示例复习");
  ok(CS.state.items.some(x => x.id === u.id && !x.demo), "真实条目应仍在 state 中且不带演示标记");
});

t("findDue 与 futureLoad 保留演示条目，保证「功能试用」可用", () => {
  const st = freshState();
  CS.replaceState(st);
  DEMO.load(CS.state);
  eq(CS.findDue().length, 46, "演示条目应能出现在复习队列里供试用");
  const fl = CS.futureLoad(3);
  eq(fl.length, 3);
  ok(fl[0].due >= 46, "负荷图不应因演示条目而变空");
});

/* ---------- 5. 红线 ---------- */
t("示例内容不接入 AI 外发路径，运行时 fetch 仍只在 ai.js", () => {
  const withFetch = fs.readdirSync(path.join(ROOT, "js"))
    .filter(f => f.endsWith(".js") && /\bfetch\s*\(/.test(read("js/" + f)));
  eq(JSON.stringify(withFetch), JSON.stringify(["ai.js"]));
  const ai = read("js/ai.js");
  ok(ai.indexOf("DEMO") < 0 && ai.indexOf("demo") < 0, "ai.js 不应引用示例内容");
});

t("学科题目没有被冒充成认知能力常模", () => {
  const lab = read("js/lab.js");
  ok(/无题库、无常模来源/.test(lab));
  eq((lab.match(/source:\s*null/g) || []).length, 5, "NORMS 五项应保持无来源占位");
  const demo = read("js/demo.js");
  ok(!/NORMS|zScore|人群百分位|能力画像/.test(demo), "示例包不应声明常模或能力结论");
});

t("ATTRIBUTION.md 存在且声明齐全（原创、不复制原文、LICENSE、使用范围）", () => {
  const a = read(facts.demoContent.attributionFile);
  for (const s of ["原创编写", "没有复制", "保留所有权利", "不构成学习成效证据", "不授予第三方"])
    ok(a.indexOf(s) >= 0, "版权声明缺少：" + s);
  const meta = DEMO.META;
  ok(meta.isDemo === true && meta.defaultEnabled === false && meta.synthetic === false);
  ok(meta.attribution.indexOf("未复制任何仓库原文") >= 0);
});

t("示例馆内重渲染会补挂白话说明卡，避免说明卡被覆盖", () => {
  const u = read("js/demo-ui.js");
  ok(/window\.PLAIN && window\.PLAIN\.mount/.test(u), "未检查 PLAIN 是否装载");
  ok(/PLAIN\.mount\("demo", pane\)/.test(u), "render() 未补挂本页说明卡");
});

t("示例包规模与白话层登记一致：16 页说明、词典引用全部可查", () => {
  eq(facts.plainLanguage.guidePages, 16);
  const gl = read("js/glossary.js"), pl = read("js/plain.js");
  ok(/VERSION: "glossary\/11\.0"/.test(gl) && /VERSION: "plain\/11\.0"/.test(pl));
  const demoGuide = pl.match(/demo:\s*\{[\s\S]*?terms:\s*\[([^\]]*)\]/);
  ok(demoGuide, "缺少示例馆白话说明");
  const terms = [...demoGuide[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
  ok(terms.length >= 6);
  for (const term of terms) ok(gl.indexOf('["' + term + '"') >= 0, "词典未登记：" + term);
});

done();
