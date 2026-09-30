# AutoDocxProofread 分批改进实施方案

> **生成日期**：2026-09-28
> **分析基线**：`base_ui` 分支（fffd458 附近），基于对渲染进程 / 主进程 / 构建打包三路代码审查的结论。
> **使用方式**：每批次新开一个对话，指明「请实施 IMPROVEMENT_PLAN.md 中的批次 N」即可。每批自带问题背景与验收标准，可独立实施。
> **行号说明**：文中行号是分析时快照，前序批次实施后会漂移，**请以符号名 / 代码内容搜索定位，不要盲信行号**。

---

## 总览

| 批次 | 主题 | 维度 | 优先级 | 预估工作量 | 前置依赖 |
|---|---|---|---|---|---|
| 1 | 功能性 Bug 快速修复 | 功能/UX | P0 | 0.5 天 | 无 |
| 2 | API Key 安全加固 | 安全 | P0 | 0.5 天 | 无 |
| 3 | LLM 链路健壮性与成本控制 | 功能/成本 | P0 | 1~2 天 | 无 |
| 4 | 依赖与项目卫生清理（轻量化①） | 轻量化 | P1 | 0.5~1 天 | 无 |
| 5 | 渲染层加载优化（轻量化②） | 轻量化/性能 | P1 | 0.5~1 天 | 建议批次 4 后 |
| 6 | 校对交互性能优化 | 性能/UX | P1 | 1~2 天 | 无 |
| 7 | 主题系统统一（UI 基础） | UI | P1 | 1~2 天 | 无 |
| 8 | 交互体验完善 | UX | P2 | 1~2 天 | 无硬依赖 |
| 9 | 组件工程重构 | 工程 | P2 | 2~3 天 | 建议批次 7 后 |
| 10 | 主进程架构与可观测性 | 工程/性能 | P2 | 2~3 天 | 建议批次 3 后 |

**依赖关系**：1/2/3/4 相互独立，可任意顺序或并行；5 在 4 之后做（依赖清理完基线更干净）；9 在 7 之后做（拆分出的组件直接使用新 design tokens，避免返工）；10 的 process-docx 合并放在 3 之后（批次 3 已动过该区域，避免冲突）。

---

## 实施约定（所有批次通用）

- **分支**：每批次从主线拉独立分支，命名 `improve/batch-N-主题`，完成后合并回主线。
- **提交**：仓库已配置 commitlint + git-cz，遵循 conventional commits（如 `fix:`、`perf:`、`refactor:`、`chore:`）。
- **每批次完成前必跑**：
  1. `npm run lint:fix`
  2. `npm test`（vitest）
  3. `npm run build`（涉及主进程/依赖变更的批次加跑 `npm run build:win` 确认打包）
- **UI 相关批次**（5/6/7/8/9）：手动回归清单见各批次验收标准。
- **进度跟踪**：完成后把对应任务前的 `- [ ]` 勾为 `- [x]`。

---

## 批次 1：功能性 Bug 快速修复

**目标**：修复已确认的功能性 bug 与死代码，成本极低、收益直接。

### 任务清单

- [x] **测试连接按钮点击必崩**：`src/renderer/components/api/ApiSelector.vue:73` 解构漏了 `testApi`，而 `:118-120` 的 `handleTest()` 直接调用 → ReferenceError。补上解构，并给按钮加 loading 态（测试期间禁用）。
- [x] **APISet 横幅永久驻留**：`src/renderer/views/APISet.vue:6/9` 的 `auto-close="4000"` 不是 el-alert 合法 prop（删除）；`useApiSettings.ts:203/209` 将 `showAlertSuccess/showAlertError` 置 true 后从不复位 → 在合适时机复位（setTimeout 4s，或下次操作前复位）。（实施说明：横幅 ref 改为模块级共享——此前 ApiSelector 实例触发的 deleteApi 与 APISet 页展示的横幅属于不同 composable 实例，横幅实际从不点亮。）
- [x] **process-docx 无兜底**：`src/main/ipcHandlers.ts:343-601` 四个模式分支之外无 else，未知模式返回 `undefined` → 返回 `{ success: false, message: 'Unknown proofread mode' }`。（实施说明：改为在 try 之前 throw `Unknown proofread mode`——handler 外层 catch 会把 try 内的错误吞成空结果，渲染端会静默显示空校对结果；throw 让 IPC 拒绝，前端走统一错误提示。空 Model 仍走 try 内原有参数校验提示。）
- [x] **getHistoryById 错误信息不插值**：`src/main/ipcHandlers.ts:827-836` 单引号字符串改模板字符串；id 为空时提前返回 null（调用方按可空处理）。
- [x] **getter 名笔误**：`src/renderer/components/DocPreview.vue:1337` `fileStore.isfilePathEmpty` → 实际是 `isFilePathEmpty`（`store.ts:40`）。**注意**：当前条件恒真，修正后行为会变，先确认该处本意（应为「未选文件」判断）再改。（已确认：initCorrectStatus 意为「store 持久化有文件路径时回填表单」，修正后行为兼容。）
- [x] **AddApiDialog 假 loading**：`AddApiDialog.vue:228-242` `submitting` 在同步 emit 后立即 finally 复位，保存期间按钮 loading 永不显示 → 改为对话框 closed 事件时复位，或 emit 后保持 loading 由父组件控制关闭。（实施说明：新增 `submitHandler` prop 让对话框 await 父组件保存结果——loading 覆盖整个保存过程，失败后可重试，成功后由对话框自行关闭；原 `@submit` 事件保留作兜底。）
- [x] **Dictionary 表单校验**：`Dictionary.vue:214-217` 手动 trim 判断改 el-form rules（对齐 AddApiDialog 的校验风格）。
- [x] **死代码清理**：
  - `DocPreview.vue:434-437` `timeLimit` 常量定义后未使用；
  - `App.vue:67` `@back` 监听与 `FormatClone.vue:440` 从未触发的 `emit('back')`（二选一：实现返回行为，或删掉）；
  - `renderer.ts:30-32` 未使用的 `elementLocale` computed；`renderer.ts:7` 与 `App.vue:80` 重复引入 common.css；
  - `ipcHandlers.ts:79` 未使用的 `PROOFREAD_CANCEL_CHANNEL`；`proof.ts:7` 导入未用的 `getAllDocuments`；
  - `Proof.vue:293` 700ms setTimeout 未跟踪句柄（onUnmounted 清理）。

