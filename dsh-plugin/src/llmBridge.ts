/**
 * llmBridge — adapt the engine's model-call signature onto the host's ctx.llm.
 *
 * The proofreading engine (src/main/proof.ts) issues model calls through a
 * single signature (ProofreadModelCaller, historically backed by chat.ts's
 * own SDK clients). This bridge re-implements that signature on top of
 * `ctx.llm.stream()` so every proofreading request rides the harness's
 * provider adapters, credentials, and token metering.
 *
 * Direct ctx.llm callers are single-attempt by design (agent-level retry
 * lives elsewhere), so this bridge adds bounded retries for transient
 * failures (rate limit / empty response) with exponential backoff.
 */

import type { ProofreadModelCaller } from '../../src/main/proof'

export interface LlmBridgeOptions {
  /** Host provider route key. Default: 'deepseek-official' (API-key route). */
  provider?: string
  /** Exact model id to call. */
  model: string
}

/** Provider route used when the caller does not override it. */
export const DEFAULT_PROVIDER = 'deepseek-official'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Transient failure codes worth one more attempt. */
const RETRYABLE_CODES = new Set(['RATE_LIMIT', 'EMPTY_RESPONSE'])

function failureCode(error: unknown): string | undefined {
  return (error as { code?: string } | null | undefined)?.code
}

function isRetryable(error: unknown): boolean {
  return RETRYABLE_CODES.has(failureCode(error) ?? '')
}

/** One ctx.llm.stream pass: accumulate text/thinking deltas and usage, then map the finish reason. */
async function streamOnce(
  ctx: any,
  options: LlmBridgeOptions,
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  onThinking?: (chunk: string) => void
): Promise<{ result: string; total_tokens: number }> {
  let result = ''
  let totalTokens = 0

  const stream = ctx.llm.stream({
    provider: options.provider ?? DEFAULT_PROVIDER,
    model: options.model,
    messages: [
      { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
      { role: 'user', content: [{ type: 'text', text: userPrompt }] },
    ],
  })

  for await (const chunk of stream) {
    signal?.throwIfAborted()
    if (chunk.type === 'text-delta') {
      result += chunk.text
      onChunk?.(chunk.text)
    } else if (chunk.type === 'reasoning-delta') {
      onThinking?.(chunk.text)
    } else if (chunk.type === 'usage') {
      // TokenUsage counts are disjoint; totalTokens is optional.
      totalTokens = chunk.usage?.totalTokens ?? (chunk.usage?.inputTokens ?? 0) + (chunk.usage?.outputTokens ?? 0)
    } else if (chunk.type === 'finish') {
      const reason = chunk.reason
      if (reason?.kind === 'error') {
        throw reason.failure ?? new Error('LLM stream failed with an unknown error')
      }
      if (reason?.kind === 'aborted') {
        const err = new Error('LLM stream aborted')
        ;(err as { code?: string }).code = 'ABORTED'
        throw err
      }
    }
  }

  return { result, total_tokens: totalTokens }
}

/**
 * Build a ProofreadModelCaller that routes through ctx.llm.
 * apiKey / apiURL / provider parameters of the engine signature are ignored:
 * credentials and routing belong to the harness configuration.
 */
export function createLlmBridge(ctx: any, options: LlmBridgeOptions): ProofreadModelCaller {
  const MAX_ATTEMPTS = 3

  return async (
    systemPrompt: string,
    userPrompt: string,
    _apiKey: string,
    _modelName: string,
    _apiURL: string,
    _provider?: unknown,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    onThinking?: (chunk: string) => void
  ) => {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await streamOnce(ctx, options, systemPrompt, userPrompt, onChunk, signal, onThinking)
      } catch (error) {
        lastError = error
        if (signal?.aborted || !isRetryable(error) || attempt === MAX_ATTEMPTS) {
          throw error
        }
        await delay(1000 * attempt * attempt)
      }
    }
    throw lastError
  }
}
