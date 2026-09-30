import { defineStore } from 'pinia'
import { safeLocalStorage } from '../utils/safeStorage'

export type SkinId = 'sky' | 'sakura' | 'mint' | 'dusk' | 'lemon'

/**
 * 浅色模式皮肤：仅影响非深色主题下的品牌主色。
 * 深色主题固定使用 tokens.css 的 html.dark 变量，皮肤不生效。
 * DOM 侧通过 html[data-skin] 属性生效，App.vue 负责同步。
 */
export const useSkinStore = defineStore('skin', {
  state: () => ({
    skin: 'sky' as SkinId
  }),

  getters: {
    currentSkin: state => state.skin
  },

  actions: {
    setSkin(skin: SkinId) {
      this.skin = skin
    }
  },

  persist: {
    key: 'skin',
    storage: safeLocalStorage as unknown as Storage,
    pick: ['skin']
  }
})
