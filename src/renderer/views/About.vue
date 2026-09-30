<template>
  <div class="about-container">
    <div class="logo-section">
      <img src="../assets/logo.png" alt="Logo" class="logo" />
      <p class="subtitle">{{ t('about.subtitle') }}</p>
    </div>

    <el-tabs v-model="activeTab" class="content-tabs">
      <el-tab-pane :label="t('about.tabs.intro')" name="intro">
        <div class="tab-card">
          <h2>{{ t('about.intro.title') }}</h2>
          <p>{{ t('about.intro.desc1') }}</p>
          <p>{{ t('about.intro.desc2') }}</p>

          <h3>{{ t('about.intro.coreFeatures') }}</h3>
          <el-collapse v-model="activeCollapse" accordion class="flat-collapse">
            <el-collapse-item :title="t('about.intro.feature1Title')" name="1">
              <ul>
                <li>{{ t('about.intro.feature1WordError') }}</li>
                <li>{{ t('about.intro.feature1Comprehensive') }}</li>
                <li>{{ t('about.intro.feature1Polish') }}</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item :title="t('about.intro.feature2Title')" name="2">
              <ul>
                <li>{{ t('about.intro.feature2Typo') }}</li>
                <li>{{ t('about.intro.feature2Punctuation') }}</li>
                <li>{{ t('about.intro.feature2Grammar') }}</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item :title="t('about.intro.feature3Title')" name="3">
              <ul>
                <li>{{ t('about.intro.feature3Create') }}</li>
                <li>{{ t('about.intro.feature3Import') }}</li>
                <li>{{ t('about.intro.feature3RAG') }}</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item :title="t('about.intro.feature4Title')" name="4">
              <ul>
                <li>{{ t('about.intro.feature4Parallel') }}</li>
                <li>{{ t('about.intro.feature4Display') }}</li>
                <li>{{ t('about.intro.feature4Apply') }}</li>
                <li>{{ t('about.intro.feature4Responsive') }}</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item :title="t('about.intro.feature5Title')" name="5">
              <ul>
                <li>{{ t('about.intro.feature5OpenAI') }}</li>
                <li>{{ t('about.intro.feature5Flexible') }}</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item :title="t('about.intro.feature6Title')" name="6">
              <ul>
                <li>{{ t('about.intro.feature6View') }}</li>
                <li>{{ t('about.intro.feature6Batch') }}</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item :title="t('about.intro.feature7Title')" name="7">
              <ul>
                <li>{{ t('about.intro.feature7L1') }}</li>
                <li>{{ t('about.intro.feature7L2') }}</li>
                <li>{{ t('about.intro.feature7L3') }}</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item :title="t('about.intro.feature8Title')" name="8">
              <ul>
                <li>{{ t('about.intro.feature8L1') }}</li>
                <li>{{ t('about.intro.feature8L2') }}</li>
                <li>{{ t('about.intro.feature8L3') }}</li>
              </ul>
            </el-collapse-item>
          </el-collapse>

          <el-alert
            :title="t('about.intro.warningNote')"
            type="warning"
            :description="t('about.intro.warningDesc')"
            show-icon
            :closable="false"
            style="margin-top: 16px"
          />
          <el-alert
            :title="t('about.intro.warningNote')"
            type="warning"
            :description="t('about.intro.warningDesc2')"
            show-icon
            :closable="false"
            style="margin-top: 8px"
          />
          <el-alert
            :title="t('about.intro.warningNote')"
            type="warning"
            :description="t('about.intro.warningDesc3')"
            show-icon
            :closable="false"
            style="margin-top: 8px"
          />
          <el-alert
            :title="t('about.intro.tip1Title')"
            type="info"
            :description="t('about.intro.tip1Desc')"
            show-icon
            :closable="false"
            style="margin-top: 8px"
          />
          <el-alert
            :title="t('about.intro.tip2Title')"
            type="info"
            :description="t('about.intro.tip2Desc')"
            show-icon
            :closable="false"
            style="margin-top: 8px"
          />
          <el-alert
            :title="t('about.intro.tip3Title')"
            type="info"
            :description="t('about.intro.tip3Desc')"
            show-icon
            :closable="false"
            style="margin-top: 8px"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('about.tabs.tech')" name="tech">
        <div class="tab-card">
          <h2>{{ t('about.tech.title') }}</h2>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item :label="t('about.tech.framework')">
              <el-link href="https://www.electronjs.org/" target="_blank">Electron</el-link> +
              <el-link href="https://vuejs.org/" target="_blank">Vue 3</el-link> +
              <el-link href="https://www.typescriptlang.org/" target="_blank">TypeScript</el-link>
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.tech.uiLibrary')">
              <el-link href="https://element-plus.org/" target="_blank">Element Plus</el-link>
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.tech.buildTool')">
              <el-link href="https://vitejs.dev/" target="_blank">Vite</el-link> +
              <el-link href="https://www.electronforge.io/" target="_blank">Electron Forge</el-link>
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.tech.docProcessing')">
              <el-link href="https://github.com/mwilliamson/mammoth.js" target="_blank">Mammoth</el-link> +
              <el-link href="https://github.com/open-xml-templating/docxtemplater" target="_blank"
              >Docxtemplater</el-link
              >
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.tech.vectorDB')">
              <el-link href="https://lancedb.com/" target="_blank">LanceDB</el-link>
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.tech.codeStandards')">
              <el-link href="https://eslint.org/" target="_blank">ESLint</el-link> +
              <el-link href="https://prettier.io/" target="_blank">Prettier</el-link>
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.tech.versionControl')">
              <el-link href="https://github.com/conventional-changelog/standard-version" target="_blank"
              >Standard Version</el-link
              >
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('about.tabs.start')" name="start">
        <div class="tab-card">
          <h2>{{ t('about.start.title') }}</h2>
          <h3>{{ t('about.start.requirements') }}</h3>
          <ul>
            <li>{{ t('about.start.nodeReq') }}</li>
            <li>{{ t('about.start.npmOrYarn') }}</li>
          </ul>
          <h3>{{ t('about.start.install') }}</h3>
          <pre class="code-block"><code>npm install</code></pre>
          <h3>{{ t('about.start.devMode') }}</h3>
          <pre class="code-block"><code>npm run start</code></pre>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('about.tabs.guide')" name="guide">
        <div class="tab-card">
          <h2>{{ t('about.guide.title') }}</h2>
          <el-steps direction="vertical" :active="6">
            <el-step :title="t('about.guide.step1Title')">
              <template #description>
                <ol>
                  <li>{{ t('about.guide.step1L1') }}</li>
                  <li>{{ t('about.guide.step1L2') }}</li>
                  <li>{{ t('about.guide.step1L3') }}</li>
                  <li>{{ t('about.guide.step1L4') }}</li>
                  <li>{{ t('about.guide.step1L5') }}</li>
                </ol>
              </template>
            </el-step>
            <el-step :title="t('about.guide.step2Title')">
              <template #description>
                <ol>
                  <li>{{ t('about.guide.step2L1') }}</li>
                  <li>{{ t('about.guide.step2L2') }}</li>
                  <li>{{ t('about.guide.step2L3') }}</li>
                  <li>{{ t('about.guide.step2L4') }}</li>
                </ol>
              </template>
            </el-step>
            <el-step :title="t('about.guide.step3Title')">
              <template #description>
                <ol>
                  <li>{{ t('about.guide.step3L1') }}</li>
                  <li>{{ t('about.guide.step3L2') }}</li>
                  <li>{{ t('about.guide.step3L3') }}</li>
                  <li>{{ t('about.guide.step3L4') }}</li>
                  <li>{{ t('about.guide.step3L5') }}</li>
                  <li>{{ t('about.guide.step3L6') }}</li>
                  <li>{{ t('about.guide.step3L7') }}</li>
                  <li>{{ t('about.guide.step3L8') }}</li>
                  <li>{{ t('about.guide.step3L9') }}</li>
                </ol>
              </template>
            </el-step>
            <el-step :title="t('about.guide.step4Title')">
              <template #description>
                <ol>
                  <li>{{ t('about.guide.step4L1') }}</li>
                  <li>{{ t('about.guide.step4L2') }}</li>
                  <li>{{ t('about.guide.step4L3') }}</li>
                </ol>
              </template>
            </el-step>
            <el-step :title="t('about.guide.step5Title')">
              <template #description>
                <ol>
                  <li>{{ t('about.guide.step5L1') }}</li>
                  <li>{{ t('about.guide.step5L2') }}</li>
                  <li>{{ t('about.guide.step5L3') }}</li>
                  <li>{{ t('about.guide.step5L4') }}</li>
                  <li>{{ t('about.guide.step5L5') }}</li>
                </ol>
              </template>
            </el-step>
            <el-step :title="t('about.guide.step6Title')">
              <template #description>
                <ol>
                  <li>{{ t('about.guide.step6L1') }}</li>
                  <li>{{ t('about.guide.step6L2') }}</li>
                  <li>{{ t('about.guide.step6L3') }}</li>
                  <li>{{ t('about.guide.step6L4') }}</li>
                  <li>{{ t('about.guide.step6L5') }}</li>
                </ol>
              </template>
            </el-step>
          </el-steps>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('about.tabs.other')" name="other">
        <div class="tab-card">
          <h2>{{ t('about.other.devPlan') }}</h2>
          <ul>
            <li>{{ t('about.other.devPlanL1') }}</li>
            <li>{{ t('about.other.devPlanL2') }}</li>
            <li>{{ t('about.other.devPlanL3') }}</li>
          </ul>

          <h2>{{ t('about.other.version') }}</h2>
          <p>{{ t('about.other.currentVersion') }}</p>
          <p>{{ t('about.other.versionNote') }}</p>
          <el-link href="https://github.com/CZ600/AutoDocxProofread" target="_blank" type="primary">
            {{ t('about.other.projectAddress') }}
          </el-link>
          <h2>{{ t('about.other.acknowledgement') }}</h2>
          <p>{{ t('about.other.ackDesc') }}</p>
          <el-link
            href="https://github.com/night-peiqi/electron-vue3-typescript-template"
            target="_blank"
            type="primary"
          >
            https://github.com/night-peiqi/electron-vue3-typescript-template
          </el-link>
          <p>{{ t('about.other.ackDesc2') }}</p>
          <el-link
            href="https://linux.do/t/topic/620470"
            target="_blank"
            type="primary"
          >
            https://linux.do/t/topic/620470
          </el-link>
          <h2>{{ t('about.other.license') }}</h2>
          <p>{{ t('about.other.licenseDesc') }}</p>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const activeTab = ref('intro')
