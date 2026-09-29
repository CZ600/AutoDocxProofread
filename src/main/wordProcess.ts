const { loadDocx } = require('docx-edit')

interface Replacement {
  original: string
  suggested: string
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 脚注占位符匹配：docx-edit 的 getText() 会将脚注引用输出为 [[FOOTNOTE_REF:id]]
// 在 run 级别的 collectTextSegments 中不会包含脚注引用节点，因此 fullText 不含这些占位符
// 需要在匹配前从 searchText 中 strip 掉
const FOOTNOTE_PLACEHOLDER_RE = /\[\[FOOTNOTE_REF:\d+\]\]/g
// 公式占位符同理：run 级 fullText 只收集 w:t 文本节点，不含 [[MATH:...]] token
// （公式是独立的 math 子节点）。含上下角标且含公式的段落走 run 级替换时，
// 若不从 search/replace 中剥离占位符，正则里的字面 [[MATH:...]] 永远匹配不上
const MATH_PLACEHOLDER_RE = /\[\[MATH:[\s\S]*?\]\]/g

/**
 * 零宽字符集：U+200B (零宽空格)、U+200C (零宽非连接符)、
 * U+200D (零宽连接符)、U+FEFF (BOM/零宽不换行空格)。
 *
 * docx-edit 抽取段落文本时常把公式 OMML 边界、脚注引用边界上的零宽字符
 * 带进 props.text / fullText。JS 的 \s 不包含这些字符，若不专门处理，
 * 含零宽的文档文本与不含零宽的校正 original 之间会匹配失败，导致导出时
 * 该替换静默丢失。统一在匹配前剥离零宽字符，使匹配对它们完全不敏感。
 */
const ZERO_WIDTH_CHARS_RE = /[\u200B-\u200D\uFEFF]/g

function stripZeroWidth(text: string): string {
  return (text || '').replace(ZERO_WIDTH_CHARS_RE, '')
}

function stripNonTextPlaceholders(text: string): string {
  return stripZeroWidth(
    text.replace(FOOTNOTE_PLACEHOLDER_RE, '').replace(MATH_PLACEHOLDER_RE, '')
  )
}

/**
 * 构建空白不敏感、占位符感知的匹配正则源码（供 RegExp 使用）。
 * - 零宽字符在匹配前从两端剥离，残余的作为空白吞掉
 * - 脚注/公式占位符（[[FOOTNOTE_REF:x]] / [[MATH:...]]）替换为 \u0000 哨兵，
 *   再转为 \s* 桥接：占位符在 run 级 w:t 文本中不存在，但占位符两侧在文档里
 *   可能有真实空格（如 "测得 [[MATH:x2]] 的"），直接拼接两侧文字会失配
 * - 常规空白折叠为 \s+
 *
 * 返回 null 表示搜索串剥掉占位符后没有实际内容（无法匹配）。
 */
function buildSearchPattern(searchValue: string): string | null {
  const normalizedSearch = stripZeroWidth(searchValue.trim())
    .replace(FOOTNOTE_PLACEHOLDER_RE, '\u0000')
    .replace(MATH_PLACEHOLDER_RE, '\u0000')
  if (!normalizedSearch.replace(/\u0000/g, '').trim()) {
    return null
  }
  return escapeRegExp(normalizedSearch)
    .replace(/\u0000/g, '\\s*')
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, '\\s+')
}

// ====== Run 级别文本替换（保留上下角标格式） ======

/**
 * 检查段落是否需要使用 run 级别替换（而非 paragraph.props.text 整段替换）。
 *
 * 必须走 run 级别的情况：
 * 1. 包含上标/下标（vertAlign）的 run → setText() 会按字符数重分配，导致角标漂移
 * 2. 包含 footnoteReference / endnoteReference 子节点 → setText() 要求
 *    [[FOOTNOTE_REF:id]] 占位符完全保留，修改 props.text 时容易丢失
 * 3. 包含数学公式（math）子节点 → docx-edit 的 patch 引擎对含 math 子节点的段落
 *    有 hasStructuredInlineContent 门：props.text 的变更会被直接忽略（静默丢弃）。
 *    只有直接修改 w:t 文本节点（children 路径）才能持久化。
 */
