/**
 * dsh-docx-proofread host plugin.
 *
 * Registers three model tools (proofread_docx / apply_corrections / docx_info)
 * and one runtime skill teaching the review workflow. The proofreading engine
 * is the same code the Electron app runs (src/main/proof.ts and friends),
 * bundled in with two build-time stubs (see build.mjs): every model call is
 * re-routed through the harness's ctx.llm, and the RAG knowledge base is
 * deferred to phase 2.
 *
 * Install as a profile bundle (`dsh plugin --profile <name> add dsh-docx-proofread`)
 * or mount directly with `--patch`.
 *
 * @module dsh-docx-proofread
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { installPluginEnv } from './env'
import { createProofreadDocxTool, createApplyCorrectionsTool, createDocxInfoTool, DEFAULT_MODEL } from './tools'
import { DEFAULT_PROVIDER } from './llmBridge'

const SKILL_FILE = fileURLToPath(new URL('../skill/SKILL.md', import.meta.url))

const SKILL_NAME = 'docx-proofread'
const SKILL_DESCRIPTION =
  'Word 文档校对:错词/综合校对与全文润色,生成建议清单、预览高亮、确认后保格式应用回文档。' +
  '用户要求"校对/检查/润色这份 Word 文档"、"改错别字"时使用。'

export const name = 'docx-proofread'

// 'llm' waits for the provider registry the model bridge streams through.
export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // Point the shared engine at plugin-owned dirs before any proofread call.
  installPluginEnv()

  // Skill registration is defensive: hosts without the skill service still work.
  const skills = ctx.get('skills')
  if (skills && typeof skills.register === 'function') {
    try {
      const dispose = skills.register({
        name: SKILL_NAME,
        description: SKILL_DESCRIPTION,
        content: readFileSync(SKILL_FILE, 'utf8'),
        source: 'runtime',
        provider: 'dsh-docx-proofread',
        defaultModel: DEFAULT_MODEL,
        defaultProvider: DEFAULT_PROVIDER,
      })
      ctx.tools.register(createProofreadDocxTool(ctx))
      ctx.tools.register(createApplyCorrectionsTool())
      ctx.tools.register(createDocxInfoTool())
      return dispose
    } catch (error) {
      ctx.logger?.warn?.('dsh-docx-proofread: failed to register docx-proofread skill: ' + String(error))
    }
  }

  ctx.tools.register(createProofreadDocxTool(ctx))
  ctx.tools.register(createApplyCorrectionsTool())
  ctx.tools.register(createDocxInfoTool())
}
