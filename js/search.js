/* CognitionScope · 本地全文检索与知识图谱布局
 * 零 DOM、零网络、纯确定性。中英文混合分词（CJK 单字 + bigram / 拉丁词）、
 * BM25 排序、字段加权、片段高亮、关系图的确定性力导向布局。
 * 只在本地内存上建索引，不产生任何外发数据。
 */
"use strict";
window.SEARCH = (function () {
  const VERSION = "search/9.0";
  const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;

  function tokenize(s) {
    const x = String(s == null ? "" : s).toLowerCase();
    const atoms = [];
    let buf = "";
    for (const ch of x) {
      if (CJK.test(ch)) { if (buf) { atoms.push(buf); buf = ""; } atoms.push(ch); }
      else if (/[a-z0-9_]/.test(ch)) buf += ch;
      else { if (buf) { atoms.push(buf); buf = ""; } }
    }
    if (buf) atoms.push(buf);
    const out = [];
    for (let i = 0; i < atoms.length; i++) {
      const t = atoms[i];
      out.push(t);
      if (CJK.test(t) && t.length === 1 && i + 1 < atoms.length && CJK.test(atoms[i + 1]) && atoms[i + 1].length === 1) {
        out.push(t + atoms[i + 1]);
      }
    }
    return out;
  }

  const WEIGHT = { content: 2, answer: 1, domain: 1 };

  function buildIndex(items) {
    const docs = {}, df = {};
    for (const it of (items || [])) {
      if (!it || it.id == null) continue;
      const fields = {
        content: String(it.content == null ? "" : it.content),
        answer: String(it.answer == null ? "" : it.answer),
        domain: String(it.domain == null ? "" : it.domain)
      };
      const tf = {};
      for (const f of Object.keys(fields)) {
        for (const t of tokenize(fields[f])) tf[t] = (tf[t] || 0) + WEIGHT[f];
      }
      docs[String(it.id)] = { id: String(it.id), fields, tf,
        length: Object.keys(tf).reduce((a, k) => a + tf[k], 0) };
      for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1;
    }
    const ids = Object.keys(docs);
    const avgLen = ids.length ? ids.reduce((a, id) => a + docs[id].length, 0) / ids.length : 0;
    return { VERSION, docs, df, N: ids.length, avgLen };
  }

  function search(index, query, opts) {
    const o = opts || {};
    if (!index || !index.N) return [];
    const terms = tokenize(query);
    if (!terms.length) return [];
    const k1 = o.k1 == null ? 1.5 : o.k1, b = o.b == null ? 0.75 : o.b;
    const avg = index.avgLen || 1;
    const scores = {};
    for (const t of terms) {
      const n = index.df[t] || 0;
      if (!n) continue;
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      for (const id of Object.keys(index.docs)) {
        const d = index.docs[id], f = d.tf[t] || 0;
        if (!f) continue;
        scores[id] = (scores[id] || 0) +
          idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / avg));
      }
    }
    return Object.keys(scores).map(id => ({
      id, score: +scores[id].toFixed(6),
      snippet: snippet(index.docs[id].fields.content, query, o.snippetLen || 80),
      domain: index.docs[id].fields.domain
    })).sort((a, z) => z.score - a.score || (a.id < z.id ? -1 : 1)).slice(0, o.limit || 20);
  }

  function snippet(text, query, len) {
    const s = String(text == null ? "" : text);
    if (!s) return "";
    const q = String(query || "").toLowerCase();
    const i = q ? s.toLowerCase().indexOf(q) : -1;
    if (i < 0) return s.slice(0, len) + (s.length > len ? "…" : "");
    const start = Math.max(0, i - Math.floor(len / 3));
    const raw = s.slice(start, start + len);
    return (start > 0 ? "…" : "") + raw + (start + len < s.length ? "…" : "");
  }

  /** 确定性力导向布局：黄金角初值 + 固定迭代，无随机数，可复现 */
  function graphLayout(items, opts) {
    const o = opts || {};
    const src = (items || []).filter(x => x && x.id != null);
    const n = src.length;
    const nodes = src.map((it, i) => {
      const a = i * 2.399963229728653, r = Math.sqrt((i + 0.5) / Math.max(1, n));
      return { id: String(it.id), x: 0.5 + 0.42 * r * Math.cos(a),
        y: 0.5 + 0.42 * r * Math.sin(a), degree: 0, label: String(it.content || "").slice(0, 18) };
    });
    const pos = new Map(nodes.map(nd => [nd.id, nd]));
    const edges = [], seen = new Set();
    for (const it of src) {
      const from = String(it.id);
      const rels = [].concat(it.prereq || [], it.relates || []);
      for (const r of rels) {
        const to = String(r);
        if (to === from || !pos.has(to)) continue;
        const key = from < to ? from + "|" + to : to + "|" + from;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from, to });
        pos.get(from).degree++; pos.get(to).degree++;
      }
    }
    const byId = new Map(nodes.map(nd => [nd.id, nd]));
    const iterations = o.iterations == null ? 60 : o.iterations;
    for (let step = 0; step < iterations; step++) {
      const fx = new Map(nodes.map(nd => [nd.id, 0]));
      const fy = new Map(nodes.map(nd => [nd.id, 0]));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = nodes[i], c = nodes[j];
        let dx = a.x - c.x, dy = a.y - c.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) { dx = 0.001 * (i - j); dy = 0.001 * (j - i); d2 = dx * dx + dy * dy; }
        const f = 0.0009 / d2;
        fx.set(a.id, fx.get(a.id) + f * dx); fy.set(a.id, fy.get(a.id) + f * dy);
        fx.set(c.id, fx.get(c.id) - f * dx); fy.set(c.id, fy.get(c.id) - f * dy);
      }
      for (const e of edges) {
        const a = byId.get(e.from), c = byId.get(e.to);
        const dx = c.x - a.x, dy = c.y - a.y;
        const f = 0.012;
        fx.set(a.id, fx.get(a.id) + f * dx); fy.set(a.id, fy.get(a.id) + f * dy);
        fx.set(c.id, fx.get(c.id) - f * dx); fy.set(c.id, fy.get(c.id) - f * dy);
      }
      for (const nd of nodes) {
        nd.x = Math.min(1, Math.max(0, nd.x + Math.max(-0.02, Math.min(0.02, fx.get(nd.id)))));
        nd.y = Math.min(1, Math.max(0, nd.y + Math.max(-0.02, Math.min(0.02, fy.get(nd.id)))));
      }
    }
    return { VERSION, nodes, edges, iterations, deterministic: true,
      note: "坐标为确定性布局结果，仅用于可视化，不表示语义距离或统计结论" };
  }

  return { VERSION, CJK, tokenize, buildIndex, search, snippet, graphLayout };
})();
