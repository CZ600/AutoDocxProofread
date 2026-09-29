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

describe('i18n 批次3新增文案（失败分片 / 导出未匹配 / 结果复核 / 超时设置）', () => {
  it('两种语言下新键均可解析且含插值占位', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      i18n.global.locale.value = locale
      expect(i18n.global.t('proof.messages.failedSegments', { count: 3 })).toContain('3')
      expect(i18n.global.t('proof.messages.exportUnmatched', { count: 2 })).toContain('2')
      expect(i18n.global.t('apiSettings.reviewEnableLabel')).toBeTruthy()
      expect(i18n.global.t('apiSettings.reviewEnabledToast')).toBeTruthy()
      expect(i18n.global.t('rateLimit.timeoutLabel')).toBeTruthy()
      expect(i18n.global.t('rateLimit.timeoutHint')).toBeTruthy()
      expect(i18n.global.t('proof.stream.thinking')).toBeTruthy()
      expect(i18n.global.t('thinking.title')).toBeTruthy()
      expect(i18n.global.t('thinking.modeDefault')).toBeTruthy()
      expect(i18n.global.t('thinking.modeEnabled')).toBeTruthy()
      expect(i18n.global.t('thinking.modeDisabled')).toBeTruthy()
    }
    i18n.global.locale.value = 'zh-CN'
  })
})
