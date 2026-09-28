<template>
  <div class="app-layout" :class="{ dark: isDark }">
    <el-config-provider :locale="elementLocale">
      <aside class="sidebar">
        <div class="sidebar-top">
          <img src="./assets/logo.png" alt="Logo" class="sidebar-logo" />
        </div>

        <nav class="sidebar-nav">
          <el-tooltip :content="t('app.nav.proof')" placement="right">
            <button class="sidebar-btn" :class="{ active: currentPath === '/proof' }" @click="router.push('/proof')">
              <el-icon><HomeFilled /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip :content="t('app.nav.history')" placement="right">
            <button
              class="sidebar-btn"
              :class="{ active: currentPath === '/history' }"
              @click="router.push('/history')"
            >
              <el-icon><Clock /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip :content="t('app.nav.dictionary')" placement="right">
            <button
              class="sidebar-btn"
              :class="{ active: currentPath === '/dictionary' }"
              @click="router.push('/dictionary')"
            >
              <el-icon><Collection /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip :content="t('app.nav.settings')" placement="right">
            <button
              class="sidebar-btn"
              :class="{ active: currentPath === '/api' || currentPath === '/set' }"
              @click="router.push('/api')"
            >
              <el-icon><Setting /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip :content="t('app.nav.about')" placement="right">
            <button class="sidebar-btn" :class="{ active: currentPath === '/about' }" @click="router.push('/about')">
              <el-icon><InfoFilled /></el-icon>
            </button>
          </el-tooltip>
        </nav>

        <div class="sidebar-bottom">
          <el-tooltip :content="t('app.nav.themeToggle')" placement="right">
            <button class="sidebar-btn theme-btn" @click="toggleDark()">
              <el-icon v-if="isDark"><Moon /></el-icon>
              <el-icon v-else><Sunny /></el-icon>
            </button>
          </el-tooltip>
        </div>
      </aside>

      <div class="main-area">
        <div class="top-toolbar"></div>
        <div class="content-row">
          <main class="function-panel">
            <FormatClone v-if="activeMode === 'format-clone'" ref="formatCloneRef" />
            <router-view v-else />
          </main>
          <section class="preview-panel">
            <DocPreview />
          </section>
        </div>
      </div>
    </el-config-provider>
  </div>
</template>

<script setup>
import { computed, ref, provide, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { HomeFilled, InfoFilled, Setting, Clock, Collection, Sunny, Moon } from '@element-plus/icons-vue'
import { useDark, useToggle } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { fileInfoStore } from './stores/store'
import { useLocaleStore } from './stores/localeStore'
import en from 'element-plus/es/locale/lang/en'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/theme-chalk/dark/css-vars.css'
import DocPreview from './components/DocPreview.vue'
import FormatClone from './views/FormatClone.vue'

const electronAPI = window.electronAPI
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const isDark = useDark()
const toggleDark = useToggle(isDark)
const localeStore = useLocaleStore()

const previewContainer = ref(null)
provide('previewContainer', previewContainer)

const activeMode = ref('proof')
provide('activeMode', activeMode)
provide('setActiveMode', (mode) => { activeMode.value = mode })

// 离开校对页面时自动退出格式克隆模式
watch(() => route.path, (newPath) => {
  if (newPath !== '/proof' && activeMode.value !== 'proof') {
    activeMode.value = 'proof'
  }
})

const currentPath = computed(() => route.path)
const elementLocale = computed(() => (localeStore.locale === 'en' ? en : zhCn))

// ---- 格式克隆：FormatClone 内部管理状态，App.vue 仅做 provide 桥接 ----
const fileStore = fileInfoStore()
const formatCloneRef = ref(null)

// 桥接 FormatClone defineExpose 的状态给 DocPreview
const fcRefFilePath = computed(() => formatCloneRef.value?.refFilePath?.value ?? '')
const fcTargetFilePath = computed(() => fileStore.filePath)
const fcClonedFilePath = computed(() => formatCloneRef.value?.clonedFilePath?.value ?? '')
const fcCloning = computed(() => formatCloneRef.value?.cloning?.value ?? false)
const fcExporting = computed(() => formatCloneRef.value?.exporting?.value ?? false)
const fcFormatItems = computed(() => formatCloneRef.value?.formatItems?.value ?? [])
const fcDoClone = () => formatCloneRef.value?.doClone?.()
const fcDoExport = () => formatCloneRef.value?.doExport?.()

provide('formatCloneRefFilePath', fcRefFilePath)
provide('formatCloneTargetFilePath', fcTargetFilePath)
provide('formatCloneClonedFilePath', fcClonedFilePath)
provide('formatCloneCloning', fcCloning)
provide('formatCloneExporting', fcExporting)
provide('formatCloneFormatItems', fcFormatItems)
provide('formatCloneDoClone', fcDoClone)
provide('formatCloneDoExport', fcDoExport)
// ----------------------------------------------------------------

const getEnv = async () => {
  const envPath = await electronAPI.getEnvPath()
  console.log('envPath:', envPath)
}
getEnv()
</script>

<style scoped>
.app-layout {
  height: 100vh;
  display: flex;
  overflow: hidden;
  background-color: #ffffff;
}

.app-layout.dark {
  background-color: #121212;
}

.sidebar {
  width: 52px;
  background-color: #2c3a48;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  flex-shrink: 0;
  z-index: 100;
  -webkit-app-region: drag;
}

.sidebar.dark {
  background-color: #181825;
}

.sidebar-top {
  margin-bottom: 12px;
  padding: 6px 0;
}

.sidebar-logo {
  width: 32px;
  height: 32px;
  border-radius: 6px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.sidebar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 8px;
}

.sidebar-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #8fa3b4;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-app-region: no-drag;
  font-size: 18px;
  position: relative;
}

.sidebar-btn:hover {
  background-color: rgba(123, 158, 184, 0.18);
  color: #a0bdd0;
}

.sidebar-btn.active {
  background-color: rgba(123, 158, 184, 0.22);
  color: #a0bdd0;
}

.sidebar-btn.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background-color: #7b9eb8;
  border-radius: 0 3px 3px 0;
}

.theme-btn {
  margin-top: auto;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.top-toolbar {
  height: 52px;
  flex-shrink: 0;
  -webkit-app-region: drag;
  background-color: #ffffff;
  border-bottom: 1px solid #edf0f4;
}

.dark .top-toolbar {
  background-color: #1d1e1f;
  border-bottom-color: #2c2e30;
}

.content-row {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.function-panel {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background-color: #ffffff;
}

.dark .function-panel {
  background-color: #1a1a2e;
  color: #ffffff;
}

.preview-panel {
  flex: 2;
  min-width: 0;
  overflow: hidden;
  background-color: #ffffff;
  border-left: 1px solid #edf0f4;
}

.dark .preview-panel {
  background-color: #1d1e1f;
  border-left-color: #2c2e30;
}

::-webkit-scrollbar {
  display: none;
}

body {
  overflow: -moz-scrollbars-none;
  -ms-overflow-style: none;
}
</style>
