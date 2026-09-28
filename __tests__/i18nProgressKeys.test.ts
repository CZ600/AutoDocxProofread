import { describe, it, expect } from 'vitest'
import { i18n } from '../src/renderer/i18n'

describe('i18n 校对进度取消文案', () => {
  it('zh-CN 下 proof.progress.cancel/cancelling 应正常解析', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(i18n.global.t('proof.progress.cancel')).toBe('取消')
    expect(i18n.global.t('proof.progress.cancelling')).toBe('正在取消…')
    expect(i18n.global.t('proof.progress.splitting')).toBe('正在整理信息')
  })

  it('en 下同样应正常解析', () => {
    i18n.global.locale.value = 'en'
    expect(i18n.global.t('proof.progress.cancel')).toBe('Cancel')
    i18n.global.locale.value = 'zh-CN'
  })
})
