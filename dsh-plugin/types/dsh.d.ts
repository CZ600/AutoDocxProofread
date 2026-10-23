/**
 * Local, intentionally loose ambient declarations for the dsh host packages.
 *
 * The real implementations are provided by the DeepSeek Harness runtime at
 * plugin load time (peerDependencies, all optional). dsh is in developer
 * preview with announced breaking changes, so the MVP types here stay wide
 * (`any` in the seams) instead of vendoring exact interfaces that would rot.
 * Tighten against packages/core/tools and packages/llm in the harness repo
 * once the plugin stabilizes.
 */

declare module '@deepseek-ai/cordis' {
  export interface Context {
    /** Tool registry seam (`ctx.tools.register(...)`). */
    tools: any
    /** LLM adapter registry seam (`ctx.llm.stream(...)`). */
    llm: any
    /** Client UI slot registry seam (`ctx.slots.register/inject`). */
    slots: any
    /** Remote API namespaces (`ctx.remote.workspaceFiles.readBytes(...)`). */
    remote: any
    /** Optional services looked up by key (e.g. 'skills', 'betterSidebar'). */
    get(key: string): any | undefined
    /** Effect scope: run cb now, auto-dispose whatever it returns. */
    effect(callback: () => unknown): void
    /** Reactive nested plugin: cb runs once every dependency is available and
     *  is disposed when any goes away; absent services just keep it waiting. */
    inject(dependencies: string[], callback: (ctx: Context) => void): unknown
    logger?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void }
    on(event: string, listener: (...args: any[]) => any): () => void
  }
}

declare module '@deepseek-ai/dsh-tools' {
  /** Typed tool-definition helper; parameters/output schemas are JSON-Schema-ish. */
  export function defineTool<T extends { name: string }>(definition: T): any
}

declare module '@deepseek-ai/dsh-skill' {
  export const anything: never
}

// ---------------------------------------------------------------------------
// Minimal ambient React/docx-preview types for the client half. The real React
// runtime comes from the dsh web host (module loader); typecheck only needs the
// small API surface the toolview uses. Replace with @types/react when the
// plugin grows real client dependencies.
// ---------------------------------------------------------------------------

declare module 'react' {
  export type DependencyList = readonly unknown[]
  export function useState<S>(initial: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void]
  export function useEffect(effect: () => void | (() => void), deps?: DependencyList): void
  export function useRef<T>(initial: T): { current: T }
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: DependencyList): T
}

declare module 'docx-preview' {
  /** Renders a .docx Blob/File into a container element (framework-agnostic). */
  export function renderAsync(
    data: Blob | File | ArrayBuffer,
    container: HTMLElement,
    styleContainer?: HTMLElement,
    options?: Record<string, unknown>
  ): Promise<unknown>
}

declare module 'react/jsx-runtime' {
  export const jsx: (type: any, props: any, key?: any) => any
  export const jsxs: (type: any, props: any, key?: any) => any
  export const Fragment: any
  export namespace JSX {
    interface IntrinsicElements {
      [element: string]: any
    }
    interface Element {}
    interface ElementChildrenAttribute {
      children: any
    }
    interface IntrinsicAttributes {
      key?: unknown
    }
  }
}
