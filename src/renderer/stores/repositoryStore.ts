// stores/repositoryStore.ts
import { defineStore } from 'pinia'

/**
 * 知识库列表的统一状态源。
 *
 * 背景：知识库（vec0 虚拟表）的增删发生在 Dictionary 视图，而校对页面 DocPreview
 * 的下拉列表也展示同一份列表。两处此前各自维护局部 ref 并独立拉取 listRepositories，
 * 导致在 Dictionary 删除/新增知识库后，DocPreview 不会刷新（DocPreview 只在 onMounted
 * 拉一次）。
 *
 * 这里把列表收敛到单一 Pinia store：所有展示处读 store.list（响应式），任何增删操作
 * 完成后调用 refresh()，即可让所有引用处自动更新。store 自身不持久化——列表是后端
 * （sqlite）的真实状态，每次 refresh 都直接查后端，避免本地缓存与后端不一致。
 */
export const useRepositoryStore = defineStore('repository', {
  state: () => ({
    list: [] as string[],
    // 最近一次拉取失败的原因（成功时清空）。知识库引擎（vec0 扩展）加载失败时，
    // 列表会静默变空，这里保留错误文本供界面提示用户，避免"知识库消失"的误解。
    lastError: '' as string
  }),

  getters: {
    getList: state => state.list,
    isEmpty: state => state.list.length === 0
  },

  actions: {
    /** 从后端重新拉取知识库列表并写入 state。返回列表，便于调用方按需使用。 */
    async refresh(): Promise<string[]> {
      try {
        const electronAPI = (window as any).electronAPI
        const result = await electronAPI.listRepositories()
        this.list = Array.isArray(result) ? [...result] : []
        this.lastError = ''
        return this.list
      } catch (error: any) {
        this.lastError = String(error?.message || error)
        console.error('获取知识库列表失败:', error)
        return []
      }
    }
  }
})
