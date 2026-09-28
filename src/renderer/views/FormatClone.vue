<template>
  <div class="format-clone-panel">

    <div class="clone-body">
      <!-- ====== Input Section (compact, top) ====== -->
      <div class="input-section" :class="{ expand: formatItems.length === 0 && defaults === null }">
        <!-- Reference doc selector -->
        <div class="input-row">
          <span class="input-label">📄 {{ t('proof.formatClone.refDocLabel') }}</span>
          <el-button size="small" :loading="selectingRef" @click="selectRefFile">
            {{ t('proof.formatClone.selectRef') }}
          </el-button>
          <template v-if="refFileName">
            <el-tooltip :content="refFileName" placement="bottom">
              <span class="ref-file-name">{{ truncatedName(refFileName) }}</span>
            </el-tooltip>
            <el-tooltip :content="t('proof.formatClone.clearRefTip')" placement="bottom">
              <el-icon class="clear-icon" @click="clearRefFile"><CircleClose /></el-icon>
            </el-tooltip>
          </template>
        </div>

        <!-- Description file selector -->
        <div class="input-row">
          <span class="input-label">📝 {{ t('proof.formatClone.descLabel') }}</span>
          <el-button size="small" :loading="selectingDescFile" @click="selectDescFile">
            {{ t('proof.formatFromDesc.selectFile') }}
          </el-button>
          <template v-if="descFileName">
            <el-tooltip :content="descFileName" placement="bottom">
              <span class="ref-file-name">{{ truncatedName(descFileName) }}</span>
            </el-tooltip>
            <el-tooltip :content="t('proof.formatClone.clearDescTip')" placement="bottom">
              <el-icon class="clear-icon" @click="clearDescFile"><CircleClose /></el-icon>
            </el-tooltip>
          </template>
        </div>

        <!-- Description textarea: always visible, expand when no results -->
        <textarea
          v-model="descText"
          class="desc-textarea"
          :class="{ expand: formatItems.length === 0 && defaults === null }"
          :placeholder="t('proof.formatFromDesc.placeholder')"
          rows="4"
          :readonly="formatItems.length > 0 || defaults !== null"
        ></textarea>

        <!-- Start button: hidden when results are shown -->
        <template v-if="formatItems.length === 0 && defaults === null">
          <div class="start-btn-row">
            <el-button
              type="primary"
              size="small"
              :loading="analyzing"
              :disabled="!targetFilePath || (!refFilePath && !descText.trim())"
              @click="startFormat"
            >
              {{ analyzing ? t('proof.formatClone.analyzing') : t('proof.formatClone.startAnalyze') }}
            </el-button>
            <el-progress
              v-if="analyzing"
              :percentage="progressPercent"
              :stroke-width="10"
              :show-text="false"
              class="inline-progress-bar"
            />
            <span v-if="!targetFilePath" class="hint-text">{{ t('proof.formatClone.openTargetFirst') }}</span>
          </div>
        </template>
      </div>

      <!-- ====== Results Section (below, scrollable) ====== -->
      <template v-if="formatItems.length > 0 || defaults">
        <!-- Agent flow summary -->
        <div v-if="flowType === 'agent' && agentTokenUsage > 0" class="result-summary">
          {{ t('proof.formatClone.recognizedSummary', { count: formatItems.length, tokens: agentTokenUsage }) }}
        </div>

        <!-- Editable formatItems list -->
        <div v-if="formatItems.length > 0" class="format-list">
          <el-collapse v-model="activeNames">
            <el-collapse-item
              v-for="(item, index) in formatItems"
              :key="index"
              :name="index"
              class="format-item"
            >
              <template #title>
                <div class="format-item-header">
                  <span class="format-name">{{ item.name }}</span>
                  <span class="format-type-badge">{{ item.type }}</span>
                </div>
              </template>
              <div class="format-detail">
                <div v-if="item.paragraphStyle && Object.keys(item.paragraphStyle).length > 0" class="style-section">
                  <strong>{{ t('proof.formatClone.paragraphStyle') }}</strong>
                  <div class="style-props">
                    <div v-for="(val, key) in item.paragraphStyle" :key="key" class="style-prop">
                      <span class="prop-key">{{ key }}</span>
                      <span class="prop-val">
                        <template v-if="isBoolField(val)">
                          <button class="toggle-btn" :class="{ on: val }" @click="toggleStyleProp(item, 'paragraphStyle', key)">
                            {{ val }}
                          </button>
                        </template>
                        <template v-else-if="isStepperField(key)">
                          <span class="stepper">
                            <button class="step-btn" @click="stepValue(item, 'paragraphStyle', key, -1)">−</button>
                            <span class="stepper-val">{{ val }}</span>
                            <button class="step-btn" @click="stepValue(item, 'paragraphStyle', key, 1)">+</button>
                          </span>
                        </template>
                        <template v-else-if="isColorField(key)">
                          <el-popover placement="bottom" :width="200" trigger="click">
                            <template #reference>
                              <span class="color-chip">
                                <span class="color-swatch" :style="{ background: toHex(val) }"></span>
                                {{ val }}
                              </span>
                            </template>
                            <input type="color" :value="toHex(val)" @change="setColor(item, 'paragraphStyle', key, $event)" />
                          </el-popover>
                        </template>
                        <template v-else-if="isSpacingField(key)">
                          <span class="spacing-row">
                            <template v-if="val.before !== undefined">
                              <span class="spacing-label">before</span>
                              <button class="step-btn" @click="stepSpacing(item, 'paragraphStyle', 'before', -1)">−</button>
                              <span class="stepper-val">{{ val.before }}</span>
                              <button class="step-btn" @click="stepSpacing(item, 'paragraphStyle', 'before', 1)">+</button>
                            </template>
                            <template v-if="val.after !== undefined">
                              <span class="spacing-label">after</span>
                              <button class="step-btn" @click="stepSpacing(item, 'paragraphStyle', 'after', -1)">−</button>
                              <span class="stepper-val">{{ val.after }}</span>
                              <button class="step-btn" @click="stepSpacing(item, 'paragraphStyle', 'after', 1)">+</button>
                            </template>
                            <template v-if="val.line !== undefined">
                              <span class="spacing-label">line</span>
                              <button class="step-btn" @click="stepSpacing(item, 'paragraphStyle', 'line', -1)">−</button>
                              <span class="stepper-val">{{ val.line }}</span>
                              <button class="step-btn" @click="stepSpacing(item, 'paragraphStyle', 'line', 1)">+</button>
                            </template>
                            <template v-for="(sv, sk) in val" :key="sk">
                              <template v-if="sk !== 'before' && sk !== 'after' && sk !== 'line'">
                                <span class="spacing-label">{{ sk }}</span>
                                <span class="spacing-other">{{ sv }}</span>
                              </template>
                            </template>
                          </span>
                        </template>
                        <template v-else>
                          {{ formatPropVal(val) }}
                        </template>
                      </span>
                    </div>
                  </div>
                </div>
                <div v-if="item.runStyle && Object.keys(item.runStyle).length > 0" class="style-section">
                  <strong>{{ t('proof.formatClone.runStyle') }}</strong>
                  <div class="style-props">
                    <div v-for="(val, key) in item.runStyle" :key="key" class="style-prop">
                      <span class="prop-key">{{ key }}</span>
                      <span class="prop-val">
                        <template v-if="isBoolField(val)">
                          <button class="toggle-btn" :class="{ on: val }" @click="toggleStyleProp(item, 'runStyle', key)">
                            {{ val }}
                          </button>
                        </template>
                        <template v-else-if="isStepperField(key)">
                          <span class="stepper">
                            <button class="step-btn" @click="stepValue(item, 'runStyle', key, -1)">−</button>
                            <span class="stepper-val">{{ val }}</span>
                            <button class="step-btn" @click="stepValue(item, 'runStyle', key, 1)">+</button>
                          </span>
                        </template>
                        <template v-else-if="isColorField(key)">
                          <el-popover placement="bottom" :width="200" trigger="click">
                            <template #reference>
                              <span class="color-chip">
                                <span class="color-swatch" :style="{ background: toHex(val) }"></span>
                                {{ val }}
                              </span>
                            </template>
                            <input type="color" :value="toHex(val)" @change="setColor(item, 'runStyle', key, $event)" />
                          </el-popover>
                        </template>
                        <template v-else-if="isSpacingField(key)">
                          <span class="spacing-row">
                            <template v-if="val.before !== undefined">
                              <span class="spacing-label">before</span>
                              <button class="step-btn" @click="stepSpacing(item, 'runStyle', 'before', -1)">−</button>
                              <span class="stepper-val">{{ val.before }}</span>
                              <button class="step-btn" @click="stepSpacing(item, 'runStyle', 'before', 1)">+</button>
                            </template>
                            <template v-if="val.after !== undefined">
                              <span class="spacing-label">after</span>
                              <button class="step-btn" @click="stepSpacing(item, 'runStyle', 'after', -1)">−</button>
                              <span class="stepper-val">{{ val.after }}</span>
                              <button class="step-btn" @click="stepSpacing(item, 'runStyle', 'after', 1)">+</button>
                            </template>
                            <template v-if="val.line !== undefined">
                              <span class="spacing-label">line</span>
                              <button class="step-btn" @click="stepSpacing(item, 'runStyle', 'line', -1)">−</button>
                              <span class="stepper-val">{{ val.line }}</span>
                              <button class="step-btn" @click="stepSpacing(item, 'runStyle', 'line', 1)">+</button>
                            </template>
                            <template v-for="(sv, sk) in val" :key="sk">
                              <template v-if="sk !== 'before' && sk !== 'after' && sk !== 'line'">
                                <span class="spacing-label">{{ sk }}</span>
                                <span class="spacing-other">{{ sv }}</span>
                              </template>
                            </template>
                          </span>
                        </template>
                        <template v-else>
                          {{ formatPropVal(val) }}
                        </template>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- Editable defaults section -->
        <div v-if="defaults" class="defaults-section">
          <el-collapse v-model="defaultsActive">
            <el-collapse-item name="defaults">
              <template #title>
                <div class="format-item-header">
                  <span class="format-name">{{ t('proof.formatClone.defaults') }}</span>
                </div>
              </template>
              <div class="format-detail">
                <div v-if="defaults.paragraphStyle && Object.keys(defaults.paragraphStyle).length > 0" class="style-section">
                  <strong>{{ t('proof.formatClone.paragraphStyle') }}</strong>
                  <div class="style-props">
                    <div v-for="(val, key) in defaults.paragraphStyle" :key="key" class="style-prop">
                      <span class="prop-key">{{ key }}</span>
                      <span class="prop-val">
                        <template v-if="isBoolField(val)">
                          <button class="toggle-btn" :class="{ on: val }" @click="toggleDefaultsProp('paragraphStyle', key)">
                            {{ val }}
                          </button>
                        </template>
                        <template v-else-if="isStepperField(key)">
                          <span class="stepper">
                            <button class="step-btn" @click="stepDefaultsValue('paragraphStyle', -1)">−</button>
                            <span class="stepper-val">{{ val }}</span>
                            <button class="step-btn" @click="stepDefaultsValue('paragraphStyle', 1)">+</button>
                          </span>
                        </template>
                        <template v-else-if="isColorField(key)">
                          <el-popover placement="bottom" :width="200" trigger="click">
                            <template #reference>
                              <span class="color-chip">
                                <span class="color-swatch" :style="{ background: toHex(val) }"></span>
                                {{ val }}
                              </span>
                            </template>
                            <input type="color" :value="toHex(val)" @change="setDefaultsColor('paragraphStyle', key, $event)" />
                          </el-popover>
                        </template>
                        <template v-else-if="isSpacingField(key)">
                          <span class="spacing-row">
                            <template v-if="val.before !== undefined">
                              <span class="spacing-label">before</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('paragraphStyle', 'before', -1)">−</button>
                              <span class="stepper-val">{{ val.before }}</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('paragraphStyle', 'before', 1)">+</button>
                            </template>
                            <template v-if="val.after !== undefined">
                              <span class="spacing-label">after</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('paragraphStyle', 'after', -1)">−</button>
                              <span class="stepper-val">{{ val.after }}</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('paragraphStyle', 'after', 1)">+</button>
                            </template>
                            <template v-if="val.line !== undefined">
                              <span class="spacing-label">line</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('paragraphStyle', 'line', -1)">−</button>
                              <span class="stepper-val">{{ val.line }}</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('paragraphStyle', 'line', 1)">+</button>
                            </template>
                            <template v-for="(sv, sk) in val" :key="sk">
                              <template v-if="sk !== 'before' && sk !== 'after' && sk !== 'line'">
                                <span class="spacing-label">{{ sk }}</span>
                                <span class="spacing-other">{{ sv }}</span>
                              </template>
                            </template>
                          </span>
                        </template>
                        <template v-else>
                          {{ formatPropVal(val) }}
                        </template>
                      </span>
                    </div>
                  </div>
                </div>
                <div v-if="defaults.runStyle && Object.keys(defaults.runStyle).length > 0" class="style-section">
                  <strong>{{ t('proof.formatClone.runStyle') }}</strong>
                  <div class="style-props">
                    <div v-for="(val, key) in defaults.runStyle" :key="key" class="style-prop">
                      <span class="prop-key">{{ key }}</span>
                      <span class="prop-val">
                        <template v-if="isBoolField(val)">
                          <button class="toggle-btn" :class="{ on: val }" @click="toggleDefaultsProp('runStyle', key)">
                            {{ val }}
                          </button>
                        </template>
                        <template v-else-if="isStepperField(key)">
                          <span class="stepper">
                            <button class="step-btn" @click="stepDefaultsValue('runStyle', -1)">−</button>
                            <span class="stepper-val">{{ val }}</span>
                            <button class="step-btn" @click="stepDefaultsValue('runStyle', 1)">+</button>
                          </span>
                        </template>
                        <template v-else-if="isColorField(key)">
                          <el-popover placement="bottom" :width="200" trigger="click">
                            <template #reference>
                              <span class="color-chip">
                                <span class="color-swatch" :style="{ background: toHex(val) }"></span>
                                {{ val }}
                              </span>
                            </template>
                            <input type="color" :value="toHex(val)" @change="setDefaultsColor('runStyle', key, $event)" />
                          </el-popover>
                        </template>
                        <template v-else-if="isSpacingField(key)">
                          <span class="spacing-row">
                            <template v-if="val.before !== undefined">
                              <span class="spacing-label">before</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('runStyle', 'before', -1)">−</button>
                              <span class="stepper-val">{{ val.before }}</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('runStyle', 'before', 1)">+</button>
                            </template>
                            <template v-if="val.after !== undefined">
                              <span class="spacing-label">after</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('runStyle', 'after', -1)">−</button>
                              <span class="stepper-val">{{ val.after }}</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('runStyle', 'after', 1)">+</button>
                            </template>
                            <template v-if="val.line !== undefined">
                              <span class="spacing-label">line</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('runStyle', 'line', -1)">−</button>
                              <span class="stepper-val">{{ val.line }}</span>
                              <button class="step-btn" @click="stepDefaultsSpacing('runStyle', 'line', 1)">+</button>
                            </template>
                            <template v-for="(sv, sk) in val" :key="sk">
                              <template v-if="sk !== 'before' && sk !== 'after' && sk !== 'line'">
                                <span class="spacing-label">{{ sk }}</span>
                                <span class="spacing-other">{{ sv }}</span>
                              </template>
                            </template>
                          </span>
                        </template>
                        <template v-else>
                          {{ formatPropVal(val) }}
                        </template>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- Output mode (agent flow only) + Apply/Export buttons -->
        <div v-if="formatItems.length > 0" class="action-bar-bottom">
          <el-radio-group v-if="flowType === 'agent'" v-model="outputMode" size="small">
            <el-radio value="new">{{ t('proof.formatClone.exportNewFile') }}</el-radio>
            <el-radio value="overwrite">{{ t('proof.formatClone.overwriteOriginal') }}</el-radio>
          </el-radio-group>
          <!-- 强制覆盖选项（仅简单克隆流程可用） -->
          <div v-if="flowType === 'simple'" class="force-overwrite-row">
            <el-tooltip
              placement="top"
              :width="280"
            >
              <template #content>
                <div class="force-tooltip-content">
                  <p><strong>⚠️ {{ t('proof.formatClone.forceOverwrite') }}</strong></p>
                  <p>{{ t('proof.formatClone.forceDesc') }}</p>
                  <p><strong>{{ t('proof.formatClone.forceRisk') }}</strong></p>
                  <ul>
                    <li>{{ t('proof.formatClone.forceRisk1') }}</li>
                    <li>{{ t('proof.formatClone.forceRisk2') }}</li>
                  </ul>
                  <p><strong>{{ t('proof.formatClone.forceScenePrefix') }}</strong>{{ t('proof.formatClone.forceScene') }}</p>
                </div>
              </template>
              <el-checkbox v-model="forceOverwrite" size="small">
                {{ t('proof.formatClone.forceOverwrite') }}
                <el-icon class="info-icon"><QuestionFilled /></el-icon>
              </el-checkbox>
            </el-tooltip>
          </div>
          <div class="action-buttons">
            <el-button
              type="primary"
              size="small"
              :loading="cloning"
              :disabled="formatItems.length === 0 || !targetFilePath"
              @click="doClone"
            >
              {{ t('proof.formatClone.start') }}
            </el-button>
            <el-button
              type="success"
              size="small"
              :disabled="!clonedFilePath"
              :loading="exporting"
              @click="doExport"
            >
              {{ t('proof.formatClone.export') }}
            </el-button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { ElButton, ElCheckbox, ElCollapse, ElCollapseItem, ElMessage, ElTooltip, ElIcon, ElPopover, ElRadio, ElRadioGroup } from 'element-plus'
