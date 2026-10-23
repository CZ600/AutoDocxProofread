/**
 * dsh-docx-proofread client plugin (Web).
 *
 * 两个 UI 接入点：
 * 1. `proofread_docx` toolview（会话卡片）：摘要 + 自动/手动打开侧栏；
 *    betterSidebar 缺席时内联预览兜底。
 * 2. better-sidebar 侧栏页签 `docx-proofread:preview`（通过其开放的
 *    ctx.betterSidebar.registerTab 注册）：docx 预览 + 校对高亮本体。
 *
 * 文件读取走 ctx.remote.workspaceFiles.readBytes（typert RemoteResult，
 * 见 fileAccess.ts），docx 与 corrections JSON 均按绝对路径读取。
 *
 * betterSidebar 用嵌套 ctx.inject 声明：服务未安装时该 fiber 一直等待、
 * 不报错（插件退化为 toolview 内联预览），出现/消失时自动注册/注销。
 *
 * @module dsh-docx-proofread/client
 */

import type { Context } from '@deepseek-ai/cordis'
import { ProofreadToolview, ProofreadMeta } from './ProofreadToolview'
import { ProofreadSidebarTab } from './ProofreadSidebarTab'
import { createWorkspaceFileReader } from './fileAccess'
import { injectToolviewStyles } from './styles'

export const name = 'docx-proofread-client'

// remote.workspaceFiles: whole-file byte reads (32MB cap) for the preview.
export const inject = ['slots', 'remote', 'remote.workspaceFiles']

/** better-sidebar 页签类型 id（同时是 SidebarTab.type）。 */
export const SIDEBAR_TAB_TYPE = 'docx-proofread:preview'

function docxBaseName(path: string | undefined): string {
  if (!path) return ''
  return path.split(/[\\/]/).pop() ?? path
}

export function apply(ctx: Context) {
  injectToolviewStyles()

  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register(
      {
        name: 'tool.call.toolview',
        key: 'proofread_docx',
        // Session-scoped injection: bind the workspace file reader to this session.
        inject: (sessionId: string) => ({
          readFile: createWorkspaceFileReader(ctx, sessionId),
          // 打开/聚焦侧栏页签；betterSidebar 服务不在时返回 false，
          // toolview 据此回退为内联预览。
          openSidebarTab: (meta: ProofreadMeta): boolean => {
            const service = ctx.get('betterSidebar')
            if (!service || typeof service.openTab !== 'function') return false
            try {
              service.openTab(
                {
                  type: SIDEBAR_TAB_TYPE,
                  path: meta.docxPath,
                  title: docxBaseName(meta.docxPath) || 'Word 校对',
                  meta,
                },
                { sessionId }
              )
              return true
            } catch {
              return false
            }
          },
        }),
      },
      ProofreadToolview
    )
  )

  // 侧栏页签：经 dsh-better-sidebar 的扩展服务注册。嵌套响应式注入——
  // 服务缺席时 fiber 挂起等待（无副作用），出现时注册、卸载时 cordis
  // 自动调用 registerTab 返回的 disposer。
  ctx.inject(['betterSidebar'], scope => {
    const sidebar = (scope as unknown as { betterSidebar: any }).betterSidebar
    scope.effect(() =>
      sidebar.registerTab({
        id: SIDEBAR_TAB_TYPE,
        title: 'Word 校对',
        description: 'docx 校对预览：错误列表 + 文档高亮',
        order: 60,
        // 同一文档只开一个页签；重跑校对由 openTab 的导航参数刷新内容。
        dedupeKey: (tab: { path?: string }) => tab.path,
        component: (props: Record<string, unknown>) => <ProofreadSidebarTab {...props} ctx={scope} />,
      })
    )
  })
}