### 风险

低。唯一需要判断的是 `isfilePathEmpty` 修正后的条件语义。

### 验收标准

- API 页「测试连接」可点击且执行成功/失败均有反馈；删除 API 后横幅 4 秒左右消失。
- 知识库新建空名被表单校验拦截。
- `npm test`、`npm run lint:fix`、`npm run build` 全绿。

---

## 批次 2：API Key 安全加固

**目标**：API key 不再明文落盘、不再进控制台日志。

### 任务清单

- [x] **入库加密**：主进程保存 API 设置处（`ipcHandlers.ts` 的 update/insert handler，写 `api_settings.apiKey`，参考 `database.ts:63-64/119-133`）改为 `electron.safeStorage.encryptString` 后存 base64。（实施说明：加密/解密收敛在 `src/main/apiKeyCrypto.ts`，挂在 DB 层读写（insertAPISetting/updateAPISettingById 加密，getAPISettingById/getAllAPISettings/getAPISettings 解密），IPC 与上层消费方无需改动；密文带 `enc:v1:` 前缀标记，天然区分新旧格式且加密幂等。）
- [x] **读取兼容迁移**：读取时 `safeStorage.isEncryptionAvailable()` 判断 + try decrypt；解密失败视为旧明文记录正常使用，并在下次保存时自动升级为密文（Linux 无 keyring 时降级明文并 console.warn）。（实施说明：不带 `enc:v1:` 前缀的旧明文记录读取时原样返回，下次保存自动加密；解密失败原样返回让上游以鉴权失败可见地暴露问题；单元测试见 `__tests__/apiKeyCrypto.test.ts`。）
- [x] **清除明文日志**：`ipcHandlers.ts:242/268/344/420/496/572`（完整 key 直接 console.log）与 `proof.ts:1297`（embedding key）改为打码输出（如 `key.slice(0,6) + '...'`）。（实施说明：共打码 10 处，另含 `embeddingConfig` 对象 dump 一处——其中含 apiKey，展开为打码副本再输出。）
- [ ] **（可选加固）脱敏回传**：`get-all-api-settings`（`ipcHandlers.ts:220-222`）返回脱敏副本；编辑弹窗回显掩码、空值表示不修改原 key。改动涉及编辑流程 UX，可单独决策是否做。（未实施：涉及编辑/知识库/格式克隆等多条取 key 链路的 UX 改造，暂缓。注意：渲染层 apiStore 仍会把选中的 key 持久化进 localStorage，此项是消除该明文落盘点的前提。）

### 风险

旧明文记录的兼容读取是关键路径，务必先写再用旧库验证。safeStorage 仅需在 app ready 后调用（保存/读取均在 handler 中，天然满足）。

### 验收标准

- 保存 API 后查看 `userData/data/app.db`，apiKey 字段为密文；重启后功能正常。
- 用当前已有的明文记录启动，测试连接正常，重新保存后变密文。
- 全项目 grep 不到完整 key 的日志输出。

---

## 批次 3：LLM 链路健壮性与成本控制

**目标**：消除「每次校对 token 翻倍」的成本缺陷；失败可观测、超时真实生效、长输出不被截断。

### 任务清单

- [x] **review 阶段显式开关（成本减半）**：`ipcHandlers.ts:369-371` 的 `if (!reviewApiInfo && api_info)` 中 `api_info` 为模块级对象恒真 → 现状是即使用户未选审核模型，wordError/ComprehensiveError/polish 三种模式（`:343-601` 三段复制代码）都会用主模型把全部建议再跑一遍。改为：仅当用户显式选择审核模型或开启「结果复核」开关时执行，默认关闭；设置页暴露开关；README/changelog 说明行为变化。建议先抽一个 `shouldRunReview()` 辅助函数在三分支共用（批次 10 再做彻底合并）。
- [x] **超时语义修正**：前端 `setTimeLimit` 实际被当作 `requestsPerMinute` 使用（`ipcHandlers.ts:259-271` → `proof.ts:1359-1363`）→ 把设置项标签与传参改名为「每分钟请求数上限」；**新增**「单请求超时（秒）」设置（默认宽松，如 300s），透传到 `chat.ts` 所有客户端构造（OpenAI/Anthropic SDK `timeout`，Gemini `requestTimeout`）。
- [x] **客户端复用**：`chat.ts:166-169/390-393/512` 每次请求内 `new OpenAI()/new Anthropic()` → 按 `(baseURL, apiKey, provider)` 模块级缓存复用；`maxRetries` 设 2~3（SDK 自带对 429/5xx 的指数退避）。
- [x] **失败分片可观测**：`proof.ts:1330-1335`（失败返回空结果）与 `:382-391`（失败任务被 filter 掉仅 console.error）→ `runWithLimits` 收集 `{stage, index, error}` 列表，process-docx 返回 `failedSegments`；前端校对完成后提示「N 个分片校对失败」。（可选进阶：支持「仅重试失败分片」。）
- [x] **max_tokens 可配置**：`chat.ts:70`（Gemini `maxOutputTokens: 2048`）与 `chat.ts:516`（Anthropic `max_tokens: 2048`）默认提高到 8192 或读取设置，消除长章节 JSON 截断→降级解析丢建议的问题（Claude Code 路径已是 16000，参考 `chat.ts:749`）。
- [x] **导出未匹配上报**：`wordProcess.ts:397-404` 已统计 `unmatched` 但只打 console → 沿 `exportCorrectedDocx` 返回链（`ipcHandlers.ts:686-691`）带到前端，导出成功提示附带「X 条建议未在文档中匹配到」。

