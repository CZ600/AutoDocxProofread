<template>
  <div class="api-settings-container">
    <el-tabs v-model="activeTab" class="custom-tabs">
      <el-tab-pane :label="t('apiSettings.tabAPI')" name="api">
        <div class="tab-content">
          <el-alert v-if="showAlertSuccess" type="success" show-icon class="fade-slide">
            {{ alertTitle }}
          </el-alert>
          <el-alert v-if="showAlertError" type="error" show-icon class="fade-slide">
            {{ alertTitle }}
          </el-alert>

          <ApiSelector @add-api="openCreateDialog" @edit-api="openEditDialog" />

          <AddApiDialog
            v-model:visible="dialogVisible"
            :mode="dialogMode"
            :initial-data="editingApi"
            :submit-handler="handleSubmitApi"
          />

          <div class="setting-group">
            <div class="setting-group-title">{{ t('apiSettings.groupRuntime') }}</div>
            <TokenStatistics />
            <ConcurrencySettings />
            <RateLimitSettings />
            <ThinkingSettings />
            <ProxySettings />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('apiSettings.tabPrompt')" name="prompt">
        <div class="tab-content">
          <PromptSettingsPanel />
          <div class="setting-section">
            <div class="section-header">
              <el-icon><CircleCheck /></el-icon>
              <span>{{ t('apiSettings.reviewModelConfig') }}</span>
              <!-- 说明文字改为悬停提示：与其余设置卡片同一样式 -->
              <el-tooltip effect="dark" :content="t('apiSettings.reviewModelDesc')" placement="top" popper-class="settings-hint-popper">
                <el-icon class="tooltip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
            <div class="review-switch-row">
              <el-switch v-model="reviewEnabled" @change="handleToggleReview" />
              <span class="review-switch-label">{{ t('apiSettings.reviewEnableLabel') }}</span>
              <span class="review-switch-hint">{{ t('apiSettings.reviewEnableHint') }}</span>
            </div>
            <el-form label-position="top" class="review-model-form">
              <el-form-item :label="t('apiSettings.selectReviewModel')" class="form-item">
                <el-select
                  v-model="apiStore.reviewModelId"
                  :placeholder="t('apiSettings.reviewModelPlaceholder')"
                  class="api-select"
                  clearable
                >
                  <el-option v-for="item in apiSettings" :key="item.id" :label="item.modelName" :value="item.id">
                    <div class="api-option">
                      <el-popover placement="bottom-start" trigger="hover" :width="280">
                        <template #reference>
                          <div class="api-option-info">
                            <el-icon>
                              <Cpu />
                            </el-icon>
                            <span>{{ item.modelName }}</span>
                          </div>
                        </template>
                        <div class="api-detail-list">
                          <div>
                            <strong>{{ t('apiSettings.model') }}</strong> {{ item.modelName }}
                          </div>
                          <div class="api-url-line">
                            <strong>{{ t('apiSettings.address') }}</strong> {{ item.apiURL }}
                          </div>
                          <div>
                            <strong>{{ t('apiSettings.apiKey') }}</strong> {{ maskApiKey(item.apiKey) }}
                          </div>
                        </div>
                      </el-popover>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>
              <div class="button-group">
                <el-button :icon="Delete" class="btn-subtle" @click="handleClearReviewModel">
                  {{ t('apiSettings.restoreDefault') }}
                </el-button>
              </div>
            </el-form>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('apiSettings.tabOther')" name="other">
        <div class="tab-content">
          <div class="setting-section">
            <div class="section-header">
              <el-icon><Connection /></el-icon>
              <span>{{ t('apiSettings.languageLabel') }}</span>
            </div>
            <div class="lang-row">
              <span class="lang-desc">{{ t('apiSettings.languageDesc') }}</span>
              <el-select v-model="currentLocale" size="default" class="lang-select" @change="handleLocaleChange">
                <el-option label="简体中文" value="zh-CN" />
                <el-option label="English" value="en" />
              </el-select>
            </div>
          </div>

          <div class="setting-section">
            <div class="section-header">
              <el-icon><View /></el-icon>
              <span>{{ t('apiSettings.paperDarkAdaptTitle') }}</span>
              <el-tooltip effect="dark" :content="t('apiSettings.paperDarkAdaptHint')" placement="top" popper-class="settings-hint-popper">
                <el-icon class="tooltip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
            <div class="review-switch-row">
              <el-switch v-model="paperDarkAdapt" />
              <span class="review-switch-label">{{ t('apiSettings.paperDarkAdaptLabel') }}</span>
              <span class="review-switch-hint">{{ t('apiSettings.paperDarkAdaptHint') }}</span>
            </div>
          </div>

          <div class="setting-section">
            <div class="section-header">
              <el-icon><Brush /></el-icon>
              <span>{{ t('apiSettings.skinLabel') }}</span>
              <el-tooltip effect="dark" :content="t('apiSettings.skinDesc')" placement="top" popper-class="settings-hint-popper">
                <el-icon class="tooltip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
            <div class="skin-row">
              <button
                v-for="option in SKIN_OPTIONS"
                :key="option.id"
                type="button"
                class="skin-swatch"
                :class="{ active: skin === option.id }"
                @click="handleSkinChange(option.id)"
              >
                <span class="skin-dot" :style="{ backgroundColor: option.color }" />
                <span class="skin-name">{{ t(`apiSettings.${option.nameKey}`) }}</span>
              </button>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { CircleCheck, Cpu, Select, Delete, Connection, QuestionFilled, View, Brush } from '@element-plus/icons-vue'
