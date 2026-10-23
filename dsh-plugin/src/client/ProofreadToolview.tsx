/**
 * ProofreadToolview — `proofread_docx` 的会话卡片（瘦身版）。
 *
 * 结果阶段只保留摘要行 + 按钮；重型预览（docx 渲染 + 高亮）默认放进
 * better-sidebar 侧栏页签：结果到达时自动打开一次，也可手动点击打开。
 * betterSidebar 服务缺席（未装侧栏插件）时回退为卡内内联预览。
 *
 * 应用建议仍是 agent 的职责（apply_corrections 工具），卡片只读。
 */

import { useEffect, useRef, useState } from 'react'
import { ProofreadPanel } from './ProofreadPanel'
import { injectToolviewStyles } from './styles'

/** presentationMeta persisted on tool/result; pure data, replay-safe. */
export interface ProofreadMeta {
  docxPath?: string
  correctionsFile?: string
  count?: number
  proofType?: string
  generatedAt?: string
}

/** Host props (loosely typed: dsh client APIs are developer preview). */
interface ToolviewProps {
  phase?: 'preparing' | 'start' | 'result'
  block?: { meta?: unknown } | null
  openFile?: (path: string, options?: unknown) => void
  /** Session-injected: (absolutePath, signal) => Uint8Array | null */
  readFile?: (path: string, signal?: AbortSignal) => Promise<Uint8Array | null>
  /** Session-injected: 打开（或聚焦）侧栏页签；返回 false 表示侧栏服务不可用。 */
  openSidebarTab?: (meta: ProofreadMeta) => boolean
}

type SidebarState = 'unknown' | 'open' | 'unavailable'

export function ProofreadToolview(props: ToolviewProps) {
  injectToolviewStyles()

  const { phase, block, openFile, readFile, openSidebarTab } = props
  const meta: ProofreadMeta = ((phase === 'result' ? (block as { meta?: unknown } | null)?.meta : null) ?? {}) as ProofreadMeta

  const [sidebarState, setSidebarState] = useState<SidebarState>('unknown')
  const autoOpenedKey = useRef('')

  // 结果到达后自动打开侧栏页签；每次校对运行（generatedAt 变化）只开一次。
  // 仅对"新鲜"结果自动打开（5 分钟内）——翻阅历史会话/刷新页面重放的旧
  // 卡片不去抢侧栏，手动按钮始终可用。
  useEffect(() => {
    if (phase !== 'result' || !meta.correctionsFile || !openSidebarTab) return
    const key = `${meta.correctionsFile}::${meta.generatedAt ?? meta.docxPath ?? ''}`
    if (autoOpenedKey.current === key) return
    autoOpenedKey.current = key
    const generatedAt = meta.generatedAt ? Date.parse(meta.generatedAt) : NaN
    const fresh = !Number.isNaN(generatedAt) && Date.now() - generatedAt < 5 * 60 * 1000
    if (!fresh) return
    setSidebarState(openSidebarTab(meta) ? 'open' : 'unavailable')
  }, [phase, meta.correctionsFile, meta.generatedAt, meta.docxPath, openSidebarTab])

  if (phase !== 'result') {
    return <div className="dpr-toolview dpr-empty">Word 校对进行中…</div>
  }

  return (
    <div className="dpr-toolview">
      <div className="dpr-header">
        <b>Word 校对</b>
        <span>
          {meta.proofType ?? ''} · {meta.count ?? ''} 条建议
        </span>
        {openSidebarTab ? (
          <button className="dpr-btn-primary" onClick={() => setSidebarState(openSidebarTab(meta) ? 'open' : 'unavailable')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="15" y1="4" x2="15" y2="20" />
            </svg>
            在侧边栏打开预览
          </button>
        ) : null}
        {openFile && meta.correctionsFile ? (
          <button onClick={() => openFile(meta.correctionsFile!)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" />
              <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
            </svg>
            结果 JSON
          </button>
        ) : null}
      </div>

      {sidebarState === 'open' && (
        <div className="dpr-hint">预览与高亮已在右侧栏「Word 校对」页签打开。</div>
      )}

      {sidebarState !== 'open' && readFile ? (
        <ProofreadPanel
          docxPath={meta.docxPath}
          correctionsFile={meta.correctionsFile}
          proofType={meta.proofType}
          count={meta.count}
          readFile={readFile}
          layout="row"
        />
      ) : null}
    </div>
  )
}

export default ProofreadToolview
