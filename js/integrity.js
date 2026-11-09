/* CognitionScope · 带密钥的完整性锚点（Web Crypto HMAC-SHA256）
 * 目标：把「本地 FNV 链谁都能重算」升级为「无口令者无法重签」，并允许用户把
 * 锚点保存到本设备之外作外部比对。
 * 诚实边界：这不是密码学防伪，也不建立信任根。页面可被本地替换、口令可被截获、
 * 锚点若只存在本地则毫无意义。详见 HUMAN_NOTE 与 SECURITY-PRIVACY.md。
 */
"use strict";
window.INTEGRITY = (function () {
  const VERSION = "integrity/9.0";
  const ALGO = "HMAC-SHA256", KDF = "PBKDF2-SHA256";
  const HUMAN_NOTE = "HMAC 只能证明「持有口令者曾对这份链摘要签名」。拥有本地写权限且能取得口令或替换页面的人仍可重算并重签；锚点必须保存在本设备之外（另一台设备、纸质记录、版本库）才有比对意义。这不是密码学防伪，不替代外部信任根，也不使本地数据不可篡改。";

  function cryptoObj() {
    if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto;
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) return window.crypto;
    return null;
  }
  function available() {
    const c = cryptoObj();
    return { ok: !!c, algo: c ? ALGO : null, kdf: c ? KDF : null,
      note: c ? "Web Crypto 可用" : "当前环境不支持 Web Crypto，密封功能不可用（不降级为弱校验）" };
  }
  function toHex(bytes) {
    return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function fromHex(h) {
    const a = new Uint8Array(Math.floor(String(h).length / 2));
    for (let i = 0; i < a.length; i++) a[i] = parseInt(String(h).substr(i * 2, 2), 16);
    return a;
  }
  function randomHex(n) {
    const c = cryptoObj(); if (!c || !c.getRandomValues) throw new Error("安全随机数不可用");
    return toHex(c.getRandomValues(new Uint8Array(n)));
  }
  function stable(v) {
    if (v == null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  }

  /** 从 L2 快照 + 每流尾哈希构造确定性、可外部复算的摘要对象 */
  function fromCS6(CS6) {
    if (!CS6 || typeof CS6.snapshot !== "function") return null;
    const s = CS6.stats(), tails = {};
    for (const k of Object.keys(CS6.STREAMS)) tails[k] = CS6.tailHash(k);
    return { schema: s.schemaVersion, paramVersion: s.paramVersion,
      streams: Object.keys(s.streams).sort().map(k => ({ name: k, n: s.streams[k].n,
        firstAt: s.streams[k].firstAt, lastAt: s.streams[k].lastAt, tail: tails[k] })),
      chainOk: !!(s.chain && s.chain.ok), checked: s.chain ? s.chain.checked : 0 };
  }
  function canonical(snapshot) { return stable(snapshot); }

  async function deriveKey(passphrase, saltHex, iterations) {
    const c = cryptoObj(); if (!c) throw new Error("Web Crypto 不可用");
    const enc = new TextEncoder();
    const base = await c.subtle.importKey("raw", enc.encode(String(passphrase)), "PBKDF2", false, ["deriveKey"]);
    return c.subtle.deriveKey({ name: "PBKDF2", salt: fromHex(saltHex),
      iterations: iterations, hash: "SHA-256" }, base,
      { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
  }
  async function macOf(key, payload) {
    const c = cryptoObj();
    return toHex(await c.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  }

  /** seal(snapshot, passphrase, {saltHex, iterations, now, label}) */
  async function seal(snapshot, passphrase, opts) {
    const o = opts || {};
    const c = cryptoObj();
    if (!c) return { ok: false, reason: "Web Crypto 不可用，拒绝降级为弱校验" };
    if (!passphrase || String(passphrase).length < 8) return { ok: false, reason: "口令至少 8 位；不设置口令则无法密封" };
    if (!snapshot) return { ok: false, reason: "缺少链快照" };
    const iterations = o.iterations || 100000;
    let saltHex;
    try { saltHex = o.saltHex || randomHex(16); } catch (e) { return { ok: false, reason: e.message }; }
    const payload = canonical(snapshot);
    try {
      const key = await deriveKey(passphrase, saltHex, iterations);
      const mac = await macOf(key, payload);
      return { ok: true, anchor: {
        VERSION, format: "cognitionscope.anchor/1", algo: ALGO, kdf: KDF,
        iterations, saltHex, payload, mac,
        sealedAt: o.now == null ? Date.now() : o.now,
        label: String(o.label || "L2 链锚点"),
        humanNote: HUMAN_NOTE,
        externalAction: "请把本锚点原文保存到本设备之外；只留在本机等于没有锚点"
      } };
    } catch (e) { return { ok: false, reason: "密封失败：" + e.message }; }
  }

  /** verify(anchor, snapshot, passphrase) —— 错误口令或链变化都会失败 */
  async function verify(anchor, snapshot, passphrase) {
    if (!anchor || anchor.format !== "cognitionscope.anchor/1") return { ok: false, reason: "锚点格式不符" };
    const c = cryptoObj();
    if (!c) return { ok: false, reason: "Web Crypto 不可用" };
    if (!passphrase) return { ok: false, reason: "未提供口令" };
    const payload = canonical(snapshot);
    if (payload !== anchor.payload) return { ok: false, reason: "链摘要已变化（事件增删、回滚或篡改）" };
    try {
      const key = await deriveKey(passphrase, anchor.saltHex, anchor.iterations || 100000);
      const mac = await macOf(key, payload);
      return { ok: mac === anchor.mac, reason: mac === anchor.mac ? "锚点与当前链一致" : "口令错误或锚点被替换",
        recomputedMac: mac, humanNote: HUMAN_NOTE };
    } catch (e) { return { ok: false, reason: "校验失败：" + e.message }; }
  }

  return { VERSION, ALGO, KDF, HUMAN_NOTE, available, toHex, fromHex,
    stable, canonical, fromCS6, seal, verify };
})();
