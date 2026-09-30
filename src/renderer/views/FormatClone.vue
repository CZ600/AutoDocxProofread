<template>
  <div class="format-clone-panel">

    <div class="clone-body">
      <!-- ====== Input Section (compact, top) ====== -->
      <div class="input-section" :class="{ expand: formatItems.length === 0 && defaults === null }">
        <!-- Reference doc selector -->
        <div class="input-row">
          <span class="input-label">📄 {{ t('proof.formatClone.refDocLabel') }}</span>
          <el-button size="small" :loading="selectingRef" @click="selectRefFile">
            {{ t('proof.formatClone.selectRef') }}
          </el-button>
          <template v-if="refFileName">
            <el-tooltip :content="refFileName" placement="bottom">
              <span class="ref-file-name">{{ truncatedName(refFileName) }}</span>
            </el-tooltip>
            <el-tooltip :content="t('proof.formatClone.clearRefTip')" placement="bottom">
              <el-icon class="clear-icon" @click="clearRefFile"><CircleClose /></el-icon>
            </el-tooltip>
          </template>
        </div>

        <!-- Description file selector -->
        <div class="input-row">
          <span class="input-label">📝 {{ t('proof.formatClone.descLabel') }}</span>
          <el-button size="small" :loading="selectingDescFile" @click="selectDescFile">
            {{ t('proof.formatFromDesc.selectFile') }}
          </el-button>
          <template v-if="descFileName">
            <el-tooltip :content="descFileName" placement="bottom">
              <span class="ref-file-name">{{ truncatedName(descFileName) }}</span>
            </el-tooltip>
            <el-tooltip :content="t('proof.formatClone.clearDescTip')" placement="bottom">
              <el-icon class="clear-icon" @click="clearDescFile"><CircleClose /></el-icon>
            </el-tooltip>
          </template>
        </div>

        <!-- Description textarea: always visible, expand when no results -->
        <textarea
          v-model="descText"
          class="desc-textarea"
          :class="{ expand: formatItems.length === 0 && defaults === null }"
          :placeholder="t('proof.formatFromDesc.placeholder')"
          rows="4"
          :readonly="formatItems.length > 0 || defaults !== null"
        ></textarea>

        <!-- Start button: hidden when results are shown -->
        <template v-if="formatItems.length === 0 && defaults === null">
          <div class="start-btn-row">
            <el-button
              type="primary"
              size="small"
              :loading="analyzing"
              :disabled="!targetFilePath || (!refFilePath && !descText.trim())"
              @click="startFormat"
            >
              {{ analyzing ? t('proof.formatClone.analyzing') : t('proof.formatClone.startAnalyze') }}
            </el-button>
            <el-progress
              v-if="analyzing"
              :percentage="progressPercent"
              :stroke-width="10"
              :show-text="false"
              class="inline-progress-bar"
            />
            <span v-if="!targetFilePath" class="hint-text">{{ t('proof.formatClone.openTargetFirst') }}</span>
          </div>
        </template>
      </div>

      <!-- ====== Results Section (below, scrollable) ====== -->
      <template v-if="formatItems.length > 0 || defaults">
        <!-- Agent flow summary -->
        <div v-if="flowType === 'agent' && agentTokenUsage > 0" class="result-summary">
          {{ t('proof.formatClone.recognizedSummary', { count: formatItems.length, tokens: agentTokenUsage }) }}
        </div>

        <!-- Editable formatItems list -->
        <div v-if="formatItems.length > 0" class="format-list">
          <el-collapse v-model="activeNames">
            <el-collapse-item
              v-for="(item, index) in formatItems"
              :key="index"
              :name="index"
              class="format-item"
            >
              <template #title>
                <div class="format-item-header">
                  <span class="format-name">{{ item.name }}</span>
                  <span class="format-type-badge">{{ item.type }}</span>
                </div>
              </template>
              <div class="format-detail">
                <div v-if="item.paragraphStyle && Object.keys(item.paragraphStyle).length > 0" class="style-section">
                  <strong>{{ t('proof.formatClone.paragraphStyle') }}</strong>
                  <StylePropsEditor :style-obj="item.paragraphStyle" />
                </div>
                <div v-if="item.runStyle && Object.keys(item.runStyle).length > 0" class="style-section">
                  <strong>{{ t('proof.formatClone.runStyle') }}</strong>
                  <StylePropsEditor :style-obj="item.runStyle" />
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- Editable defaults section -->
        <div v-if="defaults" class="defaults-section">
          <el-collapse v-model="defaultsActive">
            <el-collapse-item name="defaults">
              <template #title>
                <div class="format-item-header">
                  <span class="format-name">{{ t('proof.formatClone.defaults') }}</span>
                </div>
              </template>
              <div class="format-detail">
                <div v-if="defaults.paragraphStyle && Object.keys(defaults.paragraphStyle).length > 0" class="style-section">
                  <strong>{{ t('proof.formatClone.paragraphStyle') }}</strong>
                  <StylePropsEditor :style-obj="defaults.paragraphStyle" />
                </div>
                <div v-if="defaults.runStyle && Object.keys(defaults.runStyle).length > 0" class="style-section">
                  <strong>{{ t('proof.formatClone.runStyle') }}</strong>
                  <StylePropsEditor :style-obj="defaults.runStyle" />
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- Output mode (agent flow only) + Apply/Export buttons -->
        <div v-if="formatItems.length > 0" class="action-bar-bottom">
          <el-radio-group v-if="flowType === 'agent'" v-model="outputMode" size="small">
            <el-radio value="new">{{ t('proof.formatClone.exportNewFile') }}</el-radio>
            <el-radio value="overwrite">{{ t('proof.formatClone.overwriteOriginal') }}</el-radio>
          </el-radio-group>
          <!-- 强制覆盖选项（仅简单克隆流程可用） -->
          <div v-if="flowType === 'simple'" class="force-overwrite-row">
            <el-tooltip
              placement="top"
              :width="280"
            >
              <template #content>
                <div class="force-tooltip-content">
                  <p><strong>⚠️ {{ t('proof.formatClone.forceOverwrite') }}</strong></p>
                  <p>{{ t('proof.formatClone.forceDesc') }}</p>
                  <p><strong>{{ t('proof.formatClone.forceRisk') }}</strong></p>
                  <ul>
                    <li>{{ t('proof.formatClone.forceRisk1') }}</li>
                    <li>{{ t('proof.formatClone.forceRisk2') }}</li>
                  </ul>
                  <p><strong>{{ t('proof.formatClone.forceScenePrefix') }}</strong>{{ t('proof.formatClone.forceScene') }}</p>
                </div>
              </template>
              <el-checkbox v-model="forceOverwrite" size="small">
                {{ t('proof.formatClone.forceOverwrite') }}
                <el-icon class="info-icon"><QuestionFilled /></el-icon>
              </el-checkbox>
            </el-tooltip>
          </div>
          <div class="action-buttons">
            <el-button
              type="primary"
              size="small"
              :loading="cloning"
              :disabled="formatItems.length === 0 || !targetFilePath"
              @click="doClone"
            >
              {{ t('proof.formatClone.start') }}
            </el-button>
            <el-button
              type="success"
              size="small"
              :disabled="!clonedFilePath"
              :loading="exporting"
              @click="doExport"
            >
              {{ t('proof.formatClone.export') }}
            </el-button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { ElButton, ElCheckbox, ElCollapse, ElCollapseItem, ElMessage, ElTooltip, ElIcon, ElRadio, ElRadioGroup } from 'element-plus'
