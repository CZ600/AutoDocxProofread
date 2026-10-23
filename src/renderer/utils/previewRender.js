/**
 * docx 预览渲染工具（批次 9 收敛）：IPC 字节缓冲 → File 的构建与
 * renderAsync 渲染，FormatClone 与 DocPreview 共用，避免各自维护
 * MIME 常量与 Blob 组装。
 */

import { renderAsync } from 'docx-preview'
import { applyPreviewPerfHints } from './previewPerf'

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * 回放 Word 保存时写入的 lastRenderedPageBreak 标记实现分页（与
 * better-sidebar office 插件一致）；docx-preview 默认忽略该标记导致长文
 * 渲染成一整页。生成器（python-docx 等）产出的文档没有标记，退化为长页。
 */
export const DOCX_RENDER_OPTIONS = { ignoreLastRenderedPageBreak: false }

/** IPC 读回的字节缓冲 → 可供 renderAsync 的 File 对象 */
export const createDocxFile = (buffer, name) => {
  const blob = new Blob([buffer], { type: DOCX_MIME })
  return new File([blob], name, { type: DOCX_MIME })
}

/** 读取 docx（IPC 字节直传）并渲染到容器；容器缺省时静默跳过 */
export const renderDocxFileToContainer = async (filePath, fileName, container) => {
  const fileData = await window.electronAPI.readDocxFile(filePath)
  const file = createDocxFile(fileData.buffer, fileName)
  if (!container) return
  container.innerHTML = ''
  await renderAsync(file, container, null, DOCX_RENDER_OPTIONS)
  // 大文档性能：视口外的页面跳过布局/绘制，滚动到时再实时渲染
  applyPreviewPerfHints(container)
}
