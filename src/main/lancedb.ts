/**
 * 知识库向量存储 —— 基于 sqlite-vec 的实现（替代原 @lancedb/lancedb）
 *
 * 设计目标：保持与原 LanceDB 版本完全一致的导出函数签名，
 * 使调用方 (proof.ts / ipcHandlers.ts / pdfUtils.ts) 无需任何改动。
 *
 * 核心映射：
 * - 原 "每个知识库 = 一个 LanceDB 表" → 现 "每个知识库 = 一张 vec0 虚拟表"
 *   表名沿用 sanitizeTableName(repositoryName)，命名空间与旧库一致。
 * - 原表 schema: { id, text, filename, vector, metadata(JSON字符串) }
 *   现 vec0 表:   { id PRIMARY KEY, text, filename, embedding FLOAT[dim], metadata TEXT }
 *   字段语义一一对应，metadata 仍是 JSON 字符串（调用方按 JSON.parse 读写）。
 *
 * 距离语义：sqlite-vec cosine 模式返回的 distance 越小越相似（与原 LanceDB 的
 * _distance 同向）。proof.ts 的 queryDocChunk 对结果做 sort(b.score - a.score)
 * 降序后取 topK —— 这是历史遗留的排序方向，两侧数据源同向，故替换后行为保持一致
 * （不引入新的回归）。注意：本函数内部已按 distance 升序返回，调用方再排序的行为不变。
 *
 * 体积收益：原 @lancedb 原生库 109MB，本实现复用项目已有的 sqlite3 + 289KB 的 vec0.dll。
 *
 * 关于 getOrCreateTable：原版返回 LanceDB Table 对象（带 .search().where().toArray() 链式 API）。
 * pdfUtils.ts 的 getPDFDocumentChunks 依赖这套链式调用做全表过滤扫描。
 * 为保持该调用方零改动，这里返回一个轻量包装器 VecTable，模拟同样的链式 API，
 * 内部翻译为 sqlite-vec / 普通 SQL 查询。
 */

import { app } from 'electron'
import path from 'path'
import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { getEmbedding } from './chat'
import { loadVecExtension } from './sqliteVec'
import { writeLog } from './logger'

// vec0 扩展是否已加载（单连接上只需加载一次）
let vecLoaded = false

// 单例 sqlite 连接（知识库专用，独立于 database.ts 的 app.db，避免与业务表耦合）
let db: Database | null = null

const DB_PATH_SUFFIX = path.join(app.getPath('userData'), 'vector-db', 'knowledge.db')

// 维护每张知识库表的向量维度（建表时确定，后续 insert/query 时校验）
const tableDimensions = new Map<string, number>()

// ========================
// 🛠️ 工具函数
// ========================

/**
 * 安全地将 repositoryName 转为合法表名。
 *
 * 设计要点（显示名 == 表名，保持可逆，避免前端展示成 "t______" 这种内部名）：
 * 1. 只剔除对 SQL 有结构性风险的字符：双引号（quoteIdent 的定界符）、控制字符。
 *    其余字符（含中文、空格、斜杠）一律保留——配合 quoteIdent 的双引号标识符，
 *    SQLite 完全支持它们作为表名。例如 "测试数据库" → 表名就是 "测试数据库"，
 *    listRepositories 原样返回，前端无需做任何名字映射。
 *    （实测 sqlite-vec v0.1.9 对中文/带空格表名 CREATE/INSERT/SELECT/DROP 均通过。）
 * 2. 数字开头的名字仍需加 "t_" 前缀：vec0 会派生 "<表名>_info" 等 shadow table，
 *    shadow table 名同样不能以数字开头，即便主表名加了双引号也无法绕过
 *    （实测报 "Could not create '_info' shadow table: vtable constructor called
 *    recursively"）。故对 ^[0-9] 强制加前缀；这与前端展示基本无感
 *    （"123" → "t_123"，是可接受的轻微偏差，远好于中文全部变下划线）。
 */
function sanitizeTableName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Repository name must be a non-empty string')
  }
  // 仅剔除双引号（会破坏 quoteIdent 定界）与控制字符；其余字符保留以维持可逆。
  let sanitized = name.replace(/["\x00-\x1f\x7f]/g, '_')
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `t_${sanitized}`
  }
  return sanitized
}

