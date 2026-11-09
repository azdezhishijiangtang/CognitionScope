/* v9 · 导出包浏览器端回放（只读、不写存储） */
"use strict";
const H = require("./harness"), { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, done } = createHarness("test.replay.js");
setupEnv(); const W = loadLogic(); const R = W.REPLAY;
const l1 = { schemaVersion: 4, items: [{ id: "i1", content: "条目", reviews: [] }], reviews: [], lab: [], pcm: [] };
const built = W.EXPORTM.buildBundle({ l1, synthetic: true });

t("版本与合法导出包回放通过", () => {
  eq(R.VERSION, "replay/9.0");
  const r = R.replay(built.text, { items: [] });
  ok(r.ok, JSON.stringify(r.summary)); eq(r.stage, "verified");
  eq(r.checks.manifest.ok, true);
  eq(r.checks.redaction.ok, true);
  eq(r.checks.chain.ok, true);
  eq(r.summary.nItems, 1);
  eq(r.diff.added.length, 1);
  ok(r.report.join(" ").includes("不写入当前存储"));
});

t("非法 JSON / 格式 / 缺字段被明确拒绝", () => {
  eq(R.replay("{坏 JSON").stage, "parse");
  eq(R.replay(JSON.stringify({ format: "other/1" })).stage, "format");
  eq(R.replay(JSON.stringify({ format: "cognitionscope.bundle/1", manifest: {}, state: null })).stage, "structure");
  ok(!R.replay("{}").ok);
});

t("篡改 manifestHash 被检出", () => {
  const b = JSON.parse(built.text); b.manifest.manifestHash = "deadbeef";
  const r = R.replay(JSON.stringify(b), { items: [] });
  ok(!r.ok); ok(r.checks.manifest.manifestHashMatch === false);
  ok(r.summary.failedChecks.includes("manifest"));
});

t("残留凭据触发脱敏复核失败", () => {
  const b = JSON.parse(built.text); b.state.leaked = { key: "sk-ABCDEFGHIJKL" };
  const r = R.replay(JSON.stringify(b), { items: [] });
  ok(!r.ok); eq(r.checks.redaction.ok, false);
  ok(r.checks.redaction.hits.length > 0);
});

t("diff 列出与当前状态的差异", () => {
  const cur = { items: [{ id: "i1", content: "已改" }, { id: "i9", content: "仅本地有" }] };
  const r = R.replay(built.text, cur);
  eq(r.diff.changed.length, 1); eq(r.diff.removed.length, 1);
  eq(r.diff.added.length, 0);
});

t("回放不写任何 localStorage 键", () => {
  const keys = ["cogscope_v1", "cogscope_v6_events", "cogscope_v9_snapshots"];
  const before = keys.map(k => [k, localStorage.getItem(k)]);
  R.replay(built.text, { items: [] });
  eq(JSON.stringify(keys.map(k => [k, localStorage.getItem(k)])), JSON.stringify(before));
});

t("parseBundle / checks / diff 可独立调用", () => {
  ok(R.parseBundle(built.text).ok);
  ok(!R.parseBundle("x").ok);
  ok(R.checks(built.bundle));
  ok(R.diff({ items: [] }, built.bundle));
});

done();
