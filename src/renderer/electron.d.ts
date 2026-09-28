/**
 * Electron API 类型支持应与 preload.ts 中的API一致
 * 你需要告诉 TypeScript,windows 类型中心增加的属性和接口情况
 * 防止运行时错误
 */
import { proofreadLargeDocument, ProofreadingCorrection } from './proof'
import { apiSettings } from './ipcHandlers'
import { ProofreadProgressPayload, ProofreadStreamPayload } from '../shared/proofreadProgress'
import { PromptSettings } from '../shared/promptSettings'

export interface proofHistory {
  id?: number
  filePath: string
  apiURL: string
  modelName: string
  created_at?: string
  result: string
}

// LanceDB 相关接口类型定义
export interface LanceDBInsertParams {
  repositoryName: string
  fileName: string
  text: string
  metadata: Record<string, any>
}

export interface LanceDBQueryParams {
  queryText: string
  limit: number
  filter: string
  fileName: string
}

export interface LanceDBUpdateParams {
  repositoryName: string
  id: number
  text: string
  metadata: Record<string, any>
}

export interface LanceDBDeleteParams {
  repositoryName: string
  id: number
}

export interface ModelConfig {
  modelName: string
  apiKey: string
  apiURL: string
}

export interface PDFProcessParams {
  repositoryName: string
  filePath: string
  metadata: Record<string, any>
}

export interface PDFSelectAndProcessParams {
  repositoryName: string
  metadata: Record<string, any>
}

export interface PDFGetChunksParams {
  documentId: string
  repositoryName: string
}

export interface ExportCorrectedDocxResult {
  success: boolean
  canceled: boolean
  filePath?: string
}

export default interface ElectronApi {
  // test
  message: (file: string) => void
  receiveAndReturn: (characters: string) => string
  test: string
  // 文档加载
  selectDocxFile: () => string
  readDocxFile: (filePath: string) => {
    path: string
    content: string
  }
  extractDocxText: (filePath: string) => Promise<{
    success: boolean
    text?: string
    error?: string
  }>
  // api设置和管理（接入数据库）
  APISettings: (URL: string, Key: string, modelName: string, provider?: string) => Promise<string>
  updateAPISetting: (id: number, URL: string, Key: string, modelName: string, provider?: string) => Promise<boolean>
  getAPISettings: () => Promise<{
    URL: string
    Key: string
    modelName: string
    provider?: string
    parallel?: number
    TimeLimit?: number | null
  }>
  deleteOneAPI: (id: number) => Promise<{
    isSuccess: boolean
  }>
  getALLAPISettings: () => Promise<
    {
      id: number
      apiURL: string
      apiKey: string
      modelName: string
      provider?: string
      created_at: string
    }[]
  >
  testAPI: (url: string, key: string, modelName: string) => Promise<boolean>
  testAPIWithProvider: (provider: string, url: string, key: string, modelName: string) => Promise<boolean>
  selectAPISetting: (
    url: string,
    key: string,
    modelName: string,
    parallel?: number,
    TimeLimit?: number | null,
    provider?: string
  ) => Promise<boolean>

  // 文档处理接口
  processDocx: (
    model: string,
    filePath: string,
    repositoryNameList?: string[],
    embeddingConfig?: apiSettings,
    setTimeLimit?: number,
    parallelSet?: number,
    reviewModelId?: number | null,
    runId?: string,
    proofMode?: string
  ) => Promise<{
    proofResult: ProofreadingCorrection[]
    token_usage: number
    cancelled?: boolean
  }> // 进行了更新
  // 取消当前校对任务（按 runId 精确取消；不传则取消全部活跃任务）
  cancelProofread: (runId?: string) => Promise<void>
  onProofreadProgress: (callback: (payload: ProofreadProgressPayload) => void) => () => void
  offProofreadProgress: (callback: (payload: ProofreadProgressPayload) => void) => void
  // 流式输出事件：LLM 增量文本（kind=chunk）与分段完成（kind=segment）
  onProofreadStream: (callback: (payload: ProofreadStreamPayload) => void) => () => void
  offProofreadStream: (callback: (payload: ProofreadStreamPayload) => void) => void
  exportCorrectedDocx: (config: any) => Promise<ExportCorrectedDocxResult>

  // 提示词处理接口
  getDefaultPrompt: () => Promise<string>
  getPromptSettings: () => Promise<PromptSettings>
  setPromptSettings: (settings: PromptSettings) => Promise<boolean>
  getEffectivePrompt: () => Promise<string>
  resetPromptSettings: () => Promise<boolean>
  setNewPrompt: (newPrompt: string) => Promise<boolean>

  // 历史记录接口
  getAllHistory: () => proofHistory[]
  deleteAllHistory: () => Promise<boolean>
  getHistoryById: (id: number) => Promise<proofHistory | null>
  deleteHistoryById: (id: number) => Promise<boolean>
  insertOneHistory: (filePath: string, apiURL: string, modelName: string, resultCorrect: string) => Promise<boolean>

  // LanceDB 相关接口
  lancedbInsert: (params: LanceDBInsertParams, modelConfig: ModelConfig) => Promise<any>
  lancedbQuery: (params: LanceDBQueryParams, modelConfig: ModelConfig) => Promise<any>
  lancedbUpdate: (params: LanceDBUpdateParams, modelConfig: ModelConfig) => Promise<any>
  lancedbDelete: (params: LanceDBDeleteParams) => Promise<any>
  listRepositories: () => Promise<string[]>
  createRepository: (params: {
    repositoryName: string
    modelName: string
    apiKey: string
    apiURL: string
  }) => Promise<boolean>
  deleteRepository: (repositoryName: string) => Promise<boolean>
  deleteDocumentByName: (repositoryName: string, filename: string) => Promise<string>
  listFilenamesInRepository: (repositoryName: string) => Promise<string[]>

  // PDF 处理相关接口
  processPDF: (params: PDFProcessParams, modelConfig: ModelConfig) => Promise<any>
  selectAndProcessPDF: (repositoryName: string, modelConfig: ModelConfig) => Promise<any> // 支持处理pdf、txt、docx文件
  getPDFChunks: (params: PDFGetChunksParams) => Promise<any>
  // 设置embedding api
  getEmbeddingAPI: () => Promise<{ URL: string; Key: string; modelName: string }>
  setEmbeddingAPI: (apiKey: string, apiURL: string, modelName: string) => Promise<boolean>
  getEnvPath: () => Promise<string>

  // 代理设置相关接口
  setProxySettings: (
    enabled: boolean,
    port: number
  ) => Promise<{
    success: boolean
    error?: string
  }>
  getProxySettings: () => Promise<{
    enabled: boolean
    port: number
  }>

  sendLocale: (locale: string) => void

  // 窗口控制接口
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
  onWindowMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronApi
  }
}
