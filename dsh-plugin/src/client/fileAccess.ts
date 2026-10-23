/**
 * Client-side workspace file reads.
 *
 * `ctx.remote.workspaceFiles.readBytes` 是 typert RPC：它**resolve 出
 * RemoteResult**（`{ok:true, value}` | `{ok:false, error:{code,message}}`），
 * 传输/业务失败并不 throw。字节在 `value.data`（Uint8Array）；省略
 * `options.range` 时整文件读取，受宿主 32MB 上限约束。
 *
 * 之前版本直接取 `result.data`（恒为 undefined），导致预览报
 * “无法读取文件”——这是首次真机使用时预览不可用的根因。
 */

export type WorkspaceFileReader = (path: string, signal?: AbortSignal) => Promise<Uint8Array | null>

/** 为一个会话创建工作区文件字节读取器（docx 与 corrections JSON 共用）。 */
export function createWorkspaceFileReader(ctx: unknown, sessionId: string): WorkspaceFileReader {
  return async (path, signal) => {
    const remote = (ctx as { remote?: any })?.remote
    const result = await remote?.workspaceFiles?.readBytes(sessionId, path, {}, signal)
    if (!result) return null
    if (result.ok === false) {
      const failure = result.error ?? {}
      throw new Error(`读取失败 ${failure.code ?? ''}: ${failure.message ?? path}`)
    }
    return (result.value?.data as Uint8Array | undefined) ?? null
  }
}

/** 字节 → JSON（读 corrections 文件用）。null/空输入返回 null。 */
export function decodeJson<T = unknown>(bytes: Uint8Array | null): T | null {
  if (!bytes || bytes.length === 0) return null
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}
