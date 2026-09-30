import * as fs from 'fs'
import * as mammoth from 'mammoth'
const { loadDocx } = require('docx-edit')
import { OpenaiGen, getModelResponse, OnChunk } from './chat'
import path from 'path'
import { app } from 'electron'
import { queryDocuments } from './lancedb'
import { maskKey } from './apiKeyCrypto'
import { error } from 'console'
import { ProofreadProgressPayload, ProofreadStreamPayload, ProofreadStreamStage } from '../shared/proofreadProgress'
import {
  buildPromptFromSettings,
  clonePromptSettings,
  DEFAULT_PROMPT_SETTINGS,
  normalizePromptSettings,
  PromptSettings,
  buildBackgroundInstruction,
  AppLanguage
} from '../shared/promptSettings'
import { ModelProvider } from '../shared/modelProviders'
import * as zhCNPrompts from '../shared/prompts/zh-CN'
import * as enPrompts from '../shared/prompts/en'

// ====== 类型定义 ======
interface ProofreadingCorrection {
  original: string
  suggested: string
  reason: string
  type: 'Typo' | 'Punctuation' | 'Grammar' | 'Consistency' | string
  References?: string[]
  filtered?: boolean
  filterReason?: string
}

interface DocumentSection {
  title: string
  content: string
  level: number
  /** 表格内容独立成节的标记：正文流不拼接表格段落，降低AI率等改写流程须跳过 */
  isTable?: boolean
}

interface DocumentStructure {
  title: string
  sections: DocumentSection[]
}

interface RAGQueryResult {
  id: number
  text: string
  filename: string
  score: number
  meta: any
}

interface ApiSettings {
  apiKey: string
  apiURL: string
  modelName: string
  provider?: ModelProvider
}

/**
 * 检测 API URL 与 provider 是否匹配，输出警告。
 * 常见误配置：URL 中有 /anthropic 但 provider 是 openai_compatible。
 */
function detectProviderURLMismatch(provider: ModelProvider, apiURL: string, modelName: string): void {
  if (provider !== ModelProvider.OPENAI_COMPATIBLE) return

  const lowerURL = apiURL.toLowerCase()

  // URL 包含 /anthropic 但 provider 是 openai_compatible → 应用 Anthropic 驱动
  if (lowerURL.includes('/anthropic')) {
    console.warn(
      `⚠️ [callModelAPI] 检测到 provider 与 URL 不匹配！\n` +
        `  → 当前 provider: openai_compatible（通用 OpenAI 接口）\n` +
        `  → 但 API 地址包含 "/anthropic"（可能是 Anthropic 专用端点）\n` +
        `  → 建议: 将 provider 改为 "Anthropic (Claude)" 或 "模拟 Claude Code"\n` +
        `  → 同时将模型名称改为 Claude 系列（如 claude-sonnet-4-5-20250929）`
    )
  }

  // URL 包含 /claude 但 provider 是 openai_compatible
  if (lowerURL.includes('/claude') && !lowerURL.includes('/chat/completions')) {
    console.warn(
      `⚠️ [callModelAPI] 检测到 provider 与 URL 不匹配！\n` +
        `  → 当前 provider: openai_compatible（通用 OpenAI 接口）\n` +
        `  → 但 API 地址包含 "/claude"（可能是 Claude 专用端点）\n` +
        `  → 建议: 将 provider 改为 "Anthropic (Claude)" 或 "模拟 Claude Code"`
    )
  }
}

async function callModelAPI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  modelName: string,
  apiURL: string,
  provider?: ModelProvider,
  onChunk?: OnChunk,
  signal?: AbortSignal,
  onThinking?: OnChunk
): Promise<{ result: string; total_tokens: number }> {
  const actualProvider = provider || ModelProvider.OPENAI_COMPATIBLE

  console.log(
    `[callModelAPI] provider=${actualProvider}, model=${modelName}, apiURL=${apiURL}`
  )

  // 检测 URL 与 provider 是否匹配
  detectProviderURLMismatch(actualProvider, apiURL, modelName)

  if (actualProvider === ModelProvider.OPENAI_COMPATIBLE) {
    return await OpenaiGen(systemPrompt, userPrompt, apiKey, modelName, apiURL, onChunk, signal, onThinking)
  }

  return await getModelResponse(actualProvider, systemPrompt, userPrompt, apiKey, modelName, apiURL, onChunk, signal, onThinking)
}

// ====== 校对取消令牌 ======
/**
 * 校对任务取消支持：渲染端通过 cancelProofread IPC 触发 cancel()，
 * 各阶段在任务边界检查 cancelled 并停止派发新任务；signal 透传给
 * LLM 请求以中止在途 HTTP 连接，让取消立即生效而不是等请求超时。
 */
export class ProofreadCancelledError extends Error {
  constructor() {
    super('Proofreading task was cancelled')
    this.name = 'ProofreadCancelledError'
  }
}

export interface ProofreadCancelToken {
  readonly cancelled: boolean
  readonly signal: AbortSignal
  cancel(): void
  throwIfCancelled(): void
}

export function createProofreadCancelToken(): ProofreadCancelToken {
  const controller = new AbortController()
  const token: ProofreadCancelToken = {
    get cancelled() {
      return controller.signal.aborted
    },
    get signal() {
      return controller.signal
    },
    cancel() {
      controller.abort()
    },
    throwIfCancelled() {
      if (token.cancelled) throw new ProofreadCancelledError()
    }
  }
  return token
}

// ====== 流式输出汇聚器 ======
/**
 * 把各并行分段产生的 LLM 增量文本汇聚为流式事件并节流发送。
 *
 * 校对流程以最多 parallelSet（默认 30）个请求并行执行，若每个 token 都直发
 * IPC，事件量会达到每秒数百条。这里按 (stage, index) 键做缓冲：距上次发送
 * 超过 STREAM_FLUSH_INTERVAL_MS 或缓冲超过 STREAM_FLUSH_CHARS 才真正发送，
 * 其余情况留在缓冲里，由后续 chunk 或 segment/flush 兜底刷出。
 */
export interface ProofreadStreamSink {
  chunk(stage: ProofreadStreamStage, index: number, label: string, text: string): void
  /** 思考内容（reasoning_content）增量：与正文 chunk 分流，渲染端单独展示 */
  thinking(stage: ProofreadStreamStage, index: number, label: string, text: string): void
  segment(stage: ProofreadStreamStage, index: number, label: string, corrections: number): void
  flush(): void
}

const STREAM_FLUSH_INTERVAL_MS = 80
const STREAM_FLUSH_CHARS = 240

export function createStreamSink(onStream?: (payload: ProofreadStreamPayload) => void): ProofreadStreamSink | null {
  if (!onStream) return null

  const buffers = new Map<
    string,
    { stage: ProofreadStreamStage; index: number; label: string; text: string; thinking: boolean }
  >()
  const lastSentAt = new Map<string, number>()

  const send = (payload: ProofreadStreamPayload) => {
    try {
      onStream(payload)
    } catch (err) {
      console.warn('[StreamSink] 流式事件发送失败:', err)
    }
  }

  const flushKey = (key: string) => {
    const buf = buffers.get(key)
    if (!buf) return
    buffers.delete(key)
    lastSentAt.set(key, Date.now())
    send({
      kind: 'chunk',
      stage: buf.stage,
      index: buf.index,
      label: buf.label,
      text: buf.text,
      thinking: buf.thinking || undefined
    })
  }

  // 正文与思考增量使用同一套节流缓冲，键上以 :thinking 后缀隔离
  const makeIngest = (isThinking: boolean) => (stage: ProofreadStreamStage, index: number, label: string, text: string) => {
    if (!text) return
    const key = `${stage}:${index}${isThinking ? ':thinking' : ''}`
    const buf = buffers.get(key) || { stage, index, label: label || '', text: '', thinking: isThinking }
    if (label) buf.label = label
    buf.text += text
    buffers.set(key, buf)
    const now = Date.now()
    const last = lastSentAt.get(key) || 0
    if (buf.text.length >= STREAM_FLUSH_CHARS || now - last >= STREAM_FLUSH_INTERVAL_MS) {
      flushKey(key)
    }
  }

  const ingestChunk = makeIngest(false)
  const ingestThinking = makeIngest(true)

  return {
    chunk: ingestChunk,
    thinking: ingestThinking,
    segment(stage, index, label, corrections) {
      // 先刷出该分段尚未发送的增量文本，保证渲染端先看到文本再看到完成标记
      flushKey(`${stage}:${index}`)
      send({ kind: 'segment', stage, index, label: label || '', corrections })
    },
    flush() {
      for (const key of Array.from(buffers.keys())) {
        flushKey(key)
      }
    }
  }
}

// ====== Locale helpers ======
let currentLocale: AppLanguage = 'zh-CN'

function getPrompts() {
  return currentLocale === 'zh-CN' ? zhCNPrompts : enPrompts
}

function getLocalizedProgressMessages() {
  return getPrompts().PROGRESS_MESSAGES
}

function getLocalizedConsoleMessages() {
  return getPrompts().CONSOLE_MESSAGES
}

function getLocalizedReviewFilterReasons() {
  return getPrompts().REVIEW_FILTER_REASONS
}

function getLocalizedRagText(): string {
  return getPrompts().RAG_TEXT
}

function getLocalizedUserPromptText(): string {
  return getPrompts().USER_PROMPT_TEXT
}

function buildLocalizedDocumentContextInjection(title: string, theme: string, sectionTitle: string): string {
  return getPrompts().buildDocumentContextInjection(title, theme, sectionTitle)
}