import { QuestionFilled, CircleClose } from '@element-plus/icons-vue'

import { useApiStore } from '../stores/apiStore'
import { fileInfoStore } from '../stores/store'
import { renderDocxFileToContainer } from '../utils/previewRender'
import StylePropsEditor from '../components/format/StylePropsEditor.vue'
import {
  buildProfileFromItems,
  buildSpecFromItems,
  specToDefaults,
  specToFormatItems
} from '../utils/formatCloneSpec'

const electronAPI = window.electronAPI
const apiStore = useApiStore()
const fileStore = fileInfoStore()

// ---- ALL STATE IS INTERNAL (no inject) ----

// Computed from store
const targetFilePath = computed(() => fileStore.filePath)

// Reference document state
const refFilePath = ref('')
const refFileName = ref('')
const selectingRef = ref(false)

// Format items & defaults (shared between simple clone and agent flows)
const formatItems = ref([])
const defaults = ref(null)
const activeNames = ref([])
const defaultsActive = ref([])

// Clone/export state
const clonedFilePath = ref('')
const cloning = ref(false)
const exporting = ref(false)

// Flow tracking: 'simple' | 'agent'
const flowType = ref('simple')

// Description input state
const descText = ref('')
const descFileName = ref('')
const selectingDescFile = ref(false)

