# 部署说明 · CognitionScope v11

## 在线访问

- 站点地址：<https://azdezhishijiangtang.github.io/CognitionScope/>
- 仓库地址：<https://github.com/azdezhishijiangtang/CognitionScope>

首次发布由 GitHub Actions 完成，通常需要 1–3 分钟；之后每次推送到 `main` 都会自动重新发布。

## 自动部署是怎么工作的

本项目是**纯前端、零依赖、零构建**的静态站点，仓库根目录（含 `index.html` 与 `js/`）就是站点根目录，因此不需要打包工具。

| 工作流 | 文件 | 触发条件 | 作用 |
|---|---|---|---|
| Deploy GitHub Pages | `.github/workflows/deploy-pages.yml` | push 到 `main`、手动触发 | 语法校验 → 上传站点产物 → 发布到 Pages |
| CI | `.github/workflows/ci.yml` | push / PR 到 `main`、手动触发 | `npm run check` + `npm test` 全量回归（含真实 Chromium 检查） |

Pages 的构建来源设置为 **GitHub Actions**（`build_type: workflow`），而不是从分支直接读取。这样发布动作有明确的运行记录，也便于以后加构建步骤。CI 与发布相互独立：测试结果作为持续反馈，不会把已经可用的静态站点卡住。

### 手动重新发布

在仓库的 **Actions → Deploy GitHub Pages → Run workflow**，或直接推一个空提交：

```bash
git commit --allow-empty -m "chore: redeploy pages"
git push origin main
```

### 本地验证

```bash
python3 -m http.server 8080     # 然后打开 http://localhost:8080
npm test                        # 全量回归，需 Node.js 18+
```

## 数据与隐私

站点是静态文件，GitHub 只负责下发 HTML/JS，**不接收、不存储任何用户数据**。所有学习记录保存在访问者本机浏览器的本地存储中；唯一的联网行为是「AI 引擎」由使用者主动填入自己的 API Key 后发起的请求。详见 `SECURITY-PRIVACY.md`。

## 目录约定

- 原始项目文件（`index.html`、`js/`、`tests/`、`tools/`、各文档）保持不变，项目自带的文档一致性门禁依赖它们逐字一致。
- `.nojekyll` 确保静态资源不被 Jekyll 处理；`.gitignore` 排除测试探针与本地产物。
- 若修改了 `README.md` 等被手册镜像的文档，需执行 `npm run build:manual` 重新生成《完整代码手册》，否则 `npm test` 的文档门禁会失败。