function buildLocalizedThemeUserPrompt(title: string, sections: { title: string }[]): string {
  return getPrompts().buildThemeUserPrompt(title, sections)
}

function buildLocalizedThemeSystemPrompt(): string {
  return getPrompts().THEME_SUMMARIZATION_SYSTEM_PROMPT
}

function buildLocalizedReviewPrompt(backgroundInstruction: string): string {
  return getPrompts().buildReviewPrompt(backgroundInstruction)
}

function buildLocalizedReviewUserPrompt(
  corrections: { original: string; suggested: string; reason: string; type: string }[]
): string {
  return getPrompts().buildReviewUserPrompt(corrections)
}

// ====== 全局 Prompt ======
let currentPromptSettings: PromptSettings = clonePromptSettings(DEFAULT_PROMPT_SETTINGS)
let promptSettingsLoaded = false

function getPromptSettingsFilePath() {
  return path.join(app.getPath('userData'), 'prompt-settings.json')
}

function ensurePromptSettingsLoaded() {
  if (promptSettingsLoaded) return

  try {
    const filePath = getPromptSettingsFilePath()
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      currentPromptSettings = normalizePromptSettings(JSON.parse(fileContent))
    } else {
      currentPromptSettings = clonePromptSettings(DEFAULT_PROMPT_SETTINGS)
    }
  } catch (error) {
    console.error(getLocalizedConsoleMessages().loadPromptFailed, error)
    currentPromptSettings = clonePromptSettings(DEFAULT_PROMPT_SETTINGS)
  }

  promptSettingsLoaded = true
}

function persistPromptSettings() {
  const filePath = getPromptSettingsFilePath()
  fs.writeFileSync(filePath, JSON.stringify(currentPromptSettings, null, 2), 'utf-8')
}

function getCurrentPromptSettings(): PromptSettings {
  ensurePromptSettingsLoaded()
  return clonePromptSettings(currentPromptSettings)
}

function getCurrentEffectivePrompt(): string {
  ensurePromptSettingsLoaded()
  return buildPromptFromSettings(currentPromptSettings, currentLocale)
}

// ====== 并发控制工具函数 ======
/**
 * 一个简单的延时函数
 * @param ms 延时的毫秒数
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 带有并发数和速率限制的异步任务控制器
 *
 * @param items 要处理的元素数组
 * @param maxConcurrency 最大并发数
 * @param processor 处理单个元素的异步函数
 * @param options 可选配置项
 * @param options.requestsPerMinute 每分钟最大请求数，用于速率限制
 * @param options.onItemFailed 单个任务失败回调（index 为 items 下标），用于收集失败分片
 * @returns 返回一个包含所有成功处理结果的 Promise
 */
export async function runWithLimits<T, R>(
  items: T[],
  maxConcurrency: number,
  processor: (item: T, index: number) => Promise<R>,
  options?: {
    requestsPerMinute?: number
    onItemCompleted?: (completed: number, total: number) => void
    onItemFailed?: (index: number, error: unknown) => void
    shouldCancel?: () => boolean
  }
): Promise<R[]> {
  const results: (R | undefined)[] = new Array(items.length)
  const executing: Promise<void>[] = []
  let completedCount = 0

  // --- 新增逻辑: 速率限制初始化 ---
  const { requestsPerMinute, onItemCompleted, onItemFailed, shouldCancel } = options || {}
  const hasRateLimit = typeof requestsPerMinute === 'number' && requestsPerMinute > 0

  // 计算两次请求之间的最小时间间隔（毫秒）
  const minInterval = hasRateLimit ? (60 * 1000) / requestsPerMinute! : 0
  let lastRequestTime = 0 // 记录上一个任务开始的时间戳
  // --- 新增逻辑结束 ---

  for (let i = 0; i < items.length; i++) {
    // 任务已取消：不再派发新任务，等待在途任务结束（signal 会中止它们的请求）
    if (shouldCancel?.()) break

    // --- 核心逻辑整合 ---
    // 1. 首先，等待并发池出现空位（如果已满）
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing)
    }

    // 2. 其次，等待满足速率限制的时间间隔
    if (hasRateLimit) {
      const now = Date.now()
      const elapsedTime = now - lastRequestTime
      if (elapsedTime < minInterval) {
        const delayTime = minInterval - elapsedTime
        await delay(delayTime)
      }
      // 更新"上一次请求时间"为当前（补足延迟后）的时间
      lastRequestTime = Date.now()
    }
    // --- 整合结束 ---

    const execute = async () => {
      try {
        results[i] = await processor(items[i], i)
        completedCount += 1
        onItemCompleted?.(completedCount, items.length)
      } catch (error) {
        console.error(`并发任务 ${i} 失败:`, error)
        results[i] = undefined
        onItemFailed?.(i, error)
      }
    }

    const promise = execute().then(() => {
      const index = executing.indexOf(promise)
      if (index !== -1) executing.splice(index, 1)
    })
    executing.push(promise)
  }

  await Promise.all(executing)
  return results.filter((r): r is R => r !== undefined)
}

// ====== 导出 Prompt 管理 ======
export async function getDefaultPrompt(): Promise<string> {
  return buildPromptFromSettings(DEFAULT_PROMPT_SETTINGS, currentLocale)
}

export async function setNewPrompt(newPrompt: string): Promise<boolean> {
  const nextSettings = normalizePromptSettings({
    ...getCurrentPromptSettings(),
    customPromptEnabled: true,
    customPrompt: newPrompt
  })
  currentPromptSettings = nextSettings
  persistPromptSettings()
  return true
}

export async function getPromptSettings(): Promise<PromptSettings> {
  return getCurrentPromptSettings()
}

export async function setPromptSettings(settings: PromptSettings): Promise<boolean> {
  currentPromptSettings = normalizePromptSettings(settings)
  persistPromptSettings()
  return true
}

export async function getEffectivePrompt(): Promise<string> {
  return getCurrentEffectivePrompt()
}

export async function resetPromptSettings(): Promise<boolean> {
  currentPromptSettings = clonePromptSettings(DEFAULT_PROMPT_SETTINGS)
  persistPromptSettings()
  return true
}

// ====== 脚注占位符转换 ======
// docx-edit 的 getText() 会将脚注引用输出为 [[FOOTNOTE_REF:id]]
// 发给 LLM 前替换为 [脚注id]，LLM 返回后还原回 [[FOOTNOTE_REF:id]]

// LLM 返回的标记常与指令有细微出入（全角括号 ［公式x］、标记与内容间的空格），
// 还原正则统一容忍这些变体，否则还原失败会把字面 "[公式 x]" 留在 original 中，
// 前端匹配与导出回写都会静默失败
const FOOTNOTE_HUMAN_RE = /[［[]\s*脚注\s*(\d+)\s*[\]］]/g
const MATH_HUMAN_RE = /[［[]\s*公式\s*([\s\S]*?)\s*[\]］]/g

/**
 * 零宽字符集：U+200B (零宽空格)、U+200C (零宽非连接符)、
 * U+200D (零宽连接符)、U+FEFF (BOM/零宽不换行空格)。
 *
 * docx-edit 在抽取段落文本时，常把公式 OMML 边界、脚注引用边界上的
 * 零宽字符带进文本。这些字符肉眼不可见，但会带来两类问题：
 * 1. 紧贴 [[MATH:...]] / [[FOOTNOTE_REF:...]] 占位符时，会被切分逻辑
 *    误归入相邻的字面片段，最终烧进前端匹配正则，导致匹配静默失败
 *    （docx-preview 渲染 DOM 时不保留这些零宽字符）。
 * 2. 写入 docx 时若混入 suggested，可能产生肉眼不可见的脏字符。
 *
 * 因此在占位符转换、校正结果序列化等出口统一剥离。
 */
const ZERO_WIDTH_CHARS_RE = /[\u200B-\u200D\uFEFF]/g

/** 剥离所有零宽字符 */
function stripZeroWidth(text: string): string {
  return (text || '').replace(ZERO_WIDTH_CHARS_RE, '')
}

/**
 * 将 [[FOOTNOTE_REF:1]] 替换为 [脚注1]，发给 LLM 前调用。
 * 同时吃掉占位符两侧的零宽字符，避免它们污染相邻文本片段。
 */
function footnotePlaceholderToHuman(text: string): string {
  return text.replace(/[\u200B-\u200D\uFEFF]*\[\[FOOTNOTE_REF:(\d+)\]\][\u200B-\u200D\uFEFF]*/g, '[脚注$1]')
}

/** 将 [脚注1] 还原为 [[FOOTNOTE_REF:1]]，解析 LLM 返回结果后调用 */
function footnoteHumanToPlaceholder(text: string): string {
  return text.replace(FOOTNOTE_HUMAN_RE, '[[FOOTNOTE_REF:$1]]')
}

/**
 * 将 [[MATH:C]] 替换为 [公式C]，发给 LLM 前调用。
 * 同时吃掉占位符两侧的零宽字符（OMML 边界常带 U+200B）。
 *
 * 注意：必须输出带"公式"前缀的 [公式C]，而非裸 [C]。
 * 原因有二：
 * 1. 与 MATH_HUMAN_RE = /\[公式(.*?)\]/g 保持一致，否则 mathHumanToPlaceholder
 *    无法还原（这正是此前存在的死代码 bug）。
 * 2. 公式内容常是短标识（如 C、AS、Xs），裸 [C] 极易与 LLM 输出中
 *    普通的方括号文本冲突，加"公式"前缀可避免误还原。
 */
