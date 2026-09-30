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

// results 持久化节流：results 每次变更都会全量 JSON.stringify 写入 localStorage，
// 连续点击忽略/编辑/应用时写入次数等于点击次数。用 500ms 尾沿 debounce 合并写入，
// beforeunload 时冲刷未落盘的挂起写入，保证关窗/刷新不丢数据。
const PERSIST_DEBOUNCE_MS = 500

class DebouncedStorage {
  private pending = new Map<string, string>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush())
    }
  }

  getItem(key: string): string | null {
    // 读取走实时值：挂起未写入的最新内容优先于已落盘的旧内容
    const pendingValue = this.pending.get(key)
    if (pendingValue !== undefined) {
      return pendingValue
    }
    return safeLocalStorage.getItem(key)
  }

  setItem(key: string, value: string) {
    this.pending.set(key, value)
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.flush()
    }, PERSIST_DEBOUNCE_MS)
  }

  removeItem(key: string) {
    this.pending.delete(key)
    safeLocalStorage.removeItem(key)
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending.forEach((value, key) => {
      safeLocalStorage.setItem(key, value)
    })
    this.pending.clear()
  }
}

// 所有 persist storage 共用一个实例：按 key 分别 debounce，互不影响
const debouncedPersistStorage = new DebouncedStorage()

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
    // 一次性跳过侧栏列表重高亮的标记：与上面的渲染豁免配对使用。原位操作
    // （应用/忽略/编辑/撤销）已在改动前自行维护好预览高亮，两侧 watcher
    // 各自消费自己的标记，互不干扰，与侦听触发顺序无关
    skipResultRehighlightOnce: false,
    // 侧边栏聚焦信号：点击右侧预览高亮时，请求左侧校对列表滚动/展开到对应项
    sidebarFocusIndex: -1,
    sidebarFocusVersion: 0,
    // 暗色主题下文档预览纸面是否跟随变暗：默认 true 与历史行为一致
    // （明暗切换时文档从白底黑字切为黑底白字）；关闭后保持文档原有白底（所见即所得）
    previewDarkAdapt: true
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
    /** 原位操作已自行维护好预览高亮时调用：本次变更不触发侧栏整列表重高亮 */
    requestSkipResultRehighlight() {
      this.skipResultRehighlightOnce = true
    },
    /** 侧栏高亮侦听方调用：消费一次性跳过标记，返回是否应跳过重高亮 */
    consumeSkipResultRehighlight(): boolean {
      const value = this.skipResultRehighlightOnce
      this.skipResultRehighlightOnce = false
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
  // storage 用安全封装 + debounce 节流：results 体积可能很大，超配额时降级
  // 丢弃 results 只保 filePath 等小字段（safeLocalStorage）；连续变更合并为
  // 500ms 一次写入（DebouncedStorage），关窗时 beforeunload 冲刷兜底。
  persist: {
    key: 'fileInfo',
    storage: debouncedPersistStorage as unknown as Storage,
    paths: ['filePath', 'fileName', 'proofModel', 'results', 'previewDarkAdapt']
  }
})
