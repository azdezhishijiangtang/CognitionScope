/* CognitionScope · tests/browser-check.js —— 真实 Chromium 打开 file:// 验证
 * 运行：node tests/browser-check.js（需系统已装 chromium）
 * 检查：默认页渲染、13 页切换、26 模块装载、事件链、CSP 无违规、无 JS 异常。
 * 输出遵循 ===== 汇总行格式，供 run-all.js 解析。
 */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + " :: " + e.message); }
}
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

const root = path.resolve(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cs6-"));
const probeJs = path.join(root, ".__probe_ci.js");
const probeHtml = path.join(root, ".__probe_ci.html");
const domFile = path.join(tmp, "dom.html"), logFile = path.join(tmp, "csp.log");

function chromiumBin() {
  const r = spawnSync("sh", ["-c", "command -v chromium || command -v chromium-browser || command -v google-chrome"], { encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim().split("\n")[0] : null;
}

const bin = chromiumBin();
if (!bin) {
  console.log("  SKIP 未检测到 Chromium");
  console.log("===== browser-check.js: 0 passed, 0 failed =====");
  process.exit(0);
}

try {
  fs.writeFileSync(probeJs, `window.addEventListener("load",function(){
    var tabs=["home","glossary","demo","observe","review","add","plan","ai","calib","exp","labdiag","metrics","data","lab","net","proto","find","methods"];
    var out=[];
    for(var i=0;i<tabs.length;i++){var t=tabs[i];
      try{APP.go(t);var p=document.querySelector("#pane-"+t);out.push(t+":"+(p?p.innerHTML.length:0));}
      catch(e){out.push(t+":ERR:"+e.message);}}
    var mods=["CS","CS6","PERSIST","IMPORTV","EXPORTM","VERIFY","TIMING","METRICS","LABM","CAL","PROBES","PARAMS","FORECAST","EXP","PROTO","HYP","CONSENT","STREAM","SEARCH","SNAP","INTEGRITY","SENS","SCED","REPLAY","E2","LAB","LABUI","OBS","REVIEW","CALUI","RESEARCH","AI","V9UI","DEMO","DEMOUI","GLOSSARY","PLAIN","APP"];
    document.body.setAttribute("data-probe",out.join("|"));
    document.body.setAttribute("data-missing",mods.filter(function(k){return !window[k];}).join(",")||"none");
    document.body.setAttribute("data-chain",CS6.verifyChain().ok?"ok":"broken");
    document.body.setAttribute("data-streams",Object.keys(CS6.STREAMS).length);
    var caps=[!!(window.crypto&&window.crypto.subtle),typeof ReadableStream==="function",typeof TextDecoder==="function",typeof AbortController==="function",typeof structuredClone==="function"];
    document.body.setAttribute("data-caps",caps.join(","));
    document.body.setAttribute("data-guides",String(document.querySelectorAll("[data-plain-card]").length));
    document.body.setAttribute("data-glossary",String(window.GLOSSARY?GLOSSARY.count():0));
    document.body.setAttribute("data-plain-on",window.PLAIN&&PLAIN.isOn()?"on":"off");
    document.body.setAttribute("data-navgroups",String(document.querySelectorAll(".navgroup").length));
    document.body.setAttribute("data-home",document.querySelector("#pane-home").innerHTML.indexOf("三步开始用")>=0?"ok":"missing");
    document.body.setAttribute("data-glos-page",document.querySelector("#pane-glossary").innerHTML.indexOf("名词解释")>=0?"ok":"missing");
    document.body.setAttribute("data-btnplain",document.querySelector("#btnPlain")?"ok":"missing");
    var demoPane=document.querySelector("#pane-demo");
    document.body.setAttribute("data-demo-page",demoPane&&/示例内容馆/.test(demoPane.innerHTML)?"ok":"missing");
    document.body.setAttribute("data-demo-count",String(window.DEMO?DEMO.ITEMS.length:0));
    document.body.setAttribute("data-demo-loaded",window.DEMO&&DEMO.status(CS.state).loaded?"yes":"no");
    document.body.setAttribute("data-demo-banner",document.querySelector("#demoBanner")?"ok":"missing");
    try{
      APP.go("demo"); DEMOUI.filter.open.add("m01"); DEMOUI.render();
      var dp=document.querySelector("#pane-demo");
      document.body.setAttribute("data-demo-guide",dp.querySelectorAll("[data-plain-card]").length===1?"ok":"missing");
    }catch(e){document.body.setAttribute("data-demo-guide","ERR:"+e.message);}
    var aiPane=document.querySelector("#pane-ai");
    document.body.setAttribute("data-ai-privacy",aiPane&&/不会读取或发送|个人数据 AI 分析|不含任何个人数据/.test(aiPane.innerHTML)?"ok":"missing");
    // 故意触发一次非白名单外连：CSP 必须同步阻断并输出 Refused to connect。
    try{fetch("https://evil.example.com/cs-csp-probe").catch(function(){});}catch(e){}
  });`, "utf8");
  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  html = html.replace('<script src="js/app.js"></script>', '<script src="js/app.js"></script>\n<script src=".__probe_ci.js"></script>');
  fs.writeFileSync(probeHtml, html, "utf8");

  const r = spawnSync(bin, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--enable-logging=stderr", "--v=0", "--virtual-time-budget=6000", "--dump-dom",
    "file://" + probeHtml], { encoding: "utf8", timeout: 120000 });
  fs.writeFileSync(domFile, r.stdout || "", "utf8");
  fs.writeFileSync(logFile, r.stderr || "", "utf8");
  const dom = r.stdout || "", log = r.stderr || "";

  const attr = k => { const m = dom.match(new RegExp(k + '="([^"]*)"')); return m ? m[1] : null; };

  t("file:// 双击打开：默认页渲染出 4 张 ticker 卡", () => {
    ok((dom.match(/<div class="tick">/g) || []).length === 4);
  });
  t("工具层指标卡已渲染（未回退到纯 v3）", () => ok(dom.indexOf("工具层 · 高信息量指标") >= 0));
  t("18 个 pane 全部存在", () => ok((dom.match(/class="pane[^"]*" id="pane-/g) || []).length === 18));
  t("38 个本地脚本全部按序加载", () => ok((dom.match(/<script src="js\//g) || []).length === 38));
  t("38 个模块全部装载（无缺失）", () => {
    ok(attr("data-missing") === "none", "缺失：" + attr("data-missing"));
  });
  t("18 页切换均渲染出内容且无异常", () => {
    const s = attr("data-probe") || "";
    const rows = s.split("|");
    ok(rows.length === 18, "页面数=" + rows.length);
    const bad = rows.filter(x => {
      const p = x.split(":");
      return p[1] === "ERR" || !Number.isFinite(+p[1]) || +p[1] < 30;
    });
    ok(bad.length === 0, "渲染过短或异常：" + bad.join(","));
  });
  t("L2 事件层 13 个流、本地一致性链完整", () => {
    ok(attr("data-streams") === "13");
    ok(attr("data-chain") === "ok");
  });
  t("无意外 CSP 违规、无 JS 异常", () => {
    // 排除下面「CSP 外连对照」故意触发的 evil.example.com 违规，其余一律视为失败
    const bad = log.split("\n").filter(l =>
      /Refused to|violates the following Content Security|Uncaught|SyntaxError|TypeError|ReferenceError/.test(l)
      && !/evil\.example\.com/.test(l));
    ok(bad.length === 0, bad.slice(0, 3).join(" | "));
  });
  t("CSP 真实外连对照：非白名单域名被阻断", () => {
    ok(/Refused to connect/.test(log) && /evil\.example\.com/.test(log),
      "未在 Chromium 日志中观察到对非白名单域名的 CSP 拦截");
  });
  t("运行时能力自检：关键 Web API 可用", () => {
    const caps = (attr("data-caps") || "").split(",");
    ok(caps.length === 5, "能力项数=" + caps.length);
    ok(caps.slice(0, 4).every(x => x === "true"),
      "Web Crypto / ReadableStream / TextDecoder / AbortController 应可用：" + caps.join(","));
  });
  t("v11 通俗层：16 个功能页均插入本页说明卡", () => {
    ok(attr("data-guides") === "16", "说明卡数=" + attr("data-guides"));
  });
  t("v11 示例内容馆：默认零写入、46 条示例可浏览、横幅容器就位", () => {
    ok(attr("data-demo-page") === "ok", "示例馆未渲染");
    ok(+(attr("data-demo-count") || 0) === 46, "示例条目数=" + attr("data-demo-count"));
    ok(attr("data-demo-loaded") === "no", "示例不应默认写入 L1");
    ok(attr("data-demo-banner") === "ok", "缺少演示模式横幅容器");
    ok(attr("data-demo-guide") === "ok", "示例馆内重渲染后本页说明卡丢失：" + attr("data-demo-guide"));
  });
  t("v10 名词解释：词典已装载且术语页可渲染", () => {
    ok(+(attr("data-glossary") || 0) >= 60, "术语数=" + attr("data-glossary"));
    ok(attr("data-glos-page") === "ok");
  });
  t("v10 导览页、分组导航与通俗说明开关就位", () => {
    ok(attr("data-home") === "ok", "首页未渲染三步引导");
    ok(attr("data-btnplain") === "ok", "缺少通俗说明开关");
    ok(attr("data-plain-on") === "on", "通俗说明应默认开启");
    ok(attr("data-navgroups") === "2", "导航分组数=" + attr("data-navgroups"));
  });
  t("AI 页面声明个人数据不外发", () => ok(attr("data-ai-privacy") === "ok", "AI 页缺少隐私承诺"));
  t("CSP 使用精确域名白名单（不含裸 https: 通配）", () => {
    const m = dom.match(/connect-src ([^"]*)"/);
    ok(m && /https:\/\/open\.bigmodel\.cn/.test(m[1]));
    ok(!/(^|\s)https:(\s|;|$)/.test(m[1]), "仍含裸 https: 通配");
  });
} finally {
  [probeJs, probeHtml].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

console.log(`===== browser-check.js: ${pass} passed, ${fail} failed =====`);
if (fail) process.exitCode = 1;
