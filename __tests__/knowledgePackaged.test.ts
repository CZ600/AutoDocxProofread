/**
 * 生产环境（打包版）知识库扩展加载路径验证。
 *
 * 生产环境下 sqliteVec.ts 走 process.resourcesPath + '/sqlite-vec/vec0.dll'
 * （asar 外的 extraResources）。本测试用 app.isPackaged = true 的 mock，
 * 并从 node_modules 复制一份健康的 vec0.dll 到 resources 目录结构，
 * 验证打包版的扩展解析与加载逻辑。
 *
 * ⚠️ 排查记录（2026-09）：真实构建产物 ../release/win-unpacked/resources/sqlite-vec/vec0.dll
 * 曾被本机杀毒软件锁定（读取报 Permission denied，LoadLibrary 报 126"找不到指定的模块"），
 * 导致打包版上 initLanceDB 失败 → 知识库列表为空 / 添加失败（用户反馈"添加后无法显示"的根因）。
 * 因 release 目录状态不稳定，本测试改用自建副本验证生产路径逻辑本身；
 * 如需复现用户问题，把 RESOURCES_PATH 指回真实 release 目录即可。
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'

const TMP_USER_DATA = vi.hoisted(() => process.cwd() + '/__tests__/kb_tmp_userdata_prod')

// 自建 resources 目录结构（模拟安装后的 resources/sqlite-vec/vec0.dll）
const RESOURCES_PATH = path.resolve(__dirname, 'tmp', 'fake_resources')

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => TMP_USER_DATA,
    isPackaged: true
  }
}))

vi.mock('../src/main/chat', () => ({
  OpenaiGen: vi.fn(),
  getModelResponse: vi.fn(),
  getEmbedding: vi.fn(async () => Array.from({ length: 8 }, (_, i) => i / 10))
}))

import { initLanceDB, createRepository, listRepositories, closeLanceDB } from '../src/main/lancedb'

beforeAll(() => {
  const dst = path.join(RESOURCES_PATH, 'sqlite-vec')
  fs.mkdirSync(dst, { recursive: true })
  fs.copyFileSync(require.resolve('sqlite-vec-windows-x64/vec0.dll'), path.join(dst, 'vec0.dll'))
  // 纯 Node 下 process.resourcesPath 为 undefined，注入模拟 Electron 生产环境
  ;(process as any).resourcesPath = RESOURCES_PATH
  fs.rmSync(TMP_USER_DATA, { recursive: true, force: true })
  fs.mkdirSync(TMP_USER_DATA, { recursive: true })
})

afterAll(async () => {
  await closeLanceDB()
  fs.rmSync(TMP_USER_DATA, { recursive: true, force: true })
})

describe('打包版知识库扩展加载', () => {
  it('生产路径（resources/sqlite-vec/vec0.dll）可加载扩展并正常创建/显示知识库', async () => {
    const db = await initLanceDB()
    expect(db).toBeTruthy()

    await createRepository('生产环境测试库', 'm', 'k', 'http://localhost')
    const repos = await listRepositories()
    console.log('生产模式下的知识库列表:', repos)
    expect(repos).toContain('生产环境测试库')
  })
})
