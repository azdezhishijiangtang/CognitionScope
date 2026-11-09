# CognitionScope 完整代码手册

> **本文件由 `npm run build:manual` 从磁盘源码自动生成，请勿手工编辑。**
> 正文是第 1–9 节；附录是交付目录内源码的逐字镜像。任何源码改动后重新生成即可，`npm test` 中的一致性门禁会检查手册是否新鲜。

**应用版本 {{APP_VERSION}}** · L1 schema {{L1_SCHEMA}} · L2 schema {{L2_SCHEMA}} · 发布线：Capability & Integrity Expansion

---

## 1. 定位与版本

CognitionScope 是**个人学习记录与探索性观测工具**，不是大脑模型、标准化认知测验、医疗器械或诊断工具。它把「记录 + 贴标签」升级为「可自我校准的实验台」：冻结预测 → 三类探针 → 可靠性曲线 → 双决策门槛 → 参数拟合 → 校准后排期 → 干预保真度。

纯前端、零运行时依赖、无构建步骤，双击 `index.html` 即可在 `file://` 下离线运行，数据留在浏览器 `localStorage`。

| 版本项 | 值 | 说明 |
|---|---|---|
| 应用版本 | {{APP_VERSION}} | 只在 `PROJECT-FACTS.json`、`package.json`、`index.html` 标题/徽标/页脚出现 |
| L1 schema | {{L1_SCHEMA}} | 主状态 `CS`，可变；行为冻结以保持历史回归 |
| L2 schema | {{L2_SCHEMA}} | 事件层 `CS6`，append-only；**不随应用版本变化** |
| 算法定义版本 | `params/7.0`、`calibration/7.0`、`consent/7.0`、`v7-init`、`v7-fit` | 写进冻结预测、审计事件和导出包，重编号会让历史数据不可比，故沿用 7.x |
| v9 模块版本 | 各模块 `*/9.0` | 新模块独立版本，不改动上述已冻结数据语义 |

## 2. 隐私策略（必须先读）

- 全项目运行时**唯一**网络出口是 `js/ai.js` 的 `researchQuery()`，也是唯一一处 `fetch()`；`js/stream.js` 只解析响应体。
- 请求体只有固定 system prompt + 用户手动输入的通用研究问题 + `stream` 开关；不读取任何个人数据或研究结果。`cfg()` 仅读取 L1 中的服务商选择 `aiCfg.provider`。
- 个人数据 AI 接口全部 fail-closed；「一句话打卡」等界面入口已移除。
- **API Key 与锚点口令仅驻留当前页面内存**，刷新后需重新输入；不写入 localStorage、L1/L2 或导出包。
- `CONSENT.assertBeforeCall()` 是恒返回 `allowed:false` 的 fail-closed 桩，**不是**外发请求的同意网关；勾选框只是界面确认。
- 运行时域名白名单 + CSP `connect-src` 双重限制；两者粒度不同，详见 `SECURITY-PRIVACY.md`。
- 服务商仍会收到问题文本、API Key 与请求元数据；PII 检测只是启发式拦截，不是保证。


**v9 健壮性细节**：流读取设有分块数上限（防止 reader 永不结束）；`STREAM` 模块缺失时 AI 请求自动降级为非流式；快照的 L2 部分只存轻量摘要（`CS6.stats()`），写入配额不足时自动淘汰最旧快照；完整性口令在任何路径都不持久化。

## 3. 快速开始

```bash
# 运行：双击 index.html，或
python3 -m http.server 8080

npm run check            # 逐文件语法检查
npm test                 # 全量回归（含历史回归、v9 能力测试、文档门禁、浏览器检查）
npm run test:legacy      # 仅历史回归
npm run test:docs        # 仅文档-实现一致性门禁
npm run test:browser     # 真实 Chromium file:// 检查
npm run build:manual     # 改动源码后重新生成本手册
```

改代码后的标准流程：`npm run build:manual` → `npm test`。

## 4. v9 新增能力（全部纯前端、零外发）

