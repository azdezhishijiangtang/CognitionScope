/* CognitionScope · tests/test.data.js —— L1/L2 数据层、事务、导入导出（v6） */
"use strict";
const H = require("./harness");
const { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, throws, done } = createHarness("test.data.js");
setupEnv();
const W = loadLogic();
const { CS, CS6, PERSIST, IMPORTV, EXPORTM } = W;
CS.load(); CS6.load();

t("L1 保持 schema v4（不破坏 66 项历史回归）", () => eq(CS.state.schemaVersion, 4));
t("L2 为 schema v6、13 个登记流、初始为空", () => {
  eq(CS6.state.schemaVersion, 6);
  eq(Object.keys(CS6.STREAMS).length, 13);
  eq(CS6.state.events.length, 0);
});
t("冻结预测同时写 predictions 与 events 两条链", () => {
  CS6.freezePrediction({ itemId: "i1", rPred: 0.82, S: 6, t: Date.now() });
  eq(CS6.state.predictions.length, 1);
  eq(CS6.state.events.length, 1);
});
t("记录观测后哈希链完整", () => {
  CS6.recordOutcome({ itemId: "i1", r: 0.82, y: 1, ySource: "verified", src: "review", srcRef: "predictions#1" });
  ok(CS6.verifyChain().ok);
});
t("篡改任一记录会报断裂（tamper-evident）", () => {
  const snap = CS6.snapshot(); snap.events[0].y = 0; CS6.replaceState(snap);
  ok(!CS6.verifyChain().ok);
});
t("存储中的原始链未被污染（append-only）", () => {
  CS6.load(); ok(CS6.verifyChain().ok);
});
t("append 拒绝未登记流与缺必需字段", () => {
  throws(() => CS6.append("hackStream", { kind: "x" }), /未登记的流/);
  throws(() => CS6.append("probeLog", { itemId: "x" }), /缺少必需字段/);
});
t("seq/hash/paramVersion 由系统写入，用户无法伪造", () => {
  const r = CS6.append("events", { kind: "x", itemId: "i2", t: Date.now(), seq: 999, hash: "fake" });
  eq(r.record.seq, 3);
  ok(r.record.hash !== "fake");
  ok(typeof r.record.paramVersion === "string");
});
t("appendMany 批量原子构造，链连续", () => {
  const r = CS6.appendMany("timingLog", [
    { itemId: "a", t: Date.now(), state: "recalling" },
    { itemId: "a", t: Date.now() + 1, state: "completed" }
  ]);
  eq(r.count, 2); ok(CS6.verifyChain().ok);
});
t("setParamVersion 留审计且旧记录版本不变", () => {
  const before = CS6.state.events[0].paramVersion;
  CS6.setParamVersion("v6-fit-abc", "网格拟合后切换");
  eq(CS6.state.events[0].paramVersion, before);
  eq(CS6.state.paramVersion, "v6-fit-abc");
});
t("archive 只登记范围、不物理删除", () => {
  const n = CS6.state.events.length;
  const r = CS6.archive("events", Date.now() + 999999, "测试");
  ok(r.archived > 0);
  eq(CS6.state.events.length, n);
  ok(CS6.verifyChain().ok);
});
t("双键事务同时写 L1 与 L2", () => {
  const r = PERSIST.commitBoth(d => {
    d.items.push({ id: "a1", content: "测试", mtype: "fact", learnedAt: Date.now(), reviews: [], prereq: [], relates: [] });
  }, [{ stream: "verificationLog", record: { itemId: "a1", status: "unverified" } }]);
  ok(r.ok); eq(CS.state.items.length, 1); ok(CS6.state.verificationLog.length >= 1);
});
t("非法流导致 L1 与 L2 一起回滚", () => {
  const n1 = CS.state.items.length, n2 = CS6.state.events.length;
  const r = PERSIST.commitBoth(d => { d.items.push({ id: "bad", content: "x", mtype: "fact", learnedAt: Date.now(), reviews: [], prereq: [], relates: [] }); },
    [{ stream: "no_such_stream", record: { kind: "x" } }]);
  ok(!r.ok); eq(CS.state.items.length, n1); eq(CS6.state.events.length, n2);
});
t("validateState 拦截重复 id / 越界 grade / 非法时间戳", () => {
  throws(() => CS.validateState({ schemaVersion: 4, items: [
    { id: "x", mtype: "fact", learnedAt: 1, reviews: [] }, { id: "x", mtype: "fact", learnedAt: 1, reviews: [] }] }), /重复条目/);
  throws(() => CS.validateState({ schemaVersion: 4, items: [
    { id: "x", mtype: "fact", learnedAt: 1, reviews: [{ t: 2, grade: 9 }] }] }), /越界/);
});
t("commitEvent 只写 L2 且失败回滚", () => {
  const n = CS6.state.consentLog.length;
  const r = PERSIST.commitEvent("consentLog", { feature: "healthReport", action: "grant", at: Date.now() });
  ok(r.ok); eq(CS6.state.consentLog.length, n + 1);
  const bad = PERSIST.commitEvent("consentLog", { action: "grant", at: Date.now() });
  ok(!bad.ok); eq(CS6.state.consentLog.length, n + 1);
});
t("导入拒绝 __proto__ 原型污染且全局原型干净", () => {
  throws(() => IMPORTV.normalizeImport('{"items":[],"__proto__":{"polluted":1}}'), /危险字段/);
  ok(!({}).polluted);
});
t("导入投影丢弃未登记字段、API Key 不恢复", () => {
  const r = IMPORTV.normalizeImport(JSON.stringify({ items: [
    { id: "i1", content: "abc", evil: "drop me", mtype: "hack" }],
    aiCfg: { provider: "glm", key: "sk-LEAK" } }));
  ok(r.state.items[0].evil === undefined);
  eq(r.state.items[0].mtype, "fact");
  eq(r.state.aiCfg.key, "");
});
t("历史 grade 映射为 gradeSelf 且不冒充回忆反应时", () => {
  const r = IMPORTV.normalizeImport(JSON.stringify({ items: [
    { id: "i1", content: "x", learnedAt: 1, reviews: [{ t: 2, grade: 3, conf: 0.7, rt: 1234 }] }] }));
  const rv = r.state.items[0].reviews[0];
  eq(rv.gradeSelf, 3); eq(rv.confidenceTiming, "legacy_unknown");
  eq(rv.legacyDurationMs, 1234); ok(rv.recallDurationMs === undefined);
});
t("孤儿事件只标记隔离，不猜测归属、不删除", () => {
  const r = IMPORTV.projectEventStore({ events: [
    { itemId: "a", t: 1, r: 0.8, y: 1, srcRef: "predictions#999", rPredSource: "frozen" },
    { itemId: "b", t: 2, r: 0.9, y: "bad" }] }, null);
  eq(r.report.dropped, 1);
  const o = IMPORTV.markOrphans(r.store.events, []);
  eq(o.orphans, 1); ok(o.events[0].orphan);
});
t("importBundle 校验→备份→双键原子提交→审计", () => {
  const text = JSON.stringify({ state: { items: [{ id: "z1", content: "导入条目", learnedAt: Date.now(), reviews: [] }] },
    eventStore: { events: [{ itemId: "z1", t: Date.now(), r: 0.8, y: 1, rPredSource: "frozen" }] } });
  const r = PERSIST.importBundle(text);
  ok(r.ok); eq(CS.state.items[0].id, "z1");
  ok(r.warnings.length > 0);
  ok(CS6.state.audit.some(a => a.action === "import_bundle"));
});

