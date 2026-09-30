<template>
  <div class="setting-section">
    <div class="section-header">
      <el-icon><Connection /></el-icon>
      <span>{{ t('apiSelector.title') }}</span>
      <!-- 说明文字改为悬停提示：与 TokenStatistics 的累计Token问号提示同一样式 -->
      <el-tooltip effect="dark" :content="t('apiSelector.description')" placement="top" popper-class="settings-hint-popper">
        <el-icon class="tooltip-icon"><QuestionFilled /></el-icon>
      </el-tooltip>
    </div>
    <el-form :model="selectedApi" label-width="auto">
      <el-form-item :label="t('apiSelector.currentAPI')" class="form-item-enhanced">
        <el-select v-model="selectedApi.id" :placeholder="t('apiSelector.selectPlaceholder')" class="api-select">
          <el-option v-for="item in apiSettings" :key="item.id" :label="item.modelName" :value="item.id">
            <div class="api-option">
              <el-popover placement="bottom-start" trigger="hover" :width="320">
                <template #reference>
                  <div class="api-option-info">
                    <el-icon><Cpu /></el-icon>
                    <span>{{ item.modelName }}</span>
                    <el-tag size="small" type="info" class="provider-tag">{{ getProviderName(item.provider) }}</el-tag>
                  </div>
                </template>
                <div class="api-detail-list">
                  <div>
                    <strong>{{ t('apiSelector.model') }}</strong> {{ item.modelName }}
                  </div>
                  <div class="api-url-line">
                    <strong>{{ t('apiSelector.address') }}</strong> {{ item.apiURL || '-' }}
                  </div>
                  <div>
                    <strong>{{ t('apiSelector.apiKey') }}</strong> {{ maskApiKey(item.apiKey) }}
                  </div>
                </div>
              </el-popover>
              <div class="api-option-actions">
                <el-button :icon="Edit" size="small" circle @click.stop="handleEdit(item)" />
                <el-button type="danger" :icon="Delete" size="small" circle @click.stop="handleDelete(item)" />
              </div>
            </div>
          </el-option>
        </el-select>
      </el-form-item>
      <div class="button-group">
        <el-button type="primary" :icon="Plus" class="btn-add" @click="handleAdd">
          {{ t('apiSelector.addNewAPI') }}
        </el-button>
        <el-button :icon="Connection" :loading="testing" class="btn-test" @click="handleTest">
          {{ t('apiSelector.testConnection') }}
        </el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Delete, Edit, Connection, Plus, Cpu, QuestionFilled } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useApiSettings } from '../../composables/useApiSettings'
import { ModelProvider, MODEL_PROVIDERS } from '../../../shared/modelProviders'

const { t } = useI18n()

interface ApiSettingItem {
  id: number
  apiURL: string
  apiKey: string
  modelName: string
  provider: ModelProvider
}

const { selectedApi, apiSettings, deleteApi, maskApiKey, testApi } = useApiSettings()

const testing = ref(false)

const emit = defineEmits<{
  'add-api': []
  'edit-api': [item: { id: number; URL: string; key: string; name: string; provider: ModelProvider }]
}>()

const getProviderName = (provider: ModelProvider) => {
  return MODEL_PROVIDERS[provider]?.name || provider
}

const handleAdd = () => {
  emit('add-api')
}

const handleEdit = (item: ApiSettingItem) => {
  emit('edit-api', {
    id: item.id,
    URL: item.apiURL,
    key: item.apiKey,
    name: item.modelName,
    provider: item.provider || ModelProvider.OPENAI_COMPATIBLE
  })
}

const handleDelete = async (item: ApiSettingItem) => {
  try {
    await ElMessageBox.confirm(
      t('useApiSettings.deleteConfirmMessage', { name: item.modelName }),
      t('useApiSettings.deleteConfirmTitle'),
      {
        confirmButtonText: t('useApiSettings.deleteConfirmOK'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
        draggable: true
      }
    )
  } catch {
    // 用户点击取消
    return
  }
  deleteApi(item.id)
}

const handleTest = async () => {
  if (testing.value) return
  testing.value = true
  try {
    await testApi()
  } finally {
    testing.value = false
  }
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

.form-item-enhanced {
  margin-bottom: 20px;
}

.api-select {
  width: 100%;
}

.api-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 12px;
}

.api-option-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  min-width: 0;
  flex: 1;
}

.provider-tag {
  flex-shrink: 0;
}

.api-option-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.api-detail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  line-height: 1.5;
  word-break: break-all;
}

.api-url-line {
  white-space: normal;
}

.button-group {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.btn-add {
  flex: 1;
  min-width: 140px;
  background-color: #7b9eb8;
  border-color: #7b9eb8;
}

.btn-add:hover {
  background-color: #6d8da6;
  border-color: #6d8da6;
}

.btn-test {
  min-width: 120px;
  color: #5b7c99;
  border-color: #c5d3de;
}

.btn-test:hover {
  color: #4a6580;
  border-color: #a8bfcf;
  background-color: #f4f6f9;
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

html.dark .btn-test {
  color: #8a8a8a;
  border-color: #2c2e30;
}

html.dark .btn-test:hover {
  color: #c0c0c0;
  border-color: #3c3e40;
  background-color: #1a1a1a;
}
</style>
