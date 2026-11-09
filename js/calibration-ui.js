/* CognitionScope · calibration-ui.js —— 校准可视化（v6）
 * 纯字符串生成：无 DOM 依赖、无外部库、无内联脚本（CSP 友好）。
 * 所有图形明确标注「无观测」的桶，绝不插值或补零。
 */
"use strict";
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const C = { bg: "#121A2B", grid: "#1F2A40", ink: "#DDE6F2", dim: "#8A94A6",
    acc: "#3B82F6", good: "#61AB83", warn: "#D9A441", bad: "#D26A5C" };

  /** 可靠性曲线：x=预测 r，y=实际通过率；对角虚线=完美校准 */
  function svgReliability(rows, opts) {
    const o = opts || {};
    const W = o.width || 520, H = o.height || 300, P = 44;
    const iw = W - 2 * P, ih = H - 2 * P;
    const X = v => P + v * iw, Y = v => P + (1 - v) * ih;
    let g = "";
    for (let k = 0; k <= 10; k++) {
      const v = k / 10;
      g += `<line x1="${X(v)}" y1="${P}" x2="${X(v)}" y2="${P + ih}" stroke="${C.grid}" stroke-width="1"/>`;
      g += `<line x1="${P}" y1="${Y(v)}" x2="${P + iw}" y2="${Y(v)}" stroke="${C.grid}" stroke-width="1"/>`;
    }
    g += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" stroke="${C.dim}" stroke-width="1.5" stroke-dasharray="6 5"/>`;
    let pts = "", bars = "", empty = "";
    for (const r of rows || []) {
      const mid = (r.range[0] + r.range[1]) / 2;
      if (r.obsRate == null) {
        empty += `<rect x="${X(r.range[0]) + 1}" y="${P}" width="${Math.max(2, X(r.range[1]) - X(r.range[0]) - 2)}" height="${ih}" fill="${C.warn}" opacity="0.07"/>`;
        empty += `<text x="${X(mid)}" y="${P + 16}" fill="${C.warn}" font-size="9" text-anchor="middle">无观测</text>`;
        continue;
      }
      if (r.ci95) {
        bars += `<line x1="${X(mid)}" y1="${Y(r.ci95[1])}" x2="${X(mid)}" y2="${Y(r.ci95[0])}" stroke="${C.acc}" stroke-width="1.5" opacity="0.55"/>`;
      }
      pts += `<circle cx="${X(mid)}" cy="${Y(r.obsRate)}" r="4.5" fill="${C.acc}" stroke="${C.bg}" stroke-width="1.5"><title>${esc(r.range.join("~"))} n=${r.n} 预测=${r.predMean} 实际=${r.obsRate}</title></circle>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="可靠性曲线">
      <rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}" rx="8"/>
      ${g}${empty}${bars}${pts}
      <text x="${P}" y="${H - 12}" fill="${C.dim}" font-size="10">预测留存 r →</text>
      <text x="12" y="${P - 12}" fill="${C.dim}" font-size="10">实际通过率 ↑</text>
      <text x="${W - P}" y="${P + 12}" fill="${C.dim}" font-size="9" text-anchor="end">虚线 = 完美校准</text>
    </svg>`;
  }

  /** 阈值前沿：需复习占比（蓝）与漏检遗忘率（红），不可评估的 τ 灰显 */
  function svgThreshold(frontier, opts) {
    const o = opts || {};
    const rows = (frontier && frontier.rows) || [];
    const W = o.width || 520, H = o.height || 260, P = 44;
    const iw = W - 2 * P, ih = H - 2 * P;
    const bw = iw / Math.max(1, rows.length) * 0.36;
    let bars = "", labels = "";
    rows.forEach((r, i) => {
      const cx = P + (i + 0.5) * iw / Math.max(1, rows.length);
      const share = r.reviewShare || 0, miss = r.missedShare || 0;
      const h1 = share * ih, h2 = miss * ih;
      const col1 = r.evaluable ? C.acc : C.dim, col2 = r.evaluable ? C.bad : C.dim;
      bars += `<rect x="${cx - bw - 2}" y="${P + ih - h1}" width="${bw}" height="${h1}" fill="${col1}" opacity="${r.evaluable ? 0.9 : 0.25}"/>`;
      bars += `<rect x="${cx + 2}" y="${P + ih - h2}" width="${bw}" height="${h2}" fill="${col2}" opacity="${r.evaluable ? 0.9 : 0.25}"/>`;
      labels += `<text x="${cx}" y="${H - 12}" fill="${r.evaluable ? C.ink : C.warn}" font-size="9" text-anchor="middle">τ=${r.tau}${r.evaluable ? "" : "*"}</text>`;
      labels += `<title>${esc(r.note)}</title>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="阈值前沿">
      <rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}" rx="8"/>
      <line x1="${P}" y1="${P + ih}" x2="${P + iw}" y2="${P + ih}" stroke="${C.dim}"/>
      ${bars}${labels}
      <text x="${P}" y="${P - 12}" fill="${C.dim}" font-size="10">蓝=需复习占比　红=漏检遗忘率　* = 不可评估（需延迟探针）</text>
    </svg>`;
  }

  /** Brier 三柱对比：原始 r / 常数基线 / 校准后 */
  function svgBrier(scores, evalRes, opts) {
    const o = opts || {};
    const vals = [
      { k: "原始 r(t)", v: scores && scores.brierRetention },
      { k: "常数基线", v: scores && scores.brierConstBaseline },
      { k: "校准后", v: evalRes && evalRes.brierCalibrated }
    ].filter(x => Number.isFinite(x.v));
    const W = o.width || 520, H = o.height || 190, P = 40;
    const iw = W - 2 * P, ih = H - 2 * P;
    const max = Math.max(0.05, ...vals.map(v => v.v)) * 1.2;
    let bars = "";
    vals.forEach((v, i) => {
      const bw = iw / vals.length * 0.5, cx = P + (i + 0.5) * iw / vals.length;
      const h = v.v / max * ih;
      const col = i === 0 ? C.acc : i === 1 ? C.warn : C.good;
      bars += `<rect x="${cx - bw / 2}" y="${P + ih - h}" width="${bw}" height="${h}" fill="${col}" rx="3"/>`;
      bars += `<text x="${cx}" y="${P + ih - h - 6}" fill="${C.ink}" font-size="11" text-anchor="middle">${v.v.toFixed(4)}</text>`;
      bars += `<text x="${cx}" y="${H - 10}" fill="${C.dim}" font-size="10" text-anchor="middle">${esc(v.k)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Brier 对比">
      <rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}" rx="8"/>${bars}
      <text x="${P}" y="${P - 12}" fill="${C.dim}" font-size="10">Brier 越小越好；校准后必须优于常数基线才算模型有信号</text>
    </svg>`;
  }

  /** 覆盖度条：每桶一个格子，空桶/不足/达标分别着色 */
  function svgCoverage(cov, opts) {
    const o = opts || {};
    const rows = (cov && cov.rows) || [];
    const W = o.width || 520, H = 96, P = 20;
    const bw = (W - 2 * P) / Math.max(1, rows.length);
    let s = `<rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}" rx="8"/>`;
    rows.forEach((r, i) => {
      const col = r.n === 0 ? C.bad : r.identifiable ? C.good : C.warn;
      s += `<rect x="${P + i * bw + 1}" y="26" width="${bw - 2}" height="34" fill="${col}" opacity="0.85"><title>${esc(r.range.join("~"))} n=${r.n} ${esc(r.note)}</title></rect>`;
      s += `<text x="${P + i * bw + bw / 2}" y="76" fill="${C.dim}" font-size="8" text-anchor="middle">${r.range[0]}</text>`;
    });
    s += `<text x="${P}" y="16" fill="${C.dim}" font-size="10">样本覆盖（绿=可识别 / 黄=不足 / 红=无观测）</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="覆盖度">${s}</svg>`;
  }

  /** 完整校准报告 HTML（研究层直接插入 pane） */
  function renderCalibrationReport(rep, cov, frontier) {
    if (!rep || rep.status === "insufficient") {
      return `<div class="card"><h2>留存模型校准</h2>
        <div class="warn-box">${esc(rep ? rep.reason : "尚无校准数据")}。当前不能展示任何「掌握度」或个性化排期结论。</div>
        <div class="dim" style="margin-top:8px">前置条件：启用三类探针（routine / delayed / random）并积累冻结的 (预测 r, 实际 y) 配对。</div></div>`;
    }
    const okSignal = rep.modelHasSignal;
    const badge = okSignal ? `<span class="badge g">模型有信号</span>` : `<span class="badge b">模型无信号</span>`;
    const needCal = rep.needCalibration ? `<span class="badge w">需校准层 + 参数重写</span>` : `<span class="badge g">无需校准层</span>`;
    return `<div class="card"><h2>留存模型校准 ${badge} ${needCal}</h2>
      <div class="dim">基于 ${esc(rep.provenance ? rep.provenance.source : "L2.events")} 的冻结预测；
        训练/测试严格时间切分（${rep.nTrain}/${rep.nTest}）；参数版本 ${esc((rep.provenance && rep.provenance.paramVersions || []).join("、") || "—")}。</div>
      <div class="grid2" style="margin-top:10px">
        <div>${svgReliability(rep.reliability)}</div>
        <div>${svgBrier(rep.scores, rep)}<div style="margin-top:8px">${svgCoverage(cov)}</div></div>
      </div>
      <div class="row"><span>Brier 原始 r / 常数基线 / 校准后</span><span class="mono">${rep.brierRaw} / ${rep.brierConst} / ${rep.brierCalibrated}</span></div>
      <div class="row"><span>相对常数基线改进</span><span class="mono">${rep.gainVsBasePct}%（MISD=${rep.MISD}）</span></div>
      <div class="row"><span>校准方法</span><span class="mono">${esc(rep.method)} ${esc(JSON.stringify(rep.params || {}))}</span></div>
      <div class="row"><span>决策结论</span><span>${esc(rep.verdict)}</span></div>
      <div class="dim" style="margin-top:8px">${esc(rep.note || "")}；空桶一律标注「无观测」，不插值、不补零。</div>
    </div>
    <div class="card"><h2>到期阈值 τ 前沿 <span class="badge w">探索性</span></h2>
      ${svgThreshold(frontier)}
      <div class="dim">反事实估计；样本 r 下限 ${esc(frontier && frontier.coverage ? frontier.coverage.rMin : "—")}、
        上限 ${esc(frontier && frontier.coverage ? frontier.coverage.rMax : "—")}。
        标注「不可评估」的 τ 一律不产出数字，须先补延迟探针的低留存观测。</div>
    </div>`;
  }

  window.CALUI = { esc, svgReliability, svgThreshold, svgBrier, svgCoverage, renderCalibrationReport };
})();
