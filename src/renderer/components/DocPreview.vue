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
        </div>

        <!-- 校对进度/流式/取消状态机已拆为 ProofProgress.vue，经 ref 命令式驱动 -->
        <ProofProgress ref="progressRef" :processing="processing" @cancel="onProgressCancel" />

        <div class="button-group">
          <RecentFiles :loading="isLoading" @select="selectFileWithMainProcessRead" @open="openRecentFile" />

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

            <KbSelector v-model="selectedRepositories" />

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

      <!-- 自定义窗口控制按钮（action-bar 右端） -->
      <WindowControls />
    </div>

    <div class="preview-area">
      <div ref="previewContainer" class="preview-container" :class="{ 'paper-dark-adapt': paperDarkAdapt }">
        <div v-if="!fileName" class="preview-empty-wrap">
          <el-empty :description="t('proof.previewFile')" :image-size="80" />
          <RecentFileCards @open="openRecentFile" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  ElButton,
  ElAlert,
  ElEmpty,
  ElSelect,
  ElOption,
  ElMessage,
  ElTooltip,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElIcon
} from 'element-plus'
import { renderAsync } from 'docx-preview'
import { fileInfoStore } from '../stores/store'
import { useEmbeddingStore } from '../stores/embeddingStore'
import { useApiStore } from '../stores/apiStore'
import { useRecentFilesStore } from '../stores/recentFilesStore'
import { Document, ArrowDown, Select, RefreshLeft, CopyDocument, VideoPlay, Download } from '@element-plus/icons-vue'
import { useDark } from '@vueuse/core'
import { requiresBaseURL } from '../../shared/modelProviders'
import { applyCorrectionsToPreview } from '../utils/correctionMatching'
import { applyPreviewPerfHints } from '../utils/previewPerf'
import { pushProofreadHistory } from '../utils/proofHistory'
import { useCorrectionActions } from '../composables/useCorrectionActions'
import WindowControls from './WindowControls.vue'
import RecentFiles from './RecentFiles.vue'
import RecentFileCards from './RecentFileCards.vue'
import KbSelector from './KbSelector.vue'
import ProofProgress from './ProofProgress.vue'

const electronAPI = window.electronAPI
const router = useRouter()
const { t } = useI18n()
const isDark = useDark()

// 暗色纸面适配：默认跟随主题（暗色下文档从白底黑字切为黑底白字，与历史行为一致），
// 关闭后文档保持原有白底（所见即所得）。开关入口在设置页「其他」tab。
const paperDarkAdapt = computed(() => isDark.value && fileStore.previewDarkAdapt)

const previewContainer = inject('previewContainer')
const activeMode = inject('activeMode')
const setActiveMode = inject('setActiveMode')
const isLoading = ref(false)
const error = ref('')
const processing = ref(false)
const exporting = ref(false)
// 进度/流式/取消状态机在 ProofProgress.vue 内部，经 ref 命令式驱动
const progressRef = ref(null)
let cachedDocxFile = null

// ---- 校对取消 ----
let currentRunId = ''