**实施说明（2026-09-29）**：
- `shouldRunReview()` 抽为零依赖模块 `src/main/reviewGate.ts`（可直测，见 `__tests__/reviewGate.test.ts`）；三分支的审核模型解析收敛为 `resolveReviewApiInfo()`（显式选择审核模型→查库，失败回退校对模型）。开关在 API 设置页「审核模型配置」区（`apiStore.reviewEnabled`，localStorage 持久化，默认关）。额外加固：审核阶段失败不再让整个校对失败——保留未过滤结果并记入 failedSegments。README「重要提醒」区已补充行为变化说明。
- 主进程参数链 `TimeLimit`→`requestsPerMinute` 已按语义更名（localStorage 持久化键保持 `TimeLimit` 兼容）；新增 `requestTimeoutSec` 设置（RateLimitSettings 卡片内，默认 300s，5~3600s），经 selectAPISetting → `api_info` → process-docx `setRequestTimeoutMs()` 透传到 chat.ts 客户端工厂。Gemini SDK 的选项实际名为 `RequestOptions.timeout`（计划中的 requestTimeout 不存在），毫秒单位。
- 客户端缓存键为 (kind, baseURL, apiKey, timeoutMs, defaultHeaders)；模拟 Claude Code 的 sessionId 随客户端一次性生成复用——若每次请求随机生成会连带缓存键漂移导致永不命中。maxRetries=2。
- `proofreadTextWithRAG` 不再把失败吞成空结果（改为向上抛，由 runWithLimits 记入失败分片）；`runWithLimits` 新增 `onItemFailed` 回调；proofreadDocument/reduceAIDetectionDocument 返回 `failedSegments`（stage/index/label/message），DocPreview 校对完成后 warning 提示「N 个分片校对失败」。顺带修复：process-docx 外层 catch 现在返回 `message`，前端不再把主进程报错静默显示为空校对成功。
- max_tokens：Gemini `maxOutputTokens` 与 Anthropic `max_tokens` 2048→8192；Claude Code 路径已是 16000，未动。「读取设置」的可配置化未做（计划允许二选一）。
- 导出未匹配：`replaceTextInDocx` 返回 `{appliedCount, unmatchedCount}`，exportCorrectedDocx 透传，DocPreview 导出成功提示 >0 时以 warning 附带「X 条建议未在文档中匹配到」。
- 验证：`npm test` 140 通过（失败 20 个均为既有真实 LLM 集成测试 401/网络，失败文件集合与基线一致）；`npm run lint` 无新增错误；`npm run build`、`npm run build:win` 绿。UI 项（开关、超时输入、提示）待人工回归。

### 风险

- review 默认关闭会改变输出质量预期（复核能过滤误报），需在 README 的「重要提醒」区说明，并保留开关路径。
- 超时默认值过短会误杀慢模型，默认 300s 起步。

### 验收标准

- 关闭 review 后同等文档校对的 token 消耗约减半（对照 TokenStatistics 页）。
- 人为断网/填错 key 校对 → 明确的失败分片提示，而非「某段没有建议」的静默空结果。
- 长章节（逐段模式）不再出现 JSON 截断导致的建议丢失（对照修改前后建议条数）。

---

## 批次 4：依赖与项目卫生清理（轻量化①）

**目标**：删除约 45MB 装而未用的依赖与垃圾 import，清理 git 仓库杂物。**每删一项前必须重新 grep 确认零引用**（含动态 import 与 electron-builder.yml 引用）。

### 任务清单

- [x] **删除会进 asar 的无用依赖**（grep `src/`、`electron.vite.config.ts`、`scripts/` 均零引用）：
  - `apache-arrow`（11MB，已移除的 @lancedb 配套）
  - ~~`@google/genai`~~（**按用户要求保留**——属 Google Gemini API 调用包，为将来迁移新版 SDK 预留；仅删除了 `ipcHandlers.ts` 未使用的 `Mode` type import，包本体不动）
  - `docx`（3.3MB）、`docxtemplater` + `pizzip`（4.3MB，成对遗留）
  - `util`（npm 包；`pdfUtils.ts:3` 改 `import { promisify } from 'node:util'` 后删除）
  - ~~`jszip`~~（**改为移入 devDependencies 而非删除**——`__tests__/` 下 7 个测试文件直接 `import JSZip`；运行时无碍，mammoth/docx-preview/docx-edit 的传递依赖自带）、`sqlite-vec` 主包（**保留 `sqlite-vec-windows-x64`**——`sqliteVec.ts` 开发态 `require.resolve('sqlite-vec-windows-x64/vec0.dll')`、生产走 extraResources，主包零引用）
