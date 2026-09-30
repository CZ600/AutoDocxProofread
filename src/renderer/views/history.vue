<template>
  <div class="table-container">
    <!-- 工具栏：搜索 + 两次校对对比 -->
    <div class="history-toolbar">
      <el-input
        v-model="searchText"
        :placeholder="t('history.searchPlaceholder')"
        clearable
        :prefix-icon="Search"
        class="search-input"
      />
      <div class="compare-controls">
        <el-select
          v-model="compareA"
          value-key="id"
          :placeholder="t('history.compareSelectA')"
          size="small"
          class="compare-select"
          clearable
        >
          <el-option v-for="row in history" :key="row.id" :label="rowLabel(row)" :value="row" />
        </el-select>
        <span class="compare-vs">VS</span>
        <el-select
          v-model="compareB"
          value-key="id"
          :placeholder="t('history.compareSelectB')"
          size="small"
          class="compare-select"
          clearable
        >
          <el-option v-for="row in history" :key="row.id" :label="rowLabel(row)" :value="row" />
        </el-select>
        <el-button size="small" type="primary" plain :loading="compareLoading" @click="openCompare">
          {{ t('history.compareBtn') }}
        </el-button>
      </div>
    </div>

    <el-table :data="pagedHistory" max-height="620" class="table" size="small">
      <!-- 有效信息优先：文件名 > 日期 > 模型 > 路径 -->
      <el-table-column :label="t('history.fileName')" min-width="180" show-overflow-tooltip>
        <template #default="scope">
          <span class="file-name-cell">{{ baseName(scope.row.filePath) || scope.row.filePath }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" :label="t('history.date')" width="160" />
      <el-table-column prop="modelName" :label="t('history.modelName')" width="120" show-overflow-tooltip />
      <el-table-column prop="filePath" :label="t('history.filePath')" min-width="150" show-overflow-tooltip />
      <el-table-column fixed="right" :label="t('history.operations')" width="150" class-name="ops-col">
        <template #default="scope">
          <el-button link type="primary" size="small" @click="showDetail(scope.row)">
            {{ t('history.detail') }}
          </el-button>
          <el-button link type="success" size="small" @click="restoreHistory(scope.row)">
            {{ t('history.restore') }}
          </el-button>
          <el-button link type="danger" size="small" @click="deleteHistory(scope.row.id)">
            {{ t('history.delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="footer-actions">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="filteredHistory.length"
        layout="total, prev, pager, next"
        :hide-on-single-page="filteredHistory.length <= pageSize"
      />
      <el-button size="small" :disabled="history.length === 0" class="btn-danger" @click="deleteAllHistory">
        {{ t('history.deleteAll') }}
      </el-button>
    </div>

    <!-- 详情：分类统计 + 结构化校对明细（替代原先的 JSON dump） -->
    <el-dialog v-model="detailVisible" :title="t('history.detailTitle')" width="64%" class="morandi-dialog">
      <div v-if="detailRow" class="detail-meta">
        <span class="detail-meta-item">{{ detailRow.created_at }}</span>
        <span class="detail-meta-item">{{ detailRow.modelName }}</span>
        <span class="detail-meta-item" :title="detailRow.filePath">{{ detailRow.filePath }}</span>
      </div>

      <div class="detail-stats">
        <span class="detail-stats-label">{{ t('history.statsByType') }}</span>
        <span class="stat-chip stat-chip-total" :class="{ active: detailTypeFilter === '' }" @click="detailTypeFilter = ''">
          {{ t('history.totalSuggestions') }} · {{ detailCorrections.length }}
        </span>
        <span
          v-for="stat in detailStats"
          :key="stat.type"
          class="stat-chip"
          :class="[`type-${stat.type.toLowerCase()}`, { active: detailTypeFilter === stat.type }]"
          @click="detailTypeFilter = detailTypeFilter === stat.type ? '' : stat.type"
        >
          {{ typeLabel(stat.type) }} · {{ stat.count }}
        </span>
      </div>

      <el-input
        v-model="detailSearch"
        :placeholder="t('history.searchCorrections')"
        clearable
        :prefix-icon="Search"
        size="small"
        class="detail-search"
      />

      <div v-if="pagedDetailCorrections.length > 0" class="correction-list">
        <div v-for="(item, idx) in pagedDetailCorrections" :key="idx" class="correction-row">
          <span class="correction-row-type" :class="`type-${correctionTypeCssKey(item.type)}`">
            {{ typeLabel(item.type) }}
          </span>
          <div class="correction-row-body">
            <div class="correction-row-text">
              <span class="text-original">{{ item.original || t('proof.noData') }}</span>
              <el-icon class="arrow-icon"><Right /></el-icon>
              <span class="text-suggested">{{ item.suggested || t('proof.noData') }}</span>
            </div>
            <div v-if="item.reason" class="correction-row-reason" :title="item.reason">{{ item.reason }}</div>
          </div>
        </div>
      </div>
      <div v-else class="no-corrections">{{ t('history.noCorrections') }}</div>

      <el-pagination
        v-if="filteredDetailCorrections.length > detailPageSize"
        v-model:current-page="detailPage"
        :page-size="detailPageSize"
        :total="filteredDetailCorrections.length"
        layout="prev, pager, next"
        class="detail-pagination"
        small
      />

      <el-collapse class="raw-json-collapse">
        <el-collapse-item :title="t('history.rawJson')" name="raw">
          <pre class="detail-pre">{{ detailRaw }}</pre>
        </el-collapse-item>
      </el-collapse>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailVisible = false">{{ t('history.close') }}</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 两次校对对比 -->
    <el-dialog v-model="compareVisible" :title="t('history.compareTitle')" width="64%" class="morandi-dialog">
      <div v-if="compareData" class="compare-meta">
        <div class="compare-meta-row">
          <span class="compare-tag">A</span>
          <span>{{ rowLabel(compareData.rowA) }}</span>
        </div>
        <div class="compare-meta-row">
          <span class="compare-tag tag-b">B</span>
          <span>{{ rowLabel(compareData.rowB) }}</span>
        </div>
      </div>

      <div class="compare-stats">
        <span class="detail-stats-label">{{ t('history.statsByType') }}</span>
        <div class="compare-stats-table">
          <div class="compare-stats-head">
            <span></span>
            <span>A</span>
            <span>B</span>
          </div>
          <div v-for="row in compareStatsRows" :key="row.type" class="compare-stats-row">
            <span>{{ typeLabel(row.type) }}</span>
            <span :class="{ zero: row.countA === 0 }">{{ row.countA }}</span>
            <span :class="{ zero: row.countB === 0 }">{{ row.countB }}</span>
          </div>
        </div>
      </div>

      <div class="compare-sections">
        <div class="compare-section">
          <div class="compare-section-title">{{ t('history.commonItems') }} · {{ compareData.common.length }}</div>
          <div v-for="(item, idx) in compareData.common.slice(0, 30)" :key="'c' + idx" class="correction-row">
            <span class="correction-row-type" :class="`type-${correctionTypeCssKey(item.type)}`">
              {{ typeLabel(item.type) }}
            </span>
            <div class="correction-row-body">
              <div class="correction-row-text">
                <span class="text-original">{{ item.original }}</span>
                <el-icon class="arrow-icon"><Right /></el-icon>
                <span class="text-suggested">{{ item.suggested }}</span>
              </div>
            </div>
          </div>
          <div v-if="compareData.common.length > 30" class="compare-more">
            +{{ compareData.common.length - 30 }}
          </div>
        </div>
        <div class="compare-section">
          <div class="compare-section-title">{{ t('history.onlyInA') }} · {{ compareData.onlyA.length }}</div>
          <div v-for="(item, idx) in compareData.onlyA.slice(0, 30)" :key="'a' + idx" class="correction-row">
            <span class="correction-row-type" :class="`type-${correctionTypeCssKey(item.type)}`">
              {{ typeLabel(item.type) }}
            </span>
            <div class="correction-row-body">
              <div class="correction-row-text">
                <span class="text-original">{{ item.original }}</span>
                <el-icon class="arrow-icon"><Right /></el-icon>
                <span class="text-suggested">{{ item.suggested }}</span>
              </div>
            </div>
          </div>
          <div v-if="compareData.onlyA.length > 30" class="compare-more">+{{ compareData.onlyA.length - 30 }}</div>
        </div>
        <div class="compare-section">
          <div class="compare-section-title">{{ t('history.onlyInB') }} · {{ compareData.onlyB.length }}</div>
          <div v-for="(item, idx) in compareData.onlyB.slice(0, 30)" :key="'b' + idx" class="correction-row">
            <span class="correction-row-type" :class="`type-${correctionTypeCssKey(item.type)}`">
              {{ typeLabel(item.type) }}
            </span>
            <div class="correction-row-body">
              <div class="correction-row-text">
                <span class="text-original">{{ item.original }}</span>
                <el-icon class="arrow-icon"><Right /></el-icon>
                <span class="text-suggested">{{ item.suggested }}</span>
              </div>
            </div>
          </div>
          <div v-if="compareData.onlyB.length > 30" class="compare-more">+{{ compareData.onlyB.length - 30 }}</div>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="compareVisible = false">{{ t('history.close') }}</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Right } from '@element-plus/icons-vue'

import { fileInfoStore } from '../stores/store'
import { canonicalCorrectionType, correctionTypeCssKey, correctionTypeLabel } from '../../shared/correctionTypes'

const { t } = useI18n()
const router = useRouter()
const electronAPI = window.electronAPI
const fileStore = fileInfoStore()

const history = ref<any[]>([])
const searchText = ref('')
const page = ref(1)
const pageSize = 20

// 明细弹窗状态
const detailVisible = ref(false)
const detailRow = ref<any>(null)
const detailCorrections = ref<any[]>([])
const detailRaw = ref('')
const detailSearch = ref('')
const detailTypeFilter = ref('')
const detailPage = ref(1)
const detailPageSize = 20

// 对比弹窗状态
const compareA = ref<any>(null)
const compareB = ref<any>(null)
const compareLoading = ref(false)
const compareVisible = ref(false)
const compareData = ref<any>(null)

// 详情结果缓存：详情/对比/恢复共用，避免重复读取大 JSON
const detailCache = new Map<number, any[]>()

const baseName = (path: string) => (path || '').split('\\').pop().split('/').pop()

const rowLabel = (row: any) => `${row.created_at || ''} ${baseName(row.filePath) || ''}`.trim()

const typeLabel = (type: string) => correctionTypeLabel(type, t)

/** 历史记录的 result 是校对结果数组的 JSON；兼容对象包裹 { corrections } 的旧数据 */
const parseHistoryResult = (raw: string): any[] | null => {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.corrections)) return parsed.corrections
    return null
  } catch {
    return null
  }
}

