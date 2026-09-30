<template>
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
      <!-- 紧凑布局：开关按钮与超时设置同一行，滑杆条件显示在最下 -->
      <div class="limit-row">
        <el-button
          :type="openTimeLimit ? 'primary' : 'default'"
          @click="handleToggleLimit"
          class="toggle-btn"
          :class="{ 'toggle-btn--active': openTimeLimit }"
        >
          {{ openTimeLimit ? t('rateLimit.disableLimit') : t('rateLimit.enableLimit') }}
        </el-button>
        <div class="timeout-row">
          <span class="timeout-label">{{ t('rateLimit.timeoutLabel') }}</span>
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
      <el-slider
        v-if="openTimeLimit"
        :model-value="timeLimit"
        @update:model-value="handleTimeLimitChange"
        show-input
        :min="1"
        :max="500"
        class="custom-slider"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Timer, QuestionFilled } from '@element-plus/icons-vue'
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

/* 开关按钮与超时设置同行，剩余空间隔开 */
.limit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
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

.timeout-label {
  font-size: 13px;
  color: #5b7c99;
  font-weight: 500;
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
  margin-bottom: 20px;
  padding: 16px 18px;
  border-radius: 8px;
  background: #ffffff;
}
</style>

<style>
html.dark .setting-section {
  background-color: #000000;
}

html.dark .section-header {
  color: #c0c4cc;
}

html.dark .section-header .el-icon {
  color: #8ec5ff;
}

html.dark .tooltip-icon {
  color: #666666;
}

html.dark .tooltip-icon:hover {
  color: #8ec5ff;
}

html.dark .toggle-btn {
  color: #8a8a8a;
  border-color: #2c2e30;
  background: #000000;
}

html.dark .toggle-btn:hover {
  color: #c0c0c0;
  border-color: #3c3e40;
  background: #1a1a1a;
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

html.dark .custom-slider :deep(.el-slider__runway) {
  background-color: #2c2e30;
}

html.dark .custom-slider :deep(.el-slider__button) {
  border-color: #1a1a1a;
}

html.dark .timeout-label {
  color: #8a8a8a;
}

html.dark .timeout-hint {
  color: #6f6f6f;
}
</style>
