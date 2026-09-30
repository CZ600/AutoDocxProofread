/**
 * 格式克隆的 profile/spec 纯函数转换（批次 9 自 FormatClone.vue 迁出）。
 * 只做数据整形，不持有组件状态；formatItems/defaults/agentSpec 均由调用方传入。
 */

/** simple 克隆流程：把编辑后的 formatItems/defaults 组装为 styleProfile */
export const buildProfileFromItems = (formatItems, defaults) => {
  const styles = {}
  for (const item of formatItems) {
    styles[item.id] = {
      name: item.name,
      type: item.type,
      paragraphStyle: item.paragraphStyle,
      runStyle: item.runStyle
    }
  }
  return { defaults, styles }
}

/** agent 流程：spec → 可编辑的 formatItems（styles + paragraphRules 合并去重） */
export const specToFormatItems = spec => {
  const items = []
  // styleProfile.styles → items
  if (spec.styleProfile?.styles) {
    for (const [id, style] of Object.entries(spec.styleProfile.styles)) {
      items.push({
        id,
        name: style.name || id,
        type: style.type || 'paragraph',
        basedOn: style.basedOn || undefined,
        paragraphStyle: { ...(style.paragraphStyle || {}) },
        runStyle: { ...(style.runStyle || {}) }
      })
    }
  }
  // paragraphRules → add items for types not yet in list
  if (spec.paragraphRules) {
    for (const rule of spec.paragraphRules) {
      const pType = rule.match?.paragraphType
      if (pType && !items.find(i => i.id === pType)) {
        items.push({
          id: pType,
          name: pType,
          type: 'paragraph',
          basedOn: undefined,
          paragraphStyle: { ...(rule.format?.paragraphStyle || {}) },
          runStyle: { ...(rule.format?.runStyle || {}) }
        })
      }
    }
  }
  return items
}

export const specToDefaults = spec => {
  return spec.styleProfile?.defaults || null
}

/** agent 流程：把编辑后的 formatItems 重建为 spec（保留原 spec 的 pageSettings） */
export const buildSpecFromItems = (formatItems, defaults, agentSpec) => {
  const styles = {}
  // Rebuild paragraphRules from user-edited formatItems so edits actually take effect
  const paragraphRules = []
  for (const item of formatItems) {
    const styleEntry = {
      name: item.name,
      type: item.type,
      basedOn: item.basedOn || undefined,
      paragraphStyle: item.paragraphStyle,
      runStyle: item.runStyle
    }
    styles[item.id] = styleEntry

    // Create a matching paragraphRule so inline formatting is applied to paragraphs
    paragraphRules.push({
      match: { paragraphType: item.id },
      format: {
        paragraphStyle: item.paragraphStyle,
        runStyle: item.runStyle
      },
      exclusive: true
    })
  }

  // Preserve pageSettings from original spec
  const pageSettings = agentSpec?.pageSettings || undefined

  return {
    styleProfile: {
      defaults: defaults ? { ...defaults } : undefined,
      styles
    },
    paragraphRules,
    ...(pageSettings ? { pageSettings } : {})
  }
}
