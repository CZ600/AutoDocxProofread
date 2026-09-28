<template>
  <div class="dictionary-panel">
    <div class="panel-section">
      <div class="section-header">
        <el-icon><Collection /></el-icon>
        <span>{{ t('dictionary.repoList') }}</span>
      </div>

      <el-select
        v-model="selectform.id"
        :placeholder="t('dictionary.selectApiModel')"
        class="api-select"
        @change="handleApiChange"
        size="small"
        style="margin-bottom: 12px; width: 100%"
      >
        <el-option v-for="item in apiSettings" :key="item.id" :label="item.modelName" :value="item.id">
          <div class="api-option">
            <span class="api-name">{{ item.modelName }}</span>
          </div>
        </el-option>
      </el-select>

      <div class="repository-list">
        <div
          v-for="item in repositoryList"
          :key="item"
          :class="['repo-item', { active: activeIndex === item }]"
          @click="handleSelect(item)"
        >
          <span class="repo-name">{{ item }}</span>
          <el-button size="small" :icon="Delete" circle @click.stop="deleteSelectRepository(item)" class="delete-btn" />
        </div>

        <div v-if="repositoryList.length === 0" class="empty-state">
          <el-empty :description="t('dictionary.noRepos')" :image-size="50" />
        </div>
      </div>

      <el-button type="primary" size="small" class="add-repo-btn" @click="dialogFormVisible = true">
        <el-icon><FolderAdd /></el-icon>
        {{ t('dictionary.addRepo') }}
      </el-button>
    </div>

    <div class="panel-section detail-section" v-if="activeIndex">
      <div class="section-header">
        <span>{{ t('dictionary.currentRepo', { name: activeIndex }) }}</span>
        <el-button size="small" :icon="FolderAdd" @click="addFile" class="btn-success">
          {{ t('dictionary.addFile') }}
        </el-button>
      </div>

      <el-table :data="fileList" size="small" style="width: 100%">
        <el-table-column :label="t('dictionary.fileName')" show-overflow-tooltip>
          <template #default="{ row }">{{ row }}</template>
        </el-table-column>
        <el-table-column :label="t('dictionary.operations')" width="70">
          <template #default="{ row }">
            <el-button size="small" @click.stop="deleteFile(row)" class="btn-danger-sm">
              {{ t('dictionary.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="panel-section welcome-section" v-else>
      <el-empty :description="t('dictionary.welcomeHint')" :image-size="50" />
    </div>
  </div>

  <el-dialog
    v-model="dialogFormVisible"
    :title="t('dictionary.addRepoDialog.title')"
    width="400"
    :close-on-click-modal="false"
    class="morandi-dialog"
  >
    <el-form :model="form" label-width="120px">
      <el-form-item :label="t('dictionary.addRepoDialog.nameLabel')" required>
        <el-input
          v-model="form.repositoryName"
          :placeholder="t('dictionary.addRepoDialog.namePlaceholder')"
          clearable
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogFormVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="addRepositoryWindow" :loading="submitting">
          {{ t('common.confirm') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { Collection, FolderAdd, Delete } from '@element-plus/icons-vue'
import { ref, reactive, onMounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEmbeddingStore } from '../stores/embeddingStore'
import { useRepositoryStore } from '../stores/repositoryStore'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()

const fileStore = useEmbeddingStore()
// 知识库列表改为统一从 repositoryStore 读取（与校对页面 DocPreview 共享同一份状态），
// 这样在本页增删知识库后调 store.refresh()，DocPreview 的下拉列表也会同步更新。
const repositoryStore = useRepositoryStore()
const repositoryList = computed(() => repositoryStore.list)
const activeIndex = ref('')
const electronAPI = window.electronAPI
const dialogFormVisible = ref(false)
const submitting = ref(false)

const form = reactive({
  repositoryName: '',
  modelName: '',
  apiKey: '',
  apiURL: ''
})

const apiSettings = reactive<any[]>([])
const selectform = ref({
  id: null as number | null,
  URL: '',
  key: '',
  name: '',
  time: ''
})

const handleSelect = (index: string) => {
  activeIndex.value = index
}

const handleApiChange = (newId: number | null) => {
  if (newId === null) {
    selectform.value.URL = ''
    selectform.value.key = ''
    selectform.value.name = ''
    return
  }

  const selectedItem = apiSettings.find(item => item.id === newId)
  if (selectedItem) {
    selectform.value.URL = selectedItem.apiURL || ''
    selectform.value.key = selectedItem.apiKey || ''
    selectform.value.name = selectedItem.modelName || ''

    form.apiURL = selectedItem.apiURL || ''
    form.apiKey = selectedItem.apiKey || ''
    form.modelName = selectedItem.modelName || ''

    fileStore.setConfig({
      apiURL: selectform.value.URL,
      apiKey: selectform.value.key,
      modelName: selectform.value.name
    })
  }
}

const getALLAPISettings = async () => {
  try {
    const res = await electronAPI.getALLAPISettings()
    apiSettings.splice(0, apiSettings.length)
    if (Array.isArray(res)) {
      apiSettings.push(...res)
    }
  } catch (error) {
    console.error('获取API设置失败:', error)
  }
}

const initSelect = async () => {
  try {
    const config = fileStore.getAPIConfig

    if (config.apiURL && config.apiKey && config.modelName) {
      selectform.value.URL = config.apiURL
      selectform.value.key = config.apiKey
      selectform.value.name = config.modelName

      form.apiKey = config.apiKey
      form.apiURL = config.apiURL
      form.modelName = config.modelName

      const matchedApi = apiSettings.find(item => item.modelName === config.modelName && item.apiURL === config.apiURL)
      if (matchedApi) {
        selectform.value.id = matchedApi.id
      }
    }
  } catch (error) {
    console.error('初始化API选择失败:', error)
  }
}

const getRepositories = async () => {
  // 统一走 store.refresh()，确保 DocPreview 等共享方也同步拿到最新列表。
  return await repositoryStore.refresh()
}

const addRepositoryWindow = async () => {
  if (!fileStore.isConfigured) {
    ElMessage.error(t('dictionary.messages.selectEmbeddingFirst'))
    return
  }

  const config = fileStore.getAPIConfig

  if (!form.repositoryName.trim()) {
    ElMessage.error(t('dictionary.messages.pleaseInputName'))
    return
  }

  submitting.value = true
  try {
    await electronAPI.createRepository({
      repositoryName: form.repositoryName,
      modelName: config.modelName,
      apiKey: config.apiKey,
      apiURL: config.apiURL
    })
    await getRepositories()
    dialogFormVisible.value = false
    form.repositoryName = ''
    ElMessage.success(t('dictionary.messages.createSuccess'))
  } catch (error) {
    ElMessage.error(t('dictionary.messages.createFailed'))
  } finally {
    submitting.value = false
  }
}

const deleteSelectRepository = async (repositoryName: string) => {
  try {
    await ElMessageBox.confirm(
      t('dictionary.messages.deleteConfirm', { name: repositoryName }),
      t('dictionary.messages.warning'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    await electronAPI.deleteRepository(repositoryName)
    await getRepositories()

    if (activeIndex.value === repositoryName) {
      activeIndex.value = ''
    }

    ElMessage.success(t('dictionary.messages.deleteSuccess'))
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(t('dictionary.messages.deleteFailed'))
    }
  }
}

const fileList = ref<string[]>([])

const loadFileList = async () => {
  if (!activeIndex.value) return
  try {
    const files = await electronAPI.listFilenamesInRepository(activeIndex.value)
    fileList.value = files
  } catch (error) {
    console.error('加载文件列表失败:', error)
    fileList.value = []
  }
}

const addFile = async () => {
  if (!activeIndex.value) {
    ElMessage.warning(t('dictionary.messages.pleaseSelectRepo'))
    return
  }
  try {
    const modelConfig = fileStore.getAPIConfig
    const newConfig = {
      apiURL: modelConfig.apiURL,
      apiKey: modelConfig.apiKey,
      modelName: modelConfig.modelName
    }
    await electronAPI.selectAndProcessPDF(activeIndex.value, newConfig)
    await loadFileList()
    ElMessage.success(t('dictionary.messages.fileAdded'))
  } catch (error) {
    ElMessage.error(t('dictionary.messages.addFileFailed'))
    console.error(error)
  }
}

const deleteFile = async (filename: string) => {
  try {
    await ElMessageBox.confirm(
      t('dictionary.messages.deleteFileConfirm', { name: filename }),
      t('dictionary.messages.warning'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )
    await electronAPI.deleteDocumentByName(activeIndex.value, filename)
    await loadFileList()
    ElMessage.success(t('dictionary.messages.deleteSuccess'))
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(t('dictionary.messages.deleteFailed'))
    }
  }
}

watch(
  activeIndex,
  async newVal => {
    if (newVal) {
      await loadFileList()
    }
  },
  { immediate: true }
)

onMounted(async () => {
  await Promise.all([getRepositories(), getALLAPISettings()])
  await initSelect()
  // 知识库引擎加载失败（如杀毒软件拦截 vec0.dll）时列表静默为空，这里显式提示原因
  if (repositoryStore.lastError) {
    ElMessage.error({ message: repositoryStore.lastError, duration: 0, showClose: true })
  }
})
</script>

<style scoped>
.dictionary-panel {
  padding: 16px 20px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #ffffff;
}

.panel-section {
  background: #ffffff;
  border-radius: 8px;
  padding: 16px 18px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: #4a6580;
  margin-bottom: 12px;
}

.section-header .el-icon {
  color: #7b9eb8;
}

.repository-list {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.repo-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  margin-bottom: 6px;
  border-radius: 6px;
  background: #f4f6f9;
  cursor: pointer;
  transition: all 0.2s;
}

.repo-item:hover {
  background: #edf3f7;
}

.repo-item.active {
  background: #e8eff5;
}

.repo-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #4a6580;
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.3s;
  color: #c28a8a;
}

.delete-btn:hover {
  color: #b07575;
}

.repo-item:hover .delete-btn {
  opacity: 1;
}

.empty-state {
  padding: 12px;
  text-align: center;
}

.add-repo-btn {
  width: 100%;
  border-radius: 6px;
}

.detail-section {
  flex: 1;
  min-height: 0;
}

.detail-section :deep(.el-table__header th) {
  background-color: #f4f6f9;
  color: #4a6580;
  font-weight: 600;
  border-bottom: none;
}

.detail-section :deep(.el-table__row td) {
  border-bottom: 1px solid #edf0f4;
}

.welcome-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.api-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-right: 8px;
}

.api-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-success {
  background-color: #8ab89e;
  border-color: #8ab89e;
  color: #ffffff;
}

.btn-success:hover {
  background-color: #79a88d;
  border-color: #79a88d;
}

.btn-danger-sm {
  color: #c28a8a;
  border-color: #dbc5c5;
  background: #ffffff;
}

.btn-danger-sm:hover {
  color: #b07575;
  border-color: #c9aeae;
  background: #faf5f5;
}

.dialog-footer {
  text-align: right;
}

.repository-list::-webkit-scrollbar {
  width: 5px;
}

.repository-list::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: #c5d3de;
}

.repository-list::-webkit-scrollbar-track {
  background: transparent;
}
</style>

<style>
html.dark .dictionary-panel {
  background-color: #000000;
}

html.dark .panel-section {
  background-color: #000000;
}

html.dark .section-header {
  color: #c0c4cc;
}

html.dark .section-header .el-icon {
  color: #8ec5ff;
}

html.dark .repo-item {
  background: #1a1a1a;
}

html.dark .repo-item:hover {
  background: #252627;
}

html.dark .repo-item.active {
  background: #2a2a2a;
}

html.dark .repo-name {
  color: #c0c4cc;
}

html.dark .detail-section :deep(.el-table__header th) {
  background-color: #1a1a1a;
  color: #c0c4cc;
}

html.dark .detail-section :deep(.el-table__row td) {
  border-bottom-color: #2c2e30;
}

html.dark .repository-list::-webkit-scrollbar-thumb {
  background: #555;
}
</style>
