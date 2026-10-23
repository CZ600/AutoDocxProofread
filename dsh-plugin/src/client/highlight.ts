/**
 * 预览高亮工具（dsh 客户端移植版）。
 *
 * 移植自 src/renderer/utils/highlight.js，只保留只读高亮路径
 * （wrapHighlightRange / highlightCorrections）；应用/撤销类函数未移植。
 * 类型归一表移植自 src/shared/correctionTypes.ts（仅 CSS key 部分）。
 */

import {
  clearHighlights,
  getDomPositionFromIndex,
  locateCorrectionsInPreview,
  CorrectionItem,
  TextSegment,
} from './correctionMatching'

const CANONICAL_TYPES: Record<string, string> = {
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
  ai率降低: 'reduceAI',
}

/** 任意 LLM 返回的类型名 → 高亮 CSS 类后缀（小写英文 key）；未知类型原样小写 */
export const correctionTypeCssKey = (type: unknown): string => {
  const raw = String(type ?? '').trim()
  return (CANONICAL_TYPES[raw.toLowerCase()] ?? raw).toLowerCase()
}

/** 把一个已定位的匹配区间包裹为高亮 span（带 data-correction-id 供滚动定位）。 */
export const wrapHighlightRange = (
  match: { segments: TextSegment[]; start: number; end: number; item: CorrectionItem; index: number },
  onHighlightClick?: (index: number) => void
): boolean => {
  const { segments, start, end, item, index } = match
  const startPos = getDomPositionFromIndex(segments, start, false)
  const endPos = getDomPositionFromIndex(segments, end, true)
  if (!startPos || !endPos) return false
  const range = document.createRange()
  range.setStart(startPos.node, startPos.offset)
  range.setEnd(endPos.node, endPos.offset)
  const highlightEl = document.createElement('span')
  highlightEl.className = `highlight-correction highlight-type-${correctionTypeCssKey(item.type)}`
  highlightEl.dataset.correctionId = item.id || `correction-${index}`
  if (onHighlightClick) {
    highlightEl.addEventListener('click', () => onHighlightClick(index))
  }
  highlightEl.appendChild(range.extractContents())
  range.insertNode(highlightEl)
  return true
}

/** 为全部校正重建高亮：先清旧，再定位，按 start 降序包裹（前面的坐标不受影响）。 */
export const highlightCorrections = (
  container: Element,
  results: CorrectionItem[],
  options: { onHighlightClick?: (index: number) => void } = {}
): void => {
  if (!container) return
  clearHighlights(container)
  const pending = (results || []).map((item, index) => ({ item, index })).filter(({ item }) => !item.filtered)
  if (pending.length === 0) return
  const { matches, segments } = locateCorrectionsInPreview(container, pending)
  matches
    .map(match => ({ ...match, segments }))
    .sort((a, b) => b.start - a.start)
    .forEach(match => wrapHighlightRange(match, options.onHighlightClick))
}
