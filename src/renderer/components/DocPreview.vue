<template>
  <div class="doc-preview-wrapper">
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="error-alert" />

    <div class="action-bar">
      <div class="header-content">
        <div class="file-info-container">
          <template v-if="activeMode !== 'format-clone'">
            <el-dropdown placement="bottom" trigger="click" :disabled="proofreadingResults.length === 0">
              <el-button text type="primary" size="default" class="bar-btn apply-changes-btn" :title="t('proof.applyChanges')">
                <span>{{ t('proof.applyChanges') }}</span>
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="applyALLCorrection()">
                    <el-icon style="margin-right: 8px"><Select /></el-icon>
                    {{ t('proof.applyAllCount', { count: proofreadingResults.filter(r => !r.applied && !r.rejected).length }) }}
                  </el-dropdown-item>
                  <el-dropdown-item divided>
                    <span style="font-weight: 600; color: #606266">{{ t('proof.applyByCategory') }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-for="cat in availableCategories"
                    :key="cat.value"
                    @click="applyByCategory(cat.value)"
                  >
                    <span class="category-badge" :class="`category-${cat.value.toLowerCase()}`">{{ cat.label }}</span>
                    <span style="margin-left: 8px">{{ getCategoryCount(cat.value) }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item divided :disabled="proofreadingResults.filter(r => r.applied).length === 0" @click="undoAllCorrections()">
                    <el-icon style="margin-right: 8px"><RefreshLeft /></el-icon>
                    {{ t('proof.undoAllCount', { count: proofreadingResults.filter(r => r.applied).length }) }}
                  </el-dropdown-item>
                  <el-dropdown-item divided>
                    <span style="font-weight: 600; color: #606266">{{ t('proof.undoByCategory') }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-for="cat in appliedCategories"
                    :key="'undo-' + cat.value"
                    @click="undoByCategory(cat.value)"
                  >
                    <span class="category-badge" :class="`category-${cat.value.toLowerCase()}`">{{ cat.label }}</span>
                    <span style="margin-left: 8px">{{ getAppliedCategoryCount(cat.value) }}</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>

          <el-tooltip v-if="fileName" :content="fileName" placement="bottom">
            <span class="file-name-tag">
              <el-icon style="margin-right: 4px"><Document /></el-icon>
              {{ fileName.length > 18 ? fileName.slice(0, 18) + '...' : fileName }}
            </span>
          </el-tooltip>

          <template v-if="selectRepository.length > 0">
            <el-tag
              v-for="item in selectRepository"
              :key="item"
              type="success"
              size="small"
              closable
              :disable-transitions="false"
              @close="deleteSelectRepository(item)"
            >{{ item }}</el-tag
            >
            <el-button type="danger" size="small" text @click="deleteAllSelectRepository">{{
              t('proof.clear')
            }}</el-button>
          </template>
        </div>

        <transition name="inline-progress-fade">
          <div v-if="progressDialogVisible" class="inline-progress-container">
            <div class="inline-progress-ticker">
              <transition name="ticker-slide" mode="out-in">
                <span :key="tickerLine" class="inline-progress-line" :title="tickerLine">{{ tickerLine }}</span>
              </transition>
            </div>
            <el-progress
              class="inline-progress-bar"
              :percentage="progressIndeterminate ? 50 : progressPercent"
              :indeterminate="progressIndeterminate"
              :duration="3"
              :show-text="false"
              :stroke-width="8"
              :color="progressBarColor"
            />
            <span v-if="!progressIndeterminate" class="inline-progress-percent">{{ progressPercent }}%</span>
            <el-button
              v-if="!cancelRequested"
              class="inline-progress-cancel"
              size="small"
              text
              @click="cancelCurrentProofread"
            >
              {{ t('proof.progress.cancel') }}
            </el-button>
            <span v-else class="inline-progress-cancelling">{{ t('proof.progress.cancelling') }}</span>
            <!-- 思考模式开启时：滚动展示模型思维链增量（仅收到过思考内容才出现）。
                 必须是 inline-progress-container 的子节点——transition 只允许一个子元素，
                 且容器 flex-wrap 换行后由 flex-basis:100% 独占第二行 -->
            <div v-if="thinkingText" ref="thinkingBoxRef" class="inline-thinking-box">
              <div class="inline-thinking-header">
                <el-icon><ChatDotRound /></el-icon>
                <span>{{ t('proof.stream.thinking') }}</span>
              </div>
              <div class="inline-thinking-content">{{ thinkingText }}</div>
            </div>
          </div>
        </transition>

        <div class="button-group">
          <el-button-group class="select-file-split">
            <el-button text :loading="isLoading" size="default" class="bar-btn" @click="selectFileWithMainProcessRead">
              <el-icon><FolderOpened /></el-icon>
              <span>{{ isLoading ? t('proof.loading') : t('proof.selectFile') }}</span>
            </el-button>
            <el-dropdown
              placement="bottom-end"
              trigger="click"
              popper-class="recent-files-dropdown-popper"
            >
              <el-button
                text
                size="default"
                class="bar-btn select-file-split-trigger"
                :title="t('recentFiles.title')"
              >
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <div class="recent-files-dropdown">
                  <div class="recent-files-header">
                    <span class="recent-files-title">
                      <el-icon class="recent-files-title-icon"><Clock /></el-icon>
                      {{ t('recentFiles.title') }}
                      <span v-if="recentFilesStore.count > 0" class="recent-files-count">{{ recentFilesStore.count }}</span>
                    </span>
                    <el-button
                      v-if="!recentFilesStore.isEmpty"
                      link
                      size="small"
                      class="recent-files-clear"
                      @click="clearRecentFiles"
                    >
                      {{ t('recentFiles.clear') }}
                    </el-button>
                  </div>
                  <div class="recent-files-list">
                    <div
                      v-for="item in recentFilesStore.getList"
                      :key="item.path"
                      class="recent-files-item"
                      @click="openRecentFile(item)"
                    >
                      <el-icon class="recent-files-item-icon"><Document /></el-icon>
                      <div class="recent-files-item-main">
                        <div class="recent-files-item-name" :title="item.name">{{ item.name }}</div>
                        <div class="recent-files-item-meta" :title="item.dir">{{ formatRecentTime(item.lastOpenedAt) }}</div>
                      </div>
                      <el-icon class="recent-files-item-close" @click.stop="removeRecentFile(item, $event)"><Close /></el-icon>
                    </div>
                    <div v-if="recentFilesStore.isEmpty" class="recent-files-empty">{{ t('recentFiles.empty') }}</div>
                  </div>
                </div>
              </template>
            </el-dropdown>
          </el-button-group>

          <span class="toolbar-divider" />

          <el-button
            text
            :type="activeMode === 'format-clone' ? 'warning' : 'default'"
            size="default"
            class="bar-btn"
            :disabled="!form.filePath"
            @click="toggleFormatClone"
          >
            <el-icon><CopyDocument /></el-icon>
            <span>{{ activeMode === 'format-clone' ? t('proof.formatClone.backToProof') : t('proof.formatClone.title') }}</span>
          </el-button>

          <template v-if="activeMode !== 'format-clone'">
            <span class="toolbar-divider" />

            <el-select v-model="form.model" :placeholder="t('proof.modePlaceholder')" size="default" class="mode-select bar-select">
              <el-option :label="t('proof.modeWordError')" value="wordError" />
              <el-option :label="t('proof.modeComprehensive')" value="ComprehensiveError" />
              <el-option :label="t('proof.modePolish')" value="polish" />
              <el-option :label="t('proof.modeReduceAI')" value="reduceAI" />
            </el-select>

            <!-- 校对粒度：仅拆分式校对类型可选（polish/reduceAI 固定整篇处理） -->
            <el-select
              v-if="form.model === 'wordError' || form.model === 'ComprehensiveError'"
              v-model="form.proofMode"
              :placeholder="t('proof.proofMode.label')"
              size="default"
              class="proofmode-select bar-select"
            >
              <el-option :label="t('proof.proofMode.auto')" value="" />
              <el-option :label="t('proof.proofMode.full')" value="full" />
              <el-option :label="t('proof.proofMode.section')" value="section" />
              <el-option :label="t('proof.proofMode.sentence')" value="sentence" />
            </el-select>

            <el-dropdown placement="bottom" popper-class="kb-dropdown-popper">
              <el-button
                text
                size="default"
                :class="['kb-button', selectRepository.length > 0 ? 'kb-button-active' : '']"
                :title="t('proof.selectKnowledge')"
              >
                <el-icon><Collection /></el-icon>
                <span v-if="selectRepository.length > 0" class="kb-count-badge">{{ selectRepository.length }}</span>
              </el-button>
              <template #dropdown>
                <div class="kb-dropdown">
                  <div class="kb-dropdown-header">
                    <span class="kb-dropdown-title">
                      <el-icon class="kb-dropdown-title-icon"><Collection /></el-icon>
                      {{ t('proof.selectKnowledge') }}
                    </span>
                    <span v-if="selectRepository.length > 0" class="kb-dropdown-selected-count">
                      {{ t('proof.kbSelectedCount', { count: selectRepository.length }) }}
                    </span>
                  </div>
                  <div class="kb-dropdown-list">
                    <div
                      v-for="value in repositoryList"
                      :key="value"
                      class="kb-dropdown-option"
                      :class="{ 'is-selected': selectRepository.includes(value) }"
                      @click="addRepository(value)"
                    >
                      <el-icon class="kb-option-check">
                        <Select v-if="selectRepository.includes(value)" />
                        <Folder v-else />
                      </el-icon>
                      <span class="kb-option-name">{{ value }}</span>
                    </div>
                    <div v-if="repositoryList.length === 0" class="kb-dropdown-empty">
                      {{ t('proof.kbEmpty') }}
                    </div>
                  </div>
                </div>
              </template>
            </el-dropdown>

            <el-button
              text
              type="primary"
              size="default"
              class="bar-btn bar-btn-strong"
              :disabled="!form.filePath || processing"
              :loading="processing"
              @click="onSubmit"
            >
              <el-icon v-if="!processing"><VideoPlay /></el-icon>
              <span>{{ processing ? t('proof.proofreading') : t('proof.startProof') }}</span>
            </el-button>

            <el-button
              text
              type="success"
              size="default"
              class="bar-btn"
              :disabled="proofreadingResults.length === 0"
              :loading="exporting"
              @click="exportToDocx"
            >
              <el-icon><Download /></el-icon>
              <span>{{ t('proof.exportResult') }}</span>
            </el-button>
          </template>
          <!-- Format clone 的开始/导出按钮已移至 FormatClone.vue 内部 -->
          <template v-else>
          </template>
        </div>
      </div>

      <!-- 自定义窗口控制按钮：融入 action-bar 右端，替代原生悬浮按钮 -->
      <div class="window-controls">
        <button class="win-btn" :title="t('app.window.minimize')" @click="minimizeWindow">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5 H10" stroke="currentColor" stroke-width="1" />
          </svg>
        </button>
        <button
          class="win-btn"
          :title="isMaximized ? t('app.window.restore') : t('app.window.maximize')"
          @click="toggleMaximizeWindow"
        >
          <svg v-if="isMaximized" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" />
            <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" fill="none" stroke="currentColor" stroke-width="1" />
          </svg>
          <svg v-else width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" />
          </svg>
        </button>
        <button class="win-btn win-btn-close" :title="t('app.window.close')" @click="closeWindow">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="currentColor" stroke-width="1" />
          </svg>
        </button>
      </div>
    </div>

    <div class="preview-area">
      <div ref="previewContainer" class="preview-container">
        <div v-if="!fileName" class="preview-empty-wrap">
          <el-empty :description="t('proof.previewFile')" :image-size="80" />
          <div v-if="!recentFilesStore.isEmpty" class="recent-cards">
            <div class="recent-cards-title">
              <el-icon><Files /></el-icon>
              <span>{{ t('recentFiles.cardTitle') }}</span>
            </div>
            <div class="recent-cards-grid">
              <div
                v-for="item in recentCardList"
                :key="item.path"
                class="recent-card"
                @click="openRecentFile(item)"
              >
                <el-icon class="recent-card-icon"><Document /></el-icon>
                <div class="recent-card-body">
                  <div class="recent-card-name" :title="item.name">{{ item.name }}</div>
                  <div class="recent-card-meta" :title="item.dir">{{ formatRecentTime(item.lastOpenedAt) }}</div>
                </div>
                <el-icon class="recent-card-close" @click.stop="removeRecentFile(item, $event)"><Close /></el-icon>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed, provide, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  ElButton,
  ElAlert,
  ElEmpty,
  ElSelect,
  ElOption,
  ElMessage,
  ElMessageBox,
  ElProgress,
  ElTooltip,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElTag,
  ElIcon
} from 'element-plus'
import { renderAsync } from 'docx-preview'
import { fileInfoStore } from '../stores/store'
import { useEmbeddingStore } from '../stores/embeddingStore'
import { useRepositoryStore } from '../stores/repositoryStore'
import { useApiStore } from '../stores/apiStore'
import { useRecentFilesStore, formatRelativeTime } from '../stores/recentFilesStore'
import { Collection, Document, ArrowDown, Select, RefreshLeft, Folder, Clock, Close, Files, FolderOpened, CopyDocument, VideoPlay, Download, ChatDotRound } from '@element-plus/icons-vue'
import { useDark } from '@vueuse/core'
import { requiresBaseURL } from '../../shared/modelProviders'
import {
  applyCorrectionsToPreview,
  clearHighlights,
  getDomPositionFromIndex,
  locateCorrectionsInPreview,
  undoCorrectionsInPreview
} from '../utils/correctionMatching'
import { applyPreviewPerfHints } from '../utils/previewPerf'
import { useWindowControls } from '../composables/useWindowControls'

// ---- 自定义窗口控制按钮（action-bar 右上角，与工具栏融为一体）----
const { isMaximized, minimizeWindow, toggleMaximizeWindow, closeWindow } = useWindowControls()

const electronAPI = window.electronAPI
const router = useRouter()
const { t } = useI18n()
const isDark = useDark()

const previewContainer = inject('previewContainer')
const activeMode = inject('activeMode')
const setActiveMode = inject('setActiveMode')
const isLoading = ref(false)
const error = ref('')
const processing = ref(false)
const exporting = ref(false)
const progressDialogVisible = ref(false)
const progressPercent = ref(0)
const progressStage = ref('splitting')
const progressDetail = ref('')
// 思考内容滚动展示：append 思维链增量，超长时仅保留尾部，容器自动滚到底部
const thinkingText = ref('')
const thinkingBoxRef = ref<HTMLElement | null>(null)
const THINKING_DISPLAY_MAX_CHARS = 4000

const appendThinkingText = text => {
  if (!text) return
  thinkingText.value = (thinkingText.value + text).slice(-THINKING_DISPLAY_MAX_CHARS)
  nextTick(() => {
    const el = thinkingBoxRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
// 单次大请求模式（polish）没有可靠的百分比数据，进度条以流动动画表达进行中
const progressIndeterminate = ref(false)
const progressBarColor = [
  { color: '#d8ebff', percentage: 30 },
  { color: '#b7dcff', percentage: 70 },
  { color: '#8ec5ff', percentage: 100 }
]
let closeProgressTimer = null
let proofreadProgressUnsubscribe = null
let proofreadStreamUnsubscribe = null
let cachedDocxFile = null
let skipWatcherRerender = false

// ---- 流式输出明细（整合进顶部进度条，与状态行滚动交替显示） ----
const streamTotalChars = ref(0)
// 最近一个完成的分段：{ stage, label, count }
const latestSegment = ref(null)
// 交替显示开关：false=原有状态行，true=流式详细信息行
const tickerShowDetail = ref(false)
let tickerTimer = null

// ---- 校对取消 ----
const cancelRequested = ref(false)
let currentRunId = ''

const cancelCurrentProofread = () => {
  if (!processing.value || cancelRequested.value) return
  cancelRequested.value = true
  electronAPI.cancelProofread(currentRunId)
}

const fileStore = fileInfoStore()
const apiSettingsStore = useApiStore()
const embeddingStore = useEmbeddingStore()
const recentFilesStore = useRecentFilesStore()

const fileName = computed(() => fileStore.fileName)
const proofreadingResults = computed({
  get: () => fileStore.results,
  set: val => fileStore.setCorrectResult(val)
})
const form = ref({
  model: fileStore.proofModel,
  filePath: fileStore.filePath,
  // 校对粒度：'' = 默认（wordError 按句、综合按段）；仅 wordError/ComprehensiveError 可调
  proofMode: ''
})

const progressStageText = computed(() => {
  const stageMap = {
    splitting: t('proof.progress.splitting'),
    theme: t('proof.progress.theme'),
    proofreading: t('proof.progress.proofreading'),
    reviewing: t('proof.progress.reviewing'),
    reducing: t('proof.progress.reducing'),
    completed: t('proof.progress.completed')
  }
  return stageMap[progressStage.value] || t('proof.progress.default')
})

// 知识库列表统一从 repositoryStore 读取（与 Dictionary 视图共享同一份状态）。
// 这样在 Dictionary 页删除/新增知识库后，本下拉列表会通过 store 响应式自动更新。
const repositoryStore = useRepositoryStore()
const repositoryList = computed(() => repositoryStore.list)
const selectRepository = ref([])

const normalizeCorrectionType = type => {
  return (type || '').toString().trim().toLowerCase()
}

// 文本定位/高亮/替换的通用逻辑统一在 utils/correctionMatching.js 维护，
// 与 Proof.vue 左侧列表共用同一套匹配口径（含重复文本按出现次序分配的约定）

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
      const { segments: segs, start, end, item, index } = match
      const startPos = getDomPositionFromIndex(segs, start, false)
      const endPos = getDomPositionFromIndex(segs, end, true)
      if (!startPos || !endPos) return
      const range = document.createRange()
      range.setStart(startPos.node, startPos.offset)
      range.setEnd(endPos.node, endPos.offset)
      const highlightEl = document.createElement('span')
      const correctionTypeClass = `highlight-type-${normalizeCorrectionType(item.type)}`
      highlightEl.className = `highlight-correction ${correctionTypeClass}`
      highlightEl.dataset.correctionId = item.id || `correction-${index}`
      // 点击预览高亮 → 请求左侧校对列表聚焦到对应项（反向跳转）
      highlightEl.addEventListener('click', () => fileStore.requestSidebarFocus(index))
      highlightEl.appendChild(range.extractContents())
      range.insertNode(highlightEl)
    })
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

const availableCategories = computed(() => {
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
  const types = new Set()
  proofreadingResults.value.forEach(item => {
    if (!item.applied && !item.rejected && item.type) {
      types.add(item.type)
    }
  })
  return Array.from(types).map(type => ({
    value: type,
    label: typeMap[type] || type
  }))
})

const getCategoryCount = type => {
  const count = proofreadingResults.value.filter(item => !item.applied && !item.rejected && item.type === type).length
  return t('proof.messages.countItems', { count })
}

const applyByCategory = type => {
  const applicableResults = proofreadingResults.value.filter(item => !item.applied && !item.rejected && item.type === type)
  if (applicableResults.length === 0) {
    ElMessage.warning(t('proof.messages.noPendingInCategory'))
    return
  }
  skipWatcherRerender = true
  // 在改动 store 前先取出目标项及其在结果列表中的下标，
  // 供 applyCorrectionsToPreview 按"结果顺序=文档顺序"分配重复文本的出现位置
  const targetList = proofreadingResults.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.applied && !item.rejected && item.type === type)
  const newResults = proofreadingResults.value.map(item => {
    if (!item.applied && item.type === type) {
      return { ...item, applied: true }
    }
    return item
  })
  proofreadingResults.value = newResults
  skipWatcherRerender = false
  const container = previewContainer.value
  if (!container) return
  const replacedCount = applyCorrectionsToPreview(container, targetList)
  highlightCorrections()
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
  skipWatcherRerender = true
  const targetList = proofreadingResults.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.applied && !item.rejected)
  const newResults = proofreadingResults.value.map(item => ({ ...item, applied: true }))
  proofreadingResults.value = newResults
  skipWatcherRerender = false
  const container = previewContainer.value
  if (!container) return
  const replacedCount = applyCorrectionsToPreview(container, targetList)
  if (replacedCount === targetList.length) {
    ElMessage.success(t('proof.messages.appliedAll'))
  } else {
    ElMessage.warning(t('proof.messages.appliedPartial', { replaced: replacedCount, total: applicableResults.length }))
  }
}

const rerenderAndReapply = async () => {
  if (!cachedDocxFile) return
  await renderDocx(cachedDocxFile)
  const container = previewContainer.value
  if (!container) return
  // 重新渲染后一次性重放全部已应用替换：单次定位保证重复文本
  // 各归其位，不会因重复原文而反复替换第一处
  const appliedCorrections = proofreadingResults.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.applied)
  applyCorrectionsToPreview(container, appliedCorrections)
  highlightCorrections()
}

