<template>
  <div class="setting-section">
    <div class="section-header">
      <el-icon><ChatDotRound /></el-icon>
      <span>{{ t('thinking.title') }}</span>
    </div>
    <div class="setting-body">
      <p class="section-description">
        <el-icon><InfoFilled /></el-icon>
        {{ t('thinking.description') }}
      </p>
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
import { ChatDotRound, InfoFilled } from '@element-plus/icons-vue'
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
  color: #7b9eb8;
  font-size: 16px;
}

.setting-body {
  padding: 4px 0;
}

.section-description {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 15px;
  margin-top: 0;
  padding: 10px 14px;
  background-color: #f4f6f9;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
  color: #7a8694;
  border: none;
}

.section-description .el-icon {
  color: #8eafc4;
  margin-top: 2px;
  flex-shrink: 0;
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
html.dark .setting-section {
  background-color: #000000;
}

html.dark .section-header {
  color: #c0c4cc;
}

html.dark .section-header .el-icon {
  color: #8ec5ff;
}

html.dark .section-description {
  background-color: #1a1a1a;
  color: #a0a0a0;
}

html.dark .section-description .el-icon {
  color: #8ec5ff;
}

html.dark .thinking-hint {
  color: #6f6f6f;
}
</style>
