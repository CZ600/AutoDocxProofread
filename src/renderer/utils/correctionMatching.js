/**
 * 校对结果在预览 DOM 中的定位与替换工具。
 *
 * Proof.vue 与 DocPreview.vue 共用此模块，避免两份拷贝逻辑漂移
 * （此前 DocPreview 的匹配器感知脚注/公式占位符，Proof 的不感知）。
 *
 * 重复文本定位约定：校正列表的顺序与文档顺序一致（校对流程按章节/句子
 * 顺序汇总结果），因此同一 original 文本的第 k 条校正按"先到先得"分配给
 * 文档中第 k 次出现——高亮、单条替换、批量替换、导出回写均遵守同一约定。
 */

export const FOOTNOTE_PLACEHOLDER_RE = /\[\[FOOTNOTE_REF:\d+\]\]/g
export const MATH_PLACEHOLDER_RE = /\[\[MATH:[\s\S]*?\]\]/g

/**
 * 零宽字符集：U+200B (零宽空格)、U+200C (零宽非连接符)、
 * U+200D (零宽连接符)、U+FEFF (BOM/零宽不换行空格)。
 *
 * 这些字符肉眼不可见，但会干扰匹配：
 * - docx-edit 抽取公式占位符 [[MATH:...]] 时常把 OMML 边界的零宽字符带进段落文本
 * - JS 的 \s 不包含 U+200B-200D/FEFF，转义时不会被 \s+ 吸收，会被原样烧进正则
 * - docx-preview 渲染 DOM 时通常不保留这些零宽字符
 * 三者叠加会导致带公式的段落匹配静默失败。
 */
export const ZERO_WIDTH_CHARS_RE = /[\u200B-\u200D\uFEFF]/g

/** 剥离所有零宽字符 */
export const stripZeroWidth = text => (text || '').replace(ZERO_WIDTH_CHARS_RE, '')

/**
 * strip 掉脚注/公式占位符。suggested 文本写入 DOM 前必须调用：
 * 占位符在渲染后的文档里不存在（脚注是上标数字，公式是 MathML 节点）。
 */
export const stripFootnotePlaceholders = text => {
  return stripZeroWidth(text.replace(FOOTNOTE_PLACEHOLDER_RE, '').replace(MATH_PLACEHOLDER_RE, ''))
}

/**
 * 构建脚注和公式感知的匹配正则。
 * 将 [[FOOTNOTE_REF:x]] 占位符替换为 \d* 通配符，
 * 将 [[MATH:...]] 占位符替换为 .*? 通配符，
 * 使正则能容忍 DOM 中 docx-preview 渲染出的实际内容。
 *
 * 例：original = "文本[[FOOTNOTE_REF:0]]内容[[MATH:C]]结尾"
 *     → 正则 /文本\d*内容.*?结尾/
 *     DOM fullText = "文本1内容C结尾" → 匹配成功 ✓
 */
export const createFootnoteAwareMatcher = (searchText, flags = 'g') => {
  // 先剥离零宽字符，避免它们被当作字面字符烧进正则。
  // 这些字符在 docx-preview 渲染的 DOM 中通常不存在，会直接导致匹配失败。
  const cleanedSearch = stripZeroWidth(searchText)
  // 先用统一分隔符拆分，同时处理 [[FOOTNOTE_REF:x]] 和 [[MATH:...]]
  // （[\s\S] 使公式文本含换行时也能拆开）
  const parts = cleanedSearch.split(/\[\[FOOTNOTE_REF:\d+\]\]|\[\[MATH:[\s\S]*?\]\]/)
  const escapedParts = parts.map(part =>
    part
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 除常规空白外，也吞掉零宽字符，使正则对它们完全不敏感
      .replace(/[\s\u200B-\u200D\uFEFF]+/g, '\\s*')
  )

  // 统计占位符出现顺序，确定每个间隙用什么通配符
  // （在剥离零宽后的文本上扫描，与上面的 split 保持同一来源）
  const placeholderPattern = /\[\[FOOTNOTE_REF:\d+\]\]|\[\[MATH:[\s\S]*?\]\]/g
  const wildcards = []
  let m
  while ((m = placeholderPattern.exec(cleanedSearch)) !== null) {
    if (m[0].startsWith('[[FOOTNOTE_REF:')) {
      // 脚注引用在 DOM 中渲染为上标数字
      wildcards.push('\\d*')
    } else {
      // 公式渲染为 MathML，其文本内容是 m:t 的拼接——结构分数、上下标等
      // 元素间常出现空格，必须允许跨空格匹配，否则高亮静默失败
      wildcards.push('[\\s\\S]*?')
    }
  }

  let pattern = ''
  for (let i = 0; i < escapedParts.length; i++) {
    pattern += escapedParts[i]
    if (i < wildcards.length) {
      pattern += wildcards[i]
    }
  }

  if (!pattern) return null
  return new RegExp(pattern, flags)
}