const appliedCategories = computed(() => {
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
  const types = new Set()
  proofreadingResults.value.forEach(item => {
    if (item.applied && item.type) {
      types.add(item.type)
    }
  })
  return Array.from(types).map(type => ({
    value: type,
    label: typeMap[type] || type
  }))
})

const getAppliedCategoryCount = type => {
  const count = proofreadingResults.value.filter(item => item.applied && item.type === type).length
  return t('proof.messages.countItems', { count })
}

const undoByCategory = async type => {
  const appliedResults = proofreadingResults.value.filter(item => item.applied && item.type === type)
  if (appliedResults.length === 0) {
    ElMessage.warning(t('proof.messages.noAppliedChanges'))
    return
  }
  // 原位撤销：把建议文本替换回原文，避免整篇重渲染
  const container = previewContainer.value
  const appliedItems = proofreadingResults.value.filter(item => item.applied)
  const undone = container ? undoCorrectionsInPreview(container, appliedItems, appliedResults) : 0
  fileStore.requestSkipResultRerender()
  const newResults = proofreadingResults.value.map(item => {
    if (item.applied && item.type === type) {
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
  fileStore.requestSkipResultRerender()
  const newResults = proofreadingResults.value.map(item => ({ ...item, applied: false }))
  proofreadingResults.value = newResults
  if (undone !== appliedResults.length) {
    await rerenderAndReapply()
  } else {
    highlightCorrections()
  }
  ElMessage.success(t('proof.messages.undoAllSuccess'))
}

watch(
  () => fileStore.rerenderVersion,
  async () => {
    await rerenderAndReapply()
  }
)

watch(
  () => form.value.model,
  newVal => {
    if (newVal) fileStore.setProofModel(newVal)
  }
)

watch(
  () => form.value.filePath,
  newVal => {
    if (newVal) fileStore.setFilePath(newVal)
  }
)

function unique(arr) {
  return Array.from(new Set(arr))
}

const addRepository = async item => {
  selectRepository.value.push(item)
  selectRepository.value = unique(selectRepository.value)
}

const deleteSelectRepository = async value => {
  selectRepository.value = selectRepository.value.filter(item => item !== value)
}

const deleteAllSelectRepository = async () => {
  selectRepository.value = []
}

const toggleFormatClone = () => {
  setActiveMode(activeMode.value === 'format-clone' ? 'proof' : 'format-clone')
}

const getRepositories = async () => {
  // 统一走 store.refresh()，与 Dictionary 视图共享同一份列表状态。
  return await repositoryStore.refresh()
}

const pushToDB = async resultCorrect => {
  try {
    const filePath = form.value.filePath
    const modelInfo = await electronAPI.getAPISettings()
    const URL = modelInfo.URL
    const modelName = modelInfo.modelName

    if (!filePath) {
      console.warn('文件路径为空，无法保存历史记录')
      return
    }
    if (!URL || !modelName) {
      console.error('API设置不完整，无法保存历史记录')
      return
    }
    if (!resultCorrect || (Array.isArray(resultCorrect) && resultCorrect.length === 0)) {
      console.warn('校对结果为空，无需保存历史记录')
      return
    }

    try {
      const result = await electronAPI.insertOneHistory(filePath, URL, modelName, JSON.stringify(resultCorrect))
      if (result && result.success === false) {
        console.error('保存历史记录失败:', result.error)
        ElMessage({
          message: t('proof.messages.historySaveFailed') + (result.error || ''),
          type: 'error',
          duration: 3000
        })
        return
      }
      console.log('历史记录保存成功:', result)
      ElMessage({
        message: t('proof.messages.historySaveSuccess'),
        type: 'success',
        duration: 1500
      })
    } catch (ipcError) {
      console.error('IPC调用失败:', ipcError)
      ElMessage({
        message: t('proof.messages.historyIpcFailed'),
        type: 'error',
        duration: 3000
      })
      return
    }
  } catch (error) {
    console.error('保存历史记录时发生未预期错误:', error)
    ElMessage({
      message: t('proof.messages.historyUnexpectedError') + error.message,
      type: 'error',
      duration: 3000
    })
  }
}

const clearCloseProgressTimer = () => {
  if (closeProgressTimer) {
    clearTimeout(closeProgressTimer)
    closeProgressTimer = null
  }
}

const stopTicker = () => {
  if (tickerTimer) {
    clearInterval(tickerTimer)
    tickerTimer = null
  }
  tickerShowDetail.value = false
}

const startTicker = () => {
  stopTicker()
  // 原有状态行与流式详细信息行每 3.5 秒上下滚动交替一次；
  // 详细信息为空时 computed 会自动回落到状态行，不产生视觉变化
  tickerTimer = setInterval(() => {
    if (!progressDialogVisible.value || !processing.value) return
    if (detailLine.value) {
      tickerShowDetail.value = !tickerShowDetail.value
    }
  }, 3500)
}

const resetProgressState = () => {
  clearCloseProgressTimer()
  stopTicker()
  progressPercent.value = 0
  progressStage.value = 'splitting'
  progressDetail.value = ''
  progressIndeterminate.value = false
  streamTotalChars.value = 0
  latestSegment.value = null
  cancelRequested.value = false
  thinkingText.value = ''
}

const openProgressDialog = mode => {
  resetProgressState()
  progressDialogVisible.value = true
  // polish 模式是单次全文请求，主进程没有分段进度，改用流动进度条 + 流式接收字数
  progressIndeterminate.value = mode === 'polish'
  startTicker()
}

const closeProgressDialog = () => {
  clearCloseProgressTimer()
  stopTicker()
  closeProgressTimer = setTimeout(() => {
    progressDialogVisible.value = false
    progressDetail.value = ''
    closeProgressTimer = null
  }, 400)
}

const finishProgress = () => {
  progressIndeterminate.value = false
  progressStage.value = 'completed'
  progressDetail.value = ''
  progressPercent.value = 100
  closeProgressDialog()
}

// 面板内每个分段行的标签兜底文案
const stageLabel = stage => {
  const map = {
    theme: t('proof.progress.theme'),
    proofread: t('proof.progress.proofreading'),
    reduce: t('proof.progress.reducing'),
    review: t('proof.progress.reviewing')
  }
  return map[stage] || stage
}

// 状态行：原有进度信息（阶段 + 已完成/总数）；取消请求发出后固定显示取消中
const statusLine = computed(() => {
  if (cancelRequested.value) return t('proof.progress.cancelling')
  const parts = [progressStageText.value]
  if (progressDetail.value) parts.push(progressDetail.value)
  return parts.join(' ')
})

// 详细信息行：流式接收字数 + 最近完成的分段
const detailLine = computed(() => {
  const parts = []
  if (streamTotalChars.value > 0) {
    parts.push(t('proof.stream.charsReceived', { count: streamTotalChars.value }))
  }
  if (latestSegment.value) {
    const seg = latestSegment.value
    const segText = seg.count > 0 ? t('proof.stream.suggestions', { count: seg.count }) : t('proof.stream.segmentClean')
    parts.push(`${seg.label || stageLabel(seg.stage)} ${segText}`)
  }
  return parts.join(' · ')
})

// 当前应显示的行：详细信息存在且轮到它时显示详细信息，否则显示状态
const tickerLine = computed(() =>
  tickerShowDetail.value && detailLine.value ? detailLine.value : statusLine.value
)

const handleProofreadStream = payload => {
  if (!processing.value) return
  if (payload.kind === 'chunk') {
    if (payload.thinking) {
      // 思维链增量：只进思考展示框，不计入正文接收字数
      appendThinkingText(payload.text || '')
      return
    }
    streamTotalChars.value += (payload.text || '').length
  } else if (payload.kind === 'segment') {
    latestSegment.value = {
      stage: payload.stage,
      label: payload.label || '',
      count: typeof payload.corrections === 'number' ? payload.corrections : 0
    }
  }
}

const handleProofreadProgress = payload => {
  if (!progressDialogVisible.value || !processing.value) return
  if (payload.stage) {
    progressStage.value = payload.stage
  }
  if (payload.stage === 'proofreading') {
    if (typeof payload.total === 'number' && payload.total > 0) {
      const completed = typeof payload.completed === 'number' ? payload.completed : 0
      progressDetail.value = `${completed} / ${payload.total}`
    } else {
      progressDetail.value = ''
    }
  } else if (payload.stage === 'reviewing') {
    if (typeof payload.total === 'number' && payload.total > 0) {
      const completed = typeof payload.completed === 'number' ? payload.completed : 0
      progressDetail.value = `${completed} / ${payload.total}`
    } else {
      progressDetail.value = ''
    }
  } else {
    progressDetail.value = ''
  }
  if (typeof payload.percent === 'number') {
    if (payload.stage === 'completed') {
      progressPercent.value = 100
    } else if (payload.stage === 'reviewing') {
      progressPercent.value = Math.max(progressPercent.value, Math.floor(payload.percent))
    } else {
      progressPercent.value = Math.min(95, Math.max(progressPercent.value, Math.floor(payload.percent)))
    }
  }
}

const renderDocx = async file => {
  try {
    if (previewContainer.value) {
      previewContainer.value.innerHTML = ''
      await renderAsync(file, previewContainer.value)
      // 大文档性能：视口外的页面跳过布局/绘制，滚动到时再实时渲染
      applyPreviewPerfHints(previewContainer.value)
    } else {
      throw new Error(t('proof.errors.previewNotInit'))
    }
  } catch (err) {
    error.value = t('proof.errors.renderFailed', { message: err.message })
    console.error('DOCX 渲染错误:', err)
    throw err
  }
}

const selectFileWithMainProcessRead = async () => {
  try {
    isLoading.value = true
    error.value = ''
    const filePath = await electronAPI.selectDocxFile()
    if (!filePath) {
      isLoading.value = false
      return
    }
    const name = filePath.split('\\').pop().split('/').pop()
    await loadFile(filePath, name, { recordRecent: true, errorKey: 'proof.errors.fileFailed' })
  } catch (err) {
    error.value = t('proof.errors.fileFailed', { message: err.message })
    console.error('文件处理错误:', err)
    isLoading.value = false
  }
}

/**
 * 统一的文件加载入口：读取 docx -> 渲染 -> 重置校对结果 ->（可选）记录到最近文件。
 *
 * 抽取自 selectFileWithMainProcessRead，便于"最近文件"快速打开、onMounted 恢复预览
 * 等多个入口复用，避免重复读取/渲染逻辑分散。
 *
 * @param options.recordRecent 是否写入最近文件列表（从最近文件列表点击打开时也传 true，
 *   会刷新 lastOpenedAt；onMounted 恢复预览传 false，避免冷启动被误判为一次"打开"）
 * @param options.errorKey 加载失败时使用的 i18n 错误 key
 * @param options.fromRecent 是否来自最近文件列表入口（用于失败时回退清理该列表项）
 * @returns 是否加载成功
 */
const loadFile = async (
  filePath,
  name,
  options = {}
) => {
  const {
    recordRecent = true,
    errorKey = 'proof.errors.fileFailed',
    fromRecent = false
  } = options
  try {
    isLoading.value = true
    error.value = ''
    fileStore.setFilePath(filePath)
    fileStore.setFileName(name)
    form.value.filePath = filePath
    const fileData = await electronAPI.readDocxFile(filePath)
    const byteCharacters = atob(fileData.content)
    const byteArrays = []
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512)
      const byteNumbers = new Array(slice.length)
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      byteArrays.push(byteArray)
    }
    const blob = new Blob(byteArrays, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    const file = new File([blob], name, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    cachedDocxFile = file
    await renderDocx(file)
    fileStore.setCorrectResult([])
    if (recordRecent) {
      recentFilesStore.addRecent(filePath, name)
    }
    isLoading.value = false
    return true
  } catch (err) {
    isLoading.value = false
    // 来自最近文件列表的打开失败：文件可能已被移动/删除，清理失效项并给出更友好的提示
    if (fromRecent) {
      recentFilesStore.removeRecent(filePath)
      ElMessage.warning(t('recentFiles.openFailed', { name }))
      // 同时清掉 store 中的失效路径，避免右侧还残留一个打不开的文件名
      if (fileStore.filePath === filePath) {
        fileStore.clearAll()
        form.value.filePath = ''
      }
    } else {
      error.value = t(errorKey, { message: err.message })
    }
    console.error('文件加载失败:', err)
    return false
  }
}

/** 相对时间格式化（包装为组件内方法，供模板使用） */
const formatRecentTime = ts => formatRelativeTime(ts, t)

/** 预览区空状态展示的卡片列表（最多 6 条，避免空状态过长） */
const recentCardList = computed(() => recentFilesStore.getList.slice(0, 6))

/** 从最近文件列表点击打开 */
const openRecentFile = item => loadFile(item.path, item.name, { recordRecent: true, fromRecent: true })

/** 从最近文件列表移除单条 */
const removeRecentFile = (item, event) => {
  if (event) {
    event.stopPropagation()
  }
  recentFilesStore.removeRecent(item.path)
  ElMessage.success(t('recentFiles.removed'))
}

/** 清空最近文件列表 */
const clearRecentFiles = async () => {
  if (recentFilesStore.isEmpty) return
  try {
    await ElMessageBox.confirm(t('recentFiles.clearConfirm'), t('recentFiles.clearWarning'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })
    recentFilesStore.clearRecent()
    ElMessage.success(t('recentFiles.cleared'))
  } catch {
    // 用户取消
  }
}

const exportToDocx = async () => {
  if (proofreadingResults.value.length === 0) return
  try {
    exporting.value = true
    const container = previewContainer.value
    if (!container) throw new Error(t('proof.errors.previewEmpty'))
    const exportConfig = {
      originalFilePath: form.value.filePath,
      fileName: fileName.value,
      appliedCorrections: proofreadingResults.value
        .filter(item => item.applied)
        .map(item => ({
          original: item.original,
          suggested: item.suggested,
          applied: item.applied
        }))
    }
    const result = await electronAPI.exportCorrectedDocx(exportConfig)
    if (result?.canceled) {
      return
    }
    if (result?.success) {
      const unmatchedCount = result.unmatchedCount || 0
      ElMessage({
        message:
          t('proof.messages.exportSuccess') +
          (result.filePath || '') +
          (unmatchedCount > 0 ? t('proof.messages.exportUnmatched', { count: unmatchedCount }) : ''),
        type: unmatchedCount > 0 ? 'warning' : 'success',
        duration: unmatchedCount > 0 ? 4000 : 2000
      })
    } else {
      throw new Error(t('proof.messages.exportIncomplete'))
    }
  } catch (err) {
    console.error('导出错误:', err)
    ElMessage({
      message: t('proof.messages.exportFailed') + err.message,
      type: 'error',
      duration: 3000
    })
  } finally {
    exporting.value = false
  }
}

const onSubmit = async () => {
  if (!form.value.filePath) {
    error.value = t('proof.errors.selectDoc')
    return
  }
  if (!form.value.model) {
    error.value = t('proof.errors.selectMode')
    return
  }
  fileStore.setProofModel(form.value.model)

  try {
    processing.value = true
    error.value = ''
    fileStore.setCorrectResult([])
    openProgressDialog(form.value.model)
    progressStage.value = 'splitting'
    // 本次校对任务的取消标识，cancelProofread 依据它精确中止对应任务
    currentRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    let apiURL, apiKey, modelName, provider, parallel, timeLimit_
    const currentApiSettings = apiSettingsStore.selectedApi
    if (currentApiSettings.id && (!currentApiSettings.URL || !currentApiSettings.key)) {
      const foundApi = apiSettingsStore.apiSettings.find(item => item.id === currentApiSettings.id)
      if (foundApi) {
        apiURL = foundApi.apiURL
        apiKey = foundApi.apiKey
        modelName = foundApi.modelName
        provider = foundApi.provider
      }
    } else {
      apiURL = currentApiSettings.URL
      apiKey = currentApiSettings.key
      modelName = currentApiSettings.name
      provider = currentApiSettings.provider
    }
    parallel = apiSettingsStore.selectedApi.parallel || 30
    timeLimit_ = apiSettingsStore.selectedApi.TimeLimit

    const needsUrl = requiresBaseURL(provider) || !provider
    if ((needsUrl && !apiURL) || !apiKey || !modelName) {
      ElMessage({
        message: t('proof.errors.apiIncomplete'),
        type: 'error',
        duration: 3000
      })
      clearCloseProgressTimer()
      stopTicker()
      progressDialogVisible.value = false
      progressDetail.value = ''
      processing.value = false
      return
    }

    await electronAPI.selectAPISetting(
      apiURL,
      apiKey,
      modelName,
      parallel,
      timeLimit_,
      provider,
      apiSettingsStore.selectedApi.requestTimeoutSec ?? null,
      apiSettingsStore.selectedApi.thinkingMode || 'default'
    )

    let results
    let token_usage = 0
    if (selectRepository.value.length > 0) {
      const params = {
        model: form.value.model,
        filePath: form.value.filePath,
        repositoryNameList: [...selectRepository.value]
      }
      const { apiURL: embApiURL, apiKey: embApiKey, modelName: embModelName } = embeddingStore.getAPIConfig
      let preResult = await electronAPI.processDocx(
        params.model,
        params.filePath,
        params.repositoryNameList,
        { apiURL: embApiURL, apiKey: embApiKey, modelName: embModelName },
        timeLimit_,
        apiSettingsStore.selectedApi.parallel,
        apiSettingsStore.reviewModelId ?? null,
        currentRunId,
        form.value.proofMode || undefined,
        apiSettingsStore.reviewEnabled === true
      )
      // 用户取消：主进程中止了在途请求，走取消流程而非报错
      if (preResult?.cancelled) {
        clearCloseProgressTimer()
        stopTicker()
        progressDialogVisible.value = false
        progressDetail.value = ''
        ElMessage({
          message: t('proof.messages.proofCancelled'),
          type: 'info',
          duration: 2500
        })
        return
      }
      if ('message' in preResult && preResult.message) {
        // 主进程返回 message 说明参数或链路有问题：统一走错误提示，避免静默空结果
        clearCloseProgressTimer()
        stopTicker()
        progressDialogVisible.value = false
        progressDetail.value = ''
        if (preResult.message === 'Please select an API setting!') {
          ElMessage({
            message: t('proof.errors.apiKeyRequired'),
            type: 'error',
            duration: 1500
          })
          return
        }
        throw new Error(preResult.message)
      }
      results = preResult.proofResult
      token_usage += preResult.token_usage
      // 失败分片可观测：主进程收集的分片失败（断网/鉴权失败等）在此透出
      if (preResult.failedSegments && preResult.failedSegments.length > 0) {
        console.warn('校对失败分片:', preResult.failedSegments)
        ElMessage({
          message: t('proof.messages.failedSegments', { count: preResult.failedSegments.length }),
          type: 'warning',
          duration: 4000
        })
      }
    } else {
      let preResult = await electronAPI.processDocx(
        form.value.model,
        form.value.filePath,
        undefined,
        undefined,
        timeLimit_,
        apiSettingsStore.selectedApi.parallel,
        apiSettingsStore.reviewModelId ?? null,
        currentRunId,
        form.value.proofMode || undefined,
        apiSettingsStore.reviewEnabled === true
      )
      // 用户取消：主进程中止了在途请求，走取消流程而非报错
      if (preResult?.cancelled) {
        clearCloseProgressTimer()
        stopTicker()
        progressDialogVisible.value = false
        progressDetail.value = ''
        ElMessage({
          message: t('proof.messages.proofCancelled'),
          type: 'info',
          duration: 2500
        })
        return
      }
      if ('message' in preResult && preResult.message) {
        // 主进程返回 message 说明参数或链路有问题：统一走错误提示，避免静默空结果
        clearCloseProgressTimer()
        stopTicker()
        progressDialogVisible.value = false
        progressDetail.value = ''
        if (preResult.message === 'Please select an API setting!') {
          ElMessage({
            message: t('proof.errors.apiKeyRequired'),
            type: 'error',
            duration: 1500
          })
          return
        }
        throw new Error(preResult.message)
      }
      results = preResult.proofResult
      token_usage += preResult.token_usage
      // 失败分片可观测：主进程收集的分片失败（断网/鉴权失败等）在此透出
      if (preResult.failedSegments && preResult.failedSegments.length > 0) {
        console.warn('校对失败分片:', preResult.failedSegments)
        ElMessage({
          message: t('proof.messages.failedSegments', { count: preResult.failedSegments.length }),
          type: 'warning',
          duration: 4000
        })
      }
    }
    apiSettingsStore.addTotalTokens(token_usage)

    ElMessage({
      message: t('proof.messages.processSuccess') + token_usage,
      type: 'success',
      duration: 2000
    })

    finishProgress()
    const finalResults = Array.isArray(results) ? results : []
    const filteredOut = finalResults.filter(item => item.filtered)
    const validResults = finalResults.filter(item => !item.filtered)
    if (filteredOut.length > 0) {
      console.log(
        `审核已过滤 ${filteredOut.length} 条无效建议:`,
        filteredOut.map(r => ({
          original: r.original,
          suggested: r.suggested,
          reason: r.filterReason
        }))
      )
    }
    fileStore.setCorrectResult(
      validResults.map((item, index) => ({
        ...item,
        id: `correction-${index}`,
        applied: false
      }))
    )

    if (validResults.length > 0) {
      await pushToDB(validResults)
    }

    router.push('/proof')
  } catch (err) {
    clearCloseProgressTimer()
    stopTicker()
    progressDialogVisible.value = false
    progressDetail.value = ''
    // 取消过程中止在途请求可能以异常形式冒出，统一按已取消处理
    if (cancelRequested.value) {
      ElMessage({
        message: t('proof.messages.proofCancelled'),
        type: 'info',
        duration: 2500
      })
      return
    }
    error.value = t('proof.errors.processFailed', { message: err.message })
    console.error('校对处理异常:', err)
    ElMessage({
      message: t('proof.errors.processFailed', { message: err.message }),
      type: 'error',
      duration: 3000
    })
  } finally {
    // 注意：这里不能清 closeProgressTimer——finishProgress 安排的 400ms 延迟关闭靠它生效
    processing.value = false
  }
}

const initCorrectStatus = async () => {
  // getter 原误写为 isfilePathEmpty（恒为 undefined→条件恒真），修正为按「已选文件」判断回填
  if (!fileStore.isFilePathEmpty) {
    form.value.filePath = fileStore.getFilePath
  }
  if (!fileStore.isProofModelEmpty) {
    form.value.model = fileStore.getProofModel
  }
}

const initProofreadProgressListener = () => {
  if (proofreadProgressUnsubscribe) {
    proofreadProgressUnsubscribe()
  }
  proofreadProgressUnsubscribe = electronAPI.onProofreadProgress(handleProofreadProgress)
  if (proofreadStreamUnsubscribe) {
    proofreadStreamUnsubscribe()
  }
  proofreadStreamUnsubscribe = electronAPI.onProofreadStream(handleProofreadStream)
}

watch(
  () => fileStore.results,
  async newResults => {
    if (skipWatcherRerender) return
    // 撤销等操作已在预览中原位完成文本回退，标记为无需整篇重渲染
    if (fileStore.consumeSkipResultRerender()) return
    if (newResults.length > 0) {
      // 重新渲染文档再高亮，与重启时 onMounted 行为一致。
      // 直接在旧 DOM 上高亮可能导致含脚注段落的 DOM 结构不一致而匹配失败。
      await rerenderAndReapply()
    }
  }
)

onMounted(async () => {
  if (!window.electronAPI) {
    error.value = t('proof.errors.electronNotReady')
    return
  }
  initProofreadProgressListener()
  // 知识库引擎加载失败（如杀毒软件拦截 vec0.dll）时下拉静默为空，这里显式提示原因
  getRepositories().then(() => {
    if (repositoryStore.lastError) {
      ElMessage.error({ message: repositoryStore.lastError, duration: 0, showClose: true })
    }
  })
  initCorrectStatus()

  if (fileStore.filePath && fileStore.fileName) {
    const ok = await loadFile(fileStore.filePath, fileStore.fileName, {
      // 冷启动恢复：成功则把该文件刷入最近列表（视为一次正常打开），失败则清空 store
      recordRecent: true,
      errorKey: 'proof.errors.fileFailed',
      fromRecent: false
    })
    if (ok && proofreadingResults.value.length > 0) {
      nextTick(() => highlightCorrections())
    } else if (!ok) {
      fileStore.clearAll()
    }
  }
})

onUnmounted(() => {
  clearCloseProgressTimer()
  stopTicker()
  // 页面在校对进行中被离开/关闭时，主动取消后台仍在运行的任务
  if (processing.value && currentRunId) {
    electronAPI.cancelProofread(currentRunId)
  }
  if (proofreadProgressUnsubscribe) {
    proofreadProgressUnsubscribe()
    proofreadProgressUnsubscribe = null
  }
  if (proofreadStreamUnsubscribe) {
    proofreadStreamUnsubscribe()
    proofreadStreamUnsubscribe = null
  }
})
</script>

<style>
html.dark .action-bar {
  background-color: #1d1e1f;
  border-bottom-color: #2c2e30;
}

/* 顶栏分隔线 / 下拉框 hover：暗色适配 */
html.dark .toolbar-divider {
  background-color: #4c4d4f;
}

html.dark .bar-select .el-select__wrapper:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

html.dark .file-name-tag {
  background-color: #1a2740;
  color: #8ec5ff;
}

html.dark .preview-container {
  background-color: #1d1e1f;
  border-color: #2c2e30;
}

html.dark .preview-container section.docx {
  background-color: #1d1e1f;
}

html.dark .preview-container .docx-wrapper {
  background-color: #1d1e1f;
  padding: 0;
}

html.dark .preview-container p,
html.dark .preview-container span,
html.dark .preview-container div,
html.dark .preview-container li,
html.dark .preview-container td,
html.dark .preview-container th {
  color: #e4e7ed !important;
}

html.dark .preview-container h1,
html.dark .preview-container h2,
html.dark .preview-container h3,
html.dark .preview-container h4,
html.dark .preview-container h5,
html.dark .preview-container h6 {
  color: #f2f3f5 !important;
}

html.dark .preview-container table {
  background-color: #1d1e1f !important;
}

html.dark .preview-container td,
html.dark .preview-container th {
  border-color: #2c2e30 !important;
  background-color: transparent !important;
}

html.dark .preview-container tr {
  background-color: transparent !important;
}

html.dark .preview-container ul,
html.dark .preview-container ol {
  color: #e4e7ed;
}

html.dark .preview-container pre,
html.dark .preview-container code {
  background-color: #141414 !important;
  color: #e4e7ed !important;
}

html.dark .preview-container a {
  color: #75c777 !important;
}

/* ---- 最近文件下拉（popper 渲染在 body，需放全局样式） ---- */
.recent-files-dropdown {
  width: 320px;
  padding: 8px 0 0 0;
}

.recent-files-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px 8px 14px;
  border-bottom: 1px solid #edf0f4;
}

.recent-files-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #4a6580;
}

.recent-files-title-icon {
  color: #7b9eb8;
}

.recent-files-count {
  font-size: 11px;
  font-weight: 500;
  color: #9aa4b1;
  background-color: #f4f6f9;
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: 2px;
}

.recent-files-clear {
  font-size: 12px;
  color: #c28a8a;
}

.recent-files-clear:hover {
  color: #b07575;
}

.recent-files-list {
  max-height: 340px;
  overflow-y: auto;
  padding: 4px 0;
}

.recent-files-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.15s ease;
  position: relative;
}

