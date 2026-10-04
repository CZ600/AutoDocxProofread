/**
 * format 域：格式克隆（档案提取/克隆/导出）、格式描述转换、SmartFormatAgent
 */
import { ipcMain, dialog } from 'electron'
import * as path from 'path'
import os from 'os'
import fs from 'fs'
import { cloneFormat, extractFormatProfile, cloneFormatWithProfile, cloneFormatWithProfileForce } from '../formatClone'
import { formatDescriptionToProfile } from '../formatFromDesc'
import { SmartFormatAgent } from '../smartFormatAgent'
import { ParagraphType } from '../smartFormatApply'
import { ModelProvider, getProviderBaseURL } from '../../shared/modelProviders'
import { api_info } from './apiState'

// SmartFormatAgent: format analyze（实例内承载分析/应用配置，注册期创建一次）
const formatAgent = new SmartFormatAgent()

export const registerFormatHandlers = () => {
  // 格式克隆 - 提取参考文档的样式档案
  ipcMain.handle('get-format-profile', async (event, filePath: string) => {
    try {
      const profile = await extractFormatProfile(filePath)
      return JSON.parse(JSON.stringify(profile))
    } catch (error) {
      console.error('提取样式档案失败:', error)
      throw error
    }
  })

  // 格式克隆 - 执行克隆（保存到临时文件用于预览）
  ipcMain.handle('clone-format', async (event, sourcePath: string, targetPath: string) => {
    try {
      const tmpDir = os.tmpdir()
      const tmpName = `format_clone_${Date.now()}.docx`
      const tmpPath = path.join(tmpDir, tmpName)
      await cloneFormat(sourcePath, targetPath, tmpPath)
      return { success: true, filePath: tmpPath }
    } catch (error) {
      console.error('格式克隆失败:', error)
      throw error
    }
  })

  // 格式克隆 - 导出（带保存对话框）
  // 格式克隆 - 使用自定义样式档案克隆
  ipcMain.handle('clone-format-with-profile', async (event, profile: any, targetPath: string) => {
    try {
      const tmpDir = os.tmpdir()
      const tmpName = `format_clone_${Date.now()}.docx`
      const tmpPath = path.join(tmpDir, tmpName)
      await cloneFormatWithProfile(profile, targetPath, tmpPath)
      return { success: true, filePath: tmpPath }
    } catch (error) {
      console.error('格式克隆失败:', error)
      throw error
    }
  })

  // 格式克隆 - 强制覆盖行内格式（使用自定义样式档案克隆，并强制应用到段落直接格式）
  ipcMain.handle('clone-format-with-profile-force', async (event, profile: any, targetPath: string) => {
    try {
      const tmpDir = os.tmpdir()
      const tmpName = `format_clone_force_${Date.now()}.docx`
      const tmpPath = path.join(tmpDir, tmpName)
      const result = await cloneFormatWithProfileForce(profile, targetPath, tmpPath)
      return { success: true, filePath: tmpPath, appliedParagraphs: result.appliedParagraphs, matchedStyles: result.matchedStyles }
    } catch (error) {
      console.error('强制格式克隆失败:', error)
      throw error
    }
  })

  ipcMain.handle('export-format-cloned', async (event, clonedFilePath: string, originalTargetPath: string) => {
    try {
      const parsedPath = path.parse(originalTargetPath)
      const defaultSavePath = path.join(parsedPath.dir, `${parsedPath.name}_formatted.docx`)

      const saveResult = await dialog.showSaveDialog({
        title: '保存格式克隆后的文档',
        defaultPath: defaultSavePath,
        filters: [{ name: 'Word 文档', extensions: ['docx'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true }
      }

      // 同步 copyFileSync 会阻塞主进程，大文件导出期间卡住所有 IPC；改异步
      await fs.promises.copyFile(clonedFilePath, saveResult.filePath)
      return { success: true, canceled: false, filePath: saveResult.filePath }
    } catch (error) {
      console.error('导出格式克隆文档失败:', error)
      throw error
    }
  })

  // 从格式描述生成格式参数（调用大模型）
  ipcMain.handle('format-from-description', async (event, description: string, apiConfig?: any, targetFilePath?: string) => {
    try {
      // 优先使用前端传入的 apiConfig，兜底用全局 api_info
      const apiKey = apiConfig?.apiKey || api_info.apiKey
      const modelName = apiConfig?.modelName || api_info.modelName
      const provider = apiConfig?.provider || api_info.provider || ModelProvider.OPENAI_COMPATIBLE
      const apiURL = apiConfig?.apiURL || api_info.apiURL || getProviderBaseURL(provider) || ''

      console.log('[format-from-desc] using apiKey:', !!apiKey, 'modelName:', modelName, 'provider:', provider, 'apiURL:', apiURL)

      if (!apiKey || !modelName) {
        return { success: false, error: '请先选择 API 设置' }
      }
      if (!description || !description.trim()) {
        return { success: false, error: '请输入格式描述' }
      }

      // 提取目标文档的样式名列表，供 LLM 生成可匹配的 name
      let targetStyleEntries: { name: string; type: string }[] | undefined
      if (targetFilePath) {
        try {
          const { loadDocx } = require('docx-edit')
          const targetDoc = await loadDocx(targetFilePath)
          const dstProfile = targetDoc.getStyleProfile()
          targetStyleEntries = Object.values(dstProfile.styles || {}).map((s: any) => ({
            name: s.name,
            type: s.type
          })).filter((e: any) => e.name)
          console.log('[format-from-desc] target style entries:', JSON.stringify(targetStyleEntries))
        } catch (e) {
          console.warn('[format-from-desc] failed to read target doc styles:', e)
        }
      }

      const { profile, tokenUsage } = await formatDescriptionToProfile(
        description,
        apiKey,
        modelName,
        apiURL,
        provider,
        targetStyleEntries
      )
      return { success: true, profile: JSON.parse(JSON.stringify(profile)), tokenUsage }
    } catch (error: any) {
      console.error('格式描述转换失败:', error)
      return { success: false, error: error.message || '格式描述转换失败' }
    }
  })

  ipcMain.handle('smart-format-analyze', async (event, params: {
    description?: string
    refFilePath?: string
    targetFilePath: string
    apiConfig: any
  }) => {
    try {
      const result = await formatAgent.analyze({
        description: params.description,
        refFilePath: params.refFilePath,
        targetFilePath: params.targetFilePath,
        apiConfig: params.apiConfig
      })
      // Convert Map to JSON-serializable array for IPC
      const classificationArray = Array.from(result.classification.entries())
      return {
        success: true,
        spec: result.spec,
        classification: classificationArray,
        tokenUsage: result.tokenUsage,
        fallbackMode: result.fallbackMode
      }
    } catch (error: any) {
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('smart-format-apply', async (event, params: {
    inputPath: string
    outputPath: string
    spec: any
    classification: Array<[number, string]>
  }) => {
    try {
      const classificationMap = new Map(params.classification) as Map<number, ParagraphType>
      const result = await formatAgent.apply(
        params.inputPath,
        params.outputPath,
        params.spec,
        classificationMap
      )
      return { ...result }
    } catch (error: any) {
      return { success: false, error: error.message || String(error) }
    }
  })
}