export const clearHighlights = container => {
  const existingHighlights = container.querySelectorAll('.highlight-correction')
  existingHighlights.forEach(el => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el)
    }
    parent.removeChild(el)
    parent.normalize()
  })
}

export const buildTextNodeMap = container => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const segments = []
  let fullText = ''
  let currentOffset = 0
  let node
  while ((node = walker.nextNode())) {
    const text = node.textContent || ''
    if (!text) continue
    segments.push({
      node,
      start: currentOffset,
      end: currentOffset + text.length
    })
    fullText += text
    currentOffset += text.length
  }
  return { fullText, segments }
}

export const getDomPositionFromIndex = (segments, targetIndex, preferEnd = false) => {
  if (segments.length === 0) return null
  if (targetIndex <= 0) {
    return { node: segments[0].node, offset: 0 }
  }
  const lastSegment = segments[segments.length - 1]
  if (targetIndex >= lastSegment.end) {
    return {
      node: lastSegment.node,
      offset: lastSegment.node.textContent.length
    }
  }
  for (const segment of segments) {
    if (preferEnd) {
      if (targetIndex >= segment.start && targetIndex <= segment.end) {
        return {
          node: segment.node,
          offset: Math.min(targetIndex - segment.start, segment.node.textContent.length)
        }
      }
    } else if (targetIndex >= segment.start && targetIndex < segment.end) {
      return {
        node: segment.node,
        offset: targetIndex - segment.start
      }
    }
  }
  return null
}

export const rangesOverlap = (left, right) => !(left.end <= right.start || left.start >= right.end)

/**
 * 在预览 DOM 中定位一组校正（先到先得占用，不重叠）。
 * @param {Element} container 预览容器
 * @param {Array<{item: object, index: number}>} corrections 校正与它在结果列表中的下标
 * @returns {{matches: Array<{item, index, start, end}>, segments}} segments 供调用方换算 DOM 位置
 */
export const locateCorrectionsInPreview = (container, corrections) => {
  const { fullText, segments } = buildTextNodeMap(container)
  const occupiedRanges = []
  const matches = []
  corrections.forEach(({ item, index }) => {
    const originalText = item.original?.trim() || ''
    if (!originalText) return
    const regex = createFootnoteAwareMatcher(originalText)
    if (!regex) return
    let match
    while ((match = regex.exec(fullText))) {
      const start = match.index
      const end = start + match[0].length
      const range = { start, end }
      if (!occupiedRanges.some(existing => rangesOverlap(existing, range))) {
        occupiedRanges.push(range)
        matches.push({
          index,
          item,
          start,
          end
        })
        break
      }
      if (match[0].length === 0) {
        regex.lastIndex += 1
      }
    }
  })
  return { matches, segments }
}

/**
 * 用指定的 DOM 区间把原文替换为建议文本（供批量替换按降序逐个调用）。
 * 所有匹配共享同一次 buildTextNodeMap 的 segments 时，必须按 start 降序
 * 处理：后面的替换只影响更靠后的文本节点，前面匹配的位置仍然有效。
 */