.recent-files-item:hover {
  background-color: #f6faff;
}

.recent-files-item-icon {
  color: #7b9eb8;
  font-size: 16px;
  flex-shrink: 0;
}

.recent-files-item-main {
  flex: 1;
  min-width: 0;
}

.recent-files-item-name {
  font-size: 13px;
  color: #4a6580;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-files-item-meta {
  margin-top: 1px;
  font-size: 11px;
  color: #9aa4b1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-files-item-close {
  color: #c0c4cc;
  font-size: 12px;
  padding: 2px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.recent-files-item:hover .recent-files-item-close {
  opacity: 1;
}

.recent-files-item-close:hover {
  color: #c28a8a;
  background-color: rgba(194, 138, 138, 0.1);
}

.recent-files-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: #9aa4b1;
}

/* 最近文件下拉：暗色模式 */
html.dark .recent-files-dropdown {
  background-color: transparent;
}

html.dark .recent-files-header {
  border-bottom-color: #2c2e30;
}

html.dark .recent-files-title {
  color: #c0c4cc;
}

html.dark .recent-files-count {
  background-color: #252627;
  color: #8a929e;
}

html.dark .recent-files-item:hover {
  background-color: #252525;
}

html.dark .recent-files-item-name {
  color: #c0c4cc;
}

