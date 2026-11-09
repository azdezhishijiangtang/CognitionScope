/* CognitionScope · v5 集成验证（零依赖、零 DOM）
 * 覆盖：调度截断 / 随机探针 / 回放校准 / 双决策门槛 / 无泄漏 / 阈值前沿
 *       / 事务写入正常与失败双回滚 / 导入回滚 / v3 历史基线回归
 * 运行：node tests/v5.integration.js
 */
"use strict";
global.window = global;
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.performance = { now: () => Date.now() };
const BASE = __dirname + "/../js/";
require(BASE + "core.js");
require(BASE + "calibration.js");
require(BASE + "persistence.js");
const CS = window.CS, CAL = window.CAL, P = window.PERSIST;
const DAY = 86400000, T0 = Date.now() - 130 * DAY, TAU = 0.9, PROBE_P = 0.05;
let pass = 0, fail = 0;
function ok(v, msg) { if (v) { pass++; console.log("  ok  " + msg); } else { fail++; console.log("  FAIL " + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + " (got " + JSON.stringify(a) + ")"); }

/* ---------- 场景生成器 ---------- */
function simulate(mode, seed0) {
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const items = [], probeLog = [];
  for (let i = 0; i < 40; i++) {
    const it = { id: "i" + i, mtype: "fact", learnedAt: T0 + i * 3600000, reviews: [] };
    let last = it.learnedAt;
    for (let d = 1; d <= 90; d++) {
      const now = it.learnedAt + d * DAY;
      const r = CS.stateAt(it, now).r;
      const dt = (now - last) / DAY;
      const pTrue = mode === "mismatch"
        ? Math.max(0.05, Math.min(0.98, 1.1 * Math.pow(2, -dt / 8)))  // 真实半衰期 8 天 vs 模型初值 3
        : Math.max(0.02, Math.min(0.98, r));                          // 真实过程与模型一致
      const y = rnd() < pTrue ? 1 : 0;
      if (r < TAU) {
        // v3 的 stateAt 读 rv.grade；v5 字段为 gradeSelf，模拟期两者并存
        it.reviews.push({ t: now, grade: y ? 3 : 1, gradeSelf: y ? 3 : 1,
                          confidenceSelf: 0.5,
                          verification: { status: "unverified" } });
        last = now;
      } else if (rnd() < PROBE_P) {
        probeLog.push({ itemId: it.id, t: now, r, y, ySource: "self", src: "probe" });
      }
    }
    items.push(it);
  }
  return { items, probeLog, pairs: CAL.collectPairs(CS, items, probeLog) };
}

console.log("========== 1. 调度截断与随机探针（可识别性）==========");
const A = simulate("mismatch", 20261105);
const reviewOnly = A.pairs.filter(p => p.src === "review");
const probes = A.pairs.filter(p => p.src === "probe");
console.log(`  常规复习 n=${reviewOnly.length}  r∈[${Math.min(...reviewOnly.map(p=>p.r)).toFixed(3)}, ${Math.max(...reviewOnly.map(p=>p.r)).toFixed(3)}]`);
console.log(`  随机探针 n=${probes.length}  其中 r≥0.9 的 = ${probes.filter(p=>p.r>=0.9).length}`);
ok(reviewOnly.every(p => p.r < TAU), "常规复习配对全部 r<0.9（调度截断）");
ok(probes.some(p => p.r >= TAU), "探针补入 r≥0.9 的高留存观测");
ok(probes.length > 0 && reviewOnly.every(p => p.r >= 0.7), "低留存区间同样缺观测 → 需延迟探针或承认不可识别");

console.log("\n========== 2. 回放校准与双决策门槛 ==========");
const evalA = CAL.evaluate(A.pairs, { MISD: 0.01, minPairs: 100 });
console.log(`  场景A(模型错配) nTrain=${evalA.nTrain} nTest=${evalA.nTest}`);
console.log(`  Brier raw=${evalA.brierRaw} const=${evalA.brierConst} cal=${evalA.brierCalibrated} method=${evalA.method}`);
console.log(`  modelHasSignal=${evalA.modelHasSignal}  needCalibration=${evalA.needCalibration}`);
console.log(`  verdict: ${evalA.verdict}`);
ok(evalA.status === "evaluated", "错配场景完成评估");
ok(evalA.finalTestUsedForSelection === false && evalA.nValidation > 0 && evalA.nTest > 0,
   "校准器只在验证集选择，最终测试集独立评估");
ok(evalA.brierRaw > evalA.brierConst, "原始 r 确实劣于常数基线，暴露结构错配");
function idealPairs(n, seed0) {
  let s = seed0; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = 0.05 + 0.9 * rnd();                  // 预测均匀铺开
    out.push({ itemId: "j" + (i % 20), t: T0 + i * DAY, r,
               y: rnd() < r ? 1 : 0, ySource: "self", src: i % 4 === 0 ? "probe" : "review" });
  }
  return out;
}
const evalB = CAL.evaluate(idealPairs(400, 771103), { MISD: 0.01, minPairs: 100 });
console.log(`  场景B(模型一致) Brier raw=${evalB.brierRaw} const=${evalB.brierConst} cal=${evalB.brierCalibrated}`);
console.log(`  modelHasSignal=${evalB.modelHasSignal}  needCalibration=${evalB.needCalibration}  verdict: ${evalB.verdict}`);
ok(evalB.modelHasSignal, "一致的模型被判定为有预测价值");
ok(evalB.brierRaw < evalB.brierConst, "一致模型的原始 r 优于常数基线");