- [x] **移到 devDependencies**：`@intlify/unplugin-vue-i18n`（仅构建期用）、`@types/node`、`jszip`（测试专用，见上）。
- [x] **删除已被 builder 排除但仍在 package.json 的依赖**：`bottleneck`、`p-limit`、`cli-progress`、`ora`、`vue-markdown`、`marked`、`vue-demi`、`fast-xml-parser`、`file-saver`（file-saver 已复核：grep 命中的 `saveAs` 均为 docx-edit 文档对象的 `doc.saveAs()` 方法调用，与 file-saver 无关；`vue-demi` 是 element-plus 传递依赖，删声明后由 npm 自动传递安装）。
- [x] **垃圾 import 清理（其中一个是定时炸弹）**：
  - `database.ts:7` `import { b } from 'vite/dist/node/types.d-aGj9QkWt'` —— 引用 Vite 内部类型文件当运行时依赖，**升级 Vite 即编译失败**，必须删；（已删，`b` 确认零使用）
  - `ipcHandlers.ts` `import { list } from 'changelog.config'`、`import { error } from 'console'`、`eventNames`（已删；同行的 `env` 经查在 LANCEDB_NATIVE_PATH 处使用，保留）。
- [x] **构建配置**：`electron.vite.config.ts:14-18/32-35` 删除已移除包 `@lancedb/lancedb`、`@lancedb/win32-x64-msvc` 的死 external；`electron-builder.yml` 排除列表同步收紧（方案D的 8 包排除与 markdown 渲染链整行已删——包本身不存在了，排除规则随之失效；pdfjs-dist 排除保留，pdf-parse 仍在用）。
- [x] **git 仓库卫生**（均已确认被 git 跟踪，`git rm --cached` + `.gitignore` 兜底，本地文件去留自定）：
  - `extracted_html.html`（1.88MB 调试产物）、`test.html`、`ssh_test.txt`、`projectpythonProjecthomeworkAutoDocxProofreadnul_resp.txt`、根目录 `lancedbNativePro.ts`（废弃的原生 LanceDB 方案遗物）；
  - 16 个 `_*.cjs/_*.mjs` 调试脚本、3 个 `__*.ps1` 运维脚本；
  - `.sisyphus/`（27 个会话转储）、`.claude/`（2 个文件，.gitignore 规则不追溯已跟踪文件，已补 untrack）；
  - `yarn.lock`（计划外发现：项目用 npm，陈旧 yarn 锁文件已彻底删除并 ignore）；
  - `__tests__/` 下 3 个 .docx 夹具（**经查被 formatClone/format_verify/integration/smartFormatAgent/styleCreation 5 个测试文件引用，保留**）。
- [x] **交叉验证**：`npx depcheck` 因环境离线（npm 私服 192.168.2.216:4873 超时）无法安装，改以逐项 grep（src/scripts/构建配置，含动态 import 与 builder yml 引用）+ `npm ls` 反向依赖分析 + `build:win` 打包冒烟替代，覆盖面等价。

**实施说明（2026-09-30）**：
- 生产依赖 40 项 → 21 项，`npm install` 实际移除 91 个包（含传递依赖）；asar 体积 93.2MB → 76.8MB（−17.1MB，−17.6%），NSIS 安装包 95.4MB → 93.7MB。
- 验证：`npm test` 144 通过 / 20 失败（失败集合与基线完全一致，均为既有真实 LLM 集成用例）；`npm run build` 绿；`npm run build:win` 打包成功（依赖删除的最终冒烟）；改动文件 lint 经 stash 前后对比无新增问题（既有 23 个 error 均为历史遗留的行内 require / 正则转义 / 可推断类型注解）。
- 待人工回归：`npm run dev` 全功能冒烟（校对、知识库、格式克隆、历史、导出）。

### 风险

删依赖的主要风险是隐藏引用（动态 import、字符串 require），因此每项删除前 grep + 删后 `npm run build:win` 冒烟。`@types/node` 移 devDeps 后确认主进程类型编译不受影响（tsconfig 的 types 解析）。

### 验收标准

- `npm run build:win` 成功，安装包/asar 体积对比减小（预计 asar 减约 30MB）。
- `npm run dev` 全功能冒烟（校对、知识库、格式克隆、历史、导出）。
- `git ls-files` 中不再有上述杂物。

---

## 批次 5：渲染层加载优化（轻量化②）

**目标**：首屏 JS 从单一 3.68MB 产物改为按需加载，降低冷启动时间。

### 任务清单

- [x] **路由懒加载**：`src/renderer/router/index.js:2-7` 六个页面全部静态 import → 改 `() => import('@/views/xxx.vue')`。（实施说明：六个视图各自成 chunk；另将初始不可见的 FormatClone 在 App.vue 改为 `defineAsyncComponent` 异步加载，首屏不拉取该 chunk。）
- [x] **manualChunks 拆包**：`electron.vite.config.ts` renderer 的 rollupOptions 增加 manualChunks，将 element-plus、vue 全家（vue/vue-router/pinia）、其他 vendor 拆为独立 chunk，利用缓存。（实施说明：注意 manualChunks 是 **output** 选项，放 rollupOptions 顶层会被 Rollup 以 Unknown input options 忽略且不生效；拆分后产物由单一 3.0MB index.js 变为 index 228KB + vue-vendor 519KB + vendor 534KB + element-plus 1746KB + 六个视图独立 chunk，element-plus CSS（345KB）亦独立成文件。）
- [ ] **（可选）Element Plus 按需引入**：`renderer.ts:4-6` 目前全量 `app.use(ElementPlus)` + 全量 CSS（430KB）→ 引入 `unplugin-vue-components` + `unplugin-auto-import` 按需注册。注意点：`v-loading` 等指令需手动注册样式；`el-config-provider` locale 方式不变。改动面大，若时间紧可只做前两项。（**未实施**：计划允许二选一，改动面大且涉及全量组件回归；全量引入在本地加载无网络开销，收益远小于 Web 场景，暂缓。）
- [x] **（可选）消除重复 watcher**：`useApiSettings.ts:335-349` 每个使用该 composable 的组件实例都注册 immediate watch，APISet 页同时挂 5+ 个组件 → 重复执行 `selectApi → syncApiSettingsToBackend` IPC。改为模块级单例 watch 或下沉到 store。（实施说明：composable 全部状态本就是 apiStore 的 computed，侦听只依赖 store——以 `ensureSelectionWatch()` 模块级一次性注册，APISet 页 6 个实例从 6 次 IPC 降为 1 次。）