html.dark .recent-files-item-icon {
  color: #7b9eb8;
}

/* 最近文件卡片：暗色模式 */
html.dark .recent-cards-title {
  color: #c0c4cc;
}

html.dark .recent-card {
  background-color: #1d1e1f;
  border-color: #2c2e30;
}

html.dark .recent-card:hover {
  border-color: #3a5a78;
  background-color: #1a2433;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

html.dark .recent-card-name {
  color: #c0c4cc;
}

html.dark .recent-card-icon {
  color: #7b9eb8;
}

html.dark .preview-container blockquote {
  border-left-color: #4c4d4f !important;
  background-color: #141414 !important;
  color: #e4e7ed !important;
}

html.dark .preview-container img {
  filter: brightness(0.9) contrast(1.1);
}

html.dark .preview-container hr {
  border-color: #2c2e30 !important;
}

html.dark .inline-thinking-box {
  border-color: #2c2e30;
  background: #1a1a1a;
}

html.dark .inline-thinking-header {
  color: #8ec5ff;
  border-bottom-color: #2c2e30;
}

html.dark .inline-thinking-content {
  color: #8a8a8a;
}

html.dark .inline-progress-line {
  color: #8ec5ff;
}

html.dark .inline-progress-percent {
  color: #d7e9ff;
}

html.dark .inline-progress-cancelling {
  color: #ffcc80;
}

html.dark .kb-dropdown {
  background-color: #1d1e1f;
}

html.dark .kb-dropdown-header {
  background: linear-gradient(180deg, #232526 0%, #1a1b1c 100%);
  border-bottom-color: #2c2e30;
}

html.dark .kb-dropdown-title {
  color: #e0e6ed;
}

html.dark .kb-dropdown-title-icon {
  color: #8ec5ff;
}

html.dark .kb-dropdown-option {
  color: #c0c4cc;
}

html.dark .kb-dropdown-option:hover {
  background-color: #252627;
  color: #e0e0e0;
}

html.dark .kb-dropdown-option.is-selected {
  background-color: rgba(103, 194, 58, 0.18);
  color: #95d475;
}

html.dark .kb-option-check {
  color: #5c636b;
}

html.dark .kb-dropdown-empty {
  color: #6a6a6a;
}

html.dark .kb-dropdown-list::-webkit-scrollbar-thumb {
  background: #3a3c3e;
}

.inline-progress-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 560px;
  min-width: 300px;
  transition: all 0.3s ease;
  -webkit-app-region: no-drag;
}

/* 思考内容滚动展示框：进度条下方全宽，收到思维链增量时出现 */
.inline-thinking-box {
  flex-basis: 100%;
  margin-top: 6px;
  border: 1px solid #e4e9ef;
  border-radius: 6px;
  background: #f7f9fb;
  overflow: hidden;
}

.inline-thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #7b9eb8;
  border-bottom: 1px solid #e4e9ef;
}

