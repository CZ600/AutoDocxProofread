import { describe, it, expect } from 'vitest'
import { shouldRunReview } from '../src/main/reviewGate'

describe('结果复核执行门槛（默认关闭，成本控制）', () => {
  it('默认状态（未选审核模型 + 未开启开关）不执行复核', () => {
    expect(shouldRunReview(null, false)).toBe(false)
    expect(shouldRunReview(null, undefined)).toBe(false)
    expect(shouldRunReview(undefined, undefined)).toBe(false)
  })

  it('显式选择审核模型时执行复核（无需开关）', () => {
    expect(shouldRunReview(3, false)).toBe(true)
    expect(shouldRunReview(3, undefined)).toBe(true)
  })

  it('开启「结果复核」开关时执行复核（未选审核模型则用校对模型）', () => {
    expect(shouldRunReview(null, true)).toBe(true)
    expect(shouldRunReview(undefined, true)).toBe(true)
  })

  it('非法的审核模型 ID 视为未选择', () => {
    expect(shouldRunReview(0, false)).toBe(false)
    expect(shouldRunReview(0, true)).toBe(true) // 开关开着仍执行
  })
})
