import fs from 'fs'
import path from 'path'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { insertDocument, getOrCreateTable, initLanceDB } from './lancedb'

// 使用动态导入方式导入 uuid
let uuidv4: any

async function initializeUUID() {
  if (!uuidv4) {
    const uuidModule = await import('uuid')
    uuidv4 = uuidModule.v4
  }
  return uuidv4
}

const stat = promisify(fs.stat)

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath)
    return stats.isFile()
  } catch (error) {
    return false
  }
}

/**
 * 读取PDF文件内容
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  if (!(await fileExists(filePath))) {
    throw new Error(`PDF file not found at path: ${filePath}`)
  }

  try {
    // pdf-parse@2.x：主入口默认导出即解析函数，内联了 pdfjs，无需指定旧版 lib 子路径。
    // （旧代码 require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js') 是 1.x 的内置路径，
    //  2.x 已无 lib/ 目录，该路径不存在导致 PDF 提取静默失败。）
    const pdfParse = require('pdf-parse')
    const dataBuffer = await readFile(filePath)
    const data = await pdfParse(dataBuffer)
    return data.text
  } catch (error) {
    console.error('Error extracting text from PDF:', error)
    throw new Error(`Failed to extract text from PDF: ${error.message}`)
  }
}

/**
 * 文本质量检查配置
 */
interface TextQualityConfig {
  minChunkLength: number // 最小chunk长度
  minWordCount: number // 最小单词数
  maxPunctuationRatio: number // 最大标点符号比例
  minAlphanumericRatio: number // 最小字母数字比例
}

const DEFAULT_QUALITY_CONFIG: TextQualityConfig = {
  minChunkLength: 20, // 至少20个字符
  minWordCount: 3, // 至少3个单词
  maxPunctuationRatio: 0.5, // 标点符号不超过50%
  minAlphanumericRatio: 0.3 // 字母数字至少30%
}

/**
 * 检查文本片段是否有效
 */
function isValidChunk(text: string, config: TextQualityConfig = DEFAULT_QUALITY_CONFIG): boolean {
  if (!text || text.trim().length < config.minChunkLength) {
    return false
  }

  const trimmed = text.trim()

  // 检查单词数量（支持中英文）
  const words = trimmed.split(/\s+/).filter(w => w.length > 0)
  const chineseChars = trimmed.match(/[\u4e00-\u9fa5]/g)?.length || 0
  const totalWordCount = words.length + Math.floor(chineseChars / 2) // 中文2个字符算1个词

  if (totalWordCount < config.minWordCount) {
    return false
  }

  // 检查标点符号比例
  const punctuationCount = (trimmed.match(/[.,;:!?。，、；：！？…—\-\(\)\[\]\{\}]/g) || []).length
  if (punctuationCount / trimmed.length > config.maxPunctuationRatio) {
    return false
  }

  // 检查字母数字比例
  const alphanumericCount = (trimmed.match(/[a-zA-Z0-9\u4e00-\u9fa5]/g) || []).length
  if (alphanumericCount / trimmed.length < config.minAlphanumericRatio) {
    return false
  }

  return true
}

/**
 * 规范化文本：清理多余空白，保留段落结构
 */
function normalizeText(text: string): string {
  return (
    text
      // 移除零宽字符和特殊空白
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // 统一换行符
      .replace(/\r\n/g, '\n')
      // 保留双换行（段落分隔），其他换行转为空格
      .replace(/\n\n+/g, '\n\n')
      .replace(/([^\n])\n([^\n])/g, '$1 $2')
      // 规范化空格
      .replace(/[ \t]+/g, ' ')
      // 清理行首行尾空格
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim()
  )
}

/**
 * 将位置 pos 对齐到其后方最近的语义起点（用于 overlap 回拨后修正起点）。
 *
 * 背景：splitTextIntoChunks 在 overlap 回拨时令 nextPos = endPos - overlap，
 * 该位置很可能落在英文单词/数字中间（如 "extra|ction"、"20|26"），导致下一个
 * chunk 以残词开头；也可能落在句子中间，使 chunk 语义不完整。本函数从 pos 起向后
 * 查找最佳起点，优先级：
 *   1. 跳过残词后，若 [pos, limit] 内存在句末标点（。！？.!?)，则从该标点后的
 *      下一句开头起步（语义最完整，参考文献列表等结构化文本受益明显）。
 *   2. 否则跳过当前残词，到下一个完整 token 起点（保证至少不切坏单词）。
 *   3. 中文每个字都是独立 token，pos 处中文即合法起点。
 *
 * limit 用于约束搜索范围（传入 endPos），避免为找句子边界越过本 chunk 末尾、
 * 导致重叠区丢失。仅向前推进，不会回退，避免死循环。
 */
