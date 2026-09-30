<template>
  <!-- 自定义窗口控制按钮：融入 action-bar 右端，替代原生悬浮按钮 -->
  <div class="window-controls">
    <button class="win-btn" :title="t('app.window.minimize')" @click="minimizeWindow">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M0 5 H10" stroke="currentColor" stroke-width="1" />
      </svg>
    </button>
    <button
      class="win-btn"
      :title="isMaximized ? t('app.window.restore') : t('app.window.maximize')"
      @click="toggleMaximizeWindow"
    >
      <svg v-if="isMaximized" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" />
        <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
      <svg v-else width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
    </button>
    <button class="win-btn win-btn-close" :title="t('app.window.close')" @click="closeWindow">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="currentColor" stroke-width="1" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useWindowControls } from '../composables/useWindowControls'

const { t } = useI18n()
const { isMaximized, minimizeWindow, toggleMaximizeWindow, closeWindow } = useWindowControls()
</script>

<style scoped>
.window-controls {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  display: flex;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 46px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #807e85;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.win-btn:hover {
  background-color: rgba(0, 0, 0, 0.06);
  color: #44444a;
}

.win-btn:active {
  background-color: rgba(0, 0, 0, 0.1);
  color: #44444a;
}

.win-btn-close:hover {
  background-color: #e81123;
  color: #ffffff;
}

.win-btn-close:active {
  background-color: #c50f1f;
  color: #ffffff;
}

html.dark .win-btn {
  color: #a7a7ad;
}

html.dark .win-btn:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: #e0e0e5;
}

html.dark .win-btn:active {
  background-color: rgba(255, 255, 255, 0.13);
  color: #e0e0e5;
}
</style>
