/* CognitionScope · SSE 增量解析与重试策略
 * 零 DOM、零网络：不发起 fetch，只解析响应体与计算重试策略。
 * 覆盖：UTF-8 跨块割裂 / CRLF / 多行 data / 心跳注释 / [DONE] / 畸形 JSON 隔离 /
 *       429 与 5xx 指数退避 + 抖动 / 用户取消不重试。
 */
"use strict";
window.STREAM = (function () {
  const VERSION = "stream/9.0";

  function newState() {
    return { buf: "", events: [], done: false, lastEventId: "", heartbeats: 0,
      malformed: 0, retryMs: null, bytes: 0 };
  }

  function normalize(s) { return String(s).replace(/\r\n/g, "\n").replace(/\r/g, "\n"); }

  function consumeBlock(block, st) {
    const lines = block.split("\n");
    let data = [], event = "message", id = "";
    for (const line of lines) {
      if (line === "") continue;
      if (line.charAt(0) === ":") { st.heartbeats++; continue; }
      const i = line.indexOf(":");
      const field = i < 0 ? line : line.slice(0, i);
      let value = i < 0 ? "" : line.slice(i + 1);
      if (value.charAt(0) === " ") value = value.slice(1);
      if (field === "data") data.push(value);
      else if (field === "event") event = value;
      else if (field === "id") id = value;
      else if (field === "retry" && Number.isFinite(+value)) st.retryMs = +value;
    }
    if (!data.length) return;
    const payload = data.join("\n");
    if (payload === "[DONE]") { st.done = true; return; }
    let json = null, malformed = false;
    try { json = JSON.parse(payload); } catch (_) { malformed = true; st.malformed++; }
    st.events.push({ event, id, data: payload, json, malformed });
    if (id) st.lastEventId = id;
  }

  /** 增量喂入一段文本；未完成块留在 st.buf */
  function parseSSEText(text, st) {
    const s = st || newState();
    const raw = s.buf + normalize(text);
    const blocks = raw.split("\n\n");
    s.buf = blocks.pop() || "";
    for (const b of blocks) consumeBlock(b, s);
    return s;
  }

  /** 流结束：把没有尾部空行的最后一块冲刷成事件 */
  function finish(st) {
    if (st.buf.trim()) { const b = st.buf; st.buf = ""; consumeBlock(b, st); }
    return st;
  }

  function extractDelta(json) {
    if (!json || typeof json !== "object") return "";
    const c = json.choices && json.choices[0];
    if (!c) return "";
    if (c.delta && typeof c.delta.content === "string") return c.delta.content;
    if (c.message && typeof c.message.content === "string") return c.message.content;
    return "";
  }

  function textDecoder() {
    return (typeof TextDecoder === "function") ? new TextDecoder("utf-8") : null;
  }
  function decodePart(part, dec) {
    if (typeof part === "string") return part;
    const bytes = part instanceof Uint8Array ? part : new Uint8Array(part || []);
    if (dec) return dec.decode(bytes, { stream: true });
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("utf8");
    let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  /**
   * 读取一个 ReadableStream（或 {read()} reader），累积文本。
   * opts: onDelta(text), onEvent(ev), signal, maxEvents
   */
  async function collect(body, opts) {
    const o = opts || {};
    const st = newState(), dec = textDecoder();
    let text = "", usage = null, nEvents = 0;
    const reader = (body && typeof body.getReader === "function") ? body.getReader() : body;
    if (!reader || typeof reader.read !== "function") throw new Error("响应体不可读");
    const maxChunks = o.maxChunks == null ? 100000 : o.maxChunks;
    let nChunks = 0;

    function drain() {
      for (const ev of st.events.splice(0)) {
        nEvents++;
        if (o.onEvent) o.onEvent(ev);
        if (ev.json && ev.json.usage) usage = ev.json.usage;
        const d = extractDelta(ev.json);
        if (d) { text += d; if (o.onDelta) o.onDelta(d); }
      }
    }

    while (true) {
      if (o.signal && o.signal.aborted) { const e = new Error("已取消"); e.name = "AbortError"; throw e; }
      const chunk = await reader.read();
      nChunks++;
      if (nChunks > maxChunks) { const e = new Error("流分块数超过上限 " + maxChunks); e.name = "StreamLimit"; throw e; }
      if (chunk.done) break;
      if (chunk.value == null) continue;
      const part = decodePart(chunk.value, dec);
      st.bytes += part.length;
      parseSSEText(part, st);
      drain();
      if (st.done) break;
      if (o.maxEvents && nEvents >= o.maxEvents) break;
    }
    if (dec) { const rest = dec.decode(); if (rest) { st.bytes += rest.length; parseSSEText(rest, st); } }
    finish(st);
    drain();
    return { text, usage, done: st.done, events: nEvents, malformed: st.malformed,
      heartbeats: st.heartbeats, lastEventId: st.lastEventId, bytes: st.bytes,
      retryMs: st.retryMs, VERSION };
  }

  /** 指数退避 + 对称抖动；rng 可注入以保证测试确定性 */
  function retryDelay(attempt, opts) {
    const o = opts || {};
    const base = o.baseMs == null ? 500 : o.baseMs;
    const cap = o.capMs == null ? 8000 : o.capMs;
    const factor = o.factor == null ? 2 : o.factor;
    const jitter = o.jitter == null ? 0.2 : o.jitter;
    const exp = Math.min(cap, base * Math.pow(factor, Math.max(0, attempt - 1)));
    const r = (o.rng || Math.random)();
    return Math.round(exp * (1 - jitter + 2 * jitter * r));
  }

  function shouldRetry(status, err, attempt, opts) {
    const o = opts || {}, max = o.maxRetries == null ? 3 : o.maxRetries;
    if (err && err.name === "AbortError") return { retry: false, reason: "用户取消，不重试", delay: 0 };
    if (attempt > max) return { retry: false, reason: "重试次数已达上限", delay: 0 };
    if (status === 429 || status === 408 || (status >= 500 && status < 600)) {
      const d = status === 429 && err && Number.isFinite(err.retryAfterMs)
        ? err.retryAfterMs : retryDelay(attempt, o);
      return { retry: true, reason: "可重试状态 " + status, delay: d };
    }
    if (err && /timeout|network|fetch|econn|socket/i.test(String(err.name) + " " + String(err.message))) {
      return { retry: true, reason: "网络或超时错误", delay: retryDelay(attempt, o) };
    }
    return { retry: false, reason: "不可重试（客户端错误或解析失败）", delay: 0 };
  }

  return { VERSION, newState, parseSSEText, finish, extractDelta, collect,
    retryDelay, shouldRetry };
})();
