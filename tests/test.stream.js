/* v9 · SSE 增量解析与重试策略（离线合约测试，不联网） */
"use strict";
const H = require("./harness"), { createHarness, setupEnv, loadLogic } = H;
const { t, ta, ok, eq, throws, done } = createHarness("test.stream.js");
setupEnv(); const W = loadLogic(); const S = W.STREAM;
const enc = s => new TextEncoder().encode(s);
const ev = o => "data: " + JSON.stringify(o) + "\n\n";
const delta = txt => ev({ choices: [{ delta: { content: txt } }] });
function reader(chunks) {
  let i = 0;
  return { read: async () => i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined } };
}

t("版本与导出完整", () => {
  eq(S.VERSION, "stream/9.0");
  for (const k of ["parseSSEText", "finish", "extractDelta", "collect", "retryDelay", "shouldRetry"]) ok(typeof S[k] === "function", k);
});

t("CRLF 分隔符与 [DONE] 正确处理", () => {
  const st = S.newState();
  S.parseSSEText('data: {"choices":[{"delta":{"content":"甲"}}]}\r\n\r\ndata: [DONE]\r\n\r\n', st);
  eq(st.events.length, 1); eq(S.extractDelta(st.events[0].json), "甲"); ok(st.done);
});

t("多行 data 合并为单个 JSON 事件", () => {
  const st = S.newState();
  S.parseSSEText('data: {"x":1,\ndata: "y":2}\n\n', st);
  eq(st.events.length, 1); eq(st.events[0].json.x, 1); eq(st.events[0].json.y, 2);
});

t("心跳注释、event/id/retry 字段", () => {
  const st = S.newState();
  S.parseSSEText(': ping\nretry: 1500\nevent: message\nid: e-9\ndata: {"ok":true}\n\n', st);
  eq(st.heartbeats, 1); eq(st.retryMs, 1500); eq(st.lastEventId, "e-9");
  eq(st.events.length, 1); eq(st.events[0].event, "message");
});

t("畸形 JSON 被隔离且不中断后续事件", () => {
  const st = S.newState();
  S.parseSSEText("data: {broken\n\n" + delta("好") + "\n\n", st);
  eq(st.events.length, 2); ok(st.events[0].malformed); eq(st.malformed, 1);
  eq(S.extractDelta(st.events[1].json), "好");
});

t("流末尾无空行时 finish 冲刷最后一个事件", () => {
  const st = S.newState();
  S.parseSSEText(delta("尾").trimEnd(), st);
  eq(st.events.length, 0);
  S.finish(st); eq(st.events.length, 1); eq(S.extractDelta(st.events[0].json), "尾");
});

ta("UTF-8 中文被切在字节中间仍可正确解码", async () => {
  const bytes = enc(delta("间隔重复与检索练习"));
  const cut = Math.floor(bytes.length / 2);
  const r = await S.collect(reader([bytes.slice(0, cut), bytes.slice(cut)]), {});
  eq(r.text, "间隔重复与检索练习"); ok(r.bytes > 0); eq(r.malformed, 0);
});

ta("collect 累积 delta / usage / 事件统计", async () => {
  const chunks = [
    delta("A") + delta("B"),
    ev({ choices: [{ delta: { content: "C" } }], usage: { total_tokens: 3 } }) + "data: [DONE]\n\n"
  ];
  let seen = "";
  const r = await S.collect(reader(chunks.map(enc)), { onDelta: d => { seen += d; } });
  eq(r.text, "ABC"); eq(seen, "ABC"); eq(r.events, 3);
  ok(r.done); eq(r.usage.total_tokens, 3); eq(r.heartbeats, 0);
});

ta("reader 永不结束时按分块上限中止，不死循环", async () => {
  let name = null;
  const endless = { read: async () => ({ done: false, value: null }) };
  try { await S.collect(endless, { maxChunks: 3 }); } catch (e) { name = e.name; }
  eq(name, "StreamLimit");
});

ta("collect 遇到取消信号抛出 AbortError", async () => {
  const ctrl = new AbortController(); ctrl.abort();
  let name = null;
  try { await S.collect(reader([enc(delta("x"))]), { signal: ctrl.signal }); } catch (e) { name = e.name; }
  eq(name, "AbortError");
});

t("retryDelay 确定性、指数增长与上限", () => {
  const o = { baseMs: 100, capMs: 1000, factor: 2, jitter: 0, rng: () => 0.5 };
  eq(S.retryDelay(1, o), 100); eq(S.retryDelay(3, o), 400); eq(S.retryDelay(10, o), 1000);
  const j = S.retryDelay(1, { baseMs: 100, capMs: 1000, jitter: 0.2, rng: () => 0 });
  eq(j, 80);
});

t("shouldRetry 分类：429/5xx/客户端错误/上限/取消/retry-after", () => {
  ok(S.shouldRetry(429, null, 1, {}).retry);
  ok(S.shouldRetry(500, null, 1, {}).retry);
  ok(!S.shouldRetry(400, null, 1, {}).retry);
  ok(!S.shouldRetry(429, null, 4, { maxRetries: 3 }).retry);
  const e = new Error("x"); e.name = "AbortError";
  ok(!S.shouldRetry(429, e, 1, {}).retry);
  eq(S.shouldRetry(429, null, 1, { baseMs: 100, jitter: 0, rng: () => 0.5 }).delay, 100);
  const e2 = new Error("HTTP 429"); e2.retryAfterMs = 3000; e2.name = "HttpError";
  eq(S.shouldRetry(429, e2, 1, {}).delay, 3000);
});

Promise.resolve(done()).catch(e => { console.error(e); process.exitCode = 1; });