import { QuestionFilled, CircleClose } from '@element-plus/icons-vue'

import { useApiStore } from '../stores/apiStore'
import { fileInfoStore } from '../stores/store'
import { renderAsync } from 'docx-preview'
import { applyPreviewPerfHints } from '../utils/previewPerf'

const electronAPI = window.electronAPI
const apiStore = useApiStore()
const fileStore = fileInfoStore()

// ---- ALL STATE IS INTERNAL (no inject) ----

// Computed from store
const targetFilePath = computed(() => fileStore.filePath)

// Reference document state
const refFilePath = ref('')
const refFileName = ref('')
const selectingRef = ref(false)

// Format items & defaults (shared between simple clone and agent flows)
const formatItems = ref([])
const defaults = ref(null)
const activeNames = ref([])
const defaultsActive = ref([])

// Clone/export state
const clonedFilePath = ref('')
const cloning = ref(false)
const exporting = ref(false)

// Flow tracking: 'simple' | 'agent'
const flowType = ref('simple')

// Description input state
const descText = ref('')
const descFileName = ref('')
const selectingDescFile = ref(false)

// 强制覆盖行内格式选项（仅简单克隆流程可用）
const forceOverwrite = ref(false)

// Agent-specific state
const analyzing = ref(false)
const outputMode = ref('new')
const agentSpec = ref(null)
const agentClassification = ref(null)
const agentTokenUsage = ref(0)
const progressPercent = ref(0)
let progressInterval = null

