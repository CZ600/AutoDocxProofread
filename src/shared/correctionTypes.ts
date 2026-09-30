/**
 * 校对错误类型：全应用唯一的类型清单与口径（批次 9 收敛）。
 *
 * 8 个规范英文 key 与 i18n 的 proof.correctionTypes.* 一一对应；
 * LLM 可能返回的中文/大小写变体类型名经 canonicalCorrectionType 归一，
 * 历史 CSS 里 .highlight-type-错别字 这类中文类名依赖就此消除——
 * type-*/category-*/highlight-type-* 的色板唯一维护在 common.css。
 *
 * 注意：结果数据里存储的 type 保持 LLM 原值不改写，仅在展示、分组、
 * CSS 类名三处消费时归一，保证与历史库数据兼容。
 */

export type CorrectionTypeKey =
  | 'Typo'
  | 'Punctuation'
  | 'Grammar'
  | 'Consistency'
  | 'wordError'
  | 'ComprehensiveError'
  | 'polish'
  | 'reduceAI'

/** 变体名（小写比较）→ 规范 key：覆盖 LLM 实测返回过的中英文别名（与原 CSS 中文类名一致） */
const CANONICAL_TYPES: Record<string, CorrectionTypeKey> = {
  typo: 'Typo',
  错别字: 'Typo',
  punctuation: 'Punctuation',
  标点: 'Punctuation',
  grammar: 'Grammar',
  语法: 'Grammar',
  consistency: 'Consistency',
  一致性: 'Consistency',
  worderror: 'wordError',
  comprehensiveerror: 'ComprehensiveError',
  综合错误: 'ComprehensiveError',
  polish: 'polish',
  润色建议: 'polish',
  reduceai: 'reduceAI',
  ai率降低: 'reduceAI'
}

const LABEL_KEYS: Record<CorrectionTypeKey, string> = {
  Typo: 'proof.correctionTypes.Typo',
  Punctuation: 'proof.correctionTypes.Punctuation',
  Grammar: 'proof.correctionTypes.Grammar',
  Consistency: 'proof.correctionTypes.Consistency',
  wordError: 'proof.correctionTypes.wordError',
  ComprehensiveError: 'proof.correctionTypes.ComprehensiveError',
  polish: 'proof.correctionTypes.polish',
  reduceAI: 'proof.correctionTypes.reduceAI'
}

/** 任意类型名 → 规范英文 key；未知类型 trim 后原样返回 */
export const canonicalCorrectionType = (type: unknown): string => {
  const raw = String(type ?? '').trim()
  return CANONICAL_TYPES[raw.toLowerCase()] ?? raw
}

/** 类型 → CSS 类后缀（小写英文 key）：type-*/category-*/highlight-type-* 统一用 */
export const correctionTypeCssKey = (type: unknown): string =>
  canonicalCorrectionType(type).toLowerCase()

/** 类型 → 展示名；t 为 vue-i18n 翻译函数，未知类型原样展示（与旧 typeMap[type] || type 一致） */
export const correctionTypeLabel = (type: unknown, t: (key: string) => string): string => {
  const canonical = canonicalCorrectionType(type)
  return canonical in LABEL_KEYS ? t(LABEL_KEYS[canonical as CorrectionTypeKey]) : canonical
}