// 强制覆盖行内格式选项（仅简单克隆流程可用）
const forceOverwrite = ref(false)

// Agent-specific state
const analyzing = ref(false)
const outputMode = ref('new')
const agentSpec = ref(null)
const agentClassification = ref(null)
const agentTokenUsage = ref(0)
const progressPercent = ref(0)
let progressInterval = null

// ---- Utility helpers ----

const truncatedName = name => (name.length > 20 ? name.slice(0, 20) + '...' : name)

// 属性编辑控件（布尔开关/步进/取色/间距）收敛在 StylePropsEditor.vue，
// spec/profile 的纯函数转换收敛在 utils/formatCloneSpec.js

// ---- Preview rendering ----

const renderPreview = async (filePath) => {
  // 读取/构建 File/渲染收敛在 utils/previewRender.js
  await renderDocxFileToContainer(filePath, fileStore.fileName, document.querySelector('.preview-container'))
}

// ---- Reference doc selection ----

const selectRefFile = async () => {
  selectingRef.value = true
  try {
    const filePath = await electronAPI.selectDocxFile()
    if (!filePath) return

    refFilePath.value = filePath
    refFileName.value = filePath.split('\\').pop().split('/').pop()
    clonedFilePath.value = ''

    const profile = await electronAPI.getFormatProfile(filePath)
    defaults.value = profile.defaults || null

    const items = []
    for (const [id, style] of Object.entries(profile.styles || {})) {
      items.push({
        id,
        name: style.name || id,
        type: style.type || 'paragraph',
        paragraphStyle: { ...style.paragraphStyle } || {},
        runStyle: { ...style.runStyle } || {}
      })
    }
    formatItems.value = items
    if (items.length > 0) activeNames.value = [0]
    if (defaults.value) defaultsActive.value = ['defaults']
    flowType.value = 'simple'
  } catch (e) {
    ElMessage.error(t('proof.formatClone.extractFailed'))
  } finally {
    selectingRef.value = false
  }
}

// ---- Description file selection ----

const selectDescFile = async () => {
  selectingDescFile.value = true
  try {
    const filePath = await electronAPI.selectFormatDescFile()
    if (!filePath) return

    // Clear previous results so input area shows again
    resetResults()

    descFileName.value = filePath.split('\\').pop().split('/').pop()

    const ext = filePath.split('.').pop().toLowerCase()

    if (ext === 'docx') {
      const result = await electronAPI.extractDocxText(filePath)
      if (result.success && result.text) {
        descText.value = result.text
      } else {
        ElMessage.error(result.error || t('proof.formatFromDesc.readFileFailed'))
      }
    } else {
      const result = await electronAPI.readTextFile(filePath)
      if (result.success) {
        descText.value = result.content
      } else {
        ElMessage.error(t('proof.formatFromDesc.readFileFailed'))
      }
    }
  } catch (e) {
    ElMessage.error(t('proof.formatFromDesc.readFileFailed'))
  } finally {
    selectingDescFile.value = false
  }
}

// ---- Clear functions ----

/** 清空识别结果，回到「待分析」输入态（参考文档/描述文件清理共用） */
const resetResults = () => {
  formatItems.value = []
  defaults.value = null
  clonedFilePath.value = ''
  flowType.value = 'simple'
  agentSpec.value = null
  agentClassification.value = null
  agentTokenUsage.value = 0
}

