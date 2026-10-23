/**
 * 校对结果在预览 DOM 中的定位工具（dsh 客户端移植版）。
 *
 * 移植自 src/renderer/utils/correctionMatching.js，仅保留"只读高亮"所需的
 * 函数；替换/撤销类函数（replaceRangeWithSuggested / applyCorrectionsToPreview /
 * undoCorrectionsInPreview）未移植——dsh 插件的修改一律走 apply_corrections 工具。
 *
 * 重复文本定位约定（与 wordProcess.ts 回写规则同源，不可漂移）：
 * 校正列表顺序与文档顺序一致，同一 original 文本的第 k 条校正按"先到先得"
 * 分配给文档中第 k 次出现。
 */

export const ZERO_WIDTH_CHARS_RE = /[\u200B-\u200D\uFEFF]/g

/** 剥离所有零宽字符（U+200B-200D/FEFF 不被 \s 吸收，烧进正则会导致带公式段落静默失配） */
export const stripZeroWidth = (text: string | undefined | null): string =>
  (text || '').replace(ZERO_WIDTH_CHARS_RE, '')

/**
 * 构建脚注和公式感知的匹配正则：
 * [[FOOTNOTE_REF:x]] → \d*（DOM 中渲染为上标数字），
 * [[MATH:...]] → [\s\S]*?（渲染为 MathML，元素间常出现空格）。
 */
export const createFootnoteAwareMatcher = (searchText: string, flags = 'g'): RegExp | null => {
  const cleanedSearch = stripZeroWidth(searchText)
  const parts = cleanedSearch.split(/\[\[FOOTNOTE_REF:\d+\]\]|\[\[MATH:[\s\S]*?\]\]/)
  const escapedParts = parts.map(part =>
    part
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/[\s\u200B-\u200D\uFEFF]+/g, '\\s*')
  )

  const placeholderPattern = /\[\[FOOTNOTE_REF:\d+\]\]|\[\[MATH:[\s\S]*?\]\]/g
  const wildcards: string[] = []
  let m: RegExpExecArray | null
  while ((m = placeholderPattern.exec(cleanedSearch)) !== null) {
    wildcards.push(m[0].startsWith('[[FOOTNOTE_REF:') ? '\\d*' : '[\\s\\S]*?')
  }

  let pattern = ''
  for (let i = 0; i < escapedParts.length; i++) {
    pattern += escapedParts[i]
    if (i < wildcards.length) pattern += wildcards[i]
  }
  if (!pattern) return null
  return new RegExp(pattern, flags)
}

export const clearHighlights = (container: Element): void => {
  container.querySelectorAll('.highlight-correction').forEach(el => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
    parent.normalize()
  })
}

export interface TextSegment {
  node: Text
  start: number
  end: number
}

export const buildTextNodeMap = (container: Element): { fullText: string; segments: TextSegment[] } => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const segments: TextSegment[] = []
  let fullText = ''
  let currentOffset = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.textContent || ''
    if (!text) continue
    segments.push({ node: node as Text, start: currentOffset, end: currentOffset + text.length })
    fullText += text
    currentOffset += text.length
  }
  return { fullText, segments }
}

export const getDomPositionFromIndex = (
  segments: TextSegment[],
  targetIndex: number,
  preferEnd = false
): { node: Text; offset: number } | null => {
  if (segments.length === 0) return null
  if (targetIndex <= 0) return { node: segments[0].node, offset: 0 }
  const lastSegment = segments[segments.length - 1]
  if (targetIndex >= lastSegment.end) {
    return { node: lastSegment.node, offset: lastSegment.node.textContent?.length ?? 0 }
  }
  for (const segment of segments) {
    if (preferEnd) {
      if (targetIndex >= segment.start && targetIndex <= segment.end) {
        return {
          node: segment.node,
          offset: Math.min(targetIndex - segment.start, segment.node.textContent?.length ?? 0),
        }
      }
    } else if (targetIndex >= segment.start && targetIndex < segment.end) {
      return { node: segment.node, offset: targetIndex - segment.start }
    }
  }
  return null
}

export const rangesOverlap = (left: { start: number; end: number }, right: { start: number; end: number }): boolean =>
  !(left.end <= right.start || left.start >= right.end)

export interface CorrectionItem {
  original: string
  suggested?: string
  reason?: string
  type?: string
  id?: string
  filtered?: boolean
}

export interface LocatedMatch {
  item: CorrectionItem
  index: number
  start: number
  end: number
}

/** 在预览 DOM 全文中定位一组校正（先到先得占用、区间不重叠）。 */
export const locateCorrectionsInPreview = (
  container: Element,
  corrections: { item: CorrectionItem; index: number }[],
  textNodeMap?: { fullText: string; segments: TextSegment[] }
): { matches: LocatedMatch[]; segments: TextSegment[] } => {
  const { fullText, segments } = textNodeMap || buildTextNodeMap(container)
  const occupiedRanges: { start: number; end: number }[] = []
  const matches: LocatedMatch[] = []
  corrections.forEach(({ item, index }) => {
    const originalText = item.original?.trim() || ''
    if (!originalText) return
    const regex = createFootnoteAwareMatcher(originalText)
    if (!regex) return
    let match: RegExpExecArray | null
    while ((match = regex.exec(fullText))) {
      const start = match.index
      const end = start + match[0].length
      if (!occupiedRanges.some(existing => rangesOverlap(existing, { start, end }))) {
        occupiedRanges.push({ start, end })
        matches.push({ item, index, start, end })
        break
      }
      if (match[0].length === 0) regex.lastIndex += 1
    }
  })
  return { matches, segments }
}