### 验收标准

- 构建产物由单一 index-*.js 拆为多个 chunk，首屏只加载入口所需 chunk（对比 build 报告）。（✅ 见 manualChunks 实施说明）
- 冷启动到首屏可交互时间可感知下降（前后各测 3 次取均值）。（待人工 `npm run dev` 体感验证）
- 六个路由全部可达、语言切换正常、Element 组件样式无缺失（按需引入时的重点回归项）。（懒加载下样式随 chunk 拆分完整，待人工回归）

---

## 批次 6：校对交互性能优化

**目标**：消除「点一下卡一下」——忽略/编辑建议不再整篇重渲染；大文件加载与高亮重建提速。

### 任务清单

- [x] **忽略/编辑建议原位更新（核心）**：`DocPreview.vue:1356-1368` 监听 `fileStore.results`，任何变更都触发 `rerenderAndReapply()`（整篇 renderAsync + 重放全部替换 + 重建全部高亮）。撤销已有 `skipResultRerenderOnce` 豁免机制（`store.ts:63-71`），将其推广到：
  - 「忽略一条」（`Proof.vue:184-190`）：原位移除对应高亮 span 后置 skip 标记；
  - 「编辑建议文本保存」（`Proof.vue:164-181`）：原位更新替换文本后置 skip 标记。
  - **保守策略**：代码注释已指出含脚注段落的 DOM 结构差异会导致原位高亮匹配失败——先判断该 correction 是否落在脚注/复杂段落，是则仍走整篇重渲染，否则原位。
- [x] **高亮工具收敛与增量化**：`highlightCorrections` 在 `DocPreview.vue:471-500` 与 `Proof.vue:317-332` 各一份拷贝 → 收敛到 `src/renderer/utils/highlight.ts`；`correctionMatching.js:161-191` 的 `locateCorrectionsInPreview` 每次对全文 buildTextNodeMap（O(条数×全文长度)）→ 支持传入复用的 textNodeMap，apply/undo/ignore 后只重建受影响部分。
- [x] **base64 → ArrayBuffer 传输**：`ipcHandlers.ts:162-173` read-docx-file 整个 docx 转 base64 过 IPC（+33% 体积）→ 改返回 ArrayBuffer（Electron IPC structured clone 原生支持）；渲染层 `new Blob([buffer])`；删除 `DocPreview.vue:1007-1017` 与 `FormatClone.vue:657-666` 两份重复的 atob 逐字节双层循环。
- [x] **results 持久化节流**：`store.ts:88-92` 每次 results 变更全量 `JSON.stringify` 写 localStorage → debounce 500ms 或仅关键节点写。
- [ ] **（可选）校对结果列表虚拟滚动**：`Proof.vue:3-111` 全量渲染所有 el-collapse-item（含 popover），`:key="index"` 配合整体替换数组致复用失效 → 固定高度容器 + `@vueuse/core` 的 useVirtualList；建议条数 >300 时再感知明显，优先级可后置。（**未实施**：计划标注优先级可后置，建议条数 >300 才感知明显，留待后续按需做。）

**实施说明（2026-09-30）**：
- **根因比计划描述的更深**：原 `skipWatcherRerender` 本地标记模式（`标记=true → 改 results → 标记=false`）对 Vue 默认 pre-flush 异步 watcher 不生效——watcher 回调执行时标记已复位，因此此前**每次**点击应用/忽略/编辑/批量应用都会整篇重渲染 docx。本批次改为 store 级一次性豁免标记：复用 `skipResultRerenderOnce`（DocPreview 消费，跳过整篇重渲染）+ 新增 `skipResultRehighlightOnce`（Proof.vue 消费，跳过整列表重高亮），两侧 watcher 各自消费自己的标记、与触发顺序无关；原位操作失败（定位不到等）不置豁免，由整篇重渲染兜底，行为与旧兜底路径一致。
- **原位更新范围**：忽略=按 `data-correction-id` 原位解除高亮 span（不做文本定位，脚注等复杂段落天然安全，比计划设想的「脚注保守判断」更强；span 不存在时回退整篇重渲染）；编辑保存=仅改侧栏展示的建议文本、预览 DOM 本就无需改动，纯豁免；单条应用/沿用原位替换路径（`applyAndHighlightCorrections`），恢复忽略=仅重建高亮不重渲染文档；单条/批量撤销沿用 `undoCorrectionsInPreview` 原位回退。
- **高亮收敛与单趟化**：新建 `src/renderer/utils/highlight.js`（计划写的 .ts，随 correctionMatching.js 惯例用 .js），两份 `highlightCorrections` 拷贝收敛（点击去向以 `onHighlightClick` 回调参数化：预览侧→`requestSidebarFocus`，列表侧→滚动聚焦）；新增 `applyAndHighlightCorrections` 单趟完成「替换 targets + 重高亮其余 pending」——合并定位一次、按结果列表下标排序保持「重复文本按出现次序分配」约定、start 降序一趟消费各区间；单条应用从「替换定位 + 手动重高亮 + watcher 重高亮」3 次全文定位 + 整篇重渲染降为 1 次定位、0 次重渲染；`locateCorrectionsInPreview` 增加可选 `textNodeMap` 入参供复用；顺带删除已无消费方的 `replaceCorrectionInPreview`。
- **ArrayBuffer**：`read-docx-file` 直接返回 `fs.readFile` 的 Buffer（IPC 结构化克隆），DocPreview/FormatClone 改 `new Blob([fileData.buffer])`，删除两份 atob 逐字节双层循环；`electron.d.ts` 同步并顺带修正缺失的 `Promise` 返回类型。
- **持久化节流**：fileInfo store 的 persist storage 换为 `DebouncedStorage`（500ms 尾沿合并写入，`beforeunload` 冲刷兜底，`getItem` 优先返回挂起最新值）；容量超限降级逻辑（safeLocalStorage 丢大字段重试）不变。
- 验证：改动文件 eslint 无新增问题（存量 12 error 为 ipcHandlers 行内 require ×11 与 Proof 组件名单词 ×1 的历史遗留）；`npm test` 144 通过 / 20 失败（失败集合与基线完全一致，均为既有真实 LLM 集成用例）；`npm run build` 绿。
- 待人工回归：500+ 条建议文档连续点击忽略/编辑/应用/撤销流畅度；20MB 级 docx 打开预览提速；校对全流程（应用→撤销→忽略→编辑→导出）功能无异常、脚注段落高亮仍正确。