const clearRefFile = () => {
  refFilePath.value = ''
  refFileName.value = ''
  // 如果没有格式描述，清除结果状态
  if (!descText.value.trim()) {
    resetResults()
  }
  ElMessage.success(t('proof.formatClone.clearedRef'))
}

const clearDescFile = () => {
  descFileName.value = ''
  descText.value = ''
  // 如果没有参考文档，清除结果状态
  if (!refFilePath.value) {
    resetResults()
  }
  ElMessage.success(t('proof.formatClone.clearedDesc'))
}

// ---- Unified start function ----

const startFormat = async () => {
  const hasRef = refFilePath.value.trim() !== ''
  const hasDesc = descText.value.trim() !== ''

  if (!hasRef && !hasDesc) {
    ElMessage.warning(t('proof.formatClone.needRefOrDesc'))
    return
  }

  if (!targetFilePath.value) {
    ElMessage.warning(t('proof.formatClone.openTargetFirst'))
    return
  }

  if (hasRef && !hasDesc) {
    // Simple clone flow: apply reference doc format directly
    await doClone()
  } else {
    // Agent flow: has description (with or without ref doc)
    await agentFlow()
  }
}

// ---- Agent flow (LLM) ----

const agentFlow = async () => {
  analyzing.value = true
  clonedFilePath.value = ''
  // Start fake progress: ~0→99% over ~120s
  progressPercent.value = 0
  const steps = 240
  let current = 0
  progressInterval = setInterval(() => {
    current++
    if (current < steps) {
      progressPercent.value = Math.round((current / steps) * 99)
    } else {
      progressPercent.value = 99
    }
  }, 500)
  try {
    const currentApi = apiStore.selectedApi
    const apiConfig = {
      apiKey: currentApi.key,
      modelName: currentApi.name,
      apiURL: currentApi.URL,
      provider: currentApi.provider
    }
    const result = await electronAPI.smartFormatAnalyze({
      description: descText.value.trim() || undefined,
      refFilePath: refFilePath.value || undefined,
      targetFilePath: targetFilePath.value,
      apiConfig
    })
    if (result.success) {
      agentSpec.value = result.spec
      agentClassification.value = result.classification
      agentTokenUsage.value = result.tokenUsage || 0
      flowType.value = 'agent'

      // Convert spec to editable formatItems
      formatItems.value = specToFormatItems(result.spec)
      defaults.value = specToDefaults(result.spec)

      if (formatItems.value.length > 0) activeNames.value = [0]
      if (defaults.value) defaultsActive.value = ['defaults']

      ElMessage.success(t('proof.formatClone.analyzeDone', { count: formatItems.value.length }))
    } else {
      ElMessage.error(result.error || t('proof.formatClone.analyzeFailed'))
    }
  } catch (e) {
    ElMessage.error(t('proof.formatClone.analyzeError') + (e.message || String(e)))
  } finally {
    clearInterval(progressInterval)
    progressPercent.value = 100
    analyzing.value = false
  }
}

// ---- Progress cleanup & textarea compress ----
watch(formatItems, (items) => {
  if (items.length > 0 && progressInterval) {
    clearInterval(progressInterval)
    progressPercent.value = 100
  }
})

onUnmounted(() => {
  if (progressInterval) clearInterval(progressInterval)
})

// ---- Clone / Apply ----

