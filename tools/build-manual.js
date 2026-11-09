/* CognitionScope · 完整代码手册生成器
 * 从磁盘源码逐字生成手册，杜绝手工复制导致的过期副本。
 * 用法：npm run build:manual   （或 node tools/build-manual.js）
 * 幂等：相同磁盘内容 -> 相同输出。tests/test.docs-consistency.js 依赖此性质。
 */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const facts = JSON.parse(fs.readFileSync(path.join(ROOT, "PROJECT-FACTS.json"), "utf8"));

const ROOT_FILES = [
  "index.html", "package.json", "PROJECT-FACTS.json",
  "README.md", "CHANGELOG.md", "SECURITY-PRIVACY.md", "ATTRIBUTION.md"
];
const DIRS = ["js", "tests"];

function mirrorList() {
  const files = [];
  for (const d of DIRS) {
    for (const f of fs.readdirSync(path.join(ROOT, d)).filter(x => x.endsWith(".js")).sort()) {
      files.push(d + "/" + f);
    }
  }
  files.push("tools/build-manual.js"); // 工具自身也纳入镜像；manual-intro 是正文模板，不重复收录
  files.push(...ROOT_FILES);
  return files;
}

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/** 用比内容中任何连续反引号串更长的围栏，避免 Markdown 嵌套破坏 */
function fence(content) {
  let n = 3, m, re = /`{3,}/g;
  while ((m = re.exec(content)) !== null) n = Math.max(n, m[0].length + 1);
  return "`".repeat(n);
}

function streamTable() {
  const src = read("js/state6.js");
  const rows = [...src.matchAll(/^\s{4}(\w+):\s*\{\s*required:\s*\[([^\]]*)\],\s*desc:\s*"([^"]+)"\s*\}/gm)];
  if (rows.length !== 13) throw new Error("L2 登记流提取失败，期望 13 个，实得 " + rows.length);
  return rows.map(m => {
    const req = m[2].replace(/"/g, "`").replace(/\s+/g, " ").trim();
    return `| \`${m[1]}\` | ${req} | ${m[3]} |`;
  }).join("\n");
}

function suiteTable() {
  const g = [
    ["逻辑套件", facts.suites.logic],
    ["历史回归", facts.suites.legacy],
    ["文档门禁", [facts.suites.docs]],
    ["浏览器", [facts.suites.browser]]
  ];
  return g.map(([name, list]) => `| ${name} | ${list.map(f => "`" + f + "`").join("、")} |`).join("\n");
}

function apiTable() {
  const rows = [];
  for (const f of mirrorList().filter(x => x.startsWith("js/"))) {
    const names = [...new Set([...read(f).matchAll(/window\.([A-Za-z0-9_]+)\s*=/g)].map(m => m[1]))];
    rows.push(`| \`${f}\` | ${names.length ? names.map(n => "`" + n + "`").join("、") : "（无全局导出）"} |`);
  }
  return rows.join("\n");
}

function render() {
  const files = mirrorList();
  const values = {
    APP_VERSION: facts.appVersion,
    L1_SCHEMA: String(facts.l1Schema),
    L2_SCHEMA: String(facts.l2Schema),
    STREAM_TABLE: streamTable(),
    SUITE_TABLE: suiteTable(),
    API_TABLE: apiTable(),
    MIRROR_COUNT: String(files.length)
  };
  let out = read(facts.manual.intro);
  for (const [k, v] of Object.entries(values)) out = out.split("{{" + k + "}}").join(v);
  if (/\{\{[A-Z_]+\}\}/.test(out)) throw new Error("手册模板存在未替换的占位符");

  for (const f of files) {
    const content = read(f);
    const bar = fence(content);
    out += `\n### \`${f}\`\n\n${bar}\n${content}${content.endsWith("\n") ? "" : "\n"}${bar}\n`;
  }
  return out;
}

module.exports = { render, mirrorList, ROOT };

if (require.main === module) {
  const out = render();
  const dest = path.join(ROOT, facts.manual.output);
  fs.writeFileSync(dest, out, "utf8");
  console.log(`已生成 ${facts.manual.output}：镜像 ${mirrorList().length} 个文件，${Buffer.byteLength(out, "utf8")} 字节`);
}