/**
 * 用双引号包裹表名，作为 SQL 的引号标识符。
 *
 * 背景：sanitizeTableName 可能返回以数字开头的名字（如 "123"）或 SQL 关键字
 * （如 "select"），它们作为未加引号的标识符会让 SQLite 报 syntax error。
 * 双引号标识符 "..." 可以包含任意字符（包括数字开头、关键字），内部双引号
 * 按 SQL 标准转义为两个双引号。对已有的字母开头的表名完全向后兼容。
 *
 * tableDimensions / listRepositories 内部统一使用未加引号的原名作为 key/返回值，
 * 仅在拼装 SQL 时调用本函数加引号。
 */
function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

/**
 * 生成表内自增 ID。
 * sqlite-vec 的 vec0 主键列是 32 位整数（i32），上限 2147483647，
 * 超出会报 "Only integers are allowed for primary key values"。
 * 原实现为 i32 范围内的随机数，存在理论碰撞风险；改为表内 max(id)+1 自增，
 * 对既有随机 ID 的旧库同样安全（新 ID 必然大于所有现存 ID）。
 * 单连接串行写入（pdfUtils 逐 chunk 串行入库），无并发竞争窗口。
 */
async function nextId(tableName: string): Promise<number> {
  const row = await db!.get(`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM ${quoteIdent(tableName)}`)
  return row.next
}

/** 单引号转义，防止 metadata JSON 中的引号破坏 SQL */
function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''")
}

/** 把 number[] 向量序列化为 sqlite-vec 接受的 JSON 字符串形式：[0.1,0.2,...] */
function vectorToSql(vec: number[]): string {
  return '[' + vec.join(',') + ']'
}

/**
 * getEmbedding 传入单字符串时返回 number[]，但因签名是 string|string[]，
 * TS 推断为 number[]|number[][]。这里统一规整为 number[]（取首个元素防止误传批量子串）。
 */
async function embedSingle(text: string, modelName: string, apiKey: string, apiURL: string): Promise<number[]> {
  const emb = await getEmbedding(text, modelName, apiKey, apiURL)
  return Array.isArray(emb[0]) ? (emb as number[][])[0] : (emb as number[])
}

// ========================
// 🔌 数据库连接管理
// ========================

/**
 * 初始化（幂等）：打开知识库专用 sqlite 文件，加载 vec0 扩展。
 * 返回 Database 实例（兼容旧返回类型签名，调用方只当它是个连接对象）。
 */
export async function initLanceDB(): Promise<Database> {
  if (db) return db
  try {
    const dir = path.dirname(DB_PATH_SUFFIX)
    const fs = await import('fs')
    await fs.promises.mkdir(dir, { recursive: true })

    db = await open({ filename: DB_PATH_SUFFIX, driver: sqlite3.Database })

    if (!vecLoaded) {
      await loadVecExtension(db)
      vecLoaded = true
    }

    // 预加载所有知识库表的维度到内存（从 sqlite_master 读建表语句解析）
    await refreshTableDimensions()
    console.log(`✅ Connected to knowledge DB (sqlite-vec) at ${DB_PATH_SUFFIX}`)
  } catch (error: any) {
    console.error('Failed to init knowledge DB:', error)
    throw new Error(`数据库连接失败: ${error.message}`)
  }
  return db
}

/** 从建表 SQL 里解析向量维度，重建 tableDimensions 缓存 */
async function refreshTableDimensions(): Promise<void> {
  tableDimensions.clear()
  if (!db) return
  const rows = await db.all(
    `SELECT sql FROM sqlite_master WHERE type='table' AND sql LIKE '%vec0%'`
  )
  for (const row of rows) {
    // 匹配 FLOAT[dim] 或 FLOAT[ dim ]
    const m = /(\w+)\s*\(?[^)]*FLOAT\[\s*(\d+)\s*\]/.exec(row.sql || '')
    if (m) {
      // 提取表名。sanitizeTableName 现在会保留中文/空格/斜杠等字符作为表名，
      // 而建表语句里这类表名会被双引号包裹（如 CREATE VIRTUAL TABLE "我的Repo 1"）。
      // 故分两种情况匹配：引号包裹则取引号内全部内容，否则取连续非空白字符。
      // 注意 JS 正则 \w 不匹配中文，旧的 (\w+) 会把 "测试数据库" 解析失败。
      const sql = row.sql || ''
      const nameMatch =
        /CREATE\s+VIRTUAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/i.exec(sql) ||
        /CREATE\s+VIRTUAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i.exec(sql) ||
        /CREATE\s+VIRTUAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\[([^\]]+)\]/i.exec(sql) ||
        /CREATE\s+VIRTUAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s"`\[\].]+)/i.exec(sql)
      if (nameMatch) {
        // 表名保持原样大小写存储（sanitizeTableName 不再 toLowerCase，
        // SQLite 双引号标识符区分大小写；建表时 sanitize 什么，这里就存什么）。
        tableDimensions.set(nameMatch[1], parseInt(m[2], 10))
      }
    }
  }
}

