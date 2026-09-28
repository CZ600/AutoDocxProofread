import axios from 'axios'
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useApiStore } from '../stores/apiStore'
import { ModelProvider, getProviderBaseURL } from '../../shared/modelProviders'

interface ApiSettingItem {
  id: number
  apiURL: string
  apiKey: string
  modelName: string
  provider: ModelProvider
}

interface BackendApiItem {
  id: number
  apiURL: string
  apiKey: string
  modelName: string
  provider: ModelProvider
  created_at: string
}

export interface ApiFormData {
  id?: number
  URL: string
  key: string
  name: string
  provider: ModelProvider
}

interface ApiConnectionPayload {
  url: string
  key: string
  modelName: string
  provider: ModelProvider
}

const buildChatCompletionUrl = (url: string) => {
  const normalized = url.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/chat/completions')) {
    return normalized
  }
  return `${normalized}/chat/completions`
}

const normalizeApiPayload = (data: ApiFormData) => ({
  id: data.id,
  URL: data.URL.trim(),
  key: data.key.trim(),
  name: data.name.trim(),
  provider: data.provider || ModelProvider.OPENAI_COMPATIBLE
})

const maskApiKey = (key: string) => {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`
  }
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`
}

// ---- 删除结果横幅：模块级共享 ----
// ApiSelector（自己的 composable 实例）触发删除，横幅由 APISet 页展示，
// 必须跨组件实例共享；置位 4 秒后自动复位，避免横幅永久驻留。
const showAlertSuccess = ref(false)
const showAlertError = ref(false)
const alertTitle = ref('')
let alertResetTimer: ReturnType<typeof setTimeout> | null = null

const showAlertBanner = (type: 'success' | 'error', title: string) => {
  if (alertResetTimer) {
    clearTimeout(alertResetTimer)
  }
  showAlertSuccess.value = type === 'success'
  showAlertError.value = type === 'error'
  alertTitle.value = title
  alertResetTimer = setTimeout(() => {
    showAlertSuccess.value = false
    showAlertError.value = false
    alertResetTimer = null
  }, 4000)
}