.inline-thinking-content {
  max-height: 120px;
  overflow-y: auto;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.6;
  color: #8a94a0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 状态行与详细信息行的滚动交替显示区：文字右对齐紧贴进度条，
   变长时向左自然延展，区域宽度上限不变 */
.inline-progress-ticker {
  flex: 1;
  min-width: 90px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.inline-progress-line {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 12px;
  font-weight: 500;
  color: #5b7c99;
  overflow: hidden;
  overflow-wrap: anywhere;
  max-width: 100%;
}

.ticker-slide-enter-active,
.ticker-slide-leave-active {
  transition: all 0.3s ease;
}

.ticker-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.ticker-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.inline-progress-bar {
  flex: 1;
  min-width: 60px;
}

.inline-progress-percent {
  font-size: 13px;
  font-weight: 700;
  color: #2f5f8f;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 36px;
  text-align: right;
}

.inline-progress-cancel {
  flex-shrink: 0;
  padding: 4px 8px;
  font-size: 12px;
}

.inline-progress-cancel:hover {
  color: var(--el-color-danger);
}

.inline-progress-cancelling {
  flex-shrink: 0;
  font-size: 12px;
  color: #c0762c;
  white-space: nowrap;
}

.inline-progress-fade-enter-active {
  transition: all 0.3s ease-out;
}

.inline-progress-fade-leave-active {
  transition: all 0.25s ease-in;
}

.inline-progress-fade-enter-from {
  opacity: 0;
  transform: scaleX(0.8);
}

.inline-progress-fade-leave-to {
  opacity: 0;
  transform: scaleX(0.8);
}

/* 知识库下拉面板 */
.kb-dropdown {
  width: 240px;
  background-color: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.kb-dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
  background: linear-gradient(180deg, #f4f8fb 0%, #eef3f7 100%);
  border-bottom: 1px solid #e1e8ee;
}

.kb-dropdown-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #2f4a63;
  letter-spacing: 0.3px;
}

.kb-dropdown-title-icon {
  color: #5b7c99;
  font-size: 15px;
}

.kb-dropdown-selected-count {
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  background-color: #67c23a;
  padding: 2px 8px;
  border-radius: 10px;
  line-height: 1.4;
  white-space: nowrap;
}

.kb-dropdown-list {
  max-height: 260px;
  overflow-y: auto;
  padding: 6px;
}

.kb-dropdown-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #4a5a6a;
  transition: background 0.18s ease, color 0.18s ease;
  user-select: none;
}

.kb-dropdown-option:hover {
  background-color: #f1f6fa;
  color: #2f4a63;
}

.kb-dropdown-option.is-selected {
  background-color: rgba(103, 194, 58, 0.1);
  color: #4e8c3a;
  font-weight: 600;
}

.kb-option-check {
  font-size: 15px;
  color: #a8b8c6;
  flex-shrink: 0;
}

.kb-dropdown-option.is-selected .kb-option-check {
  color: #67c23a;
}

.kb-option-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-dropdown-empty {
  padding: 18px 12px;
  text-align: center;
  font-size: 12px;
  color: #a8b3bd;
}

.kb-dropdown-list::-webkit-scrollbar {
  width: 6px;
}

.kb-dropdown-list::-webkit-scrollbar-thumb {
  background: #cfd9e1;
  border-radius: 3px;
}

.kb-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: #b6c4d0;
}
</style>