function mathPlaceholderToHuman(text: string): string {
  // [\s\S]*?：公式文本是全部 m:t 的直接拼接，可能含换行
  return text.replace(/[\u200B-\u200D\uFEFF]*\[\[MATH:([\s\S]*?)\]\][\u200B-\u200D\uFEFF]*/g, '[公式$1]')
}

/** 将 [公式C] 还原为 [[MATH:C]]，解析 LLM 返回结果后调用 */
function mathHumanToPlaceholder(text: string): string {
  return text.replace(MATH_HUMAN_RE, '[[MATH:$1]]')
}

/** 发给 LLM 前统一转换所有占位符为人可读形式 */
function placeholderToHuman(text: string): string {
  return mathPlaceholderToHuman(footnotePlaceholderToHuman(text))
}

/**
 * 从 LLM 返回结果中还原所有占位符。
 * 同时剥离零宽字符：LLM 可能在 [脚注x]/[公式x] 标记旁残留 U+200B 等，
 * 还原后会紧贴 [[FOOTNOTE_REF:x]]/[[MATH:...]]，污染前端匹配。
 */
function humanToPlaceholder(text: string): string {
  return stripZeroWidth(footnoteHumanToPlaceholder(mathHumanToPlaceholder(text)))
}

// ====== 工具函数 ======
function splitSentences(text: string): string[] {
  const sentenceRegex = /[^。！？…!?]+[。！？…!?]+|[^。！？…!?]+$/g
  const sentences = text.match(sentenceRegex) || []
  return sentences.map(s => s.trim()).filter(s => s.length > 0)
}

function isLikelyTitle(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.length >= 100) return false

  if (trimmed.endsWith('章') || trimmed.endsWith('节') || trimmed.endsWith('篇')) return true
  if (/^第[一二三四五六七八九十\d]+[章节篇]/.test(trimmed)) return true
  if (/^(摘要|Abstract|引言|绪论|结论|致谢|附录|目录|前言|导言|Background|Introduction|Conclusion|Acknowledgment|References|Appendix)$/i.test(trimmed)) return true
  // Numbered patterns: only treat as title if short (real headings are concise)
  const chineseChars = (trimmed.match(/[一-鿿]/g) || []).length
  const maxLen = chineseChars > 0 ? 30 : 100
  if (/^[1-9][.、]\s*\S/.test(trimmed) && trimmed.length <= maxLen) return true
  if (/^[一二三四五六七八九十][.、]\s*\S/.test(trimmed) && trimmed.length <= 30) return true

  return false
}

function getHeadingLevel(line: string): number {
  const trimmed = line.trim()
  if (/^第[一二三四五六七八九十\d]+章/.test(trimmed)) return 1
  if (/^第[一二三四五六七八九十\d]+节/.test(trimmed)) return 2
  if (/^[1-9]\.\s*\S/.test(trimmed)) return 2
  if (/^[1-9][.1-9]*\s*\S/.test(trimmed)) return 3
  return 2
}

// ====== 文档格式信息提取 ======
function extractStyledHeadings(html: string): Map<string, number> {
  const headings = new Map<string, number>()
  const pattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const level = parseInt(match[1])
    const text = match[2].replace(/<[^>]+>/g, '').trim()
    if (text) {
      headings.set(text, level)
    }
  }
  return headings
}

/**
 * 判断一个 paragraph controller 是否位于表格单元格内。
 * 通过检查 vnode 的 parent 链中是否存在 table-cell 类型节点。
 */
function isParagraphInTableCell(para: any): boolean {
  let node = para.vnode?.parent
  while (node) {
    if (node.type === 'table-cell') return true
    node = node.parent
  }
  return false
}

// ====== 表格内容收集 ======

/**
 * 判断文本是否含实际文字（中文或字母）。
 * 表格中的纯数字/符号单元格（如 "3.2"、"85%"、"-"）无校对价值，
 * 整行过滤可避免把它们送进 LLM 浪费请求。
 */
function hasReadableText(text: string): boolean {
  return /[\u4e00-\u9fffA-Za-z]/.test(text)
}

/**
 * 判断 table controller 是否嵌套在另一个表格内。
 * body.getTables() 返回全部后代表格（含嵌套表），而外层表格的
 * cell.getParagraphs() 已经包含嵌套表内容，为避免重复收集只处理顶层表格。
 */
function isNestedTable(table: any): boolean {
  let node = table.vnode?.parent
  while (node) {
    if (node.type === 'table') return true
    node = node.parent
  }
  return false
}

/**
 * 将文档中的表格收集为独立 section，与正文章节并列送 LLM 校对。
 *
 * 此前 extractDocxEditHeadings 直接跳过表格单元格段落（避免碎行打乱
 * 正文 section 拼接与匹配），副作用是表格文字完全不被校对。现在改为：
 * 正文流照旧不含表格段落，表格按"每行一行、单元格用 \t 连接"整理成
 * 独立 section。校对产生的 original 因此始终落在单个单元格段落内，
 * 前端预览高亮（TreeWalker 遍历全部文本节点）和导出回写
 * （wordProcess.collectAllParagraphs 递归表格单元格）均可直接匹配。
 *
 * 纯数字/符号行（无中文和字母）不收集。
 */
function collectTableSections(body: any): DocumentSection[] {
  let tables: any[] = []
  try {
    tables = body.getTables() || []
  } catch {
    return []
  }

  const sections: DocumentSection[] = []
  let tableIndex = 0

  for (const table of tables) {
    if (isNestedTable(table)) continue
    tableIndex += 1

    let rows: any[] = []
    try {
      rows = table.getRows() || []
    } catch {
      rows = []
    }

    const lines: string[] = []
    for (const row of rows) {
      let cells: any[] = []
      try {
        cells = row.getCells() || []
      } catch {
        cells = []
      }
      const cellTexts = cells.map(cell => {
        let paras: any[] = []
        try {
          paras = cell.getParagraphs() || []
        } catch {
          paras = []
        }
        return paras
          .map(p => stripZeroWidth(typeof p.getText === 'function' ? p.getText() : ''))
          .filter(t => t.trim().length > 0)
          .join(' ')
      })
      const line = cellTexts.join('\t')
      if (hasReadableText(line)) {
        lines.push(line)
      }
    }

    if (lines.length > 0) {
      sections.push({
        title: `表格 ${tableIndex}`,
        content: lines.join('\n'),
        level: 2,
        isTable: true
      })
    }
  }

  return sections
}

// ====== 目录（Table of Contents）检测 ======
//
// Word 的目录有两种常见存储形态，降低AI率流程必须把它们整体跳过，
// 否则目录条目（如 "摘  要\tI"、"第 1 章\t绪论\t1"）会被当作正文送进 LLM 改写，
// 破坏目录的页码引用与文字对齐。
//
// 形态一：标准目录内容控件（SDT）。Word 自动生成的目录会被一个
//   <w:sdt> 容器包裹，其 <w:sdtPr> 里的 docPartGallery 取值为 "Table of Contents"。
//   docx-edit 解析时会把它写入 sdt 节点 props.docPartGallery，并暴露
//   StructuredDocumentTagController.isTableOfContents()。
//
// 形态二：域代码目录。少数文档（尤其是手动插入或第三方工具生成）不使用 SDT，
//   而是直接用 fldChar begin/separate/end 包裹一段 instrText，指令以 "TOC" 开头。
//   此处用 paragraph.getFields() 兜底识别。

/** 判断一个 sdt vnode 是否为目录容器（docPartGallery === "Table of Contents"）。 */
function isTableOfContentsSdtNode(node: any): boolean {
  return Boolean(node && node.type === 'sdt' && node.props?.docPartGallery === 'Table of Contents')
}

/**
 * 判断一个 paragraph controller 是否位于目录内容控件（SDT）内。
 * 沿用 parent 链遍历风格，与 isParagraphInTableCell 保持一致。
 */
function isParagraphInTableOfContentsSDT(para: any): boolean {
  let node = para.vnode?.parent
  while (node) {
    if (isTableOfContentsSdtNode(node)) return true
    node = node.parent
  }
  return false
}

/**
 * 判断段落是否包含 TOC 域代码（fldChar 包裹的 instrText 以 "TOC" 开头）。
 * 作为未使用 SDT 包裹的目录的兜底识别。
 */
function paragraphHasTOCField(para: any): boolean {
  if (typeof para.getFields !== 'function') return false
  let fields: any[] = []
  try {
    fields = para.getFields() || []
  } catch {
    return false
  }
  return fields.some(field => /^\s*TOC\b/i.test(field?.instruction || ''))
}

/**
 * 综合判断段落是否属于目录（SDT 目录 或 域代码目录，任一命中即视为目录段落）。
 * 降低AI率流程据此跳过该段落，不送往 LLM 改写。
 */
function isTableOfContentsParagraph(para: any): boolean {
  return isParagraphInTableOfContentsSDT(para) || paragraphHasTOCField(para)
}

/**
 * 收集文档中所有目录段落的文本，供降低AI率流程做整行精确跳过。
 *
 * 用整行文本集合（而非在 section.content 拆行后再判断）的原因：
 * parseWordDocument → extractDocxEditHeadings 会把无 heading level 的目录段落
 * 并入相邻 section 的 .content，丢失 SDT 归属信息。因此先在 docx-edit 的
 * body 段落层面把目录文本抓出来，再在后续按行过滤时做精确匹配。
 *
 * 文本统一用 stripZeroWidth 处理，与后续 original 比对口径一致
 * （避免 OMML 边界残留的 U+200B 导致匹配失败，与 test12 修复同源）。
 */
