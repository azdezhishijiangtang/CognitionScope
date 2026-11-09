/* CognitionScope · 全量回归调度
 * 套件清单唯一来源：PROJECT-FACTS.json。浏览器检查仅在检测到 Chromium 时纳入。
 * 通过数以本次输出为准，文档不记录聚合数字。
 */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path"), fs = require("fs");
const ROOT = path.resolve(__dirname, "..");
const facts = JSON.parse(fs.readFileSync(path.join(ROOT, "PROJECT-FACTS.json"), "utf8"));
const S = facts.suites;

const SUITES = [
  ...S.logic.map(f => [f, "逻辑套件"]),
  ...S.legacy.map(f => [f, "历史回归"]),
  [S.docs, "文档一致性门禁"]
];

function chromiumAvailable() {
  const r = spawnSync("sh", ["-c", "command -v chromium || command -v chromium-browser || command -v google-chrome"], { encoding: "utf8" });
  return r.status === 0 && !!(r.stdout || "").trim();
}

let totalPass = 0, totalFail = 0;
console.log(`CognitionScope v${facts.appVersion} · 全量回归测试`);
console.log("=".repeat(72));

function run(file, label) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: "utf8", timeout: 180000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const ms = [...out.matchAll(/=====?\s*([^:\n]+):\s*(\d+) passed,\s*(\d+) failed\s*=====?/g)];
  const m = ms[ms.length - 1];
  const pass = m ? +m[2] : 0;
  const fail = m ? +m[3] : (r.status === 0 ? 0 : 1);
  totalPass += pass; totalFail += fail;
  const good = !fail && r.status === 0;
  console.log(`  [${good ? "PASS" : "FAIL"}] ${label.padEnd(16)} ${file.padEnd(28)} ${String(pass).padStart(3)} passed / ${fail} failed`);
  if (!good) {
    out.split("\n").filter(x => /FAIL|Error:|✗/.test(x)).slice(0, 8)
      .forEach(x => console.log("        " + x.trim()));
  }
  return good;
}

for (const [f, l] of SUITES) run(f, l);

let browserLine;
if (chromiumAvailable()) {
  const good = run(S.browser, "真实浏览器");
  browserLine = good
    ? `浏览器检查：已执行并计入汇总（${S.browser}）`
    : `浏览器检查：已执行但失败（${S.browser}）`;
} else {
  browserLine = "浏览器检查：跳过 —— 未检测到 Chromium；安装后可运行 npm run test:browser 单独复核";
}

console.log("=".repeat(72));
console.log(`合计：${totalPass} passed, ${totalFail} failed`);
console.log(browserLine);
console.log("套件清单来自 PROJECT-FACTS.json；通过数以本次输出为准。");
if (totalFail) process.exitCode = 1;
