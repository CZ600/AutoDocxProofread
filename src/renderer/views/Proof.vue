<template>
  <div class="proof-results-panel">
    <div v-if="proofreadingResults.length > 0" class="results-container">
      <el-collapse v-model="activeNames">
        <el-collapse-item
          v-for="(item, index) in proofreadingResults"
          :id="`error-item-${index}`"
          :key="index"
          :name="index"
          :class="[`correction-item type-${correctionTypeCssKey(item.type)}`, { 'correction-item-rejected': item.rejected }]"
        >
          <template #title>
            <div class="correction-header" @click="scrollPreviewToCorrection(index)">
              <span class="correction-type" :class="`type-${correctionTypeCssKey(item.type)}`">
                {{ formatCorrectionType(item.type) }}
              </span>
              <span v-if="item.rejected" class="correction-rejected-tag">{{ t('proof.rejectedTag') }}</span>
              <el-icon v-if="item.applied" class="correction-applied-check" :title="t('proof.appliedTag')">
                <Check />
              </el-icon>
              <span class="correction-count">{{ index + 1 }}/{{ proofreadingResults.length }}</span>
            </div>
          </template>

          <div class="correction-content">
            <div class="original">
              <strong>{{ t('proof.original') }}</strong> {{ item.original || t('proof.noData') }}
            </div>
            <div class="suggested">
              <strong>{{ t('proof.suggested') }}</strong>
              <el-tag v-if="item.edited" size="small" type="info" class="edited-tag">{{ t('proof.editedTag') }}</el-tag>
              <template v-if="editingIndex === index">
                <el-input
                  v-model="editingText"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 8 }"
                  class="suggested-editor"
                  @click.stop
                />
                <div class="edit-actions">
                  <el-button size="small" type="primary" @click.stop="saveEdit(index)">
                    {{ t('proof.saveEdit') }}
                  </el-button>
                  <el-button size="small" @click.stop="cancelEdit">
                    {{ t('proof.cancelEdit') }}
                  </el-button>
                </div>
              </template>
              <template v-else>
                <span class="suggested-text">{{ item.suggested || t('proof.noData') }}</span>
                <el-icon
                  v-if="!item.applied"
                  class="edit-icon"
                  :title="t('proof.editSuggested')"
                  @click.stop="startEdit(index)"
                >
                  <EditPen />
                </el-icon>
              </template>
            </div>
            <div class="reason">
              <strong>{{ t('proof.reason') }}</strong> {{ item.reason || t('proof.noData') }}
            </div>
            <div class="actions">
              <el-button
                v-if="!item.applied && !item.rejected"
                type="primary"
                size="small"
                @click.stop="applyCorrection(index)"
              >
                {{ t('proof.applyChanges') }}
              </el-button>
              <el-button v-if="item.applied" type="warning" size="small" @click.stop="undoCorrection(index)">
                {{ t('proof.undo') }}
              </el-button>
              <el-button
                v-if="!item.applied && !item.rejected"
                type="info"
                size="small"
                plain
                @click.stop="ignoreCorrection(index)"
              >
                {{ t('proof.ignore') }}
              </el-button>
              <el-button v-if="item.rejected" type="info" size="small" @click.stop="unignoreCorrection(index)">
                {{ t('proof.unignore') }}
              </el-button>
              <el-popover
                v-if="item.References && item.References.length > 0"
                placement="bottom-start"
                width="500px"
                trigger="click"
                popper-class="reference-popover"
              >
                <template #reference>
                  <el-button type="primary" size="small" style="margin-left: 8px" @click.stop>
                    {{ t('proof.viewReference') }}
                  </el-button>
                </template>

                <div class="reference-content">
                  <h4>{{ t('proof.referenceContent') }}</h4>
                  <div class="reference-list">
                    <div v-for="(reference, refIndex) in item.References" :key="refIndex" class="reference-item">
                      <span class="reference-index">{{ refIndex + 1 }}.</span>
                      <span class="reference-text">{{ reference }}</span>
                    </div>
                  </div>
                </div>
              </el-popover>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <div v-else class="no-results">
      <el-empty :description="fileName ? t('proof.noResults') : t('proof.selectDocToProof')" :image-size="60" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { ElButton, ElEmpty, ElCollapse, ElCollapseItem, ElInput, ElMessage, ElPopover, ElTag } from 'element-plus'
