/**
 * dialog 域：文件选择与内容读取（docx / txt / md）
 */
import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import * as mammoth from 'mammoth'

export const registerDialogHandlers = () => {
  // 处理文件选择请求
  ipcMain.handle('select-docx-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择 DOCX 文件',
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      // 返回文件路径
      return result.filePaths[0]
    } catch (error) {
      console.error('文件选择错误:', error)
      throw error
    }
  })

  // 处理文件读取请求（可选，如果需要主进程读取文件内容）
  ipcMain.handle('read-docx-file', async (event, filePath) => {
    try {
      const data = await fs.promises.readFile(filePath)
      // 结构化克隆直传字节数组：避免 base64 编码带来的 +33% 体积
      // 与渲染层逐字节解码开销（20MB 级文档提升明显）
      return {
        path: filePath,
        buffer: data
      }
    } catch (error) {
      console.error('cannot read file:', error)
      throw error
    }
  })

  // 从 .docx 文件中提取纯文本（主进程执行 mammoth）
  ipcMain.handle('extract-docx-text', async (event, filePath) => {
    try {
      const data = await fs.promises.readFile(filePath)
      const result = await mammoth.extractRawText({ buffer: data })
      return { success: true, text: result.value || '' }
    } catch (error: any) {
      console.error('extract-docx-text failed:', error)
      return { success: false, error: error.message || String(error) }
    }
  })

  // 读取文本文件内容（txt/md）
  ipcMain.handle('read-text-file', async (event, filePath: string) => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error: any) {
      console.error('读取文本文件失败:', error)
      return { success: false, error: error.message || '读取文件失败' }
    }
  })

  // 选择文本/文档文件（txt/md/docx）
  ipcMain.handle('select-format-desc-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择格式描述文件',
        filters: [{ name: '支持的文件', extensions: ['txt', 'md', 'docx'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    } catch (error) {
      console.error('文件选择错误:', error)
      throw error
    }
  })
}
