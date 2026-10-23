/**
 * better-sidebar 侧栏页签主体：一份 docx 的最近一次校对结果。
 *
 * tab.path = docx 绝对路径；tab.meta = {correctionsFile, proofType, count,
 * generatedAt}。每次校对运行的 generatedAt 不同，父级用 key 重挂本组件，
 * 使同一 tab 内的预览与高亮自动刷新（corrections 文件按文档路径复用）。
 */

import { useCallback } from 'react'
import { ProofreadPanel } from './ProofreadPanel'
import { createWorkspaceFileReader } from './fileAccess'
import { injectToolviewStyles } from './styles'

export interface ProofreadTabMeta {
  correctionsFile?: string
  proofType?: string
  count?: number
  generatedAt?: string
}

/** better-sidebar TabComponentProps（宽松版；ctx 由本插件注册时覆写注入）。 */
export interface SidebarTabProps {
  ctx?: unknown
  scope?: { sessionId?: string; cwd?: string }
  tab?: { path?: string; title?: string; meta?: unknown }
  visible?: boolean
}

function basename(path: string | undefined): string {
  if (!path) return ''
  return path.split(/[\\/]/).pop() ?? path
}

export function ProofreadSidebarTab(props: SidebarTabProps) {
  injectToolviewStyles()

  const tab = props.tab ?? {}
  const meta = (tab.meta ?? {}) as ProofreadTabMeta
  const sessionId = props.scope?.sessionId ?? ''

  const readFile = useCallback(
    (path: string, signal?: AbortSignal) => createWorkspaceFileReader(props.ctx, sessionId)(path, signal),
    [props.ctx, sessionId]
  )

  if (!tab.path) {
    return (
      <div className="dpr-sidebar">
        <div className="dpr-empty">
          暂无校对结果。在对话里对一个 .docx 运行 proofread_docx 后，这里会自动展示预览与高亮。
        </div>
      </div>
    )
  }

  return (
    <div className="dpr-sidebar">
      <div className="dpr-header">
        <b>{basename(tab.path)}</b>
        <span>
          {meta.proofType ?? ''} · {meta.count ?? ''} 条建议
        </span>
      </div>
      <ProofreadPanel
        key={`${tab.path}::${meta.generatedAt ?? ''}`}
        docxPath={tab.path}
        correctionsFile={meta.correctionsFile}
        proofType={meta.proofType}
        count={meta.count}
        readFile={readFile}
        layout="stack"
      />
    </div>
  )
}

export default ProofreadSidebarTab