<style scoped>
.doc-preview-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}

.error-alert {
  margin: 8px 12px;
  border-radius: 8px;
}

.action-bar {
  position: fixed;
  top: 0;
  left: 52px;
  right: 0;
  height: 52px;
  padding: 0 20px;
  padding-right: 158px; /* 右端留给自定义窗口控制按钮（3×46px + 间距） */
  background-color: #fff;
  border-bottom: 1px solid #e4e7ed;
  z-index: 99;
  -webkit-app-region: drag;
}

/* 自定义窗口控制按钮：嵌入 action-bar 右端（替代原生悬浮按钮，可点击、悬停变色） */
.window-controls {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  display: flex;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 46px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #807e85;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.win-btn:hover {
  background-color: rgba(0, 0, 0, 0.06);
  color: #44444a;
}

.win-btn:active {
  background-color: rgba(0, 0, 0, 0.1);
  color: #44444a;
}

.win-btn-close:hover {
  background-color: #e81123;
  color: #ffffff;
}

.win-btn-close:active {
  background-color: #c50f1f;
  color: #ffffff;
}

html.dark .win-btn {
  color: #a7a7ad;
}

html.dark .win-btn:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: #e0e0e5;
}

html.dark .win-btn:active {
  background-color: rgba(255, 255, 255, 0.13);
  color: #e0e0e5;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 100%;
}