export async function collectTableOfContentsTexts(documentPath: string): Promise<Set<string>> {
  const tocTexts = new Set<string>()
  let doc: any
  try {
    doc = await loadDocx(documentPath)
  } catch {
    return tocTexts
  }
  const body = doc?.getBody?.()
  if (!body) return tocTexts

  let paragraphs: any[] = []
  try {
    paragraphs = body.getParagraphs() || []
  } catch {
    return tocTexts
  }

  for (const para of paragraphs) {
    if (!isTableOfContentsParagraph(para)) continue
    const text = stripZeroWidth((typeof para.getText === 'function' ? para.getText() : '') || '')
    if (text.trim()) tocTexts.add(text)
  }
  return tocTexts
}

// ====== 自动编号前缀清理 ======

/**
 * 清除段落文本开头的自动编号前缀。
 * 某些 Word 文档（尤其是 WPS 创建的模板）会将标题编号以纯文本形式存储在段落 run 中，
 * 导致 getText() 返回 "IIIIabstract" 或 "IIIIWith the advancement..." 等带编号的文本。
 */
function stripAutoNumbering(text: string): string {
  if (!text || text.length < 3) return text

  // 中文章节编号: 第一章, 第1节, 第十二章 etc.
  let r = text.replace(/^第[一二三四五六七八九十百千\d]+[章节篇部]\s*/, '')
  if (r !== text && r.length > 0) return r

  // 罗马数字 (2+) 后跟分隔符: "III. ", "IV\t", "IIII "
  r = text.replace(/^[IVXLCDM]{2,}[.\s\t、):，]+\s*/, '')
  if (r !== text && r.length > 0) return r

  // 罗马数字 (2+) 直接紧邻文本: "IIIIWith" → "With"
  r = text.replace(/^[IVXLCDM]{2,}(?=[A-Z][a-z]|[一-鿿])/, '')
  if (r !== text && r.length > 0) return r

  // 阿拉伯数字多级编号: "1.1 ", "2.1.3\t"
  r = text.replace(/^\d+(\.\d+)+[.\s\t、):，]+\s*/, '')
  if (r !== text && r.length > 0) return r

  return text
}

// ====== docx-edit 提取标题 ======
// 导出供集成测试使用（表格章节收集逻辑的验证入口）
export async function extractDocxEditHeadings(documentPath: string): Promise<DocumentStructure | null> {
  try {
    const doc = await loadDocx(documentPath)
    const body = doc.getBody()
    if (!body) return null

    const paragraphs = body.getParagraphs()
    const sections: DocumentSection[] = []
    let currentSection: DocumentSection | null = null
    let sectionContent: string[] = []
    let documentTitle = ''
    let foundHeadings = false

    for (const para of paragraphs) {
      if (isParagraphInTableCell(para)) continue

      const rawText = para.getText().trim()
      const text = stripAutoNumbering(rawText)
      const headingLevel = para.getHeadingLevel()

      if (headingLevel !== null && headingLevel !== undefined && text.length > 0) {
        foundHeadings = true
        if (currentSection && sectionContent.length > 0) {
          currentSection.content = sectionContent.join('\n')
          sections.push(currentSection)
        }

        if (!documentTitle) documentTitle = text

        currentSection = {
          title: text,
          content: '',
          level: headingLevel
        }
        sectionContent = []
      } else if (currentSection && text.length > 0) {
        sectionContent.push(text)
      }
    }

    if (currentSection && sectionContent.length > 0) {
      currentSection.content = sectionContent.join('\n')
      sections.push(currentSection)
    }

    if (!foundHeadings) return null

    // 表格文字独立成节（正文流仍跳过表格段落，见 isParagraphInTableCell），
    // 使表格内容也进入校对，同时不打乱正文章节的段落拼接
    const tableSections = collectTableSections(body)
    if (tableSections.length > 0) {
      sections.push(...tableSections)
      console.log(`[大纲提取] 额外收集 ${tableSections.length} 个表格章节参与校对`)
    }

    return { title: documentTitle, sections }
  } catch {
    return null
  }
}

// ====== 文档解析 ======
function splitSectionIntoParagraphs(section: DocumentSection): DocumentSection[] {
  const paragraphs = section.content
    .split('\n')
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0)

  return paragraphs.map((paragraph, index) => ({
    title: paragraphs.length > 1 ? `${section.title} - Paragraph ${index + 1} (Section ${index + 1})` : section.title,
    content: paragraph,
    level: section.level
  }))
}

function getSectionsForProofreading(sections: DocumentSection[]): DocumentSection[] {
  const nonEmptySections = sections.filter(section => section.content.trim().length > 0)
  if (nonEmptySections.length !== 1) {
    return nonEmptySections
  }

  const paragraphSections = splitSectionIntoParagraphs(nonEmptySections[0])
  return paragraphSections.length > 1 ? paragraphSections : nonEmptySections
}

async function parseWordDocument(documentPath: string): Promise<DocumentStructure> {
  try {
    const docxEditResult = await extractDocxEditHeadings(documentPath)
    if (docxEditResult && docxEditResult.sections.length > 0) {
      console.log(`[大纲提取] 使用 docx-edit 方案，提取到 ${docxEditResult.sections.length} 个章节，文档标题: "${docxEditResult.title}"`)
      return docxEditResult
    }
    console.log('[大纲提取] docx-edit 未提取到标题，回退到 mammoth + 启发式方案')

    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ path: documentPath }),
      mammoth.extractRawText({ path: documentPath })
    ])
    const styledHeadings = extractStyledHeadings(htmlResult.value)
    const text = textResult.value
    const lines = text.split('\n').filter(line => line.trim().length > 0)

    const sections: DocumentSection[] = []
    let currentSection: DocumentSection | null = null
    let sectionContent: string[] = []
    let documentTitle = ''

    for (const line of lines) {
      const trimmed = line.trim()
      const styledLevel = styledHeadings.get(trimmed)
      const isHeading = styledLevel !== undefined || isLikelyTitle(trimmed)

      if (isHeading) {
        if (currentSection && sectionContent.length > 0) {
          currentSection.content = sectionContent.join('\n')
          sections.push(currentSection)
        }

        if (!documentTitle) documentTitle = trimmed

        currentSection = {
          title: trimmed,
          content: '',
          level: styledLevel !== undefined ? styledLevel : getHeadingLevel(trimmed)
        }
        sectionContent = []
      } else if (currentSection) {
        sectionContent.push(line)
      }
    }

    if (currentSection && sectionContent.length > 0) {
      currentSection.content = sectionContent.join('\n')
      sections.push(currentSection)
    }

    // 兜底：如果没有任何标题被检测到，按自然段划分文档
    if (sections.length === 0 && lines.length > 0) {
      documentTitle = lines[0].trim().slice(0, 50)
      for (let i = 0; i < lines.length; i++) {
        const content = lines[i].trim()
        if (content.length === 0) continue
        sections.push({
          title: `${documentTitle} - 段落 ${i + 1}`,
          content,
          level: 1
        })
      }
    }

    return {
      title: documentTitle,
      sections
    }
  } catch (error) {
    throw new Error(`${getLocalizedConsoleMessages().parseWordFailed}${error.message}`)
  }
}

// ====== 文档主题总结 ======
async function summarizeDocumentTheme(
  docStructure: DocumentStructure,
  apiKey: string,
  modelName: string,
  apiURL: string,
  provider?: ModelProvider,
  onChunk?: OnChunk,
  cancelToken?: ProofreadCancelToken | null,
  onThinking?: OnChunk
): Promise<{
  result: string
  total_tokens: number
}> {
  const systemPrompt = buildLocalizedThemeSystemPrompt()
  const userPrompt = buildLocalizedThemeUserPrompt(docStructure.title, docStructure.sections)

  try {
    return await callModelAPI(systemPrompt, userPrompt, apiKey, modelName, apiURL, provider, onChunk, cancelToken?.signal, onThinking)
  } catch (error) {
    // 取消不属于"主题总结失败"：向上传播，让整个校对流程终止
    if (cancelToken?.cancelled) throw new ProofreadCancelledError()
    console.error(getLocalizedConsoleMessages().summarizeThemeError, error)
    return {
      result: 'error',
      total_tokens: null
    }
  }
}

// ====== 校对结果解析 ======
function parseCorrections(result: string, ragChunks?: string[]): ProofreadingCorrection[] {
  // 首先尝试直接解析
  try {
    const parsed = JSON.parse(result)
    if (Array.isArray(parsed)) {
      return parsed.map(item => {
        // 还原脚注占位符：[脚注x] → [[FOOTNOTE_REF:x]]
        const restored = {
          ...item,
          suggested: humanToPlaceholder(item.suggested || ''),
          original: humanToPlaceholder(item.original || '')
        }
        if (ragChunks) {
          return { ...restored, References: [...ragChunks] }
        }
        return restored
      })
    } else {
      console.warn('cannot analyze the proofreading data from LLM')
      return []
    }
  } catch (error) {
    console.warn('直接解析JSON失败，尝试清理和提取:', error)
    return extractCorrectionsFromText(result, ragChunks)
  }
}