// ---- Utility helpers (preserved exactly from original) ----

const truncatedName = name => (name.length > 20 ? name.slice(0, 20) + '...' : name)

const isBoolField = val => typeof val === 'boolean'
const isStepperField = key => key === 'fontSize' || key === 'outlineLevel'
const isColorField = key => key === 'color' || key === 'highlight'
const isSpacingField = key => key === 'spacing'

const toHex = v => {
  if (!v || typeof v !== 'string') return '#000000'
  return v.startsWith('#') ? v : '#' + v
}

const fromHex = v => (v || '').replace('#', '').toUpperCase()

const formatPropVal = val => {
  if (typeof val === 'object' && val !== null) {
    return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join(', ')
  }
  return String(val)
}

const toggleStyleProp = (item, styleType, key) => {
  item[styleType][key] = !item[styleType][key]
}

const stepValue = (item, styleType, fieldKey, delta) => {
  const cur = parseInt(item[styleType][fieldKey]) || 0
  const max = fieldKey === 'outlineLevel' ? 9 : 200
  const min = fieldKey === 'outlineLevel' ? 0 : 6
  const step = fieldKey === 'outlineLevel' ? 1 : 2
  const next = Math.max(min, Math.min(max, cur + delta * step))
  item[styleType][fieldKey] = String(next)
}

