import { app } from 'electron' // 新增导入
import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'
import path from 'path' // 新增导入
import fs from 'fs'
import { promises } from 'dns'
import { b } from 'vite/dist/node/types.d-aGj9QkWt'
import { getEmbedding } from './chat'
import { ModelProvider } from '../shared/modelProviders'
import { encryptApiKey, decryptApiKey } from './apiKeyCrypto'

// 定义数据类型（TypeScript 类型安全）
export interface User {
  id?: number
  name: string
  email: string
  created_at?: string
}

export interface apiSettings {
  id?: number
  apiURL: string
  apiKey: string
  modelName: string
  provider: ModelProvider
  created_at?: string
}

export interface proofHistory {
  id?: number
  filePath: string
  apiURL: string
  modelName: string
  created_at?: string
  result: string
}

// 该类实现了对api数据和历史记录的数据库的管理操作
export class DB {
  private static instance: Database
  // 使用系统标准路径
  private static get DB_PATH(): string {
    // 获取系统标准用户数据目录
    const userDataPath = app.getPath('userData')
    // 创建 data 子目录（避免污染根目录）
    return path.join(userDataPath, 'data', 'app.db')
  }
  static async getInstance(): Promise<Database> {
    if (!DB.instance) {
      // 确保目录存在（自动创建）
      const dir = path.dirname(DB.DB_PATH)
      await fs.promises.mkdir(dir, { recursive: true })

      DB.instance = await open({
        filename: DB.DB_PATH,
        driver: sqlite3.Database
      })

      // 初始化表结构
      // 创建存储API设置的表
      await DB.instance.exec(`
        CREATE TABLE IF NOT EXISTS api_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          apiURL TEXT NOT NULL,
          apiKey TEXT NOT NULL,
          modelName TEXT NOT NULL,
          provider TEXT DEFAULT 'openai_compatible',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // 为现有表添加provider列（如果不存在）
      try {
        await DB.instance.exec(`ALTER TABLE api_settings ADD COLUMN provider TEXT DEFAULT 'openai_compatible'`)
      } catch (error) {
        // 忽略列已存在的错误
      }
      // 创建存储校对历史的表
      await DB.instance.exec(
        `
        CREATE TABLE IF NOT EXISTS proof_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filePath TEXT NOT NULL,
          apiURL TEXT NOT NULL,
          modelName TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          result TEXT NOT NULL
        )
        `
      )
      // 创建存储审核模型设置的表（兼容旧版本，不再使用）
      await DB.instance.exec(`
        CREATE TABLE IF NOT EXISTS review_model_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          apiId INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
    }
    return DB.instance
  }

  // 查询记录的条目数量
  static async getAPISettingsCount(): Promise<number> {
    const db = await DB.getInstance()
    const result = await db.get(`SELECT COUNT(*) as count FROM api_settings`)
    return result.count
  }

  static async getHistoryCount(): Promise<number> {
    const db = await DB.getInstance()
    const result = await db.get(`SELECT COUNT(*) as count FROM proof_history`)
    return result.count
  }
  /**
   * 插入一条 API 设置记录
   * @param setting apiSettings 对象（不含 id）
   * @returns 新记录的 id
   */
  static async insertAPISetting(
    apiURL: string,
    apiKey: string,
    modelName: string,
    provider: ModelProvider = ModelProvider.OPENAI_COMPATIBLE
  ): Promise<number> {
    const db = await DB.getInstance()
    try {
      const result = await db.run(
        `INSERT INTO api_settings (apiURL, apiKey, modelName, provider) VALUES (?, ?, ?, ?)`,
        apiURL,
        encryptApiKey(apiKey),
        modelName,
        provider
      )
      return result.lastID
    } catch (error) {
      console.error('插入 API 设置失败:', error)
      throw error // 或根据需求返回 -1 / null
    }
  }

  static async updateAPISettingById(
    id: number,
    apiURL: string,
    apiKey: string,
    modelName: string,
    provider?: ModelProvider
  ): Promise<boolean> {
    const db = await DB.getInstance()
    try {
      let query = `UPDATE api_settings SET apiURL = ?, apiKey = ?, modelName = ?`
      const params: any[] = [apiURL, encryptApiKey(apiKey), modelName]

      if (provider !== undefined && provider !== null) {
        query += `, provider = ?`
        params.push(provider)
      }

      query += ` WHERE id = ?`
      params.push(id)

      const result = await db.run(query, ...params)
      return result.changes > 0
    } catch (error) {
      console.error('更新 API 设置失败:', error)
      throw error
    }
  }

