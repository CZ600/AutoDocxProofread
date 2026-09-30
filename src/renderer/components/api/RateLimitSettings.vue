<template>
  <div class="rate-limit-block">
    <!-- 卡片一：每分钟请求数上限（频率限制开关 + 限速滑杆） -->
    <div class="setting-section">
      <div class="section-header">
        <el-icon><Timer /></el-icon>
        <span>{{ t('rateLimit.title') }}</span>
        <!-- 说明文字改为悬停提示：与 TokenStatistics 的累计Token问号提示同一样式 -->
        <el-tooltip effect="dark" :content="t('rateLimit.description')" placement="top" popper-class="settings-hint-popper">
          <el-icon class="tooltip-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
      <div class="setting-body">
        <el-button
          :type="openTimeLimit ? 'primary' : 'default'"
          class="toggle-btn"
          :class="{ 'toggle-btn--active': openTimeLimit }"
          @click="handleToggleLimit"
        >
          {{ openTimeLimit ? t('rateLimit.disableLimit') : t('rateLimit.enableLimit') }}
        </el-button>
        <el-slider
          v-if="openTimeLimit"
          :model-value="timeLimit"
          show-input
          :min="1"
          :max="500"
          class="custom-slider"
          @update:model-value="handleTimeLimitChange"
        />
      </div>
    </div>

    <!-- 卡片二：单请求超时（超时判定与失败处理说明） -->
    <div class="setting-section">
      <div class="section-header">
        <el-icon><AlarmClock /></el-icon>
        <span>{{ t('rateLimit.timeoutTitle') }}</span>
      </div>
      <div class="setting-body timeout-row">
        <el-input-number
          :model-value="requestTimeoutSec ?? 300"
          :min="5"
          :max="3600"
          :step="5"
          controls-position="right"
          class="timeout-input"
          @update:model-value="handleTimeoutChange"
        />
        <span class="timeout-hint">{{ t('rateLimit.timeoutHint') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Timer, QuestionFilled, AlarmClock } from '@element-plus/icons-vue'
import { useApiSettings } from '../../composables/useApiSettings'

const { t } = useI18n()
const { openTimeLimit, timeLimit, requestTimeoutSec, toggleTimeLimit, updateTimeLimit, updateRequestTimeout } =
  useApiSettings()

const handleToggleLimit = () => {
  toggleTimeLimit()
}

const handleTimeLimitChange = (value: number) => {
  updateTimeLimit(value)
}

const handleTimeoutChange = (value: number | undefined) => {
  // 输入被清空时恢复默认（null → 主进程 300s 默认值）
  updateRequestTimeout(typeof value === 'number' ? value : null)
}
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: #4a6580;
  margin-bottom: 14px;
}

.section-header .el-icon {
  color: #7b9eb8;
  font-size: 16px;
}

.setting-body {
  padding: 4px 0;
}

/* 悬停提示图标：与 TokenStatistics 的提示符号同一配色 */
.tooltip-icon {
  cursor: help;
  color: #a0b3c4;
  font-size: 15px;
  transition: color 0.25s;
}

.tooltip-icon:hover {
  color: #7b9eb8;
}

/* 组件根：两张子卡片纵向排列，间距与设置组内卡片节奏一致 */
.rate-limit-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toggle-btn {
  min-width: 140px;
  font-weight: 500;
  color: #5b7c99;
  border-color: #c5d3de;
  background: #ffffff;
  transition: all 0.25s ease;
}

.toggle-btn:hover {
  color: #4a6580;
  border-color: #a8bfcf;
  background: #f4f6f9;
}

.toggle-btn--active {
  background-color: #7b9eb8;
  border-color: #7b9eb8;
  color: #ffffff;
}

.toggle-btn--active:hover {
  background-color: #6d8da6;
  border-color: #6d8da6;
  color: #ffffff;
}

.custom-slider {
  margin: 4px 0 0;
  padding: 0;
}

.timeout-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 0;
  flex-wrap: wrap;
}

.timeout-input {
  width: 130px;
}

.timeout-hint {
  font-size: 12px;
  color: #9aa7b4;
}

.custom-slider :deep(.el-slider__runway) {
  height: 4px;
  border-radius: 2px;
  background-color: #e4e9ef;
}

.custom-slider :deep(.el-slider__bar) {
  height: 4px;
  border-radius: 2px;
  background-color: #8eafc4;
}

.custom-slider :deep(.el-slider__button) {
  width: 14px;
  height: 14px;
  background-color: #7b9eb8;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(91, 124, 153, 0.25);
}

.setting-section {
  margin-bottom: 0;
  padding: 16px 18px;
  border-radius: 8px;
  background: #ffffff;
}
</style>

<style>
/* setting-section / section-header / tooltip-icon 的公共暗色适配已收敛至 common.css */
html.dark .toggle-btn {
  color: #8a8a8a;
  border-color: var(--border-color);
  background: var(--bg-page);
}

html.dark .toggle-btn:hover {
  color: #c0c0c0;
  border-color: #3c3e40;
  background: var(--bg-elevated);
}

html.dark .toggle-btn--active {
  background-color: #7b9eb8;
  border-color: #7b9eb8;
  color: #ffffff;
}

html.dark .toggle-btn--active:hover {
  background-color: #6d8da6;
  border-color: #6d8da6;
  color: #ffffff;
}

html.dark .custom-slider .el-slider__runway {
  background-color: var(--border-color);
}

html.dark .custom-slider .el-slider__button {
  border-color: var(--bg-page);
}

html.dark .timeout-hint {
  color: #6f6f6f;
}
</style>