import ApiSelector from '../components/api/ApiSelector.vue'
import AddApiDialog from '../components/api/AddApiDialog.vue'
import TokenStatistics from '../components/api/TokenStatistics.vue'
import ConcurrencySettings from '../components/api/ConcurrencySettings.vue'
import RateLimitSettings from '../components/api/RateLimitSettings.vue'
import ThinkingSettings from '../components/api/ThinkingSettings.vue'
import ProxySettings from '../components/api/ProxySettings.vue'
import PromptSettingsPanel from '../components/prompt/PromptSettingsPanel.vue'
import { useApiSettings, type ApiFormData } from '../composables/useApiSettings'
import { useApiStore } from '../stores/apiStore'
import { useLocaleStore } from '../stores/localeStore'
import { fileInfoStore } from '../stores/store'
import { useSkinStore, type SkinId } from '../stores/skinStore'
import { SKIN_OPTIONS } from '../../shared/skins'

const { t } = useI18n()
const localeStore = useLocaleStore()

const currentLocale = computed(() => localeStore.currentLocale)
const handleLocaleChange = (val: 'zh-CN' | 'en') => {
  localeStore.setLocale(val)
}

const activeTab = ref('api')
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingApi = ref<ApiFormData | null>(null)

const {
  showAlertSuccess,
  showAlertError,
  alertTitle,
  addApi,
  updateApi,
  initialize: initApiSettings,
  apiSettings,
  maskApiKey
} = useApiSettings()

const apiStore = useApiStore()

const openCreateDialog = () => {
  dialogMode.value = 'create'
  editingApi.value = null
  dialogVisible.value = true
}

const openEditDialog = (api: ApiFormData) => {
  dialogMode.value = 'edit'
  editingApi.value = { ...api }
  dialogVisible.value = true
}

// 由 AddApiDialog 通过 submitHandler 调用：返回保存结果供其控制 loading 与关闭
const handleSubmitApi = async (data: ApiFormData): Promise<boolean> => {
  const success = dialogMode.value === 'edit' ? await updateApi(data) : await addApi(data)
  if (success) {
    editingApi.value = null
  }
  return success
}

const handleClearReviewModel = () => {
  apiStore.clearReviewModel()
  ElMessage.success(t('apiSettings.restoredToDefault'))
}

// 结果复核开关（默认关闭）：开启后校对完成时自动复核，token 消耗约增加一倍
const reviewEnabled = computed({
  get: () => apiStore.reviewEnabled,
  set: (value: boolean) => apiStore.setReviewEnabled(value)
})
const handleToggleReview = (value: boolean | string | number) => {
  apiStore.setReviewEnabled(value === true)
  ElMessage.success(
    value === true ? t('apiSettings.reviewEnabledToast') : t('apiSettings.reviewDisabledToast')
  )
}

// 预览纸面适配暗色（默认开启）：暗色主题下文档预览跟随变暗，关闭则保持白底所见即所得
const fileStore = fileInfoStore()
const paperDarkAdapt = computed({
  get: () => fileStore.previewDarkAdapt,
  set: (value: boolean) => fileStore.setPreviewDarkAdapt(value)
})

// 浅色模式皮肤：持久化于 skinStore，App.vue 负责把值同步到 html[data-skin]
const skinStore = useSkinStore()
const skin = computed(() => skinStore.skin)
const handleSkinChange = (id: SkinId) => {
  skinStore.setSkin(id)
}

onMounted(async () => {
  await initApiSettings()
})
</script>

<style scoped>
.api-settings-container {
  padding: 16px 20px;
  height: 100%;
  overflow-y: auto;
  /* 品牌色覆盖已在 tokens.css 的 :root 全局定义，页面无需再带局部副本 */
  background: var(--bg-page);
}

.api-settings-container :deep(.el-switch.is-checked .el-switch__core) {
  background-color: var(--brand);
  border-color: var(--brand);
}

.api-settings-container :deep(.el-divider__text) {
  color: #8a929e;
  font-size: 13px;
  background-color: #ffffff;
}

.api-settings-container :deep(.el-divider) {
  border-top-color: #edf0f4;
}

.api-settings-container :deep(.el-form-item__label) {
  color: #5a6e80;
  font-weight: 500;
}

.api-settings-container :deep(.el-input__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #dce2e8 inset;
}

.api-settings-container :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #b8c7d4 inset;
}

.api-settings-container :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--brand) inset;
}

