<template>
  <div class="proof-results-panel">
    <div v-if="proofreadingResults.length > 0" class="results-container">
      <el-collapse v-model="activeNames">
        <el-collapse-item
          v-for="(item, index) in proofreadingResults"
          :id="`error-item-${index}`"
          :key="index"
          :name="index"
          :class="[`correction-item type-${(item.type || '').toLowerCase()}`, { 'correction-item-rejected': item.rejected }]"
        >
          <template #title>
            <div class="correction-header" @click="scrollPreviewToCorrection(index)">
              <span class="correction-type" :class="`type-${(item.type || '').toLowerCase()}`">
                {{ formatCorrectionType(item.type) }}
              </span>
              <span v-if="item.rejected" class="correction-rejected-tag">{{ t('proof.rejectedTag') }}</span>
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
import { EditPen } from '@element-plus/icons-vue'

import { scrollTo } from 'vue-scrollto'
import { fileInfoStore } from '../stores/store'
import {
  clearHighlights,
  getDomPositionFromIndex,
  locateCorrectionsInPreview,
  replaceCorrectionInPreview,
  undoCorrectionsInPreview
} from '../utils/correctionMatching'
import { forceVisibleSection } from '../utils/previewPerf'

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
  const newResults = [...proofreadingResults.value]
  newResults[index] = { ...newResults[index], suggested: text, edited: true }
  proofreadingResults.value = newResults
  cancelEdit()
  ElMessage.success(t('proof.messages.editSaved'))
}

// ---- 忽略 / 恢复 ----
const ignoreCorrection = index => {
  const newResults = [...proofreadingResults.value]
  newResults[index] = { ...newResults[index], rejected: true, applied: false }
  proofreadingResults.value = newResults
  if (editingIndex.value === index) cancelEdit()
  ElMessage.info(t('proof.messages.ignored'))
}

const unignoreCorrection = index => {
  const newResults = [...proofreadingResults.value]
  newResults[index] = { ...newResults[index], rejected: false }
  proofreadingResults.value = newResults
  ElMessage.success(t('proof.messages.unignored'))
}

const formatCorrectionType = type => {
  const typeMap = {
    Typo: t('proof.correctionTypes.Typo'),
    Punctuation: t('proof.correctionTypes.Punctuation'),
    Grammar: t('proof.correctionTypes.Grammar'),
    Consistency: t('proof.correctionTypes.Consistency'),
    wordError: t('proof.correctionTypes.wordError'),
    ComprehensiveError: t('proof.correctionTypes.ComprehensiveError'),
    polish: t('proof.correctionTypes.polish'),
    reduceAI: t('proof.correctionTypes.reduceAI')
  }
  return typeMap[type] || type
}

const normalizeCorrectionType = type => {
  return (type || '').toString().trim().toLowerCase()
}

// 文本定位/高亮/替换的通用逻辑统一在 utils/correctionMatching.js 维护，
// 与右侧预览（DocPreview）共用同一套匹配口径（含重复文本按出现次序分配的约定）

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

const wrapPreviewRange = (container, match) => {
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
  highlightEl.addEventListener('click', () => scrollToCorrectionItem(index))
  highlightEl.appendChild(range.extractContents())
  range.insertNode(highlightEl)
  return true
}

const highlightCorrections = () => {
  const container = previewContainer.value
  if (!container) return
  clearHighlights(container)
  const pendingCorrections = proofreadingResults.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.applied && !item.rejected)
  if (pendingCorrections.length === 0) return
  const { matches, segments } = locateCorrectionsInPreview(container, pendingCorrections)
  matches
    .map(match => ({ ...match, segments }))
    .sort((a, b) => b.start - a.start)
    .forEach(match => {
      wrapPreviewRange(container, match)
    })
}

