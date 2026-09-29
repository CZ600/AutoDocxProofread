// stores/apiStore.ts
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { ModelProvider } from '../../shared/modelProviders'

interface ApiSettings {
  id: number | null
  URL: string
  key: string
  name: string
  provider: ModelProvider
  time: string
  parallel: number
  /** 语义为「每分钟请求数上限」（历史命名 TimeLimit 保持不变以兼容 localStorage） */
  TimeLimit: number | null
  /** 单请求超时（秒），null 表示使用主进程默认值（300s） */
  requestTimeoutSec: number | null
  /** 思考模式：default 跟随服务商默认 / enabled / disabled（DeepSeek 等兼容 thinking 参数的服务） */
  thinkingMode: 'default' | 'enabled' | 'disabled'
}

interface ApiSettingItem {
  id: number
  apiURL: string
  apiKey: string
  modelName: string
  provider: ModelProvider
}

interface TokenUsage {
  totalTokens: number
  requestCount: number
  lastResetTime: string
}

// 默认值作为常量，便于维护
const defaultApiSettings: ApiSettings = {
  id: null,
  URL: '',
  key: '',
  name: '',
  provider: ModelProvider.OPENAI_COMPATIBLE,
  time: '',
  parallel: 30,
  TimeLimit: null,
  requestTimeoutSec: null,
  thinkingMode: 'default'
}

// 审核模型 ID（null 表示与校对模型一致）
const defaultReviewModelId: number | null = null
// 结果复核开关：默认关闭。开启后（未选审核模型时用校对模型）校对完成会自动复核，
// token 消耗约增加一倍——这是有意为之的成本控制，避免每次校对都被动翻倍
const defaultReviewEnabled = false

// 默认 token 使用统计
const defaultTokenUsage: TokenUsage = {
  totalTokens: 0,
  requestCount: 0,
  lastResetTime: new Date().toISOString()
}

export const useApiStore = defineStore(
  'apiSettings',
  () => {
    // 使用默认值初始化
    const selectedApi = reactive<ApiSettings>({ ...defaultApiSettings })
    const tokenUsage = reactive<TokenUsage>({ ...defaultTokenUsage })
    const reviewModelId = ref<number | null>(defaultReviewModelId)
    const reviewEnabled = ref<boolean>(defaultReviewEnabled)

    // API 设置列表
    const apiSettings = reactive<ApiSettingItem[]>([])

    function setSelectedApi(api: Partial<ApiSettings>) {
      Object.assign(selectedApi, api)
    }

    function clearSelectedApi() {
      Object.assign(selectedApi, defaultApiSettings)
    }

    function setParallel(parallelSet: number) {
      selectedApi.parallel = parallelSet
    }

    function setTimeLimit(TimeLimit: number | null) {
      selectedApi.TimeLimit = TimeLimit
    }

    // API 设置列表相关方法
    function setApiSettings(settings: ApiSettingItem[]) {
      apiSettings.splice(0, apiSettings.length)
      settings.forEach(item => apiSettings.push(item))
    }

    function addApiSetting(setting: ApiSettingItem) {
      const index = apiSettings.findIndex(s => s.id === setting.id)
      if (index !== -1) {
        apiSettings[index] = setting
      } else {
        apiSettings.push(setting)
      }
    }

    function removeApiSetting(id: number) {
      const index = apiSettings.findIndex(s => s.id === id)
      if (index !== -1) {
        apiSettings.splice(index, 1)
      }
    }

    function setReviewModelId(id: number | null) {
      reviewModelId.value = id
    }

    function setReviewEnabled(enabled: boolean) {
      reviewEnabled.value = enabled
    }

    function clearReviewModel() {
      reviewModelId.value = null
    }

    // Token 相关方法
    /**
     * 添加 token 使用量
     * @param tokens - 本次使用的 token 数量
     */
    function addTotalTokens(tokens: number) {
      tokenUsage.totalTokens += tokens
      tokenUsage.requestCount += 1
    }

    /**
     * 重置 token 统计
     */
    function resetTokenUsage() {
      Object.assign(tokenUsage, defaultTokenUsage) // 重置整个tokenUsage对象的参数
      tokenUsage.lastResetTime = new Date().toISOString()
    }

    /**
     * 获取 token 使用统计
     */
    function getTokenUsage(): TokenUsage {
      return { ...tokenUsage }
    }

    /**
     * 设置 token 使用量（用于从存储恢复）
     */
    function setTokenUsage(usage: Partial<TokenUsage>) {
      Object.assign(tokenUsage, usage)
    }

    return {
      selectedApi,
      tokenUsage,
      apiSettings,
      reviewModelId,
      reviewEnabled,
      setSelectedApi,
      clearSelectedApi,
      setParallel,
      setTimeLimit,
      setApiSettings,
      addApiSetting,
      removeApiSetting,
      setReviewModelId,
      setReviewEnabled,
      clearReviewModel,
      addTotalTokens,
      resetTokenUsage,
      getTokenUsage,
      setTokenUsage
    }
  },
  {
    persist: {
      key: 'apiSettings',
      storage: localStorage,
      pick: ['selectedApi', 'tokenUsage', 'reviewModelId', 'reviewEnabled']
    }
  }
)