function extractCorrectionsFromText(text: string, ragChunks?: string[]): ProofreadingCorrection[] {
  try {
    // 1. 清理可能的代码块标记
    let cleanedText = text.trim()

    // 移除代码块标记（```json, ```, 或者其他语言标记）
    cleanedText = cleanedText.replace(/^```[\w]*\n?/g, '')
    cleanedText = cleanedText.replace(/\n?```$/g, '')

    // 移除可能的 "json" 标记
    cleanedText = cleanedText.replace(/^json\s*/i, '')

    // 移除可能的解释性文字（如 "以下是JSON:", "返回结果:" 等）
    cleanedText = cleanedText.replace(/^.*?以下.*?[::：]\s*/, '')
    cleanedText = cleanedText.replace(/^.*?返回.*?[::：]\s*/, '')

    // 提取JSON数组（寻找第一个 [ 和最后一个 ]）
    const firstBracket = cleanedText.indexOf('[')
    const lastBracket = cleanedText.lastIndexOf(']')

    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const jsonString = cleanedText.substring(firstBracket, lastBracket + 1)
      console.log('提取到的JSON字符串:', jsonString)

      const parsed = JSON.parse(jsonString)
      if (Array.isArray(parsed)) {
        const corrections = parsed
          .map(item => {
            // 验证每个字段的存在性
            if (item.original && item.suggested && item.reason) {
              // 还原占位符：[脚注x] → [[FOOTNOTE_REF:x]]，[公式...] → [[MATH:...]]
              const restored = {
                ...item,
                suggested: humanToPlaceholder(item.suggested),
                original: humanToPlaceholder(item.original)
              }
              if (ragChunks) {
                return { ...restored, References: [...ragChunks] }
              }
              return restored
            }
            return null
          })
          .filter((item): item is ProofreadingCorrection => item !== null)

        if (corrections.length > 0) {
          console.log(`成功解析出 ${corrections.length} 个校对结果`)
          return corrections
        }
      }
    }

    // 2. 尝试解析单个JSON对象
    try {
      const singleObject = JSON.parse(cleanedText)
      if (singleObject && typeof singleObject === 'object' && !Array.isArray(singleObject)) {
        if (singleObject.original && singleObject.suggested && singleObject.reason) {
          console.log('解析到单个校对结果')
          // 还原占位符
          const restored = {
            ...singleObject,
            suggested: humanToPlaceholder(singleObject.suggested),
            original: humanToPlaceholder(singleObject.original)
          }
          return ragChunks ? [{ ...restored, References: [...ragChunks] }] : [restored]
        }
      }
    } catch (e) {
      // 单对象解析失败，继续
    }

    // 3. 如果以上都失败，尝试从文本中提取信息
    console.warn('JSON解析完全失败，尝试从文本中手动提取')
    return parseCorrectionsFromPlainText(text, ragChunks)
  } catch (error) {
    console.error('所有解析方法都失败:', error)
    console.error('原始文本:', text)
    return []
  }
}

