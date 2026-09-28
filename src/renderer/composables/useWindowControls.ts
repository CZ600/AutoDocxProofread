import { ref, onMounted, onBeforeUnmount } from 'vue'

// 自定义窗口控制按钮（最小化/最大化切换/关闭）的共享状态与动作。
// 窗口在页面加载前就可能已最大化，maximize 事件监听不到，挂载后需主动查询一次
export function useWindowControls() {
  const isMaximized = ref(false)
  let unwatchMaximize: (() => void) | null = null

  const minimizeWindow = () => window.electronAPI?.minimizeWindow()
  const toggleMaximizeWindow = () => window.electronAPI?.toggleMaximizeWindow()
  const closeWindow = () => window.electronAPI?.closeWindow()

  onMounted(async () => {
    if (window.electronAPI?.isWindowMaximized) {
      isMaximized.value = await window.electronAPI.isWindowMaximized()
    }
    unwatchMaximize =
      window.electronAPI?.onWindowMaximizeChange?.((value: boolean) => {
        isMaximized.value = value
      }) ?? null
  })

  onBeforeUnmount(() => {
    unwatchMaximize?.()
    unwatchMaximize = null
  })

  return { isMaximized, minimizeWindow, toggleMaximizeWindow, closeWindow }
}
