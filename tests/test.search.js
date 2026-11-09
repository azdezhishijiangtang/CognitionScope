/* v9 · 本地检索与知识图谱（零网络、确定性） */
"use strict";
const H = require("./harness"), { createHarness, setupEnv, loadLogic } = H;
const { t, ok, eq, done } = createHarness("test.search.js");
setupEnv(); const W = loadLogic(); const S = W.SEARCH;

const items = [
  { id: "a", content: "间隔重复的留存模型", answer: "按半衰期排期", domain: "学习方法", prereq: ["b"] },
  { id: "b", content: "检索练习 retrieval practice", answer: "主动回忆", domain: "认知", relates: ["a", "c"] },
  { id: "c", content: "可靠性曲线与 Brier 分数", answer: "校准评估", domain: "统计" },
  { id: "d", content: "完全无关的烘焙笔记", answer: "面粉", domain: "生活" }
];

t("版本与中英文混合分词", () => {
  eq(S.VERSION, "search/9.0");
  const tk = S.tokenize("间隔重复 retrieval");
  ok(tk.includes("间")); ok(tk.includes("间隔")); ok(tk.includes("retrieval"));
  ok(tk.every(x => typeof x === "string"));
});

t("BM25 中文召回与排序", () => {
  const idx = S.buildIndex(items);
  eq(idx.N, 4);
  const r = S.search(idx, "间隔重复");
  ok(r.length >= 1, "应召回中文结果");
  eq(r[0].id, "a");
  ok(r[0].score > 0);
  ok(r.every((x, i) => i === 0 || r[i - 1].score >= x.score), "必须按分数降序");
});

t("英文词干式精确词召回与字段权重", () => {
  const idx = S.buildIndex(items);
  const r = S.search(idx, "retrieval");
  eq(r.length, 1); eq(r[0].id, "b");
  const r2 = S.search(idx, "校准");
  eq(r2[0].id, "c");
});

t("空索引、空查询、无命中不抛错", () => {
  const empty = S.buildIndex([]);
  eq(S.search(empty, "任意").length, 0);
  eq(S.search(S.buildIndex(items), "").length, 0);
  eq(S.search(S.buildIndex(items), "qqqzzz").length, 0);
  // 中文单字召回是设计行为（bigram 分词），不视为错误
  ok(S.search(S.buildIndex(items), "存").length >= 1);
});

t("snippet 命中位置与省略号", () => {
  const s = "前半段" + "关键概念" + "后半段".repeat(30);
  const out = S.snippet(s, "关键概念", 40);
  ok(out.includes("关键概念"), "片段应包含命中词");
  ok(out.length <= 43, "应受长度约束，实得 " + out.length);
  eq(S.snippet("", "x"), "");
});

t("图谱布局确定性、坐标有界、度数正确", () => {
  const g1 = S.graphLayout(items, { iterations: 30 });
  const g2 = S.graphLayout(items, { iterations: 30 });
  eq(g1.nodes.length, 4);
  eq(JSON.stringify(g1.nodes), JSON.stringify(g2.nodes), "同输入必须完全确定");
  ok(g1.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y) && n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1));
  eq(g1.edges.length, 2, "a<->b 去重后 + b<->c 共 2 条");
  const d = g1.nodes.find(n => n.id === "d");
  eq(d.degree, 0, "孤立节点度数为 0");
  ok(g1.deterministic);
});

t("空图谱与自引用边", () => {
  const g = S.graphLayout([], {});
  eq(g.nodes.length, 0); eq(g.edges.length, 0);
  const g2 = S.graphLayout([{ id: "x", content: "自环", prereq: ["x"] }], {});
  eq(g2.edges.length, 0);
});

done();