const applyCorrection = index => {
  const newResults = [...proofreadingResults.value]
  newResults[index] = { ...newResults[index], applied: true }
  proofreadingResults.value = newResults
  const container = previewContainer.value
  if (!container) return
  // 定位时把"全部未处理项 + 本条"一并纳入分配：重复文本按出现次序
  // 命中本条对应的位置（与高亮分配一致），而不是总替换第一处
  const contextList = newResults
    .map((item, i) => ({ item, index: i }))
    .filter(({ item, index: i }) => (!item.applied && !item.rejected) || i === index)
  const updated = replaceCorrectionInPreview(container, newResults[index], contextList)
  highlightCorrections()
  if (updated) {
    ElMessage.success(t('proof.messages.applied'))
  } else {
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
  fileStore.requestSkipResultRerender()
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
.highlight-correction {
  --highlight-bg: rgba(255, 214, 102, 0.5);
  --highlight-bg-hover: rgba(255, 214, 102, 0.7);
  --highlight-bg-focus: rgba(255, 214, 102, 0.92);
  --highlight-border: #ffb300;
  --highlight-ring: rgba(255, 179, 0, 0.28);
  background-color: var(--highlight-bg) !important;
  border-bottom: 2px solid var(--highlight-border) !important;
  cursor: pointer !important;
  padding: 1px 3px !important;
  border-radius: 3px !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--highlight-border) 28%, transparent) !important;
}

.highlight-correction:hover {
  box-shadow: 0 0 0 3px var(--highlight-ring) !important;
  background-color: var(--highlight-bg-hover) !important;
  transform: translateY(-1px) !important;
}

.highlight-correction-focused {
  background-color: var(--highlight-bg-focus) !important;
  animation: correction-highlight-pulse 0.8s ease-in-out 3 !important;
}

.highlight-type-typo,
.highlight-type-worderror,
.highlight-type-错别字 {
  --highlight-bg: rgba(245, 108, 108, 0.24);
  --highlight-bg-hover: rgba(245, 108, 108, 0.34);
  --highlight-bg-focus: rgba(245, 108, 108, 0.48);
  --highlight-border: #e36262;
  --highlight-ring: rgba(245, 108, 108, 0.32);
}

.highlight-type-punctuation,
.highlight-type-标点 {
  --highlight-bg: rgba(230, 162, 60, 0.24);
  --highlight-bg-hover: rgba(230, 162, 60, 0.34);
  --highlight-bg-focus: rgba(230, 162, 60, 0.48);
  --highlight-border: #d89020;
  --highlight-ring: rgba(230, 162, 60, 0.3);
}

.highlight-type-grammar,
.highlight-type-语法 {
  --highlight-bg: rgba(64, 158, 255, 0.24);
  --highlight-bg-hover: rgba(64, 158, 255, 0.34);
  --highlight-bg-focus: rgba(64, 158, 255, 0.48);
  --highlight-border: #3a8ee6;
  --highlight-ring: rgba(64, 158, 255, 0.32);
}

.highlight-type-consistency,
.highlight-type-一致性 {
  --highlight-bg: rgba(144, 147, 152, 0.24);
  --highlight-bg-hover: rgba(144, 147, 152, 0.34);
  --highlight-bg-focus: rgba(144, 147, 152, 0.48);
  --highlight-border: #828282;
  --highlight-ring: rgba(144, 147, 152, 0.3);
}

.highlight-type-comprehensiveerror,
.highlight-type-polish,
.highlight-type-综合错误,
.highlight-type-润色建议 {
  --highlight-bg: rgba(103, 194, 58, 0.24);
  --highlight-bg-hover: rgba(103, 194, 58, 0.34);
  --highlight-bg-focus: rgba(103, 194, 58, 0.48);
  --highlight-border: #5baa3a;
  --highlight-ring: rgba(103, 194, 58, 0.3);
}

