<template>
  <div class="setting-section">
    <div class="section-header">
      <el-icon><DataLine /></el-icon>
      <span>{{ t('tokenStats.title') }}</span>
    </div>
    <div class="token-stats">
      <el-statistic :value="totalTokens" class="statistic">
        <template #title>
          <div class="statistic-title">
            <span>{{ t('tokenStats.totalTokens') }}</span>
            <el-tooltip effect="dark" :content="t('tokenStats.tooltip')" placement="top">
              <el-icon class="tooltip-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </template>
      </el-statistic>
      <el-button :icon="Delete" class="btn-reset" @click="handleReset">
        {{ t('tokenStats.clearStats') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Delete, DataLine, QuestionFilled } from '@element-plus/icons-vue'
import { useToken } from '../../composables/useToken'

const { t } = useI18n()
const { totalTokens, resetTokens } = useToken()

const handleReset = () => {
  resetTokens()
}
</script>

<style scoped>
.token-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.statistic {
  flex: 1;
}

.statistic :deep(.el-statistic__number) {
  color: #4a6580;
  font-weight: 600;
}

.statistic-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #7a8694;
}

.tooltip-icon {
  cursor: help;
  color: #a0b3c4;
  transition: color 0.25s;
}

.tooltip-icon:hover {
  color: var(--brand);
}

.btn-reset {
  white-space: nowrap;
  color: #ffffff;
  border-color: #c28a8a;
  background-color: #c28a8a;
}

.btn-reset:hover {
  color: #ffffff;
  border-color: #b07575;
  background-color: #b07575;
}

</style>

<style>
/* setting-section / section-header / tooltip-icon 的公共暗色适配已收敛至 common.css */
html.dark .statistic .el-statistic__number {
  color: #e0e0e0;
}

html.dark .statistic-title {
  color: #a0a0a0;
}
</style>