console.log("\n========== 3. 可靠性曲线 / 阈值前沿 / 无泄漏 ==========");
const rows = CAL.reliability(A.pairs, { minN: 20 });
console.log("  有数据的桶:", rows.filter(r => r.obsRate !== null).map(r => r.range.join("-") + " n=" + r.n).join(" | "));
console.log("  空桶数:", rows.filter(r => r.n === 0).length, "/ 10");
ok(rows.filter(r => r.obsRate === null).every(r => r.note.includes("样本不足") || r.note.includes("无观测")), "样本不足的桶不出数、只给说明");
const onlyProbe = CAL.thresholdFrontier(A.pairs.filter(p => p.src === "probe"));
console.log(`  仅探针覆盖: n=${onlyProbe.coverage.n} r∈[${onlyProbe.coverage.rMin}, ${onlyProbe.coverage.rMax}]`);
console.log("  仅探针可评估的 τ:", onlyProbe.rows.filter(f => f.evaluable).map(f => f.tau).join(", ") || "（无）");
ok(onlyProbe.rows.filter(f => f.evaluable).length < 6,
   "仅常规探针无法评估低阈值（探针只覆盖 r≥0.9）→ 需延迟探针");
const frontier = CAL.thresholdFrontier(A.pairs);
console.log("  全配对阈值前沿:", frontier.rows.map(f =>
  `τ=${f.tau} 需复习=${(f.reviewShare*100).toFixed(0)}% 漏检=${(f.missedShare*100).toFixed(0)}%`).join(" | "));
const nEvalProbe = onlyProbe.rows.filter(f => f.evaluable).length;
const nEvalAll = frontier.rows.filter(f => f.evaluable).length;
ok(nEvalAll > nEvalProbe, "加入常规复习配对后可扩展可评估的 τ 区间");
ok(frontier.rows.filter(f => !f.evaluable).every(f => /延迟探针/.test(f.note)),
   "低阈值一律标注「需延迟探针」，不产出伪造的反事实结论");