import { Check, EditPen } from '@element-plus/icons-vue'

import { scrollTo } from 'vue-scrollto'
import { fileInfoStore } from '../stores/store'
import { undoCorrectionsInPreview } from '../utils/correctionMatching'
import {
  applyAndHighlightCorrections,
  highlightCorrections as rebuildPreviewHighlights,
  unwrapHighlight
} from '../utils/highlight'
import { forceVisibleSection } from '../utils/previewPerf'
import { correctionTypeCssKey, correctionTypeLabel } from '../../shared/correctionTypes'

const previewContainer = inject('previewContainer')
const fileStore = fileInfoStore()
const fileName = computed(() => fileStore.fileName)
const proofreadingResults = computed({
  get: () => fileStore.results,
  set: val => fileStore.setCorrectResult(val)
})
const activeNames = ref([])
let previewFocusTimer = null
// 平滑滚动后恢复 content-visibility 的延迟句柄：组件卸载时需要清理
let restoreVisibilityTimer = null

// ---- 建议文本编辑 ----
const editingIndex = ref(-1)
const editingText = ref('')

const startEdit = index => {
  const item = proofreadingResults.value[index]
  if (!item || item.applied) return
  editingIndex.value = index
  editingText.value = item.suggested || ''
}

const cancelEdit = () => {
  editingIndex.value = -1
  editingText.value = ''
}

const saveEdit = index => {
  const text = editingText.value
  if (!text.trim()) {
    ElMessage.warning(t('proof.messages.editEmpty'))
    return
  }
  const item = proofreadingResults.value[index]
  if (!item) return
  if (text === item.suggested) {
    cancelEdit()
    return
  }
  // 编辑只改侧栏展示的建议文本；未应用建议的原文在预览中原样存在，预览 DOM
  // 无需任何改动，双豁免跳过整篇重渲染与整列表重高亮（编辑入口已挡掉已应用项）
  fileStore.requestSkipResultRerender()
  fileStore.requestSkipResultRehighlight()
  const newResults = [...proofreadingResults.value]
  newResults[index] = { ...newResults[index], suggested: text, edited: true }
  proofreadingResults.value = newResults
  cancelEdit()
  ElMessage.success(t('proof.messages.editSaved'))
}

// ---- 忽略 / 恢复 ----
const ignoreCorrection = index => {
  const item = proofreadingResults.value[index]
  if (!item) return
  // 原位移除对应高亮：按 data-correction-id 精确查找、不做文本定位，
  // 脚注等复杂段落同样安全；移除失败（该条本就未定位到高亮）则不豁免，
  // 由侦听方整篇重渲染兜底
  const container = previewContainer.value
  const removed = container ? unwrapHighlight(container, item.id || `correction-${index}`) : false
  if (removed) {
    fileStore.requestSkipResultRerender()
    fileStore.requestSkipResultRehighlight()
  }
  const newResults = [...proofreadingResults.value]
  newResults[index] = { ...newResults[index], rejected: true, applied: false }
  proofreadingResults.value = newResults
  if (editingIndex.value === index) cancelEdit()
  ElMessage.info(t('proof.messages.ignored'))
}

const unignoreCorrection = index => {
  const item = proofreadingResults.value[index]
  if (!item) return
  // 恢复后该条要重新参与高亮，必须用改动后的 results 重建（本条要算进
  // 未处理列表参与出现次序分配）：豁免两侧侦听后手动重建一次高亮，
  // 只重建高亮、不重渲染文档
  fileStore.requestSkipResultRerender()
  fileStore.requestSkipResultRehighlight()
  const newResults = [...proofreadingResults.value]
  newResults[index] = { ...newResults[index], rejected: false }
  proofreadingResults.value = newResults
  highlightCorrections()
  ElMessage.success(t('proof.messages.unignored'))
}

const formatCorrectionType = type => correctionTypeLabel(type, t)

// 高亮重建收敛到 utils/highlight.js（与右侧预览共用同一实现）；
// 本列表的高亮点击回到侧栏聚焦
const highlightCorrections = () => {
  rebuildPreviewHighlights(previewContainer.value, proofreadingResults.value, {
    onHighlightClick: scrollToCorrectionItem
  })
}

