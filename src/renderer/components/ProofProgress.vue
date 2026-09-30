<template>
  <transition name="inline-progress-fade">
    <div v-if="progressDialogVisible" class="inline-progress-container">
      <div class="inline-progress-ticker">
        <!-- 思考模式：信息位直接滚动展示思维链最新内容；无思维链时回落到状态/详情轮播 -->
        <span
          v-if="thinkingTail"
          class="inline-progress-line inline-progress-line--thinking"
          :title="thinkingTail"
        >{{ thinkingTail }}</span>
        <transition v-else name="ticker-slide" mode="out-in">
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
        @click="requestCancel"
      >
        {{ t('proof.progress.cancel') }}
      </el-button>
      <span v-else class="inline-progress-cancelling">{{ t('proof.progress.cancelling') }}</span>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElButton, ElProgress } from 'element-plus'
import { useApiStore } from '../stores/apiStore'

const props = defineProps({
  /** 校对是否进行中：进度/流式事件的入口守卫（状态在父级，经 prop 只读传入） */
  processing: { type: Boolean, default: false }
})

const emit = defineEmits(['cancel'])

const { t } = useI18n()
const apiSettingsStore = useApiStore()

const progressDialogVisible = ref(false)
const progressPercent = ref(0)
const progressStage = ref('splitting')
const progressDetail = ref('')
// 思考内容：append 思维链增量，超长时仅保留尾部；
// 展示上直接替换进度条旁的信息位（thinkingTail 取最新一段，随增量到达持续滚动）
const thinkingText = ref('')
// 收到的思维链总字符数：用于「已开启思考但未收到思维链」的界面自诊断
const thinkingChars = ref(0)
const THINKING_DISPLAY_MAX_CHARS = 4000
const THINKING_TAIL_CHARS = 160

// 单次大请求模式（polish）没有可靠的百分比数据，进度条以流动动画表达进行中
const progressIndeterminate = ref(false)
const progressBarColor = [
  { color: '#d8ebff', percentage: 30 },
  { color: '#b7dcff', percentage: 70 },
  { color: '#8ec5ff', percentage: 100 }
]

// ---- 流式输出明细（整合进顶部进度条，与状态行滚动交替显示） ----
const streamTotalChars = ref(0)
// 最近一个完成的分段：{ stage, label, count }
const latestSegment = ref(null)
// 交替显示开关：false=原有状态行，true=流式详细信息行
const tickerShowDetail = ref(false)

// ---- 校对取消 ----
const cancelRequested = ref(false)

let closeProgressTimer = null
let proofreadProgressUnsubscribe = null
let proofreadStreamUnsubscribe = null
let tickerTimer = null

const appendThinkingText = text => {
  if (!text) return
  thinkingChars.value += text.length
  thinkingText.value = (thinkingText.value + text).slice(-THINKING_DISPLAY_MAX_CHARS)
}

// 信息位展示的思维链尾部：取最新内容，增量到达时持续前滚
const thinkingTail = computed(() => {
  const text = thinkingText.value.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > THINKING_TAIL_CHARS ? `…${text.slice(-THINKING_TAIL_CHARS)}` : text
})

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
    if (!progressDialogVisible.value || !props.processing) return
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
  thinkingChars.value = 0
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
  // 自诊断：思考档位开启、服务端已有正文输出、但思维链为 0 字 → 服务端未返回 reasoning
  if (thinkingChars.value === 0 && streamTotalChars.value > 0 && (apiSettingsStore.selectedApi.thinkingMode || 'default') === 'enabled') {
    parts.push(t('proof.stream.noThinking'))
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
  if (!props.processing) return
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
  if (!progressDialogVisible.value || !props.processing) return
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

// ---- 对父级的命令式 API ----

/** 开始一轮校对的进度展示；mode=polish 时以流动进度条表达单次大请求 */
const open = mode => {
  resetProgressState()
  progressDialogVisible.value = true
  progressIndeterminate.value = mode === 'polish'
  startTicker()
}

/** 校对完成：满格后延迟收起（400ms 由 closeProgressTimer 承接） */
const finish = () => {
  progressIndeterminate.value = false
  progressStage.value = 'completed'
  progressDetail.value = ''
  progressPercent.value = 100
  clearCloseProgressTimer()
  stopTicker()
  closeProgressTimer = setTimeout(() => {
    progressDialogVisible.value = false
    progressDetail.value = ''
    closeProgressTimer = null
  }, 400)
}

/** 校对取消/参数缺失/异常路径：立即停止并隐藏进度（不等待延迟收起） */
const abort = () => {
  clearCloseProgressTimer()
  stopTicker()
  progressDialogVisible.value = false
  progressDetail.value = ''
}

const requestCancel = () => {
  if (!props.processing || cancelRequested.value) return
  cancelRequested.value = true
  emit('cancel')
}

onMounted(() => {
  proofreadProgressUnsubscribe = window.electronAPI.onProofreadProgress(handleProofreadProgress)
  proofreadStreamUnsubscribe = window.electronAPI.onProofreadStream(handleProofreadStream)
})

onUnmounted(() => {
  clearCloseProgressTimer()
  stopTicker()
  if (proofreadProgressUnsubscribe) {
    proofreadProgressUnsubscribe()
    proofreadProgressUnsubscribe = null
  }
  if (proofreadStreamUnsubscribe) {
    proofreadStreamUnsubscribe()
    proofreadStreamUnsubscribe = null
  }
})

defineExpose({
  open,
  finish,
  abort,
  cancelRequested
})
</script>

<style>
/* 顶部内联进度条（批次 9 自 DocPreview.vue 迁入） */
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

/* 信息位处于思维链展示态：弱化配色，与状态行区分 */
.inline-progress-line--thinking {
  color: #9aa7b4;
  font-weight: 400;
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

html.dark .inline-progress-line--thinking {
  color: #6f7a86;
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
</style>
