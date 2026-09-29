/**
 * 结果复核（review）执行门槛。
 *
 * 历史行为：只要校对有结果就无条件用主模型把全部建议再复核一遍，
 * 导致每次校对 token 消耗约翻倍。现在复核必须显式开启：
 *   - 用户选择了审核模型（reviewModelId 非空），或
 *   - 用户开启了「结果复核」开关（reviewEnabled，此时未选审核模型则用校对模型）。
 * 两者默认都关闭，即默认不执行复核。
 */
export function shouldRunReview(reviewModelId: number | null | undefined, reviewEnabled: boolean | undefined): boolean {
  if (reviewModelId != null && reviewModelId > 0) return true
  return reviewEnabled === true
}