.file-info-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}

.file-name-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  background-color: #f4f6f9;
}

.button-group {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* ---- 顶栏无边框紧凑按钮：图标+文字，hover 以浅底反馈替代描边 ---- */
.bar-btn {
  height: 30px;
  padding: 0 8px;
  margin-left: 0 !important;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
}

.bar-btn .el-icon {
  font-size: 15px;
}

/* 主要操作（开始校正）用主题色文字加重，与普通文字按钮区分 */
.bar-btn-strong {
  font-weight: 600;
}

.bar-btn-strong .el-icon {
  font-size: 16px;
}

/* 分组之间的细分隔线（参照 Office 网页版顶栏） */
.toolbar-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background-color: #dcdfe6;
  flex-shrink: 0;
}

.file-info-container .el-tag,
.file-info-container .el-button {
  -webkit-app-region: no-drag;
}

/* ---- 顶栏下拉框：去边框去底色，宽度随内容自适应（消除文字与箭头间的空白） ---- */
.bar-select {
  --el-select-width: fit-content;
  min-width: 96px;
  max-width: 150px;
}

.bar-select :deep(.el-select__wrapper) {
  min-height: 30px;
  height: 30px;
  padding: 0 8px;
  font-size: 13px;
  border-radius: 6px;
  background-color: transparent;
  box-shadow: none;
}

