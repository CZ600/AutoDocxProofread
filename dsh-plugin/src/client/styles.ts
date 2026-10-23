/**
 * 高亮色板与预览容器样式（移植自 src/renderer/assets/css/common.css 的
 * 预览高亮块）。注入一次性 <style>，幂等。
 */

const CSS = `
.dpr-toolview { font-size: 13px; }
.dpr-layout { display: flex; gap: 12px; border: 1px solid var(--dpr-border, #dcdfe6); border-radius: 8px; overflow: hidden; }
.dpr-list { width: 320px; min-width: 240px; max-height: 480px; overflow: auto; border-right: 1px solid var(--dpr-border, #dcdfe6); }
.dpr-list-item { padding: 8px 10px; border-bottom: 1px solid var(--dpr-border, #ebeef5); cursor: pointer; }
.dpr-list-item:hover { background: rgba(64, 158, 255, 0.06); }
.dpr-list-item.dpr-focused { background: rgba(64, 158, 255, 0.14); animation: dpr-pulse 0.8s ease-in-out 2; }
.dpr-list-type { display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 8px; margin-right: 6px; color: #fff; background: #909399; }
.dpr-list-original { color: #e36262; text-decoration: line-through; word-break: break-all; }
.dpr-list-arrow { margin: 0 4px; color: #909399; }
.dpr-list-suggested { color: #5baa3a; word-break: break-all; }
.dpr-list-reason { color: #909399; font-size: 12px; margin-top: 2px; }
.dpr-preview { flex: 1; min-width: 0; max-height: 480px; overflow: auto; background: #f5f7fa; }
.dpr-preview .docx-wrapper { background: transparent; padding: 12px 0; }
.dpr-preview .docx-wrapper > section.docx { margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.18); }
.dpr-empty { padding: 16px; color: #909399; }
.dpr-error { padding: 12px; color: #e36262; white-space: pre-wrap; word-break: break-all; }
.dpr-header { display: flex; align-items: center; gap: 8px; margin: 4px 0; flex-wrap: wrap; }
.dpr-hint { padding: 4px 0 6px; color: var(--dsw-alias-label-secondary, #909399); font-size: 12px; }

/* toolview 按钮：对齐 dsh 按钮体系（--dsw-* 设计令牌，宿主令牌缺失时回退）。
   尺寸/圆角/悬停语义同 ui-primitives/Button.module.css 的 sm 档。 */
.dpr-header button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(125, 125, 125, 0.4));
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-button-tool-bar-fill, rgba(125, 125, 125, 0.14));
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.dpr-header button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(125, 125, 125, 0.22)); }
.dpr-header button:active { background: var(--dsw-alias-interactive-bg-active, rgba(125, 125, 125, 0.3)); }
.dpr-header button svg { flex: none; }

/* 主按钮（在侧边栏打开预览）：dsw primary 填充 */
.dpr-header button.dpr-btn-primary {
  border: none;
  background: var(--dsw-alias-button-primary-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary-foreground, #fff);
}
.dpr-header button.dpr-btn-primary:hover { background: var(--dsw-alias-button-primary-hover, #3f5df2); }
.dpr-header button.dpr-btn-primary:active { background: var(--dsw-alias-button-primary-hover, #3f5df2); }

/* 侧栏页签（窄列）：列表在上、预览在下，各自滚动；整体填满页签高度。
   height:100% + flex:1 双保险：宿主 nativeTabHost 是 height:100% 的纵向
   flex 盒，二者任一生效即可填满（better-sidebar 自有页签用 flex:1 语义）。 */
.dpr-sidebar { display: flex; flex-direction: column; height: 100%; flex: 1 1 auto; min-height: 0; font-size: 13px; }
.dpr-sidebar .dpr-layout { flex: 1 1 auto; min-height: 0; }
.dpr-layout-stack { flex-direction: column; }
.dpr-layout-stack .dpr-list {
  width: auto; min-width: 0; flex: 0 1 auto; max-height: 42%;
  border-right: none; border-bottom: 1px solid var(--dpr-border, #dcdfe6);
}
.dpr-layout-stack .dpr-preview { flex: 1 1 auto; min-height: 0; max-height: none; }
.dpr-layout-stack .dpr-error { flex: none; }

.highlight-correction {
  --highlight-bg: rgba(255, 214, 102, 0.5);
  --highlight-bg-hover: rgba(255, 214, 102, 0.7);
  --highlight-bg-focus: rgba(255, 214, 102, 0.92);
  --highlight-border: #ffb300;
  --highlight-ring: rgba(255, 179, 0, 0.28);
  background-color: var(--highlight-bg) !important;
  border-bottom: 2px solid var(--highlight-border) !important;
  cursor: pointer !important;
  padding: 1px 3px !important;
  border-radius: 3px !important;
  transition: background-color 0.2s ease !important;
}
.highlight-correction:hover {
  background-color: var(--highlight-bg-hover) !important;
}
.highlight-correction.dpr-highlight-focused {
  background-color: var(--highlight-bg-focus) !important;
  animation: dpr-pulse 0.8s ease-in-out 3 !important;
}
.highlight-type-typo, .highlight-type-worderror {
  --highlight-bg: rgba(245, 108, 108, 0.24);
  --highlight-bg-hover: rgba(245, 108, 108, 0.34);
  --highlight-bg-focus: rgba(245, 108, 108, 0.48);
  --highlight-border: #e36262;
}
.highlight-type-punctuation {
  --highlight-bg: rgba(230, 162, 60, 0.24);
  --highlight-bg-hover: rgba(230, 162, 60, 0.34);
  --highlight-bg-focus: rgba(230, 162, 60, 0.48);
  --highlight-border: #d89020;
}
.highlight-type-grammar {
  --highlight-bg: rgba(64, 158, 255, 0.24);
  --highlight-bg-hover: rgba(64, 158, 255, 0.34);
  --highlight-bg-focus: rgba(64, 158, 255, 0.48);
  --highlight-border: #3a8ee6;
}
.highlight-type-consistency {
  --highlight-bg: rgba(144, 147, 152, 0.24);
  --highlight-bg-hover: rgba(144, 147, 152, 0.34);
  --highlight-bg-focus: rgba(144, 147, 152, 0.48);
  --highlight-border: #828282;
}
.highlight-type-comprehensiveerror, .highlight-type-polish {
  --highlight-bg: rgba(103, 194, 58, 0.24);
  --highlight-bg-hover: rgba(103, 194, 58, 0.34);
  --highlight-bg-focus: rgba(103, 194, 58, 0.48);
  --highlight-border: #5baa3a;
}
.highlight-type-reduceai {
  --highlight-bg: rgba(160, 120, 200, 0.24);
  --highlight-bg-hover: rgba(160, 120, 200, 0.34);
  --highlight-bg-focus: rgba(160, 120, 200, 0.48);
  --highlight-border: #9b6dc6;
}

@keyframes dpr-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
`

let injected = false

export function injectToolviewStyles(): void {
  if (injected || typeof document === 'undefined') return
  if (document.getElementById('dsh-docx-proofread-styles')) {
    injected = true
    return
  }
  const style = document.createElement('style')
  style.id = 'dsh-docx-proofread-styles'
  style.textContent = CSS
  document.head.appendChild(style)
  injected = true
}
