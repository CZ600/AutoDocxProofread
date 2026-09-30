<template>
  <div class="setting-section">
    <div class="section-header">
      <el-icon><ChatDotRound /></el-icon>
      <span>{{ t('thinking.title') }}</span>
      <!-- 说明文字改为悬停提示：与 TokenStatistics 的累计Token问号提示同一样式 -->
      <el-tooltip effect="dark" :content="t('thinking.description')" placement="top" popper-class="settings-hint-popper">
        <el-icon class="tooltip-icon"><QuestionFilled /></el-icon>
      </el-tooltip>
    </div>
    <div class="setting-body">
      <div class="thinking-row">
        <el-select :model-value="thinkingMode" size="default" class="thinking-select" @update:model-value="handleChange">
          <el-option :label="t('thinking.modeDefault')" value="default" />
          <el-option :label="t('thinking.modeEnabled')" value="enabled" />
          <el-option :label="t('thinking.modeDisabled')" value="disabled" />
        </el-select>
      </div>
      <p class="thinking-hint">{{ t('thinking.hint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChatDotRound, QuestionFilled } from '@element-plus/icons-vue'
import { useApiSettings } from '../../composables/useApiSettings'

const { t } = useI18n()
const { thinkingMode, updateThinkingMode } = useApiSettings()

const handleChange = (value: 'default' | 'enabled' | 'disabled') => {
  updateThinkingMode(value)
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

.thinking-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.thinking-select {
  width: 220px;
}

.thinking-hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #9aa7b4;
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
html.dark .thinking-hint {
  color: #6f6f6f;
}
</style>