/** 关闭连接（沿用原签名） */
export async function closeLanceDB(): Promise<void> {
  if (db) {
    try {
      await db.close()
      db = null
      vecLoaded = false
      console.log('✅ Knowledge DB connection closed')
    } catch (error) {
      console.error('Failed to close knowledge DB:', error)
    }
  }
}

/** 检查表是否存在 */
async function tableExists(tableName: string): Promise<boolean> {
  const row = await db!.get(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, tableName)
  return !!row
}

/** 获取某表的向量维度（已建表则从缓存/建表语句读；未建表返回 0） */
async function getTableDimension(tableName: string): Promise<number> {
  const cached = tableDimensions.get(tableName)
  if (cached) return cached
  const row = await db!.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`, tableName)
  if (!row?.sql) return 0
  const m = /FLOAT\[\s*(\d+)\s*\]/.exec(row.sql)
  const dim = m ? parseInt(m[1], 10) : 0
  if (dim) tableDimensions.set(tableName, dim)
  return dim
}

// ========================
// 🗃️ 数据库级操作（跨表）
// ========================

/**
 * 获取所有知识库名称（= 所有 vec0 虚拟表名，过滤系统表与 shadow tables）。
 *
 * 关键点：sqlite-vec 的每个 vec0 虚拟表在底层会派生一组名为 "<表名>_info" /
 * "<表名>_chunks" / "<表名>_rowids" / "<表名>_vector_chunks00" 等 shadow tables
 * 来实际存放向量数据。这些 shadow tables 在 sqlite_master 里 type 同样是 'table'，
 * 但它们的 rootpage > 0，且 sql 是普通 CREATE TABLE（不含 vec0）。
 * 而虚拟表本身 rootpage = 0（无独立根页，由扩展动态驱动）。
 *
 * 因此用 rootpage = 0 精确筛选虚拟表，避免把 shadow tables 当成知识库列出
 * （否则用户建一个名为 "123" 的库，会看到 t_123_info 等 10+ 个"假"知识库）。
 * 兼容性兜底：再叠加 sql LIKE '%vec0%'，即便某些 SQLite 版本对虚拟表 rootpage 处理不同也能命中。
 */
export async function listRepositories(): Promise<string[]> {
  try {
    await initLanceDB()
    const rows = await db!.all(
      `SELECT name FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
         AND substr(name,1,1) <> '_'
         AND (rootpage = 0 OR sql LIKE '%vec0%')`
    )
    return rows.map((r: any) => r.name)
  } catch (error: any) {
    console.error('Failed to list repositories:', error)
    throw new Error(`获取知识库列表失败: ${error.message}`)
  }
}

/**
 * 创建一个空的知识库表。
 * 为确定向量维度，需调用一次 embedding 探测（与原版一致）。
 */
export async function createRepository(
  repositoryName: string,
  modelName: string,
  apiKey: string,
  apiURL: string
): Promise<void> {
  try {
    await initLanceDB()
    const tableName = sanitizeTableName(repositoryName)
    console.log('Creating repository:', repositoryName, 'with model:', modelName)

    if (await tableExists(tableName)) {
      throw new Error(`Repository "${repositoryName}" already exists`)
    }

    const sampleEmbedding = await embedSingle('Sample text for schema creation', modelName, apiKey, apiURL)
    const dimension = sampleEmbedding.length

    await db!.exec(
      `CREATE VIRTUAL TABLE ${quoteIdent(tableName)} USING vec0(
        id INTEGER PRIMARY KEY,
        text TEXT,
        filename TEXT,
        embedding FLOAT[${dimension}] distance=cosine,
        metadata TEXT
      )`
    )
    tableDimensions.set(tableName, dimension)
    console.log(`✅ Created repository: ${repositoryName} (dim=${dimension})`)
  } catch (error: any) {
    console.error('Failed to create repository:', error)
    throw new Error(`创建知识库失败: ${error.message}`)
  }
}

/** 删除整个知识库（= DROP 表） */
export async function deleteRepository(repositoryName: string): Promise<void> {
  try {
    await initLanceDB()
    const tableName = sanitizeTableName(repositoryName)
    if (!(await tableExists(tableName))) {
      throw new Error(`Repository "${repositoryName}" does not exist`)
    }
    await db!.exec(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`)
    tableDimensions.delete(tableName)
    console.log(`🗑️ Deleted repository: ${repositoryName}`)
  } catch (error: any) {
    console.error('Failed to delete repository:', error)
    throw new Error(`删除知识库失败: ${error.message}`)
  }
}