const doClone = async () => {
  cloning.value = true
  try {
    if (flowType.value === 'agent' && agentSpec.value && agentClassification.value) {
      // Agent flow: rebuild spec from edited formatItems and apply
      // Deep-clone to strip Vue reactive Proxies — IPC structured clone cannot serialize Proxies
      const spec = JSON.parse(JSON.stringify(buildSpecFromItems(formatItems.value, defaults.value, agentSpec.value)))
      const outputPath = outputMode.value === 'new'
        ? targetFilePath.value.replace(/\.docx$/i, '_formatted.docx')
        : targetFilePath.value
      const classification = JSON.parse(JSON.stringify(agentClassification.value))
      const result = await electronAPI.smartFormatApply({
        inputPath: targetFilePath.value,
        outputPath,
        spec,
        classification
      })
      if (result.success) {
        clonedFilePath.value = result.filePath || outputPath
        await renderPreview(result.filePath || outputPath)
        ElMessage.success(
          t('proof.formatClone.applyDone', {
            paragraphs: result.appliedParagraphs || 0,
            preserved: result.contentPreserved
              ? t('proof.formatClone.preservedYes')
              : t('proof.formatClone.preservedNo')
          })
        )
      } else {
        console.error('[FormatClone] smartFormatApply failed:', result.error)
        ElMessage.error(t('proof.formatClone.cloneFailed') + (result.error || t('proof.formatClone.unknownError')))
      }
    } else {
      // Simple clone flow
      const profile = JSON.parse(JSON.stringify(buildProfileFromItems(formatItems.value, defaults.value)))
      let result
      if (forceOverwrite.value) {
        // 强制覆盖行内格式
        result = await electronAPI.cloneFormatWithProfileForce(profile, targetFilePath.value)
        if (result.success) {
          clonedFilePath.value = result.filePath
          await renderPreview(result.filePath)
          const matchedStyles = result.matchedStyles || 0
          const appliedParagraphs = result.appliedParagraphs || 0
          if (matchedStyles === 0) {
            ElMessage.warning(t('proof.formatClone.cloneDefaultOnly', { paragraphs: appliedParagraphs }))
          } else {
            ElMessage.success(
              t('proof.formatClone.cloneForced', { styles: matchedStyles, paragraphs: appliedParagraphs })
            )
          }
        }
      } else {
        // 普通克隆（只修改样式定义）
        result = await electronAPI.cloneFormatWithProfile(profile, targetFilePath.value)
        if (result.success) {
          clonedFilePath.value = result.filePath
          await renderPreview(result.filePath)
          ElMessage.success(t('proof.formatClone.cloneSuccess'))
        }
      }
      if (!result?.success) {
        console.error('[FormatClone] cloneFormatWithProfile failed:', result)
        ElMessage.error(t('proof.formatClone.failed'))
      }
    }
  } catch (e) {
    console.error('[FormatClone] doClone exception:', e)
    ElMessage.error(t('proof.formatClone.failed') + ': ' + (e.message || String(e)))
  } finally {
    cloning.value = false
  }
}

// ---- Export ----