function alignToTokenBoundary(text: string, pos: number, limit: number = text.length): number {
  const n = text.length
  if (pos >= n) return n
  // 中文：直接是合法起点
  if (/[\u4e00-\u9fa5]/.test(text[pos])) return pos

  // 跳过残词所在的连续 [A-Za-z0-9] 串，定位到"至少不切词"的起点 candidate
  let p = pos
  while (p < n && /\s/.test(text[p])) p++
  if (p < n && /[A-Za-z0-9]/.test(text[p])) {
    while (p < n && /[A-Za-z0-9]/.test(text[p])) p++
  }
  let candidate = p
  while (candidate < n && /[^\u4e00-\u9fa5A-Za-z0-9]/.test(text[candidate]) && !/\s/.test(text[candidate])) candidate++
  while (candidate < n && /\s/.test(text[candidate])) candidate++

  // 在 [candidate, limit] 内向后找最近的句末标点，从其后下一句开头起步（语义更完整）
  const sentenceRe = /[。！？]+|[.!?]+(?=\s|$)/g
  sentenceRe.lastIndex = candidate
  let sm: RegExpExecArray | null
  while ((sm = sentenceRe.exec(text)) !== null) {
    if (sm.index >= limit) break
    let s = sm.index + sm[0].length
    while (s < n && /[\s\n]/.test(text[s])) s++
    if (s < limit) return s
    break
  }

  return candidate >= n ? n : candidate
}

/**
 * 查找最佳分割点。
 *
 * 切分优先级：段落 > 句子 > 短语 > 换行 > 空格。
 *
 * 关键修复（曾出现的回归）：参考文献列表等"无中文句号、长英文逗号串"文本里，
 * 句子边界阈值常不满足，于是旧逻辑回退到 return maxPos，直接把英文单词从中间
 * 切开（如 "extraction" → "ction"、"structured" → "tured"、"2026" → "026"），
 * 严重破坏 embedding 语义。现在**任何情况都不允许切断单词**：找不到理想边界时，
 * 一律回退到 maxPos 之前最近的空格/换行边界，宁可 chunk 略短也绝不切坏词。
 *
 * @param text 当前待切分的（相对）文本片段
 * @param maxPos 期望的切分上限位置（相对 text 起点的偏移）
 * @returns 切分点（相对偏移），下一 chunk 从此位置开始
 */
function findBestSplitPoint(text: string, maxPos: number): number {
  // 分割优先级：段落 > 句子 > 短语 > 换行 > 空格

  // 1. 在段落边界（双换行）
  const paragraphEnd = text.lastIndexOf('\n\n', maxPos)
  if (paragraphEnd > maxPos * 0.5) {
    return paragraphEnd + 2
  }

  // 2. 在句子边界（中英文句末标点 + 后续空白/换行）
  //    匹配 [。！？.!?] 后跟空白或行尾的位置，避免把缩写里的 "." 误当句号。
  //    lastIndexOf 只能查固定子串，这里用正则扫描 [0, maxPos] 区间内最后一个匹配。
  const sentenceRe = /[。！？]+|[.!?]+(?=\s|$)/g
  let bestSentenceEnd = -1
  let m: RegExpExecArray | null
  while ((m = sentenceRe.exec(text)) !== null) {
    if (m.index > maxPos) break
    bestSentenceEnd = m.index + m[0].length
  }
  if (bestSentenceEnd > maxPos * 0.5) {
    // 跳过句末标点后的空白，下一 chunk 从下一句的首字符开始
    let endPos = bestSentenceEnd
    while (endPos < text.length && /[\s\n]/.test(text[endPos])) {
      endPos++
    }
    return endPos
  }

  // 3. 在短语边界（逗号、分号等 + 后续空白/换行）
  const phraseRe = /[，、；]+|[,;]+(?=\s|$)/g
  let bestPhraseEnd = -1
  let pm: RegExpExecArray | null
  while ((pm = phraseRe.exec(text)) !== null) {
    if (pm.index > maxPos) break
    bestPhraseEnd = pm.index + pm[0].length
  }
  if (bestPhraseEnd > maxPos * 0.4) {
    return bestPhraseEnd
  }

  // 4. 在单换行处
  const singleLineBreak = text.lastIndexOf('\n', maxPos)
  if (singleLineBreak > maxPos * 0.4) {
    return singleLineBreak + 1
  }

  // 5. 在空格处（单词边界）。无论阈值如何，空格都是合法切分点，不会切断单词。
  const spaceEnd = text.lastIndexOf(' ', maxPos)
  if (spaceEnd > 0) {
    return spaceEnd + 1
  }

  // 6. 兜底：maxPos 之前没有任何空白（极罕见的超长无空格串，如纯中文无标点长段）。
  //    此时不切断的唯一办法是向前回退到文本起点，意味着本 chunk 取到开头——但这会
  //    导致和上一个 chunk 完全重叠、死循环。为保进度，仍返回 maxPos（已是最后手段）。
  return maxPos
}