.bar-select :deep(.el-select__wrapper:hover) {
  background-color: rgba(0, 0, 0, 0.045);
}

.bar-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.kb-button {
  position: relative;
  height: 30px;
  padding: 0 8px;
  transition: all 0.2s ease;
}

.kb-button-active {
  color: #67c23a;
  border-color: #67c23a;
  background-color: rgba(103, 194, 58, 0.08);
}

.kb-count-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background-color: #67c23a;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.preview-area {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.preview-container {
  height: 100%;
  overflow: auto;
  padding: 0px;
  margin: 0;
  background-color: #fff;
  transition: box-shadow 0.2s ease;
}

.preview-container:hover {
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* ---- 「选择文件」分体按钮：主按钮 + 箭头触发器 ---- */
.select-file-split {
  display: inline-flex;
  align-items: stretch;
}

/* 主按钮右缘与箭头触发器贴紧，缩小文字与箭头间距 */
.select-file-split :deep(.el-button:first-child) {
  padding-right: 4px;
}

.select-file-split :deep(.el-button) {
  margin-left: 0 !important;
}

.select-file-split-trigger {
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.select-file-split-trigger .el-icon {
  font-size: 14px;
}

/* ---- 预览区空状态：最近文件卡片 ---- */
.preview-empty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 48px 32px;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}

.recent-cards {
  width: 100%;
  max-width: 720px;
  margin-top: 12px;
}

.recent-cards-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #4a6580;
  margin-bottom: 12px;
  padding-left: 4px;
}

.recent-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.recent-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid #edf0f4;
  border-radius: 8px;
  background-color: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.recent-card:hover {
  border-color: #b7dcff;
  background-color: #f6faff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(123, 158, 184, 0.12);
}

.recent-card-icon {
  color: #7b9eb8;
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.recent-card-body {
  flex: 1;
  min-width: 0;
}

.recent-card-name {
  font-size: 13px;
  font-weight: 600;
  color: #4a6580;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-card-meta {
  margin-top: 2px;
  font-size: 11px;
  color: #9aa4b1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-card-close {
  position: absolute;
  top: 6px;
  right: 6px;
  color: #c0c4cc;
  font-size: 12px;
  padding: 2px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s ease;
}

.recent-card:hover .recent-card-close {
  opacity: 1;
}

.recent-card-close:hover {
  color: #c28a8a;
  background-color: rgba(194, 138, 138, 0.1);
}

@media (max-width: 992px) {
  .button-group {
    flex-direction: column;
    align-items: stretch;
  }

  .mode-select,
  .action-button {
    width: 100%;
  }
}
</style>
