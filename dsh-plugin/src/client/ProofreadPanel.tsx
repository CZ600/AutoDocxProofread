/**
 * ProofreadPanel — 共享预览主体：校对列表 + docx 渲染 + 出现次序高亮。
 *
 * 同一份组件服务两处宿主：
 * - 会话 toolview（layout='row'，宽卡片，betterSidebar 缺席时的兜底）
 * - better-sidebar 侧栏页签（layout='stack'，窄列，列表上/预览下）
 *
 * 定位/高亮契约见 correctionMatching.ts（列表顺序 = 文档顺序；同一
 * original 第 k 条 → 文档第 k 次出现）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { highlightCorrections, correctionTypeCssKey } from './highlight'
import { CorrectionItem } from './correctionMatching'
import { applyPreviewPerfHints, forceVisibleSection } from './previewPerf'
import { decodeJson, WorkspaceFileReader } from './fileAccess'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface ProofreadPanelProps {
  docxPath?: string
  correctionsFile?: string
  proofType?: string
  count?: number
  readFile: WorkspaceFileReader
  /** 'row'：宽卡片左右分栏；'stack'：窄列上下堆叠（侧栏）。 */
  layout?: 'row' | 'stack'
  showPreview?: boolean
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function ProofreadPanel(props: ProofreadPanelProps) {
  const { docxPath, correctionsFile, proofType, count, layout = 'row', showPreview = true } = props

  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [corrections, setCorrections] = useState<CorrectionItem[]>([])
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null)
  const [docxRendered, setDocxRendered] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  const previewRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // readFile 可能随父组件重渲染换引用；进 ref 保证加载 effect 只按路径触发。
  const readerRef = useRef(props.readFile)
  readerRef.current = props.readFile

  // Load corrections + docx bytes once the paths are known.
  useEffect(() => {
    if (!correctionsFile || !docxPath) return
    const controller = new AbortController()
    setStatus('loading')
    setError('')
    ;(async () => {
      try {
        const [correctionsBytes, docxBytes] = await Promise.all([
          readerRef.current(correctionsFile, controller.signal),
          readerRef.current(docxPath, controller.signal),
        ])
        if (controller.signal.aborted) return
        if (!correctionsBytes && !docxBytes) throw new Error('无法读取文件（文件不存在或超出 32MB 上限）')

        const parsed = decodeJson<{ corrections?: CorrectionItem[] } | CorrectionItem[]>(correctionsBytes)
        setCorrections(Array.isArray(parsed) ? parsed : (parsed?.corrections ?? []))
        if (docxBytes) setDocxBlob(new Blob([docxBytes as unknown as BlobPart], { type: DOCX_MIME }))
        setStatus('ready')
      } catch (e) {
        if (controller.signal.aborted) return
        setError(String((e as Error)?.message ?? e))
        setStatus('error')
      }
    })()
    return () => controller.abort()
  }, [correctionsFile, docxPath])

  // Render the docx into the container whenever bytes (or visibility) change.
  useEffect(() => {
    if (!docxBlob || !showPreview || !previewRef.current) return
    const container = previewRef.current
    let cancelled = false
    ;(async () => {
      try {
        container.innerHTML = ''
        // 回放 Word 保存的 lastRenderedPageBreak 标记实现分页（默认被忽略会渲染成一整页）
        await renderAsync(docxBlob, container, null, { ignoreLastRenderedPageBreak: false })
        if (cancelled) return
        applyPreviewPerfHints(container)
        setDocxRendered(n => n + 1)
      } catch (e) {
        if (!cancelled) setError('文档预览渲染失败: ' + String((e as Error)?.message ?? e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docxBlob, showPreview])

  // Rebuild highlights after each successful render or corrections update.
  useEffect(() => {
    const container = previewRef.current
    if (!container || !docxRendered || corrections.length === 0) return
    highlightCorrections(container, corrections, {
      onHighlightClick: index => focusListItem(index),
    })
  }, [docxRendered, corrections])

  /** Highlight click → focus the matching list entry. */
  const focusListItem = useCallback((index: number) => {
    setFocusedIndex(index)
    const list = listRef.current
    if (!list) return
    const item = list.querySelector(`[data-index="${index}"]`)
    item?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  /** List entry click → scroll the preview to its highlight span. */
  const focusHighlight = useCallback((index: number) => {
    setFocusedIndex(index)
    const container = previewRef.current
    if (!container) return
    const el = container.querySelector(`.highlight-correction[data-correction-id="correction-${index}"]`)
    if (!el) return
    const restore = forceVisibleSection(el)
    el.classList.add('dpr-highlight-focused')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          el.classList.remove('dpr-highlight-focused')
          restore()
        }, 900)
      })
    })
  }, [])

  if (!docxPath && !correctionsFile) {
    return <div className="dpr-empty">{proofType ? `${proofType} · 无校对建议` : '无校对建议'}</div>
  }

  return (
    <div className={`dpr-layout${layout === 'stack' ? ' dpr-layout-stack' : ''}`}>
      <div className="dpr-list" ref={listRef}>
        {corrections.length === 0 && status !== 'loading' && (
          <div className="dpr-empty">{count ? '清单加载失败，见结果 JSON 文件' : '无校对建议'}</div>
        )}
        {corrections.map((item, index) => (
          <div
            key={index}
            data-index={index}
            className={`dpr-list-item${focusedIndex === index ? ' dpr-focused' : ''}`}
            onClick={() => focusHighlight(index)}
          >
            <div>
              <span className={`dpr-list-type highlight-type-${correctionTypeCssKey(item.type)}`}>{item.type || '其他'}</span>
              <span className="dpr-list-original">{item.original}</span>
              <span className="dpr-list-arrow">→</span>
              <span className="dpr-list-suggested">{item.suggested}</span>
            </div>
            {item.reason ? <div className="dpr-list-reason">{item.reason}</div> : null}
          </div>
        ))}
      </div>

      {showPreview && (
        <div className="dpr-preview" ref={previewRef}>
          {status === 'loading' && <div className="dpr-empty">正在加载文档…</div>}
        </div>
      )}

      {status === 'error' && (
        <div className="dpr-error">
          预览不可用：{error}
          {correctionsFile ? `（校对结果仍在 ${correctionsFile}）` : ''}
        </div>
      )}
    </div>
  )
}

export default ProofreadPanel
