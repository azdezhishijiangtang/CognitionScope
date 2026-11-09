/* CognitionScope · 导出包浏览器端回放与可验证性报告
 * 不写当前存储、不修改 L1/L2、不联网。只做：解析 → manifest 复算 → 脱敏复核 →
 * 与当前状态结构化 diff → 生成报告。回答「这份导出包能不能被独立验证」。
 */
"use strict";
window.REPLAY = (function () {
  const VERSION = "replay/9.0";

  function parseBundle(text) {
    let b;
    try { b = (typeof text === "string") ? JSON.parse(text) : text; }
    catch (e) { return { ok: false, stage: "parse", reason: "JSON 解析失败：" + e.message }; }
    if (!b || typeof b !== "object" || Array.isArray(b)) return { ok: false, stage: "parse", reason: "不是对象" };
    if (b.format !== "cognitionscope.bundle/1") return { ok: false, stage: "format", reason: "格式不符（期望 cognitionscope.bundle/1）" };
    if (!b.manifest || typeof b.manifest !== "object") return { ok: false, stage: "structure", reason: "缺少 manifest" };
    if (!b.state || typeof b.state !== "object") return { ok: false, stage: "structure", reason: "缺少 state" };
    return { ok: true, bundle: b };
  }

  function checks(bundle) {
    const out = { VERSION };
    if (window.EXPORTM && typeof window.EXPORTM.verifyBundle === "function") {
      out.manifest = window.EXPORTM.verifyBundle(bundle);
    } else out.manifest = { ok: null, reason: "EXPORTM 未装载，跳过 manifest 复算" };
    if (window.EXPORTM && typeof window.EXPORTM.redactionLeaks === "function") {
      const hits = window.EXPORTM.redactionLeaks(JSON.stringify(bundle), "");
      out.redaction = { ok: hits.length === 0, hits };
    } else out.redaction = { ok: null, reason: "EXPORTM 未装载，跳过脱敏复核" };
    const m = bundle.manifest || {};
    out.chain = m.chainIntegrity && typeof m.chainIntegrity.ok === "boolean"
      ? { ok: m.chainIntegrity.ok, checked: m.chainIntegrity.checked, reported: true }
      : { ok: null, reported: false, reason: "导出包未附带链完整性结论" };
    out.schema = { ok: Number.isFinite(bundle.state.schemaVersion),
      l1: bundle.state.schemaVersion, note: "L1 schema 应为 4；L2 事件层保持 schema 6" };
    return out;
  }

  function diff(current, bundle) {
    if (window.SNAP && typeof window.SNAP.diff === "function") {
      return window.SNAP.diff(current || {}, (bundle && bundle.state) || {});
    }
    return null;
  }

  function replay(text, current, opts) {
    const o = opts || {};
    const p = parseBundle(text);
    if (!p.ok) return { ok: false, VERSION, stage: p.stage, reason: p.reason, checks: {}, diff: null };
    const b = p.bundle, c = checks(b), d = o.skipDiff ? null : diff(current, b);
    const fails = Object.keys(c).filter(k => c[k] && c[k].ok === false);
    const nItems = Array.isArray(b.state.items) ? b.state.items.length : null;
    return {
      ok: fails.length === 0, VERSION, stage: "verified", checks: c, diff: d,
      summary: {
        format: b.format, nItems,
        manifestHash: b.manifest.manifestHash || null,
        exportedAt: b.manifest.exportedAt || b.manifest.at || null,
        failedChecks: fails
      },
      report: [
        "回放不写入当前存储，也不修改 L1/L2；这是一份只读可验证性报告",
        "manifest 复算：对导出时的计数与哈希做外部复算，不是对导出者身份的认证",
        "脱敏复核：只检查 key 字面值、残留 key 字段与 Bearer 凭据，不保证穷尽",
        "链完整性：若导出包未附带链结论，本项标注为未提供，不推断为通过",
        "差异：按 items[].id 比较当前状态与导出包，列出新增 / 删除 / 变更",
        "来源完整性：客户端无法证明数据未被本地修改；如需外部比对请使用完整性锚点"
      ],
      note: "浏览器端回放验证的是包内自洽性，不是数据来源的真实性或密码学防伪"
    };
  }

  return { VERSION, parseBundle, checks, diff, replay };
})();
