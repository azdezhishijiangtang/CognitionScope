/* CognitionScope · verification.js —— 客观正确率与元认知校准（v6）
 * ============================================================================
 * 修掉的核心方法学缺陷（改进建议书 支线A / v5 §3）：
 *   v3 的 biasPct = mean(conf − (grade≥2))，outcome 来自同一次自评，
 *   所以「元认知偏差」实际测的是「信心与自评评分的一致性」，不是元认知校准。
 *
 * v6 方案：
 *   - 录入时给出可核验要点清单 keypoints + rubricVersion
 *   - 复习揭示答案后勾「命中要点数 / 总要点数」→ A 级客观正确率
 *   - conf 仍在揭示答案前采集（v3 已做对），此时才可与独立核验的 outcome 比较
 *   - grade 降级为辅助数据，绝不进 A 级分母
 *
 * 诚实边界：
 *   - 要点命中用规范化字符串匹配，不是语义理解；不同措辞会低估，故只用于事实/概念类
 *   - 「verified」不等于绝对客观真理，只表示「按预先登记的评分标准核验过」
 *   - 无 rubric / 未核验 / abandoned 一律不进分母
 * 零 DOM 依赖。
 */
"use strict";
(function () {
  const VERSION = "verification/6.0";
  const KEYS = { CORRECT: 0.8, PARTIAL: 0.4 };   // 命中率阈值（预注册时应固定，不得事后调）

  const normalize = s => String(s == null ? "" : s)
    .toLowerCase().replace(/[\s，。、；：,.;:!！?？"'“”‘’（）()\[\]【】]/g, "")
    .replace(/[了的地得与和及或是在有]/g, "");

  function wilson(k, n, z) {
    z = z || 1.96;
    if (!n) return null;
    const p = k / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d;
    const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [+(c - h).toFixed(3), +(c + h).toFixed(3)];
  }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  /* ① 判定条目是否具备可核验条件 */
  function validateRubric(item) {
    const kp = Array.isArray(item.keypoints) ? item.keypoints.filter(x => typeof x === "string" && x.trim()) : [];
    const reasons = [];
    if (!kp.length) reasons.push("未登记要点清单 keypoints");
    if (!item.rubricVersion) reasons.push("未登记 rubricVersion（评分标准版本）");
    if (!item.rubric && !kp.length) reasons.push("未登记评分标准 rubric");
    if (item.mtype && !["fact", "concept"].includes(item.mtype))
      reasons.push("要点核验当前仅支持事实/概念类，文献/技能类请用自评并标注 unverified");
    return {
      verifiable: reasons.length === 0,
      reasons, keypoints: kp, rubricVersion: item.rubricVersion || null,
      note: reasons.length ? "本次只能作为自评（B 级），不得计入客观正确率分母" : "可按登记标准核验"
    };
  }

  /* ② 字符串匹配命中要点（明确标注不是语义判分） */
  function scoreKeypoints(keypoints, userResponse) {
    const text = normalize(userResponse);
    const hits = (keypoints || []).map(k => {
      const nk = normalize(k);
      return nk.length > 0 && text.indexOf(nk) >= 0;
    });
    const n = hits.filter(Boolean).length;
    return {
      hitKeypoints: n, totalKeypoints: (keypoints || []).length,
      hitRate: (keypoints || []).length ? +(n / keypoints.length).toFixed(3) : null,
      detail: (keypoints || []).map((k, i) => ({ key: k, hit: hits[i] })),
      method: "normalized_substring_match",
      caveat: "规范化字符串匹配，不是语义理解；同义改写会被低估，故命中率只作保守下界"
    };
  }

  /* ③ 生成核验记录 */
  function verifyReview(item, userResponse, opts) {
    const o = opts || {};
    const gate = validateRubric(item);
    if (!gate.verifiable) {
      return {
        status: "unverified", method: null, rubricVersion: null, outcome: null,
        hitKeypoints: null, totalKeypoints: null, keypoints: [],
        note: gate.note, reasons: gate.reasons, definitionVersion: VERSION,
        caveat: "verified 不等于绝对客观真理，只表示按预先登记的标准核验过"
      };
    }
    const sc = o.manualHits != null
      ? { hitKeypoints: Math.max(0, Math.min(gate.keypoints.length, Number(o.manualHits))),
          totalKeypoints: gate.keypoints.length, detail: gate.keypoints.map(k => ({ key: k, hit: null })),
          method: "manual_checklist", caveat: "由学习者对照要点清单勾选，非第三方盲评" }
      : scoreKeypoints(gate.keypoints, userResponse);
    const rate = sc.totalKeypoints ? sc.hitKeypoints / sc.totalKeypoints : 0;
    const outcome = rate >= KEYS.CORRECT ? "correct" : rate >= KEYS.PARTIAL ? "partial" : "incorrect";
    return {
      status: "verified", method: sc.method, rubricVersion: gate.rubricVersion,
      outcome, y: yFromOutcome(outcome),
      hitRate: +rate.toFixed(3),
      hitKeypoints: sc.hitKeypoints, totalKeypoints: sc.totalKeypoints,
      keypoints: sc.detail,
      thresholds: { correctAt: KEYS.CORRECT, partialAt: KEYS.PARTIAL, preregistered: true },
      note: "按 rubricVersion=" + gate.rubricVersion + " 核验；修改评分标准须升版本号，旧记录不重判",
      caveat: sc.caveat, definitionVersion: VERSION
    };
  }

  const yFromOutcome = o => o === "correct" ? 1 : o === "partial" ? 0.5 : 0;
  function yFromVerification(v) {
    if (!v || v.status !== "verified") return null;
    return v.y != null ? v.y : yFromOutcome(v.outcome);
  }

  /* ④ 分母规则：只有 verified 记录进 A 级 */
  function eligibleDenominator(reviews) {
    const all = reviews || [];
    const eligible = all.filter(r => r.verification && r.verification.status === "verified" && !r.abandoned);
    const excluded = all.length - eligible.length;
    const reasons = {};
    for (const r of all) {
      if (eligible.includes(r)) continue;
      const k = r.abandoned ? "abandoned" : (!r.verification ? "无 verification 字段"
        : r.verification.status === "unverified" ? "未核验（自评）"
        : r.verification.status === "not_applicable" ? "不适用核验" : "状态非法");
      reasons[k] = (reasons[k] || 0) + 1;
    }
    return { total: all.length, eligible: eligible.length, excluded, reasons,
      rule: "无 rubric / 未核验 / abandoned 一律不进分母；不得用 grade 回填补足" };
  }

  /* ⑤ A 级：核验客观正确率（含 Wilson 区间） */
  function verifiedAccuracy(reviews) {
    const d = eligibleDenominator(reviews);
    if (!d.eligible) return { grade: "A", n: 0, accuracy: null, ci95: null,
      status: "积累中：尚无核验记录", denominator: d,
      note: "n=0 时不显示 0%，避免把「没数据」写成「表现差」" };
    const sum = (reviews || []).filter(r => r.verification && r.verification.status === "verified" && !r.abandoned)
      .reduce((a, r) => a + (yFromVerification(r.verification) || 0), 0);
    const acc = sum / d.eligible;
    return {
      grade: "A", n: d.eligible, accuracy: +acc.toFixed(3), ci95: wilson(sum, d.eligible),
      status: d.eligible < 30 ? "样本不足（<30），区间较宽" : "已核验客观正确率",
      denominator: d, definitionVersion: VERSION,
      note: "partial 计 0.5；区间为 Wilson 95%；仅反映登记要点的命中，不等于知识掌握全貌"
    };
  }

  /* ⑥ B 级：自评达标率（与 A 级分开报告，绝不混用） */
  function selfRatedPassRate(reviews) {
    const rs = (reviews || []).filter(r => !r.abandoned && Number.isFinite(r.gradeSelf != null ? r.gradeSelf : r.grade));
    if (!rs.length) return { grade: "B", n: 0, rate: null, status: "积累中" };
    const ok = rs.filter(r => (r.gradeSelf != null ? r.gradeSelf : r.grade) >= 2).length;
    return { grade: "B", n: rs.length, rate: +(ok / rs.length).toFixed(3),
      status: "学习者自评达标率", note: "自评与 outcome 同源，不能用于衡量元认知校准", definitionVersion: VERSION };
  }

  /* ⑦ 真正的元认知校准：conf（揭示前）对独立核验 outcome */
  function metacogCalibration(reviews, opts) {
    const o = Object.assign({ minN: 30, minDistinctItems: 5 }, opts || {});
    const eligible = (reviews || []).filter(r => {
      const v = r.verification;
      const conf = r.confidenceSelf != null ? r.confidenceSelf : r.conf;
      return v && v.status === "verified" && !r.abandoned &&
        r.confidenceTiming === "before_reveal" &&
        Number.isFinite(conf) && conf >= 0 && conf <= 1;
    });
    const distinct = new Set(eligible.map(r => r.itemId || r.itemKey || "unknown")).size;
    if (eligible.length < o.minN || distinct < o.minDistinctItems) {
      return { grade: "C", status: "积累中", n: eligible.length, distinctItems: distinct,
        required: { minN: o.minN, minDistinctItems: o.minDistinctItems },
        biasPct: null, brier: null, note: "需要 ≥" + o.minN + " 条「揭示前信心 + 已核验结果」配对，且覆盖 ≥" + o.minDistinctItems + " 个条目" };
    }
    let sb = 0, sr = 0;
    for (const r of eligible) {
      const conf = r.confidenceSelf != null ? r.confidenceSelf : r.conf;
      const y = yFromVerification(r.verification);
      sb += conf - y; sr += (conf - y) ** 2;
    }
    const bias = sb / eligible.length, brier = sr / eligible.length;
    return {
      grade: "C", status: "已计算（探索性）", n: eligible.length, distinctItems: distinct,
      biasPct: Math.round(100 * bias), brier: +brier.toFixed(3),
      interpretation: bias > 0.05 ? "信心相对核验结果偏高" : bias < -0.05 ? "信心相对核验结果偏低" : "平均偏差较小",
      note: "outcome 来自独立核验，与 conf 不同源；仍是 N=1 探索性指标，禁止排名、禁止能力结论",
      definitionVersion: VERSION
    };
  }

  /* ⑧ 自评 vs 核验的落差（暴露「自评虚高/虚低」） */
  function compareSelfVsVerified(reviews) {
    const paired = (reviews || []).filter(r => r.verification && r.verification.status === "verified" && !r.abandoned &&
      Number.isFinite(r.gradeSelf != null ? r.gradeSelf : r.grade));
    if (paired.length < 10) return { n: paired.length, status: "积累中（需 ≥10 条配对）" };
    let selfOk = 0, verOk = 0, inflation = 0;
    for (const r of paired) {
      const s = ((r.gradeSelf != null ? r.gradeSelf : r.grade) >= 2) ? 1 : 0;
      const v = yFromVerification(r.verification) >= 0.8 ? 1 : 0;
      selfOk += s; verOk += v; inflation += s - v;
    }
    return { n: paired.length,
      selfPass: +(selfOk / paired.length).toFixed(3), verifiedPass: +(verOk / paired.length).toFixed(3),
      inflationPct: Math.round(100 * inflation / paired.length),
      note: "正值表示自评比核验更宽松；这是描述性落差，不是偏差的真值" };
  }

  window.VERIFY = {
    VERSION, KEYS, normalize, wilson, validateRubric, scoreKeypoints, verifyReview,
    yFromOutcome, yFromVerification, eligibleDenominator, verifiedAccuracy,
    selfRatedPassRate, metacogCalibration, compareSelfVsVerified
  };
})();
