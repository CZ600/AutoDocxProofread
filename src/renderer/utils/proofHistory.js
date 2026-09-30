/**
 * 校对历史入库（批次 9 自 DocPreview.vue 迁出）：
 * 校对完成后把有效结果写入历史库，失败只提示不阻断校对流程。
 */

import { ElMessage } from 'element-plus'

export const pushProofreadHistory = async (filePath, resultCorrect, t) => {
  const electronAPI = window.electronAPI
  try {
    const modelInfo = await electronAPI.getAPISettings()
    const URL = modelInfo.URL
    const modelName = modelInfo.modelName

    if (!filePath) {
      console.warn('文件路径为空，无法保存历史记录')
      return
    }
    if (!URL || !modelName) {
      console.error('API设置不完整，无法保存历史记录')
      return
    }
    if (!resultCorrect || (Array.isArray(resultCorrect) && resultCorrect.length === 0)) {
      console.warn('校对结果为空，无需保存历史记录')
      return
    }

    try {
      const result = await electronAPI.insertOneHistory(filePath, URL, modelName, JSON.stringify(resultCorrect))
      if (result && result.success === false) {
        console.error('保存历史记录失败:', result.error)
        ElMessage({
          message: t('proof.messages.historySaveFailed') + (result.error || ''),
          type: 'error',
          duration: 3000
        })
        return
      }
      console.log('历史记录保存成功:', result)
      ElMessage({
        message: t('proof.messages.historySaveSuccess'),
        type: 'success',
        duration: 1500
      })
    } catch (ipcError) {
      console.error('IPC调用失败:', ipcError)
      ElMessage({
        message: t('proof.messages.historyIpcFailed'),
        type: 'error',
        duration: 3000
      })
    }
  } catch (error) {
    console.error('保存历史记录时发生未预期错误:', error)
    ElMessage({
      message: t('proof.messages.historyUnexpectedError') + error.message,
      type: 'error',
      duration: 3000
    })
  }
}