const loadCorrections = async (row: any): Promise<any[]> => {
  if (detailCache.has(row.id)) return detailCache.get(row.id)!
  const result = await electronAPI.getHistoryById(row.id)
  const corrections = parseHistoryResult(result && result.result) || []
  detailCache.set(row.id, corrections)
  return corrections
}

// ---- 列表：搜索 + 分页 ----
const filteredHistory = computed(() => {
  const query = searchText.value.trim().toLowerCase()
  if (!query) return history.value
  return history.value.filter(
    row =>
      (row.filePath || '').toLowerCase().includes(query) ||
      (row.modelName || '').toLowerCase().includes(query)
  )
})

const pagedHistory = computed(() =>
  filteredHistory.value.slice((page.value - 1) * pageSize, page.value * pageSize)
)

watch(searchText, () => {
  page.value = 1
})

// ---- 详情 ----
// 类型统计按规范英文 key 分组：中文变体与英文 key 并入同一统计，
// 与 Proof/DocPreview 的分类口径一致
const detailStats = computed(() => {
  const counts = new Map<string, number>()
  detailCorrections.value.forEach(item => {
    const type = canonicalCorrectionType(item.type)
    counts.set(type, (counts.get(type) || 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
})

const filteredDetailCorrections = computed(() => {
  const query = detailSearch.value.trim().toLowerCase()
  return detailCorrections.value.filter(item => {
    if (detailTypeFilter.value && canonicalCorrectionType(item.type) !== detailTypeFilter.value) return false
    if (!query) return true
    return (
      (item.original || '').toLowerCase().includes(query) ||
      (item.suggested || '').toLowerCase().includes(query) ||
      (item.reason || '').toLowerCase().includes(query)
    )
  })
})

const pagedDetailCorrections = computed(() =>
  filteredDetailCorrections.value.slice(
    (detailPage.value - 1) * detailPageSize,
    detailPage.value * detailPageSize
  )
)

watch([detailSearch, detailTypeFilter], () => {
  detailPage.value = 1
})

const showDetail = async (row: any) => {
  try {
    const result = await electronAPI.getHistoryById(row.id)
    if (result && result.result) {
      detailRow.value = row
      detailCorrections.value = parseHistoryResult(result.result) || []
      detailRaw.value = JSON.stringify(JSON.parse(result.result), null, 2)
      detailSearch.value = ''
      detailTypeFilter.value = ''
      detailPage.value = 1
      detailVisible.value = true
    } else {
      ElMessage.error(t('history.detailNotFound'))
    }
  } catch (error) {
    console.error('获取详情失败:', error)
    ElMessage.error(t('history.getDetailFailed'))
  }
}

// ---- 从历史恢复结果到校对页面 ----
const restoreHistory = async (row: any) => {
  try {
    const corrections = await loadCorrections(row)
    if (corrections.length === 0) {
      ElMessage.warning(t('history.nothingToRestore'))
      return
    }
    fileStore.setFilePath(row.filePath)
    fileStore.setFileName(baseName(row.filePath) || row.filePath)
    fileStore.setCorrectResult(
      corrections.map((item, index) => ({
        ...item,
        id: item.id || `correction-${index}`
      }))
    )
    router.push('/proof')
    ElMessage.success(t('history.restored'))
  } catch (error) {
    console.error('恢复历史记录失败:', error)
    ElMessage.error(t('history.getDetailFailed'))
  }
}

// ---- 两次校对对比 ----
const statsOf = (list: any[]) => {
  const counts = new Map<string, number>()
  list.forEach(item => {
    const type = canonicalCorrectionType(item.type)
    counts.set(type, (counts.get(type) || 0) + 1)
  })
  return counts
}

const openCompare = async () => {
  if (!compareA.value || !compareB.value) {
    ElMessage.warning(t('history.compareNeedBoth'))
    return
  }
  if (compareA.value.id === compareB.value.id) {
    ElMessage.warning(t('history.compareSameRecord'))
    return
  }
  compareLoading.value = true
  try {
    const [listA, listB] = await Promise.all([loadCorrections(compareA.value), loadCorrections(compareB.value)])
    const keyOf = (item: any) => `${(item.original || '').trim()}\u0000${(item.suggested || '').trim()}`
    const keysA = new Set(listA.map(keyOf))
    const keysB = new Set(listB.map(keyOf))
    compareData.value = {
      rowA: compareA.value,
      rowB: compareB.value,
      statsA: statsOf(listA),
      statsB: statsOf(listB),
      common: listA.filter(item => keysB.has(keyOf(item))),
      onlyA: listA.filter(item => !keysB.has(keyOf(item))),
      onlyB: listB.filter(item => !keysA.has(keyOf(item)))
    }
    compareVisible.value = true
  } catch (error) {
    console.error('对比历史记录失败:', error)
    ElMessage.error(t('history.getDetailFailed'))
  } finally {
    compareLoading.value = false
  }
}

const compareStatsRows = computed(() => {
  if (!compareData.value) return []
  const types = new Set<string>([...compareData.value.statsA.keys(), ...compareData.value.statsB.keys()])
  return Array.from(types)
    .map(type => ({
      type,
      countA: compareData.value.statsA.get(type) || 0,
      countB: compareData.value.statsB.get(type) || 0
    }))
    .sort((a, b) => b.countA + b.countB - (a.countA + a.countB))
})

// ---- 删除 ----
const deleteAllHistory = async () => {
  ElMessageBox.confirm(t('history.deleteAllConfirm'), t('history.deleteAllWarning'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning'
  })
    .then(async () => {
      try {
        const result = await electronAPI.deleteAllHistory()
        if (result) {
          ElMessage.success(t('history.deletedAll'))
          detailCache.clear()
          await loadHistory()
        } else {
          ElMessage.error(t('history.deleteFailed'))
        }
      } catch (error) {
        console.error('删除所有历史记录失败:', error)
        ElMessage.error(t('history.deleteFailed'))
      }
    })
    .catch(() => {})
}

const deleteHistory = async (id: number) => {
  try {
    const result = await electronAPI.deleteHistoryById(id)
    if (result) {
      ElMessage.success(t('history.deleteSuccess'))
      detailCache.delete(id)
      await loadHistory()
    } else {
      ElMessage.error(t('history.deleteFailed'))
    }
  } catch (error) {
    console.error('删除历史记录失败:', error)
    ElMessage.error(t('history.deleteFailed'))
  }
}

const loadHistory = async () => {
  try {
    const result = await electronAPI.getAllHistory()
    history.value = result
    if (page.value > 1 && filteredHistory.value.length <= (page.value - 1) * pageSize) {
      page.value = 1
    }
  } catch (error) {
    console.error('获取历史记录失败:', error)
    ElMessage.error(t('history.getHistoryFailed'))
  }
}

onMounted(() => {
  loadHistory()
})
</script>

<style scoped>
.table-container {
  padding: 16px 20px;
  height: 100%;
  overflow-y: auto;
  background: #ffffff;
}

.history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.search-input {
  width: 280px;
}

.compare-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.compare-select {
  width: 240px;
}

.compare-vs {
  font-size: 12px;
  font-weight: 700;
  color: #8a929e;
}

.table {
  border: none;
  border-radius: 0;
  width: 100%;
}

.table :deep(.el-table__header th) {
  background-color: #f4f6f9;
  color: #4a6580;
  font-weight: 600;
  border-bottom: none;
}

.table :deep(.el-table__row td) {
  border-bottom: 1px solid #edf0f4;
}

.table :deep(.el-table__row:hover > td) {
  background-color: #f8fafb;
}

.table :deep(.el-table__inner-wrapper::before) {
  display: none;
}

.footer-actions {
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.file-name-cell {
  font-weight: 600;
  color: #4a6580;
}

/* 操作列收窄：压缩按钮内边距与间距，把宽度让给信息列 */
.table :deep(.ops-col .cell) {
  padding: 0 6px;
}

.table :deep(.ops-col .el-button) {
  padding: 0 2px;
}

.table :deep(.ops-col .el-button + .el-button) {
  margin-left: 4px;
}

.btn-danger {
  color: #ffffff;
  border-color: #c28a8a;
  background-color: #c28a8a;
}

.btn-danger:hover {
  color: #ffffff;
  border-color: #b07575;
  background-color: #b07575;
}

.btn-danger.is-disabled {
  opacity: 0.5;
}

/* ---- 详情弹窗 ---- */
.detail-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #8a929e;
  margin-bottom: 12px;
}

.detail-meta-item {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.detail-stats-label {
  font-size: 12px;
  font-weight: 600;
  color: #4a6580;
}

/* 类型徽标配色已收敛到 common.css（批次 9），统计 chip 同样引用全局 type-* 色板 */
.stat-chip {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
  user-select: none;
}

.stat-chip:hover {
  border-color: #b0b8c4;
}

.stat-chip.active {
  border-color: var(--brand);
  color: #2f4a63;
  font-weight: 600;
}

.stat-chip-total {
  background: #e8f1f8;
}

.detail-search {
  width: 280px;
  margin-bottom: 10px;
}

.correction-list {
  max-height: 380px;
  overflow-y: auto;
  border: 1px solid #edf0f4;
  border-radius: 8px;
  padding: 4px 0;
}

.correction-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px dashed #edf0f4;
}

.correction-row:last-child {
  border-bottom: none;
}

/* 类型徽标配色已收敛到 common.css（批次 9）；归一后的英文 key 必然命中色板，
   基类不再设兜底背景/文字色以免 scoped 特异性压过全局色板 */
.correction-row-type {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.correction-row-body {
  flex: 1;
  min-width: 0;
}

.correction-row-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.text-original {
  color: #a87070;
}

.text-suggested {
  color: #5a9070;
  font-weight: 500;
}

.arrow-icon {
  font-size: 12px;
  color: #b0b8c4;
  flex-shrink: 0;
  align-self: center;
}

.correction-row-reason {
  font-size: 12px;
  color: #9aa4b1;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-corrections {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: #9aa4b1;
}

.detail-pagination {
  margin-top: 10px;
  justify-content: center;
}

.raw-json-collapse {
  margin-top: 10px;
  border: none;
}

.detail-pre {
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 12px;
  line-height: 1.7;
  color: #5a6a7a;
  background: #f4f6f9;
  padding: 12px;
  border-radius: 6px;
  margin: 0;
}

/* ---- 对比弹窗 ---- */
.compare-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.compare-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #5a6a7a;
}

.compare-tag {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.compare-tag.tag-b {
  background: #8ab89e;
}

.compare-stats {
  margin-bottom: 12px;
}

.compare-stats-table {
  margin-top: 6px;
  border: 1px solid #edf0f4;
  border-radius: 8px;
  overflow: hidden;
  max-width: 420px;
}

.compare-stats-head,
.compare-stats-row {
  display: grid;
  grid-template-columns: 1fr 72px 72px;
  font-size: 12px;
}

.compare-stats-head {
  background: #f4f6f9;
  color: #4a6580;
  font-weight: 600;
}

.compare-stats-head span,
.compare-stats-row span {
  padding: 6px 12px;
}

.compare-stats-row {
  border-top: 1px solid #edf0f4;
  color: #5a6a7a;
}

.compare-stats-row span:not(:first-child) {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.compare-stats-row span.zero {
  color: #c0c4cc;
}

.compare-sections {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.compare-section {
  border: 1px solid #edf0f4;
  border-radius: 8px;
  padding: 8px 0 4px;
  max-height: 300px;
  overflow-y: auto;
}

.compare-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #4a6580;
  padding: 0 12px 6px;
  position: sticky;
  top: 0;
  background: #ffffff;
}

.compare-more {
  padding: 4px 12px;
  font-size: 12px;
  color: #9aa4b1;
  text-align: center;
}

.morandi-dialog :deep(.el-dialog) {
  border-radius: 10px;
  border: none;
  box-shadow: 0 4px 24px rgba(75, 100, 130, 0.12);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
}

/* ---- 暗色模式 ---- */
html.dark .history-toolbar .compare-vs {
  color: #8890a0;
}

html.dark .file-name-cell {
  color: #c0c8d0;
}

html.dark .detail-meta,
html.dark .correction-row-reason,
html.dark .compare-more {
  color: #8890a0;
}

html.dark .detail-stats-label,
html.dark .compare-section-title {
  color: #c0c8d0;
  background: transparent;
}

html.dark .stat-chip {
  background: #252627;
  color: #a0a8b4;
}

html.dark .stat-chip.active {
  border-color: var(--brand);
  color: #8ec5ff;
}

html.dark .stat-chip-total {
  background: #1a2740;
  color: #8ec5ff;
}

html.dark .correction-list,
html.dark .compare-stats-table,
html.dark .compare-section {
  border-color: #2c2e30;
}

html.dark .correction-row {
  border-bottom-color: #2c2e30;
}

html.dark .correction-row-type {
  background: #252627;
  color: #a0a8b4;
}

html.dark .text-original {
  color: #d08888;
}

html.dark .text-suggested {
  color: #7fc79b;
}

html.dark .arrow-icon {
  color: #6a7078;
}

html.dark .compare-stats-head {
  background: #252627;
  color: #c0c4cc;
}

html.dark .compare-stats-row {
  border-top-color: #2c2e30;
  color: #a0a8b4;
}

html.dark .compare-stats-row span.zero {
  color: #4c4d4f;
}

html.dark .compare-tag {
  background: #5b7c99;
}

html.dark .compare-tag.tag-b {
  background: #5a9070;
}

html.dark .detail-pre {
  color: #c0c4cc;
  background: #1a1a1a;
}

html.dark .no-corrections {
  color: #8890a0;
}
</style>

<style>
/* 非 scoped 块不能用 :deep()（浏览器整条丢弃规则），子元素直接写类名 */
html.dark .table-container {
  background-color: var(--bg-page);
}

html.dark .table .el-table__header th {
  background-color: var(--bg-elevated);
  color: var(--text-2);
}

html.dark .table .el-table__row td {
  border-bottom-color: var(--border-color);
}

html.dark .table .el-table__row:hover > td {
  background-color: #252525;
}

html.dark .morandi-dialog .el-dialog {
  background-color: var(--bg-panel);
}
</style>
