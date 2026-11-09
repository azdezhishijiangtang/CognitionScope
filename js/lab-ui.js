/* CognitionScope · lab-ui.js —— 实验室 UI + 校正报告渲染（v3）
   v2：真正呈现刺激（Stroop 上色 / 旋转图形 / 数字遮蔽），并把伪科学数字降为小字。 */
"use strict";
window.LABUI = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KINDS = [["matrix", "矩阵序列", "图形规律推理（原型）"], ["digit", "数字广度", "短时记忆（原型）"],
    ["stroop", "Stroop", "干扰抑制（原型）"], ["rotate", "心理旋转", "空间能力（原型）"],
    ["series", "数列归纳", "规则归纳（原型）"]];

  function render() {
    const pane = $("#pane-lab");
    const hist = CS.state.lab;
    pane.innerHTML = `
    <div class="grid2">
      <div class="card"><h2>五任务原型</h2>
        ${KINDS.map(k => '<div class="row"><span>' + k[1] + ' <span class="dim">' + k[2] + '</span></span><button class="btn sm" data-run="' + k[0] + '">开始</button></div>').join("")}
        <div class="dim" style="margin-top:6px">自适应楼梯：连续 2 对升级，连续 2 错降级。每次 10 题。Stroop 固定 5 一致 / 5 不一致。</div>
        <div class="warn-box">这五项是交互原型，无题库、无常模来源、无信效度证据。下面的 z 与换算值只用于观察个人趋势，不能解释为智力、工作记忆容量或人群百分位。</div>
      </div>
      <div class="card"><h2>最近成绩</h2>
        ${hist.length ? '<table><tr><th>任务</th><th>z</th><th>次数</th><th>单位</th></tr>' +
          hist.slice(-10).reverse().map(h => '<tr><td>' + esc(h.kind) + '</td><td class="mono">' + h.z + '</td><td>' + h.attempt + '</td><td class="dim">' + esc(h.unit || "-") + '</td></tr>').join("") + '</table>' : '<div class="dim">还没有记录。</div>'}
        <div class="dim" style="margin-top:6px">暂定正态换算值（pct）仅在原始记录中保存，不在界面展示，避免被误读为人群百分位。</div>
      </div>
    </div>
    <div class="card"><h2>校正引擎报告</h2><div id="corrReport">${corrHTML()}</div>
      <div class="dim">校正前/后双展示；β、ipsative z 与合成区间均为探索性计算，见各字段的 limitation 说明。</div>
    </div>`;
    pane.querySelectorAll("[data-run]").forEach(b => b.onclick = () => start(b.dataset.run));
  }

  function start(kind) {
    const m = $("#modal");
    m.innerHTML = '<h2>准备</h2><p class="dim">10 题，自适应难度。请一次性完成，环境保持安静。</p><div class="choice"><button class="btn" id="goLab">开始</button></div>';
    $("#overlay").classList.add("on");
    $("#goLab").onclick = () => {
      $("#overlay").classList.remove("on");
      LAB.run(kind, 10, {
        show(item, i, n, diff, cb) {
          const t0 = performance.now();
          const answer = val => { $("#overlay").classList.remove("on"); cb(val === item.a, performance.now() - t0); };
          let body = "", choices = "";
          if (item.render === "stroop") {
            body = '<div style="margin:14px 0;font-size:32px;text-align:center;font-weight:700;color:' + item.ink + '">' + esc(item.q) + '</div>' +
              '<div class="dim" style="text-align:center">按「墨水颜色」作答，不要读字</div>';
            choices = '<div class="choice">' + item.opts.map(o => '<button class="btn ghost" data-o="' + esc(o) + '">' + esc(o) + '</button>').join("") + '</div>';
          } else if (item.render === "rotate") {
            body = '<div style="margin:14px 0;text-align:center"><div style="font-size:15px">' + esc(item.q) + '</div>' +
              '<div class="dim" style="margin-top:6px">选择旋转后的图形，而不是角度数字</div></div>';
            choices = '<div class="choice">' + item.opts.map(o =>
              '<button class="btn ghost" data-o="' + esc(o) + '"><span style="display:inline-block;font-size:24px;transform:rotate(' + o + 'deg)">' + esc(item.shape) + '</span></button>').join("") + '</div>';
          } else if (item.render === "flash") {
            body = '<div style="margin:14px 0;text-align:center"><div id="flash" style="font-size:26px;letter-spacing:4px">' + esc(item.q) + '</div>' +
              '<div id="after" style="display:none"><input class="inp mono" id="labInp" placeholder="输入你记住的序列" style="width:100%">' +
              '<div style="margin-top:8px"><button class="btn" id="labGo">提交</button></div></div></div>';
          } else {
            body = '<div style="margin:14px 0;font-size:18px;text-align:center">' + esc(item.q) + '</div>';
            choices = item.opts
              ? '<div class="choice">' + item.opts.map(o => '<button class="btn ghost" data-o="' + esc(o) + '">' + esc(o) + '</button>').join("") + '</div>'
              : '<input class="inp mono" id="labInp" placeholder="输入答案" style="width:100%"><div style="margin-top:8px"><button class="btn" id="labGo">提交</button></div>';
          }
          m.innerHTML = '<h2>' + i + '/' + n + ' · 难度 ' + diff + '</h2>' + body + choices;
          $("#overlay").classList.add("on");
          if (item.render === "flash") {
            setTimeout(() => {
              const f = $("#flash"), a = $("#after"), inp = $("#labInp");
              if (f) f.style.display = "none";
              if (a) a.style.display = "block";
              if (inp) inp.focus();
            }, item.flashMs);
          }
          m.querySelectorAll("[data-o]").forEach(b => b.onclick = () => answer(b.dataset.o));
          const goBtn = $("#labGo");
          if (goBtn) goBtn.onclick = () => answer($("#labInp").value.trim());
        }
      }, res => {
        const val = kind === "digit" ? (res.span == null ? null : res.span) // v3：全错时 span=null，不写伪记录
          : kind === "matrix" ? Math.round(res.acc * 10)
          : kind === "stroop" ? (res.interference == null ? null : Math.round(res.interference))
          : Math.round(res.acc * 100);
        const rec = LAB.saveResult(kind, val, res);
        m.innerHTML = '<h2>本轮结果</h2><div class="kpi">' +
          '<div class="c"><b>' + res.n + '</b><span>题数</span></div>' +
          '<div class="c"><b>' + Math.round(res.acc * 100) + '%</b><span>正确率</span></div>' +
          '<div class="c"><b>' + (rec ? "z=" + rec.z : "—") + '</b><span>校正后（探索性）</span></div>' +
          '<div class="c"><b>' + (res.interference == null ? "—" : Math.round(res.interference) + "ms") + '</b><span>干扰量</span></div></div>' +
          (rec ? '<div class="dim">第 ' + rec.attempt + ' 次施测 · β=' + rec.beta + ' · zRaw=' + rec.zRaw + ' → z=' + rec.z + ' · 单位：' + esc(rec.unit || "-") + '</div>'
               : '<div class="warn-box">本次未采集到可计算的分值（例如 Stroop 缺少有效的一致/不一致作答），未写入记录。</div>') +
          '<div class="dim" style="margin-top:6px">非临床、不预言智力；暂定换算值不代表人群位置。</div>' +
          '<div class="choice"><button class="btn" id="labDone">完成</button></div>';
        $("#overlay").classList.add("on");
        $("#labDone").onclick = () => $("#overlay").classList.remove("on");
        render();
      });
    };
  }

  function corrHTML() {
    const st = CS.state;
    if (!st.lab.length) return '<div class="dim">先完成任一任务。</div>';
    const recent = st.lab.slice(-5).reverse().map(h =>
      '<tr><td>' + esc(h.kind) + '</td><td class="mono">z' + h.zRaw + '</td><td class="mono">z' + h.z +
      '</td><td class="mono">' + (h.zSelf == null ? "—" : h.zSelf) + '</td></tr>').join("");
    const lc = LAB.longitudinalCheck(st);
    const lcRows = lc.map(v => '<tr><td>' + esc(v.pair) + '</td><td class="mono">' + v.n + '/' + v.threshold +
      '</td><td class="mono">' + (v.r == null ? "—" : v.r) + '</td><td class="dim">' + esc(v.note) + '</td></tr>').join("");
    return '<table><tr><th>任务</th><th>校正前</th><th>校正后</th><th>ipsative z</th></tr>' + recent + '</table>' +
      '<h3>纵向关联（探索性，需 ≥10 次独立施测）</h3>' +
      '<table><tr><th>配对</th><th>n/门槛</th><th>r</th><th>说明</th></tr>' + lcRows + '</table>';
  }

  return { render, corrHTML };
})();
