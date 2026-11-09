/* CognitionScope · AI privacy gateway
 * HARD RULE: this module never reads CS.state, L1, L2, PCM, reviews, profile,
 * predictions, experiments, or any local research result when building a request.
 * Only a user-entered general research question may be sent. API credentials are
 * used solely in the Authorization header. Client-side PII heuristics are a guard,
 * not a guarantee; users must not paste personal data.
 */
"use strict";
window.AI = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const PROVIDERS = {
    glm: { url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash" },
    deepseek: { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
    openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
    local: { url: "http://localhost:11434/v1/chat/completions", model: "qwen2.5:7b" }
  };
  const ALLOWED_HOSTS = ["open.bigmodel.cn", "api.deepseek.com", "api.openai.com", "localhost", "127.0.0.1"];
  const MAX_PROMPT = 12000;
  let sessionKey = ""; // API Key 仅驻留当前页面内存，不写入 L1/localStorage/export
  const SYSTEM_PROMPT = "你是 CognitionScope 的通用研究助理。只回答用户提出的通用知识、方法、数学、编程和研究设计问题。你没有访问平台个人数据的权限；不得声称看到了用户的学习记录。对不确定内容明确说明。中文回答，区分事实、推断与建议。";
  function assertAllowedUrl(url) {
    let u; try { u = new URL(url); } catch (_) { throw new Error("非法 API URL"); }
    if (!ALLOWED_HOSTS.includes(u.hostname)) throw new Error("目标域名不在白名单内：" + u.hostname);
    if (u.protocol !== "https:" && !(u.hostname === "localhost" || u.hostname === "127.0.0.1")) throw new Error("仅允许 HTTPS 或本机回环 API");
    return u.hostname;
  }
  function cfg() {
    const c = window.CS && CS.state && CS.state.aiCfg ? CS.state.aiCfg : {};
    const provider = PROVIDERS[c.provider] ? c.provider : "glm";
    return { provider, key: sessionKey, endpoint: PROVIDERS[provider].url, model: PROVIDERS[provider].model };
  }
  // Deliberately conservative heuristics. This is not a complete PII detector.
  function privacyFindings(s) {
    const x = String(s || ""), hits = [];
    const checks = [
      [/(?:\+?\d[\d ()-]{7,}\d)/, "疑似电话号码"],
      [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, "疑似电子邮件地址"],
      [/\b(?:\d{15}|\d{17}[\dXx])\b/, "疑似身份证号码"],
      [/(?:住址|地址|病历|诊断|成绩单|个人档案|我的学习记录|我的复习记录|我的实验数据)/, "疑似个人或敏感资料描述"],
      [/(?:姓名|真实姓名|学号|身份证|护照号|银行卡|API.?Key)\s*[:：]/i, "疑似身份或凭据字段"]
    ];
    for (const [re,label] of checks) if (re.test(x)) hits.push(label);
    return [...new Set(hits)];
  }
  function validateResearchPrompt(prompt) {
    if (typeof prompt !== "string" || !prompt.trim()) throw new Error("请输入通用研究问题");
    if (prompt.length > MAX_PROMPT) throw new Error("问题超过 " + MAX_PROMPT + " 字符限制");
    const findings = privacyFindings(prompt);
    if (findings.length) throw new Error("隐私保护拦截：" + findings.join("、") + "。请删除个人信息后再提问。此检测并非完整 PII 识别。");
    return prompt.trim();
  }
  function buildRequest(prompt, config, opts) {
    const clean = validateResearchPrompt(prompt);
    const c = config || cfg();
    const rq = opts || {};
    assertAllowedUrl(c.endpoint);
    // No state, profile, summary, item, event, file, or derived metric is included.
    return { url: c.endpoint, model: c.model, body: {
      model: c.model, stream: !!rq.stream,
      messages: [{role:"system",content:SYSTEM_PROMPT},{role:"user",content:clean}]
    }, headers: c.key ? {"Content-Type":"application/json","Authorization":"Bearer "+c.key} : {"Content-Type":"application/json"} };
  }
  function nap(ms, signal, injected) {
    if (injected) return injected(ms);
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      if (signal) signal.addEventListener("abort", () => {
        clearTimeout(t); const e = new Error("已取消"); e.name = "AbortError"; reject(e);
      }, { once: true });
    });
  }
  /** 唯一网络出口：支持 SSE 流式、429/5xx 退避重试、超时与取消。
   *  请求体仍只含固定 system prompt + 用户手动输入的通用研究问题。 */
  async function researchQuery(prompt, out, opts) {
    const o = opts || {}, c = cfg();
    if (!c.key && c.provider !== "local") throw new Error("请先配置 API Key");
    const SM = window.STREAM;
    const useStream = !!o.stream && !!SM && typeof SM.collect === "function";
    const req = buildRequest(prompt, c, { stream: useStream });
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), o.timeoutMs || 45000);
    if (o.signal) {
      if (o.signal.aborted) ctrl.abort();
      else o.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    const maxRetries = o.maxRetries == null ? 3 : o.maxRetries;
    let lastErr = null;
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (ctrl.signal.aborted) { const e = new Error("已取消"); e.name = "AbortError"; throw e; }
        let resp;
        try {
          resp = await fetch(req.url, { method: "POST", headers: req.headers,
            signal: ctrl.signal, body: JSON.stringify(req.body) });
        } catch (e) {
          lastErr = e;
          const d = SM ? SM.shouldRetry(null, e, attempt + 1, o) : { retry: false };
          if (d.retry) { await nap(d.delay, ctrl.signal, o.sleep); continue; }
          throw e;
        }
        if (!resp.ok) {
          let retryAfterMs = null;
          const ra = resp.headers && resp.headers.get && resp.headers.get("retry-after");
          if (ra && Number.isFinite(+ra)) retryAfterMs = +ra * 1000;
          const e = new Error("HTTP " + resp.status); e.retryAfterMs = retryAfterMs;
          const d = SM ? SM.shouldRetry(resp.status, e, attempt + 1, o) : { retry: false };
          if (d.retry) { lastErr = e; await nap(d.delay, ctrl.signal, o.sleep); continue; }
          throw e;
        }
        if (useStream && resp.body) {
          const r = await SM.collect(resp.body, { signal: ctrl.signal,
            onDelta: d => { if (out) out(d, true); } });
          if (out) out("", false);
          return r.text;
        }
        const j = await resp.json();
        const answer = j.choices && j.choices[0] && j.choices[0].message ? (j.choices[0].message.content || "") : "";
        if (out) out(answer, false);
        return answer;
      }
      throw lastErr || new Error("请求失败");
    } finally { clearTimeout(timer); }
  }
  function disabled(name) { throw new Error("隐私隔离模式已关闭「"+name+"」：不会将 CognitionScope 个人数据发送给 AI 服务商。请使用通用研究问题功能。"); }
  async function healthReport(){ return disabled("个人学习体检"); }
  async function socratic(){ return disabled("基于个人数据的苏格拉底分析"); }
  async function parseInput(){ return disabled("AI 个人打卡解析"); }
  async function planDecorate(){ return disabled("AI 个人计划修饰"); }
  async function generateHypothesis(){ return disabled("基于个人数据的 AI 假设生成"); }
  function setConsent(){ return {ok:false, note:"隐私隔离模式不提供个人数据外发授权开关；个人数据外发路径已移除"}; }
  function render() {
    const pane = $("#pane-ai"); if (!pane) return;
    const c = cfg();
    // Remove credentials left by older releases from persistent user state.
    if (window.CS && CS.state && CS.state.aiCfg && Object.prototype.hasOwnProperty.call(CS.state.aiCfg,"key")) { delete CS.state.aiCfg.key; CS.save(); }
    pane.innerHTML = `<div class="card"><h2>AI 通用研究助理 · 隐私隔离模式</h2>
      <div class="warn-box"><b>隐私承诺：</b>本模块不会读取或发送你的学习条目、答案、复习历史、个人画像、实验记录、预测、校准结果或任何平台统计摘要。个人数据 AI 分析、打卡解析、计划修饰和假设生成均已关闭。</div>
      <div class="dim" style="margin-top:8px">第三方 API 仍会收到你手动输入的通用问题、请求元数据和 Authorization 中的 API Key。Key 仅保存在当前页面内存，刷新后需重新输入，不写入个人数据档案或导出包。请勿输入姓名、联系方式、个人学习数据或其他隐私。疑似信息拦截只是启发式检测，不保证识别所有个人信息。</div>
      <div class="row"><span>服务商</span><select id="aiProv" class="inp">${Object.keys(PROVIDERS).map(k=>`<option value="${k}" ${c.provider===k?"selected":""}>${k}</option>`).join("")}</select></div>
      <div class="row"><span>API Key（仅当前页面内存）</span><input class="inp" id="aiKey" type="password" autocomplete="off" value="${esc(sessionKey)}" placeholder="本地模型可留空"></div>
      <button class="btn" id="aiSave">保存 API 配置</button>
      <h3>通用研究问题</h3><textarea id="aiResearchPrompt" rows="6" placeholder="例如：比较间隔重复与检索练习的主要理论机制，并给出可查证的经典文献线索。请勿输入个人数据。"></textarea>
      <label class="dim"><input type="checkbox" id="aiGenericConfirm"> 我确认输入的是通用问题，不含任何个人数据或敏感信息；我理解请求文本和 API Key 会发送给所选服务商。</label>
      <label class="dim"><input type="checkbox" id="aiStream" checked> 流式输出（SSE，支持分块 / CRLF / 429 退避重试）</label>
      <button class="btn" id="aiResearchGo" disabled>调用 API</button>
      <div class="card" style="margin-top:10px"><h3>输出</h3><div id="aiOut" class="mono" style="white-space:pre-wrap">（等待）</div></div>
      </div>`;
    $("#aiSave").onclick=()=>{const st=CS.state;st.aiCfg.provider=$("#aiProv").value;sessionKey=$("#aiKey").value;if(st.aiCfg && Object.prototype.hasOwnProperty.call(st.aiCfg,"key")){delete st.aiCfg.key;CS.save();}alert("服务商已保存；API Key 仅保存在当前页面内存，刷新后需重新输入");};
    $("#aiGenericConfirm").onchange=e=>$("#aiResearchGo").disabled=!e.target.checked;
    $("#aiResearchGo").onclick=async()=>{const out=$("#aiOut");out.textContent="请求中…";let acc="";
      try{const ans=await researchQuery($("#aiResearchPrompt").value,(txt,progressive)=>{
        if(progressive){acc+=txt;out.textContent=acc+"▌";}else{out.textContent=txt||acc;}
      },{stream:$("#aiStream")?$("#aiStream").checked:false});
        out.textContent=ans||acc||"（无返回内容）";}
      catch(e){out.textContent="请求已阻止或失败："+e.message;}};
  }
  // Legacy interfaces intentionally fail closed. They never make network requests.
  function buildBrief(){return null;} // 个人摘要构建被永久关闭
  function briefBytes(){return 0;}
  function validateParse(text){
    const errors=[],operations=[],reviews=[]; let j;
    try{const s=String(text||"").trim();j=JSON.parse(s.slice(s.indexOf("{"),s.lastIndexOf("}")+1));}
    catch(_){return{ok:false,operations,reviews,errors:["JSON 解析失败"]};}
    const types=["fact","concept","paper","skill"];
    (Array.isArray(j.operations)?j.operations:[]).slice(0,20).forEach((o,i)=>{
      if(!o||o.op!=="add"||typeof o.content!=="string"||!o.content.trim()||o.content.length>500||typeof o.domain!=="string"||o.domain.length>40||!types.includes(o.mtype)){errors.push("operations["+i+"] 无效");return;}
      operations.push({op:"add",content:o.content.trim(),domain:o.domain.trim()||"未分类",mtype:o.mtype,answer:typeof o.answer==="string"?o.answer.slice(0,500):""});
    });
    (Array.isArray(j.reviews)?j.reviews:[]).slice(0,50).forEach((r,i)=>{
      if(!r||typeof r.match!=="string"||!r.match.trim()||r.match.length>100||!Number.isInteger(r.grade)||r.grade<0||r.grade>3||typeof r.conf!=="number"||r.conf<0||r.conf>1){errors.push("reviews["+i+"] 无效");return;}
      reviews.push({match:r.match.trim(),grade:r.grade,conf:r.conf});
    });
    return{ok:errors.length===0,operations,reviews,unparsed:typeof j.unparsed==="string"?j.unparsed.slice(0,200):null,errors};
  }
  function validatePlan(plan,skeleton){
    if(!plan||typeof plan!=="object"||Array.isArray(plan))throw new Error("返回不是对象");
    if(Object.keys(plan).some(k=>!["items","aiNotes","changes"].includes(k)))throw new Error("未知顶层字段");
    if(!Array.isArray(plan.items)||plan.items.length!==skeleton.items.length||typeof plan.aiNotes!=="string"||plan.aiNotes.length>200)throw new Error("计划结构无效");
    const allowed=new Set(["itemId","domain","type","why","slot"]), ids=new Set(skeleton.items.map(x=>x.itemId)), seen=new Set();
    for(const it of plan.items){if(!it||Object.keys(it).some(k=>!allowed.has(k))||!ids.has(it.itemId)||seen.has(it.itemId))throw new Error("计划条目字段或 ID 无效");seen.add(it.itemId);}
    if(seen.size!==ids.size)throw new Error("条目集合发生变化");
    if(plan.changes!=null&&(!Array.isArray(plan.changes)||plan.changes.some(x=>!["reorder","shiftTime"].includes(x))))throw new Error("不允许的修改类型");
    return plan;
  }
  function briefFields(){return [];}
  function anonymousShortId(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return "x"+(h>>>0).toString(36).slice(-6).padStart(6,"0");}
  return {render,PROVIDERS,ALLOWED_HOSTS,assertAllowedUrl,privacyFindings,validateResearchPrompt,buildRequest,researchQuery,
    setConsent,healthReport,socratic,parseInput,planDecorate,generateHypothesis,buildBrief,briefBytes,validateParse,validatePlan,anonymousShortId,
    MAX_BRIEF:8192, SYSTEM_PROMPT, briefFields};
})();