| 模块 | 能力 | 解决什么 |
|---|---|---|
| `js/stream.js` | SSE 增量解析：UTF-8 跨块割裂、CRLF、多行 `data:`、心跳、`[DONE]`、畸形 JSON 隔离；指数退避 + 抖动重试策略 | 流式响应与 429 / 5xx / 断线边界 |
| `js/ai.js` | 唯一网络出口升级为流式输出 + Retry-After 遵循 + 超时/取消，请求体仍只含通用问题 | 真实厂商 API 合约的**离线**验证能力 |
| `js/search.js` | 中英文混合分词（CJK 单字 + bigram）、BM25 倒排索引、字段加权、片段、确定性力导向图谱布局 | 本地全库检索与关系可视化 |
| `js/snapshots.js` | 环形快照、结构化 diff、**仅 L1 原子回滚**（L2 append-only 不回滚，恢复记为 audit 事件） | 误导入 / 数据丢失的可恢复性，且不破坏冻结预测 |
| `js/replay.js` | 导出包只读回放：manifest 复算、脱敏复核、链结论、与当前状态差异报告 | 浏览器端回放脚本 |
| `js/integrity.js` | Web Crypto HMAC-SHA256 + PBKDF2 外部锚点；无口令无法重签；Web Crypto 不可用直接拒绝 | 把 FNV 链升级为可外部比对的密封（**明确非防伪**） |
| `js/sensitivity.js` | 缺失数据 best/worst 边界、tipping point、稳健性分级 | 量化 complete-case 结论对缺失数据的稳健性（**不是插补**） |
| `js/sced.js` | N=1 随机化检验（精确/蒙特卡洛）、bootstrap CI、NAP、lag-1 自相关 | 单案例结论的统计严谨性（**仍不可推广**） |
| `js/v9ui.js` | 「检索与回放」「方法与完整性」两个研究页 | 上述能力的可操作入口 |
| `tests/browser-check.js` | 真实 CSP 外连对照 + 运行时能力自检 | 可执行的设备自检（**不是跨浏览器矩阵**） |

## 5. 架构与数据边界

| 层 | 内容 | 关键模块 |
|---|---|---|
| L1 记录层 | 主状态 `CS`，可变（items / reviews / lab / pcm），schema {{L1_SCHEMA}} | `js/core.js` |
| L2 事件层 | `CS6`，append-only、13 个登记流、FNV-1a 本地一致性链、参数版本冻结、独立存储键，schema {{L2_SCHEMA}} | `js/state6.js`、`js/persistence.js` |
| L3 分析层 | 纯函数、零 DOM，Node 可直接测 | 原校准 / 参数 / 探针 / 实验 / 核验 / 指标 / 信效度 + v9 检索 / 快照 / 回放 / 完整性 / 敏感性 / SCED |
| L4 呈现层 | 工具层（A 级指标）／研究层（B/C/D 全标注） | `observe` / `review` / `research` / `calibration-ui` / `v9ui` / `app` |

**存储键**：L1 `cogscope_v1`；L2 `cogscope_v6_events`（导入前备份 `_preimport`）；v9 快照 `cogscope_v9_snapshots`。完整性锚点**不落本地**，由用户导出到外部保存。

### L2 登记流数据字典（从 `js/state6.js` 自动提取）

| 流 | 必需字段 | 说明 |
|---|---|---|
{{STREAM_TABLE}}

> FNV-1a 链只用于本地一致性检查；带密钥的密封请另用 `js/integrity.js` 生成外部锚点。两者都不抵御拥有本地写权限且能取得口令的攻击者。

## 6. 测试口径

通过数**一律以命令输出为准**，文档不记录聚合数字。套件清单唯一来源是 `PROJECT-FACTS.json` 的 `suites`：

| 组 | 文件 |
|---|---|
{{SUITE_TABLE}}

- `test.docs-consistency.js` 校验版本、schema、套件清单完整性、隐私实现、CSP 源数、失效表述黑名单，以及本手册是否与磁盘源码逐字一致。
- `browser-check.js` 只在检测到 Chromium 时纳入汇总；未检测到会明确标注跳过及原因。
- v9 的流式、重试、取消、白名单、隐私请求体全部用 **mock fetch 离线验证**，不需要真实 API Key，也不声称完成了真实厂商合约测试。

