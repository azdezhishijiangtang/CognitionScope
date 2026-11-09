/* v9 · 端到端契约：AI 流式/重试/白名单/隐私（全离线 mock，不发真实请求） */
"use strict";
const H = require("./harness"), { createHarness, setupEnv, loadLogic } = H;
const { t, ta, ok, eq, throws, done } = createHarness("test.v9-contracts.js");
setupEnv(); const W = loadLogic();
const enc = s => "data: " + JSON.stringify({ choices: [{ delta: { content: s } }] }) + "\n\n";
function body(chunks) {
  let i = 0;
  return { read: async () => i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined } };
}
const hdr = get => ({ get });
// local provider 不需要 API Key，且 endpoint 在运行时白名单内
W.CS.load(); W.CS6.load();
W.CS.state.aiCfg = { provider: "local" };

t("运行时域名白名单：拒绝非白名单、拒绝远端 HTTP", () => {
  throws(() => W.AI.assertAllowedUrl("https://evil.example.com/chat"), /不在白名单内/);
  throws(() => W.AI.assertAllowedUrl("http://api.openai.com/v1/chat"), /HTTPS/);
  eq(W.AI.assertAllowedUrl("https://api.openai.com/v1/chat/completions"), "api.openai.com");
  eq(W.AI.assertAllowedUrl("http://localhost:11434/v1/chat/completions"), "localhost");
});

t("请求体只含固定 system prompt 与通用问题，stream 开关生效", () => {
  W.CS.state.profile = { name: "SECRET-NAME" };
  W.CS.state.items = [{ id: "PRIVATE-ID", content: "PRIVATE-CONTENT" }];
  const q = W.AI.buildRequest("解释间隔重复的理论基础",
    { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", key: "sk-test" },
    { stream: true });
  const s = JSON.stringify(q.body);
  ok(s.includes("解释间隔重复的理论基础"));
  ok(!s.includes("SECRET-NAME")); ok(!s.includes("PRIVATE-ID")); ok(!s.includes("PRIVATE-CONTENT"));
  eq(q.body.stream, true); eq(q.body.messages[0].content, W.AI.SYSTEM_PROMPT);
});

ta("429 遵循 Retry-After，退避后流式返回成功", async () => {
  const delays = []; let calls = 0, progressive = "";
  global.fetch = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 429, headers: hdr(k => k === "retry-after" ? "2" : null) };
    return { ok: true, status: 200, headers: hdr(() => null),
      body: body([enc("你"), enc("好") + "data: [DONE]\n\n"]) };
  };
  const ans = await W.AI.researchQuery("通用研究问题",
    (txt, prog) => { if (prog) progressive += txt; },
    { stream: true, maxRetries: 2, sleep: async ms => { delays.push(ms); } });
  eq(ans, "你好"); eq(progressive, "你好"); eq(calls, 2); eq(delays[0], 2000);
});

ta("网络错误自动重试后成功（非流式）", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls === 1) throw new Error("network failure");
    return { ok: true, status: 200, headers: hdr(() => null),
      json: async () => ({ choices: [{ message: { content: "恢复后的答案" } }] }) };
  };
  const ans = await W.AI.researchQuery("通用研究问题", null,
    { stream: false, maxRetries: 2, sleep: async () => {} });
  eq(ans, "恢复后的答案"); eq(calls, 2);
});

ta("达到重试上限后抛出，不无限循环", async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status: 503, headers: hdr(() => null) }; };
  let msg = null;
  try { await W.AI.researchQuery("通用研究问题", null, { maxRetries: 1, sleep: async () => {} }); }
  catch (e) { msg = e.message; }
  ok(msg && msg.includes("HTTP 503")); eq(calls, 2);
});

ta("外部取消立即中止且不发出任何请求", async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status: 429, headers: hdr(() => null) }; };
  const c = new AbortController(); c.abort();
  let msg = null;
  try { await W.AI.researchQuery("通用研究问题", null, { signal: c.signal, maxRetries: 3, sleep: async () => {} }); }
  catch (e) { msg = e.message; }
  eq(msg, "已取消"); eq(calls, 0);
});

ta("非流式路径保持向后兼容", async () => {
  global.fetch = async () => ({ ok: true, status: 200, headers: hdr(() => null),
    json: async () => ({ choices: [{ message: { content: "非流式答案" } }] }) });
  let out = null;
  const ans = await W.AI.researchQuery("通用研究问题", (txt, prog) => { if (!prog) out = txt; }, { stream: false });
  eq(ans, "非流式答案"); eq(out, "非流式答案");
});

t("v9 七个逻辑模块全部装载且版本登记正确", () => {
  const mods = { STREAM: "stream/9.0", SEARCH: "search/9.0", SNAP: "snap/9.0",
    INTEGRITY: "integrity/9.0", SENS: "sensitivity/9.0", SCED: "sced/9.0", REPLAY: "replay/9.0" };
  for (const [k, v] of Object.entries(mods)) { ok(!!W[k], k + " 未装载"); eq(W[k].VERSION, v); }
});

Promise.resolve(done()).catch(e => { console.error(e); process.exitCode = 1; });
