<template>
  <el-button-group class="select-file-split">
    <el-button text :loading="loading" size="default" class="bar-btn" @click="emit('select')">
      <el-icon><FolderOpened /></el-icon>
      <span>{{ loading ? t('proof.loading') : t('proof.selectFile') }}</span>
    </el-button>
    <el-dropdown placement="bottom-end" trigger="click" popper-class="recent-files-dropdown-popper">
      <el-button text size="default" class="bar-btn select-file-split-trigger" :title="t('recentFiles.title')">
        <el-icon><ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <div class="recent-files-dropdown">
          <div class="recent-files-header">
            <span class="recent-files-title">
              <el-icon class="recent-files-title-icon"><Clock /></el-icon>
              {{ t('recentFiles.title') }}
              <span v-if="recentFilesStore.count > 0" class="recent-files-count">{{ recentFilesStore.count }}</span>
            </span>
            <el-button v-if="!recentFilesStore.isEmpty" link size="small" class="recent-files-clear" @click="clearRecentFiles">
              {{ t('recentFiles.clear') }}
            </el-button>
          </div>
          <div class="recent-files-list">
            <div
              v-for="item in recentFilesStore.getList"
              :key="item.path"
              class="recent-files-item"
              @click="emit('open', item)"
            >
              <el-icon class="recent-files-item-icon"><Document /></el-icon>
              <div class="recent-files-item-main">
                <div class="recent-files-item-name" :title="item.name">{{ item.name }}</div>
                <div class="recent-files-item-meta" :title="item.dir">{{ formatRecentTime(item.lastOpenedAt) }}</div>
              </div>
              <el-icon class="recent-files-item-close" @click.stop="removeRecentFile(item, $event)"><Close /></el-icon>
            </div>
            <div v-if="recentFilesStore.isEmpty" class="recent-files-empty">{{ t('recentFiles.empty') }}</div>
          </div>
        </div>
      </template>
    </el-dropdown>
  </el-button-group>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { ElButton, ElButtonGroup, ElDropdown, ElIcon, ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Clock, Close, Document, FolderOpened } from '@element-plus/icons-vue'
import { useRecentFilesStore, formatRelativeTime } from '../stores/recentFilesStore'

defineProps({
  /** 选择文件按钮的 loading（父级读取文件期间禁用） */
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'open'])

const { t } = useI18n()
const recentFilesStore = useRecentFilesStore()

/** 相对时间格式化（包装为组件内方法，供模板使用） */
const formatRecentTime = ts => formatRelativeTime(ts, t)

/** 从最近文件列表移除单条 */
const removeRecentFile = (item, event) => {
  if (event) {
    event.stopPropagation()
  }
  recentFilesStore.removeRecent(item.path)
  ElMessage.success(t('recentFiles.removed'))
}

/** 清空最近文件列表 */
const clearRecentFiles = async () => {
  if (recentFilesStore.isEmpty) return
  try {
    await ElMessageBox.confirm(t('recentFiles.clearConfirm'), t('recentFiles.clearWarning'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })
    recentFilesStore.clearRecent()
    ElMessage.success(t('recentFiles.cleared'))
  } catch {
    // 用户取消
  }
}
</script>

<style>
/* 最近文件下拉（popper 渲染在 body，需放全局样式；批次 9 自 DocPreview.vue 迁入） */
.recent-files-dropdown {
  width: 320px;
  padding: 8px 0 0 0;
}

.recent-files-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px 8px 14px;
  border-bottom: 1px solid #edf0f4;
}

.recent-files-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #4a6580;
}

.recent-files-title-icon {
  color: var(--brand);
}

.recent-files-count {
  font-size: 11px;
  font-weight: 500;
  color: #9aa4b1;
  background-color: #f4f6f9;
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: 2px;
}

.recent-files-clear {
  font-size: 12px;
  color: #c28a8a;
}

.recent-files-clear:hover {
  color: #b07575;
}

.recent-files-list {
  max-height: 340px;
  overflow-y: auto;
  padding: 4px 0;
}

.recent-files-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.15s ease;
  position: relative;
}

.recent-files-item:hover {
  background-color: #f6faff;
}

.recent-files-item-icon {
  color: var(--brand);
  font-size: 16px;
  flex-shrink: 0;
}

.recent-files-item-main {
  flex: 1;
  min-width: 0;
}

.recent-files-item-name {
  font-size: 13px;
  color: #4a6580;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-files-item-meta {
  margin-top: 1px;
  font-size: 11px;
  color: #9aa4b1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-files-item-close {
  color: #c0c4cc;
  font-size: 12px;
  padding: 2px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.recent-files-item:hover .recent-files-item-close {
  opacity: 1;
}

.recent-files-item-close:hover {
  color: #c28a8a;
  background-color: rgba(194, 138, 138, 0.1);
}

.recent-files-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: #9aa4b1;
}

/* 最近文件下拉：暗色模式 */
html.dark .recent-files-dropdown {
  background-color: transparent;
}

html.dark .recent-files-header {
  border-bottom-color: #2c2e30;
}

html.dark .recent-files-title {
  color: #c0c4cc;
}

html.dark .recent-files-count {
  background-color: #252627;
  color: #8a929e;
}

html.dark .recent-files-item:hover {
  background-color: #252525;
}

html.dark .recent-files-item-name {
  color: #c0c4cc;
}

html.dark .recent-files-item-icon {
  color: var(--brand);
}
</style>
