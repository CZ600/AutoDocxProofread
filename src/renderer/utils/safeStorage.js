/**
 * localStorage 安全封装：写入容量超限（QuotaExceededError）时不让异常炸掉
 * 持久化插件，而是降级处理——丢弃 state 里的大字段（如校对结果 results）后重试，
 * 保住 filePath/fileName 等小字段的持久化。
 *
 * pinia-plugin-persistedstate 的 storage 选项接受任何实现
 * getItem/setItem/removeItem 的对象，因此可直接替换 localStorage。
 */

// 容量不足时允许丢弃的大体积字段（按优先级）
const DROPPABLE_FIELDS = ['results']

export const safeLocalStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key)
    } catch (error) {
      console.warn('localStorage 读取失败:', key, error)
      return null
    }
  },

  setItem(key, value) {
    try {
      localStorage.setItem(key, value)
      return true
    } catch (error) {
      // 容量超限：解析持久化的 state JSON，丢弃大字段后重试一次
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === 'object') {
          let dropped = false
          for (const field of DROPPABLE_FIELDS) {
            if (field in parsed && parsed[field] !== undefined) {
              delete parsed[field]
              dropped = true
            }
          }
          if (dropped) {
            localStorage.setItem(key, JSON.stringify(parsed))
            console.warn('localStorage 容量不足，已降级保存（丢弃大字段）:', key)
            return true
          }
        }
      } catch {
        // JSON 解析失败或二次写入仍超限，走统一告警
      }
      console.warn('localStorage 写入失败（容量不足），本次改动仅在当前会话生效:', key, error)
      return false
    }
  },

  removeItem(key) {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.warn('localStorage 删除失败:', key, error)
    }
  }
}