function needsRunLevelReplacement(paraNode: any): boolean {
  function visit(parent: any): boolean {
    if (!parent || !parent.children) return false
    for (const child of parent.children) {
      if (child.type === 'run') {
        const style = child.props.style || {}
        if (style.vertAlign === 'superscript' || style.vertAlign === 'subscript') {
          return true
        }
        // run 内含脚注/尾注引用
        if (child.children) {
          for (const rc of child.children) {
            if (rc.type === 'footnoteReference' || rc.type === 'endnoteReference') {
              return true
            }
          }
        }
      } else if (child.type === 'hyperlink') {
        if (visit(child)) return true
      } else if (child.type === 'math') {
        return true
      }
    }
    return false
  }
  return visit(paraNode)
}

/**
 * 文本片段：对应 run 内的一个 w:t 文本节点。
 */
interface TextSegment {
  node: any
  start: number
  end: number
  text: string
}

/**
 * 收集段落中所有 w:t 文本节点及其在拼接文本中的位置。
 * 深入遍历 run 及 hyperlink 容器，跳过 tab、break 等非文本节点。
 */
function collectTextSegments(paraNode: any): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  function visit(parent: any) {
    if (!parent || !parent.children) return
    for (const child of parent.children) {
      if (child.type === 'run') {
        for (const textChild of child.children || []) {
          if (textChild.type === 'text') {
            const text = textChild.props.text || ''
            segments.push({ node: textChild, start: cursor, end: cursor + text.length, text })
            cursor += text.length
          }
        }
      } else if (child.type === 'hyperlink') {
        visit(child)
      }
    }
  }

  visit(paraNode)
  return segments
}

/**
 * 段落快照：替换前记录段落的原始文本与定位所需的映射。
 * 重复文本按出现次序分配时，必须始终在"未修改的原始文本"上枚举匹配——
 * 若在已被先前替换改写的文本上匹配，替换后仍含搜索串的文本（如
 * "提出"→"提出了"）会再次命中，导致后续替换错位。
 */
interface ParaSnapshot {
  node: any
  needsRunLevel: boolean
  segments: TextSegment[] // run 级段落的 w:t 片段（普通段落为空）
  originalText: string // 普通段落 = props.text；run 级 = w:t 拼接
  cleanText: string // 剥离零宽后的文本（匹配在此坐标系进行）
  indexMap: number[] // indexMap[i] = cleanText[i] 在 originalText 中的位置
}

function buildParaSnapshot(paraNode: any): ParaSnapshot {
  const needsRunLevel = needsRunLevelReplacement(paraNode)
  const segments = needsRunLevel ? collectTextSegments(paraNode) : []
  const originalText = needsRunLevel
    ? segments.map(s => s.text).join('')
    : paraNode.props.text || ''

  // fullText 可能含 OMML 边界残留的零宽字符，而搜索串已被剥离。
  // 构建"剥离零宽后的文本"及其到原始文本的索引映射，在干净版本上
  // 匹配，再把匹配区间换算回原始坐标。
  let cleanText = ''
  const indexMap: number[] = []
  for (let i = 0; i < originalText.length; i++) {
    const ch = originalText[i]
    if (/[\u200B-\u200D\uFEFF]/.test(ch)) continue
    indexMap[cleanText.length] = i
    cleanText += ch
  }
  // 末尾哨兵：cleanText.length 位置映射到 originalText.length
  indexMap[cleanText.length] = originalText.length

  return { node: paraNode, needsRunLevel, segments, originalText, cleanText, indexMap }
}

/**
 * 枚举一个段落快照中搜索串的全部匹配位置（originalText 坐标系）。
 * 匹配始终基于快照的原始文本，不受先前替换影响。
 */