const stepSpacing = (item, styleType, fieldKey, delta) => {
  const cur = parseInt(item[styleType].spacing[fieldKey]) || 0
  const next = Math.max(0, cur + delta * 20)
  item[styleType].spacing[fieldKey] = String(next)
}

const setColor = (item, styleType, key, event) => {
  item[styleType][key] = fromHex(event.target.value)
}

const toggleDefaultsProp = (styleType, key) => {
  if (!defaults.value[styleType]) return
  defaults.value[styleType][key] = !defaults.value[styleType][key]
}

const stepDefaultsValue = (styleType, fieldKey, delta) => {
  if (!defaults.value[styleType]) return
  const cur = parseInt(defaults.value[styleType][fieldKey]) || 0
  const max = fieldKey === 'outlineLevel' ? 9 : 200
  const min = fieldKey === 'outlineLevel' ? 0 : 6
  const step = fieldKey === 'outlineLevel' ? 1 : 2
  const next = Math.max(min, Math.min(max, cur + delta * step))
  defaults.value[styleType][fieldKey] = String(next)
}

const stepDefaultsSpacing = (styleType, fieldKey, delta) => {
  if (!defaults.value[styleType] || !defaults.value[styleType].spacing) return
  const cur = parseInt(defaults.value[styleType].spacing[fieldKey]) || 0
  const next = Math.max(0, cur + delta * 20)
  defaults.value[styleType].spacing[fieldKey] = String(next)
}

