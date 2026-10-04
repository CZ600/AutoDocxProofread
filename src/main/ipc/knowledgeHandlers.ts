/**
 * knowledge 域：知识库（向量表）管理与文档入库/检索
 */
import { ipcMain, dialog } from 'electron'
import { env } from 'process'
import {
  deleteRepository,
  insertDocument,
  queryDocuments,
  updateDocument,
  deleteDocument,
  listRepositories,
  createRepository,
  deleteDocumentByName,
  listFilenamesInRepository
} from '../lancedb'
import { processDocument, getPDFDocumentChunks } from '../pdfUtils'

export const registerKnowledgeHandlers = () => {
  //----------------------------------------The implementation of this RAG----------------------------------------
  // 向量数据库 - 插入文档
  ipcMain.handle('lancedb:insert', async (event, { repositoryName, fileName, text, id, metadata }, modelConfig) => {
    return insertDocument(
      repositoryName,
      text,
      fileName,
      metadata,
      modelConfig.modelName,
      modelConfig.apiKey,
      modelConfig.apiURL
    )
  })

  // 向量数据库 - 查询文档
  ipcMain.handle('lancedb:query', async (event, { queryText, limit, filter, fileName }, modelConfig) => {
    return queryDocuments(
      queryText,
      modelConfig.modelName,
      modelConfig.apiKey,
      modelConfig.apiURL,
      limit,
      filter,
      fileName
    )
  })

  // 向量数据库 - 更新文档
  ipcMain.handle('lancedb:update', async (event, { repositoryName, id, text, metadata }, modelConfig) => {
    return updateDocument(
      repositoryName,
      id,
      text,
      metadata,
      modelConfig.modelName,
      modelConfig.apiKey,
      modelConfig.apiURL
    )
  })

  // 向量数据库 - 删除文档
  ipcMain.handle('lancedb:delete', async (event, { repositoryName, id }) => {
    return deleteDocument(repositoryName, id)
  })
  // get all the tables(lancedb)
  // 向量数据库 - 查询所有的表
  ipcMain.handle('listRepositories', async event => {
    const result = await listRepositories()
    return result
  })
  // 向量数据库 - 创建一个空的知识表
  ipcMain.handle('createRepository', async (event, { repositoryName, modelName, apiKey, apiURL }) => {
    try {
      await createRepository(repositoryName, modelName, apiKey, apiURL)
      return true
    } catch (error) {
      console.log('error when create a empty repository:', error)
      throw error
    }
  })
  // 向量数据库 - 删除整个表（单个知识库）
  ipcMain.handle('deleteRepository', async (event, repositoryName: string) => {
    try {
      // deleteRepository 是异步函数，必须 await：否则其内部异常不会进本 catch，
      // 前端会收到 resolve(true)，删除失败也提示"删除成功"
      await deleteRepository(repositoryName)
      return true
    } catch (error) {
      console.log('failed to delete ${repositoryName} because:', error)
      throw error
    }
  })

  // IPC处理器 - 处理PDF文件(弃用)
  ipcMain.handle('pdf:process', async (event, { repositoryName, filePath }, modelConfig) => {
    try {
      return await processDocument(
        repositoryName,
        filePath,
        undefined, // 自动生成documentId
        500, // 默认chunk大小
        50, // 默认重叠大小
        modelConfig.modelName,
        modelConfig.apiKey,
        modelConfig.apiURL
      )
    } catch (error) {
      console.error('Failed to process PDF:', error)
      throw error
    }
  })

  // IPC处理器 - 选择并处理文档文件
  ipcMain.handle('pdf:select-and-process', async (event, repositoryName, modelConfig) => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Document Files', extensions: ['pdf', 'docx', 'txt'] }]
    })

    if (!filePaths || filePaths.length === 0) {
      console.log('User selected nothing!')
      return false
    }

    try {
      return await processDocument(
        repositoryName,
        filePaths[0],
        '', // 自动生成documentId
        500,
        50,
        modelConfig.modelName,
        modelConfig.apiKey,
        modelConfig.apiURL
      )
    } catch (error) {
      console.error('Document processing failed:', error)
      throw error
    }
  })

  // IPC处理器 - 获取PDF文档的所有段落
  ipcMain.handle('pdf:get-chunks', async (event, { documentId, repositoryName }) => {
    return getPDFDocumentChunks(repositoryName, documentId)
  })
  // 根据指定的文件名称，删除该名称下的所有文档块
  ipcMain.handle('deleteDocumentByName', async (event, repositoryName, filename) => {
    const deleteFileName = await deleteDocumentByName(repositoryName, filename)
    if (deleteFileName) {
      return deleteFileName
    } else {
      // 原写法 throw error(...) 引用未定义的小写 error，会抛 ReferenceError
      throw new Error(`delete the file ${filename} in ${repositoryName} error`)
    }
  })
  // 获取不重复的文件列表
  ipcMain.handle('listFilenamesInRepository', async (event, repositoryName) => {
    const fileList = await listFilenamesInRepository(repositoryName)
    return fileList
  })
  // 设置embedding模型 - 通过其他机制由前端Pinia store管理，不再需要此IPC处理
  // ipcMain.handle('setEmbeddingAPI', ...) 已移除

  // 获取embedding模型信息 - 通过其他机制由前端Pinia store管理，不再需要此IPC处理
  // ipcMain.handle('getEmbeddingAPI', ...) 已移除

  // 调试用接口
  ipcMain.handle('getEnvPath', async event => {
    console.log(' env.LANCEDB_NATIVE_PATH:', env.LANCEDB_NATIVE_PATH)
    return env.LANCEDB_NATIVE_PATH
  })
}
