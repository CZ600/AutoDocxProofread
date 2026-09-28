<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="550px"
    class="api-dialog"
    @update:model-value="handleDialogVisibilityChange"
  >
    <template #header>
      <div class="dialog-header">
        <el-icon><component :is="headerIcon" /></el-icon>
        <span>{{ dialogTitle }}</span>
      </div>
    </template>
    <el-form ref="formRef" :model="formData" :rules="formRules" label-position="top" class="dialog-form">
      <el-form-item :label="t('addApiDialog.providerLabel')" class="form-item">
        <el-select v-model="formData.provider" class="w-full" @change="handleProviderChange">
          <el-option
            v-for="provider in providerOptions"
            :key="provider.id"
            :label="provider.name"
            :value="provider.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="showURLField" prop="URL" :label="t('addApiDialog.urlLabel')" class="form-item">
        <div class="input-tip">
          <el-icon class="tip-icon"><InfoFilled /></el-icon>
          <span>{{
            formData.provider === 'claude_code'
              ? t('addApiDialog.formatExampleClaudeCode')
              : t('addApiDialog.formatExample')
          }}</span>
        </div>
        <el-input v-model="formData.URL" :placeholder="t('addApiDialog.urlPlaceholder')" :prefix-icon="Link" />
      </el-form-item>
      <el-form-item prop="key" :label="t('addApiDialog.keyLabel')" class="form-item">
        <el-input
          v-model="formData.key"
          type="password"
          show-password
          :placeholder="t('addApiDialog.keyPlaceholder')"
          :prefix-icon="Lock"
        />
      </el-form-item>
      <el-form-item prop="name" :label="t('addApiDialog.modelLabel')" class="form-item">
        <div class="input-tip">
          <el-icon class="tip-icon"><InfoFilled /></el-icon>
          <span>{{ t('addApiDialog.defaultModelTip', { model: defaultModelForProvider }) }}</span>
        </div>
        <el-input v-model="formData.name" :placeholder="t('addApiDialog.modelPlaceholder')" :prefix-icon="Cpu" />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleReset">{{ t('addApiDialog.reset') }}</el-button>
        <el-button @click="handleClose">{{ t('addApiDialog.cancel') }}</el-button>
        <el-button :loading="testing" @click="handleTest">{{ t('addApiDialog.testConnection') }}</el-button>
        <el-button type="primary" :loading="submitting" class="btn-primary" @click="handleSubmit">
          {{ mode === 'edit' ? t('addApiDialog.saveEdit') : t('addApiDialog.save') }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormItemRule, FormRules } from 'element-plus'
import { Plus, Edit, Link, Lock, Cpu, InfoFilled } from '@element-plus/icons-vue'
import { useApiSettings, type ApiFormData } from '../../composables/useApiSettings'
import {
  ModelProvider,
  MODEL_PROVIDERS,
  getProviderDefaultModel,
  requiresBaseURL
} from '../../../shared/modelProviders'

const { t } = useI18n()

const providerOptions = Object.values(MODEL_PROVIDERS).map(p => ({
  id: p.id,
  name: p.name
}))

const props = withDefaults(
  defineProps<{
    visible: boolean
    mode?: 'create' | 'edit'
    initialData?: ApiFormData | null
    /** 保存处理函数：由父组件执行保存并返回是否成功，对话框据此控制 loading 与关闭 */
    submitHandler?: (data: ApiFormData) => Promise<boolean> | boolean
  }>(),
  {
    mode: 'create',
    initialData: null
  }
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [data: ApiFormData]
}>()

const { testApiConnection } = useApiSettings()

const formData = reactive<ApiFormData>({
  id: undefined,
  URL: '',
  key: '',
  name: '',
  provider: ModelProvider.OPENAI_COMPATIBLE
})

const showURLField = computed(() => {
  return requiresBaseURL(formData.provider)
})

// ---- 表单校验：此前空 URL/key 也能保存，这里补齐必填与格式校验 ----
const formRef = ref<FormInstance>()

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const validateURL = (_rule: FormItemRule, value: string, callback: (error?: Error) => void) => {
  const url = (value || '').trim()
  if (!url) {
    // 该字段仅在 provider 需要 baseURL 时渲染，必填校验交给 required 规则
    callback()
    return
  }
  if (isValidHttpUrl(url)) {
    callback()
  } else {
    callback(new Error(t('addApiDialog.validURLFormat')))
  }
}

const formRules = computed<FormRules>(() => ({
  URL: [
    { required: showURLField.value, message: t('addApiDialog.validURLRequired'), trigger: 'blur' },
    { validator: validateURL, trigger: 'blur' }
  ],
  key: [{ required: true, message: t('addApiDialog.validKeyRequired'), trigger: 'blur' }],
  name: [{ required: true, message: t('addApiDialog.validNameRequired'), trigger: 'blur' }]
}))

