/**
 * 知识库（sqlite-vec / vec0 虚拟表）添加、管理、显示功能端到端验证。
 *
 * 用户反馈：知识库添加后无法正常显示。
 * 本测试不 mock sqlite-vec 扩展，用真实 vec0.dll 跑完整链路：
 *   创建库（中文/空格/数字开头）→ listRepositories 显示 → 插入文档 →
 *   listFilenamesInRepository 文件列表 → 向量查询 → 删除库后列表更新。
 *
 * mock 范围（均为外部依赖，与被测逻辑无关）：
 *   - electron：app.getPath('userData') 指向测试专用临时目录
 *   - ./chat：getEmbedding 返回固定维度假向量，避免真实 API 调用
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'

// vi.mock 工厂会被提升到所有 import 之前执行，内部只能用全局对象（不能引用 path 等导入）
const TMP_USER_DATA = vi.hoisted(() => process.cwd() + '/__tests__/kb_tmp_userdata')

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => TMP_USER_DATA,
    isPackaged: false
  }
}))

vi.mock('../src/main/chat', () => ({
  OpenaiGen: vi.fn(),
  getModelResponse: vi.fn(),
  getEmbedding: vi.fn(async () => Array.from({ length: 8 }, (_, i) => i / 10))
}))

import {
  initLanceDB,
  createRepository,
  listRepositories,
  insertDocument,
  listFilenamesInRepository,
  getAllDocuments,
  deleteRepository
} from '../src/main/lancedb'

const MODEL = 'test-embedding-model'

beforeAll(async () => {
  fs.rmSync(TMP_USER_DATA, { recursive: true, force: true })
  fs.mkdirSync(TMP_USER_DATA, { recursive: true })
})

afterAll(async () => {
  const { closeLanceDB } = await import('../src/main/lancedb')
  await closeLanceDB()
  fs.rmSync(TMP_USER_DATA, { recursive: true, force: true })
})

describe('知识库 添加/管理/显示', () => {
  it('initLanceDB: 真实加载 sqlite-vec 扩展', async () => {
    const db = await initLanceDB()
    expect(db).toBeTruthy()
    const row = await db.get('SELECT vec_version() AS v')
    expect(row?.v).toBeTruthy()
  })

  it('创建中文知识库后，listRepositories 能显示它', async () => {
    await createRepository('测试知识库', MODEL, 'key', 'http://localhost')
    const repos = await listRepositories()
    console.log('创建"测试知识库"后的列表:', repos)
    expect(repos).toContain('测试知识库')
  })

  it('创建带空格的知识库后，listRepositories 能显示它', async () => {
    await createRepository('我的Repo 1', MODEL, 'key', 'http://localhost')
    const repos = await listRepositories()
    console.log('创建"我的Repo 1"后的列表:', repos)
    expect(repos).toContain('我的Repo 1')
  })

  it('创建数字开头的知识库后，列表显示不出现 shadow table 假条目', async () => {
    await createRepository('123abc', MODEL, 'key', 'http://localhost')
    const repos = await listRepositories()
    console.log('创建"123abc"后的列表:', repos)
    // 数字开头 sanitize 成 t_123abc，仍应作为唯一条目显示
    expect(repos).toContain('t_123abc')
    // 不应把 vec0 派生的 shadow tables 当成知识库列出
    const shadows = repos.filter(
      r => /_(info|chunks|rowids|vector_chunks)$/.test(r) || /_vector_chunks\d+/.test(r)
    )
    expect(shadows).toEqual([])
  })

  it('插入文档后，listFilenamesInRepository 能显示文件', async () => {
    await insertDocument('测试知识库', '这是第一段测试文本，用于验证知识库显示。', '指南.pdf', { page: 1 }, MODEL, 'key', 'http://localhost')
    await insertDocument('测试知识库', '这是第二段测试文本。', '规范.docx', { page: 2 }, MODEL, 'key', 'http://localhost')

    const files = await listFilenamesInRepository('测试知识库')
    console.log('测试知识库中的文件列表:', files)
    expect(files.sort()).toEqual(['指南.pdf', '规范.docx'])

    const docs = await getAllDocuments('测试知识库')
    expect(docs.length).toBe(2)
  })

  it('删除知识库后，列表同步更新', async () => {
    await deleteRepository('123abc')
    const repos = await listRepositories()
    console.log('删除"123abc"后的列表:', repos)
    expect(repos).not.toContain('t_123abc')
    expect(repos).toContain('测试知识库')
    expect(repos).toContain('我的Repo 1')
  })

  it('模拟应用重启（关闭连接后重开）：知识库列表与文件列表仍正常显示', async () => {
    const { closeLanceDB } = await import('../src/main/lancedb')
    await closeLanceDB()
    // 重开后走的是 refreshTableDimensions 从 sqlite_master 解析的路径（而非建表时写入的缓存）
    const repos = await listRepositories()
    console.log('重启后的知识库列表:', repos)
    expect(repos.sort()).toEqual(['我的Repo 1', '测试知识库'])

    const files = await listFilenamesInRepository('测试知识库')
    expect(files.sort()).toEqual(['指南.pdf', '规范.docx'])
  })
})