function enumerateParagraphMatches(snapshot: ParaSnapshot, pattern: string): { start: number; end: number }[] {
  const regex = new RegExp(pattern, 'g')
  const matches: { start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(snapshot.cleanText)) !== null) {
    if (m[0].length === 0) {
      regex.lastIndex += 1
      continue
    }
    // indexMap 末尾哨兵保证 end 可指向 originalText.length（含被剥离的零宽脏字符，
    // 回写时连零宽脏字符一并清除）
    matches.push({
      start: snapshot.indexMap[m.index],
      end: snapshot.indexMap[m.index + m[0].length]
    })
  }
  return matches
}

/**
 * 在普通段落（整段 props.text）上按 start 降序应用多处编辑。
 */
function applyNormalEdits(snapshot: ParaSnapshot, edits: { start: number; end: number; replaceText: string }[]): void {
  let text = snapshot.originalText
  for (const edit of edits) {
    text = text.slice(0, edit.start) + edit.replaceText + text.slice(edit.end)
  }
  snapshot.node.props.text = text
}

/**
 * 在 run 级段落上按 start 升序应用多处编辑，保留每个 run 的格式。
 *
 * 核心原理与单处替换版一致：仅修改 w:t 文本节点的 props.text，
 * 不修改 paragraph.props.text，避免 patch 引擎按字符数重分配文本
 * 导致的格式边界错位。替换文本整体写入匹配起点所在的片段
 * （该 run 承载错误首字符的格式），其余受影响片段仅删除被消耗的字符。
 */
function applyRunLevelEdits(snapshot: ParaSnapshot, edits: { start: number; end: number; replaceText: string }[]): void {
  if (snapshot.segments.length === 0) return
  const ordered = [...edits].sort((a, b) => a.start - b.start)
  for (const seg of snapshot.segments) {
    let out = ''
    let cursor = seg.start
    for (const edit of ordered) {
      if (edit.end <= seg.start || edit.start >= seg.end) continue
      const overlapStart = Math.max(edit.start, seg.start)
      const overlapEnd = Math.min(edit.end, seg.end)
      out += seg.text.slice(cursor - seg.start, overlapStart - seg.start)
      if (edit.start >= seg.start && edit.start < seg.end) {
        out += edit.replaceText
      }
      cursor = overlapEnd
    }
    out += seg.text.slice(cursor - seg.start)
    if (out !== seg.text) {
      seg.node.props.text = out
    }
  }
}

// ====== 树遍历辅助函数 ======

/**
 * 递归收集一个节点下的所有段落节点（包括表格单元格、文本框内的段落）。
 */
function collectAllParagraphs(node: any, result: any[] = []): any[] {
  if (!node || !node.children) return result
  for (const child of node.children) {
    if (child.type === 'paragraph') {
      result.push(child)
    } else if (child.type === 'table') {
      for (const row of child.children || []) {
        if (row.type === 'table-row') {
          for (const cell of row.children || []) {
            if (cell.type === 'table-cell') {
              collectAllParagraphs(cell, result)
            }
          }
        }
      }
    } else if (child.type === 'text-box') {
      collectAllParagraphs(child, result)
    }
  }
  return result
}

// ====== 主导出函数 ======

/**
 * 使用 docx-edit 回写文档文本。
 *
 * 策略：
 * - 含上/下角标、脚注/尾注引用、数学公式的段落：通过虚拟树 API 在 run 级别
 *   修改 w:t 文本节点，不触发 ParagraphTextModel.setText() 的跨 run 字符数重分配，
 *   确保角标格式不会错位且脚注占位符不会丢失。
 *   注意公式段落必须走此路径：docx-edit 的 patch 引擎对含 math 子节点的段落
 *   会忽略 paragraph.props.text 的变更（hasStructuredInlineContent 门），
 *   整段替换方式对公式段落是静默丢失。
 * - 普通段落：使用 paragraph.props.text 的整段替换方式（兼容 tab / break）。
 */
export interface ReplaceTextResult {
  appliedCount: number
  /** 未能在文档中匹配到原文的建议条数（导出时被跳过） */
  unmatchedCount: number
}