### 验收标准

- 500+ 条建议的文档中连续点击「忽略/编辑/撤销」无可感知卡顿（前后对比）。
- 20MB 级 docx 打开预览时间明显下降（ArrayBuffer 改造前后对比）。
- 校对全流程（应用→撤销→忽略→编辑→导出）功能回归无异常，脚注段落高亮仍正确。

---

## 批次 7：主题系统统一（UI 基础）

**目标**：建立明/暗两套 design tokens，终结「三套暗色机制并存、5 种背景色、14 处全局补丁」的混乱。

### 任务清单

- [x] **建立 tokens**：新建 `src/renderer/assets/tokens.css`，定义 `--bg-page/--bg-panel/--bg-elevated/--text-1/--text-2/--border-*/--brand-*/字号/间距` 两套变量（`:root` 与 `html.dark`）。（实施说明：定义 `--bg-page`(白/#121212)、`--bg-panel`(白/#1d1e1f)、`--bg-elevated`(白/#1a1a1a)、`--bg-sunken`(#f4f6f9/#141414)、`--text-1/2/3`、`--border-color/--border-strong`、`--brand/--brand-dark/--brand-bright(#8ec5ff)` 与布局变量；renderer.ts 在 element-plus CSS 之后引入，:root 覆盖生效。）
- [x] **迁移品牌变量**：`common.css:10-38` 挂在 `#app` 的品牌色变量无暗色变体，且特异性压过 Element Plus 的 `html.dark` 暗色变量（深背景上出现亮色 tint）→ 变量移到 `:root` 并补 `html.dark` 变体。（实施说明：整组 `--el-color-*` 迁入 tokens.css；暗色变体按 Element 暗色主题约定「light-N 变暗作暗底、dark-2 变亮作 hover」给出四色系。附带收益：挂到 body 层的 el-select 下拉/popper 此前取不到 #app 内的变量只能用默认蓝，现在正确继承品牌色。APISet/ProofSet 页面容器里的局部品牌变量副本一并删除。）
- [x] **统一 5 种暗色背景**：`App.vue:158-160`(#121212)、`App.vue:283-286`(#1a1a2e)、`DocPreview.vue:1419`(#1d1e1f)、`Proof.vue:602-616`(#141414/#000000)、`Dictionary.vue:511-517` 与 `APISet.vue:458-471`(#000000) → 全部改用 tokens。（实施说明：#000000/#1a1a2e 等全部消灭，页面统一 `var(--bg-page)`=#121212、面板 `var(--bg-panel)`=#1d1e1f、卡片 `var(--bg-elevated)`=#1a1a1a、下沉区 `var(--bg-sunken)`=#141414；About/history 的 #000000 页背景同步收敛。）
- [x] **修复暗色机制**：统一为 VueUse 的 `html.dark` 单一机制；删除 App.vue:2 手动 `:class="{dark:isDark}"`；修复死规则 `App.vue:174-176`（`.sidebar.dark` 的 class 实际绑在父级 `.app-layout` 上，暗色下侧栏仍是亮色 `#2c3a48`）→ 改 `html.dark .sidebar` 选择器。（实施说明：App.vue 手动绑定已删（先前的提交已把死规则修成 `.dark .sidebar`，本次再统一为 `html.dark .sidebar`）；全部组件内 `.dark ` 前缀（含 FormatClone 31 条）迁为 `html.dark `；common.css 的 `.dark` 全局规则同步改 `html.dark`。）
- [x] **收敛全局补丁**：14 个文件各自携带的非 scoped `html.dark` 块（如 `PromptDisplay.vue:115-150`、`ConcurrencySettings.vue:111-139`、`ApiSelector.vue:247-279` 内容几乎相同）→ 公共部分合入 tokens.css / 公共工具类，组件内改 scoped。（实施说明：`setting-section/section-header/section-header .el-icon/tooltip-icon(:hover)/btn-subtle` 五组逐字重复的暗色规则收敛到 common.css 一次定义，从 10 个组件（7 个 api 组件 + PromptDisplay + PromptEditor + APISet/Dictionary 部分）中删除；组件内仅保留自身特有的暗色规则（非 scoped 块，改为全局选择器）。）
- [x] **修复永久失效的样式**：`PromptEditor.vue:283-292` 在非 scoped 块使用 `:deep()`（仅 scoped 有效）→ 移入 scoped 块或改写为全局选择器。（实施说明：排查发现该问题不止 PromptEditor 一处——APISet(divider/tabs)、About(tabs/collapse)、history(表格)、Dictionary(表格)、AddApiDialog(对话框头尾)、ConcurrencySettings/RateLimitSettings(slider)、TokenStatistics(statistic) 的非 scoped `:deep()` 规则全部被浏览器整条丢弃、从未生效。统一改写为全局后代选择器，这批暗色样式首次真正生效，暗色回归时注意观感变化。）
- [x] **滚动条策略统一**：取消明色下全局隐藏滚动条（`App.vue:301-303`、`Proof.vue:666-668`、`FormatClone.vue:1164-1177`），明暗均显示统一细滚动条。（实施说明：common.css 全局定义 8px 细滚动条（亮 #c9d2dc / 暗 #555），删除 App.vue 的 `::-webkit-scrollbar{display:none}` 与死 body 规则、Proof `.results-container` 与 FormatClone `.format-list/.defaults-section` 的隐藏规则；专用小滚动区（知识库下拉、引用列表等）原有的 5-6px 定制样式保留。）
- [x] **（产品决策）暗色预览纸面模式**：`DocPreview.vue:1451-1496` 用 `!important` 把文档预览内容强改为深底浅字——校对软件应让用户看到「文档本来的样子」→ 默认恢复白底黑字（所见即所得），提供「预览适配暗色」开关，默认关。（实施说明：`fileInfoStore.previewDarkAdapt`（localStorage 持久化）；暗色主题下顶栏出现「纸面适配暗色」开关（英文 Dark Paper），全部纸面规则（正文/表格/标题/引用/代码/链接/图片）门控在 `.preview-container.paper-dark-adapt` 前缀之下；`docx-wrapper` 灰底在暗色下无条件透明化以避免开关关闭时出现灰块。**默认值按用户反馈定为 true**：明暗切换时文档自动跟随（黑底白字），与历史行为一致；开关作为退出项提供白底 WYSIWYG——计划原建议默认关，用户验证后明确要保留原有自动跟随。）
- [x] **布局解耦**：`DocPreview.vue:1971` 的 `left:52px` 与 `App.vue:163` `.sidebar{width:52px}` 魔法数字 → 抽 `--sidebar-width` 变量两处共用；`padding-right:158px` 同理。（实施说明：tokens.css 定义 `--sidebar-width:52px` 与 `--titlebar-reserve:158px`，App 侧栏与 DocPreview action-bar 共用。）

### 验收标准

- 明/暗两主题 × 7 个路由逐页目检：无背景断层、无亮色块、侧栏暗色正确、Element 组件暗色正常。（待人工回归；本次改动大量「从未生效」的暗色规则复活，重点看 APISet tabs、About tabs、history 表格、Dictionary 表格、AddApiDialog）
- 暗色下文档预览默认为白底黑字，开关切换生效。（待人工回归）
- 明色下滚动条可见。（待人工回归）

---

## 批次 8：交互体验完善

**目标**：补齐长任务反馈、统一错误提示、防误触，把「能用」变「好用」。

### 任务清单

- [ ] **知识库向量化反馈（最缺失的一块）**：`Dictionary.vue:278-297` addFile（PDF 向量化可能数分钟）无任何 loading/禁用/进度/取消 → 补全；主进程入库流程（`pdfUtils.ts:443-456` 逐 chunk 串行）增加 progress IPC 上报（顺便可改批量事务提交）。
- [ ] **格式克隆真实进度**：`FormatClone.vue:826-836` agentFlow 用 240 步×500ms 的匀速假进度条（120 秒跑到 99%，与真实进度脱节）→ 改为主进程真实阶段事件（`smartFormatAgent.ts` 分批分类处发 stage 级进度）。
- [ ] **错误提示统一**：新建轻量 notify 封装（统一 ElMessage 时长与类型），替换各处 1500/2000/2500/3000 的不一致调用；`DocPreview.vue:3` 校对失败 alert 显示在右侧预览顶部、远离左侧操作按钮 → 移到操作侧或改统一 notify。
- [ ] **防重与防抖**：`history.vue:395-416` restoreHistory、FormatClone 的文件选择可重复触发 → 加 loading/禁用；`ProxySettings.vue:60-79` 端口 el-input-number 每步进一次触发一次 IPC 同步 → 300ms 防抖。
- [ ] **语言开关位置**：`APISet.vue:35-41` 语言切换藏在 API 设置页 → 移到侧边栏底部或顶栏（全局设置归位）。
- [ ] **i18n 插值与前后端解耦**：`DocPreview.vue:1108/1277/1118` 的 `t('...') + 变量` 拼接改 i18n 插值参数；`:1217/1258` 用主进程英文错误串 `'Please select an API setting!'` 做字符串比较决定文案 → 主进程改返回错误码。
- [ ] **窗口约束**：`src/main/main.ts:43-44` 补 `minWidth:1100, minHeight:700`；`DocPreview.vue:2066-2072` 工具栏 `flex-shrink:0` 不换行窄窗口被裁剪 → 允许换行或收纳进「更多」菜单。
- [ ] **历史对比弹窗**：`history.vue:183/201/217` 三栏 `slice(0,30)` 截断且无法展开 → 支持展开完整或滚动。
- [ ] **（可选）键盘可达性**：预览高亮 span、最近文件卡片、下拉选项等 `div+@click` → 加 tabindex/role/键盘事件，或改原生 button。

### 验收标准

- 大 PDF 入库全程有进度与取消；格式克隆进度与实际阶段一致。
- 校对失败提示出现在用户注意力区域；重复点击无重复副作用。
- 窗口缩到最小尺寸工具栏不裁剪、布局不塌。

---

## 批次 9：组件工程重构（建议批次 7 后）

**目标**：拆解三大巨型组件、消灭 5 份拷贝的映射表，降低后续所有 UI 迭代成本。纯结构重构，行为不变。

### 任务清单

- [ ] **typeMap/类型色板收敛（先行热身，低风险）**：新建 `src/shared/correctionTypes.ts`（8 种错误类型的 key/中英文名/颜色 token 引用），替换 5 份拷贝：`Proof.vue:199-211`、`DocPreview.vue:502-514/517-526/616-625`、`history.vue:285-297`；同时统一类型 key 为英文（消除 `.highlight-type-错别字` 这类中文类名依赖，CSS 改用英文 type key + tokens 颜色），`.type-*/.category-*` 颜色样式从 Proof.vue 与 history.vue 两处维护收敛到一处。
- [ ] **FormatClone 抽 StylePropsEditor**：`FormatClone.vue:96-366` 四段几乎逐字相同的属性编辑模板（paragraphStyle/runStyle/defaults.paragraphStyle/defaults.runStyle）+ 成对复制的 `toggleStyleProp/stepValue/setColor` 与 `toggleDefaultsProp/stepDefaultsValue/setDefaultsColor`（`:510-558`）→ 抽 `StylePropsEditor.vue`（props: styleObj，emit update），预计 -500 行。
- [ ] **DocPreview 拆分**（2328 行，至少混 7 种职责）：
  - `WindowControls.vue`（`:277-301` 自定义窗口按钮）
  - `RecentFiles.vue`（`:111-160/223-235/304-329` 最近文件下拉+空态卡片）
  - `ProofProgress.vue`（`:75-103` + 进度/流式/取消状态机组，20+ 个相关 ref）
  - `KbSelector.vue`（知识库选择器）
  - DocPreview 保留文件选择与整体编排。
- [ ] **App.vue ↔ FormatClone 解耦**：`App.vue:121-140` 通过 `formatCloneRef.value?.cloning?.value` 等 8 个 computed 桥接 FormatClone 的 defineExpose（`FormatClone.vue:984-993`）再 provide 给 DocPreview → 新建 pinia `formatCloneStore` 承载 cloning/progress 状态，删除 ref 桥接与 provide 链。
- [ ] **公共样式类收敛**：`.section-header/.setting-section/.section-description` 在 9 个组件逐字重复 → 合入 tokens.css 全局工具类。

### 风险

拆分时保持行为不变：每拆一个组件跑一遍对应功能回归（校对全流程 / 格式克隆全流程）。事件与 props 的迁移是出错高发区，建议一个组件一个 commit。

### 验收标准

- 校对全流程（选文件→四模式→忽略/编辑/撤销→导出→历史入库）、格式克隆全流程回归通过。
- 单文件行数：DocPreview < 1000，FormatClone < 900。
- git diff 审查确认无逻辑变更（仅结构移动）。

---

## 批次 10：主进程架构与可观测性（建议批次 3 后）

**目标**：拆解 1198 行的 ipcHandlers、让日志系统真正存在、补数据库健壮性。

### 任务清单

- [ ] **ipcHandlers 按域拆分**：`ipcHandlers.ts`（1198 行约 50 个 handler）拆为 window/dialog/apiSettings/proof/knowledge/format 六个注册模块（如 `ipc/proofHandlers.ts`），原文件仅做聚合注册。
- [ ] **process-docx 三分支合并**：`ipcHandlers.ts:343-601` 中 wordError/ComprehensiveError/polish 约 90 行×3 的复制粘贴 → mode 参数 + 单条编排路径（批次 3 的 `shouldRunReview()` 已热身）。
- [ ] **logger 落地**：`logger.ts` 的 writeLog 目前除定义外零调用 → 接入关键路径（校对开始/结束/失败、导出、知识库入库），按大小轮转；替换生产敏感/噪音 console（`proof.ts:1038/1240-1248/1588` 输出校对结果全文、`lancedb.ts:433-441` 输出 RAG chunk 全文）；渲染层在 `electron.vite.config.ts` 配 esbuild `drop:['console']`（保留 error 可改为 drop `console` 仅 info/log，按需权衡）。
- [ ] **数据库健壮性**：`lancedb.ts:515-520` updateDocument 的 DELETE+INSERT 包进事务；`:98-101` 随机 i32 主键有碰撞风险 → 改自增或 uuid。
- [ ] **同步 IO 异步化**：`proof.ts:291/306` prompt 设置读写 readFileSync/writeFileSync、`logger.ts:30` appendFileSync、`ipcHandlers.ts:770` copyFileSync → fs/promises。
- [ ] **（可选）历史分页**：`database.ts:264-271` getAllHistory 全量返回（result 为完整 JSON）→ SQL 层 LIMIT/OFFSET + 总数字段，`history.vue` 已有分页 UI 可对接。
- [ ] **（可选，大工程）CPU 卸载**：全项目无 worker_threads/utilityProcess，mammoth 的 docx→HTML、docx-edit 全文档解析、pdf-parse 抽取都在主进程跑 → 先用大文档 profile 确认瓶颈，再决定是否迁移到 utilityProcess。
- [ ] **小修复顺带**：`database.ts:228-238` `deleteALLSettings` 用 SELECT 结果的 `.changes` 判断恒 undefined（逻辑错误，确认未被调用后修正或删除）。

### 验收标准

- 拆分后 handler 总数守恒（聚合注册前后各 grep 一次 `ipcMain.handle` 计数）。
- 日志文件正常生成、按大小轮转，且不含明文 key、不含校对结果全文。
- 全功能回归 + 大文档（含历史记录较多时）历史页打开速度可感知提升。

---

## 附：本方案未覆盖、可长期考虑的方向

- 多语言新增（i18n 架构已就绪，加 locale 文件即可）。
- 自动更新（electron-updater）与崩溃上报。
- 校对规则的自定义词典/白名单（目前有 Dictionary 页，可扩展校对侧联动）。
- 批量文档队列校对。
- 测试覆盖：当前 vitest 仅少量测试（`__tests__/`），可在批次 9/10 重构后为核心模块（correctionMatching、wordProcess、proof 流水线）补单测。