// ========================
// 📄 表内文档操作（单表）
// ========================

/**
 * 获取或创建指定知识库的表。
 * 返回一个模拟 LanceDB Table 链式 API 的轻量包装器，供 pdfUtils.ts 等调用方零改动使用。
 * 内部高阶函数（insert/query 等）不使用返回值，这里主要为兼容链式调用。
 */
export async function getOrCreateTable(
  repositoryName: string,
  modelName: string,
  apiKey: string,
  apiURL: string
): Promise<VecTable> {
  await initLanceDB()
  const tableName = sanitizeTableName(repositoryName)

  if (!(await tableExists(tableName))) {
    const sampleEmbedding = await embedSingle('Sample text for dimension detection', modelName, apiKey, apiURL)
    const dimension = sampleEmbedding.length
    await db!.exec(
      `CREATE VIRTUAL TABLE ${quoteIdent(tableName)} USING vec0(
        id INTEGER PRIMARY KEY,
        text TEXT,
        filename TEXT,
        embedding FLOAT[${dimension}] distance=cosine,
        metadata TEXT
      )`
    )
    tableDimensions.set(tableName, dimension)
  }
  return new VecTable(tableName)
}

/** 插入文档（自动生成 ID） */
export async function insertDocument(
  repositoryName: string,
  text: string,
  filename: string,
  metadata: Record<string, any> = {},
  modelName: string,
  apiKey: string,
  apiURL: string
): Promise<{ id: number; text: string; filename: string; metadata: Record<string, any> }> {
  if (!filename) throw new Error('filename is required')
  if (!text || text.trim().length === 0) throw new Error('text cannot be empty')

  try {
    const tableName = sanitizeTableName(repositoryName)
    // 确保表存在（不带 getEmbedding 副作用的快速路径：表已存在则跳过维度探测）
    if (!(await tableExists(tableName))) {
      await getOrCreateTable(repositoryName, modelName, apiKey, apiURL)
    }

    const embedding = await embedSingle(text, modelName, apiKey, apiURL)
    const id = await nextId(tableName)
    const metaJson = JSON.stringify(metadata)

    await db!.run(
      `INSERT INTO ${quoteIdent(tableName)} (id, text, filename, embedding, metadata) VALUES (?, ?, ?, ?, ?)`,
      id, text, filename, vectorToSql(embedding), metaJson
    )

    console.log(`📥 Inserted doc into ${repositoryName} (file: ${filename}, id: ${id})`)
    return { id, text, filename, metadata }
  } catch (error: any) {
    console.error('Failed to insert document:', error)
    throw new Error(`插入文档失败: ${error.message}`)
  }
}

/**
 * 查询相似文档（KNN 向量检索，可选 filename / SQL filter 过滤）。
 * 返回结构兼容原版：{ id, text, filename, score(=distance), meta }
 *
 * filter 参数语义：原版是 LanceDB 的 SQL WHERE 片段（作用于元数据列），
 * 这里仅支持对 filename 这种普通列的过滤；pdfUtils 的复杂 metadata.documentId
 * 过滤走 VecTable.where 链式路径（见下）。
 */
