<template>
  <div class="style-props">
    <div v-for="(val, key) in styleObj" :key="key" class="style-prop">
      <span class="prop-key">{{ key }}</span>
      <span class="prop-val">
        <template v-if="isBoolField(val)">
          <button class="toggle-btn" :class="{ on: val }" @click="toggleProp(key)">
            {{ val }}
          </button>
        </template>
        <template v-else-if="isStepperField(key)">
          <span class="stepper">
            <button class="step-btn" @click="stepValue(key, -1)">−</button>
            <span class="stepper-val">{{ val }}</span>
            <button class="step-btn" @click="stepValue(key, 1)">+</button>
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
            <input type="color" :value="toHex(val)" @change="setColor(key, $event)" />
          </el-popover>
        </template>
        <template v-else-if="isSpacingField(key)">
          <span class="spacing-row">
            <template v-if="val.before !== undefined">
              <span class="spacing-label">before</span>
              <button class="step-btn" @click="stepSpacing('before', -1)">−</button>
              <span class="stepper-val">{{ val.before }}</span>
              <button class="step-btn" @click="stepSpacing('before', 1)">+</button>
            </template>
            <template v-if="val.after !== undefined">
              <span class="spacing-label">after</span>
              <button class="step-btn" @click="stepSpacing('after', -1)">−</button>
              <span class="stepper-val">{{ val.after }}</span>
              <button class="step-btn" @click="stepSpacing('after', 1)">+</button>
            </template>
            <template v-if="val.line !== undefined">
              <span class="spacing-label">line</span>
              <button class="step-btn" @click="stepSpacing('line', -1)">−</button>
              <span class="stepper-val">{{ val.line }}</span>
              <button class="step-btn" @click="stepSpacing('line', 1)">+</button>
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
</template>

<script setup>
import { ElPopover } from 'element-plus'

// styleObj 为父级响应式对象的引用（formatItem.paragraphStyle / runStyle 或
// defaults 的同名对象）。与原实装一致采用原位改写：布尔开关/步进/取色
// 直接写回对象属性，父级的响应式随之更新，无需 emit 中转。
// 该「可变记录共享」是有意契约（父级拥有对象、原位编辑即接口，
// 等价于拆分前 ProofClone 内 item[styleType][key] 的直改写），
// 故对 vue/no-mutating-props 做定点豁免。
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  styleObj: { type: Object, required: true }
})

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
    return Object.entries(val)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  }
  return String(val)
}

const toggleProp = key => {
  props.styleObj[key] = !props.styleObj[key]
}

const stepValue = (fieldKey, delta) => {
  const cur = parseInt(props.styleObj[fieldKey]) || 0
  const max = fieldKey === 'outlineLevel' ? 9 : 200
  const min = fieldKey === 'outlineLevel' ? 0 : 6
  const step = fieldKey === 'outlineLevel' ? 1 : 2
  const next = Math.max(min, Math.min(max, cur + delta * step))
  props.styleObj[fieldKey] = String(next)
}

const stepSpacing = (fieldKey, delta) => {
  const cur = parseInt(props.styleObj.spacing[fieldKey]) || 0
  const next = Math.max(0, cur + delta * 20)
  props.styleObj.spacing[fieldKey] = String(next)
}

const setColor = (key, event) => {
  props.styleObj[key] = fromHex(event.target.value)
}
</script>

<style scoped>
/* 自 FormatClone.vue 迁入（批次 9 抽组件）：属性行的编辑控件样式随组件走 */
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
  border: 1px solid rgba(0, 0, 0, 0.1);
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

/* ---- Dark mode（自 FormatClone.vue 迁入） ---- */
html.dark .prop-key {
  color: #8890a0;
}

html.dark .prop-val {
  color: #a0a8b4;
}

html.dark .toggle-btn {
  border-color: #3a3a4a;
  background: #2a2a3a;
  color: #8890a0;
}

html.dark .toggle-btn.on {
  background: rgba(103, 194, 58, 0.15);
  border-color: #67c23a;
  color: #67c23a;
}

html.dark .step-btn {
  border-color: #3a3a4a;
  background: #2a2a3a;
  color: #a0a8b4;
}

html.dark .step-btn:hover {
  background: #3a3a4a;
}

html.dark .color-chip {
  border-color: #3a3a4a;
}

html.dark .color-chip:hover {
  border-color: #6a7078;
}

html.dark .spacing-label {
  color: #6a7078;
}

html.dark .spacing-other {
  color: #a0a8b4;
}
</style>
