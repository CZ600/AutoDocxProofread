<template>
  <el-dropdown placement="bottom" popper-class="kb-dropdown-popper">
    <el-button
      text
      size="default"
      :class="['kb-button', modelValue.length > 0 ? 'kb-button-active' : '']"
      :title="t('proof.selectKnowledge')"
    >
      <el-icon><Collection /></el-icon>
      <span v-if="modelValue.length > 0" class="kb-count-badge">{{ modelValue.length }}</span>
    </el-button>
    <template #dropdown>
      <div class="kb-dropdown">
        <div class="kb-dropdown-header">
          <span class="kb-dropdown-title">
            <el-icon class="kb-dropdown-title-icon"><Collection /></el-icon>
            {{ t('proof.selectKnowledge') }}
          </span>
          <span class="kb-dropdown-header-actions">
            <span v-if="modelValue.length > 0" class="kb-dropdown-selected-count">
              {{ t('proof.kbSelectedCount', { count: modelValue.length }) }}
            </span>
            <el-button
              v-if="modelValue.length > 0"
              link
              size="small"
              class="kb-dropdown-clear"
              @click="clearAll"
            >
              {{ t('proof.clear') }}
            </el-button>
          </span>
        </div>
        <div class="kb-dropdown-list">
          <div
            v-for="value in repositoryList"
            :key="value"
            class="kb-dropdown-option"
            :class="{ 'is-selected': modelValue.includes(value) }"
            @click="toggle(value)"
          >
            <el-icon class="kb-option-check">
              <Select v-if="modelValue.includes(value)" />
              <Folder v-else />
            </el-icon>
            <span class="kb-option-name">{{ value }}</span>
          </div>
          <div v-if="repositoryList.length === 0" class="kb-dropdown-empty">
            {{ t('proof.kbEmpty') }}
          </div>
        </div>
      </div>
    </template>
  </el-dropdown>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElButton, ElDropdown, ElIcon, ElMessage } from 'element-plus'
import { Collection, Folder, Select } from '@element-plus/icons-vue'
import { useRepositoryStore } from '../stores/repositoryStore'

const props = defineProps({
  /** 选中的知识库名列表（v-model） */
  modelValue: { type: Array, required: true }
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

// 知识库列表统一从 repositoryStore 读取（与 Dictionary 视图共享同一份状态）。
// 这样在 Dictionary 页删除/新增知识库后，本下拉列表会通过 store 响应式自动更新。
const repositoryStore = useRepositoryStore()
const repositoryList = computed(() => repositoryStore.list)

const toggle = value => {
  const next = props.modelValue.includes(value)
    ? props.modelValue.filter(item => item !== value)
    : [...props.modelValue, value]
  emit('update:modelValue', next)
}

const clearAll = () => {
  emit('update:modelValue', [])
}

onMounted(async () => {
  await repositoryStore.refresh()
  // 知识库引擎加载失败（如杀毒软件拦截 vec0.dll）时下拉静默为空，这里显式提示原因
  if (repositoryStore.lastError) {
    ElMessage.error({ message: repositoryStore.lastError, duration: 0, showClose: true })
  }
})
</script>

<style scoped>
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
</style>

<style>
/* 知识库下拉面板（popper 渲染在 body，需放全局样式；批次 9 自 DocPreview.vue 迁入） */
.kb-dropdown {
  width: 240px;
  background-color: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.kb-dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
  background: linear-gradient(180deg, #f4f8fb 0%, #eef3f7 100%);
  border-bottom: 1px solid #e1e8ee;
}

.kb-dropdown-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #2f4a63;
  letter-spacing: 0.3px;
}

.kb-dropdown-title-icon {
  color: #5b7c99;
  font-size: 15px;
}

.kb-dropdown-selected-count {
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  background-color: #67c23a;
  padding: 2px 8px;
  border-radius: 10px;
  line-height: 1.4;
  white-space: nowrap;
}

.kb-dropdown-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.kb-dropdown-clear {
  font-size: 12px;
  color: #c28a8a;
  padding: 2px 4px;
}

.kb-dropdown-clear:hover {
  color: #b07575;
  background-color: transparent;
}

.kb-dropdown-list {
  max-height: 260px;
  overflow-y: auto;
  padding: 6px;
}

.kb-dropdown-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #4a5a6a;
  transition: background 0.18s ease, color 0.18s ease;
  user-select: none;
}

.kb-dropdown-option:hover {
  background-color: #f1f6fa;
  color: #2f4a63;
}

.kb-dropdown-option.is-selected {
  background-color: rgba(103, 194, 58, 0.1);
  color: #4e8c3a;
  font-weight: 600;
}

.kb-option-check {
  font-size: 15px;
  color: #a8b8c6;
  flex-shrink: 0;
}

.kb-dropdown-option.is-selected .kb-option-check {
  color: #67c23a;
}

.kb-option-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-dropdown-empty {
  padding: 18px 12px;
  text-align: center;
  font-size: 12px;
  color: #a8b3bd;
}

.kb-dropdown-list::-webkit-scrollbar {
  width: 6px;
}

.kb-dropdown-list::-webkit-scrollbar-thumb {
  background: #cfd9e1;
  border-radius: 3px;
}

.kb-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: #b6c4d0;
}

/* 知识库下拉：暗色模式 */
html.dark .kb-dropdown {
  background-color: #1d1e1f;
}

html.dark .kb-dropdown-header {
  background: linear-gradient(180deg, #232526 0%, #1a1b1c 100%);
  border-bottom-color: #2c2e30;
}

html.dark .kb-dropdown-title {
  color: #e0e6ed;
}

html.dark .kb-dropdown-title-icon {
  color: #8ec5ff;
}

html.dark .kb-dropdown-clear {
  color: #a3716f;
}

html.dark .kb-dropdown-clear:hover {
  color: #c28a8a;
  background-color: transparent;
}

html.dark .kb-dropdown-option {
  color: #c0c4cc;
}

html.dark .kb-dropdown-option:hover {
  background-color: #252627;
  color: #e0e0e0;
}

html.dark .kb-dropdown-option.is-selected {
  background-color: rgba(103, 194, 58, 0.18);
  color: #95d475;
}

html.dark .kb-option-check {
  color: #5c636b;
}

html.dark .kb-dropdown-empty {
  color: #6a6a6a;
}

html.dark .kb-dropdown-list::-webkit-scrollbar-thumb {
  background: #3a3c3e;
}
</style>