const setDefaultsColor = (styleType, key, event) => {
  if (!defaults.value[styleType]) return
  defaults.value[styleType][key] = fromHex(event.target.value)
}

// ---- Profile building ----

const buildProfile = () => {
  const styles = {}
  for (const item of formatItems.value) {
    styles[item.id] = {
      name: item.name,
      type: item.type,
      paragraphStyle: item.paragraphStyle,
      runStyle: item.runStyle
    }
  }
  return { defaults: defaults.value, styles }
}

// ---- Spec conversion for agent flow ----

const specToFormatItems = (spec) => {
  const items = []
  // styleProfile.styles → items
  if (spec.styleProfile?.styles) {
    for (const [id, style] of Object.entries(spec.styleProfile.styles)) {
      items.push({
        id,
        name: style.name || id,
        type: style.type || 'paragraph',
        basedOn: style.basedOn || undefined,
        paragraphStyle: { ...(style.paragraphStyle || {}) },
        runStyle: { ...(style.runStyle || {}) }
      })
    }
  }
  // paragraphRules → add items for types not yet in list
  if (spec.paragraphRules) {
    for (const rule of spec.paragraphRules) {
      const pType = rule.match?.paragraphType
      if (pType && !items.find(i => i.id === pType)) {
        items.push({
          id: pType,
          name: pType,
          type: 'paragraph',
          basedOn: undefined,
          paragraphStyle: { ...(rule.format?.paragraphStyle || {}) },
          runStyle: { ...(rule.format?.runStyle || {}) }
        })
      }
    }
  }
  return items
}

const specToDefaults = (spec) => {
  return spec.styleProfile?.defaults || null
}

const buildSpecFromFormatItems = () => {
  const styles = {}
  // Rebuild paragraphRules from user-edited formatItems so edits actually take effect
  const paragraphRules = []
  for (const item of formatItems.value) {
    const styleEntry = {
      name: item.name,
      type: item.type,
      basedOn: item.basedOn || undefined,
      paragraphStyle: item.paragraphStyle,
      runStyle: item.runStyle
    }
    styles[item.id] = styleEntry

    // Create a matching paragraphRule so inline formatting is applied to paragraphs
    paragraphRules.push({
      match: { paragraphType: item.id },
      format: {
        paragraphStyle: item.paragraphStyle,
        runStyle: item.runStyle
      },
      exclusive: true
    })
  }

  // Preserve pageSettings from original spec
  const pageSettings = agentSpec.value?.pageSettings || undefined

  return {
    styleProfile: {
      defaults: defaults.value ? { ...defaults.value } : undefined,
      styles
    },
    paragraphRules,
    ...(pageSettings ? { pageSettings } : {})
  }
}

// ---- Preview rendering ----

