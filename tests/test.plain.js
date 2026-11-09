/* CognitionScope · v10 通俗化层测试
 * 目标：证明「普通人能看懂」不是一句口号——每个功能页都有白话说明、
 *       说明里引用的黑话都能在词典查到、导览页覆盖全部页面、开关与幂等生效。
 * 纯离线、零网络、零真实浏览器依赖。
 */
"use strict";
const { createHarness, setupEnv } = require("./harness");
const { t, ok, eq, done } = createHarness("test.plain.js");
setupEnv();
global.document = {
  addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, body: {}
};
require("../js/glossary.js");
require("../js/plain.js");
const G = window.GLOSSARY, P = window.PLAIN;

const ALL_TABS = P.guideKeys().concat(["home", "glossary"]);

/* ---------- 最小 pane 桩：支持 insertAdjacentHTML / 移除说明卡 ---------- */
function makePane(initial) {
  let html = initial == null ? '<div class="card">原有内容-MARK</div>' : initial;
  let hasCard = /data-plain-card/.test(html);
  return {
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; hasCard = /data-plain-card/.test(html); },
    insertAdjacentHTML(pos, frag) {
      if (pos === "afterbegin") { html = frag + html; if (/data-plain-card/.test(frag)) hasCard = true; }
    },
    querySelector(sel) {
      if (sel === "[data-plain-card]" && hasCard) {
        return { remove() { hasCard = false; html = html.replace(/<section class="guide"[\s\S]*?<\/section>/, ""); } };
      }
      return null;
    },
    querySelectorAll() { return []; }
  };
}
const cardCount = html => (html.match(/data-plain-card/g) || []).length;

t("名词词典已装载，条目充足且字段完整", () => {
  ok(G.count() >= 60, "术语数=" + G.count());
  ok(G.all().every(x => x.term && x.plain && x.cat && x.where), "存在字段缺失的术语");
  ok(G.all().every(x => x.plain.length >= 8), "白话解释过短");
});

t("术语无重复，get/has 查询一致", () => {
  const terms = G.all().map(x => x.term);
  eq(new Set(terms).size, terms.length);
  ok(G.has("预注册") && G.get("预注册").plain.indexOf("先写清楚") >= 0);
  eq(G.get("不存在的词"), null);
});

t("术语表搜索与分类筛选可用", () => {
  ok(G.query("快照").length >= 2, "搜「快照」应有结果");
  ok(G.query("zzz完全不存在zzz").length === 0);
  const stat = G.query("", "统计");
  ok(stat.length >= 10 && stat.every(x => x.cat === "统计"), "分类筛选失效");
  ok(G.query("").length === G.count(), "空查询应返回全部");
});

t("16 个功能页全部配有白话说明", () => {
  const keys = P.guideKeys();
  eq(keys.length, 16);
  for (const k of keys) ok(P.guides()[k], "缺少说明：" + k);
});

t("每页说明字段完整：干嘛 / 有啥用 / 点哪里 / 怎么读 / 名词", () => {
  for (const k of P.guideKeys()) {
    const g = P.guides()[k];
    ok(g.title && g.what && g.why && g.read, k + " 缺少白话字段");
    ok(Array.isArray(g.steps) && g.steps.length >= 2, k + " 操作步骤不足");
    ok(Array.isArray(g.terms) && g.terms.length >= 3, k + " 关联名词不足");
    ok(g.level === "入门" || g.level === "进阶", k + " 难度标注非法");
    ok(["日常", "可选", "严谨性", "探索"].indexOf(g.group) >= 0, k + " 分组非法");
    ok(!/TODO|待补充|待填写/.test(JSON.stringify(g)), k + " 存在占位文案");
  }
});

t("说明里引用的每个黑话都能在词典查到（防止解释层自己漂移）", () => {
  const missing = [];
  for (const k of P.guideKeys()) {
    for (const term of P.guides()[k].terms) if (!G.has(term)) missing.push(k + " → " + term);
  }
  eq(JSON.stringify(missing), "[]", "未登记术语：" + missing.join(" | "));
});

