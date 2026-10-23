# dsh-docx-proofread

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Word 文档校对插件——与 AutoDocxProofreading Electron 应用共享同一套校对引擎，模型调用全部走宿主的 `ctx.llm`（默认 `deepseek-official` 路由），无需单独配置 API key。

三个工具 + 一个技能：

| 工具 | 作用 |
|---|---|
| `docx_info` | 文档统计（字符/段落/预估分片），校对前评估成本 |
| `proofread_docx` | LLM 校对（wordError 按句 / ComprehensiveError 按段 / polish 整篇 / reduceAI 降AI率逐段改写），建议写入 `<文档名>.corrections.json` |
| `apply_corrections` | 把建议保格式应用为新文档 `<文档名>-proofread.docx`（含脚注/公式段落的 run 级替换） |

Web 客户端侧的展示分两层：

- **会话卡片**（`proofread_docx` toolview）：瘦身为摘要行（类型 · 建议数）+ 按钮；校对完成后自动打开侧栏预览。
- **侧栏预览**（经 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 的 `ctx.betterSidebar.registerTab` 扩展点注册，页签「Word 校对」）：上半建议清单、下半 docx 预览与全文高亮（类型分色、点击互跳）。同一文档去重单页签；重跑校对按 `generatedAt` 自动刷新内容。
- 未安装 better-sidebar 时自动降级：预览回退到会话卡片内（左右分栏）。

文件读取走 `ctx.remote.workspaceFiles.readBytes`（typert `RemoteResult`，字节在 `value.data`，整文件 32MB 上限）。只读展示，应用修改由 agent 调工具完成。

## 安装

```sh
dsh plugin --profile <name> add dsh-docx-proofread   # 从 npm（发布后）
# 或开发模式
pnpm dsh web --patch ./dsh-plugin/cordis.patch.yml
```

## 开发

```sh
cd dsh-plugin
node build.mjs          # 构建 dist/index.js（host）+ dist/client.js（web 客户端）
node --test tests/*.test.mjs   # 契约测试（mock ctx.llm 的校对→回写往返）
../node_modules/.bin/tsc --noEmit   # 类型检查
```

构建要求仓库根目录已 `npm install`（esbuild/mammoth/docx-edit 均复用根依赖）。测试在 `dist/` 产物上黑盒运行，不需要真实 dsh 宿主。

## 架构

```
src/index.ts            host 插件入口：三工具 + skill 注册
src/tools.ts            工具定义（参数、presentationMeta、corrections 落盘）
src/llmBridge.ts        ctx.llm.stream() → 引擎模型签名适配（含 RATE_LIMIT 重试）
src/env.ts              数据目录注入（~/.dsh-docx-proofread，可用 DSH_DOCX_PROOFREAD_HOME 覆盖）
src/stubs/              构建期替换桩：electron / chat.ts（自有 SDK 通道）/ lancedb.ts（RAG）
src/client/             Web 客户端半份：侧栏页签 + toolview 卡片 + 高亮/定位工具（移植自渲染层）
  ├ index.tsx           入口：toolview 槽位注册 + betterSidebar 页签注册（嵌套可选注入）
  ├ ProofreadPanel.tsx  共享预览主体（row/stack 双布局）
  ├ ProofreadSidebarTab.tsx  better-sidebar 页签组件
  ├ ProofreadToolview.tsx    会话摘要卡（自动打开侧栏 / 缺侧栏时内联兜底）
  └ fileAccess.ts       workspaceFiles.readBytes 的 RemoteResult 取值封装
build.mjs               esbuild：引擎从 ../../src 内联打包，三个桩在打包期替换
```

关键约定：**corrections 没有位置坐标**，靠 `original` 字符串匹配 + "同一原文第 k 条 → 文档第 k 次出现"的顺序契约定位；docx 回写（`wordProcess.ts`）与预览高亮（`src/client/correctionMatching.ts`）共用该规则，移植时不得改写。

## 与 Electron 应用的关系

引擎源码（`src/main/proof.ts`、`wordProcess.ts`、`src/shared/*`）单一来源，两个产品共用：

- Electron 应用行为不变：注入点默认值即原行为（`app.getPath('userData')`、chat.ts 通道）
- 本插件在启动时注入：插件数据目录、ctx.llm 模型通道；RAG 知识库与降AI管线为二期

## 状态与限制

- dsh 处于 developer preview，`slots`/`tools`/`llm` 接口可能变动
- 校对为前台工具调用（可取消）；超长文档的后台任务化与实时进度为二期
- RAG 知识库、降AI改写、Word 修订(track changes)输出：二期
- 已验证：mock 宿主下的完整校对→回写往返（`tests/engine.test.mjs`）；客户端契约测试（`tests/client-contract.test.mjs`：模块加载、字节取值、侧栏注册）；真实 dsh web 宿主 boot graph / 组合 URL 产物检查通过
