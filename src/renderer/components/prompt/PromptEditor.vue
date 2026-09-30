<template>
  <div class="prompt-settings">
    <!-- 卡片一：校对参数（错误类型 / 强度 / 背景），选项变化实时反映到提示词预览 -->
    <div class="setting-section">
      <div class="section-header">
        <el-icon><Setting /></el-icon>
        <span>{{ t('promptEditor.title') }}</span>
      </div>

      <el-form label-position="top" class="prompt-form">
        <el-form-item :label="t('promptEditor.errorTypes')" class="form-item">
          <el-checkbox-group v-model="draftSettings.errorTypes" class="checkbox-group">
            <el-checkbox v-for="item in errorTypeOptions" :key="item.value" :label="item.value">
              {{ t('promptEditor.errorTypeOptions.' + item.value) }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item :label="t('promptEditor.intensity')" class="form-item">
          <el-radio-group v-model="draftSettings.intensity" class="radio-group">
            <el-radio-button v-for="item in intensityOptions" :key="item.value" :label="item.value">
              {{ t('promptEditor.intensityOptions.' + item.value) }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="t('promptEditor.background')" class="form-item">
          <el-radio-group v-model="draftSettings.background" class="radio-group">
            <el-radio-button v-for="item in backgroundOptions" :key="item.value" :label="item.value">
              {{ t('promptEditor.backgroundOptions.' + item.value) }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item
          v-if="draftSettings.background === 'custom'"
          :label="t('promptEditor.customBackgroundLabel')"
          class="form-item form-item--last"
        >
          <el-input
            v-model="draftSettings.customBackground"
            type="textarea"
            :rows="3"
            :placeholder="t('promptEditor.customBackgroundPlaceholder')"
          />
        </el-form-item>
      </el-form>
    </div>

    <!-- 卡片二：自定义提示词，开启后完全覆盖上方选项生成的提示词 -->
    <div class="setting-section">
      <div class="section-header">
        <el-icon><EditPen /></el-icon>
        <span>{{ t('promptEditor.customPromptDivider') }}</span>
      </div>

      <div class="custom-mode-row">
        <div class="custom-mode-desc">{{ t('promptEditor.customModeDesc') }}</div>
        <el-switch v-model="draftSettings.customPromptEnabled" />
      </div>

      <el-form
        v-if="draftSettings.customPromptEnabled"
        label-position="top"
        class="prompt-form prompt-form--last"
      >
        <el-form-item :label="t('promptEditor.customPromptLabel')" class="form-item">
          <el-input
            v-model="draftSettings.customPrompt"
            type="textarea"
            :rows="7"
            :placeholder="t('promptEditor.customPromptPlaceholder')"
            class="prompt-textarea"
          />
        </el-form-item>
      </el-form>
    </div>

    <!-- 操作条：两卡共享同一份草稿，统一应用/撤销/重置 -->
    <div class="button-group">
      <el-button :icon="Select" class="btn-save" @click="handleSave">
        {{ t('promptEditor.apply') }}
      </el-button>
      <el-button :icon="RefreshLeft" class="btn-subtle" @click="resetDraft">
        {{ t('promptEditor.undo') }}
      </el-button>
      <el-button :icon="Warning" class="btn-subtle" @click="handleReset">
        {{ t('promptEditor.resetDefault') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RefreshLeft, Select, Setting, EditPen, Warning } from '@element-plus/icons-vue'
import { usePrompt } from '../../composables/usePrompt'
import { clonePromptSettings } from '../../../shared/promptSettings'

const { t } = useI18n()

const { settings, errorTypeOptions, intensityOptions, backgroundOptions, savePromptSettings, resetToDefault } =
  usePrompt()

const draftSettings = ref(clonePromptSettings(settings.value))

watch(
  settings,
  value => {
    draftSettings.value = clonePromptSettings(value)
  },
  { deep: true, immediate: true }
)

const resetDraft = () => {
  draftSettings.value = clonePromptSettings(settings.value)
}

const handleSave = async () => {
  const success = await savePromptSettings(draftSettings.value)
  if (success) {
    resetDraft()
  }
}

const handleReset = async () => {
  const success = await resetToDefault()
  if (success) {
    resetDraft()
  }
}
</script>

<style scoped>
.prompt-form {
  padding: 4px 0;
}

/* 表单标签配色与 APISet 页统一 */
.prompt-form :deep(.el-form-item__label) {
  color: #5a6e80;
  font-weight: 500;
}

.form-item {
  margin-bottom: 24px;
}

/* 卡片内最后一项去掉底部外边距，避免卡内多余空白 */
.form-item--last {
  margin-bottom: 0;
}

.prompt-form--last .form-item {
  margin-bottom: 0;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}

.radio-group :deep(.el-radio-button) {
  margin-right: -1px;
}

.radio-group :deep(.el-radio-button__inner) {
  border-color: #d5dde5;
  color: #6d8299;
  background: #ffffff;
  font-weight: 500;
  box-shadow: none;
  transition: all 0.2s ease;
}

.radio-group :deep(.el-radio-button__inner:hover) {
  color: #4a6580;
  background: #f4f6f9;
}

.radio-group :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--brand);
  border-color: var(--brand);
  color: #ffffff;
  box-shadow: -1px 0 0 0 var(--brand);
}

.radio-group :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-left-color: #d5dde5;
}

.radio-group :deep(.el-radio-button:first-child .el-radio-button__original-radio:checked + .el-radio-button__inner) {
  border-left-color: var(--brand);
}

.custom-mode-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 8px;
  background: #f4f6f9;
  border: none;
}

.custom-mode-desc {
  color: #8a929e;
  line-height: 1.6;
  font-size: 13px;
}

.prompt-textarea {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

/* 操作条：右对齐贴卡片底部，与设置页「保存即所得」的动线一致 */
.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 0;
  flex-wrap: wrap;
}

.btn-save {
  min-width: 140px;
  background-color: var(--brand);
  border-color: var(--brand);
  color: #ffffff;
}

.btn-save:hover {
  background-color: var(--brand-dark);
  border-color: var(--brand-dark);
}

.btn-subtle {
  min-width: 100px;
  color: #6d8299;
  border-color: #d5dde5;
  background: #ffffff;
}

.btn-subtle:hover {
  color: #4a6580;
  border-color: #b8c7d4;
  background: #f4f6f9;
}

@media (max-width: 768px) {
  .custom-mode-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

<style>
/* setting-section / section-header / btn-subtle 的公共暗色适配已收敛至 common.css；
   非 scoped 块不能用 :deep()（浏览器整条丢弃规则），子元素直接写类名 */
html.dark .radio-group .el-radio-button__inner {
  border-color: var(--border-color);
  color: #8a8a8a;
  background: var(--bg-page);
}

html.dark .radio-group .el-radio-button__inner:hover {
  color: #c0c0c0;
  background: var(--bg-elevated);
}

html.dark .custom-mode-row {
  background: var(--bg-elevated);
}

html.dark .custom-mode-title {
  color: #e0e0e0;
}

html.dark .custom-mode-desc {
  color: #a0a0a0;
}
</style>
