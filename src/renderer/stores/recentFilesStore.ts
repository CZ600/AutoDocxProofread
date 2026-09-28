// stores/recentFilesStore.ts
import { defineStore } from 'pinia'

/**
 * 最近操作过的文件记录。
 *
 * 设计说明：
 * - 仅在渲染进程维护，使用 localStorage 持久化（与 localeStore / fileInfoStore 同一机制）。
 * - 最多保留 MAX_COUNT 条，按"最近打开"排序（新的在前）。
 * - 以绝对路径 path 作为去重主键；同一文件再次打开会刷新 lastOpenedAt 并移到顶部。
 * - 这里只负责存取，文件真实存在性由调用方（DocPreview 加载逻辑）验证；加载失败时
 *   调用方应调用 removeRecent 清掉失效项，避免列表残留无效条目。
 */
export interface RecentFile {
  path: string // 绝对路径，去重主键
  name: string // 文件名（如 report.docx）
  dir: string // 所属目录，用于卡片副标题 / tooltip
  lastOpenedAt: number // 最近打开时间戳（毫秒）
}

const MAX_COUNT = 10

// 兼容 Windows / POSIX 路径分隔符
const splitPath = (fullPath: string): { name: string; dir: string } => {
  const normalized = fullPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  const name = idx >= 0 ? normalized.slice(idx + 1) : fullPath
  const dir = idx >= 0 ? fullPath.slice(0, idx) : ''
  return { name, dir }
}

export const useRecentFilesStore = defineStore('recentFiles', {
  state: () => ({
    recentFiles: [] as RecentFile[]
  }),

  getters: {
    getList: state => state.recentFiles,
    isEmpty: state => state.recentFiles.length === 0,
    count: state => state.recentFiles.length
  },

  actions: {
    /**
     * 记录一次打开：去重 -> 置顶 -> 截断到 MAX_COUNT。
     * 若传入的 path 无效则忽略。
     */
    addRecent(path: string, name?: string) {
      if (!path) return
      const { name: derivedName, dir } = splitPath(path)
      const finalName = name || derivedName
      // 先移除已有项，再插入头部
      this.recentFiles = this.recentFiles.filter(f => f.path !== path)
      this.recentFiles.unshift({
        path,
        name: finalName,
        dir,
        lastOpenedAt: Date.now()
      })
      if (this.recentFiles.length > MAX_COUNT) {
        this.recentFiles = this.recentFiles.slice(0, MAX_COUNT)
      }
    },

    /** 移除指定路径的记录（加载失败时清理失效项）。 */
    removeRecent(path: string) {
      this.recentFiles = this.recentFiles.filter(f => f.path !== path)
    },

    /** 清空全部记录。 */
    clearRecent() {
      this.recentFiles = []
    }
  },

  persist: {
    key: 'recentFiles',
    storage: localStorage,
    paths: ['recentFiles']
  }
})

/**
 * 把时间戳格式化为相对时间描述（刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / YYYY-MM-DD）。
 * 文案通过传入的 i18n 翻译函数 t 解析，避免 store 直接耦合 vue-i18n。
 *
 * @param ts 毫秒时间戳
 * @param t  vue-i18n 的 t 函数（命名空间使用 'recentFiles.*'）
 */
export function formatRelativeTime(
  ts: number,
  t: (key: string, named?: Record<string, unknown>) => string
): string {
  if (!ts || Number.isNaN(ts)) return ''
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return t('recentFiles.justNow')

  const minutes = Math.floor(sec / 60)
  if (minutes < 60) return t('recentFiles.minutesAgo', { n: minutes })

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('recentFiles.hoursAgo', { n: hours })

  const days = Math.floor(hours / 24)
  if (days === 1) return t('recentFiles.yesterday')
  if (days < 30) return t('recentFiles.daysAgo', { n: days })

  // 超过 30 天则展示具体日期
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