function parseCorrectionsFromPlainText(text: string, ragChunks?: string[]): ProofreadingCorrection[] {
  const corrections: ProofreadingCorrection[] = []
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  console.log('尝试从纯文本中提取校对结果，共', lines.length, '行')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 查找包含 "original" 的行
    if (/original|原文|原内容/.test(line)) {
      const correction: Partial<ProofreadingCorrection> = {}

      // 提取 original 值
      const originalMatch = line.match(/["'""“”]([^""“”]+)["'""“”]/)
      if (originalMatch) {
        correction.original = originalMatch[1].trim()
      }

      // 在后续行中查找 suggested
      if (i + 1 < lines.length) {
        const suggestedLine = lines[i + 1]
        const suggestedMatch = suggestedLine.match(/["'""“”]([^""“”]+)["'""“”]/)
        if (suggestedMatch) {
          correction.suggested = suggestedMatch[1].trim()
        }
      }

      // 在后续行中查找 reason
      if (i + 2 < lines.length) {
        const reasonLine = lines[i + 2]
        const reasonMatch = reasonLine.match(/["'""“”]([^""“”]+)["'""“”]/)
        if (reasonMatch) {
          correction.reason = reasonMatch[1].trim()
        }

        // 查找 type
        const typeMatch = reasonLine.match(/"type":\s*["']([^"']+)["']/)
        if (typeMatch) {
          correction.type = typeMatch[1]
        }
      }

      // 如果找到了所有必需字段，添加到结果中
      if (correction.original && correction.suggested && correction.reason) {
        // 还原脚注占位符
        correction.original = humanToPlaceholder(correction.original)
        correction.suggested = humanToPlaceholder(correction.suggested)
        if (ragChunks) {
          correction.References = [...ragChunks]
        }
        corrections.push(correction as ProofreadingCorrection)
      }
    }
  }

  console.log('从纯文本中提取到', corrections.length, '个校对结果')
  return corrections
}

// ====== RAG 查询 ======
interface QueryDocChunkOptions {
  maxSelectNum?: number
  enableDeduplication?: boolean
}

const DEFAULT_MAX_SELECT_NUM = 20

const queryDocChunk = async (
  repositoryNameList: string[],
  apiKey: string,
  apiURL: string,
  modelName: string,
  fileName: string,
  content: string,
  filter: string,
  selectNum: number,
  options: QueryDocChunkOptions = {}
): Promise<string[]> => {
  const { maxSelectNum = DEFAULT_MAX_SELECT_NUM, enableDeduplication = true } = options

  if (!Array.isArray(repositoryNameList) || repositoryNameList.length === 0) {
    console.warn('queryDocChunk: repositoryNameList is empty or invalid')
    return []
  }

  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid or missing apiKey')
  }

  if (!apiURL || typeof apiURL !== 'string') {
    throw new Error('Invalid or missing apiURL')
  }

  if (!modelName || typeof modelName !== 'string') {
    throw new Error('Invalid or missing modelName')
  }

  if (!content || typeof content !== 'string' || content.trim() === '') {
    console.warn('queryDocChunk: empty or invalid content, returning empty result')
    return []
  }

  if (!Number.isInteger(selectNum) || selectNum <= 0) {
    console.warn(`queryDocChunk: invalid selectNum ${selectNum}, using default 1`)
    selectNum = 1
  }

  const effectiveSelectNum = Math.min(selectNum, maxSelectNum)
  const perRepoLimit = Math.min(effectiveSelectNum, 10)

  const chunkList: RAGQueryResult[] = []

  const queries = repositoryNameList.map(repoName =>
    queryDocuments(repoName, content.trim(), modelName, apiKey, apiURL, perRepoLimit, filter).catch(
      (err): RAGQueryResult[] => {
        console.error(`queryDocChunk: failed to query repository "${repoName}"`, err)
        return []
      }
    )
  )

  const results = await Promise.all(queries)

  for (const result of results) {
    if (Array.isArray(result)) {
      chunkList.push(...result)
    }
  }

  let uniqueChunks = chunkList
  if (enableDeduplication && chunkList.length > 0) {
    const seen = new Set<string>()
    uniqueChunks = chunkList.filter(item => {
      if (typeof item.text !== 'string') return false
      if (seen.has(item.text)) return false
      seen.add(item.text)
      return true
    })
  }
  console.info('-----------------------------------RAG Query----------------------------')
  console.info('the unique results of query:', uniqueChunks)
  console.log('the proofreading content:', content)

  const topChunks = uniqueChunks
    .filter(item => typeof item.score === 'number' && typeof item.text === 'string')
    .sort((a, b) => b.score - a.score)
    .slice(0, effectiveSelectNum)
  console.info('the top relative result of query:', topChunks)

  return topChunks.map(item => item.text)
}

// ====== 通用RAG校对函数 ======
async function proofreadTextWithRAG(
  text: string,
  systemContext: string,
  apiKey: string,
  modelName: string,
  apiURL: string,
  repositoryNameList?: string[],
  fileName?: string,
  embeddingConfig?: ApiSettings,
  provider?: ModelProvider,
  onChunk?: OnChunk,
  cancelToken?: ProofreadCancelToken | null,
  onThinking?: OnChunk
): Promise<{ result: ProofreadingCorrection[]; use_tokens: number }> {
  try {
    let systemPrompt = systemContext

    // 将 [[FOOTNOTE_REF:x]] 替换为 [脚注x]，让 LLM 更容易理解和保留
    const textForLLM = placeholderToHuman(text)

    // 如果没有提供 repositoryNameList 或者为空数组，使用正常校对
    if (!repositoryNameList || repositoryNameList.length === 0) {
      console.log('use normal proof without rag:')
      console.log('proof content:', textForLLM)
      const { result, total_tokens } = await callModelAPI(
        systemPrompt,
        `${getLocalizedUserPromptText()}:\n${textForLLM}`,
        apiKey,
        modelName,
        apiURL,
        provider,
        onChunk,
        cancelToken?.signal,
        onThinking
      )
      if (cancelToken?.cancelled) throw new ProofreadCancelledError()
      return { result: parseCorrections(result), use_tokens: total_tokens }
    }

    // 使用 RAG 的校对（repositoryNameList 有内容）
    if (repositoryNameList.length > 0 && fileName) {
      const embApiKey = embeddingConfig?.apiKey || apiKey
      const embApiURL = embeddingConfig?.apiURL || apiURL
      const embModelName = embeddingConfig?.modelName || modelName
      console.log('------------------------setting of RAG-------------------------------------')
      console.log('embedding key:', maskKey(embApiKey))
      console.log('embedding URL:', embApiURL)
      console.log('embedding modelName:', embModelName)

      const ragChunks = await queryDocChunk(
        repositoryNameList,
        embApiKey,
        embApiURL,
        embModelName,
        fileName,
        text,
        '',
        3
      )

      if (ragChunks.length > 0) {
        const ragContext = `\n${getLocalizedRagText()}:\n${ragChunks.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
        systemPrompt += ragContext
      }

      const { result, total_tokens } = await callModelAPI(
        systemPrompt,
        `${getLocalizedUserPromptText()}:\n${textForLLM}`,
        apiKey,
        modelName,
        apiURL,
        provider,
        onChunk,
        cancelToken?.signal,
        onThinking
      )
      if (cancelToken?.cancelled) throw new ProofreadCancelledError()
      return { result: parseCorrections(result, ragChunks), use_tokens: total_tokens }
    }
  } catch (error) {
    // 取消不属于"校对失败"：向上传播，让整个校对流程终止
    if (cancelToken?.cancelled) throw new ProofreadCancelledError()
    // 失败不再静默吞成空结果：向上抛给 runWithLimits 记入 failedSegments，
    // 否则断网/鉴权失败会表现为「该段没有建议」的假成功，用户无法察觉结果不完整
    console.error(getLocalizedConsoleMessages().proofTextFailed, error)
    throw error
  }
}

// ====== 主校对函数 ======

/** 校对过程中失败的分片：随 process-docx 返回给渲染端做可观测提示 */
export interface FailedSegment {
  stage: 'proofread' | 'reduce' | 'review'
  index: number
  /** 分片摘要（章节标题 / 句子前缀 / 段落序号），用于失败提示定位 */
  label: string
  /** 失败原因摘要 */
  message: string
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function proofreadDocument(
  documentPath: string,
  mode: 'section' | 'sentence' | 'full',
  apiKey: string,
  modelName: string,
  apiURL: string,
  repositoryNameList?: string[],
  embeddingConfig?: ApiSettings,
  parallelSet = 30,
  requestsPerMinute?: number,
  onProgress?: (payload: ProofreadProgressPayload) => void,
  provider?: ModelProvider,
  streamSink?: ProofreadStreamSink | null,
  cancelToken?: ProofreadCancelToken | null
): Promise<{ proofResult: ProofreadingCorrection[]; token_usage: number; failedSegments: FailedSegment[] }> {
  console.log('process mode is:', mode)
  console.log('process api is:', apiURL, modelName)
  const progressMessages = getLocalizedProgressMessages()
  const effectivePrompt = getCurrentEffectivePrompt()
  let total_tokens = 0 // calculate the usage of tokens
  // set the limit of request per minute
  const option = requestsPerMinute
    ? {
        requestsPerMinute
      }
    : undefined
  // 失败分片收集：默认空数组（full 模式单请求失败直接向上抛错，走整体失败提示）
  const failedSegments: FailedSegment[] = []

  try {
    const fileName = path.basename(documentPath)

    if (mode === 'full') {
      onProgress?.({
        stage: 'splitting',
        mode,
        message: progressMessages.splitting
      })
      const fullText = await mammoth.extractRawText({ path: documentPath }) // get full text
      const text = fullText.value.trim() // trim
      if (!text)
        return {
          proofResult: null,
          token_usage: 0,
          failedSegments
        }
      const { result, use_tokens } = await proofreadTextWithRAG(
        text,
        effectivePrompt,
        apiKey,
        modelName,
        apiURL,
        repositoryNameList,
        fileName,
        embeddingConfig,
        provider,
        chunk => streamSink?.chunk('proofread', 0, '', chunk),
        cancelToken,
        chunk => streamSink?.thinking('proofread', 0, '', chunk)
      )
      cancelToken?.throwIfCancelled()
      total_tokens += use_tokens
      streamSink?.segment('proofread', 0, '', result.length)

      onProgress?.({
        stage: 'completed',
        mode,
        percent: 100,
        message: progressMessages.completed
      })
      return { proofResult: result, token_usage: total_tokens, failedSegments }
    }

    onProgress?.({
      stage: 'splitting',
      mode,
      message: progressMessages.splitting
    })
    const docStructure = await parseWordDocument(documentPath)
    onProgress?.({
      stage: 'theme',
      mode,
      message: progressMessages.theme
    })
    const documentTheme = await summarizeDocumentTheme(
      docStructure,
      apiKey,
      modelName,
      apiURL,
      provider,
      chunk => streamSink?.chunk('theme', 0, '', chunk),
      cancelToken,
      chunk => streamSink?.thinking('theme', 0, '', chunk)
    )
    cancelToken?.throwIfCancelled()
    const nonEmptySections = getSectionsForProofreading(docStructure.sections)
    if (nonEmptySections.length === 0)
      return {
        proofResult: null,
        token_usage: 0,
        failedSegments
      }

    let allCorrections: ProofreadingCorrection[] = []

    if (mode === 'section') {
      onProgress?.({
        stage: 'proofreading',
        mode,
        total: nonEmptySections.length,
        completed: 0,
        percent: 0,
        message: progressMessages.proofreading
      })
      const sectionResults = await runWithLimits(
        nonEmptySections,
        parallelSet,
        async (section, sectionIndex) => {
          const sectionLabel = section.title.slice(0, 20)
          const systemContext = `${effectivePrompt}\n${buildLocalizedDocumentContextInjection(docStructure.title, documentTheme.result, section.title)}`
          const sectionResult = await proofreadTextWithRAG(
            section.content,
            systemContext,
            apiKey,
            modelName,
            apiURL,
            repositoryNameList,
            fileName,
            embeddingConfig,
            provider,
            chunk => streamSink?.chunk('proofread', sectionIndex, sectionLabel, chunk),
            cancelToken,
            chunk => streamSink?.thinking('proofread', sectionIndex, sectionLabel, chunk)
          )
          streamSink?.segment('proofread', sectionIndex, sectionLabel, sectionResult.result.length)
          return sectionResult
        },
        {
          ...option,
          shouldCancel: () => cancelToken?.cancelled ?? false,
          onItemFailed: (failedIndex, error) => {
            failedSegments.push({
              stage: 'proofread',
              index: failedIndex,
              label: nonEmptySections[failedIndex]?.title?.slice(0, 20) || `#${failedIndex + 1}`,
              message: toFailureMessage(error)
            })
          },
          onItemCompleted: (completed, total) => {
            onProgress?.({
              stage: 'proofreading',
              mode,
              total,
              completed,
              percent: total > 0 ? Math.min(95, Math.floor((completed / total) * 95)) : 0,
              message: progressMessages.proofreading
            })
          }
        }
      )
      cancelToken?.throwIfCancelled()
      const resultList: ProofreadingCorrection[][] = []
      sectionResults.forEach(item => {
        total_tokens += item.use_tokens
        resultList.push(item.result)
      })
      allCorrections = resultList.flat()
    } else if (mode === 'sentence') {
      const sentenceTasks: {
        index: number
        label: string
        run: () => Promise<{ result: ProofreadingCorrection[]; use_tokens: number }>
      }[] = []
      let sentenceIndex = 0
      for (const section of nonEmptySections) {
        // 先按行/制表符拆分再切句：
        // 1. 表格 section 的每行是 \t 连接的单元格，拆分后校对单元落在单个单元格内，
        //    LLM 返回的 original 才能匹配到具体段落完成回写；
        // 2. 正文章节中无结尾标点的段落也不会被合并成一个请求单元，
        //    避免产生跨段落的 original 导致替换静默失败。
        const sentenceUnits = section.content
          .split(/[\n\t]/)
          .flatMap(line => splitSentences(line))
        // 纯数字/符号单元（如表格中的 "3.2"、"85%"）不送 LLM
        const validSentences = sentenceUnits.filter(
          s => s.trim().length > 0 && hasReadableText(s)
        )
        if (validSentences.length === 0) continue

        for (const sentence of validSentences) {
          const index = sentenceIndex++
          const label = sentence.trim().slice(0, 16)
          sentenceTasks.push({
            index,
            label,
            run: async () => {
              const systemContext = `${effectivePrompt}\n${buildLocalizedDocumentContextInjection(docStructure.title, documentTheme.result, section.title)}`
              const sentenceResult = await proofreadTextWithRAG(
                sentence,
                systemContext,
                apiKey,
                modelName,
                apiURL,
                repositoryNameList,
                fileName,
                embeddingConfig,
                provider,
                chunk => streamSink?.chunk('proofread', index, label, chunk),
                cancelToken,
                chunk => streamSink?.thinking('proofread', index, label, chunk)
              )
              streamSink?.segment('proofread', index, label, sentenceResult.result.length)
              return sentenceResult
            }
          })
        }
      }

      onProgress?.({
        stage: 'proofreading',
        mode,
        total: sentenceTasks.length,
        completed: 0,
        percent: 0,
        message: progressMessages.proofreading
      })

      if (sentenceTasks.length > 0) {
        const sentenceResults = await runWithLimits(sentenceTasks, parallelSet, task => task.run(), {
          ...option,
          shouldCancel: () => cancelToken?.cancelled ?? false,
          onItemFailed: (failedIndex, error) => {
            const failedTask = sentenceTasks[failedIndex]
            failedSegments.push({
              stage: 'proofread',
              index: failedIndex,
              label: failedTask?.label || `#${failedIndex + 1}`,
              message: toFailureMessage(error)
            })
          },
          onItemCompleted: (completed, total) => {
            onProgress?.({
              stage: 'proofreading',
              mode,
              total,
              completed,
              percent: total > 0 ? Math.min(95, Math.floor((completed / total) * 95)) : 0,
              message: progressMessages.proofreading
            })
          }
        })
        cancelToken?.throwIfCancelled()
        const resultList: ProofreadingCorrection[][] = []
        sentenceResults.forEach(Items => {
          total_tokens += Items.use_tokens
          resultList.push(Items.result)
        })
        allCorrections = resultList.flat()
      }
    }

    // 取消发生在收尾阶段时，不返回残缺的部分结果
    cancelToken?.throwIfCancelled()

    // 确保可序列化
    const serializableCorrections = allCorrections.map(correction => ({
      original: correction.original,
      suggested: correction.suggested,
      reason: correction.reason,
      type: correction.type,
      ...(correction.References ? { References: correction.References } : {}),
      ...(correction.filtered ? { filtered: correction.filtered } : {}),
      ...(correction.filterReason ? { filterReason: correction.filterReason } : {})
    }))

    if (failedSegments.length > 0) {
      console.warn(`校对完成，但有 ${failedSegments.length} 个分片失败:`, failedSegments)
    }
    onProgress?.({
      stage: 'completed',
      mode,
      percent: 100,
      message: progressMessages.completed
    })
    return { proofResult: serializableCorrections, token_usage: total_tokens, failedSegments }
  } catch (error) {
    console.error(getLocalizedConsoleMessages().documentProofError, error)
    throw error
  }
}