const renderPreview = async (filePath) => {
  const fileData = await electronAPI.readDocxFile(filePath)
  const byteCharacters = atob(fileData.content)
  const byteArrays = []
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512)
    const byteNumbers = new Array(slice.length)
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i)
    }
    byteArrays.push(new Uint8Array(byteNumbers))
  }
  const blob = new Blob(byteArrays, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
  const file = new File([blob], fileStore.fileName, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
  const container = document.querySelector('.preview-container')
  if (container) {
    container.innerHTML = ''
    await renderAsync(file, container)
    // 与校对预览一致的大文档优化：视口外页面跳过渲染
    applyPreviewPerfHints(container)
  }
}

// ---- Reference doc selection ----

const selectRefFile = async () => {
  selectingRef.value = true
  try {
    const filePath = await electronAPI.selectDocxFile()
    if (!filePath) return

    refFilePath.value = filePath
    refFileName.value = filePath.split('\\').pop().split('/').pop()
    clonedFilePath.value = ''

    const profile = await electronAPI.getFormatProfile(filePath)
    defaults.value = profile.defaults || null

    const items = []
    for (const [id, style] of Object.entries(profile.styles || {})) {
      items.push({
        id,
        name: style.name || id,
        type: style.type || 'paragraph',
        paragraphStyle: { ...style.paragraphStyle } || {},
        runStyle: { ...style.runStyle } || {}
      })
    }
    formatItems.value = items
    if (items.length > 0) activeNames.value = [0]
    if (defaults.value) defaultsActive.value = ['defaults']
    flowType.value = 'simple'
  } catch (e) {
    ElMessage.error(t('proof.formatClone.extractFailed'))
  } finally {
    selectingRef.value = false
  }
}

// ---- Description file selection ----

const selectDescFile = async () => {
  selectingDescFile.value = true
  try {
    const filePath = await electronAPI.selectFormatDescFile()
    if (!filePath) return

    // Clear previous results so input area shows again
    formatItems.value = []
    defaults.value = null
    clonedFilePath.value = ''
    flowType.value = 'simple'
    agentSpec.value = null
    agentClassification.value = null
    agentTokenUsage.value = 0

    descFileName.value = filePath.split('\\').pop().split('/').pop()

    const ext = filePath.split('.').pop().toLowerCase()

    if (ext === 'docx') {
      const result = await electronAPI.extractDocxText(filePath)
      if (result.success && result.text) {
        descText.value = result.text
      } else {
        ElMessage.error(result.error || t('proof.formatFromDesc.readFileFailed'))
      }
    } else {
      const result = await electronAPI.readTextFile(filePath)
      if (result.success) {
        descText.value = result.content
      } else {
        ElMessage.error(t('proof.formatFromDesc.readFileFailed'))
      }
    }
  } catch (e) {
    ElMessage.error(t('proof.formatFromDesc.readFileFailed'))
  } finally {
    selectingDescFile.value = false
  }
}

// ---- Clear functions ----

const clearRefFile = () => {
  refFilePath.value = ''
  refFileName.value = ''
  // 如果没有格式描述，清除结果状态
  if (!descText.value.trim()) {
    formatItems.value = []
    defaults.value = null
    clonedFilePath.value = ''
    flowType.value = 'simple'
    agentSpec.value = null
    agentClassification.value = null
    agentTokenUsage.value = 0
  }
  ElMessage.success(t('proof.formatClone.clearedRef'))
}

const clearDescFile = () => {
  descFileName.value = ''
  descText.value = ''
  // 如果没有参考文档，清除结果状态
  if (!refFilePath.value) {
    formatItems.value = []
    defaults.value = null
    clonedFilePath.value = ''
    flowType.value = 'simple'
    agentSpec.value = null
    agentClassification.value = null
    agentTokenUsage.value = 0
  }
  ElMessage.success(t('proof.formatClone.clearedDesc'))
}

// ---- Unified start function ----

const startFormat = async () => {
  const hasRef = refFilePath.value.trim() !== ''
  const hasDesc = descText.value.trim() !== ''

  if (!hasRef && !hasDesc) {
    ElMessage.warning(t('proof.formatClone.needRefOrDesc'))
    return
  }

  if (!targetFilePath.value) {
    ElMessage.warning(t('proof.formatClone.openTargetFirst'))
    return
  }

  if (hasRef && !hasDesc) {
    // Simple clone flow: apply reference doc format directly
    await doClone()
  } else {
    // Agent flow: has description (with or without ref doc)
    await agentFlow()
  }
}

// ---- Agent flow (LLM) ----

const agentFlow = async () => {
  analyzing.value = true
  clonedFilePath.value = ''
  // Start fake progress: ~0→99% over ~120s
  progressPercent.value = 0
  const steps = 240
  let current = 0
  progressInterval = setInterval(() => {
    current++
    if (current < steps) {
      progressPercent.value = Math.round((current / steps) * 99)
    } else {
      progressPercent.value = 99
    }
  }, 500)
  try {
    const currentApi = apiStore.selectedApi
    const apiConfig = {
      apiKey: currentApi.key,
      modelName: currentApi.name,
      apiURL: currentApi.URL,
      provider: currentApi.provider
    }
    const result = await electronAPI.smartFormatAnalyze({
      description: descText.value.trim() || undefined,
      refFilePath: refFilePath.value || undefined,
      targetFilePath: targetFilePath.value,
      apiConfig
    })
    if (result.success) {
      agentSpec.value = result.spec
      agentClassification.value = result.classification
      agentTokenUsage.value = result.tokenUsage || 0
      flowType.value = 'agent'

      // Convert spec to editable formatItems
      formatItems.value = specToFormatItems(result.spec)
      defaults.value = specToDefaults(result.spec)

      if (formatItems.value.length > 0) activeNames.value = [0]
      if (defaults.value) defaultsActive.value = ['defaults']

      ElMessage.success(t('proof.formatClone.analyzeDone', { count: formatItems.value.length }))
    } else {
      ElMessage.error(result.error || t('proof.formatClone.analyzeFailed'))
    }
  } catch (e) {
    ElMessage.error(t('proof.formatClone.analyzeError') + (e.message || String(e)))
  } finally {
    clearInterval(progressInterval)
    progressPercent.value = 100
    analyzing.value = false
  }
}

// ---- Progress cleanup & textarea compress ----
watch(formatItems, (items) => {
  if (items.length > 0 && progressInterval) {
    clearInterval(progressInterval)
    progressPercent.value = 100
  }
})

onUnmounted(() => {
  if (progressInterval) clearInterval(progressInterval)
})

// ---- Clone / Apply ----

const doClone = async () => {
  cloning.value = true
  try {
    if (flowType.value === 'agent' && agentSpec.value && agentClassification.value) {
      // Agent flow: rebuild spec from edited formatItems and apply
      // Deep-clone to strip Vue reactive Proxies — IPC structured clone cannot serialize Proxies
      const spec = JSON.parse(JSON.stringify(buildSpecFromFormatItems()))
      const outputPath = outputMode.value === 'new'
        ? targetFilePath.value.replace(/\.docx$/i, '_formatted.docx')
        : targetFilePath.value
      const classification = JSON.parse(JSON.stringify(agentClassification.value))
      const result = await electronAPI.smartFormatApply({
        inputPath: targetFilePath.value,
        outputPath,
        spec,
        classification
      })
      if (result.success) {
        clonedFilePath.value = result.filePath || outputPath
        await renderPreview(result.filePath || outputPath)
        ElMessage.success(
          t('proof.formatClone.applyDone', {
            paragraphs: result.appliedParagraphs || 0,
            preserved: result.contentPreserved
              ? t('proof.formatClone.preservedYes')
              : t('proof.formatClone.preservedNo')
          })
        )
      } else {
        console.error('[FormatClone] smartFormatApply failed:', result.error)
        ElMessage.error(t('proof.formatClone.cloneFailed') + (result.error || t('proof.formatClone.unknownError')))
      }
    } else {
      // Simple clone flow
      const profile = JSON.parse(JSON.stringify(buildProfile()))
      let result
      if (forceOverwrite.value) {
        // 强制覆盖行内格式
        result = await electronAPI.cloneFormatWithProfileForce(profile, targetFilePath.value)
        if (result.success) {
          clonedFilePath.value = result.filePath
          await renderPreview(result.filePath)
          const matchedStyles = result.matchedStyles || 0
          const appliedParagraphs = result.appliedParagraphs || 0
          if (matchedStyles === 0) {
            ElMessage.warning(t('proof.formatClone.cloneDefaultOnly', { paragraphs: appliedParagraphs }))
          } else {
            ElMessage.success(
              t('proof.formatClone.cloneForced', { styles: matchedStyles, paragraphs: appliedParagraphs })
            )
          }
        }
      } else {
        // 普通克隆（只修改样式定义）
        result = await electronAPI.cloneFormatWithProfile(profile, targetFilePath.value)
        if (result.success) {
          clonedFilePath.value = result.filePath
          await renderPreview(result.filePath)
          ElMessage.success(t('proof.formatClone.cloneSuccess'))
        }
      }
      if (!result?.success) {
        console.error('[FormatClone] cloneFormatWithProfile failed:', result)
        ElMessage.error(t('proof.formatClone.failed'))
      }
    }
  } catch (e) {
    console.error('[FormatClone] doClone exception:', e)
    ElMessage.error(t('proof.formatClone.failed') + ': ' + (e.message || String(e)))
  } finally {
    cloning.value = false
  }
}

// ---- Export ----

const doExport = async () => {
  if (!clonedFilePath.value) return
  exporting.value = true
  try {
    const result = await electronAPI.exportFormatCloned(clonedFilePath.value, targetFilePath.value)
    if (result?.canceled) return
    if (result?.success) {
      ElMessage.success(t('proof.messages.exportSuccess') + (result.filePath || ''))
    }
  } catch (e) {
    ElMessage.error(t('proof.messages.exportFailed') + e.message)
  } finally {
    exporting.value = false
  }
}

// ---- Expose state for App.vue to provide to DocPreview ----
defineExpose({
  refFilePath,
  targetFilePath,
  clonedFilePath,
  cloning,
  exporting,
  formatItems,
  doClone,
  doExport
})
</script>

<style scoped>
.format-clone-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #ffffff;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.clone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #edf0f4;
  flex-shrink: 0;
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  color: #4a6580;
}

