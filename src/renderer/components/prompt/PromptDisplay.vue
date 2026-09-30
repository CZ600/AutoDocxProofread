<template>
  <div class="setting-section">
    <div class="section-header">
      <el-icon><DataLine /></el-icon>
      <span>{{ t('promptDisplay.title') }}</span>
    </div>
    <div class="prompt-content-wrapper">
      <div class="prompt-meta">
        <span class="prompt-label">{{ t('promptDisplay.currentMode') }}</span>
        <el-tag size="small" class="mode-tag">{{ modeLabel }}</el-tag>
      </div>
      <div class="prompt-label">{{ t('promptDisplay.currentPrompt') }}</div>
      <el-text class="prompt-content">
        {{ effectivePrompt }}
      </el-text>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { DataLine } from '@element-plus/icons-vue'
import { usePrompt } from '../../composables/usePrompt'

const { t } = useI18n()
const { effectivePrompt, settings } = usePrompt()

const modeLabel = computed(() =>
  settings.value.customPromptEnabled ? t('promptDisplay.modeCustomLabel') : t('promptDisplay.modeGeneratedLabel')
)
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

.prompt-content-wrapper {
  padding: 4px 0;
}

.prompt-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.prompt-label {
  font-weight: 600;
  margin-bottom: 12px;
  font-size: 14px;
  color: #4a6580;
}

.mode-tag {
  background-color: #e8eff5;
  border-color: #d5dde5;
  color: #5b7c99;
}

.prompt-content {
  display: block;
  padding: 14px 16px;
  background-color: #f4f6f9;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 13px;
  line-height: 1.8;
  max-height: 260px;
  overflow-y: auto;
  border: none;
  color: #5a6a7a;
}

.prompt-content::-webkit-scrollbar {
  width: 5px;
}

.prompt-content::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.prompt-content::-webkit-scrollbar-thumb {
  background: #c5d3de;
  border-radius: 3px;
}

.prompt-content::-webkit-scrollbar-thumb:hover {
  background: #a8bfcf;
}

.setting-section {
  margin-bottom: 20px;
  padding: 16px 18px;
  border-radius: 8px;
  background: #ffffff;
}
</style>

<style>
/* setting-section / section-header 的公共暗色适配已收敛至 common.css */
html.dark .prompt-label {
  color: #c0c0c0;
}

html.dark .mode-tag {
  background-color: var(--bg-elevated);
  border-color: var(--border-color);
  color: #8a8a8a;
}

html.dark .prompt-content {
  background-color: var(--bg-elevated);
  color: #a0a0a0;
}

html.dark .prompt-content::-webkit-scrollbar-thumb {
  background: #555;
}

html.dark .prompt-content::-webkit-scrollbar-thumb:hover {
  background: #666;
}
</style>