const scrollToCorrectionItem = index => {
  if (index === -1) return
  activeNames.value = [index]
  nextTick(() => {
    scrollTo(`#error-item-${index}`, {
      container: '.results-container',
      duration: 500,
      offset: -350,
      easing: 'ease-in-out',
      force: true
    })
    focusSidebarItem(index)
  })
}

const focusSidebarItem = index => {
  const itemEl = document.querySelector(`#error-item-${index}`)
  if (!itemEl) return
  if (previewFocusTimer) {
    clearTimeout(previewFocusTimer)
    previewFocusTimer = null
  }
  itemEl.classList.remove('correction-item-focused')
  void itemEl.offsetWidth
  itemEl.classList.add('correction-item-focused')
  previewFocusTimer = setTimeout(() => {
    itemEl.classList.remove('correction-item-focused')
    previewFocusTimer = null
  }, 2800)
}

const findHighlightElement = correctionId => {
  const container = previewContainer.value
  if (!container || !correctionId) return null
  return container.querySelector(`.highlight-correction[data-correction-id="${correctionId}"]`)
}

const focusPreviewHighlight = highlightEl => {
  if (!highlightEl) return
  if (previewFocusTimer) {
    clearTimeout(previewFocusTimer)
    previewFocusTimer = null
  }
  highlightEl.classList.remove('highlight-correction-focused')
  void highlightEl.offsetWidth
  highlightEl.classList.add('highlight-correction-focused')
  previewFocusTimer = setTimeout(() => {
    highlightEl.classList.remove('highlight-correction-focused')
    previewFocusTimer = null
  }, 2800)
}

const scrollPreviewToCorrection = index => {
  const container = previewContainer.value
  const correction = proofreadingResults.value[index]
  if (!container || !correction) return false
  const correctionId = correction.id || `correction-${index}`
  const highlightEl = findHighlightElement(correctionId)
  if (!highlightEl) return false
  // content-visibility:auto 的未渲染页面没有布局盒，量取坐标前临时强制可见
  const restoreVisibility = forceVisibleSection(highlightEl)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect()
      const highlightRect = highlightEl.getBoundingClientRect()
      const offsetTop = highlightRect.top - containerRect.top + container.scrollTop
      const targetScrollTop = Math.max(offsetTop - container.clientHeight * 0.35, 0)
      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      })
      focusPreviewHighlight(highlightEl)
      // 平滑滚动结束后恢复按需渲染
      restoreVisibilityTimer = setTimeout(restoreVisibility, 700)
    })
  )
  return true
}

const applyCorrection = index => {
  const target = proofreadingResults.value[index]
  if (!target) return
  // 单趟完成「替换本条 + 重高亮其余未处理」：定位时把全部未处理项与本条
  // 一并纳入分配，重复文本按出现次序命中本条对应的位置（与高亮分配一致），
  // 而不是总替换第一处；相比旧流程省去替换后重高亮的第二次全文定位
  const container = previewContainer.value
  const targetList = [{ item: target, index }]
  const pendingList = proofreadingResults.value
    .map((item, i) => ({ item, index: i }))
    .filter(({ item, index: i }) => !item.applied && !item.rejected && i !== index)
  const { targetReplaced } = container
    ? applyAndHighlightCorrections(container, targetList, pendingList, scrollToCorrectionItem)
    : { targetReplaced: new Set() }
  const updated = targetReplaced.has(target)
  if (updated) {
    // 原位替换成功：预览 DOM 与高亮均已就位，豁免两侧侦听的整篇重建
    fileStore.requestSkipResultRerender()
    fileStore.requestSkipResultRehighlight()
  }
  const newResults = [...proofreadingResults.value]
  newResults[index] = { ...newResults[index], applied: true }
  proofreadingResults.value = newResults
  if (updated) {
    ElMessage.success(t('proof.messages.applied'))
  } else {
    // 原位未命中：不豁免，由预览侧侦听整篇重渲染重放已应用项兜底
    ElMessage.warning(t('proof.messages.notLocatedInPreview'))
  }
}

