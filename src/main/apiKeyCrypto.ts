import { safeStorage } from 'electron'

// 密文前缀标记：带前缀的一定是 safeStorage 密文，不带前缀的视为历史明文记录
// （读取时原样返回保证旧库可用，下次保存时由 encryptApiKey 自动升级为密文）
const ENC_PREFIX = 'enc:v1:'

/**
 * 加密 API key 用于落盘（safeStorage → base64，带密文前缀）。
 * - safeStorage 不可用（如 Linux 无 keyring）时降级为明文存储并警告
 * - 幂等：入参已是密文时原样返回，避免二次加密
 */
export function encryptApiKey(plain: string): string {
  if (!plain || plain.startsWith(ENC_PREFIX)) {
    return plain
  }
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[apiKeyCrypto] safeStorage 不可用，API key 将以明文存储')
    return plain
  }
  try {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
  } catch (err) {
    console.warn('[apiKeyCrypto] 加密失败，API key 将以明文存储:', err)
    return plain
  }
}

/**
 * 解密存储中的 API key。
 * - 带密文前缀：base64 → safeStorage.decryptString
 * - 不带前缀：旧明文记录原样返回（兼容迁移，下次保存自动升级为密文）
 * - 解密失败：原样返回，让上游以可见的鉴权失败暴露问题（如 keyring 变更）
 */
export function decryptApiKey(stored: string): string {
  if (!stored || !stored.startsWith(ENC_PREFIX)) {
    return stored
  }
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'))
  } catch (err) {
    console.error('[apiKeyCrypto] 解密失败（keyring 可能已变更），将以原始值继续:', err)
    return stored
  }
}

/** 日志打码：只保留前 6 位，避免完整 key 进入控制台与日志文件 */
export function maskKey(key: string | undefined | null): string {
  if (!key) return ''
  return `${key.slice(0, 6)}***`
}
