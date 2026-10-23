/**
 * Tool definitions for dsh-docx-proofread.
 *
 * Three tools wrap the shared engine:
 * - proofread_docx:   run LLM proofreading over a .docx, write corrections JSON
 * - apply_corrections: apply selected corrections back into a new .docx
 * - docx_info:        cheap document stats for cost estimation before a run
 *
 * Granularity mapping mirrors the Electron app (ipc/proofHandlers.ts):
 * wordError -> sentence, ComprehensiveError -> section, polish/reduceAI -> full
 * (reduceAI runs its own pipeline: reduceAIDetectionDocument, paragraph rewrites).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import mammoth from 'mammoth'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  proofreadDocument,
  reduceAIDetectionDocument,
  setProofreadModelCaller,
  setPromptSettings,
  createProofreadCancelToken,
  ProofreadCancelledError,
} from '../../src/main/proof'
import { replaceTextInDocx } from '../../src/main/wordProcess'
import { createLlmBridge, DEFAULT_PROVIDER } from './llmBridge'

/** Default model when the caller does not pick one. */
export const DEFAULT_MODEL = 'deepseek-v4-flash'

const PROOF_TYPES = ['wordError', 'ComprehensiveError', 'polish', 'reduceAI'] as const
type ProofType = (typeof PROOF_TYPES)[number]

interface Correction {
  original: string
  suggested: string
  reason: string
  type: string
  References?: string[]
  filtered?: boolean
  filterReason?: string
}

/** Resolve a user/agent-supplied path against the session working directory. */
function resolvePath(input: string, exec: any): string {
  if (path.isAbsolute(input)) return input
  const cwd = exec?.agent?.session?.header?.cwd ?? process.cwd()
  return path.resolve(cwd, input)
}

function assertDocxExists(input: string, label: string): void {
  if (!fs.existsSync(input)) throw new Error(`${label}文件不存在: ${input}`)
  if (path.extname(input).toLowerCase() !== '.docx') throw new Error(`${label}必须是 .docx 文件: ${input}`)
}

function proofModeFor(proofType: ProofType): 'sentence' | 'section' | 'full' {
  if (proofType === 'ComprehensiveError') return 'section'
  if (proofType === 'polish' || proofType === 'reduceAI') return 'full'
  return 'sentence'
}

function defaultCorrectionsFile(docxPath: string): string {
  return docxPath.replace(/\.docx$/i, '') + '.corrections.json'
}

/** Markdown summary the model sees; full corrections stay in the JSON file. */
function renderProofreadSummary(value: {
  docxPath: string
  proofType: string
  model: string
  correctionsFile: string
  count: number
  visibleCount: number
  byType: Record<string, number>
  failedSegments: number
  corrections: Correction[]
}): string {
  const typeLines = Object.entries(value.byType)
    .map(([type, count]) => `- ${type}: ${count} 条`)
    .join('\n')
  const sample = value.corrections
    .slice(0, 15)
    .map(
      (c, i) =>
        `${i + 1}. [${c.type}] "${c.original}" → "${c.suggested}"\n   理由: ${c.reason}`
    )
    .join('\n')
  const more = value.count > 15 ? `\n…共 ${value.count} 条，完整清单见 ${value.correctionsFile}` : ''
  return [
    `校对完成: ${value.count} 条建议（可见 ${value.visibleCount} 条，失败分片 ${value.failedSegments} 个）`,
    `类型分布:\n${typeLines || '- 无'}`,
    `完整结果: ${value.correctionsFile}`,
    '',
    sample + more,
  ].join('\n')
}