const activeCollapse = ref('1')
</script>

<style scoped>
.about-container {
  padding: 16px 20px;
  height: 100%;
  overflow-y: auto;
  background: #ffffff;
}

.logo-section {
  text-align: center;
  margin: 16px 0;
}

.logo {
  width: 80px;
  height: auto;
  margin-bottom: 12px;
}

.subtitle {
  font-size: 13px;
  color: #8a929e;
}

.content-tabs :deep(.el-tabs__header) {
  background: transparent;
  border-bottom: 1px solid #edf0f4;
  margin-bottom: 0;
}

.content-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.content-tabs :deep(.el-tabs__item) {
  font-size: 14px;
  color: #8a929e;
  font-weight: 500;
  border: none;
  padding: 0 16px;
  height: 40px;
  line-height: 40px;
}

.content-tabs :deep(.el-tabs__item.is-active) {
  color: #5b7c99;
  font-weight: 600;
}

.content-tabs :deep(.el-tabs__item:hover) {
  color: #6d92b0;
}

.content-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--brand);
  height: 2px;
  border-radius: 1px;
}

.tab-card {
  padding: 18px;
  background: #ffffff;
}

.content-tabs h2 {
  margin-top: 0;
  margin-bottom: 12px;
  color: #4a6580;
  font-size: 16px;
}

