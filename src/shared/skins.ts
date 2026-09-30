/**
 * 浅色模式皮肤选项（名称的 i18n key 与色板主色）。
 * 与 tokens.css 中 html[data-skin] 各块的 --el-color-primary 保持一致。
 */
export interface SkinOption {
  id: string
  /** i18n key（apiSettings 命名空间下） */
  nameKey: string
  /** 色板展示用主色 */
  color: string
}

export const SKIN_OPTIONS: SkinOption[] = [
  { id: 'sky', nameKey: 'skinNameSky', color: '#7b9eb8' },
  { id: 'sakura', nameKey: 'skinNameSakura', color: '#d4899d' },
  { id: 'mint', nameKey: 'skinNameMint', color: '#7cb392' },
  { id: 'dusk', nameKey: 'skinNameDusk', color: '#4d7ea8' },
  { id: 'lemon', nameKey: 'skinNameLemon', color: '#c4a465' }
]
