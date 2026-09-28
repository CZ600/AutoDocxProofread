/**
 * sqliteVec.ts loadVecExtension 错误处理测试（v1.2.2 修复项）。
 *
 * 背景：sqlite 包的 loadExtension 已是 Promise 包装，加载失败（如杀毒软件拦截
 * vec0.dll 时的 Win32 错误 126）会 reject；但旧实现的 catch 条件
 * `msg.includes('not authorized') === false` 几乎恒真，把所有加载错误吞掉，
 * 上层只能看到误导性的 "no such function: vec_version"。
 *
 * 验证：
 *  1. DLL 加载失败时，loadVecExtension 抛出的错误包含 DLL 路径和杀软排查指引
 *     （而不是静默通过）
 *  2. 真实 vec0.dll 正常加载并返回版本号（回归保护）
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: (_name: string) => process.cwd() + '/__tests__', isPackaged: false }
}))

import path from 'path'
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { loadVecExtension } from '../src/main/sqliteVec'

async function openMemoryDb() {
  return open({ filename: ':memory:', driver: sqlite3.Database })
}

describe('loadVecExtension 错误处理', () => {
  it('DLL 缺失时抛出含路径与杀软指引的错误，而非静默吞掉', async () => {
    const db = await openMemoryDb()
    const badPath = path.resolve(__dirname, 'tmp', 'not_exist_vec0.dll')
    // 把开发路径的 require.resolve 重定向到不存在的文件，模拟扩展加载失败
    const Module = require('module')
    const realResolve = Module._resolveFilename
    const spy = vi.spyOn(Module, '_resolveFilename').mockImplementation((request: string, ...rest: any[]) => {
      if (String(request).includes('sqlite-vec-windows-x64/vec0.dll')) return badPath
      return realResolve(request, ...rest)
    })
    try {
      await expect(loadVecExtension(db as any)).rejects.toThrow(/向量扩展加载失败/)
      try {
        await loadVecExtension(db as any)
      } catch (e: any) {
        expect(e.message).toContain(badPath)
        expect(e.message).toContain('杀毒软件')
      }
    } finally {
      spy.mockRestore()
      await db.close()
    }
  })

  it('真实 vec0.dll 正常加载并返回版本号（回归保护）', async () => {
    const db = await openMemoryDb()
    try {
      const version = await loadVecExtension(db as any)
      expect(version).toMatch(/^v/)
    } finally {
      await db.close()
    }
  })
})
