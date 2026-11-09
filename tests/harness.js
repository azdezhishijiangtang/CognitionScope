/* CognitionScope · tests/harness.js —— 零依赖测试框架
 * 统一断言风格；每个测试文件独立进程运行，输出以 ===== 行收尾，便于 run-all 汇总。
 */
"use strict";
function createHarness(title) {
  let pass = 0, fail = 0;
  const fails = [], pending = [];
  function t(name, fn) {
    try { fn(); pass++; console.log("  ok  " + name); }
    catch (e) { fail++; fails.push(name + " :: " + e.message); console.log("  FAIL " + name + " :: " + e.message); }
  }
  /** 异步测试：串行执行（共享全局桩如 fetch 不会被并发覆盖），done() 等待全部完成 */
  let queue = Promise.resolve();
  function ta(name, fn) {
    queue = queue.then(() => Promise.resolve().then(fn)).then(
      () => { pass++; console.log("  ok  " + name); },
      e => { fail++; fails.push(name + " :: " + e.message); console.log("  FAIL " + name + " :: " + e.message); }
    );
    pending.push(queue);
  }
  function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy, got " + v); }
  function eq(a, b, msg) {
    if (a !== b) throw new Error((msg || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a));
  }
  function near(a, b, eps, msg) {
    if (!(Math.abs(a - b) <= (eps == null ? 1e-9 : eps)))
      throw new Error((msg || "") + " expected ≈" + b + " got " + a);
  }
  function throws(fn, re, msg) {
    let e = null; try { fn(); } catch (x) { e = x; }
    if (!e) throw new Error((msg || "") + " 期望抛错但没抛");
    if (re && !re.test(String(e.message))) throw new Error((msg || "") + " 抛错信息不匹配：" + e.message);
    return e;
  }
  function done() {
    const emit = () => {
      console.log(`===== ${title}: ${pass} passed, ${fail} failed =====`);
      if (fails.length) console.log(fails.map(x => "  · " + x).join("\n"));
      if (fail) process.exitCode = 1;
      return { pass, fail };
    };
    if (!pending.length) return emit();
    return Promise.all(pending).then(emit);
  }
  return { t, ta, ok, eq, near, throws, done };
}

/** 建立最小浏览器环境：window / localStorage / performance */
function setupEnv(opts) {
  const o = opts || {};
  const store = o.store || {};
  global.window = global;
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  global.performance = global.performance || { now: () => Date.now() };
  global.TextEncoder = global.TextEncoder || require("util").TextEncoder;
  return { store };
}

/** 按 index.html 的加载顺序装载全部逻辑模块（不含 UI 模块） */
function loadLogic() {
  const files = ["core", "state6", "persistence", "import-validator", "export-manifest",
    "verification", "timing", "metrics", "lab-metrics", "calibration", "probes",
    "parameters", "forecast", "experiments", "protocols", "hypothesis", "consent",
    "stream", "search", "snapshots", "integrity", "sensitivity", "sced", "replay",
    "engine2", "lab", "ai"];
  for (const f of files) require("../js/" + f + ".js");
  return window;
}

module.exports = { createHarness, setupEnv, loadLogic };
