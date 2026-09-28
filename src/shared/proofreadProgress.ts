export type ProofreadStage = 'splitting' | 'theme' | 'proofreading' | 'reviewing' | 'reducing' | 'completed'

export type ProofreadMode = 'full' | 'section' | 'sentence'

export interface ProofreadProgressPayload {
  stage: ProofreadStage
  mode: ProofreadMode
  total?: number
  completed?: number
  percent?: number
  message?: string
}

/**
 * 流式输出事件的逻辑阶段。
 * theme/proofread/review 三个阶段的 LLM 输出是 JSON，
 * reduce（降低AI率）与 theme 前的主题总结输出是可读文本。
 */
export type ProofreadStreamStage = 'theme' | 'proofread' | 'reduce' | 'review'

/**
 * 主进程 → 渲染进程的流式输出事件。
 * kind = 'chunk'：LLM 增量文本（text 为本次增量）。
 * kind = 'segment'：一个并行分段处理完成（corrections 为该段产出条数）。
 */
export interface ProofreadStreamPayload {
  kind: 'chunk' | 'segment'
  stage: ProofreadStreamStage
  index: number
  label?: string
  text?: string
  corrections?: number
}
