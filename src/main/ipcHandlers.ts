import { ipcMain, session, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { dialog } from 'electron'
import * as path from 'path'
import fs from 'fs'
import { DB } from './database'
import { maskKey } from './apiKeyCrypto'
import { writeLog } from './logger'
import { testAPI, testAPIWithProvider, setRequestTimeoutMs, setThinkingMode, ChatThinkingMode } from './chat'
import { shouldRunReview } from './reviewGate'
import { ModelProvider, getProviderBaseURL, requiresBaseURL } from '../shared/modelProviders'
import {
  proofreadDocument,
  reduceAIDetectionDocument,
  getDefaultPrompt,
  setNewPrompt,
  getPromptSettings,
  setPromptSettings,
  getEffectivePrompt,
  resetPromptSettings,
  reviewCorrections,
  getCurrentBackgroundInstruction,
  setLocale,
  createStreamSink,
  ProofreadStreamSink,
  createProofreadCancelToken,
  ProofreadCancelToken
} from './proof'
import { deleteDocumentByName, listFilenamesInRepository } from './lancedb'
import * as mammoth from 'mammoth'
import { replaceTextInDocx } from './wordProcess'
import { cloneFormat, extractFormatProfile, cloneFormatWithProfile, cloneFormatWithProfileForce } from './formatClone'
import { formatDescriptionToProfile } from './formatFromDesc'
import { SmartFormatAgent } from './smartFormatAgent'
import { ParagraphType } from './smartFormatApply'
import {
  deleteRepository,
  initLanceDB,
  insertDocument,
  queryDocuments,
  updateDocument,
  deleteDocument,
  listRepositories,
  createRepository
} from './lancedb'
import { processDocument, getPDFDocumentChunks } from './pdfUtils'
import { env } from 'process'
import { ProofreadProgressPayload, ProofreadStreamPayload, ProofreadMode } from '../shared/proofreadProgress'
// const { platform, arch, env } = process;
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

const api_info: apiSettings = {
  apiURL: '',
  apiKey: '',
  modelName: '',
  provider: ModelProvider.OPENAI_COMPATIBLE,
  parallel: 30,
  requestsPerMinute: null,
  requestTimeoutSec: null,
  thinkingMode: 'default'
}

// 解析审核阶段使用的模型：显式选择了审核模型则用之（查库失败回退校对模型），否则用校对模型
const resolveReviewApiInfo = async (
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

// 全局代理设置
const proxy_settings: ProxySettings = {
  enabled: false,
  port: 33210
}

const PROOFREAD_PROGRESS_CHANNEL = 'proofread-progress'
const PROOFREAD_STREAM_CHANNEL = 'proofread-stream'

// 活跃校对任务的取消令牌：runId → token。
// 渲染端发起校对时生成 runId 一并传入，取消时按 runId 精确中止对应任务
const activeProofreadTokens = new Map<string, ProofreadCancelToken>()

// 校对粒度可选值与解析规则：
// polish/reduceAI 固定整篇处理；其余类型默认 wordError=按句、ComprehensiveError=按段，
// 前端可通过 proofMode 参数覆盖（此前该能力在共享层定义了却无任何入口）
const PROOF_MODES: ProofreadMode[] = ['full', 'section', 'sentence']
const resolveProofMode = (model: string, requested?: string): ProofreadMode => {
  if (model === 'polish' || model === 'reduceAI') return 'full'
  if (requested && PROOF_MODES.includes(requested as ProofreadMode)) {
    return requested as ProofreadMode
  }
  return model === 'ComprehensiveError' ? 'section' : 'sentence'
}

// 全局embedding_api变量已移除，由Pinia store管理
export const registerIpcHandlers = () => {
  // 窗口控制：配合渲染层自定义标题栏按钮（top-toolbar 右上角的最小化/最大化/关闭）
  const getWindow = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender)
  ipcMain.handle('window:minimize', (event) => {
    getWindow(event)?.minimize()
  })
  ipcMain.handle('window:toggleMaximize', (event) => {
    const win = getWindow(event)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return win.isMaximized()
  })
  ipcMain.handle('window:close', (event) => {
    getWindow(event)?.close()
  })
  ipcMain.handle('window:isMaximized', (event) => {
    return getWindow(event)?.isMaximized() ?? false
  })

  // 单向通信：接收渲染进程的消息
  // 监听消息，通道是message
  ipcMain.on('message', (event, message: string) => {
    console.log('Received message', message)
  })

  // 双向通信：接收渲染进程的消息，并返回结果
  ipcMain.handle('receiveAndReturn', (event, message: string) => {
    console.log('receiveAndReturn', message)

    // 想返回什么都可以
    const ret = {
      rawData: message,
      newData: `neight-peiqi${message}`
    }
    return ret
  })
  const path = require('path')
  // 处理文件选择请求
  ipcMain.handle('select-docx-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择 DOCX 文件',
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      // 返回文件路径
      return result.filePaths[0]
    } catch (error) {
      console.error('文件选择错误:', error)
      throw error
    }
  })

  // 处理文件读取请求（可选，如果需要主进程读取文件内容）
  ipcMain.handle('read-docx-file', async (event, filePath) => {
    try {
      const data = await fs.promises.readFile(filePath)
      // 结构化克隆直传字节数组：避免 base64 编码带来的 +33% 体积
      // 与渲染层逐字节解码开销（20MB 级文档提升明显）
      return {
        path: filePath,
        buffer: data
      }
    } catch (error) {
      console.error('cannot read file:', error)
      throw error
    }
  })

  // 从 .docx 文件中提取纯文本（主进程执行 mammoth）
  ipcMain.handle('extract-docx-text', async (event, filePath) => {
    try {
      const data = await fs.promises.readFile(filePath)
      const result = await mammoth.extractRawText({ buffer: data })
      return { success: true, text: result.value || '' }
    } catch (error: any) {
      console.error('extract-docx-text failed:', error)
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('set-api', async (event, URL, Key, modelName, provider = ModelProvider.OPENAI_COMPATIBLE) => {
    try {
      console.log('add a new api setting:', URL, maskKey(Key), modelName, provider)
      api_info.apiKey = Key
      api_info.apiURL = URL
      api_info.modelName = modelName
      api_info.provider = provider
      const result = await DB.insertAPISetting(URL, Key, modelName, provider)
      console.log('the result of the new api setting adding:', result)
      if (result) {
        return 'success'
      } else {
        return 'error'
      }
    } catch (error) {
      return 'error'
    }
  })
  // 获取所有api设置
  ipcMain.handle('update-api', async (event, id, URL, Key, modelName, provider) => {
    try {
      console.log('update api setting:', id, URL, maskKey(Key), modelName, provider)
      api_info.apiKey = Key
      api_info.apiURL = URL
      api_info.modelName = modelName
      if (provider) api_info.provider = provider
      return await DB.updateAPISettingById(id, URL, Key, modelName, provider)
    } catch (error) {
      console.error('update api setting failed:', error)
      return false
    }
  })

  ipcMain.handle('get-all-api-settings', async event => {
    return await DB.getAllAPISettings()
  })

  ipcMain.handle('delete-one-api-setting', async (event, id) => {
    const result = await DB.deleteAPISettingById(id)
    if (result) {
      return {
        isSuccess: true
      }
    } else {
      return {
        isSuccess: false
      }
    }
  })

  ipcMain.handle('test-api', async (event, URL, Key, modelName) => {
    if (!URL || !Key || !modelName) {
      console.log('Please input all the parameters!')
      return false
    } else {
      console.log('Testing API:', URL, maskKey(Key), modelName)
    }
    const result = await testAPI(URL, Key, modelName)
    return result
  })

  ipcMain.handle('test-api-with-provider', async (event, provider, URL, Key, modelName) => {
    if (!Key || !modelName) {
      console.log('Please input all the parameters!')
      return false
    } else {
      console.log('Testing API with provider:', provider, URL, maskKey(Key), modelName)
    }
    const result = await testAPIWithProvider(provider, URL, Key, modelName)
    return result
  })

  ipcMain.handle(
    'selectAPISetting',
    async (
      event,
      URL,
      Key,
      modelName,
      parallel = 30,
      requestsPerMinute = null,
      provider = ModelProvider.OPENAI_COMPATIBLE,
      requestTimeoutSec = null,
      thinkingMode: ChatThinkingMode = 'default'
    ) => {
      api_info.apiKey = Key
      api_info.apiURL = URL
      api_info.modelName = modelName
      api_info.provider = provider
      api_info.parallel = parallel
      // 历史参数名 TimeLimit 实际语义是「每分钟请求数上限」，已按语义更名
      api_info.requestsPerMinute = requestsPerMinute
      api_info.requestTimeoutSec = requestTimeoutSec
      api_info.thinkingMode = thinkingMode === 'enabled' || thinkingMode === 'disabled' ? thinkingMode : 'default'
      console.log('Selected API:', URL, maskKey(Key), modelName, parallel, requestsPerMinute, provider, requestTimeoutSec, api_info.thinkingMode)
      return true
    }
  )

  ipcMain.handle('get-api-settings', async event => {
    return {
      URL: api_info.apiURL,
      Key: api_info.apiKey,
      modelName: api_info.modelName,
      provider: api_info.provider,
      parallel: api_info.parallel || 30,
      requestsPerMinute: api_info.requestsPerMinute,
      requestTimeoutSec: api_info.requestTimeoutSec,
      thinkingMode: api_info.thinkingMode
    }
  })

  // 处理文档校对请求
  // 更新了对于rag功能的支持，实现了并行操作，提升性能
  ipcMain.handle(
    'process-docx',
    async (
      event,
      Model,
      filePath,
      repositoryNameList?: string[],
      embeddingConfig?: apiSettings,
      requestsPerMinute?: number,
      parallelSet = 30,
      reviewModelId?: number | null,
      runId?: string,
      proofMode?: string,
      reviewEnabled?: boolean
    ) => {
      // 流式输出：LLM 增量文本与分段完成事件经独立通道推送渲染端。
      // 声明在 try 外，finally 中需要访问并刷出缓冲
      let streamSink: ProofreadStreamSink | null = null
      // 取消令牌：注册进全局表供 cancelProofread 查找，结束时移除
      const cancelToken = createProofreadCancelToken()
      if (runId) activeProofreadTokens.set(runId, cancelToken)
      // 未知校对模式兜底：必须放在 try 之前抛出（外层 catch 会把错误吞成空结果），
      // 让渲染端收到 IPC 拒绝并走统一错误提示，而不是拿到 undefined/空结果。
      // 空值仍由 try 内的参数校验给出更友好的提示
      if (Model && Model !== 'wordError' && Model !== 'ComprehensiveError' && Model !== 'polish' && Model !== 'reduceAI') {
        throw new Error(`Unknown proofread mode: ${Model}`)
      }
      try {
        const sendProgress = (payload: ProofreadProgressPayload) => {
          event.sender.send(PROOFREAD_PROGRESS_CHANNEL, payload)
        }
        const sendStream = (payload: ProofreadStreamPayload) => {
          event.sender.send(PROOFREAD_STREAM_CHANNEL, payload)
        }
        streamSink = createStreamSink(sendStream)
        // 三种校对模式：mode: 'section' | 'sentence' | 'full',
        console.log(
          '-----------------------------------------------processing docx file-------------------------------------------------------'
        )
        console.info('Processing settings:', Model, filePath)
        console.info('embedding settings:', repositoryNameList, embeddingConfig ? { ...embeddingConfig, apiKey: maskKey(embeddingConfig.apiKey) } : embeddingConfig)
        console.info('the parallel set is:', parallelSet)
        console.info('requests per minute limit is:', requestsPerMinute)
        // 单请求超时（秒→毫秒）：透传给 chat.ts 的客户端构造，null 恢复默认
        setRequestTimeoutMs(api_info.requestTimeoutSec != null ? api_info.requestTimeoutSec * 1000 : null)
        // 思考模式：透传给 OpenAI 兼容路径的请求体（thinking.type）
        setThinkingMode(api_info.thinkingMode ?? 'default')
        console.info('thinking mode of this run is:', api_info.thinkingMode ?? 'default')

        if (!Model || !filePath) {
          return {
            isSuccess: false,
            message: 'Please select a model and a file!'
          }
        }

        if (!api_info.apiKey || !api_info.modelName) {
          return {
            isSuccess: false,
            message: 'Please select an API setting!'
          }
        }

        if (requiresBaseURL(api_info.provider) && !api_info.apiURL) {
          return {
            isSuccess: false,
            message: 'Please provide an API URL for this provider!'
          }
        }
        if (Model === 'wordError') {
          console.log('will process by the model:', maskKey(api_info.apiKey), api_info.apiURL, api_info.modelName)
          const proofreadOutcome = await proofreadDocument(
            filePath,
            resolveProofMode(Model, proofMode),
            api_info.apiKey,
            api_info.modelName,
            api_info.apiURL,
            repositoryNameList,
            embeddingConfig,
            parallelSet,
            requestsPerMinute,
            sendProgress,
            api_info.provider,
            streamSink,
            cancelToken
          )
          let { proofResult, token_usage } = proofreadOutcome
          const { failedSegments } = proofreadOutcome

          // 自动审核校对结果：默认关闭，仅在显式选择审核模型或开启「结果复核」开关时执行。
          // 审核失败不丢弃已完成的校对结果——保留未过滤结果并把失败记入 failedSegments。
          if (proofResult && proofResult.length > 0 && shouldRunReview(reviewModelId, reviewEnabled)) {
            const reviewApiInfo = await resolveReviewApiInfo(reviewModelId)
            sendProgress({
              stage: 'reviewing',
              mode: 'sentence',
              total: proofResult.length,
              completed: 0,
              percent: 95,
              message: '正在审核校对结果'
            })
            try {
              const backgroundInstruction = await getCurrentBackgroundInstruction()
              const { reviewedResult, token_usage: reviewTokens } = await reviewCorrections(
                proofResult,
                backgroundInstruction,
                reviewApiInfo.apiKey,
                reviewApiInfo.modelName,
                reviewApiInfo.apiURL,
                (completed, total) => {
                  sendProgress({
                    stage: 'reviewing',
                    mode: 'sentence',
                    total,
                    completed,
                    percent: total > 0 ? Math.min(100, 95 + Math.floor((completed / total) * 5)) : 95,
                    message: '正在审核校对结果'
                  })
                },
                reviewApiInfo.provider,
                streamSink,
                cancelToken
              )
              proofResult = reviewedResult
              token_usage += reviewTokens
            } catch (reviewError) {
              if (cancelToken.cancelled) throw reviewError
              console.error('审核校对结果失败，保留未过滤结果继续:', reviewError)
              failedSegments.push({
                stage: 'review',
                index: 0,
                label: 'review',
                message: reviewError instanceof Error ? reviewError.message : String(reviewError)
              })
            }
          }
          // 确保返回的数据是可克隆的
          try {
            const result = {
              proofResult: JSON.parse(JSON.stringify(proofResult)),
              token_usage: token_usage,
              failedSegments
            }
            return result
          } catch (error) {
            console.error('序列化校对结果时出错:', error)
            return {
              proofResult: null,
              token_usage: token_usage
            }
          }
        } else if (Model === 'ComprehensiveError') {
          console.log('will process by the model:', maskKey(api_info.apiKey), api_info.apiURL, api_info.modelName)
          const proofreadOutcome = await proofreadDocument(
            filePath,
            resolveProofMode(Model, proofMode),
            api_info.apiKey,
            api_info.modelName,
            api_info.apiURL,
            repositoryNameList,
            embeddingConfig,
            parallelSet,
            requestsPerMinute,
            sendProgress,
            api_info.provider,
            streamSink,
            cancelToken
          )
          let { proofResult, token_usage } = proofreadOutcome
          const { failedSegments } = proofreadOutcome

          // 自动审核校对结果：默认关闭，仅在显式选择审核模型或开启「结果复核」开关时执行。
          // 审核失败不丢弃已完成的校对结果——保留未过滤结果并把失败记入 failedSegments。
          if (proofResult && proofResult.length > 0 && shouldRunReview(reviewModelId, reviewEnabled)) {
            const reviewApiInfo = await resolveReviewApiInfo(reviewModelId)
            sendProgress({
              stage: 'reviewing',
              mode: 'section',
              total: proofResult.length,
              completed: 0,
              percent: 95,
              message: '正在审核校对结果'
            })
            try {
              const backgroundInstruction = await getCurrentBackgroundInstruction()
              const { reviewedResult, token_usage: reviewTokens } = await reviewCorrections(
                proofResult,
                backgroundInstruction,
                reviewApiInfo.apiKey,
                reviewApiInfo.modelName,
                reviewApiInfo.apiURL,
                (completed, total) => {
                  sendProgress({
                    stage: 'reviewing',
                    mode: 'section',
                    total,
                    completed,
                    percent: total > 0 ? Math.min(100, 95 + Math.floor((completed / total) * 5)) : 95,
                    message: '正在审核校对结果'
                  })
                },
                reviewApiInfo.provider,
                streamSink,
                cancelToken
              )
              proofResult = reviewedResult
              token_usage += reviewTokens
            } catch (reviewError) {
              if (cancelToken.cancelled) throw reviewError
              console.error('审核校对结果失败，保留未过滤结果继续:', reviewError)
              failedSegments.push({
                stage: 'review',
                index: 0,
                label: 'review',
                message: reviewError instanceof Error ? reviewError.message : String(reviewError)
              })
            }
          }
          // 确保返回的数据是可克隆的
          try {
            const result = {
              proofResult: JSON.parse(JSON.stringify(proofResult)),
              token_usage: token_usage,
              failedSegments
            }
            return result
          } catch (error) {
            console.error('序列化校对结果时出错:', error)
            return {
              proofResult: null,
              token_usage: token_usage
            }
          }
        } else if (Model === 'polish') {
          console.log('will process by the model:', maskKey(api_info.apiKey), api_info.apiURL, api_info.modelName)
          const proofreadOutcome = await proofreadDocument(
            filePath,
            'full',
            api_info.apiKey,
            api_info.modelName,
            api_info.apiURL,
            repositoryNameList,
            embeddingConfig,
            parallelSet,
            requestsPerMinute,
            sendProgress,
            api_info.provider,
            streamSink,
            cancelToken
          )
          let { proofResult, token_usage } = proofreadOutcome
          const { failedSegments } = proofreadOutcome

          // 自动审核校对结果：默认关闭，仅在显式选择审核模型或开启「结果复核」开关时执行。
          // 审核失败不丢弃已完成的校对结果——保留未过滤结果并把失败记入 failedSegments。
          if (proofResult && proofResult.length > 0 && shouldRunReview(reviewModelId, reviewEnabled)) {
            const reviewApiInfo = await resolveReviewApiInfo(reviewModelId)
            sendProgress({
              stage: 'reviewing',
              mode: 'full',
              total: proofResult.length,
              completed: 0,
              percent: 95,
              message: '正在审核校对结果'
            })
            try {
              const backgroundInstruction = await getCurrentBackgroundInstruction()
              const { reviewedResult, token_usage: reviewTokens } = await reviewCorrections(
                proofResult,
                backgroundInstruction,
                reviewApiInfo.apiKey,
                reviewApiInfo.modelName,
                reviewApiInfo.apiURL,
                (completed, total) => {
                  sendProgress({
                    stage: 'reviewing',
                    mode: 'full',
                    total,
                    completed,
                    percent: total > 0 ? Math.min(100, 95 + Math.floor((completed / total) * 5)) : 95,
                    message: '正在审核校对结果'
                  })
                },
                reviewApiInfo.provider,
                streamSink,
                cancelToken
              )
              proofResult = reviewedResult
              token_usage += reviewTokens
            } catch (reviewError) {
              if (cancelToken.cancelled) throw reviewError
              console.error('审核校对结果失败，保留未过滤结果继续:', reviewError)
              failedSegments.push({
                stage: 'review',
                index: 0,
                label: 'review',
                message: reviewError instanceof Error ? reviewError.message : String(reviewError)
              })
            }
          }
          // 确保返回的数据是可克隆的
          try {
            const result = {
              proofResult: JSON.parse(JSON.stringify(proofResult)),
              token_usage: token_usage,
              failedSegments
            }
            return result
          } catch (error) {
            console.error('序列化校对结果时出错:', error)
            return {
              proofResult: null,
              token_usage: token_usage
            }
          }
        } else if (Model === 'reduceAI') {
          console.log('will reduce AI detection rate by model:', maskKey(api_info.apiKey), api_info.apiURL, api_info.modelName)
          const sendProgress = (payload: ProofreadProgressPayload) => {
            event.sender.send(PROOFREAD_PROGRESS_CHANNEL, payload)
          }
          const { proofResult, token_usage, failedSegments } = await reduceAIDetectionDocument(
            filePath,
            api_info.apiKey,
            api_info.modelName,
            api_info.apiURL,
            parallelSet,
            requestsPerMinute,
            sendProgress,
            api_info.provider,
            streamSink,
            cancelToken
          )
          try {
            const result = {
              proofResult: JSON.parse(JSON.stringify(proofResult)),
              token_usage: token_usage,
              failedSegments
            }
            return result
          } catch (error) {
            console.error('序列化降低AI率结果时出错:', error)
            return {
              proofResult: null,
              token_usage: token_usage
            }
          }
        }
      } catch (error) {
        console.error('处理文档校对请求时出错:', error)
        if (!cancelToken.cancelled) {
          writeLog(`[proofread] ipc failed: model=${Model}, error=${error instanceof Error ? error.message : String(error)}`, 'error')
        }
        // 用户主动取消：不是错误，返回 cancelled 标记让前端走取消流程
        if (cancelToken.cancelled) {
          return {
            proofResult: null,
            token_usage: 0,
            cancelled: true
          }
        }
        return {
          proofResult: null,
          token_usage: 0,
          message: error instanceof Error ? error.message : String(error)
        }
      } finally {
        activeProofreadTokens.delete(runId || '')
        // 刷出流式缓冲区中尚未发送的增量文本
        streamSink?.flush()
      }
    }
  )

  // 取消校对：中止 runId 对应任务的在途请求并停止派发后续任务；
  // 未指定 runId 时取消所有活跃任务
  ipcMain.handle('cancelProofread', (_event, runId?: string) => {
    if (runId) {
      const token = activeProofreadTokens.get(runId)
      if (token) {
        token.cancel()
        console.log('校对任务已请求取消:', runId)
      } else {
        console.log('取消校对：未找到活跃任务（可能已结束）:', runId)
      }
    } else {
      activeProofreadTokens.forEach(token => token.cancel())
      console.log('已请求取消所有活跃校对任务')
    }
  })

  // 新增的返回值形式
  interface ResponseData<T = any> {
    success: boolean
    message: string
    data?: T
  }

  interface Correction {
    original: string
    suggested: string
  }

  interface ExportCorrectedDocxResult {
    success: boolean
    canceled: boolean
    filePath?: string
    appliedCount?: number
    /** 未能在文档中匹配到原文的建议条数 */
    unmatchedCount?: number
  }

  // Export corrected DOCX file
  ipcMain.handle('exportCorrectedDocx', async (event, config): Promise<ExportCorrectedDocxResult> => {
    try {
      // Ensure IPC payload stays serializable.
      const serializableConfig = JSON.parse(JSON.stringify(config))

      const filePath = serializableConfig.originalFilePath
      const parsedPath = path.parse(filePath)
      const defaultSavePath = path.join(parsedPath.dir, `${parsedPath.name}_new.docx`)
      const correctedText = serializableConfig.appliedCorrections.map((correction: Correction) => ({
        original: correction.original,
        suggested: correction.suggested
      }))

      const saveResult = await dialog.showSaveDialog({
        title: '\u5bfc\u51fa\u4fee\u6b63\u540e\u7684 DOCX \u6587\u4ef6',
        defaultPath: defaultSavePath,
        filters: [{ name: 'Word \u6587\u6863', extensions: ['docx'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return {
          success: false,
          canceled: true
        }
      }

      const replaceResult = await replaceTextInDocx(filePath, saveResult.filePath, correctedText)
      writeLog(`[export] corrected docx: applied=${replaceResult.appliedCount}, unmatched=${replaceResult.unmatchedCount}, file=${saveResult.filePath}`)
      return {
        success: true,
        canceled: false,
        filePath: saveResult.filePath,
        appliedCount: replaceResult.appliedCount,
        unmatchedCount: replaceResult.unmatchedCount
      }
    } catch (error) {
      console.error('output error:', error)
      throw error
    }
  })
  // 格式克隆 - 提取参考文档的样式档案
  ipcMain.handle('get-format-profile', async (event, filePath: string) => {
    try {
      const profile = await extractFormatProfile(filePath)
      return JSON.parse(JSON.stringify(profile))
    } catch (error) {
      console.error('提取样式档案失败:', error)
      throw error
    }
  })

  // 格式克隆 - 执行克隆（保存到临时文件用于预览）
  ipcMain.handle('clone-format', async (event, sourcePath: string, targetPath: string) => {
    try {
      const os = require('os')
      const tmpDir = os.tmpdir()
      const tmpName = `format_clone_${Date.now()}.docx`
      const tmpPath = require('path').join(tmpDir, tmpName)
      await cloneFormat(sourcePath, targetPath, tmpPath)
      return { success: true, filePath: tmpPath }
    } catch (error) {
      console.error('格式克隆失败:', error)
      throw error
    }
  })

  // 格式克隆 - 导出（带保存对话框）
  // 格式克隆 - 使用自定义样式档案克隆
  ipcMain.handle('clone-format-with-profile', async (event, profile: any, targetPath: string) => {
    try {
      const os = require('os')
      const tmpDir = os.tmpdir()
      const tmpName = `format_clone_${Date.now()}.docx`
      const tmpPath = require('path').join(tmpDir, tmpName)
      await cloneFormatWithProfile(profile, targetPath, tmpPath)
      return { success: true, filePath: tmpPath }
    } catch (error) {
      console.error('格式克隆失败:', error)
      throw error
    }
  })

  // 格式克隆 - 强制覆盖行内格式（使用自定义样式档案克隆，并强制应用到段落直接格式）
  ipcMain.handle('clone-format-with-profile-force', async (event, profile: any, targetPath: string) => {
    try {
      const os = require('os')
      const tmpDir = os.tmpdir()
      const tmpName = `format_clone_force_${Date.now()}.docx`
      const tmpPath = require('path').join(tmpDir, tmpName)
      const result = await cloneFormatWithProfileForce(profile, targetPath, tmpPath)
      return { success: true, filePath: tmpPath, appliedParagraphs: result.appliedParagraphs, matchedStyles: result.matchedStyles }
    } catch (error) {
      console.error('强制格式克隆失败:', error)
      throw error
    }
  })

  ipcMain.handle('export-format-cloned', async (event, clonedFilePath: string, originalTargetPath: string) => {
    try {
      const parsedPath = path.parse(originalTargetPath)
      const defaultSavePath = path.join(parsedPath.dir, `${parsedPath.name}_formatted.docx`)

      const saveResult = await dialog.showSaveDialog({
        title: '保存格式克隆后的文档',
        defaultPath: defaultSavePath,
        filters: [{ name: 'Word 文档', extensions: ['docx'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true }
      }

      // 同步 copyFileSync 会阻塞主进程，大文件导出期间卡住所有 IPC；改异步
      await fs.promises.copyFile(clonedFilePath, saveResult.filePath)
      return { success: true, canceled: false, filePath: saveResult.filePath }
    } catch (error) {
      console.error('导出格式克隆文档失败:', error)
      throw error
    }
  })

  // 获取默认提示词
  ipcMain.handle('getDefaultPrompt', async event => {
    const prompt = await getDefaultPrompt()
    return prompt
  })
  ipcMain.handle('getPromptSettings', async () => {
    return await getPromptSettings()
  })
  ipcMain.handle('setPromptSettings', async (_event, settings) => {
    return await setPromptSettings(settings)
  })
  ipcMain.handle('getEffectivePrompt', async () => {
    return await getEffectivePrompt()
  })
  ipcMain.handle('resetPromptSettings', async () => {
    return await resetPromptSettings()
  })
  // 兼容旧接口：直接设置自定义提示词覆盖模式
  ipcMain.handle('setPrompt', async (event, newPrompt) => {
    if (newPrompt) {
      const result = await setNewPrompt(newPrompt)
      if (result) {
        return true
      } else {
        return false
      }
    } else {
      throw new Error('Please input a prompt!')
    }
  })
  // 历史记录 - 获取全部的历史记录
  ipcMain.handle('getAllHistory', async event => {
    const result = await DB.getALLHistory()
    if (result) {
      return result
    } else {
      throw new Error('No history found!')
    }
  })
  // 历史记录 - 删除全部的历史记录
  ipcMain.handle('deleteAllHistory', async event => {
    const result = await DB.deleteALLHistory()
    if (result) {
      return true
    } else {
      throw new Error('delete history failed!')
    }
  })
  // 历史记录 - 根据id查询记录
  ipcMain.handle('getHistoryById', async (event, id) => {
    // 空 id 提前返回 null（调用方按可空处理），避免带着空参查库
    if (!id) {
      return null
    }
    const result = await DB.getHistoryById(id)
    if (result) {
      return result
    } else {
      throw new Error(`No history found by id: ${id}`)
    }
  })

  ipcMain.handle('deleteHistoryById', async (event, id) => {
    try {
      const result = await DB.deleteHistoryById(id)
      return result
    } catch (error) {
      console.error('删除历史记录失败:', error)
      return false
    }
  })
  // 历史记录- 插入一条数据
  ipcMain.handle(
    'insertOneHistory',
    async (event, filePath: string, apiURL: string, modelName: string, resultCorrect: string) => {
      try {
        // 参数验证
        if (!filePath || !apiURL || !modelName || !resultCorrect) {
          const errorMsg =
            '参数不完整: ' + JSON.stringify({ filePath, apiURL, modelName, resultCorrect: !!resultCorrect })
          console.error(errorMsg)
          return { success: false, error: errorMsg }
        }

        // 尝试解析JSON以验证数据有效性
        try {
          JSON.parse(resultCorrect)
        } catch (parseError) {
          const errorMsg = 'resultCorrect不是有效的JSON字符串: ' + parseError.message
          console.error(errorMsg)
          return { success: false, error: errorMsg }
        }

        const result = await DB.insertOneHistory(filePath, apiURL, modelName, resultCorrect)
        return { success: true, id: result }
      } catch (error) {
        console.error('插入历史记录失败:', error)
        return { success: false, error: error.message }
      }
    }
  )
  //----------------------------------------The implementation of this RAG----------------------------------------
  // 向量数据库 - 插入文档
  ipcMain.handle('lancedb:insert', async (event, { repositoryName, fileName, text, id, metadata }, modelConfig) => {
    return insertDocument(
      repositoryName,
      text,
      fileName,
      metadata,
      modelConfig.modelName,
      modelConfig.apiKey,
      modelConfig.apiURL
    )
  })

  // 向量数据库 - 查询文档
  ipcMain.handle('lancedb:query', async (event, { queryText, limit, filter, fileName }, modelConfig) => {
    return queryDocuments(
      queryText,
      modelConfig.modelName,
      modelConfig.apiKey,
      modelConfig.apiURL,
      limit,
      filter,
      fileName
    )
  })

  // 向量数据库 - 更新文档
  ipcMain.handle('lancedb:update', async (event, { repositoryName, id, text, metadata }, modelConfig) => {
    return updateDocument(
      repositoryName,
      id,
      text,
      metadata,
      modelConfig.modelName,
      modelConfig.apiKey,
      modelConfig.apiURL
    )
  })

  // 向量数据库 - 删除文档
  ipcMain.handle('lancedb:delete', async (event, { repositoryName, id }) => {
    return deleteDocument(repositoryName, id)
  })
  // get all the tables(lancedb)
  // 向量数据库 - 查询所有的表
  ipcMain.handle('listRepositories', async event => {
    const result = await listRepositories()
    return result
  })
  // 向量数据库 - 创建一个空的知识表
  ipcMain.handle('createRepository', async (event, { repositoryName, modelName, apiKey, apiURL }) => {
    try {
      await createRepository(repositoryName, modelName, apiKey, apiURL)
      return true
    } catch (error) {
      console.log('error when create a empty repository:', error)
      throw error
    }
  })
  // 向量数据库 - 删除整个表（单个知识库）
  ipcMain.handle('deleteRepository', async (event, repositoryName: string) => {
    try {
      // deleteRepository 是异步函数，必须 await：否则其内部异常不会进本 catch，
      // 前端会收到 resolve(true)，删除失败也提示"删除成功"
      await deleteRepository(repositoryName)
      return true
    } catch (error) {
      console.log('failed to delete ${repositoryName} because:', error)
      throw error
    }
  })
  // 向量数据库 -

  // IPC处理器 - 处理PDF文件(弃用)
  ipcMain.handle('pdf:process', async (event, { repositoryName, filePath }, modelConfig) => {
    try {
      return await processDocument(
        repositoryName,
        filePath,
        undefined, // 自动生成documentId
        500, // 默认chunk大小
        50, // 默认重叠大小
        modelConfig.modelName,
        modelConfig.apiKey,
        modelConfig.apiURL
      )
    } catch (error) {
      console.error('Failed to process PDF:', error)
      throw error
    }
  })

  // IPC处理器 - 选择并处理文档文件
  ipcMain.handle('pdf:select-and-process', async (event, repositoryName, modelConfig) => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Document Files', extensions: ['pdf', 'docx', 'txt'] }]
    })

    if (!filePaths || filePaths.length === 0) {
      console.log('User selected nothing!')
      return false
    }

    try {
      return await processDocument(
        repositoryName,
        filePaths[0],
        '', // 自动生成documentId
        500,
        50,
        modelConfig.modelName,
        modelConfig.apiKey,
        modelConfig.apiURL
      )
    } catch (error) {
      console.error('Document processing failed:', error)
      throw error
    }
  })

  // IPC处理器 - 获取PDF文档的所有段落
  ipcMain.handle('pdf:get-chunks', async (event, { documentId, repositoryName }) => {
    return getPDFDocumentChunks(repositoryName, documentId)
  })
  // 根据指定的文件名称，删除该名称下的所有文档块
  ipcMain.handle('deleteDocumentByName', async (event, repositoryName, filename) => {
    const deleteFileName = await deleteDocumentByName(repositoryName, filename)
    if (deleteFileName) {
      return deleteFileName
    } else {
      // 原写法 throw error(...) 引用未定义的小写 error，会抛 ReferenceError
      throw new Error(`delete the file ${filename} in ${repositoryName} error`)
    }
  })
  // 获取不重复的文件列表
  ipcMain.handle('listFilenamesInRepository', async (event, repositoryName) => {
    const fileList = await listFilenamesInRepository(repositoryName)
    return fileList
  })
  // 设置embedding模型 - 通过其他机制由前端Pinia store管理，不再需要此IPC处理
  // ipcMain.handle('setEmbeddingAPI', ...) 已移除

  // 获取embedding模型信息 - 通过其他机制由前端Pinia store管理，不再需要此IPC处理
  // ipcMain.handle('getEmbeddingAPI', ...) 已移除

  // 代理设置相关IPC
  ipcMain.handle('setProxySettings', async (event, enabled: boolean, port: number) => {
    try {
      proxy_settings.enabled = enabled
      proxy_settings.port = port

      if (enabled) {
        await session.defaultSession.setProxy({
          proxyRules: `http=127.0.0.1:${port};https=127.0.0.1:${port}`,
          proxyBypassRules: 'localhost,127.0.0.1'
        })
        console.log('Proxy enabled on port:', port)
      } else {
        await session.defaultSession.setProxy({})
        console.log('Proxy disabled')
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to set proxy:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('getProxySettings', async event => {
    return proxy_settings
  })

  // 调试用接口
  ipcMain.handle('getEnvPath', async event => {
    console.log(' env.LANCEDB_NATIVE_PATH:', env.LANCEDB_NATIVE_PATH)
    return env.LANCEDB_NATIVE_PATH
  })

  // 获取当前校对背景信息
  ipcMain.handle('getCurrentBackgroundInstruction', async () => {
    return await getCurrentBackgroundInstruction()
  })

  // 从格式描述生成格式参数（调用大模型）
  ipcMain.handle('format-from-description', async (event, description: string, apiConfig?: any, targetFilePath?: string) => {
    try {
      // 优先使用前端传入的 apiConfig，兜底用全局 api_info
      const apiKey = apiConfig?.apiKey || api_info.apiKey
      const modelName = apiConfig?.modelName || api_info.modelName
      const provider = apiConfig?.provider || api_info.provider || ModelProvider.OPENAI_COMPATIBLE
      const apiURL = apiConfig?.apiURL || api_info.apiURL || getProviderBaseURL(provider) || ''

      console.log('[format-from-desc] using apiKey:', !!apiKey, 'modelName:', modelName, 'provider:', provider, 'apiURL:', apiURL)

      if (!apiKey || !modelName) {
        return { success: false, error: '请先选择 API 设置' }
      }
      if (!description || !description.trim()) {
        return { success: false, error: '请输入格式描述' }
      }

      // 提取目标文档的样式名列表，供 LLM 生成可匹配的 name
      let targetStyleEntries: { name: string; type: string }[] | undefined
      if (targetFilePath) {
        try {
          const { loadDocx } = require('docx-edit')
          const targetDoc = await loadDocx(targetFilePath)
          const dstProfile = targetDoc.getStyleProfile()
          targetStyleEntries = Object.values(dstProfile.styles || {}).map((s: any) => ({
            name: s.name,
            type: s.type
          })).filter((e: any) => e.name)
          console.log('[format-from-desc] target style entries:', JSON.stringify(targetStyleEntries))
        } catch (e) {
          console.warn('[format-from-desc] failed to read target doc styles:', e)
        }
      }

      const { profile, tokenUsage } = await formatDescriptionToProfile(
        description,
        apiKey,
        modelName,
        apiURL,
        provider,
        targetStyleEntries
      )
      return { success: true, profile: JSON.parse(JSON.stringify(profile)), tokenUsage }
    } catch (error: any) {
      console.error('格式描述转换失败:', error)
      return { success: false, error: error.message || '格式描述转换失败' }
    }
  })

  // 读取文本文件内容（txt/md）
  ipcMain.handle('read-text-file', async (event, filePath: string) => {
    try {
      const fs = require('fs')
      const content = await fs.promises.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error: any) {
      console.error('读取文本文件失败:', error)
      return { success: false, error: error.message || '读取文件失败' }
    }
  })

  // 选择文本/文档文件（txt/md/docx）
  ipcMain.handle('select-format-desc-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择格式描述文件',
        filters: [
          { name: '支持的文件', extensions: ['txt', 'md', 'docx'] }
        ],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    } catch (error) {
      console.error('文件选择错误:', error)
      throw error
    }
  })

  // SmartFormatAgent: format analyze
  const formatAgent = new SmartFormatAgent()

  ipcMain.handle('smart-format-analyze', async (event, params: {
    description?: string
    refFilePath?: string
    targetFilePath: string
    apiConfig: any
  }) => {
    try {
      const result = await formatAgent.analyze({
        description: params.description,
        refFilePath: params.refFilePath,
        targetFilePath: params.targetFilePath,
        apiConfig: params.apiConfig
      })
      // Convert Map to JSON-serializable array for IPC
      const classificationArray = Array.from(result.classification.entries())
      return {
        success: true,
        spec: result.spec,
        classification: classificationArray,
        tokenUsage: result.tokenUsage,
        fallbackMode: result.fallbackMode
      }
    } catch (error: any) {
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('smart-format-apply', async (event, params: {
    inputPath: string
    outputPath: string
    spec: any
    classification: Array<[number, string]>
  }) => {
    try {
      const classificationMap = new Map(params.classification) as Map<number, ParagraphType>
      const result = await formatAgent.apply(
        params.inputPath,
        params.outputPath,
        params.spec,
        classificationMap
      )
      return { ...result }
    } catch (error: any) {
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.on('set-locale', (_event, locale: 'zh-CN' | 'en') => {
    setLocale(locale)
  })
}
