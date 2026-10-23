/**
 * Build-time stub for src/main/chat.ts (own multi-provider SDK channel).
 *
 * In the dsh plugin every model call is routed through the host's ctx.llm
 * via setProofreadModelCaller() before any proofreading starts, so these
 * exports are unreachable. The bundler swaps this file in (see build.mjs)
 * to keep the OpenAI/Anthropic/Google SDKs out of the plugin bundle.
 */

export type OnChunk = (chunk: string) => void

export async function getModelResponse(): Promise<never> {
  throw new Error('chat.ts default channel is not available in the dsh plugin build; the ctx.llm bridge must be installed first')
}

export async function OpenaiGen(): Promise<never> {
  throw new Error('chat.ts default channel is not available in the dsh plugin build; the ctx.llm bridge must be installed first')
}