export const replaceRangeWithSuggested = (container, segments, match) => {
  const startPos = getDomPositionFromIndex(segments, match.start, false)
  const endPos = getDomPositionFromIndex(segments, match.end, true)
  if (!startPos || !endPos) return false
  const range = document.createRange()
  range.setStart(startPos.node, startPos.offset)
  range.setEnd(endPos.node, endPos.offset)
  range.deleteContents()
  // suggested 中的 [[FOOTNOTE_REF:x]] / [[MATH:...]] 在 DOM 中不存在，需要 strip
  range.insertNode(document.createTextNode(stripFootnotePlaceholders(match.item.suggested || '')))
  return true
}

/**
 * 在预览中替换单条校正。
 * @param {Element} container 预览容器
 * @param {object} correction 待替换的校正对象（须与 contextList 中的引用一致）
 * @param {Array<{item: object, index: number}>} [contextList] 参与定位分配的完整上下文
 *   （通常为"全部未处理项 + 本条"）。传入后重复文本按出现次序命中本条对应的位置，
 *   而不是总替换第一处；省略时等价于只有本条参与分配（旧行为）。
 * @returns {boolean} 是否替换成功
 */
export const replaceCorrectionInPreview = (container, correction, contextList) => {
  clearHighlights(container)
  const list = contextList && contextList.length > 0 ? contextList : [{ item: correction, index: 0 }]
  const { matches, segments } = locateCorrectionsInPreview(container, list)
  const match = matches.find(m => m.item === correction) || (list.length === 1 ? matches[0] : null)
  if (!match) return false
  const replaced = replaceRangeWithSuggested(container, segments, match)
  if (replaced) container.normalize()
  return replaced
}

/**
 * 在预览中一次性替换一批校正：只定位一次、按 start 降序统一应用。
 * 相比逐条"定位→替换"，重复文本不会被先前替换改变文本后错误命中。
 * @returns {number} 成功替换的条数
 */
export const applyCorrectionsToPreview = (container, corrections) => {
  if (!container || !corrections || corrections.length === 0) return 0
  clearHighlights(container)
  const { matches, segments } = locateCorrectionsInPreview(container, corrections)
  let replacedCount = 0
  matches
    .map(match => ({ ...match }))
    .sort((a, b) => b.start - a.start)
    .forEach(match => {
      if (replaceRangeWithSuggested(container, segments, match)) {
        replacedCount += 1
      }
    })
  container.normalize()
  return replacedCount
}

/**
 * 在预览中原位撤销已应用的替换（建议文本 → 原文），不触发整篇重渲染。
 * 定位时把"全部仍处于已应用状态的项"（转成 原文=suggested 的反向校正）一并纳入
 * 分配上下文，与应用时的出现次序约定保持一致；只替换 targetItems 中的项。
 * @param {Array<object>} appliedItems 当前已应用的校正（列表顺序 = 文档顺序）
 * @param {Array<object>} targetItems 本次要撤销的子集
 * @returns {number} 成功撤销的条数
 */
export const undoCorrectionsInPreview = (container, appliedItems, targetItems) => {
  if (!container || !appliedItems || appliedItems.length === 0) return 0
  const targets = new Set(targetItems || appliedItems)
  const undoList = appliedItems
    .map((item, index) => {
      const reversed = {
        ...item,
        source: item,
        original: item.suggested || '',
        suggested: item.original || ''
      }
      return { item: reversed, index }
    })
    .filter(({ item }) => item.original.trim())
  if (undoList.length === 0) return 0
  clearHighlights(container)
  const { matches, segments } = locateCorrectionsInPreview(
    container,
    undoList.map(entry => ({ item: entry.item, index: entry.index }))
  )
  let undoneCount = 0
  matches
    .filter(match => targets.has(match.item.source))
    .map(match => ({ ...match }))
    .sort((a, b) => b.start - a.start)
    .forEach(match => {
      if (replaceRangeWithSuggested(container, segments, match)) {
        undoneCount += 1
      }
    })
  container.normalize()
  return undoneCount
}
