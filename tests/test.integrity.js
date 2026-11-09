/* v9 · Web Crypto 完整性锚点（异步；明确不声称防伪） */
"use strict";
const H = require("./harness"), { createHarness, setupEnv, loadLogic } = H;
const { ta, ok, eq, done } = createHarness("test.integrity.js");
setupEnv();
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  try { globalThis.crypto = require("crypto").webcrypto; } catch (_) {}
}
const W = loadLogic(); const I = W.INTEGRITY;
const SALT = "ab".repeat(16), PASS = "correct-horse-battery";
const snap = { schema: 6, paramVersion: "v7-init",
  streams: [{ name: "audit", n: 2, firstAt: 1, lastAt: 2, tail: "00ff" }],
  chainOk: true, checked: 2 };

ta("Web Crypto 能力与诚实声明", async () => {
  const a = I.available();
  ok(a.ok, "本环境应有 Web Crypto：" + a.note);
  eq(a.algo, "HMAC-SHA256");
  ok(I.HUMAN_NOTE.includes("不是密码学防伪"));
  ok(I.HUMAN_NOTE.includes("外部"));
});

ta("seal / verify：正确口令通过", async () => {
  const r = await I.seal(snap, PASS, { saltHex: SALT, iterations: 1000, now: 123 });
  ok(r.ok, r.reason);
  eq(r.anchor.format, "cognitionscope.anchor/1");
  eq(r.anchor.algo, "HMAC-SHA256"); eq(r.anchor.kdf, "PBKDF2-SHA256");
  eq(r.anchor.sealedAt, 123);
  ok(r.anchor.mac.length === 64, "HMAC-SHA256 应为 64 位十六进制");
  const v = await I.verify(r.anchor, snap, PASS);
  ok(v.ok, v.reason);
});

ta("错误口令校验失败", async () => {
  const r = await I.seal(snap, PASS, { saltHex: SALT, iterations: 1000 });
  const v = await I.verify(r.anchor, snap, "wrong-password");
  ok(!v.ok); ok(v.reason.includes("口令错误") || v.reason.includes("校验失败"));
});

ta("链摘要变化校验失败（事件增删或回滚）", async () => {
  const r = await I.seal(snap, PASS, { saltHex: SALT, iterations: 1000 });
  const changed = JSON.parse(JSON.stringify(snap)); changed.checked = 3;
  const v = await I.verify(r.anchor, changed, PASS);
  ok(!v.ok); ok(v.reason.includes("链摘要已变化"));
});

ta("弱口令 / 空口令 / 空快照一律拒绝，不降级", async () => {
  ok(!(await I.seal(snap, "short", { saltHex: SALT, iterations: 1000 })).ok);
  ok(!(await I.seal(snap, "", { saltHex: SALT, iterations: 1000 })).ok);
  ok(!(await I.seal(null, PASS, { saltHex: SALT, iterations: 1000 })).ok);
  ok(!(await I.verify(null, snap, PASS)).ok);
  ok(!(await I.verify({ format: "bad" }, snap, PASS)).ok);
});

ta("canonical 键顺序无关；fromCS6 生成确定性摘要", async () => {
  eq(I.canonical({ a: 1, b: 2 }), I.canonical({ b: 2, a: 1 }));
  W.CS6.load();
  const a = I.fromCS6(W.CS6), b = I.fromCS6(W.CS6);
  ok(a && b); eq(I.canonical(a), I.canonical(b));
  eq(a.streams.length, 13); eq(a.chainOk, true);
});

ta("toHex / fromHex 往返一致", async () => {
  eq(I.toHex(I.fromHex("00ff10")), "00ff10");
});

Promise.resolve(done()).catch(e => { console.error(e); process.exitCode = 1; });
