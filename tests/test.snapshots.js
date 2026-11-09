/* v9 · 环形快照与时间旅行（L2 事件层不回滚） */
"use strict";
const H = require("./harness"), { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, done } = createHarness("test.snapshots.js");
setupEnv(); const W = loadLogic(); const S = W.SNAP;
const l1 = { schemaVersion: 4, items: [{ id: "i1", content: "甲" }, { id: "i2", content: "乙" }] };
const l2 = { schemaVersion: 6 };

t("版本与摘要算法确定性", () => {
  eq(S.VERSION, "snap/9.0");
  eq(S.digest({ a: 1, b: [2, 3] }), S.digest({ b: [2, 3], a: 1 }), "键顺序不影响摘要");
  ok(S.digest({ a: 1 }) !== S.digest({ a: 2 }));
});

t("capture / verify 与篡改检测", () => {
  const rec = S.capture(l1, l2, { now: 1000, label: "测试快照" });
  eq(rec.at, 1000); eq(rec.nItems, 2); eq(rec.l1Schema, 4);
  ok(S.verify(rec));
  const bad = JSON.parse(JSON.stringify(rec)); bad.l1.items[0].content = "被改";
  ok(!S.verify(bad), "内容改动必须使摘要失配");
  ok(!S.verify(null)); ok(!S.verify({}));
});

t("push 环形容量淘汰最早快照", () => {
  let list = [];
  for (let i = 0; i < 5; i++) list = S.push(list, S.capture({ items: [] }, {}, { now: i, label: "s" + i }), 3);
  eq(list.length, 3); eq(list[0].label, "s2"); eq(list[2].label, "s4");
});

t("save / loadAll 持久化并过滤损坏记录", () => {
  const a = S.capture(l1, l2, { now: 1 }), b = S.capture({ items: [] }, {}, { now: 2 });
  ok(S.save([a, b]));
  eq(S.loadAll().length, 2);
  const broken = JSON.parse(JSON.stringify(a)); broken.l1.items.pop();
  localStorage.setItem(S.KEY, JSON.stringify([a, broken, b]));
  eq(S.loadAll().length, 2, "损坏记录应被过滤");
  localStorage.setItem(S.KEY, "{不是 JSON");
  eq(S.loadAll().length, 0);
});

t("diff 精确列出新增 / 删除 / 变更", () => {
  const before = { items: [{ id: "1", content: "A" }, { id: "2", content: "B" }] };
  const after = { items: [{ id: "2", content: "B2" }, { id: "3", content: "C" }] };
  const d = S.diff(before, after);
  eq(JSON.stringify(d.added), '["3"]'); eq(JSON.stringify(d.removed), '["1"]');
  eq(JSON.stringify(d.changed), '["2"]'); ok(!d.identical);
  ok(S.diff(before, before).identical);
});

t("配额不足时自动淘汰最旧快照直至写入成功", () => {
  const orig = localStorage.setItem;
  let calls = 0;
  localStorage.setItem = (k, v) => {
    if (k === S.KEY) { calls++; if (calls <= 2) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } }
    return orig(k, v);
  };
  const list = [1, 2, 3, 4].map(i => S.capture({ items: [] }, {}, { now: i, label: "s" + i }));
  const r = S.saveWithEviction(list);
  ok(r.ok); eq(r.dropped, 2); eq(r.kept, 2);
  eq(S.loadAll().length, 2);
  localStorage.setItem = orig;
});

t("restore 只恢复 L1、不回滚 L2，并写入 audit", () => {
  const rec = S.capture(l1, l2, { now: 7 });
  const drafts = [], audits = [];
  const P = { commitState(fn) { const d = { old: true, items: [] }; fn(d); drafts.push(d); return { ok: true, persisted: true }; } };
  const CS6 = { append(stream, body) { audits.push({ stream, body }); return { ok: true, record: { seq: 9 } }; } };
  const r = S.restore(rec, P, CS6);
  ok(r.ok); eq(r.restoredL1, true); eq(r.l2RolledBack, false); eq(r.auditSeq, 9);
  eq(drafts[0].items.length, 2);
  ok(!("old" in drafts[0]), "旧状态键必须被清空");
  eq(audits[0].stream, "audit"); eq(audits[0].body.action, "snapshot_restore");
});

t("损坏快照 / 缺少 PERSIST / 提交失败一律拒绝", () => {
  const rec = S.capture(l1, l2, { now: 8 });
  const bad = JSON.parse(JSON.stringify(rec)); bad.l1.items.pop();
  ok(!S.restore(bad, {}, null).ok);
  ok(!S.restore(rec, null, null).ok);
  const P = { commitState: () => ({ ok: false, error: "QUOTA" }) };
  ok(!S.restore(rec, P, null).ok);
});

done();