t("首页导览覆盖全部 18 个页面，且每个入口都有直达按钮", () => {
  const targets = [];
  P.GROUPS.forEach(g => g.items.forEach(it => targets.push(it[0])));
  eq(new Set(targets).size, ALL_TABS.length, "导览入口数与页面数不符");
  for (const tab of ALL_TABS) ok(targets.indexOf(tab) >= 0, "导览缺少入口：" + tab);
  const html = P.homeHTML();
  ok(html.indexOf("三步开始用") >= 0 && html.indexOf("它不是什么") >= 0, "缺少引导或诚实声明");
  ok((html.match(/data-go=/g) || []).length >= 18, "直达按钮不足");
  ok(html.indexOf("数据只存在你这台设备") >= 0, "缺少本地优先说明");
  ok(html.indexOf("示例不等于成绩") >= 0, "缺少示例数据隔离的白话声明");
  ok(html.indexOf("去示例内容馆看看") >= 0, "缺少示例内容馆入口");
});

t("首页含 N=1 / 不做诊断 / 不外发 / 非防伪 四项诚实声明", () => {
  const html = P.homeHTML();
  for (const s of ["不是诊断工具", "不是通用结论", "不是绝对安全", "不会偷偷上传"])
    ok(html.indexOf(s) >= 0, "缺少声明：" + s);
});

t("名词解释页含搜索、分类、表格，且默认展示全部术语", () => {
  const html = P.glossaryHTML("", "全部");
  ok(html.indexOf('id="glosQ"') >= 0 && html.indexOf("cat-chip") >= 0);
  ok((html.match(/<tr>/g) || []).length >= G.count(), "表格行数应覆盖全部术语");
  ok(html.indexOf("显示 " + G.count() + " 条") >= 0, "计数文案不符");
});

t("名词解释页对搜索词做 HTML 转义", () => {
  const html = P.glossaryHTML('<img src=x onerror=alert(1)>', "全部");
  ok(html.indexOf("<img src=x") < 0, "出现未转义标签");
  ok(html.indexOf("&lt;img") >= 0, "应出现转义文本");
});

t("说明卡含三栏引导与术语浮层入口，且可折叠", () => {
  const html = P.guideHTML("observe");
  for (const s of ["对我有什么用", "我该点哪里", "结果怎么读", "本页名词", "data-guide-fold", "term-chip"])
    ok(html.indexOf(s) >= 0, "说明卡缺少：" + s);
  ok(html.indexOf("data-plain-card") >= 0);
});

t("通俗说明默认开启，开关可关闭并恢复", () => {
  ok(P.isOn(), "默认应开启");
  eq(P.toggle(), false);
  ok(!P.isOn());
  eq(P.toggle(), true);
  ok(P.isOn());
});

t("mount 幂等、保留原有内容、且只插一张说明卡", () => {
  const pane = makePane();
  P.mount("observe", pane);
  eq(cardCount(pane.innerHTML), 1);
  ok(pane.innerHTML.indexOf("原有内容-MARK") >= 0, "原有内容被破坏");
  P.mount("observe", pane);
  eq(cardCount(pane.innerHTML), 1, "重复 mount 造成说明卡叠加");
  P.mount("methods", pane);
  eq(cardCount(pane.innerHTML), 1);
  ok(pane.innerHTML.indexOf("结论稳不稳") >= 0, "未切换到新页说明");
});

t("关闭通俗说明后不再插入说明卡，导览页不挂说明卡", () => {
  P.toggle(); // 关闭
  const pane = makePane();
  P.mount("review", pane);
  eq(cardCount(pane.innerHTML), 0);
  ok(pane.innerHTML.indexOf("原有内容-MARK") >= 0);
  P.toggle(); // 恢复
  const p2 = makePane();
  P.mount("home", p2);
  eq(cardCount(p2.innerHTML), 0, "导览页不应挂说明卡");
  P.mount("glossary", p2);
  eq(cardCount(p2.innerHTML), 0, "名词解释页不应挂说明卡");
  ok(P.isOn());
});

t("renderPage 能渲染首页与名词解释页，且 hasPage 判定正确", () => {
  ok(P.hasPage("home") && P.hasPage("glossary"));
  ok(!P.hasPage("observe"));
  const a = makePane(""), b = makePane("");
  P.renderPage("home", a);
  P.renderPage("glossary", b);
  ok(a.innerHTML.indexOf("三步开始用") >= 0);
  ok(b.innerHTML.indexOf("名词解释") >= 0);
});

done();