export function createProofreadDocxTool(ctx: any) {
  return defineTool({
    name: 'proofread_docx',
    description:
      '用大模型校对 Word 文档(.docx)，生成校对建议清单并写入 JSON 文件。' +
      'proofType: wordError=错词校对(按句，快)、ComprehensiveError=综合校对(按段，慢但覆盖上下文)、polish=全文润色(整篇)、' +
      'reduceAI=降AI率改写(逐段改写以降低机器生成痕迹；跳过目录/表格/参考文献/英文段，只改中文正文)。' +
      'intensity(严格度)与 background(文体背景)仅对前三种类型生效。' +
      '结果不直接改文档：先用本工具拿建议，用户确认后用 apply_corrections 应用。' +
      '长文档为分片并行调用模型，耗时与文档长度成正比；工具可被取消。',
    parameters: {
      path: { type: 'string', required: true, description: '输入 .docx 路径(相对会话工作目录)' },
      proofType: {
        type: 'string',
        enum: [...PROOF_TYPES],
        required: true,
        description:
          '校对类型: wordError(错词/按句) | ComprehensiveError(综合/按段) | polish(润色/整篇) | reduceAI(降AI率改写/逐段)',
      },
      intensity: {
        type: 'string',
        enum: ['strict', 'normal', 'loose'],
        description: '校对严格度，默认 normal',
      },
      background: {
        type: 'string',
        enum: ['academic', 'news', 'official', 'daily'],
        description: '文体背景(影响判断口径)，默认 academic',
      },
      model: { type: 'string', description: `模型 id，默认 ${DEFAULT_MODEL}` },
      provider: { type: 'string', description: `宿主 provider 路由，默认 ${DEFAULT_PROVIDER}` },
      parallel: { type: 'number', description: '分片并发数，默认 30' },
      correctionsOut: { type: 'string', description: '校对结果 JSON 输出路径，默认 <输入名>.corrections.json' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: any) => [{ type: 'text', text: renderProofreadSummary(value) }],
      presentationMeta: (_args: unknown, value: any) => ({
        docxPath: value?.docxPath,
        correctionsFile: value?.correctionsFile,
        count: value?.count,
        proofType: value?.proofType,
        // 每次运行的刷新令牌：同一文档重跑校对时，侧栏页签据它重载内容。
        generatedAt: value?.generatedAt,
      }),
    },
    async execute(args: any, exec: any) {
      const docxPath = resolvePath(args.path, exec)
      assertDocxExists(docxPath, '输入')
      // 未知类型显式报错：静默回退成 wordError 会让 agent 以为跑对了任务
      if (!PROOF_TYPES.includes(args.proofType)) {
        throw new Error(`未知的 proofType: ${String(args.proofType)}（可选: ${PROOF_TYPES.join(' | ')}）`)
      }
      const proofType = args.proofType as ProofType
      const parallel = typeof args.parallel === 'number' && args.parallel > 0 ? args.parallel : 30
      const model = typeof args.model === 'string' && args.model ? args.model : DEFAULT_MODEL
      const correctionsFile = args.correctionsOut
        ? resolvePath(args.correctionsOut, exec)
        : defaultCorrectionsFile(docxPath)

      // Optional prompt overrides: load current settings, patch, persist.
      // 降AI走独立提示词，不消费这两个设置。
      if (proofType !== 'reduceAI' && (args.intensity || args.background)) {
        const current = await import('../../src/main/proof').then(m => m.getPromptSettings())
        await setPromptSettings({
          ...current,
          ...(args.intensity ? { intensity: args.intensity } : {}),
          ...(args.background ? { background: args.background } : {}),
        })
      }

      setProofreadModelCaller(createLlmBridge(ctx, { provider: args.provider, model }))

      const cancelToken = createProofreadCancelToken()
      exec?.signal?.addEventListener('abort', () => cancelToken.cancel())

      let outcome: Awaited<ReturnType<typeof proofreadDocument>>
      try {
        outcome =
          proofType === 'reduceAI'
            ? await reduceAIDetectionDocument(
                docxPath,
                '', // apiKey: unused by the ctx.llm bridge
                model, // logged by the engine
                '', // apiURL: unused by the ctx.llm bridge
                parallel,
                undefined, // requestsPerMinute
                undefined, // onProgress: phase 2 (session events)
                undefined, // provider: engine-side routing is bypassed by the bridge
                null, // streamSink: phase 2
                cancelToken
              )
            : await proofreadDocument(
                docxPath,
                proofModeFor(proofType),
                '', // apiKey: unused by the ctx.llm bridge
                model, // logged by the engine
                '', // apiURL: unused by the ctx.llm bridge
                undefined, // repositoryNameList: RAG is phase 2
                undefined, // embeddingConfig
                parallel,
                undefined, // requestsPerMinute
                undefined, // onProgress: phase 2 (session events)
                undefined, // provider: engine-side routing is bypassed by the bridge
                null, // streamSink: phase 2
                cancelToken
              )
      } catch (error) {
        if (error instanceof ProofreadCancelledError) throw new Error('校对已取消')
        throw error
      }

      const corrections: Correction[] = outcome.proofResult ?? []
      const byType: Record<string, number> = {}
      for (const c of corrections) byType[c.type] = (byType[c.type] ?? 0) + 1

      const generatedAt = new Date().toISOString()
      const payload = {
        document: docxPath,
        proofType,
        model,
        generatedAt,
        count: corrections.length,
        corrections,
      }
      await fs.promises.writeFile(correctionsFile, JSON.stringify(payload, null, 2), 'utf-8')

      return {
        docxPath,
        proofType,
        model,
        generatedAt,
        correctionsFile,
        count: corrections.length,
        visibleCount: corrections.filter(c => !c.filtered).length,
        byType,
        failedSegments: outcome.failedSegments.length,
        tokenUsage: outcome.token_usage,
        corrections,
      }
    },
  })
}