/**
 * 智能分割文本为段落
 * @param text 输入文本
 * @param maxChunkSize 最大chunk大小
 * @param minChunkSize 最小chunk大小（避免过小片段）
 * @param overlap 重叠大小
 * @param qualityConfig 质量检查配置
 */
export function splitTextIntoChunks(
  text: string,
  maxChunkSize: number = 1000,
  minChunkSize: number = 100,
  overlap: number = 100,
  qualityConfig: TextQualityConfig = DEFAULT_QUALITY_CONFIG
): string[] {
  // 参数验证
  if (maxChunkSize <= 0) {
    throw new Error('maxChunkSize must be greater than 0')
  }
  if (minChunkSize < 0 || minChunkSize > maxChunkSize) {
    throw new Error('minChunkSize must be between 0 and maxChunkSize')
  }
  if (overlap < 0 || overlap >= maxChunkSize) {
    throw new Error('overlap must be between 0 and maxChunkSize')
  }

  if (!text || text.trim().length === 0) {
    return []
  }

  // 规范化文本
  const normalizedText = normalizeText(text)
  const chunks: string[] = []
  let currentPos = 0

  while (currentPos < normalizedText.length) {
    // 确定chunk的结束位置
    const targetEndPos = Math.min(currentPos + maxChunkSize, normalizedText.length)

    let endPos: number
    if (targetEndPos >= normalizedText.length) {
      // 已到文本末尾
      endPos = normalizedText.length
    } else {
      // 查找最佳分割点（绝不切断单词）
      endPos = findBestSplitPoint(normalizedText.slice(currentPos), targetEndPos - currentPos) + currentPos

      // 确保不会产生太小的chunk。旧实现直接取 currentPos + maxChunkSize 会把单词从中间
      // 切断（如 "structured" → "tured"）。改为在 maxChunkSize 附近找一个单词安全的边界：
      // 先尝试 maxChunkSize 处的最佳分割点；若仍小于 minChunkSize（整段无任何标点空白），
      // 才回退硬切（纯中文无标点长段才会走到这一步）。
      if (endPos - currentPos < minChunkSize && endPos < normalizedText.length) {
        const hardEnd = Math.min(currentPos + maxChunkSize, normalizedText.length)
        const safeEnd = findBestSplitPoint(normalizedText.slice(currentPos), hardEnd - currentPos) + currentPos
        endPos = safeEnd - currentPos >= minChunkSize ? safeEnd : hardEnd
      }
    }

    // 提取chunk
    const chunk = normalizedText.slice(currentPos, endPos).trim()

    // 验证chunk质量
    if (isValidChunk(chunk, qualityConfig)) {
      chunks.push(chunk)
    } else {
      console.warn(`Skipped invalid chunk at position ${currentPos}: too short or low quality`)
      // 即使chunk无效，也要前进，避免死循环
      if (endPos <= currentPos) {
        endPos = currentPos + Math.min(minChunkSize, normalizedText.length - currentPos)
      }
    }

    // 计算下一个起始位置（考虑重叠）
    // 关键修复：overlap 回拨后 nextPos 很可能落在单词中间（如 "extra|ction"），
    // 导致下一个 chunk 的开头是被切断的残词。这里把 nextPos 对齐到最近的语义起点
    // （优先句子开头，其次完整单词开头），在 [nextPos, endPos] 范围内搜索。
    let nextPos = endPos - overlap
    if (nextPos > currentPos && nextPos < endPos) {
      nextPos = alignToTokenBoundary(normalizedText, nextPos, endPos)
    }

    // 确保有进展，防止死循环
    if (nextPos <= currentPos) {
      currentPos = endPos
    } else {
      currentPos = nextPos
    }

    // 安全检查：如果没有进展，强制前进
    if (currentPos >= normalizedText.length - 1) {
      break
    }
  }

  // 后处理：合并过小的相邻chunks
  const mergedChunks = mergeSmallChunks(chunks, minChunkSize, maxChunkSize)

  return mergedChunks
}

/**
 * 合并过小的相邻chunks
 */