// ====== 降低AI率 ======

function mergeFormulaFragments(lines: string[]): string[] {
  const trimmed = lines.map(l => l.trim()).filter(l => l.length > 0)
  const result: string[] = []
  let buffer = ''

  for (const line of trimmed) {
    if (line.length <= 3) {
      buffer += line
    } else {
      if (buffer) {
        buffer += line
        result.push(buffer)
        buffer = ''
      } else {
        result.push(line)
      }
    }
  }
  if (buffer) result.push(buffer)

  return result
}

function shouldExcludeFromReduceAI(paragraph: string): boolean {
  const trimmed = paragraph.trim()
  if (trimmed.length < 20) return true
  if (/^图\s*[\d.]+/.test(trimmed)) return true
  if (/^表\s*[\d.]+/.test(trimmed)) return true
  if (/^Fig\.?\s*\d/i.test(trimmed)) return true
  if (/^Table\s*\d/i.test(trimmed)) return true
  if (/^关键词[：:]/.test(trimmed)) return true
  // 英文关键词段：覆盖 "Keyword:" / "Keywords:" / "Key word:" / "Key words:" 等写法，
  // 例如 "Key words: Dual Graph Neural Networks, Road Segmentation, ..." 整体跳过改写。
  if (/^Key\s*words?\s*[:：]/i.test(trimmed)) return true
  if (/^\[\d+\]/.test(trimmed)) return true
  const tabCount = (trimmed.match(/\t/g) || []).length
  if (tabCount >= 3) return true
  const pipeCount = (trimmed.match(/\|/g) || []).length
  if (pipeCount >= 4) return true
  return false
}

/**
 * 判断段落是否主要为英文（拉丁字母）文本。
 *
 * 降低AI率流程仅针对中文论文做改写。对于英文段落（如论文中的 Abstract），
 * 改写目标风格、词汇替换规则都基于中文，强行处理会导致英文段落被翻译成中文
 * 或被错误改写。因此一旦识别为英文段落，直接跳过，原样保留。
 *
 * 判定标准：去除数字、空白、标点、脚注/公式占位符后，
 * 拉丁字母占比超过 60% 即视为英文段落。
 */
function isMostlyEnglishText(paragraph: string): boolean {
  // 移除脚注/公式占位符，避免影响字符统计
  const cleaned = paragraph
    .replace(/\[\[FOOTNOTE_REF:\d+\]\]/g, '')
    .replace(/\[\[MATH:[\s\S]*?\]\]/g, '')

  const latinChars = (cleaned.match(/[A-Za-z]/g) || []).length
  // 中日韩统一表意文字（基本覆盖中文）
  const cjkChars = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length
  const total = latinChars + cjkChars
  // 没有任何字母文字，无法判定，保守视为非英文
  if (total < 20) return false
  return latinChars / total > 0.6
}

function isReferenceSection(title: string): boolean {
  const t = title.trim().toLowerCase()
  return /参考文献|references|引文|bibliography|引用文献/.test(t)
}

function cleanAIResponse(text: string): string {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```[\w]*\n?/g, '')
  cleaned = cleaned.replace(/\n?```$/g, '')
  cleaned = cleaned.replace(/^["'"「」《》]|["'"「」《》]$/g, '')
  if (cleaned.startsWith('修改后') || cleaned.startsWith('修改后：') || cleaned.startsWith('修改后:')) {
    cleaned = cleaned.replace(/^修改后[：:]\s*/, '')
  }
  if (cleaned.startsWith('改写后') || cleaned.startsWith('改写后：') || cleaned.startsWith('改写后:')) {
    cleaned = cleaned.replace(/^改写后[：:]\s*/, '')
  }
  return cleaned.trim()
}

export async function reduceAIDetectionDocument(
  documentPath: string,
  apiKey: string,
  modelName: string,
  apiURL: string,
  parallelSet = 30,
  requestsPerMinute?: number,
  onProgress?: (payload: ProofreadProgressPayload) => void,
  provider?: ModelProvider,
  streamSink?: ProofreadStreamSink | null,
  cancelToken?: ProofreadCancelToken | null
): Promise<{ proofResult: ProofreadingCorrection[]; token_usage: number; failedSegments: FailedSegment[] }> {
  const prompts = getPrompts()
  const reducePrompt = prompts.REDUCE_AI_RATE_SYSTEM_PROMPT || zhCNPrompts.REDUCE_AI_RATE_SYSTEM_PROMPT
  const reduceReason = prompts.REDUCE_AI_RATE_REASON || zhCNPrompts.REDUCE_AI_RATE_REASON
  const reduceProgress = prompts.REDUCE_AI_RATE_PROGRESS_MESSAGES || zhCNPrompts.REDUCE_AI_RATE_PROGRESS_MESSAGES
  let total_tokens = 0

  const option = requestsPerMinute ? { requestsPerMinute } : undefined
  const failedSegments: FailedSegment[] = []

  try {
    onProgress?.({
      stage: 'splitting',
      mode: 'section',
      message: reduceProgress.splitting
    })

    const docStructure = await parseWordDocument(documentPath)

    // 收集目录段落文本：降低AI率流程整体跳过目录，避免目录条目（含页码、
    // 制表符对齐）被当作正文送进 LLM 改写而破坏格式。详见 collectTableOfContentsTexts。
    const tocTexts = await collectTableOfContentsTexts(documentPath)
    if (tocTexts.size > 0) {
      console.log(`[降低AI率] 识别到目录段落 ${tocTexts.size} 行，将整体跳过`)
    }

    const nonEmptySections = getSectionsForProofreading(docStructure.sections)

    const validParagraphs: { title: string; content: string }[] = []
    let inReferenceSection = false

    for (const section of docStructure.sections) {
      // 表格是数据内容（实验数据、参数列表等），按段落改写会破坏数据准确性，
      // 降低AI率流程整体跳过表格章节
      if (section.isTable) continue
      if (isReferenceSection(section.title)) {
        inReferenceSection = true
        continue
      }
      if (inReferenceSection) {
        const nextSectionLevel = section.level
        if (nextSectionLevel <= 1) {
          inReferenceSection = false
        } else {
          continue
        }
      }
      const paragraphs = mergeFormulaFragments(section.content.split('\n'))
      for (const para of paragraphs) {
        if (isLikelyTitle(para)) continue
        if (shouldExcludeFromReduceAI(para)) continue
        // 跳过目录段落（SDT 目录或 TOC 域代码目录）。用整行文本精确匹配，
        // 避免误伤正文里恰好含制表符+数字的句子。比对前统一剥离零宽字符，
        // 与 collectTableOfContentsTexts 的收集口径保持一致。
        if (tocTexts.size > 0 && tocTexts.has(stripZeroWidth(para))) {
          console.log('[降低AI率] 跳过目录段落:', para.slice(0, 60))
          continue
        }
        // 英文段落（如 Abstract）跳过改写：中文改写规则不适用，
        // 否则会被翻译成中文或被错误改写。原样保留。
        // 仅在程序语言环境为中文时启用——英文界面下用户可能本就是要改写英文段落。
        if (currentLocale === 'zh-CN' && isMostlyEnglishText(para)) {
          console.log('[降低AI率] 跳过英文段落，不进行改写:', para.slice(0, 60))
          continue
        }
        validParagraphs.push({ title: section.title, content: para })
      }
    }

    if (validParagraphs.length === 0) {
      return { proofResult: [], token_usage: 0, failedSegments }
    }

    onProgress?.({
      stage: 'reducing',
      mode: 'section',
      total: validParagraphs.length,
      completed: 0,
      percent: 0,
      message: reduceProgress.reducing
    })

    const results = await runWithLimits(
      validParagraphs,
      parallelSet,
      async (para, index) => {
        // 构建带上下文的用户消息
        const prevPara = index > 0 ? validParagraphs[index - 1] : null
        const nextPara = index < validParagraphs.length - 1 ? validParagraphs[index + 1] : null
        let userMessage = ''
        if (prevPara) {
          userMessage += `[上一段]\n${placeholderToHuman(prevPara.content)}\n\n`
        }
        userMessage += `[需要改写的段落]\n${placeholderToHuman(para.content)}`
        if (nextPara) {
          userMessage += `\n\n[下一段]\n${placeholderToHuman(nextPara.content)}`
        }

        const paraLabel = `#${index + 1}`
        const { result, total_tokens: tokens } = await callModelAPI(
          reducePrompt,
          userMessage,
          apiKey,
          modelName,
          apiURL,
          provider,
          chunk => streamSink?.chunk('reduce', index, paraLabel, chunk),
          cancelToken?.signal,
          chunk => streamSink?.thinking('reduce', index, paraLabel, chunk)
        )
        if (cancelToken?.cancelled) throw new ProofreadCancelledError()
        let rewritten = cleanAIResponse(result)
        // 还原脚注占位符
        rewritten = humanToPlaceholder(rewritten)
        if (!rewritten || rewritten === para.content.trim()) {
          streamSink?.segment('reduce', index, paraLabel, 0)
          return { correction: null, tokens }
        }
        streamSink?.segment('reduce', index, paraLabel, 1)
        return {
          correction: {
            // original 直接来自 docx 抽取的段落文本，可能残留 OMML 边界的零宽字符
            // （如 [[MATH:AS]] 紧后的 U+200B）。剥离它们，避免前端匹配正则把不可见
            // 字符当作字面量烧进去导致匹配失败。
            original: stripZeroWidth(para.content),
            suggested: rewritten,
            reason: reduceReason,
            type: 'reduceAI'
          } as ProofreadingCorrection,
          tokens
        }
      },
      {
        ...option,
        shouldCancel: () => cancelToken?.cancelled ?? false,
        onItemFailed: (failedIndex, error) => {
          failedSegments.push({
            stage: 'reduce',
            index: failedIndex,
            label: `#${failedIndex + 1}`,
            message: toFailureMessage(error)
          })
        },
        onItemCompleted: (completed, total) => {
          onProgress?.({
            stage: 'reducing',
            mode: 'section',
            total,
            completed,
            percent: total > 0 ? Math.min(95, Math.floor((completed / total) * 95)) : 0,
            message: reduceProgress.reducing
          })
        }
      }
    )
    cancelToken?.throwIfCancelled()

    const allCorrections: ProofreadingCorrection[] = []
    for (const r of results) {
      total_tokens += r.tokens
      if (r.correction) {
        allCorrections.push(r.correction)
      }
    }

    const serializableCorrections = allCorrections.map(c => ({
      original: c.original,
      suggested: c.suggested,
      reason: c.reason,
      type: c.type
    }))

    console.log('降低AI率结果:', serializableCorrections.length, '条改写')
    if (failedSegments.length > 0) {
      console.warn(`降低AI率完成，但有 ${failedSegments.length} 个分片失败:`, failedSegments)
    }
    onProgress?.({
      stage: 'completed',
      mode: 'section',
      percent: 100,
      message: reduceProgress.completed
    })

    return { proofResult: serializableCorrections, token_usage: total_tokens, failedSegments }
  } catch (error) {
    console.error('降低AI率处理出错:', error)
    throw error
  }
}

