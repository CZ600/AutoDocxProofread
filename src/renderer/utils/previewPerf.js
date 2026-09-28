/**
 * 预览渲染性能优化：docx-preview 会把整篇文档渲染成逐页的 <section> DOM，
 * 大文档（上百页）一次性 layout/paint 卡顿明显。给每页设置
 * content-visibility: auto 后，浏览器会跳过视口外页面的渲染，
 * 滚动到哪里再实时布局，DOM 与文本内容保持完整可查询。
 *
 * 注意：content-visibility:auto 的元素在未渲染状态下没有布局盒，
 * getBoundingClientRect 会返回全 0。需要精确量取元素位置（如"跳转到高亮"）
 * 的调用方应先用 forceVisibleSection 临时解除该优化，量取后再恢复。
 */

// 预估页高（A4 @96dpi ≈ 1123px），用于 contain-intrinsic-size 占位，
// 避免滚动条因未渲染页面高度未知而抖动；docx-preview 页面元素自带内联高度时优先用实际值
const FALLBACK_PAGE_HEIGHT = 1123

export const applyPreviewPerfHints = container => {
  if (!container) return
  const pages = container.querySelectorAll('.docx-wrapper > section.docx')
  pages.forEach(page => {
    if (page.style.contentVisibility === 'auto') return
    const inlineHeight = parseFloat(page.style.height)
    const height = Number.isFinite(inlineHeight) && inlineHeight > 0 ? inlineHeight : FALLBACK_PAGE_HEIGHT
    page.style.contentVisibility = 'auto'
    page.style.containIntrinsicSize = `auto ${height}px`
  })
}

/**
 * 临时让某个元素所在页面立即可见（返回恢复函数）。
 * 用于滚动定位、量取坐标等需要真实布局盒的场景。
 */
export const forceVisibleSection = element => {
  const section = element && element.closest ? element.closest('section.docx') : null
  if (!section || section.style.contentVisibility !== 'auto') {
    return () => {}
  }
  section.style.contentVisibility = 'visible'
  let restored = false
  return () => {
    if (restored) return
    restored = true
    section.style.contentVisibility = 'auto'
  }
}
