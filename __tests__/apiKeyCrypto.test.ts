import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock electron 的 safeStorage：encryptString 输出可逆的伪密文，
// decryptString 只接受本 mock 产出的格式，模拟真实 safeStorage 的行为
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => mockEncryptionAvailable.value,
    encryptString: (plain: string) => Buffer.from(`__CIPHER__(${plain})`, 'utf8'),
    decryptString: (buf: Buffer) => {
      const raw = buf.toString('utf8')
      if (!raw.startsWith('__CIPHER__(') || !raw.endsWith(')')) {
        throw new Error('failed to decrypt')
      }
      return raw.slice('__CIPHER__('.length, -1)
    }
  }
}))

const mockEncryptionAvailable = vi.hoisted(() => ({ value: true }))

import { encryptApiKey, decryptApiKey, maskKey } from '../src/main/apiKeyCrypto'

const SECRET = 'sk-test-abcdefgh1234567890'

describe('apiKeyCrypto', () => {
  beforeEach(() => {
    mockEncryptionAvailable.value = true
  })

  it('加密后再解密应还原原文，且密文不含明文、带前缀', () => {
    const encrypted = encryptApiKey(SECRET)
    expect(encrypted).toMatch(/^enc:v1:/)
    expect(encrypted).not.toContain(SECRET)
    expect(decryptApiKey(encrypted)).toBe(SECRET)
  })

  it('不带前缀的旧明文记录应原样返回（兼容迁移）', () => {
    expect(decryptApiKey(SECRET)).toBe(SECRET)
    expect(decryptApiKey('')).toBe('')
  })

  it('safeStorage 不可用时降级为明文存储', () => {
    mockEncryptionAvailable.value = false
    expect(encryptApiKey(SECRET)).toBe(SECRET)
  })

  it('加密应幂等：已是密文的入参不再二次加密', () => {
    const encrypted = encryptApiKey(SECRET)
    expect(encryptApiKey(encrypted)).toBe(encrypted)
  })

  it('损坏的密文解密失败时应原样返回，而不是抛错', () => {
    const corrupted = 'enc:v1:not-a-valid-cipher'
    expect(decryptApiKey(corrupted)).toBe(corrupted)
  })

  it('空值往返应保持为空', () => {
    expect(encryptApiKey('')).toBe('')
    expect(decryptApiKey('')).toBe('')
  })

  it('maskKey 只保留前 6 位并补 ***，空值返回空串', () => {
    expect(maskKey(SECRET)).toBe('sk-tes***')
    expect(maskKey('')).toBe('')
    expect(maskKey(undefined)).toBe('')
    expect(maskKey(null)).toBe('')
  })
})