.highlight-type-reduceai,
.highlight-type-ai率降低 {
  --highlight-bg: rgba(160, 120, 200, 0.24);
  --highlight-bg-hover: rgba(160, 120, 200, 0.34);
  --highlight-bg-focus: rgba(160, 120, 200, 0.48);
  --highlight-border: #9b6dc6;
  --highlight-ring: rgba(160, 120, 200, 0.3);
}

@keyframes correction-highlight-pulse {
  0% {
    box-shadow:
      0 0 0 0 var(--highlight-ring),
      0 1px 3px color-mix(in srgb, var(--highlight-border) 28%, transparent);
    transform: translateY(0);
  }
  50% {
    box-shadow:
      0 0 0 7px color-mix(in srgb, var(--highlight-border) 16%, transparent),
      0 0 18px color-mix(in srgb, var(--highlight-border) 34%, transparent);
    transform: translateY(-1px);
  }
  100% {
    box-shadow:
      0 0 0 0 var(--highlight-ring),
      0 1px 3px color-mix(in srgb, var(--highlight-border) 28%, transparent);
    transform: translateY(0);
  }
}

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
  background-color: #1d1e1f;
  border-color: #2c2e30;
}

html.dark .correction-item:hover {
  border-color: #4c4d4f;
}

html.dark .correction-header {
  background-color: #1d1e1f;
}

html.dark .correction-content {
  background-color: #141414;
  border-top-color: #2c2e30;
}

html.dark .correction-content > div {
  color: #e4e7ed;
}

html.dark .correction-content strong {
  color: #f2f3f5;
}

html.dark .actions {
  border-top-color: #2c2e30;
}

html.dark .correction-item-rejected {
  opacity: 0.5;
}

html.dark .correction-rejected-tag {
  color: #8a929e;
  border-color: #4c4d4f;
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
  background-color: #141414;
}

html.dark .correction-item:hover {
  background-color: #252525;
}

html.dark .results-container {
  background-color: #000000;
}

html.dark .el-collapse {
  background-color: #000000;
}

html.dark .el-collapse-item {
  border-color: #2c2e30;
}

html.dark .el-collapse-item__header {
  background-color: #1a1a1a;
  color: #c0c4cc;
}

html.dark .el-collapse-item__header:hover {
  background-color: #252525;
}

html.dark .el-collapse-item__wrap {
  background-color: #000000;
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
  overflow-y: scroll;
  scrollbar-width: none;
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
  border-left: 3px solid #7b9eb8;
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
  color: #7b9eb8;
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

.category-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.category-typo,
.category-worderror,
.category-错别字 {
  background-color: #c28a8a;
}

.category-punctuation,
.category-标点 {
  background-color: #c2a86a;
}

.category-grammar,
.category-语法 {
  background-color: #7b9eb8;
}

.category-consistency,
.category-一致性 {
  background-color: #8a929e;
}

.category-comprehensiveerror,
.category-综合错误,
.category-polish,
.category-润色建议 {
  background-color: #8ab89e;
}

.category-reduceai,
.category-ai率降低 {
  background-color: #9b6dc6;
}

.type-typo,
.type-错别字,
.type-worderror {
  background-color: rgba(194, 138, 138, 0.14);
  color: #a87070;
  border: none;
}

.type-punctuation,
.type-标点 {
  background-color: rgba(194, 168, 106, 0.14);
  color: #a08850;
  border: none;
}

.type-grammar,
.type-语法 {
  background-color: rgba(123, 158, 184, 0.14);
  color: #5b7c99;
  border: none;
}

.type-consistency,
.type-一致性 {
  background-color: rgba(138, 146, 158, 0.14);
  color: #6a7380;
  border: none;
}

.type-comprehensiveerror,
.type-综合错误,
.type-polish,
.type-润色建议 {
  background-color: rgba(138, 184, 158, 0.14);
  color: #5a9070;
  border: none;
}

.type-reduceai,
.type-ai率降低 {
  background-color: rgba(160, 120, 200, 0.14);
  color: #8a5ebf;
  border: none;
}
</style>