## 7. 模块 API 速查（从源码自动提取全局导出）

| 模块 | 全局导出 |
|---|---|
{{API_TABLE}}

> 更完整的函数签名请直接查附录中对应模块的 `return { ... }` 导出块。

## 8. 仍需诚实对待的限制

1. N=1 结果只适用于该用户和观测时间窗，**不可推广**；`sced.js` 提升的是个体内统计严谨性，不改变这一点。
2. 当前实验统计在缺失结局存在时会降为不确定；完整配对估计仍是 complete-case。`sensitivity.js` 量化的是结论稳健性，**不是缺失数据的修复或插补**。
3. 本地 FNV-1a 链不是密码学防伪；HMAC 锚点也不是——页面可被本地替换、口令可被截获、锚点必须存到本设备之外才有意义。
4. PII 检测是启发式拦截，不是保证；导出脱敏与回放复核是字段级 + 字符串级闸门，仍建议人工复核。
5. 真实第三方 API 合约测试、跨浏览器兼容矩阵（Firefox / Safari / WebKit）**仍未完成**；本项目只提供离线合约测试与运行时能力自检，不声称已在三种浏览器实测。
6. 研究任务原型与占位常模不构成标准化认知测量；不输出 z 分数、人群百分位或能力画像。
7. 所有合成数据实验仅用于验证方法可行性，不是对真实平台性能的评估。
8. 快照回滚只恢复 L1；L2 事件层 append-only 不回滚，因此「回到过去」不会抹掉已冻结的观测与预测。

## 9. 文档维护规则

v7 的教训是「同一事实被复制到五处、更新时漏掉其余四处」。v8 起用三条规则根治，v9 继续沿用并加强：

1. **单一事实来源** `PROJECT-FACTS.json`：版本、schema、套件清单、隐私边界、v9 模块与能力登记。门禁会检查**所有测试文件都已登记在套件清单中**，防止新增测试被漏跑。
2. **手册自动生成** `tools/build-manual.js`：正文模板在 `tools/manual-intro.md`，附录由磁盘源码逐字生成（自动计算围栏长度，避免 Markdown 嵌套破坏）。
3. **一致性门禁** `tests/test.docs-consistency.js`：纳入 `npm test`，手册过期、版本漂移、套件漏登记、失效表述回潮都会让测试失败。

文档文件名不含版本后缀；测试文件名中的 `v5` / `v6` / `v7` 是历史资产命名，保留以维持可追溯性。

## 10. v10 通俗化层（Plain-language Layer）

v10 的定位是「看起来专业、用起来不费劲」：**专业感来自外观与方法严谨性，理解门槛降在表达与引导上**。不删功能、不简化方法、不改动任何算法与数据格式。

| 文件 | 职责 |
|---|---|
| `js/glossary.js` | 60+ 条术语词典（纯数据，v11 扩充到 70+ 条并新增「示例 / 学科」两类），黑话 → 一句白话；`get / has / query / cats` 供术语页与说明卡共用 |
| `js/plain.js` | 15 个功能页的白话说明配置（v11 起 16 页）、说明卡注入、导览首页、名词解释页、通俗说明开关 |
| `tests/test.plain.js` | 说明覆盖、术语引用一致性、导览全覆盖、开关与幂等的离线验证 |

**四层解释**：① 每页顶部「本页说明」卡（这页干嘛 / 我该点哪里 / 结果怎么读 / 本页名词，点术语出白话）；② 名词解释页（搜索 + 分类筛选）；③ 导航白话副标题；④ 分组导航常驻可见（v9 隐藏研究层 10 页是主要理解障碍，v10 改为只淡化不隐藏）。

**实现纪律**：说明卡用 `insertAdjacentHTML("afterbegin", ...)` 插入，**不重建原有 DOM 节点、不影响业务按钮事件**；`mount()` 先移除旧卡再插入，保证幂等；通俗模式关闭时直接跳过。默认页改为导览页，顶部 4 张概览卡改由 `init()` 显式调用 `OBS.ticker()` 渲染，与默认页解耦。