const undoCorrection = index => {
  const target = proofreadingResults.value[index]
  if (!target) return
  // 原位撤销：把这条建议的文本替换回原文，避免整篇重渲染
  const container = previewContainer.value
  const appliedItems = proofreadingResults.value.filter(item => item.applied)
  const undone =
    container && appliedItems.length > 0 ? undoCorrectionsInPreview(container, appliedItems, [target]) : 0
  // 两种路径都已安排好 DOM 重建方（原位 + 手动重高亮 / rerenderVersion 整篇重建），
  // 豁免两侧 results 侦听避免二次重建
  fileStore.requestSkipResultRerender()
  fileStore.requestSkipResultRehighlight()
  const newResults = [...proofreadingResults.value]
  newResults[index] = { ...newResults[index], applied: false }
  proofreadingResults.value = newResults
  if (undone === 1) {
    highlightCorrections()
  } else {
    // 原位撤销失败（预览中找不到建议文本等），退回整篇重渲染重放已应用项
    fileStore.triggerRerender()
  }
  ElMessage.success(t('proof.messages.undoSuccess'))
}

// 批量应用/按类型应用的入口在右侧预览工具栏（DocPreview.vue）中，
// 本列表只负责单条的应用、撤销、忽略与编辑。

watch(
  () => fileStore.results,
  (newVal, oldVal) => {
    // 应用/忽略/编辑/撤销等原位操作已在改动前自行维护好预览 DOM 与高亮，
    // 消费一次性豁免标记，跳过整列表重建
    if (fileStore.consumeSkipResultRehighlight()) return
    if (newVal.length > 0) {
      nextTick(() => highlightCorrections())
      // 仅在结果从无到有时自动展开第一项，避免应用/编辑等操作打乱当前展开状态
      if (!oldVal || oldVal.length === 0) {
        activeNames.value = [0]
      }
    }
  }
)

// 响应右侧预览高亮的点击：聚焦到对应校对项（反向跳转）
watch(
  () => fileStore.sidebarFocusVersion,
  () => {
    if (fileStore.sidebarFocusIndex === -1) return
    scrollToCorrectionItem(fileStore.sidebarFocusIndex)
  }
)

onMounted(async () => {
  if (proofreadingResults.value.length > 0) {
    await nextTick()
    highlightCorrections()
    activeNames.value = [0]
  }
})

onUnmounted(() => {
  if (previewFocusTimer) {
    clearTimeout(previewFocusTimer)
    previewFocusTimer = null
  }
  if (restoreVisibilityTimer) {
    clearTimeout(restoreVisibilityTimer)
    restoreVisibilityTimer = null
  }
})
</script>

<style>
/* 预览高亮与类型色板已收敛到 assets/css/common.css（批次 9）；
   这里仅保留本视图特有的列表样式与暗色适配。 */
.correction-item.correction-item-focused {
  box-shadow: 0 0 0 2px rgba(142, 197, 255, 0.7) !important;
  animation: correction-item-pulse 0.8s ease-in-out 3 !important;
}

@keyframes correction-item-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(142, 197, 255, 0.6);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(142, 197, 255, 0.18), 0 0 14px rgba(142, 197, 255, 0.4);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(142, 197, 255, 0.6);
  }
}

html.dark .correction-item {
  background-color: var(--bg-panel);
  border-color: var(--border-color);
}

html.dark .correction-item:hover {
  border-color: var(--border-strong);
}

html.dark .correction-header {
  background-color: var(--bg-panel);
}

html.dark .correction-content {
  background-color: var(--bg-sunken);
  border-top-color: var(--border-color);
}

html.dark .correction-content > div {
  color: #e4e7ed;
}

html.dark .correction-content strong {
  color: #f2f3f5;
}

html.dark .actions {
  border-top-color: var(--border-color);
}

html.dark .correction-item-rejected {
  opacity: 0.5;
}

html.dark .correction-rejected-tag {
  color: #8a929e;
  border-color: var(--border-strong);
}

html.dark .correction-applied-check {
  color: #5bd07a;
}

html.dark .edit-icon {
  color: #6a6a6a;
}

html.dark .edit-icon:hover {
  color: #8ec5ff;
}

html.dark .reference-item {
  background: #1d1e1f;
  border-left-color: #409eff;
}

html.dark .reference-item:hover {
  background: #252627;
}

html.dark .reference-text {
  color: #e4e7ed;
}

html.dark .reference-content h4 {
  color: #f2f3f5;
}

html.dark .proof-results-panel {
  background-color: var(--bg-panel);
}

html.dark .correction-item:hover {
  background-color: #252525;
}