  static async insertOneHistory(filePath: string, apiURL: string, modelName: string, result: string): Promise<number> {
    const db = await DB.getInstance()
    if (!filePath || !apiURL || !modelName || !result) {
      const errorMsg = '插入历史记录参数不完整: ' + JSON.stringify({ filePath, apiURL, modelName, result: !!result })
      console.error(errorMsg)
      throw new Error(errorMsg)
    }

    // 验证JSON格式
    try {
      JSON.parse(result)
    } catch (parseError) {
      const errorMsg = 'result参数不是有效的JSON: ' + parseError.message
      console.error(errorMsg)
      throw new Error(errorMsg)
    }

    try {
      const res = await db.run(
        `INSERT INTO proof_history (filePath, apiURL, modelName, result) VALUES (?, ?, ?, ?)`,
        filePath,
        apiURL,
        modelName,
        result
      )
      return res.lastID
    } catch (error) {
      console.error('插入校对记录失败:', error)
      throw error
    }
  }

  // 根据id查询api记录（apiKey 解密后返回，兼容旧明文记录）
  static async getAPISettingById(id: number): Promise<apiSettings | null> {
    const db = await DB.getInstance()
    const result = await db.get(`SELECT * FROM api_settings WHERE id = ?`, id)
    return result ? { ...result, apiKey: decryptApiKey(result.apiKey) } : null
  }

  static async getHistoryById(id: number): Promise<proofHistory | null> {
    const db = await DB.getInstance()
    const result = await db.get(`SELECT * FROM proof_history WHERE id = ?`, id)
    return result || null
  }

  // 删除指定的数据集
  static async deleteAPISettingById(id: number): Promise<boolean> {
    const db = await DB.getInstance()
    const result = await db.run(`DELETE FROM api_settings WHERE id = ?`, id)
    return result.changes > 0 // 如果有行被删除，返回 true，否则返回 false
  }

  static async deleteHistoryById(id: number): Promise<boolean> {
    const db = await DB.getInstance()
    const result = await db.run(`DELETE FROM proof_history WHERE id = ?`, id)
    return result.changes > 0 // 如果有行被删除，返回 true，否则返回 false
  }

  // 删除所有数据集
  static async deleteALLSettings(): Promise<boolean> {
    const db = await DB.getInstance()
    await db.run(`DELETE FROM api_settings`)
    const result = await db.run(`SELECT * FROM api_settings`)
    const count = await DB.getAPISettingsCount()
    if (result.changes === count) {
      return true
    } else {
      return false
    }
  }

  static async deleteALLHistory(): Promise<boolean> {
    const db = await DB.getInstance()
    await db.run(`DELETE FROM proof_history`)
    const count = await DB.getHistoryCount()
    if (count === 0) {
      return true
    } else {
      return false
    }
  }

  /**
   * 查询所有 API 设置记录
   * @returns apiSettings 数组
   */
  static async getAllAPISettings(): Promise<apiSettings[]> {
    // 返回apiSettings 数组（apiKey 解密后返回，兼容旧明文记录）
    const db = await DB.getInstance()
    const rows = await db.all<apiSettings[]>(
      `SELECT id, apiURL, apiKey, modelName, provider, created_at FROM api_settings ORDER BY created_at DESC`
    )
    return rows.map(row => ({ ...row, apiKey: decryptApiKey(row.apiKey) }))
  }

  static async getALLHistory(): Promise<proofHistory[]> {
    // 获取所有校对记录
    const db = await DB.getInstance()
    const rows = await db.all<proofHistory[]>(
      `SELECT id, filePath, apiURL, modelName, created_at, result FROM proof_history ORDER BY created_at DESC`
    )
    return rows
  }

  static async getAPISettings(): Promise<apiSettings | null> {
    const db = await DB.getInstance()
    const row = await db.get<apiSettings>(`SELECT * FROM api_settings ORDER BY created_at DESC LIMIT 1`)
    return row ? { ...row, apiKey: decryptApiKey(row.apiKey) } : null
  }
}