const doExport = async () => {
  if (!clonedFilePath.value) return
  exporting.value = true
  try {
    const result = await electronAPI.exportFormatCloned(clonedFilePath.value, targetFilePath.value)
    if (result?.canceled) return
    if (result?.success) {
      ElMessage.success(t('proof.messages.exportSuccess') + (result.filePath || ''))
    }
  } catch (e) {
    ElMessage.error(t('proof.messages.exportFailed') + e.message)
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.format-clone-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #ffffff;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.clone-body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

/* ---- Input Section ---- */
.input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  transition: flex 0.4s ease, min-height 0.4s ease;
  overflow: hidden;
}

.input-section.expand {
  flex: 1;
  min-height: 0;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.input-label {
  font-size: 13px;
  font-weight: 500;
  color: #4a6580;
  white-space: nowrap;
  min-width: 80px;
}

.ref-file-name {
  font-size: 12px;
  color: #5a6a7a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.clear-icon {
  font-size: 16px;
  color: #b0b8c4;
  cursor: pointer;
  transition: color 0.2s;
  flex-shrink: 0;
}

.clear-icon:hover {
  color: #f56c6c;
}

/* ---- Description textarea ---- */
.desc-textarea {
  width: 100%;
  min-height: 80px;
  max-height: 160px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #4a6580;
  background: #f8fafb;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  resize: vertical;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  transition: max-height 0.4s ease, height 0.4s ease;
}

.desc-textarea.expand {
  flex: 1;
  height: 100%;
  max-height: none;
  resize: none;
}

.desc-textarea[readonly] {
  max-height: 100px;
  resize: none;
  opacity: 0.7;
  cursor: default;
}

.desc-textarea:focus {
  border-color: var(--brand);
  background: #ffffff;
}

.desc-textarea::placeholder {
  color: #b0b8c4;
}

.start-btn-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.hint-text {
  font-size: 11px;
  color: #b0b8c4;
}

.inline-progress-bar {
  flex: 1;
  min-width: 60px;
}

.inline-progress-bar :deep(.el-progress-bar__outer) {
  background-color: #e0e3e8;
}

.inline-progress-bar :deep(.el-progress-bar__inner) {
  background-color: var(--brand);
  transition: width 0.5s ease;
}

/* ---- Format list (scrollable results) ----
   滚动条策略批次 7 已统一：全局细滚动条明暗均显示，不再局部隐藏 */
.format-list {
  flex: 4;
  min-height: 0;
  overflow-y: auto;
}

.defaults-section {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.format-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.format-item-header .format-type-badge {
  margin-left: auto;
}

.format-name {
  font-weight: 500;
  font-size: 13px;
  color: #4a6580;
}

.format-type-badge {
  font-size: 11px;
  color: #8a929e;
}

.format-detail {
  padding: 4px 0;
  min-width: 0;
  overflow-x: hidden;
}

.style-section {
  margin-bottom: 10px;
  min-width: 0;
}

.style-section strong {
  display: block;
  font-size: 12px;
  color: var(--brand);
  margin-bottom: 6px;
}

/* 属性行编辑控件样式已随 StylePropsEditor.vue 迁出（批次 9） */

/* ---- Results summary ---- */.result-summary {
  font-size: 12px;
  color: #8a929e;
  padding: 4px 0 8px;
  flex-shrink: 0;
}

/* ---- Action buttons at bottom ---- */
.action-bar-bottom {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  padding-top: 4px;
  border-top: 1px solid #edf0f4;
}

.action-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ---- Force overwrite option ---- */
.force-overwrite-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
}

.force-overwrite-row :deep(.el-checkbox__label) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #5a6a7a;
}

.info-icon {
  font-size: 14px;
  color: #b0b8c4;
  cursor: help;
}

.force-tooltip-content {
  font-size: 12px;
  line-height: 1.6;
}

.force-tooltip-content p {
  margin: 4px 0;
}

.force-tooltip-content ul {
  margin: 4px 0;
  padding-left: 16px;
}

.force-tooltip-content li {
  margin: 2px 0;
}

/* ---- Dark mode overrides ---- */
html.dark .format-clone-panel {
  background-color: var(--bg-page);
}

html.dark .input-label {
  color: #c0c8d0;
}

html.dark .ref-file-name {
  color: #a0a8b4;
}

html.dark .clear-icon {
  color: #6a7078;
}

html.dark .clear-icon:hover {
  color: #f56c6c;
}

html.dark .desc-textarea {
  color: #c0c8d0;
  background: #2a2a3a;
  border-color: #3a3a4a;
}

html.dark .desc-textarea:focus {
  border-color: var(--brand);
  background: #1f1f33;
}

html.dark .desc-textarea::placeholder {
  color: #6a7078;
}

html.dark .hint-text {
  color: #6a7078;
}

html.dark .inline-progress-bar :deep(.el-progress-bar__outer) {
  background-color: #3a3a4a;
}

html.dark .inline-progress-bar :deep(.el-progress-bar__inner) {
  background-color: var(--brand);
}

html.dark .format-name {
  color: #c0c8d0;
}

html.dark .format-type-badge {
  color: #8890a0;
}

html.dark .style-section strong {
  color: #a0bdd0;
}

/* 属性行编辑控件的暗色样式已随 StylePropsEditor.vue 迁出（批次 9） */

html.dark .result-summary {
  color: #8890a0;
}

html.dark .action-bar-bottom {
  border-top-color: #2c2e30;
}

html.dark .force-overwrite-row :deep(.el-checkbox__label) {
  color: #a0a8b4;
}

html.dark .info-icon {
  color: #6a7078;
}
</style>