function mergeSmallChunks(chunks: string[], minSize: number, maxSize: number): string[] {
  if (chunks.length === 0) return []

  const result: string[] = []
  let currentChunk = chunks[0]

  for (let i = 1; i < chunks.length; i++) {
    const nextChunk = chunks[i]

    // 如果当前chunk太小，尝试与下一个合并
    if (currentChunk.length < minSize && currentChunk.length + nextChunk.length <= maxSize) {
      currentChunk = currentChunk + '\n' + nextChunk
    } else {
      result.push(currentChunk)
      currentChunk = nextChunk
    }
  }

  // 添加最后一个chunk
  if (currentChunk) {
    result.push(currentChunk)
  }

  return result
}

/**
 * 处理文档并存入向量数据库
 */
export async function processDocument(
  repositoryName: string,
  filePath: string,
  documentId: string = '',
  chunkSize: number = 1000,
  overlap: number = 100,
  modelName: string,
  apiKey: string,
  apiURL: string,
  options?: {
    minChunkSize?: number
    qualityConfig?: Partial<TextQualityConfig>
  }
) {
  // 初始化 uuid
  const v4 = await initializeUUID()
  if (!documentId) {
    documentId = v4()
  }

  // 1. 提取文本根据文件类型
  const ext = path.extname(filePath).toLowerCase()
  let text: string

  switch (ext) {
    case '.pdf':
      text = await extractTextFromPDF(filePath)
      break
    case '.txt':
      text = await extractTextFromTXT(filePath)
      break
    case '.docx':
      text = await extractTextFromDOCX(filePath)
      break
    default:
      throw new Error(`Unsupported file type: ${ext}`)
  }

  // 2. 分割文本为段落
  const minChunkSize = options?.minChunkSize || Math.floor(chunkSize * 0.3)
  const qualityConfig = {
    ...DEFAULT_QUALITY_CONFIG,
    ...options?.qualityConfig
  }

  const chunks = splitTextIntoChunks(text, chunkSize, minChunkSize, overlap, qualityConfig)

  console.log(
    `Document split into ${chunks.length} chunks. Average size: ${Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length)} chars`
  )

  // 3. 获取文件名作为基础元数据
  const fileName = path.basename(filePath)
  const baseMetadata = {
    source: ext.substring(1),
    fileName,
    filePath,
    documentId,
    totalPages: chunks.length,
    processedAt: new Date().toISOString()
  }

  // 4. 逐段处理并存入数据库
  const results = []
  for (let i = 0; i < chunks.length; i++) {
    const chunkMetadata = {
      ...baseMetadata,
      chunkIndex: i,
      totalChunks: chunks.length,
      chunkId: `${documentId}-${i}`,
      chunkLength: chunks[i].length
    }

    // 插入到向量数据库
    const result = await insertDocument(repositoryName, chunks[i], fileName, chunkMetadata, modelName, apiKey, apiURL)

    results.push(result)
  }

  return {
    documentId,
    fileName,
    chunksProcessed: chunks.length,
    averageChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length),
    results
  }
}

/**
 * 从数据库中检索特定文档的所有段落
 */
export async function getPDFDocumentChunks(repositoryName: string, documentId: string) {
  const tbl = await getOrCreateTable(repositoryName, 'default', 'dummy', 'dummy')
  if (!tbl) throw new Error('Documents table does not exist')

  // 查询特定documentId的所有段落
  const results = await tbl.search([0]).where(`metadata.documentId = '${documentId}'`).toArray()

  // 按chunkIndex排序
  return results
    .map((result: any) => ({
      id: result.id,
      text: result.text,
      score: result._distance,
      metadata: result.metadata
    }))
    .sort((a: any, b: any) => a.metadata.chunkIndex - b.metadata.chunkIndex)
}

/**
 * 读取TXT文件内容
 */
export async function extractTextFromTXT(filePath: string): Promise<string> {
  if (!(await fileExists(filePath))) {
    throw new Error(`TXT file not found at path: ${filePath}`)
  }
  const data = await readFile(filePath, 'utf-8')
  return data
}

/**
 * 读取DOCX文件内容
 */
let mammoth: any

async function initializeMammoth() {
  if (!mammoth) {
    const mammothModule = await import('mammoth')
    mammoth = mammothModule
  }
  return mammoth
}

export async function extractTextFromDOCX(filePath: string): Promise<string> {
  if (!(await fileExists(filePath))) {
    throw new Error(`DOCX file not found at path: ${filePath}`)
  }
  const mammoth = await initializeMammoth()
  const buffer = await readFile(filePath)
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}
