<template>
  <div class="setting-section">
    <div class="section-header">
      <el-icon><Odometer /></el-icon>
      <span>{{ t('concurrency.title') }}</span>
      <!-- 说明文字改为悬停提示：与 TokenStatistics 的累计Token问号提示同一样式 -->
      <el-tooltip effect="dark" :content="t('concurrency.description')" placement="top" popper-class="settings-hint-popper">
        <el-icon class="tooltip-icon"><QuestionFilled /></el-icon>
      </el-tooltip>
    </div>
    <div class="setting-body">
      <el-slider
        :model-value="parallelValue"
        show-input
        :min="1"
        :max="100"
        class="custom-slider"
        @update:model-value="handleParallelChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Odometer, QuestionFilled } from '@element-plus/icons-vue'
import { useApiSettings } from '../../composables/useApiSettings'

const { t } = useI18n()
const { parallelValue, updateParallel } = useApiSettings()

const handleParallelChange = (value: number) => {
  updateParallel(value)
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
  color: var(--brand);
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
  color: var(--brand);
}

.custom-slider {
  margin: 0;
  padding: 0;
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
  background-color: var(--brand);
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
/* setting-section / section-header / tooltip-icon 的公共暗色适配已收敛至 common.css */
html.dark .custom-slider .el-slider__runway {
  background-color: var(--border-color);
}

html.dark .custom-slider .el-slider__button {
  border-color: var(--bg-page);
}
</style>
