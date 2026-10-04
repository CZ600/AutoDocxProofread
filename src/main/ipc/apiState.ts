/**
 * IPC 各域模块共享的进程内状态：
 * - api_info：当前选中的校对 API（selectAPISetting 写入，proof/format 域读取）
 * - proxy_settings：代理设置（apiSettings 域写入/读取）
 * - resolveReviewApiInfo：审核模型解析（proof 域使用）
 */
import { DB } from '../database'
import { ModelProvider } from '../../shared/modelProviders'
import type { ChatThinkingMode } from '../chat'

export interface apiSettings {
  apiURL: string
  apiKey: string
  modelName: string
  provider?: ModelProvider
  parallel?: number
  /** 每分钟最大请求数（速率限制），null 表示不限 */
  requestsPerMinute?: number | null
  /** 单请求超时（秒），null 表示使用 chat.ts 的默认值 */
  requestTimeoutSec?: number | null
  /** 思考模式：default 跟随服务商默认（注意 DeepSeek 默认开思考），enabled/disabled 显式控制 */
  thinkingMode?: ChatThinkingMode
}

export interface ProxySettings {
  enabled: boolean
  port: number
}

export const api_info: apiSettings = {
  apiURL: '',
  apiKey: '',
  modelName: '',
  provider: ModelProvider.OPENAI_COMPATIBLE,
  parallel: 30,
  requestsPerMinute: null,
  requestTimeoutSec: null,
  thinkingMode: 'default'
}

// 全局代理设置
export const proxy_settings: ProxySettings = {
  enabled: false,
  port: 33210
}

// 解析审核阶段使用的模型：显式选择了审核模型则用之（查库失败回退校对模型），否则用校对模型
export const resolveReviewApiInfo = async (
  reviewModelId?: number | null
): Promise<{ apiKey: string; apiURL: string; modelName: string; provider?: ModelProvider }> => {
  if (reviewModelId != null) {
    const reviewApi = await DB.getAPISettingById(reviewModelId)
    if (reviewApi) {
      return { apiKey: reviewApi.apiKey, apiURL: reviewApi.apiURL, modelName: reviewApi.modelName, provider: reviewApi.provider }
    }
  }
  return { apiKey: api_info.apiKey, apiURL: api_info.apiURL, modelName: api_info.modelName, provider: api_info.provider }
}
