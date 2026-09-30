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
  background: #ffffff;
  /* 品牌色覆盖：与 APISet 页一致，本页 Element 控件（复选框/开关）统一为蓝灰色调 */
  --el-color-primary: #7b9eb8;
  --el-color-primary-light-3: #a0bdd0;
  --el-color-primary-light-5: #b8cedb;
  --el-color-primary-light-7: #d0dfea;
  --el-color-primary-light-8: #dde8ef;
  --el-color-primary-light-9: #edf3f7;
  --el-color-primary-dark-2: #6d8da6;
}

/* 内容限宽：宽窗口下复选框组、单选组不再横向拉伸成满屏长行 */
.proof-set-content {
  max-width: 860px;
}
</style>

<style>
html.dark .proof-set-page {
  background-color: #000000;
}
</style>