export function useApiSettings() {
  const { t } = useI18n()
  const electronAPI = window.electronAPI
  const apiStore = useApiStore()

  const selectedApi = computed({
    get: () => apiStore.selectedApi,
    set: value => {
      apiStore.setSelectedApi(value)
    }
  })

  const apiSettings = apiStore.apiSettings

  const parallelValue = computed({
    get: () => apiStore.selectedApi.parallel || 30,
    set: (value: number) => {
      apiStore.setParallel(value)
    }
  })

  const openTimeLimit = computed({
    get: () => apiStore.selectedApi.TimeLimit != null,
    set: () => undefined
  })

  const timeLimit = computed({
    get: () => apiStore.selectedApi.TimeLimit,
    set: (value: number | null) => {
      apiStore.setTimeLimit(value)
    }
  })

  const fetchAllApiSettings = async () => {
    try {
      const res: any[] = await electronAPI.getALLAPISettings()
      const transformed: ApiSettingItem[] = res.map(item => ({
        id: item.id,
        apiURL: item.apiURL,
        apiKey: item.apiKey,
        modelName: item.modelName,
        provider: item.provider || ModelProvider.OPENAI_COMPATIBLE
      }))
      apiStore.setApiSettings(transformed)
    } catch (error) {
      console.error('获取 API 设置失败:', error)
    }
  }

  const selectApi = async (id: number | null) => {
    if (id === null) {
      apiStore.clearSelectedApi()
      return
    }

    const selectedItem = apiStore.apiSettings.find((item: ApiSettingItem) => item.id === id)
    if (!selectedItem) {
      console.warn(`找不到 ID 为 ${id} 的 API 设置，已清空选择`)
      apiStore.clearSelectedApi()
      return
    }

    const currentSettings = apiStore.selectedApi
    apiStore.setSelectedApi({
      id,
      URL: selectedItem.apiURL || '',
      key: selectedItem.apiKey || '',
      name: selectedItem.modelName || '',
      provider: selectedItem.provider || ModelProvider.OPENAI_COMPATIBLE,
      time: currentSettings.time,
      parallel: currentSettings.parallel || 30,
      TimeLimit: currentSettings.TimeLimit
    })

    await syncApiSettingsToBackend()
  }

  const saveApi = async (data: ApiFormData) => {
    const payload = normalizeApiPayload(data)
    const isEdit = typeof payload.id === 'number'

    try {
      const result = isEdit
        ? await electronAPI.updateAPISetting(
            payload.id as number,
            payload.URL,
            payload.key,
            payload.name,
            payload.provider
        )
        : await electronAPI.APISettings(payload.URL, payload.key, payload.name, payload.provider)

      const success = isEdit ? result === true : result === 'success'

      if (!success) {
        ElMessage.error(isEdit ? t('useApiSettings.apiUpdateFailed') : t('useApiSettings.apiSaveFailed'))
        return false
      }

      await fetchAllApiSettings()

      if (isEdit && apiStore.selectedApi.id === payload.id) {
        apiStore.setSelectedApi({
          URL: payload.URL,
          key: payload.key,
          name: payload.name,
          provider: payload.provider
        })
        await syncApiSettingsToBackend()
      }

      ElMessage.success(isEdit ? t('useApiSettings.apiUpdated') : t('useApiSettings.apiSaved'))
      return true
    } catch (error) {
      console.error(isEdit ? '更新 API 失败:' : '保存 API 失败:', error)
      ElMessage.error(isEdit ? t('useApiSettings.apiUpdateFailed') : t('useApiSettings.apiSaveFailed'))
      return false
    }
  }

  const addApi = async (data: ApiFormData) => saveApi(data)

  const updateApi = async (data: ApiFormData) => {
    if (typeof data.id !== 'number') {
      ElMessage.error(t('useApiSettings.missingApiId'))
      return false
    }
    return saveApi(data)
  }

  const deleteApi = async (id: number) => {
    try {
      const res = await electronAPI.deleteOneAPI(id)
      if (!res.isSuccess) {
        showAlertBanner('error', t('useApiSettings.deleteFailed'))
        ElMessage.error(t('useApiSettings.deleteFailed'))
        return false
      }

      showAlertBanner('success', t('useApiSettings.deleteSuccess'))
      await fetchAllApiSettings()

      if (apiStore.selectedApi.id === id) {
        const currentParallel = apiStore.selectedApi.parallel
        apiStore.clearSelectedApi()
        await electronAPI.selectAPISetting('', '', '', currentParallel, null)
      }

      return true
    } catch (error) {
      console.error('删除 API 失败:', error)
      ElMessage.error(t('useApiSettings.deleteFailed'))
      return false
    }
  }

  const findApiSetting = (id: number) => {
    return apiStore.apiSettings.find(item => item.id === id)
  }

  const testApiConnection = async ({ url, key, modelName, provider }: ApiConnectionPayload) => {
    const trimmedUrl = url.trim()
    const trimmedKey = key.trim()
    const trimmedModelName = modelName.trim()

    if (!trimmedKey || !trimmedModelName) {
      ElMessage.warning(t('useApiSettings.pleaseCompleteAPI'))
      return false
    }

    if (provider === ModelProvider.OPENAI_COMPATIBLE && !trimmedUrl) {
      ElMessage.warning(t('useApiSettings.pleaseCompleteAPI'))
      return false
    }

    try {
      const result = await electronAPI.testAPIWithProvider(provider, trimmedUrl, trimmedKey, trimmedModelName)
      if (result) {
        ElMessage.success(t('useApiSettings.testSuccess'))
        return true
      }
      ElMessage.error(t('useApiSettings.testFailedInvalid'))
      return false
    } catch (error) {
      console.error('测试 API 失败:', error)
      ElMessage.error(t('useApiSettings.testFailed'))
      return false
    }
  }

  const testApi = async () => {
    const currentSettings = apiStore.selectedApi
    return testApiConnection({
      url: currentSettings.URL,
      key: currentSettings.key,
      modelName: currentSettings.name,
      provider: currentSettings.provider || ModelProvider.OPENAI_COMPATIBLE
    })
  }

  const updateParallel = async (value: number) => {
    parallelValue.value = value
    await syncApiSettingsToBackend()
  }

  const toggleTimeLimit = async () => {
    const currentValue = apiStore.selectedApi.TimeLimit

    if (currentValue == null) {
      timeLimit.value = 10
    } else {
      timeLimit.value = null
    }

    await syncApiSettingsToBackend()
  }

  const updateTimeLimit = async (value: number | null) => {
    timeLimit.value = value
    await syncApiSettingsToBackend()
  }

  const syncApiSettingsToBackend = async () => {
    const currentSettings = apiStore.selectedApi
    if (currentSettings.id === null) {
      return
    }

    try {
      await electronAPI.selectAPISetting(
        currentSettings.URL,
        currentSettings.key,
        currentSettings.name,
        currentSettings.parallel,
        currentSettings.TimeLimit,
        // 兼容旧版本 localStorage（可能没有 provider 字段），
        // Electron IPC 不传 undefined，会导致主进程使用默认值 openai_compatible
        currentSettings.provider || ModelProvider.OPENAI_COMPATIBLE
      )
    } catch (error) {
      console.error('同步 API 设置失败:', error)
    }
  }

  const initialize = async () => {
    await fetchAllApiSettings()

    if (apiStore.selectedApi.id) {
      // 重载条件：URL/key 为空，或 provider 缺失（兼容旧版本 localStorage 数据）
      const needsReload =
        !apiStore.selectedApi.URL ||
        !apiStore.selectedApi.key ||
        !apiStore.selectedApi.provider

      if (needsReload) {
        // 从数据库重新加载完整数据（包括 provider）
        await selectApi(apiStore.selectedApi.id)
      } else {
        // 数据完整，同步到主进程
        await syncApiSettingsToBackend()
      }
    }
  }

  watch(
    () => apiStore.selectedApi.id,
    newId => {
      if (newId === null) {
        return
      }

      if (apiStore.apiSettings.length > 0) {
        selectApi(newId)
      } else {
        console.warn('apiSettings 列表为空，忽略本次 API 选择')
      }
    },
    { immediate: true }
  )

  return {
    selectedApi,
    apiSettings,
    parallelValue,
    openTimeLimit,
    timeLimit,
    showAlertSuccess,
    showAlertError,
    alertTitle,
    maskApiKey,
    fetchAllApiSettings,
    selectApi,
    addApi,
    updateApi,
    deleteApi,
    testApi,
    testApiConnection,
    updateParallel,
    toggleTimeLimit,
    updateTimeLimit,
    findApiSetting,
    initialize
  }
}