html.dark .results-container {
  background-color: var(--bg-page);
}

html.dark .el-collapse {
  background-color: var(--bg-page);
}

html.dark .el-collapse-item {
  border-color: var(--border-color);
}

html.dark .el-collapse-item__header {
  background-color: var(--bg-elevated);
  color: var(--text-2);
}

html.dark .el-collapse-item__header:hover {
  background-color: #252525;
}

html.dark .el-collapse-item__wrap {
  background-color: var(--bg-page);
}

html.dark .el-collapse-item__header.is-active {
  background-color: #252525;
  color: #e0e0e0;
}

.reference-popover {
  max-width: 500px;
  text-align: center;
}

.reference-popover .el-popover__title {
  margin-bottom: 12px;
  color: #303133;
  font-weight: 600;
  text-align: center;
}
</style>

<style scoped>
.proof-results-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #ffffff;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.results-container {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
}

.reference-content {
  padding: 12px 4px;
}

.reference-content h4 {
  margin: 0 0 14px 0;
  color: #4a6580;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.reference-list {
  max-height: 300px;
  overflow-y: auto;
}

.reference-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 10px;
  padding: 10px 14px;
  background: #f4f6f9;
  border-radius: 6px;
  border-left: 3px solid var(--brand);
  line-height: 1.6;
  transition: all 0.2s ease;
}

.reference-item:hover {
  background: #edf3f7;
}

.reference-item:last-child {
  margin-bottom: 0;
}

.reference-index {
  color: var(--brand);
  font-weight: 600;
  margin-right: 10px;
  min-width: 22px;
  flex-shrink: 0;
}

.reference-text {
  color: #5a6a7a;
  word-break: break-word;
  white-space: pre-wrap;
}

.reference-list::-webkit-scrollbar {
  width: 5px;
}

.reference-list::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.reference-list::-webkit-scrollbar-thumb {
  background: #c5d3de;
  border-radius: 3px;
}

.reference-list::-webkit-scrollbar-thumb:hover {
  background: #a8bfcf;
}

.correction-item {
  margin-bottom: 10px;
  border-radius: 8px;
  overflow: hidden;
  border: none;
  background-color: #ffffff;
  transition: background 0.2s ease;
}

/* 已忽略的建议：整体弱化显示 */
.correction-item-rejected {
  opacity: 0.55;
}

.correction-item-rejected .correction-type {
  filter: saturate(0.2);
}

.correction-rejected-tag {
  font-size: 11px;
  color: #8a929e;
  border: 1px solid #c0c4cc;
  border-radius: 4px;
  padding: 0 6px;
  line-height: 18px;
}

/* 已应用的建议：标题旁显示绿色对勾 */
.correction-applied-check {
  margin-left: 8px;
  margin-right: auto;
  font-size: 16px;
  color: #34a853;
  font-weight: 700;
}

.suggested-text {
  word-break: break-word;
}

.edit-icon {
  margin-left: 8px;
  cursor: pointer;
  color: #9aa4b1;
  vertical-align: -2px;
  transition: color 0.15s ease;
}

.edit-icon:hover {
  color: #409eff;
}

.suggested-editor {
  margin-top: 8px;
  width: 100%;
}

.edit-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.edited-tag {
  margin-left: 6px;
}

.correction-item:hover {
  background-color: #f8fafb;
}

.correction-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: transparent;
}

.correction-type {
  display: inline-block;
  box-sizing: border-box;
  min-width: 68px;
  text-align: center;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.correction-count {
  font-size: 12px;
  color: #8a929e;
  font-weight: 500;
}

.correction-content {
  padding: 14px 16px;
  border-top: 1px solid #edf0f4;
  background-color: #f8fafb;
}

.correction-content > div {
  margin-bottom: 12px;
  line-height: 1.7;
  color: #5a6a7a;
}

.correction-content strong {
  color: #4a6580;
  min-width: 50px;
  display: inline-block;
  font-weight: 600;
}

.actions {
  margin-top: 14px;
  text-align: right;
  padding-top: 10px;
  border-top: 1px dashed #edf0f4;
}

.actions .el-button {
  transition: all 0.2s ease;
  border-radius: 6px;
}

.actions .el-button:hover {
  transform: none;
  box-shadow: none;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: #8a929e;
}
</style>