export async function replaceTextInDocx(
  inputPath: string,
  outputPath: string,
  replacements: Replacement[]
): Promise<ReplaceTextResult> {
  const sanitizedReplacements = replacements.filter(
    item => item && item.original && item.suggested !== undefined
  )
  const doc = await loadDocx(inputPath)

  let appliedCount = 0
  const unmatched: Replacement[] = []

  // 一次取树，批量应用所有替换，最后一次 patch
  const tree = doc.toComponentTree()

  // 收集所有文档部件中的段落（body / header / footer 等），并建立替换前快照
  const allParagraphs: any[] = []
  for (const part of tree.children) {
    collectAllParagraphs(part, allParagraphs)
  }
  const snapshots = allParagraphs.map(buildParaSnapshot)

  // ====== 定位阶段：在原始快照上按出现次序分配 ======
  // 校正列表顺序与文档顺序一致，因此同一原文的第 k 条替换分配给文档中
  // 第 k 次出现（与预览高亮的分配规则相同）。此前"逐条找第一个能匹配的
  // 段落"的做法在重复文本上会全部命中第一处，错改后续段落。
  const occurrenceCursor = new Map<string, number>()

  interface LocatedEdit {
    paraIdx: number
    start: number
    end: number
    replaceText: string
  }
  const locatedEdits: LocatedEdit[] = []

  for (const replacement of sanitizedReplacements) {
    const key = stripZeroWidth(replacement.original).trim()
    const pattern = buildSearchPattern(replacement.original)
    if (!pattern) {
      unmatched.push(replacement)
      continue
    }
    const occurrence = occurrenceCursor.get(key) || 0
    occurrenceCursor.set(key, occurrence + 1)

    let target: { paraIdx: number; start: number; end: number } | null = null
    let seen = 0
    for (let paraIdx = 0; paraIdx < snapshots.length && !target; paraIdx++) {
      for (const range of enumerateParagraphMatches(snapshots[paraIdx], pattern)) {
        if (seen === occurrence) {
          target = { paraIdx, start: range.start, end: range.end }
          break
        }
        seen += 1
      }
    }

    if (!target) {
      unmatched.push(replacement)
      continue
    }

    // replaceText 中不能包含脚注/公式占位符——它们是独立的 XML 元素，
    // 不在 w:t 文本节点中。写入前必须 strip，否则 doc.patch() 会产生乱码。
    const edit: LocatedEdit = {
      paraIdx: target.paraIdx,
      start: target.start,
      end: target.end,
      replaceText: stripNonTextPlaceholders(replacement.suggested)
    }

    // 两条不同原文的匹配区间在段内重叠时放弃后者（保留先定位到的替换）
    const overlaps = locatedEdits.some(
      e => e.paraIdx === edit.paraIdx && e.start < edit.end && edit.start < e.end
    )
    if (overlaps) {
      unmatched.push(replacement)
      continue
    }

    locatedEdits.push(edit)
    appliedCount += 1
  }

  // ====== 应用阶段：按段落分组，段内按 start 排序做多点替换 ======
  const editsByPara = new Map<number, LocatedEdit[]>()
  for (const edit of locatedEdits) {
    const list = editsByPara.get(edit.paraIdx) || []
    list.push(edit)
    editsByPara.set(edit.paraIdx, list)
  }
  for (const [paraIdx, edits] of editsByPara) {
    const snapshot = snapshots[paraIdx]
    if (snapshot.needsRunLevel) {
      applyRunLevelEdits(snapshot, edits)
    } else {
      applyNormalEdits(snapshot, edits)
    }
  }

  if (appliedCount > 0) {
    doc.patch(tree)
  }

  await doc.saveAs(outputPath)

  console.log('[exportCorrectedDocx] export finished:', {
    inputPath,
    outputPath,
    totalReplacements: sanitizedReplacements.length,
    appliedCount,
    unmatchedCount: unmatched.length
  })

  return { appliedCount, unmatchedCount: unmatched.length }
}
