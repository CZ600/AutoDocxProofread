/**
 * 校对结果的应用/撤销/忽略动作编排（批次 9 自 DocPreview.vue 迁出）。
 *
 * 纯编排逻辑：预览 DOM 的定位/替换仍由 utils/correctionMatching.js 与
 * utils/highlight.js 承担；本组合式函数持有「哪批目标、何时豁免重渲染、
 * 如何分组」的策略。rerenderAndReapply（整篇重渲染重放）依赖组件内的
 * cachedDocxFile/renderDocx，由调用方作为依赖注入。
 */

import { computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { applyCorrectionsToPreview, undoCorrectionsInPreview } from '../utils/correctionMatching'
import { applyAndHighlightCorrections, highlightCorrections as rebuildPreviewHighlights } from '../utils/highlight'
import { canonicalCorrectionType, correctionTypeLabel } from '../../shared/correctionTypes'

export const useCorrectionActions = (context, deps) => {
  const { previewContainer, proofreadingResults, fileStore, t } = context
  const { rerenderAndReapply } = deps

  const requestSidebarFocus = index => fileStore.requestSidebarFocus(index)

  // 高亮点击 → 请求侧栏聚焦到对应项（反向跳转）
  const highlightCorrections = () => {
    rebuildPreviewHighlights(previewContainer.value, proofreadingResults.value, {
      onHighlightClick: requestSidebarFocus
    })
  }

  const formatCorrectionType = type => correctionTypeLabel(type, t)

  // 类型分组统一走规范英文 key（canonicalCorrectionType 归一）：
  // 中文变体（如「错别字」）与英文 key（Typo）并入同一组
  const availableCategories = computed(() => {
    const types = new Set()
    proofreadingResults.value.forEach(item => {
      if (!item.applied && !item.rejected && item.type) {
        types.add(canonicalCorrectionType(item.type))
      }
    })
    return Array.from(types).map(type => ({
      value: type,
      label: correctionTypeLabel(type, t)
    }))
  })

  const getCategoryCount = type => {
    const count = proofreadingResults.value.filter(
      item => !item.applied && !item.rejected && canonicalCorrectionType(item.type) === type
    ).length
    return t('proof.messages.countItems', { count })
  }

  const applyByCategory = type => {
    const applicableResults = proofreadingResults.value.filter(
      item => !item.applied && !item.rejected && canonicalCorrectionType(item.type) === type
    )
    if (applicableResults.length === 0) {
      ElMessage.warning(t('proof.messages.noPendingInCategory'))
      return
    }
    // 在改动 store 前先取出目标项及其在结果列表中的下标，供单趟定位按
    // "结果顺序=文档顺序"分配重复文本的出现位置
    const targetList = proofreadingResults.value
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.applied && !item.rejected && canonicalCorrectionType(item.type) === type)
    const pendingList = proofreadingResults.value
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.applied && !item.rejected && canonicalCorrectionType(item.type) !== type)
    // 单趟完成「替换目标类型 + 重高亮其余未处理」；预览 DOM 与高亮由本次调用
    // 一次就位，置双豁免标记跳过两侧侦听的整篇重渲染/整列表重高亮
    const container = previewContainer.value
    const { replacedCount } = container
      ? applyAndHighlightCorrections(container, targetList, pendingList, requestSidebarFocus)
      : { replacedCount: 0 }
    fileStore.requestSkipResultRerender()
    fileStore.requestSkipResultRehighlight()
    const newResults = proofreadingResults.value.map(item => {
      if (!item.applied && canonicalCorrectionType(item.type) === type) {
        return { ...item, applied: true }
      }
      return item
    })
    proofreadingResults.value = newResults
    const typeLabel = formatCorrectionType(type)
    if (replacedCount === applicableResults.length) {
      ElMessage.success(t('proof.messages.appliedAllOfType', { typeLabel }))
    } else {
      ElMessage.warning(
        t('proof.messages.appliedPartialOfType', { replaced: replacedCount, total: applicableResults.length, typeLabel })
      )
    }
  }

  const applyALLCorrection = () => {
    const applicableResults = proofreadingResults.value.filter(item => !item.applied && !item.rejected)
    if (applicableResults.length === 0) {
      ElMessage.warning(t('proof.messages.noPendingChanges'))
      return
    }
    const targetList = proofreadingResults.value
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.applied && !item.rejected)
    // 全部应用后没有剩余未处理项，无高亮需要重建，单趟定位替换即可
    const container = previewContainer.value
    const { replacedCount } = container
      ? applyAndHighlightCorrections(container, targetList, [])
      : { replacedCount: 0 }
    fileStore.requestSkipResultRerender()
    fileStore.requestSkipResultRehighlight()
    const newResults = proofreadingResults.value.map(item => ({ ...item, applied: true }))
    proofreadingResults.value = newResults
    if (replacedCount === targetList.length) {
      ElMessage.success(t('proof.messages.appliedAll'))
    } else {
      ElMessage.warning(t('proof.messages.appliedPartial', { replaced: replacedCount, total: applicableResults.length }))
    }
  }

  const appliedCategories = computed(() => {
    const types = new Set()
    proofreadingResults.value.forEach(item => {
      if (item.applied && item.type) {
        types.add(canonicalCorrectionType(item.type))
      }
    })
    return Array.from(types).map(type => ({
      value: type,
      label: correctionTypeLabel(type, t)
    }))
  })

  const getAppliedCategoryCount = type => {
    const count = proofreadingResults.value.filter(
      item => item.applied && canonicalCorrectionType(item.type) === type
    ).length
    return t('proof.messages.countItems', { count })
  }

  const undoByCategory = async type => {
    const appliedResults = proofreadingResults.value.filter(
      item => item.applied && canonicalCorrectionType(item.type) === type
    )
    if (appliedResults.length === 0) {
      ElMessage.warning(t('proof.messages.noAppliedChanges'))
      return
    }
    // 原位撤销：把建议文本替换回原文，避免整篇重渲染
    const container = previewContainer.value
    const appliedItems = proofreadingResults.value.filter(item => item.applied)
    const undone = container ? undoCorrectionsInPreview(container, appliedItems, appliedResults) : 0
    // DOM 重建方已确定（原位 + 手动重高亮 / 下方整篇重渲染兜底），
    // 双豁免让两侧 results 侦听不重复重建
    fileStore.requestSkipResultRerender()
    fileStore.requestSkipResultRehighlight()
    const newResults = proofreadingResults.value.map(item => {
      if (item.applied && canonicalCorrectionType(item.type) === type) {
        return { ...item, applied: false }
      }
      return item
    })
    proofreadingResults.value = newResults
    if (undone !== appliedResults.length) {
      // 原位撤销不完整（定位失败等），整篇重渲染并重放剩余已应用项兜底
      await rerenderAndReapply()
    } else {
      highlightCorrections()
    }
    ElMessage.success(t('proof.messages.undoAllSuccess'))
  }

  const undoAllCorrections = async () => {
    const appliedResults = proofreadingResults.value.filter(item => item.applied)
    if (appliedResults.length === 0) {
      ElMessage.warning(t('proof.messages.noAppliedChanges'))
      return
    }
    // 原位撤销：把建议文本替换回原文，避免整篇重渲染
    const container = previewContainer.value
    const appliedItems = proofreadingResults.value.filter(item => item.applied)
    const undone = container ? undoCorrectionsInPreview(container, appliedItems, appliedResults) : 0
    // DOM 重建方已确定（原位 + 手动重高亮 / 下方整篇重渲染兜底），
    // 双豁免让两侧 results 侦听不重复重建
    fileStore.requestSkipResultRerender()
    fileStore.requestSkipResultRehighlight()
    const newResults = proofreadingResults.value.map(item => ({ ...item, applied: false }))
    proofreadingResults.value = newResults
    if (undone !== appliedResults.length) {
      await rerenderAndReapply()
    } else {
      highlightCorrections()
    }
    ElMessage.success(t('proof.messages.undoAllSuccess'))
  }

  // results 变化的兜底重渲染：原位操作已自行维护好预览 DOM 时被豁免标记跳过
  watch(
    () => fileStore.results,
    async newResults => {
      if (fileStore.consumeSkipResultRerender()) return
      if (newResults.length > 0) {
        // 重新渲染文档再高亮，与重启时 onMounted 行为一致。
        // 直接在旧 DOM 上高亮可能导致含脚注段落的 DOM 结构不一致而匹配失败。
        await rerenderAndReapply()
      }
    }
  )

  return {
    highlightCorrections,
    formatCorrectionType,
    availableCategories,
    getCategoryCount,
    applyByCategory,
    applyALLCorrection,
    appliedCategories,
    getAppliedCategoryCount,
    undoByCategory,
    undoAllCorrections
  }
}
