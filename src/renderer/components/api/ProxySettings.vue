<template>
  <div class="setting-section">
    <div class="section-header">
      <el-icon><Connection /></el-icon>
      <span>{{ t('proxy.title') }}</span>
      <!-- 说明文字改为悬停提示：与 TokenStatistics 的累计Token问号提示同一样式 -->
      <el-tooltip effect="dark" :content="t('proxy.description')" placement="top" popper-class="settings-hint-popper">
        <el-icon class="tooltip-icon"><QuestionFilled /></el-icon>
      </el-tooltip>
    </div>
    <div class="setting-body">
      <el-form label-width="auto">
        <el-form-item :label="t('proxy.enableProxy')" class="form-item-enhanced">
          <el-switch
            :model-value="proxyEnabled_"
            :active-text="t('proxy.enabled')"
            :inactive-text="t('proxy.disabled')"
            @update:model-value="handleProxyToggle"
          />
        </el-form-item>
        <el-form-item v-if="proxyEnabled_" :label="t('proxy.proxyPort')" class="form-item-enhanced">
          <el-input-number
            :model-value="proxyPort_"
            :min="1"
            :max="65535"
            :step="1"
            @update:model-value="handleProxyPortChange"
          />
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Connection, QuestionFilled } from '@element-plus/icons-vue'
import { useProxy } from '../../composables/useProxy'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const { proxyPort_, proxyEnabled_ } = useProxy()

const handleProxyToggle = (value: boolean) => {
  const rawValue = proxyEnabled_.value
  try {
    proxyEnabled_.value = value
    if (rawValue != proxyEnabled_.value) {
      console.log('代理状态修改成功！')
      ElMessage.success(t('proxy.statusChanged'))
    } else {
      const error = '代理状态没有改变'
      throw error
    }
  } catch (error) {
    console.log('代理状态修改失败', error)
  }
}

const handleProxyPortChange = (value: number) => {
  const rawValue = proxyPort_.value
  if (rawValue === proxyPort_.value) {
    console.log('提供的端口没有发生改变，不做变化')
    return 0
  }
  try {
    proxyPort_.value = value
    if (rawValue != proxyPort_.value) {
      console.log(`端口修改成功，旧端口是${rawValue},新端口是${value}`)
      ElMessage.success(t('proxy.portChanged', { oldPort: rawValue, newPort: value }))
    } else {
      const error = '端口修改失败'
      throw error
    }
  } catch (error) {
    console.log(error)
    ElMessage.error(t('proxy.portChangeFailed'))
  }
}
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: #4a6580;
  margin-bottom: 14px;
}

.section-header .el-icon {
  color: #7b9eb8;
  font-size: 16px;
}

.setting-body {
  padding: 4px 0;
}

/* 悬停提示图标：与 TokenStatistics 的提示符号同一配色 */
.tooltip-icon {
  cursor: help;
  color: #a0b3c4;
  font-size: 15px;
  transition: color 0.25s;
}

.tooltip-icon:hover {
  color: #7b9eb8;
}

.form-item-enhanced {
  margin-bottom: 20px;
}

.setting-section {
  margin-bottom: 20px;
  padding: 16px 18px;
  border-radius: 8px;
  background: #ffffff;
}
</style>

<style>
/* setting-section / section-header / tooltip-icon 的公共暗色适配已收敛至 common.css */
</style>