const validateForm = async (): Promise<boolean> => {
  if (!formRef.value) return true
  try {
    await formRef.value.validate()
    return true
  } catch {
    return false
  }
}

const defaultModelForProvider = computed(() => {
  return getProviderDefaultModel(formData.provider)
})

const handleProviderChange = (provider: ModelProvider) => {
  if (!formData.name || formData.name === getProviderDefaultModel(ModelProvider.OPENAI_COMPATIBLE)) {
    formData.name = getProviderDefaultModel(provider)
  }
  if (!requiresBaseURL(provider)) {
    formData.URL = ''
  }
}

const testing = ref(false)
const submitting = ref(false)

const dialogTitle = computed(() => (props.mode === 'edit' ? t('addApiDialog.editTitle') : t('addApiDialog.addTitle')))
const headerIcon = computed(() => (props.mode === 'edit' ? Edit : Plus))

const resetForm = () => {
  formData.id = undefined
  formData.URL = ''
  formData.key = ''
  formData.name = ''
  formData.provider = ModelProvider.OPENAI_COMPATIBLE
  formRef.value?.clearValidate()
}

const syncFormData = () => {
  if (!props.visible) {
    return
  }

  if (props.mode === 'edit' && props.initialData) {
    formData.id = props.initialData.id
    formData.URL = props.initialData.URL || ''
    formData.key = props.initialData.key || ''
    formData.name = props.initialData.name || ''
    formData.provider = props.initialData.provider || ModelProvider.OPENAI_COMPATIBLE
    formRef.value?.clearValidate()
    return
  }

  resetForm()
}

watch(
  () => [props.visible, props.mode, props.initialData] as const,
  () => {
    syncFormData()
  },
  { immediate: true, deep: true }
)

const handleDialogVisibilityChange = (value: boolean) => {
  if (!value) {
    resetForm()
  }
  emit('update:visible', value)
}

const handleClose = () => {
  handleDialogVisibilityChange(false)
}

const handleSubmit = async () => {
  if (!(await validateForm())) return
  const payload: ApiFormData = {
    id: formData.id,
    URL: formData.URL,
    key: formData.key,
    name: formData.name,
    provider: formData.provider
  }
  // 旧事件模式：emit 是同步的，父组件的异步保存结果无法回传，
  // loading 会在 emit 后立即复位（假 loading），因此仅在未提供 submitHandler 时兜底
  if (!props.submitHandler) {
    emit('submit', payload)
    return
  }
  submitting.value = true
  try {
    const success = await props.submitHandler(payload)
    if (success) {
      handleDialogVisibilityChange(false)
    }
  } finally {
    submitting.value = false
  }
}

const handleReset = () => {
  if (props.mode === 'edit' && props.initialData) {
    formData.id = props.initialData.id
    formData.URL = props.initialData.URL || ''
    formData.key = props.initialData.key || ''
    formData.name = props.initialData.name || ''
    formData.provider = props.initialData.provider || ModelProvider.OPENAI_COMPATIBLE
    return
  }

  resetForm()
}

const handleTest = async () => {
  if (!(await validateForm())) return
  testing.value = true
  try {
    await testApiConnection({
      url: formData.URL,
      key: formData.key,
      modelName: formData.name,
      provider: formData.provider
    })
  } finally {
    testing.value = false
  }
}
</script>

<style scoped>
.api-dialog {
  border-radius: 10px;
}

.api-dialog :deep(.el-dialog) {
  border-radius: 10px;
  border: none;
  box-shadow: 0 4px 24px rgba(75, 100, 130, 0.12);
}

.api-dialog :deep(.el-dialog__header) {
  border-bottom: 1px solid #edf0f4;
  padding-bottom: 16px;
}

.api-dialog :deep(.el-dialog__footer) {
  border-top: 1px solid #edf0f4;
  padding-top: 16px;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 16px;
  color: #4a6580;
}

.dialog-header .el-icon {
  color: #7b9eb8;
}

.dialog-form {
  padding: 16px 0;
}

.form-item {
  margin-bottom: 20px;
}

.input-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8a929e;
  margin-bottom: 6px;
}

.tip-icon {
  color: #a0b3c4;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-primary {
  background-color: #7b9eb8;
  border-color: #7b9eb8;
}

.btn-primary:hover {
  background-color: #6d8da6;
  border-color: #6d8da6;
}
</style>

<style>
html.dark .api-dialog :deep(.el-dialog__header) {
  border-bottom-color: #2c2e30;
}

html.dark .api-dialog :deep(.el-dialog__footer) {
  border-top-color: #2c2e30;
}

html.dark .dialog-header {
  color: #e0e0e0;
}

html.dark .dialog-header .el-icon {
  color: #8ec5ff;
}

html.dark .input-tip {
  color: #8a8a8a;
}

html.dark .tip-icon {
  color: #666666;
}
</style>
