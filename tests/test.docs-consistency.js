/* CognitionScope · 文档-实现一致性门禁
 * 目的：让 v7 那种「文档写 221 项、实际 131 项」的漂移在 npm test 里直接失败。
 * 只做静态核验 + 手册幂等重生成，不启动浏览器、不联网。
 */
"use strict";
const fs = require("fs"), path = require("path");
const { createHarness } = require("./harness");
const { t, ok, eq, done } = createHarness("test.docs-consistency.js");
const ROOT = path.resolve(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const facts = JSON.parse(read("PROJECT-FACTS.json"));

t("package.json 版本与 PROJECT-FACTS 一致", () => {
  eq(JSON.parse(read("package.json")).version, facts.appVersion);
});

t("index.html 的应用版本徽标/标题/页脚与事实一致", () => {
  const h = read("index.html");
  const major = facts.appVersion.split(".")[0]; // 界面显示短版本 v8，包版本为 8.0.0
  const n = (h.match(new RegExp("CognitionScope v" + major, "g")) || []).length;
  ok(n >= 2, "v" + major + " 应至少出现在 title 与 footer，实得 " + n);
  ok(new RegExp(">v" + major + "</span>").test(h), "页眉徽标版本不符");
  ok(!/CognitionScope v7/.test(h), "仍残留旧版本标题");
});

t("L1 / L2 schema 与源码一致，文档不含过期的 schema v7", () => {
  ok(new RegExp("const SCHEMA_VERSION = " + facts.l2Schema + ";").test(read("js/state6.js")));
  ok(new RegExp("schemaVersion:\\s*" + facts.l1Schema + "\\b").test(read("js/core.js")));
  for (const f of ["README.md", "CHANGELOG.md", "SECURITY-PRIVACY.md", "tools/manual-intro.md"]) {
    ok(!/schema v7/.test(read(f)), f + " 仍写 L2 为 schema v7");
  }
  ok(new RegExp("schema v?" + facts.l2Schema).test(read("README.md")), "README 未标明真实 L2 schema");
});

t("算法定义版本登记与源码一致（不随应用版本重编号）", () => {
  const a = facts.algorithmVersions;
  ok(read("js/parameters.js").includes('"' + a.params + '"'), "params 版本不符");
  ok(read("js/calibration.js").includes('"' + a.calibration + '"'), "calibration 版本不符");
  ok(read("js/consent.js").includes('"' + a.consent + '"'), "consent 版本不符");
  ok(read("js/state6.js").includes('"' + a.paramVersionInitial + '"'), "paramVersion 初值不符");
  ok(read("js/parameters.js").includes('"' + a.paramVersionFitPrefix + '"'), "拟合前缀不符");
});

t("套件清单与 run-all.js 一致，且全部文件存在", () => {
  const all = [...facts.suites.logic, ...facts.suites.legacy, facts.suites.docs, facts.suites.browser];
  for (const f of all) ok(fs.existsSync(path.join(ROOT, "tests", f)), "缺少测试文件 " + f);
  const r = read("tests/run-all.js");
  for (const k of ["S.logic", "S.legacy", "S.docs", "S.browser"]) ok(r.includes(k), "run-all 未从 PROJECT-FACTS 读取 " + k);
  ok(r.includes("chromiumAvailable"), "run-all 未实现真实的 Chromium 探测");
});

t("test:legacy 确实指向历史回归，而非重复跑全量", () => {
  const s = JSON.parse(read("package.json")).scripts["test:legacy"];
  ok(s.includes("verify.js") && s.includes("smoke.js"), "test:legacy 未指向历史回归: " + s);
  ok(s !== JSON.parse(read("package.json")).scripts.test, "test:legacy 与 test 不应完全相同");
});

t("全项目仅 js/ai.js 发起网络请求，且 API Key 为内存态", () => {
  const withFetch = fs.readdirSync(path.join(ROOT, "js")).filter(f => /\bfetch\s*\(/.test(read("js/" + f)));
  eq(JSON.stringify(withFetch), JSON.stringify(facts.privacy.fetchOnlyIn.map(x => x.split("/").pop())));
  const ai = read("js/ai.js");
  ok(/let sessionKey = ""/.test(ai), "API Key 应为页面内存变量");
  ok(!/localStorage\.(setItem|getItem|removeItem)/.test(ai), "ai.js 不应读写 localStorage（注释中的说明文字除外）");
  ok(/assertAllowedUrl\(c\.endpoint\)/.test(ai), "请求前应有运行时域名白名单校验");
  ok(!/CONSENT\.assertBeforeCall/.test(ai), "researchQuery 不应声称经过同意网关");
});

t("CONSENT.assertBeforeCall 是 fail-closed 桩，不是外发同意网关", () => {
  ok(/allowed:\s*false/.test(read("js/consent.js")));
  ok(/researchQuery/.test(read("js/ai.js")));
});

t("运行时域名白名单与 CSP connect-src 源数与事实一致", () => {
  const ai = read("js/ai.js");
  const m = ai.match(/const ALLOWED_HOSTS = \[([^\]]*)\]/);
  ok(m, "未找到 ALLOWED_HOSTS");
  const hosts = [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
  eq(JSON.stringify(hosts), JSON.stringify(facts.privacy.allowedHosts));
  const csp = read("index.html").match(/connect-src ([^;"]*)/);
  ok(csp, "未找到 CSP connect-src");
  const sources = csp[1].trim().split(/\s+/).filter(x => x !== "'self'");
  eq(sources.length, facts.privacy.cspConnectSources);
  ok(!/(^|\s)https:(\s|;|$)/.test(csp[1]), "CSP 仍含裸 https: 通配");
});

t("文档中的失效表述未回潮（黑名单）", () => {
  const banned = [
    [/\b221\b/, "写死的旧聚合测试数"],
    [/Key 只存在浏览器/, "旧版 API Key 持久化描述"],
    [/所有外发请求经/, "虚构的同意网关描述"],
    [/强制走功能级逐次同意/, "不存在的逐次同意机制"],
    [/test\.ui\.v7\.js/, "不存在的测试文件名"],
    [/精确列出 4 个厂商域名/, "错误的 CSP 域名数量"],
    [/真实 Chromium 对照实测/, "未实现的真实外连对照宣称"],
    [/只跑 v3 历史 66 项回归/, "错误的 test:legacy 说明"]
  ];
  for (const f of ["README.md", "tools/manual-intro.md"]) {
    const s = read(f);
    for (const [re, label] of banned) ok(!re.test(s), f + " 仍含：" + label);
  }
});

t("《完整代码手册》与磁盘源码逐字一致（重新生成后幂等）", () => {
  const { render, mirrorList } = require("../tools/build-manual.js");
  const generated = render();
  const onDisk = read(facts.manual.output);
  ok(generated === onDisk, "手册已过期，请运行 npm run build:manual 后重新测试");
  const titles = (onDisk.match(/^### `[^`]+`$/gm) || []).length;
  eq(titles, mirrorList().length, "手册镜像文件数与生成器清单不符");
});

t("PROJECT-FACTS 中登记的手册生成器与输出路径有效", () => {
  ok(fs.existsSync(path.join(ROOT, facts.manual.generator)));
  ok(fs.existsSync(path.join(ROOT, facts.manual.intro)));
  ok(fs.existsSync(path.join(ROOT, facts.manual.output)));
});


t("所有测试文件都已登记在套件清单（防止新增测试被漏跑）", () => {
  const declared = new Set([...facts.suites.logic, ...facts.suites.legacy, facts.suites.docs, facts.suites.browser]);
  const skip = new Set(["harness.js", "run-all.js"]);
  const missing = fs.readdirSync(path.join(ROOT, "tests"))
    .filter(f => f.endsWith(".js") && !skip.has(f) && !declared.has(f));
  eq(JSON.stringify(missing), "[]", "未登记测试：" + missing.join(","));
});

t("js 模块数与脚本标签数一致，v9/v10/v11 模块全部登记并导出", () => {
  const js = fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js"));
  const n = (read("index.html").match(/<script src="js\//g) || []).length;
  eq(n, js.length, "index.html 脚本数应等于 js/ 模块数");
  for (const m of facts.v9Modules) {
    ok(fs.existsSync(path.join(ROOT, "js", m + ".js")), "缺少 v9 模块 " + m);
    ok(/window\.[A-Za-z0-9_]+\s*=/.test(read("js/" + m + ".js")), m + " 未导出全局对象");
  }
  ok(facts.capabilities && Object.keys(facts.capabilities).length >= 8, "v9 能力登记缺失");
  for (const m of facts.v10Modules) {
    ok(fs.existsSync(path.join(ROOT, "js", m + ".js")), "缺少 v10 模块 " + m);
    ok(/window\.[A-Za-z0-9_]+\s*=/.test(read("js/" + m + ".js")), m + " 未导出全局对象");
  }
  for (const m of facts.v11Modules) {
    ok(fs.existsSync(path.join(ROOT, "js", m + ".js")), "缺少 v11 模块 " + m);
    ok(/window\.[A-Za-z0-9_]+\s*=/.test(read("js/" + m + ".js")), m + " 未导出全局对象");
  }
});

t("index.html 页签与 pane 数量一致", () => {
  const h = read("index.html");
  const tabs = (h.match(/data-t="/g) || []).length;
  const panes = (h.match(/class="pane[^"]*" id="pane-/g) || []).length;
  eq(tabs, panes, "页签数应等于 pane 数");
  ok(panes >= 18, "v11 应至少 18 个 pane，实得 " + panes);
});

t("browser-check 含真实 CSP 外连对照与能力自检", () => {
  const b = read("tests/browser-check.js");
  ok(/evil\.example\.com/.test(b) && /Refused to connect/.test(b), "缺少真实外连 CSP 对照");
  ok(/data-caps/.test(b), "缺少运行时能力自检");
  ok(/mods\.filter/.test(b), "缺少模块装载检查");
});


t("v10 通俗化模块与页面登记完整（v11 扩充到 16 页说明）", () => {
  eq(JSON.stringify(facts.v10Pages), JSON.stringify(["home", "glossary"]));
  eq(facts.plainLanguage.guidePages, 16);
  ok(facts.plainLanguage.defaultOn === true, "通俗说明应默认开启");
  const scripts = JSON.parse(read("package.json")).scripts;
  ok(scripts["test:plain"], "缺少 test:plain 脚本");
  ok(scripts["test:demo"], "缺少 test:demo 脚本");
});

t("index.html 已装配通俗化层与分组导航，且不再隐藏研究层页签", () => {
  const h = read("index.html");
  ok(/id="btnPlain"/.test(h), "缺少通俗说明开关");
  ok((h.match(/class="navgroup"/g) || []).length >= 2, "缺少日常/进阶分组导航");
  ok(/id="pane-home"/.test(h) && /id="pane-glossary"/.test(h), "缺少导览/名词解释 pane");
  ok(/js\/glossary\.js/.test(h) && /js\/plain\.js/.test(h), "新模块未加入脚本加载序列");
  ok(!/data-t="[^"]+"[^>]*display:none/.test(h), "v10 不应再隐藏任何页签");
});

t("说明层覆盖 16 个功能页，术语词典达到登记规模", () => {
  const pl = read("js/plain.js"), gl = read("js/glossary.js");
  ok(/VERSION: "plain\/11\.0"/.test(pl) && /VERSION: "glossary\/11\.0"/.test(gl));
  ok(/data-plain-card/.test(pl) && /guideHTML/.test(pl), "说明卡实现缺失");
  const keys = ["observe", "review", "add", "plan", "ai", "calib", "exp", "labdiag",
    "metrics", "data", "lab", "net", "proto", "find", "methods", "demo"];
  for (const k of keys) ok(new RegExp("\\b" + k + ":\\s*\\{").test(pl), "缺少页面说明 " + k);
  const terms = (gl.match(/^\s*\["/gm) || []).length;
  ok(terms >= facts.plainLanguage.glossaryMin, "术语条目数=" + terms);
});

t("README 提供普通人入口与示例内容入口", () => {
  const r = read("README.md");
  ok(/三分钟/.test(r) && /名词解释/.test(r), "README 缺少白话入口");
  ok(/通俗说明/.test(r), "README 未说明通俗说明开关");
  ok(/示例内容馆/.test(r) && /一键清除/.test(r), "README 未说明示例内容包与清除方式");
});

/* ================= v11 示例内容包门禁 ================= */
t("v11 事实登记完整：版本、模块、页面、示例包规模与隔离清单", () => {
  eq(facts.appVersion, "11.0.0");
  eq(JSON.stringify(facts.v11Pages), JSON.stringify(["demo"]));
  eq(JSON.stringify(facts.v11Modules), JSON.stringify(["demo", "demo-ui"]));
  const d = facts.demoContent;
  eq(d.packVersion, "demo/11.0");
  eq(d.itemCount, 46);
  eq(d.edgeCount, 80);
  eq(d.defaultEnabled, false);
  eq(d.origin, "本项目原创编写");
  ok(d.excludedFrom.length >= 4, "缺少导出/统计剔除清单");
  ok(facts.suites.logic.indexOf("test.demo.js") >= 0, "test.demo.js 未登记进套件");
  ok(facts.capabilities.demoContent && facts.capabilities.demoIsolation, "缺少能力登记");
});

t("ATTRIBUTION.md 随包交付且进入手册镜像", () => {
  const f = facts.demoContent.attributionFile;
  ok(fs.existsSync(path.join(ROOT, f)), "缺少 " + f);
  const a = read(f);
  for (const s of ["原创编写", "保留所有权利", "不构成学习成效证据", "不授予第三方"])
    ok(a.indexOf(s) >= 0, f + " 缺少声明：" + s);
  const { mirrorList } = require("../tools/build-manual.js");
  ok(mirrorList().indexOf(f) >= 0, f + " 未纳入手册镜像");
});

t("index.html 已装配示例馆页面、两个新模块与演示横幅", () => {
  const h = read("index.html");
  ok(/id="pane-demo"/.test(h) && /data-t="demo"/.test(h), "缺少示例馆页签或 pane");
  ok(/js\/demo\.js/.test(h) && /js\/demo-ui\.js/.test(h), "新模块未加入脚本加载序列");
  ok(/id="demoBanner"/.test(h), "缺少演示模式横幅容器");
  ok(/示例不等于成绩/.test(read("js/plain.js")), "首页缺少示例隔离的白话声明");
});

t("示例包默认零写入、三标记齐全、且不自行落盘或联网", () => {
  const d = read("js/demo.js");
  ok(/defaultEnabled:\s*false/.test(d) && /isDemo:\s*true/.test(d), "META 未声明默认关闭");
  ok(/demo:\s*true/.test(d) && /demoVersion:\s*VERSION/.test(d) && /source:\s*"demo\/"/.test(d), "缺少三标记");
  ok(!/\bfetch\s*\(/.test(d), "demo.js 出现 fetch");
  ok(!/localStorage\.(setItem|removeItem)/.test(d), "demo.js 自行写 localStorage");
  const u = read("js/demo-ui.js");
  ok(!/\bfetch\s*\(/.test(u) && !/localStorage\.(setItem|removeItem)/.test(u), "demo-ui.js 出现外发或落盘");
  ok(!/DEMO|demo/.test(read("js/ai.js")), "AI 外发路径不应引用示例内容");
});

t("导出与统计入口都实现了演示数据剔除，且口径统一", () => {
  const c = read("js/core.js"), e = read("js/export-manifest.js");
  ok(/function isDemoItem/.test(c) && /function realItems/.test(c), "core.js 缺少统一判定");
  ok(/safe\.items = safe\.items\.filter\(x => !isDemoItem\(x\)\)/.test(c), "exportJSON 未剔除");
  ok(/for \(const it of realItems\(\)\)/.test(c), "fitParams 未剔除");
  ok(/demo:\s*\{ loaded: demoCount > 0/.test(c), "PCM 未登记演示排除");
  ok(/const isDemo = x =>/.test(e) && /demoExcluded/.test(e), "buildBundle 未剔除");
  ok(/已剔除 /.test(e), "manifest 未写入剔除声明");
});

t("示例内容没有被冒充成认知常模，NORMS 仍为无来源占位", () => {
  const lab = read("js/lab.js");
  ok(/无题库、无常模来源/.test(lab));
  eq((lab.match(/source:\s*null/g) || []).length, 5);
  ok(!/NORMS|人群百分位/.test(read("js/demo.js")), "示例包不应声明常模");
});

done();