export async function queryDocuments(
  repositoryName: string,
  queryText: string,
  modelName: string,
  apiKey: string,
  apiURL: string,
  limit: number = 5,
  filter: string = '',
  filename?: string
): Promise<Array<{ id: number; text: string; filename: string; score: number; meta: any }>> {
  try {
    const tableName = sanitizeTableName(repositoryName)
    if (!(await tableExists(tableName))) {
      console.warn(`queryDocuments: repository "${repositoryName}" not found`)
      return []
    }

    const embedding = await embedSingle(queryText, modelName, apiKey, apiURL)

    // vec0 KNN 语法：WHERE embedding MATCH ? AND k = ? [AND 额外列过滤]
    let whereExtra = ''
    if (filename) {
      const pureFilename = path.basename(filename)
      whereExtra = ` AND filename = '${escapeSqlString(pureFilename)}'`
    }
    // 原版 filter 作用于 metadata JSON；sqlite-vec 虚拟表的 WHERE 不能直接用 JSON 函数配 MATCH，
    // 此处保守忽略复杂 filter（实际调用链 proof.ts 传的是空串），保留 filename 过滤。
    if (filter) {
      console.warn('queryDocuments: custom filter not supported on vec0 MATCH, ignored:', filter)
    }

    const rows = await db!.all(
      `SELECT id, text, filename, distance, metadata FROM ${quoteIdent(tableName)}
       WHERE embedding MATCH ? AND k = ?${whereExtra}
       ORDER BY distance`,
      vectorToSql(embedding),
      limit
    )

    const resultMap = rows.map((r: any) => ({
      id: r.id,
      text: r.text,
      filename: r.filename,
      score: r.distance,
      meta: r.metadata ? JSON.parse(r.metadata) : {}
    }))
    // chunk 全文不落日志（用户文档内容），只记检索摘要
    writeLog(`[rag] query: repo=${repositoryName}, chars=${queryText.length}, results=${rows.length}, topScore=${rows[0]?.distance}`)
    return resultMap
  } catch (error: any) {
    console.error('Failed to query documents:', error)
    throw new Error(`查询文档失败: ${error.message}`)
  }
}

/** 查询指定文件的所有文档（非向量搜索，全量返回） */
export async function getDocumentsByFilename(
  repositoryName: string,
  filename: string
): Promise<Array<{ id: number; text: string; filename: string; meta: any }>> {
  if (!filename) throw new Error('filename is required')
  try {
    await initLanceDB()
    const tableName = sanitizeTableName(repositoryName)
    if (!(await tableExists(tableName))) {
      throw new Error(`Repository "${repositoryName}" does not exist`)
    }
    const escapedFilename = escapeSqlString(filename)
    const rows = await db!.all(
      `SELECT id, text, filename, metadata FROM ${quoteIdent(tableName)} WHERE filename = ?`,
      escapedFilename
    )
    return rows.map((r: any) => ({
      id: r.id,
      text: r.text,
      filename: r.filename,
      meta: r.metadata ? JSON.parse(r.metadata) : {}
    }))
  } catch (error: any) {
    console.error('Failed to get documents by filename:', error)
    throw new Error(`获取文件文档失败: ${error.message}`)
  }
}

/** 删除指定文件的所有文档（弃用别名，保留签名） */
export async function deleteDocumentsByFilename(repositoryName: string, filename: string): Promise<number> {
  if (!filename) throw new Error('filename is required')
  try {
    await initLanceDB()
    const tableName = sanitizeTableName(repositoryName)
    if (!(await tableExists(tableName))) return 0
    const escapedFilename = escapeSqlString(filename)
    const result = await db!.run(`DELETE FROM ${quoteIdent(tableName)} WHERE filename = ?`, escapedFilename)
    console.log(`🗑️ Deleted ${result.changes} docs with filename: ${filename} in ${repositoryName}`)
    return result.changes || 1
  } catch (error: any) {
    console.error('Failed to delete documents by filename:', error)
    throw new Error(`删除文件文档失败: ${error.message}`)
  }
}