t("原始 L2 哈希链损坏时拒绝导入",()=>{
  const s=CS6.snapshot();
  s.events.push({seq:1,at:Date.now(),paramVersion:s.paramVersion,kind:"outcome",itemId:"x",t:Date.now(),r:0.8,y:1,ySource:"self",prevHash:"genesis",hash:"bad"});
  s.chainAlgorithm="fnv1a-1-integrity-only";
  ok(!IMPORTV.verifyRawEventStore(s).ok);
});
t("导出复核：API Key 字面值与凭据头均不出现", () => {
  CS.state.aiCfg.key = "sk-SUPER-SECRET-999";
  const b = EXPORTM.buildBundle({ apiKey: "sk-SUPER-SECRET-999" });
  eq(b.leaks.length, 0);
  ok(b.text.indexOf("sk-SUPER-SECRET-999") < 0);
  eq(EXPORTM.redactionLeaks('{"key":"sk-ABCDEFGH"}', "sk-ABCDEFGH").length > 0, true);
});
t("导出 manifest 计数/哈希自洽且含时间范围与版本", () => {
  const b = EXPORTM.buildBundle({});
  const v = EXPORTM.verifyBundle(b.bundle);
  ok(v.ok && v.manifestHashMatch && v.countsMatch);
  ok(b.bundle.manifest.dataRange.observations > 0);
  ok(b.bundle.manifest.paramVersion);
  ok(b.bundle.manifest.caveats.length >= 3);
});
t("JSONL 每行可独立解析，且占位 pct 不随导出外流", () => {
  const b = EXPORTM.buildBundle({});
  const lines = b.jsonl.trim() ? b.jsonl.trim().split("\n") : [];
  lines.forEach(l => ok(JSON.parse(l)));
  ok(b.text.indexOf('"pct"') < 0 || b.bundle.state.pcm.every(p => p.pct === undefined));
});
t("CSV 公式注入被转义", () => {
  const s = EXPORTM.toCSV({ items: [{ id: "=1+1", domain: "x", mtype: "fact", reviews: [{ t: 1, grade: 3 }] }] });
  ok(s.indexOf('"\'=1+1"') >= 0);
});
done();