export function createApplyCorrectionsTool() {
  return defineTool({
    name: 'apply_corrections',
    description:
      '把校对建议应用回 Word 文档，生成新 .docx（不改原文件）。' +
      '输入 proofread_docx 输出的 corrections JSON（文件或内联）。' +
      '可按 indices 选择部分应用（对应清单中的序号，从 0 开始）；默认全部。' +
      '保格式替换：含脚注/公式/上下角标的段落走 run 级替换，原文匹配不到的建议会被跳过并计数。',
    parameters: {
      path: { type: 'string', required: true, description: '原 .docx 路径(相对会话工作目录)' },
      corrections: { type: 'string', description: '内联校对建议 JSON(数组或 proofread_docx 的输出对象)，与 correctionsFile 二选一' },
      correctionsFile: { type: 'string', description: '校对建议 JSON 文件路径，与 corrections 二选一' },
      indices: {
        type: 'array',
        items: { type: 'number' },
        description: '要应用的建议序号数组(从 0 开始，对应清单顺序)；省略则全部应用',
      },
      output: { type: 'string', description: '输出 .docx 路径，默认 <输入名>-proofread.docx' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: any) => [
        { type: 'text', text: `已应用 ${value.appliedCount} 条建议到 ${value.output}${value.unmatchedCount ? `（${value.unmatchedCount} 条未匹配被跳过）` : ''}` },
      ],
    },
    async execute(args: any, exec: any) {
      const docxPath = resolvePath(args.path, exec)
      assertDocxExists(docxPath, '输入')

      let raw: unknown
      if (typeof args.corrections === 'string' && args.corrections.trim() !== '') {
        raw = JSON.parse(args.corrections)
      } else if (typeof args.correctionsFile === 'string' && args.correctionsFile !== '') {
        const file = resolvePath(args.correctionsFile, exec)
        if (!fs.existsSync(file)) throw new Error(`校对结果文件不存在: ${file}`)
        raw = JSON.parse(await fs.promises.readFile(file, 'utf-8'))
      } else {
        throw new Error('缺少参数: corrections(内联 JSON) 或 correctionsFile 二选一')
      }

      const list: Correction[] = Array.isArray(raw)
        ? (raw as Correction[])
        : ((raw as { corrections?: Correction[] })?.corrections ?? [])
      if (!Array.isArray(list) || list.length === 0) throw new Error('校对建议为空或格式不正确(需要数组或 {corrections:[…]} 对象)')

      const selected: Correction[] = Array.isArray(args.indices)
        ? args.indices.map((i: number) => list[i]).filter((c: Correction | undefined): c is Correction => c != null && !c?.filtered)
        : list.filter((c: Correction) => !c.filtered)
      if (selected.length === 0) throw new Error('选中的建议为空(indices 越界或全部被过滤)')

      const output =
        typeof args.output === 'string' && args.output !== ''
          ? resolvePath(args.output, exec)
          : docxPath.replace(/\.docx$/i, '') + '-proofread.docx'

      const { appliedCount, unmatchedCount } = await replaceTextInDocx(
        docxPath,
        output,
        selected.map(c => ({ original: c.original, suggested: c.suggested }))
      )

      return {
        input: docxPath,
        output,
        requested: selected.length,
        appliedCount,
        unmatchedCount,
      }
    },
  })
}

export function createDocxInfoTool() {
  return defineTool({
    name: 'docx_info',
    description:
      '读取 Word 文档(.docx)统计:字符数、段落数、预估校对分片数。' +
      '校对前先调用本工具估算耗时与成本，长文档提醒用户。不读取文档语义内容。',
    parameters: {
      path: { type: 'string', required: true, description: '.docx 路径(相对会话工作目录)' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: any) => [
        {
          type: 'text',
          text: `${value.path}: ${value.characters} 字符 / ${value.paragraphs} 段落，预估 ${value.estimatedSegments} 个校对分片（wordError 按句最多）`,
        },
      ],
    },
    async execute(args: any, exec: any) {
      const docxPath = resolvePath(args.path, exec)
      assertDocxExists(docxPath, '输入')

      const { value: text } = await mammoth.extractRawText({ path: docxPath })
      const trimmed = (text ?? '').trim()
      if (!trimmed) throw new Error('文档为空或无法提取文本')
      const paragraphs = trimmed.split(/\n+/).filter(Boolean)
      const characters = trimmed.replace(/\s/g, '').length

      return {
        path: docxPath,
        characters,
        paragraphs: paragraphs.length,
        // 按句模式的最坏情况估算：每片约 30 句，句子按标点粗分
        estimatedSegments: Math.max(1, Math.ceil(trimmed.split(/[。！？!?\n]+/).filter(Boolean).length / 30)),
      }
    },
  })
}