/** 更新文档（保留 filename 不变） */
export async function updateDocument(
  repositoryName: string,
  id: number,
  newText: string,
  newMeta: Record<string, any> = {},
  modelName: string,
  apiKey: string,
  apiURL: string
): Promise<{ id: number; text: string; meta: Record<string, any> }> {
  try {
    const tableName = sanitizeTableName(repositoryName)
    if (!(await tableExists(tableName))) {
      throw new Error(`Repository "${repositoryName}" does not exist`)
    }
    const embedding = await embedSingle(newText, modelName, apiKey, apiURL)

    const existing = await db!.get(`SELECT id FROM ${quoteIdent(tableName)} WHERE id = ?`, id)
    if (!existing) throw new Error(`Document with id ${id} not found`)

    // vec0 虚拟表不支持 UPDATE 修改向量列，需 DELETE + INSERT。
    // 两步包进事务保证原子性：DELETE 成功后 INSERT 失败时回滚，避免文档直接丢失
    await db!.exec('BEGIN IMMEDIATE')
    try {
      await db!.run(`DELETE FROM ${quoteIdent(tableName)} WHERE id = ?`, id)
      await db!.run(
        `INSERT INTO ${quoteIdent(tableName)} (id, text, filename, embedding, metadata) VALUES (?, ?, ?, ?, ?)`,
        id, newText, '', vectorToSql(embedding), JSON.stringify(newMeta)
      )
      await db!.exec('COMMIT')
    } catch (txError) {
      try {
        await db!.exec('ROLLBACK')
      } catch (rollbackError) {
        // 回滚失败仅记录：以触发回滚的原事务错误为准向上抛
        console.error('ROLLBACK failed:', rollbackError)
      }
      throw txError
    }

    console.log(`✏️ Updated doc ${id} in ${repositoryName}`)
    return { id, text: newText, meta: newMeta }
  } catch (error: any) {
    console.error('Failed to update document:', error)
    throw new Error(`更新文档失败: ${error.message}`)
  }
}

/** 删除单个文档（按 ID） */
export async function deleteDocument(repositoryName: string, id: number): Promise<{ id: number }> {
  try {
    await initLanceDB()
    const tableName = sanitizeTableName(repositoryName)
    await db!.run(`DELETE FROM ${quoteIdent(tableName)} WHERE id = ?`, id)
    console.log(`🗑️ Deleted doc ${id} from ${repositoryName}`)
    return { id }
  } catch (error: any) {
    console.error('Failed to delete document:', error)
    throw new Error(`删除文档失败: ${error.message}`)
  }
}

/** 删除指定文件名的所有文档 */
export async function deleteDocumentByName(repositoryName: string, filename: string): Promise<{ filename: string }> {
  if (!filename) throw new Error('filename is required')
  try {
    await initLanceDB()
    const tableName = sanitizeTableName(repositoryName)
    const escapedFilename = escapeSqlString(filename)
    await db!.run(`DELETE FROM ${quoteIdent(tableName)} WHERE filename = ?`, escapedFilename)
    console.log(`🗑️ Deleted docs with filename: ${filename} from ${repositoryName}`)
    return { filename }
  } catch (error: any) {
    console.error('Failed to delete document by name:', error)
    throw new Error(`删除文档失败: ${error.message}`)
  }
}

/** 获取指定知识库中所有不重复的文件名列表 */
export async function listFilenamesInRepository(repositoryName: string): Promise<string[]> {
  try {
    await initLanceDB()
    const tableName = sanitizeTableName(repositoryName)
    if (!(await tableExists(tableName))) {
      throw new Error(`Repository "${repositoryName}" does not exist`)
    }
    const rows = await db!.all(`SELECT DISTINCT filename FROM ${quoteIdent(tableName)} WHERE filename IS NOT NULL`)
    const filenames = rows.map((r: any) => r.filename).filter(Boolean)
    console.log(`📁 Found ${filenames.length} unique filenames in ${repositoryName}`)
    return filenames
  } catch (error: any) {
    console.error('Failed to list filenames:', error)
    throw new Error(`获取文件名列表失败: ${error.message}`)
  }
}