.content-tabs h3 {
  margin: 12px 0 6px;
  color: #5b7c99;
  font-size: 14px;
}

.content-tabs ul {
  padding-left: 16px;
  margin: 6px 0;
}

.content-tabs li {
  margin: 3px 0;
  font-size: 13px;
  color: #5a6a7a;
}

.content-tabs .code-block {
  margin: 6px 0;
  padding: 10px 14px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  overflow-x: auto;
}

.content-tabs .code-block code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  color: #2c3e50;
  white-space: pre;
}

.content-tabs p {
  font-size: 13px;
  color: #5a6a7a;
  line-height: 1.7;
}

.flat-collapse :deep(.el-collapse-item__header) {
  background: transparent;
  color: #4a6580;
  font-weight: 500;
  border-bottom: 1px solid #edf0f4;
}

.flat-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

.flat-collapse :deep(.el-collapse-item__content) {
  padding: 8px 0;
}
</style>

<style>
/* 非 scoped 块不能用 :deep()（浏览器整条丢弃规则），子元素直接写类名 */
html.dark .about-container {
  background-color: var(--bg-page);
}

html.dark .tab-card {
  background-color: var(--bg-page);
}

html.dark .content-tabs .code-block {
  background-color: var(--bg-panel);
  border-color: var(--border-color);
}

html.dark .content-tabs .code-block code {
  color: #e0e0e0;
}

html.dark .content-tabs .el-tabs__header {
  border-bottom-color: var(--border-color);
}

html.dark .content-tabs .el-tabs__item {
  color: #8a8a8a;
}

html.dark .content-tabs .el-tabs__item.is-active {
  color: #e0e0e0;
}

html.dark .content-tabs .el-tabs__item:hover {
  color: #c0c0c0;
}

html.dark .subtitle {
  color: #8a8a8a;
}

html.dark .content-tabs h2 {
  color: #e0e0e0;
}

html.dark .content-tabs h3 {
  color: #c0c0c0;
}

html.dark .content-tabs li {
  color: #a0a0a0;
}

html.dark .content-tabs p {
  color: #a0a0a0;
}

html.dark .flat-collapse .el-collapse-item__header {
  color: #c0c0c0;
  border-bottom-color: var(--border-color);
}
</style>