**视觉**：`index.html` 内联浅色专业设计系统，重定义 CSS 变量使全部业务模块自动换肤；零外部资源，`style-src 'unsafe-inline'` 约束不变，双击 `index.html` 仍可离线运行。

**诚实边界**：v10 只是把第 8 节的限制也翻成白话（首页「它不是什么」四条 + 术语表 + 每页「结果怎么读」），**没有把任何限制说成已修复**，也没有改动第 2 节的隐私策略。

## 11. v11 示例内容包与结构借鉴（Demo Content Pack）

v10 的方法学骨架很完整，但**里面是空的**：检索无可搜条目、知识网络 0 节点 0 边、复习队列空白、要点核验与 rubric 全靠用户手填。v11 补上一批原创编写的示例内容，让这些能力一打开就有东西可看、可试用。全程不改算法、不改 schema、不动隐私边界。

| 文件 | 职责 |
|---|---|
| `js/demo.js` | 46 条原创示例、80 条先验边、7 类学科词表、9 类错因、27 个课程/章节层级；`validate / topics / edges / catalog / status / realItems / load / clear / exportPack` 纯逻辑 API（零 DOM / 零存储 / 零网络） |
| `js/demo-ui.js` | 示例内容馆页面（筛选 / 分层提示 / 要点与错因 / 确定性图谱）、载入与清除按钮、全站演示模式横幅 |
| `ATTRIBUTION.md` | 来源、借鉴方式、版权边界与「明确没做的事」 |
| `tests/test.demo.js` | 27 项离线断言：数据自检、默认零写入、载入幂等、清除精确、三处口径一致、导出/PCM 剔除、不接 AI、不冒充常模、版权齐全 |

**字段对齐**：示例条目的 `content / answer / rubric` 对齐 `CS.addItem`；`keypoints[]` 喂要点核验（A 级客观正确率）；`commonErrors[] / errorTypes[]` 作错因归因；`hints[]` 实现「先试后看」的分层提示；`prereq[] / relates[]` 生成知识网络的初始边；`course → chapter` 组成层级并转成学科分类词表。

**隔离口径**（本节最重要的部分）：

1. **默认零写入**：不调用 `DEMO.load()` 时，L1/L2/导出包与 v10 逐字一致。
2. **三重标记**：载入的条目带 `demo:true` + `demoVersion` + `source`（`demo/…`）。`CS.isDemoItem()` 是唯一判定，与 `DEMO.isDemoItem()`、`EXPORTM` 内部 `isDemo` 同口径。
3. **统一剔除**：`CS.exportJSON()`、`EXPORTM.buildBundle()`（state / jsonl / csv / manifest 计数）、`CS.fitParams()`、`CS.buildPCM()` 一律排除；manifest 的 `caveats` 写明剔除条数，PCM 增加 `demo:{loaded,count,excluded}` 登记。
4. **仍可试用**：`CS.findDue()` / `futureLoad()` / 图谱保留演示条目，因此复习队列、负荷图与知识网络不会变空。
5. **精确清除**：`DEMO.clear()` 只删带三重标记的条目；用户真实条目及相似但无标记的条目一条不动。
6. **L2 不可抹除**：演示期间的复习事件按 append-only 规则留在流水账里，清除示例只清 L1。

**版权处理**：外部仓库的 `LICENSE` 均为「保留所有权利」，而交付物要打包分发。因此示例文本 100% 原创编写，只借鉴组织方式（课程→章节→知识点、要点/错因/分层提示/先验边），**未复制任何仓库原文**；`ATTRIBUTION.md` 显式署名、列出参考仓库、说明不授予第三方再分发，并纳入本手册镜像。

**明确不做的事**：不把学科题当 `lab.js` 的 `NORMS` 常模（五项仍 `source: null`）、不把内容接入 AI 外发路径、不扩大白名单与 CSP `connect-src`、不静默写入用户数据或导出包、不谎称修复第 8 节的任何固有限制。

---

## 附录：源码镜像（逐字）

> 以下 {{MIRROR_COUNT}} 个文件由 `tools/build-manual.js` 从磁盘读取后原样写入。每个标题对应交付目录内的同名文件；`npm run test:docs` 会重新生成并与本文件逐字比对，不一致即判定手册过期。