.api-settings-container :deep(.el-select .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--brand) inset;
}

.api-settings-container :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: var(--brand);
  border-color: var(--brand);
}

.api-settings-container :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #4a6580;
}

.custom-tabs {
  border-radius: 0;
  overflow: visible;
  border: none;
  background: transparent;
}

.custom-tabs :deep(.el-tabs__header) {
  background: transparent;
  border-bottom: 1px solid #e8eaee;
  margin-bottom: 0;
}

.custom-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.custom-tabs :deep(.el-tabs__item) {
  font-size: 14px;
  color: #8a929e;
  font-weight: 500;
  border: none;
  padding: 0 20px;
  height: 42px;
  line-height: 42px;
  transition: color 0.25s ease;
}

.custom-tabs :deep(.el-tabs__item.is-active) {
  color: #5b7c99;
  font-weight: 600;
}

.custom-tabs :deep(.el-tabs__item:hover) {
  color: #6d92b0;
}

.custom-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--brand);
  height: 2px;
  border-radius: 1px;
}

.tab-content {
  padding: 20px 0;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* 内容限宽居中：宽窗口下卡片不再横向拉满整屏 */
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
}

/* 分组容器：让一组相关卡片在视觉上聚合，并统一内边距节奏 */
.setting-group {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-group > :deep(.setting-section) {
  margin-bottom: 0;
}

/* 分组小标题：提供层次感 */
.setting-group-title {
  margin-top: 12px;
  margin-bottom: 4px;
  padding: 0 2px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #8a9aa8;
  text-transform: uppercase;
}

/* 统一所有子卡片的边距节奏 */
.tab-content > :deep(.setting-section) {
  margin-bottom: 12px;
  padding: 16px 18px;
}

.tab-content > :deep(.setting-section:last-child),
.setting-group > :deep(.setting-section:last-child) {
  margin-bottom: 0;
}

.fade-slide {
  animation: fadeSlide 0.5s ease;
}

@keyframes fadeSlide {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 悬停提示图标：与 TokenStatistics 的提示符号同一配色 */
.tooltip-icon {
  cursor: help;
  color: #a0b3c4;
  font-size: 15px;
  transition: color 0.25s;
}

.tooltip-icon:hover {
  color: var(--brand);
}

.review-switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.review-switch-label {
  font-size: 13px;
  font-weight: 500;
  color: #5a6e80;
}

.review-switch-hint {
  font-size: 12px;
  color: #9aa7b4;
}

.review-model-form {
  padding: 8px 0;
}

.form-item {
  margin-bottom: 16px;
}

.api-select {
  width: 100%;
}

.api-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 10px;
}

.api-option-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  min-width: 0;
  flex: 1;
}

.api-detail-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.5;
  word-break: break-all;
  font-size: 12px;
}

.api-url-line {
  white-space: normal;
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}

.btn-subtle {
  color: #6d8299;
  border-color: #d5dde5;
  background: #ffffff;
}

.btn-subtle:hover {
  color: #5b7c99;
  border-color: #b8c7d4;
  background: #f4f6f9;
}

.setting-section {
  margin-top: 20px;
  padding: 16px 18px;
  border-radius: 8px;
  background: #ffffff;
}

.setting-section--lang {
  padding: 14px 18px;
}

.lang-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

/* ---- 浅色模式皮肤色板 ---- */
.skin-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.skin-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 64px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.skin-swatch:hover {
  background: var(--bg-sunken);
}

.skin-swatch.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.skin-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.65), 0 1px 3px rgba(0, 0, 0, 0.15);
}

.skin-swatch.active .skin-dot {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.skin-name {
  font-size: 12px;
  color: var(--text-2);
}

.skin-swatch.active .skin-name {
  color: var(--brand-dark);
  font-weight: 600;
}

.lang-desc {
  font-size: 13px;
  color: #7a8694;
  line-height: 1.6;
}

.lang-select {
  width: 180px;
  flex-shrink: 0;
}
</style>

<style>
/* setting-section / section-header / tooltip-icon / btn-subtle 的公共暗色适配已收敛至 common.css；
   非 scoped 块不能用 :deep()（浏览器整条丢弃规则），子元素直接写类名 */
html.dark .api-settings-container {
  background-color: var(--bg-page);
}

html.dark .api-settings-container .el-divider__text {
  background-color: var(--bg-page);
}

html.dark .api-settings-container .el-divider {
  border-top-color: var(--border-color);
}

html.dark .tab-content {
  background-color: var(--bg-page);
}

html.dark .custom-tabs .el-tabs__header {
  border-bottom-color: var(--border-color);
}

html.dark .custom-tabs .el-tabs__item {
  color: #8a8a8a;
}

html.dark .custom-tabs .el-tabs__item.is-active {
  color: #e0e0e0;
}

html.dark .custom-tabs .el-tabs__item:hover {
  color: #c0c0c0;
}

html.dark .review-switch-label {
  color: var(--text-2);
}

html.dark .review-switch-hint {
  color: #6f6f6f;
}
</style>
