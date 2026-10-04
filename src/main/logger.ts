import fs from 'fs'
import path from 'path'
import { app } from 'electron'

// 日志目录与文件：userData 在 electron-builder / forge 下都稳定可写，不受 asar 结构影响
const logDir = path.join(app.getPath('userData'), 'logs')
const logFile = path.join(logDir, 'main.log')
// 轮转：超过 2MB 改名为 main.log.1（覆盖上一份旧日志），当前文件重新开始写
const ROTATED_FILE = `${logFile}.1`
const MAX_LOG_BYTES = 2 * 1024 * 1024

type LogLevel = 'info' | 'warn' | 'error'

// 写入队列：串行化异步 append，保证多条日志落盘顺序与调用顺序一致；
// 单条写入失败只回显控制台，不中断队列（日志失败不能影响业务路径）
let writeQueue: Promise<void> = Promise.resolve()

function enqueueWrite(line: string): void {
  writeQueue = writeQueue
    .then(async () => {
      await fs.promises.mkdir(logDir, { recursive: true })
      const stat = await fs.promises.stat(logFile).catch(() => null)
      if (stat && stat.size >= MAX_LOG_BYTES) {
        await fs.promises.rm(ROTATED_FILE, { force: true })
        await fs.promises.rename(logFile, ROTATED_FILE)
      }
      await fs.promises.appendFile(logFile, line, 'utf8')
    })
    .catch(error => {
      console.error('Failed to write to log file:', error)
    })
}

/**
 * 写一行日志到 userData/logs/main.log（异步、按调用顺序串行落盘）。
 *
 * 约定：只写结构化摘要（模式 / 数量 / 耗时 / 错误消息），禁止写入文档正文、
 * 校对结果全文、RAG chunk 全文等用户内容，以及完整 apiKey。
 *
 * @param message 日志内容（单行）
 * @param level   级别，默认 info；warn/error 在行内加前缀便于 grep
 */
function writeLog(message: string, level: LogLevel = 'info'): void {
  const timestamp = new Date().toISOString()
  const prefix = level === 'info' ? '' : `[${level.toUpperCase()}] `
  enqueueWrite(`[${timestamp}] ${prefix}${message}\n`)

  // 开发环境同步回显到控制台，接线点在 dev 下依然可见；生产 main 进程 console 无消费者
  if (process.env.NODE_ENV === 'development') {
    const log = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    log(message)
  }
}

// 在开发环境中导出额外的方法用于测试
if (process.env.NODE_ENV === 'development') {
  Object.assign(global, { writeLog })
}

export { writeLog, logFile }
