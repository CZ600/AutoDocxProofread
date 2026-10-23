/**
 * 预览渲染性能优化（移植自 src/renderer/utils/previewPerf.js）。
 *
 * docx-preview 逐页渲染 <section> DOM，大文档一次性 layout 卡顿明显；
 * content-visibility:auto 让浏览器跳过视口外页面。跳转定位前需临时解除
 * （未渲染的元素 getBoundingClientRect 全 0）。
 */

const FALLBACK_PAGE_HEIGHT = 1123

export const applyPreviewPerfHints = (container: Element): void => {
  if (!container) return
  const pages = container.querySelectorAll('.docx-wrapper > section.docx')
  pages.forEach(raw => {
    const page = raw as HTMLElement
    if (page.style.contentVisibility === 'auto') return
    const inlineHeight = parseFloat(page.style.height)
    const height = Number.isFinite(inlineHeight) && inlineHeight > 0 ? inlineHeight : FALLBACK_PAGE_HEIGHT
    page.style.contentVisibility = 'auto'
    page.style.containIntrinsicSize = `auto ${height}px`
  })
}

/** 临时让元素所在页立即可见，返回恢复函数。 */
export const forceVisibleSection = (element: Element | null): (() => void) => {
  const section = element && element.closest ? element.closest('section.docx') : null
  if (!section || (section as HTMLElement).style.contentVisibility !== 'auto') {
    return () => {}
  }
  ;(section as HTMLElement).style.contentVisibility = 'visible'
  let restored = false
  return () => {
    if (restored) return
    restored = true
    ;(section as HTMLElement).style.contentVisibility = 'auto'
  }
}
