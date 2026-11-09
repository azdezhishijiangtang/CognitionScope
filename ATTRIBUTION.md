# 来源、借鉴与版权说明（v11 示例内容包）

> 本文件说明 `js/demo.js` 中示例内容包的来历，以及为什么交付包里**没有**直接附上任何 GitHub 仓库原文。
> 事实登记见 `PROJECT-FACTS.json` 的 `demoContent` 段；由 `tests/test.docs-consistency.js` 校验本文件存在且声明齐全。

---

## 1. 先说结论

v11 的示例内容包（46 条示例条目、80 条先验边、7 类学科词表、9 类错因分类、分层提示）**全部文本由本项目原创编写**，没有复制 `azdezhishijiangtang` 账号下任何仓库的题目、讲义、公式、模型定义、词典或注释。

借鉴的是**组织方式与字段结构**，不是作品内容本身：

| 借鉴的结构 | 参考来源 | 在 v11 里的对应 |
|---|---|---|
| 「课程 → 章节 → 知识点」层级 | `Principia/.../data/courses.ts`、`topics/*.ts` | `DEMO.ITEMS[].course / chapter` + `DEMO.topics()` |
| `keyPoints[]` 要点清单 | `wenji/src/content/models.ts` 的 `ModelDef` | `keypoints[]`，喂给要点核验 |
| `commonErrors[]` 常见错因 | 同上，以及 `wenqu` 公式的 `tip` | `commonErrors[]` + `ERROR_TYPES` 错因 taxonomy |
| `hints[]` 分层提示 / `solution[]` 分步 | `Principia/.../data/problems/*.ts` | `hints[]`，一次只给一条 |
| `relatedProblemIds[]` 关联边 | 同上 | `prereq[] / relates[]` 先验边，生成知识网络 |
| `difficulty: 1–5` / `subject` 分类 | `Principia/problems`、`wenqu/subjects.ts` | `difficulty` + `DOMAINS` 学科词表 |
| 「一句话讲清 + 点出易错」的白话写法 | `wenji` README、`wenqu` 的 `tip` | `js/glossary.js` 新增的学科名词白话对照 |

结构、字段名、分类维度属于**方法与组织方式**，不构成对具体文字作品的复制；示例条目的题干、答案、要点、提示、错因描述均为重新撰写。

---

## 2. 为什么不把仓库原文打进交付包

7 个仓库的 `LICENSE` 均为「保留所有权利」声明，明确写着：不采用任何开源许可证、不得将仓库全部或部分内容用于自己或第三方的任何项目（无论商业或非商业）、不得删除版权标识。

这些仓库是交付对象本人账号下的原创作品，**本人内部使用当然没有问题**；但 `CognitionScope-v11.zip` 是一个要随包分发的文件。一旦把 4.3 万行讲义、148 道例题、317 条公式或 266 条语文条目原文打包进去，就需要走书面授权流程、保留全部署名与版权标识，且会显著改变交付物的授权性质。

因此 v11 选择更干净的路径：

- **不复制任何仓库原文**，只保留结构借鉴，并在本文件与界面「内容与版权说明」卡片中显式标注来源与借鉴方式；
- 示例文本作为本项目的原创内容随包交付，不引入第三方作品的再分发问题；
- 如果用户后续希望把仓库原文真正引入（例如把 266 条语文条目做成正式内容库），可在此基础上补一份作者授权说明并保留原 `LICENSE`，再单独发布——**本包不包含该授权，也不默认替用户做这个决定**。

---

## 3. 明确没有做的事（与评估报告第五节红线一致）

1. **没有**把任何学科题目填进 `js/lab.js` 的 `NORMS` 占位常模。认知能力任务常模需要代表性抽样与信效度证据，学科知识题不是常模；`NORMS` 五项仍保持 `source: null`。
2. **没有**把仓库内容或示例内容接入 `js/ai.js` 外发路径。唯一网络出口仍只发送手动输入的通用研究问题，示例内容不进入任何请求体。
3. **没有**静默写入用户 L1/L2 或导出包。示例默认零写入；载入需用户显式点击；`CS.exportJSON()` 与 `EXPORTM.buildBundle()` 一律剔除带 `demo:true` 标记的条目。
4. **没有**扩大运行时白名单或 CSP `connect-src`（仍为 4 个厂商域名 + 2 个本机 Ollama 地址）。
5. **没有**宣称修复 N=1 不可推广、complete-case、哈希链非防伪等固有限制。灌入示例只换了素材，不改变统计口径。
6. **没有**删除或省略任何版权声明；本文件与 `js/demo.js` 的 `META.attribution` 均随包交付。

---

## 4. 示例内容的使用范围

- 示例包是 `CognitionScope` 交付物的一部分，随本项目交付给**作者本人**使用与试用。
- 文本为本项目原创，可由作者自由修改、替换或删除；界面提供「载入示例 / 清除示例 / 只导出示例包」三个显式动作。
- 示例内容**不构成学习成效证据，不作为认知能力常模，不用于任何诊断、排名或能力结论**。
- 不授予第三方独立再分发示例文本的权利；若需对外发布，请由作者自行确认授权措辞。

---

## 5. 参考的仓库清单（仅作结构对照，未随包分发内容）

| 仓库 | 参考的结构 |
|---|---|
| `Principia` | 课程体系层级、知识点 `keyPoints`、例题 `hints/solution/difficulty`、公式分组、`relatedProblemIds` |
| `wenji` | `ModelDef` 的 `definition + keyPoints + commonErrors` 三件套、错因分类法、内容种子分组、引擎隔离与测试分层 |
| `wenqu` | 四科学科分类表、公式的 `category / variables / tip` 字段、常见失分点的白话写法 |
| `gezhi` | 与 Principia / wenqu 为合并副本，去重后不重复参考 |
| `fusheng-roleplay` | 密钥不落盘的 replacer 写法（仅作工程写法对照，未采用其多厂商预设） |
| `bounce-wonderland` / `echo-run` | 与本主题无关，未参考 |

> 完整盘点与量化结论见交付目录外的《GitHub仓库数据借鉴评估.md》（该评估文档不属于本 zip）。

---

## 6. 代码与文档事实来源

`PROJECT-FACTS.json` 是版本、schema、套件清单、隐私边界与示例包登记的唯一事实来源；`tools/build-manual.js` 会把本文件与全部源码逐字镜像进《完整代码手册.md》；`npm run test:docs` 会校验手册与磁盘一致、示例包默认不写入、来源字段齐全、导出剔除闸门存在、版权声明文件存在。