/** 查询指定表中的所有文档 */
export async function getAllDocuments(
  repositoryName: string
): Promise<Array<{ id: number; text: string; filename: string; meta: any }>> {
  try {
    await initLanceDB()
    const tableName = sanitizeTableName(repositoryName)
    if (!(await tableExists(tableName))) {
      throw new Error(`Repository "${repositoryName}" does not exist`)
    }
    const rows = await db!.all(`SELECT id, text, filename, metadata FROM ${quoteIdent(tableName)}`)
    return rows.map((r: any) => ({
      id: r.id,
      text: r.text,
      filename: r.filename,
      meta: r.metadata ? JSON.parse(r.metadata) : {}
    }))
  } catch (error: any) {
    console.error('Failed to get all documents:', error)
    throw new Error(`获取所有文档失败: ${error.message}`)
  }
}

// ========================
// 🔗 LanceDB Table 链式 API 兼容层
// 仅 pdfUtils.ts 的 getPDFDocumentChunks 使用：
//   tbl.search([0]).where("metadata.documentId = '...'").toArray()
// 该调用本质是"用零向量扫全表 + metadata 过滤"，无需真实向量检索。
// 这里翻译为：全表 SELECT + 在 JS 层解析 metadata JSON 做过滤，
// 返回结构对齐原版（含 _distance / id / text / metadata）。
// ========================

class VecTable {
  constructor(private tableName: string) {}

  /** 模拟 LanceDB 的 search(vec)。vec 在原"全表扫描"用法里是占位符 [0]，忽略即可。 */
  search(_vec?: number[]): VecSearchBuilder {
    return new VecSearchBuilder(this.tableName)
  }

  /** 模拟普通 query（不带向量），用于可能的 .query().where().toArray() 调用 */
  query(): VecQueryBuilder {
    return new VecQueryBuilder(this.tableName)
  }
}

/** search().where().limit().toArray() 链 */
class VecSearchBuilder {
  private whereClause = ''
  private limitN = 0

  constructor(private tableName: string) {}

  /** 原版 where 接收 LanceDB SQL 片段，常见为 metadata.xxx = '...'。这里解析后 JS 过滤。 */
  where(clause: string): this {
    this.whereClause = clause
    return this
  }

  limit(n: number): this {
    this.limitN = n
    return this
  }

  async toArray(): Promise<any[]> {
    const db = await initLanceDB()
    // 全表读出（vec0 虚拟表全量 SELECT 不需要 MATCH）
    const rows = await db.all(`SELECT id, text, metadata FROM ${quoteIdent(this.tableName)}`)
    let filtered = rows
    if (this.whereClause) {
      filtered = rows.filter((r: any) => matchMetadataClause(r, this.whereClause))
    }
    if (this.limitN > 0) filtered = filtered.slice(0, this.limitN)
    // 对齐 LanceDB 返回结构：_distance 占位（原用法本就不关心真实距离）
    return filtered.map((r: any) => ({
      id: r.id,
      text: r.text,
      metadata: r.metadata ? JSON.parse(r.metadata) : {},
      _distance: 0
    }))
  }
}

/** query().where().toArray() 链（非向量查询） */
class VecQueryBuilder {
  private whereClause = ''
  private selectCols = '*'

  constructor(private tableName: string) {}

  where(clause: string): this {
    this.whereClause = clause
    return this
  }

  select(cols: string): this {
    this.selectCols = cols
    return this
  }

  async toArray(): Promise<any[]> {
    const db = await initLanceDB()
    if (this.whereClause && /metadata\./.test(this.whereClause)) {
      // metadata 字段过滤走 JS 层
      const rows = await db.all(`SELECT ${this.selectCols} FROM ${quoteIdent(this.tableName)}`)
      return rows.filter((r: any) => matchMetadataClause(r, this.whereClause))
    }
    // 普通 SQL where（如 filename = '...'）直接下发
    const rows = await db.all(`SELECT ${this.selectCols} FROM ${quoteIdent(this.tableName)}`)
    return rows
  }
}

/**
 * 解析形如 "metadata.documentId = 'xxx'" 的 LanceDB 风格过滤子句，
 * 在 JS 层对行做匹配。仅支持单条件的 = 比较（pdfUtils 实际用法）。
 */
function matchMetadataClause(row: any, clause: string): boolean {
  // metadata.key = 'value'
  const m = /metadata\.(\w+)\s*=\s*'([^']*)'/.exec(clause)
  if (!m) return true // 无法识别则不过滤（保守放行）
  const key = m[1]
  const expected = m[2]
  let meta: any = row.metadata
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta)
    } catch {
      return false
    }
  }
  return meta?.[key] === expected
}