console.log(`  可评估 τ 数：仅探针 ${nEvalProbe}/6 → 全配对 ${nEvalAll}/6；仍缺低位观测 → v5 将延迟探针列为必需`);
const leak = CAL.assertNoLeakage(CS, A.items[0]);
ok(leak.ok && leak.S_before === leak.S_atMinusOne, "stateAt(it, rv.t-1) 不含本次复习结果（无标签泄漏）");
const clean = { id: "clean", mtype: "fact", learnedAt: T0,
  reviews: [{ t: T0 + 5 * DAY, grade: 3, gradeSelf: 3, confidenceSelf: 0.5 }] };
const off = CAL.checkOffset(CS, clean);
ok(off.offsetWorks, "-1 偏移确实排除了当前记录（未触 S 下限的干净条目）");
console.log(`  泄漏自检 S=${leak.S_before}；偏移检查 S(-1)=${off.minusOne} S(now)=${off.atNow}`);

console.log("\n========== 4. 事务写入：正常 / 配额失败 / 只读 state / 导入回滚 ==========");
CS.load();
const r1 = P.commitState(d => { d.items.push({ id: "t1", content: "事务测试", mtype: "fact", learnedAt: Date.now(), reviews: [], prereq: [], relates: [] }); });
const stored1 = JSON.parse(store[CS.KEY]);
ok(r1.ok && r1.persisted, "正常提交返回 ok:true/persisted:true");
ok(CS.state.items.length === 1 && stored1.items.length === 1, "内存与持久化同时更新（不再假成功）");
const origSet = localStorage.setItem;
localStorage.setItem = () => { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; };
const r2 = P.commitState(d => { d.items.push({ id: "t2", content: "应回滚", mtype: "fact", learnedAt: Date.now(), reviews: [], prereq: [], relates: [] }); });
localStorage.setItem = origSet;
ok(!r2.ok && r2.error.code === "QUOTA", "配额异常返回结构化 QUOTA 错误");
ok(CS.state.items.length === 1, "失败后内存回滚到 1 条");
ok(JSON.parse(store[CS.KEY]).items.length === 1, "失败后存储也回滚到 1 条（v4 规格缺此步）");
const origReplace = CS.replaceState;
CS.replaceState = () => { throw new TypeError("Cannot set property state of #<Object> which has only a getter"); };
const r3 = P.commitState(d => { d.items.push({ id: "t3", content: "只读", mtype: "fact", learnedAt: Date.now(), reviews: [], prereq: [], relates: [] }); });
CS.replaceState = origReplace;
ok(!r3.ok && r3.error.code === "READONLY_STATE", "getter-only state 被明确识别而非静默假成功");
ok(CS.state.items.length === 1 && JSON.parse(store[CS.KEY]).items.length === 1, "只读失败同样双回滚");
store["cogscope_events_v1"] = JSON.stringify([{ t: 1, type: "probe" }]);
const r4 = P.atomicImport({ schemaVersion: 6, items: [{ id: "imp", content: "导入", mtype: "fact", learnedAt: Date.now(), reviews: [], prereq: [], relates: [] }] },
  { keys: [CS.KEY, "cogscope_events_v1"] });
ok(r4.ok, "原子导入成功（备份覆盖主键 + 新增事件键）");
const r5 = P.restoreBackup();
ok(r5.ok && CS.state.items.length === 1, "从备份恢复后主状态回到导入前");
ok(JSON.parse(store["cogscope_events_v1"])[0].type === "probe", "新增键也从备份完整恢复");

console.log("\n========== 5. v3 历史基线回归 ==========");
const { execFileSync } = require("child_process");
for (const t of ["verify.js", "smoke.js"]) {
  const out = execFileSync(process.execPath, [__dirname + "/" + t], { encoding: "utf8" });
  const line = out.trim().split("\n").pop();
  console.log("  " + t + ": " + line);
  ok(/0 failed/.test(line), t + " 历史 66 项基线仍全绿");
}

console.log(`\n===== v5.integration.js: ${pass} passed, ${fail} failed =====`);
console.log("说明：以上均为固定种子合成数据，用于验证方法可行性；不是对真实平台性能的评估。");
if (fail) process.exit(1);
