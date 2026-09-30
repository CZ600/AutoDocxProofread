/**
 * 预览高亮工具：DocPreview.vue 与 Proof.vue 共用，收敛原先各持一份的
 * highlightCorrections/wrapPreviewRange 拷贝（两份仅在"点击高亮的去向"上有差异，
 * 以 onHighlightClick 回调参数化）。
 *
 * 定位/替换的匹配口径见 correctionMatching.js（重复文本按出现次序分配等约定）。
 */

import {
  clearHighlights,
  getDomPositionFromIndex,
  locateCorrectionsInPreview,
  replaceRangeWithSuggested
} from './correctionMatching'
import { correctionTypeCssKey } from '../../shared/correctionTypes'

export const normalizeCorrectionType = type => correctionTypeCssKey(type)

/**
 * 把一个已定位的匹配区间包裹为高亮 span。
 * @param {object} match {segments, start, end, item, index}
 * @param {(index: number) => void} [onHighlightClick] 点击高亮的回调（参数为结果列表下标）
 * @returns {boolean} 是否包裹成功
 */
export const wrapHighlightRange = (match, onHighlightClick) => {
  const { segments, start, end, item, index } = match
  const startPos = getDomPositionFromIndex(segments, start, false)
  const endPos = getDomPositionFromIndex(segments, end, true)
  if (!startPos || !endPos) return false
  const range = document.createRange()
  range.setStart(startPos.node, startPos.offset)
  range.setEnd(endPos.node, endPos.offset)
  const highlightEl = document.createElement('span')
  const correctionTypeClass = `highlight-type-${normalizeCorrectionType(item.type)}`
  highlightEl.className = `highlight-correction ${correctionTypeClass}`
  highlightEl.dataset.correctionId = item.id || `correction-${index}`
  if (onHighlightClick) {
    highlightEl.addEventListener('click', () => onHighlightClick(index))
  }
  highlightEl.appendChild(range.extractContents())
  range.insertNode(highlightEl)
  return true
}

/**
 * 为未处理（未应用、未忽略）的校正重建全文高亮：先清掉旧高亮，再定位并包裹。
 * @param {Element} container 预览容器
 * @param {Array} results 校正结果列表（顺序 = 文档顺序）
 * @param {{onHighlightClick?: (index: number) => void, textNodeMap?: object}} [options]
 */
export const highlightCorrections = (container, results, options = {}) => {
  if (!container) return
  clearHighlights(container)
  const pendingCorrections = (results || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.applied && !item.rejected)
  if (pendingCorrections.length === 0) return
  const { matches, segments } = locateCorrectionsInPreview(container, pendingCorrections, options.textNodeMap)
  matches
    .map(match => ({ ...match, segments }))
    .sort((a, b) => b.start - a.start)
    .forEach(match => {
      wrapHighlightRange(match, options.onHighlightClick)
    })
}

/**
 * 原位移除单条校正的高亮 span（忽略建议时使用）。
 * 按 data-correction-id 精确查找，不做文本定位，因此对脚注等复杂段落同样安全；
 * 找不到（该条本就未成功定位高亮）返回 false，调用方可回退整篇重建。
 * @returns {boolean} 是否找到并移除
 */
export const unwrapHighlight = (container, correctionId) => {
  if (!container || !correctionId) return false
  const el = container.querySelector(`.highlight-correction[data-correction-id="${correctionId}"]`)
  if (!el) return false
  const parent = el.parentNode
  if (!parent) return false
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el)
  }
  parent.removeChild(el)
  parent.normalize()
  return true
}

/**
 * 单趟完成「替换 targets + 重高亮其余 pending」：只做一次全文定位。
 * targets 与 pending 都是 {item, index} 列表（顺序 = 文档顺序），合并定位使重复
 * 文本按同一约定分配出现位置；随后按 start 降序一趟处理——targets 区间替换为
 * 建议文本，pending 区间包裹高亮。降序处理保证前面的区间坐标不受影响，
 * 相比旧流程（替换定位一遍 + 重高亮再定位一遍）省去一次 O(全文) 的遍历。
 *
 * @returns {{replacedCount: number, targetReplaced: Set<object>}} 替换成功的条数与命中情况
 */
export const applyAndHighlightCorrections = (container, targets, pending, onHighlightClick) => {
  const targetList = targets || []
  const pendingList = pending || []
  const result = { replacedCount: 0, targetReplaced: new Set() }
  if (!container || (targetList.length === 0 && pendingList.length === 0)) return result
  clearHighlights(container)
  // 合并后必须按结果列表下标排序再定位：重复文本按"列表顺序=文档顺序"
  // 先到先得分配出现位置，targets 不能抢占列表中更早条目的出现位置
  const merged = [...targetList, ...pendingList].sort((a, b) => a.index - b.index)
  const { matches, segments } = locateCorrectionsInPreview(container, merged)
  const targetSet = new Set(targetList.map(({ item }) => item))
  matches
    .map(match => ({ ...match, segments }))
    .sort((a, b) => b.start - a.start)
    .forEach(match => {
      if (targetSet.has(match.item)) {
        if (replaceRangeWithSuggested(container, segments, match)) {
          result.replacedCount += 1
          result.targetReplaced.add(match.item)
        }
      } else {
        wrapHighlightRange(match, onHighlightClick)
      }
    })
  container.normalize()
  return result
}
