// stores/store.ts
import { defineStore } from 'pinia'
import { safeLocalStorage } from '../utils/safeStorage'

export interface CorrectionResult {
  applied: boolean
  id: string
  original: string
  reason: string
  suggested: string
  type: string
  filtered?: boolean
  filterReason?: string
  /** 用户手动忽略：不参与高亮、批量应用与导出，可随时恢复 */
  rejected?: boolean
  /** 用户手动编辑过 suggested 文本 */
  edited?: boolean
}

export const fileInfoStore = defineStore('fileInfo', {
  state: () => ({
    filePath: '',
    fileName: '',
    proofModel: '',
    results: [] as CorrectionResult[],
    rerenderVersion: 0,
    // 一次性跳过 results 侦听的整篇重渲染标记：撤销等操作已在预览中原位
    // 完成文本回退，由操作方置位、侦听方消费（consume）后自动复位
    skipResultRerenderOnce: false,
    // 侧边栏聚焦信号：点击右侧预览高亮时，请求左侧校对列表滚动/展开到对应项
    sidebarFocusIndex: -1,
    sidebarFocusVersion: 0,
    // 暗色主题下文档预览纸面是否跟随变暗：默认 false 保持文档原有白底黑字（所见即所得）
    previewDarkAdapt: false
  }),

  getters: {
    getFilePath: state => state.filePath,
    getFileName: state => state.fileName,
    getProofModel: state => state.proofModel,
    getResults: state => state.results,
    isFilePathEmpty: state => !state.filePath,
    isFileNameEmpty: state => !state.fileName,
    isProofModelEmpty: state => !state.proofModel,
    isResultsEmpty: state => state.results.length === 0
  },

  actions: {
    setFilePath(filePath: string) {
      this.filePath = filePath
    },
    setFileName(fileName: string) {
      this.fileName = fileName
    },
    setProofModel(proofModel: string) {
      this.proofModel = proofModel
    },
    setCorrectResult(results: CorrectionResult[]) {
      this.results = results
    },
    triggerRerender() {
      this.rerenderVersion++
    },
    /** 撤销等原位操作在改动 results 前调用：本次变更不触发整篇重渲染 */
    requestSkipResultRerender() {
      this.skipResultRerenderOnce = true
    },
    /** results 侦听方调用：消费一次性跳过标记，返回是否应跳过重渲染 */
    consumeSkipResultRerender(): boolean {
      const value = this.skipResultRerenderOnce
      this.skipResultRerenderOnce = false
      return value
    },
    requestSidebarFocus(index: number) {
      this.sidebarFocusIndex = index
      this.sidebarFocusVersion++
    },
    setPreviewDarkAdapt(value: boolean) {
      this.previewDarkAdapt = value
    },
    clearAll() {
      this.filePath = ''
      this.fileName = ''
      this.proofModel = ''
      this.results = []
      this.rerenderVersion = 0
    }
  },

  // ✅ 关键：启用持久化，字段名必须和 state 一致。
  // storage 用安全封装：results 体积可能很大，超出 localStorage 配额时
  // 降级为丢弃 results 只保 filePath 等小字段，避免写入异常。
  persist: {
    key: 'fileInfo',
    storage: safeLocalStorage as unknown as Storage,
    paths: ['filePath', 'fileName', 'proofModel', 'results', 'previewDarkAdapt']
  }
})