const onProgressCancel = () => {
  if (!processing.value) return
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

// 知识库选择器已拆为 KbSelector.vue（选中列表经 v-model 回传，校对提交时使用）
const selectedRepositories = ref([])

// 文本定位/高亮/替换的通用逻辑统一在 utils/correctionMatching.js 与
// utils/highlight.js 维护，与 Proof.vue 左侧列表共用同一套匹配口径
// （含重复文本按出现次序分配的约定）；高亮点击 → 请求侧栏聚焦到对应项（反向跳转）
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

const toggleFormatClone = () => {
  setActiveMode(activeMode.value === 'format-clone' ? 'proof' : 'format-clone')
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
    // IPC 结构化克隆直传字节数组：免去 base64 编码（+33% 体积）与渲染层逐字节解码
    const blob = new Blob([fileData.buffer], {
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

/** 从最近文件列表点击打开（移除单条/清空列表由 RecentFiles 组件内部处理） */
const openRecentFile = item => loadFile(item.path, item.name, { recordRecent: true, fromRecent: true })

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
    progressRef.value?.open(form.value.model)
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
      progressRef.value?.abort()
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

    // 两条链路（知识库 RAG / 直读）仅差第 3、4 个参数，其余处理完全一致，合并为单次调用
    const hasKnowledgeBase = selectedRepositories.value.length > 0
    let embeddingConfig
    if (hasKnowledgeBase) {
      const { apiURL, apiKey, modelName } = embeddingStore.getAPIConfig
      embeddingConfig = { apiURL, apiKey, modelName }
    }
    let preResult = await electronAPI.processDocx(
      form.value.model,
      form.value.filePath,
      hasKnowledgeBase ? [...selectedRepositories.value] : undefined,
      embeddingConfig,
      timeLimit_,
      apiSettingsStore.selectedApi.parallel,
      apiSettingsStore.reviewModelId ?? null,
      currentRunId,
      form.value.proofMode || undefined,
      apiSettingsStore.reviewEnabled === true
    )
    // 用户取消：主进程中止了在途请求，走取消流程而非报错
    if (preResult?.cancelled) {
      progressRef.value?.abort()
      ElMessage({
        message: t('proof.messages.proofCancelled'),
        type: 'info',
        duration: 2500
      })
      return
    }
    if ('message' in preResult && preResult.message) {
      // 主进程返回 message 说明参数或链路有问题：统一走错误提示，避免静默空结果
      progressRef.value?.abort()
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
    const results = preResult.proofResult
    const token_usage = preResult.token_usage
    // 失败分片可观测：主进程收集的分片失败（断网/鉴权失败等）在此透出
    if (preResult.failedSegments && preResult.failedSegments.length > 0) {
      console.warn('校对失败分片:', preResult.failedSegments)
      ElMessage({
        message: t('proof.messages.failedSegments', { count: preResult.failedSegments.length }),
        type: 'warning',
        duration: 4000
      })
    }
    apiSettingsStore.addTotalTokens(token_usage)

    ElMessage({
      message: t('proof.messages.processSuccess') + token_usage,
      type: 'success',
      duration: 2000
    })

    progressRef.value?.finish()
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
      await pushProofreadHistory(form.value.filePath, validResults, t)
    }

    router.push('/proof')
  } catch (err) {
    progressRef.value?.abort()
    // 取消过程中止在途请求可能以异常形式冒出，统一按已取消处理
    if (progressRef.value?.cancelRequested.value) {
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

// 应用/撤销/分类分组等结果动作收敛在 useCorrectionActions（批次 9）；
// 整篇重渲染重放（依赖 cachedDocxFile/renderDocx）作为依赖注入
const {
  highlightCorrections,
  availableCategories,
  getCategoryCount,
  applyByCategory,
  applyALLCorrection,
  appliedCategories,
  getAppliedCategoryCount,
  undoByCategory,
  undoAllCorrections
} = useCorrectionActions({ previewContainer, proofreadingResults, fileStore, t }, { rerenderAndReapply })

const initCorrectStatus = async () => {
  // getter 原误写为 isfilePathEmpty（恒为 undefined→条件恒真），修正为按「已选文件」判断回填
  if (!fileStore.isFilePathEmpty) {
    form.value.filePath = fileStore.getFilePath
  }
  if (!fileStore.isProofModelEmpty) {
    form.value.model = fileStore.getProofModel
  }
}

onMounted(async () => {
  if (!window.electronAPI) {
    error.value = t('proof.errors.electronNotReady')
    return
  }
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
  // 页面在校对进行中被离开/关闭时，主动取消后台仍在运行的任务
  // （进度 IPC 侦听与计时器由 ProofProgress 组件自行清理）
  if (processing.value && currentRunId && !progressRef.value?.cancelRequested.value) {
    electronAPI.cancelProofread(currentRunId)
  }
})
</script>


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
  /* 与 App 侧栏共用 --sidebar-width，避免两处魔法数字漂移 */
  left: var(--sidebar-width);
  right: 0;
  height: 52px;
  padding: 0 20px;
  padding-right: var(--titlebar-reserve); /* 右端预留给自定义窗口控制按钮 */
  background-color: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
  z-index: 99;
  -webkit-app-region: drag;
}

/* 自定义窗口控制按钮样式已随 WindowControls.vue 迁出（批次 9） */

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

/* 顶栏紧凑按钮 .bar-btn 基类见 common.css（批次 9，DocPreview 与 RecentFiles 共用）；
   分体按钮样式已随 RecentFiles.vue 迁出 */

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
  background-color: var(--border-strong);
  flex-shrink: 0;
}

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
  background-color: var(--bg-panel);
  transition: box-shadow 0.2s ease;
}

.preview-container:hover {
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* ---- 预览区空状态：卡片样式已随 RecentFileCards.vue 迁出（批次 9） ---- */
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
