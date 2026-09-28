import { app } from 'electron'
import path from 'path'
import type { Database } from 'sqlite'

/**
 * sqlite-vec 向量扩展加载器
 *
 * 背景：sqlite-vec 的官方 npm 包 (index.cjs) 用 require.resolve() 定位平台子包
 * (sqlite-vec-windows-x64/vec0.dll) 里的 loadable extension 二进制。
 * 但 electron-builder 打包进 asar 后，require.resolve 对 .dll 不可靠
 * （.dll 属于原生二进制，不能在 asar 内被 sqlite3 loadExtension 加载）。
 *
 * 因此这里采用与 @lancedb 一致的策略（见 main.ts 的 LANCEDB_NATIVE_PATH）：
 * - 生产环境：vec0.dll 由 electron-builder 的 extraResources 放到 resources/sqlite-vec/
 *   运行时用 process.resourcesPath 拼路径，完全绕开 require.resolve。
 * - 开发环境：直接复用 npm 包内的二进制，避免开发态还得手动 copy。
 *
 * 这样打包体积只增加 ~0.28 MB（vec0.dll 实测 289 KB），且不引入新的原生引擎。
 */

const SUBDIR = 'sqlite-vec'

/** 扩展二进制文件名（按平台） */
function extensionFileName(): string {
  switch (process.platform) {
    case 'win32':
      return 'vec0.dll'
    case 'darwin':
      return 'vec0.dylib'
    default:
      return 'vec0.so'
  }
}

/**
 * 解析 vec0 扩展二进制的绝对路径（开发/生产两套）。
 * 返回的路径始终是 asar 外的真实文件系统路径。
 */
export function getVecExtensionPath(): string {
  const fileName = extensionFileName()

  if (app.isPackaged) {
    // 生产：resources/sqlite-vec/vec0.dll（由 electron-builder extraResources 注入）
    return path.join(process.resourcesPath, SUBDIR, fileName)
  }

  // 开发：复用已安装的平台子包内的二进制。
  // 走 require.resolve 能自动定位 win/linux/mac 对应子包，无需硬编码平台名。
  const platformPkg =
    process.platform === 'win32'
      ? 'sqlite-vec-windows-x64'
      : process.platform === 'darwin'
        ? process.arch === 'arm64'
          ? 'sqlite-vec-darwin-arm64'
          : 'sqlite-vec-darwin-x64'
        : process.arch === 'arm64'
          ? 'sqlite-vec-linux-arm64'
          : 'sqlite-vec-linux-x64'

  return require.resolve(`${platformPkg}/${fileName}`)
}

/**
 * 在给定 sqlite 连接上加载 vec0 向量扩展。
 * 幂等：可重复调用，sqlite3 驱动对重复 loadExtension 会报 "already loaded"，
 * 这里捕获并视为成功。
 *
 * 错误处理（v1.2.2 修复）：sqlite 包的 loadExtension 已是 Promise 包装，加载失败
 * （如杀毒软件拦截 vec0.dll 时的 Win32 错误 126"找不到指定的模块"）会 reject；
 * 旧实现的 catch 条件 `msg.includes('not authorized') === false` 几乎恒真，
 * 把所有加载错误吞掉，上层只能看到误导性的 "no such function: vec_version"。
 * 现在把失败原因连同 DLL 路径、杀软排查指引一起抛出。
 *
 * @param db 已通过 sqlite.open() 打开的连接（driver=sqlite3.Database）
 * @returns 扩展版本字符串（来自 vec_version()），便于上层日志确认
 */
export async function loadVecExtension(db: Database): Promise<string> {
  const extPath = getVecExtensionPath()
  try {
    await db.loadExtension(extPath)
  } catch (err: any) {
    const msg = String(err?.message || err)
    if (msg.includes('already')) {
      // "already loaded" / 重复加载 —— 视为成功，继续往下读版本
    } else {
      throw new Error(
        `向量扩展加载失败 (${extPath}): ${msg}。` +
          `若该文件存在仍加载失败，通常是杀毒软件拦截了 vec0.dll，` +
          `请将其加入白名单后重启软件`
      )
    }
  }

  // 读扩展版本号确认加载成功
  const row = await db.get('SELECT vec_version() AS v')
  const version = String(row?.v ?? 'unknown')
  console.log(`✅ sqlite-vec 扩展已加载 [${version}] @ ${extPath}`)
  return version
}

/** 仅判断扩展文件是否存在（便于上层在加载前给出更友好的错误） */
export function isVecExtensionPresent(): boolean {
  try {
    const fs = require('fs')
    return fs.existsSync(getVecExtensionPath())
  } catch {
    return false
  }
}