// ====== 校对结果审核 ======

const REVIEW_BATCH_SIZE = 100

const NO_ERROR_REASON_PATTERNS = [
  /原文无错误/, /无需修改/, /原文正确/, /不存在错误/, /没有错误/, /无需校正/, /无需更正/,
  /no\s*error/i, /no\s*change/i, /original.*correct/i, /no.*error.*found/i, /correctly\s*written/i, /no\s*correction/i
]

function isNoErrorReason(reason: string): boolean {
  if (!reason || typeof reason !== 'string') return false
  return NO_ERROR_REASON_PATTERNS.some(pattern => pattern.test(reason))
}

function filterInvalidCorrections(corrections: ProofreadingCorrection[]): ProofreadingCorrection[] {
  return corrections.filter(c => !c.filtered && !isNoErrorReason(c.reason))
}

function buildReviewPrompt(backgroundInstruction: string): string {
  return buildLocalizedReviewPrompt(backgroundInstruction)
}

function buildReviewUserPrompt(corrections: ProofreadingCorrection[]): string {
  return buildLocalizedReviewUserPrompt(corrections)
}

export async function reviewCorrections(
  corrections: ProofreadingCorrection[],
  backgroundInstruction: string,
  apiKey: string,
  modelName: string,
  apiURL: string,
  onProgress?: (completed: number, total: number) => void,
  provider?: ModelProvider,
  streamSink?: ProofreadStreamSink | null,
  cancelToken?: ProofreadCancelToken | null
): Promise<{ reviewedResult: ProofreadingCorrection[]; token_usage: number }> {
  const filterReasons = getLocalizedReviewFilterReasons()

  if (!corrections || corrections.length === 0) {
    return { reviewedResult: [], token_usage: 0 }
  }

  const reviewSystemPrompt = buildReviewPrompt(backgroundInstruction)
  let totalTokens = 0

  if (corrections.length > REVIEW_BATCH_SIZE) {
    const batches: ProofreadingCorrection[][] = []
    for (let i = 0; i < corrections.length; i += REVIEW_BATCH_SIZE) {
      batches.push(corrections.slice(i, i + REVIEW_BATCH_SIZE))
    }

    const allReviewed: ProofreadingCorrection[] = []
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      cancelToken?.throwIfCancelled()
      const batch = batches[batchIdx]
      const userPrompt = buildReviewUserPrompt(batch)

      const { result, total_tokens } = await callModelAPI(
        reviewSystemPrompt,
        userPrompt,
        apiKey,
        modelName,
        apiURL,
        provider,
        chunk => streamSink?.chunk('review', batchIdx, `#${batchIdx + 1}`, chunk),
        cancelToken?.signal,
        chunk => streamSink?.thinking('review', batchIdx, `#${batchIdx + 1}`, chunk)
      )
      cancelToken?.throwIfCancelled()
      totalTokens += total_tokens

      const reviewed = parseCorrections(result)
      for (const original of batch) {
        const matched = reviewed.find(r => r.original === original.original && r.suggested === original.suggested)
        if (matched && matched.filtered) {
          original.filtered = true
          original.filterReason = matched.filterReason || filterReasons.reviewRejected
        } else if (matched && !matched.filtered) {
          original.filtered = false
        } else {
          const fallbackMatch = reviewed.find(r => r.original === original.original)
          if (fallbackMatch) {
            if (fallbackMatch.filtered) {
              original.filtered = true
              original.filterReason = fallbackMatch.filterReason || filterReasons.reviewRejected
            } else {
              original.filtered = true
              original.filterReason = fallbackMatch.filterReason || filterReasons.reviewOriginalCorrect
            }
          } else {
            original.filtered = false
          }
        }
      }
      allReviewed.push(...batch)
      streamSink?.segment('review', batchIdx, `#${batchIdx + 1}`, batch.length)

      const batchFiltered = batch.filter(c => c.filtered || isNoErrorReason(c.reason))
      if (batchFiltered.length > 0) {
        console.log(`[审核] 第${batchIdx + 1}批: 过滤 ${batchFiltered.length}/${batch.length} 条建议`)
        batchFiltered.forEach(c => {
          console.log(
            `  - 过滤: "${c.original}" → "${c.suggested}" | 原因: ${c.filterReason || filterReasons.noReason}`
          )
        })
      } else {
        console.log(`[审核] 第${batchIdx + 1}批: 保留全部 ${batch.length} 条建议`)
      }

      if (onProgress) {
        onProgress(Math.min((batchIdx + 1) * REVIEW_BATCH_SIZE, corrections.length), corrections.length)
      }
    }

    return { reviewedResult: filterInvalidCorrections(allReviewed), token_usage: totalTokens }
  }

  const userPrompt = buildReviewUserPrompt(corrections)
  cancelToken?.throwIfCancelled()
  const { result, total_tokens } = await callModelAPI(
    reviewSystemPrompt,
    userPrompt,
    apiKey,
    modelName,
    apiURL,
    provider,
    chunk => streamSink?.chunk('review', 0, '#1', chunk),
    cancelToken?.signal,
    chunk => streamSink?.thinking('review', 0, '#1', chunk)
  )
  cancelToken?.throwIfCancelled()
  totalTokens = total_tokens

  const reviewed = parseCorrections(result)

  for (const original of corrections) {
    const matched = reviewed.find(r => r.original === original.original && r.suggested === original.suggested)
    if (matched && matched.filtered) {
      original.filtered = true
      original.filterReason = matched.filterReason || filterReasons.reviewRejected
    } else if (matched && !matched.filtered) {
      original.filtered = false
    } else {
      const fallbackMatch = reviewed.find(r => r.original === original.original)
      if (fallbackMatch) {
        if (fallbackMatch.filtered) {
          original.filtered = true
          original.filterReason = fallbackMatch.filterReason || filterReasons.reviewRejected
        } else {
          original.filtered = true
          original.filterReason = fallbackMatch.filterReason || filterReasons.reviewOriginalCorrect
        }
      } else {
        original.filtered = false
      }
    }
  }

  streamSink?.segment('review', 0, '#1', corrections.length)

  const filtered = corrections.filter(c => c.filtered || isNoErrorReason(c.reason))
  if (filtered.length > 0) {
    console.log(`[审核] 过滤 ${filtered.length}/${corrections.length} 条建议`)
    filtered.forEach(c => {
      console.log(`  - 过滤: "${c.original}" → "${c.suggested}" | 原因: ${c.filterReason || filterReasons.noReason}`)
    })
  } else {
    console.log(`[审核] 保留全部 ${corrections.length} 条建议`)
  }

  return { reviewedResult: filterInvalidCorrections(corrections), token_usage: totalTokens }
}

export function getCurrentBackgroundInstruction(): string {
  ensurePromptSettingsLoaded()
  return buildBackgroundInstruction(currentPromptSettings, currentLocale)
}

export function setLocale(locale: AppLanguage): void {
  currentLocale = locale
}

export function getLocale(): AppLanguage {
  return currentLocale
}