.clone-body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

/* ---- Input Section ---- */
.input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  transition: flex 0.4s ease, min-height 0.4s ease;
  overflow: hidden;
}

.input-section.expand {
  flex: 1;
  min-height: 0;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.input-label {
  font-size: 13px;
  font-weight: 500;
  color: #4a6580;
  white-space: nowrap;
  min-width: 80px;
}

.ref-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ref-file-name {
  font-size: 12px;
  color: #5a6a7a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.clear-icon {
  font-size: 16px;
  color: #b0b8c4;
  cursor: pointer;
  transition: color 0.2s;
  flex-shrink: 0;
}

.clear-icon:hover {
  color: #f56c6c;
}

/* ---- Description textarea ---- */
.desc-textarea {
  width: 100%;
  min-height: 80px;
  max-height: 160px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #4a6580;
  background: #f8fafb;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  resize: vertical;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  transition: max-height 0.4s ease, height 0.4s ease;
}

.desc-textarea.expand {
  flex: 1;
  height: 100%;
  max-height: none;
  resize: none;
}

.desc-textarea[readonly] {
  max-height: 100px;
  resize: none;
  opacity: 0.7;
  cursor: default;
}

.desc-textarea:focus {
  border-color: #7b9eb8;
  background: #ffffff;
}

.desc-textarea::placeholder {
  color: #b0b8c4;
}

.start-btn-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.hint-text {
  font-size: 11px;
  color: #b0b8c4;
}

.inline-progress-bar {
  flex: 1;
  min-width: 60px;
}

.inline-progress-bar :deep(.el-progress-bar__outer) {
  background-color: #e0e3e8;
}

.inline-progress-bar :deep(.el-progress-bar__inner) {
  background-color: #7b9eb8;
  transition: width 0.5s ease;
}

/* ---- Format list (scrollable results) ---- */
.format-list {
  flex: 4;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.format-list::-webkit-scrollbar {
  display: none;
}

.defaults-section {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.defaults-section::-webkit-scrollbar {
  display: none;
}

.format-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.format-item-header .format-type-badge {
  margin-left: auto;
}

.format-name {
  font-weight: 500;
  font-size: 13px;
  color: #4a6580;
}

.format-type-badge {
  font-size: 11px;
  color: #8a929e;
}

.format-detail {
  padding: 4px 0;
  min-width: 0;
  overflow-x: hidden;
}

.style-section {
  margin-bottom: 10px;
  min-width: 0;
}

.style-section strong {
  display: block;
  font-size: 12px;
  color: #7b9eb8;
  margin-bottom: 6px;
}

.style-props {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.style-prop {
  display: flex;
  align-items: center;
  font-size: 12px;
  line-height: 1.5;
  min-width: 0;
  gap: 6px;
}

.prop-key {
  color: #8a929e;
  width: 80px;
  flex-shrink: 0;
}

.prop-val {
  color: #5a6a7a;
  min-width: 0;
  overflow: hidden;
  flex: 1;
}

.toggle-btn {
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  padding: 1px 10px;
  font-size: 11px;
  cursor: pointer;
  background: #f5f6f8;
  color: #8a929e;
  transition: all 0.15s;
}

.toggle-btn.on {
  background: rgba(103, 194, 58, 0.12);
  border-color: #67c23a;
  color: #5baa3a;
}

.stepper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stepper-val {
  font-size: 12px;
  min-width: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.step-btn {
  border: 1px solid #d0d5dd;
  border-radius: 3px;
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  background: #f5f6f8;
  color: #5a6a7a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.step-btn:hover {
  background: #e8ebf0;
}

.color-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #e0e3e8;
}

.color-chip:hover {
  border-color: #b0b8c4;
}

.color-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid rgba(0,0,0,0.1);
  flex-shrink: 0;
}

.spacing-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.spacing-label {
  font-size: 10px;
  color: #a0a8b4;
  margin-right: 2px;
}

.spacing-other {
  font-size: 12px;
  color: #5a6a7a;
  margin-right: 8px;
}

/* ---- Results summary ---- */
.result-summary {
  font-size: 12px;
  color: #8a929e;
  padding: 4px 0 8px;
  flex-shrink: 0;
}

/* ---- Action buttons at bottom ---- */
.action-bar-bottom {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  padding-top: 4px;
  border-top: 1px solid #edf0f4;
}

.action-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ---- Force overwrite option ---- */
.force-overwrite-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
}

.force-overwrite-row :deep(.el-checkbox__label) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #5a6a7a;
}

.info-icon {
  font-size: 14px;
  color: #b0b8c4;
  cursor: help;
}

.force-tooltip-content {
  font-size: 12px;
  line-height: 1.6;
}

.force-tooltip-content p {
  margin: 4px 0;
}

.force-tooltip-content ul {
  margin: 4px 0;
  padding-left: 16px;
}

.force-tooltip-content li {
  margin: 2px 0;
}

.detail-row {
  font-size: 12px;
  line-height: 1.8;
  color: #5a6a7a;
  padding: 2px 0;
}

/* ---- Dark mode overrides ---- */
.dark .format-clone-panel {
  background-color: #1a1a2e;
}

.dark .clone-header {
  border-bottom-color: #2c2e30;
}

.dark .header-title {
  color: #c0c8d0;
}

.dark .input-label {
  color: #c0c8d0;
}

.dark .ref-file-name {
  color: #a0a8b4;
}

.dark .clear-icon {
  color: #6a7078;
}

.dark .clear-icon:hover {
  color: #f56c6c;
}

.dark .desc-textarea {
  color: #c0c8d0;
  background: #2a2a3a;
  border-color: #3a3a4a;
}

.dark .desc-textarea:focus {
  border-color: #7b9eb8;
  background: #1f1f33;
}

.dark .desc-textarea::placeholder {
  color: #6a7078;
}

.dark .hint-text {
  color: #6a7078;
}

.dark .inline-progress-bar :deep(.el-progress-bar__outer) {
  background-color: #3a3a4a;
}

.dark .inline-progress-bar :deep(.el-progress-bar__inner) {
  background-color: #7b9eb8;
}

.dark .format-name {
  color: #c0c8d0;
}

.dark .format-type-badge {
  color: #8890a0;
}

.dark .style-section strong {
  color: #a0bdd0;
}

.dark .prop-key {
  color: #8890a0;
}

.dark .prop-val {
  color: #a0a8b4;
}

.dark .toggle-btn {
  border-color: #3a3a4a;
  background: #2a2a3a;
  color: #8890a0;
}

.dark .toggle-btn.on {
  background: rgba(103, 194, 58, 0.15);
  border-color: #67c23a;
  color: #67c23a;
}

.dark .step-btn {
  border-color: #3a3a4a;
  background: #2a2a3a;
  color: #a0a8b4;
}

.dark .step-btn:hover {
  background: #3a3a4a;
}

.dark .color-chip {
  border-color: #3a3a4a;
}

.dark .color-chip:hover {
  border-color: #6a7078;
}

.dark .spacing-label {
  color: #6a7078;
}

.dark .spacing-other {
  color: #a0a8b4;
}

.dark .result-summary {
  color: #8890a0;
}

.dark .action-bar-bottom {
  border-top-color: #2c2e30;
}

.dark .detail-row {
  color: #a0a8b4;
}

.dark .force-overwrite-row :deep(.el-checkbox__label) {
  color: #a0a8b4;
}

.dark .info-icon {
  color: #6a7078;
}
</style>
