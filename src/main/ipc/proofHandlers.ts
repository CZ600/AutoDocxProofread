/**
 * proof 域：校对编排（process-docx / 取消 / 导出修正）、提示词设置、历史记录
 */
import { ipcMain, dialog } from 'electron'
import * as path from 'path'
import { DB } from '../database'
import { maskKey } from '../apiKeyCrypto'
import { writeLog } from '../logger'
import { setRequestTimeoutMs, setThinkingMode } from '../chat'
import { shouldRunReview } from '../reviewGate'
import { requiresBaseURL } from '../../shared/modelProviders'
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
  createStreamSink,
  ProofreadStreamSink,
  createProofreadCancelToken,
  ProofreadCancelToken
} from '../proof'
import { replaceTextInDocx } from '../wordProcess'
import { apiSettings, resolveReviewApiInfo, api_info } from './apiState'
import { ProofreadProgressPayload, ProofreadStreamPayload, ProofreadMode } from '../../shared/proofreadProgress'

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

export const registerProofHandlers = () => {
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
        // wordError / ComprehensiveError / polish 共用同一编排管线（仅粒度不同）：
        // resolveProofMode 已内置各模式默认值与前端覆盖（polish 固定整篇）
        if (Model === 'wordError' || Model === 'ComprehensiveError' || Model === 'polish') {
          const resolvedMode = resolveProofMode(Model, proofMode)
          console.log('will process by the model:', maskKey(api_info.apiKey), api_info.apiURL, api_info.modelName)
          const proofreadOutcome = await proofreadDocument(
            filePath,
            resolvedMode,
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
              mode: resolvedMode,
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
                    mode: resolvedMode,
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

  // 历史记录 - 分页查询（result 为完整 JSON，SQL 侧 LIMIT/OFFSET 避免全量返回）
  ipcMain.handle('getHistoryPage', async (_event, page: number, pageSize: number, keyword = '') => {
    return await DB.getHistoryPage(page, pageSize, keyword)
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
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 获取当前校对背景信息
  ipcMain.handle('getCurrentBackgroundInstruction', async () => {
    return await getCurrentBackgroundInstruction()
  })
}
