<template>
  <div class="proof-set-page">
    <div class="proof-set-content">
      <PromptEditor />
    </div>
  </div>
</template>

<script setup lang="ts">
import PromptEditor from '../components/prompt/PromptEditor.vue'
</script>

<style scoped>
.proof-set-page {
  padding: 16px 20px;
  height: 100%;
  overflow-y: auto;
  /* 页面背景与品牌色覆盖均来自 tokens.css（:root / html.dark 全局定义） */
  background: var(--bg-page);
}

/* 内容限宽：宽窗口下复选框组、单选组不再横向拉伸成满屏长行 */
.proof-set-content {
  max-width: 860px;
}
</style>
