/**
 * 测试 wordProcess.ts 的 run 级别文本替换
 * 
 * 测试覆盖:
 *  1. 带上标/下标的段落替换（保留角标格式）
 *  2. 带脚注引用的段落替换（保留 [[FOOTNOTE_REF]] 占位符）
 *  3. 同时带上标和脚注的段落替换
 *  4. 普通段落替换（无特殊格式）
 *  5. 替换文本长度变化时角标不错位
 */

const { loadDocx, createVNode } = require('docx-edit')
const fs = require('fs')
const path = require('path')
const { replaceTextInDocx } = require('./tmp_compile/wordProcess')

const TMP_DIR = path.join(__dirname, '__tests__', 'tmp')

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
}

// ====== 测试文档创建 ======

/**
 * 创建一个包含各种特殊格式的测试 docx 文件
 */
async function createTestDocx(filePath) {
  const JSZip = require('jszip')
  
  const zip = new JSZip()
  
  // [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
</Types>`)
  
  // _rels/.rels
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  
  // word/_rels/document.xml.rels
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
</Relationships>`)

  // word/styles.xml
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="宋体"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
</w:styles>`)
  
  // word/footnotes.xml - 包含脚注定义
  zip.file('word/footnotes.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">
  <w:footnote w:type="separator" w:id="0"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="1"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  <w:footnote w:id="2"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>这是脚注1的内容</w:t></w:r></w:p></w:footnote>
  <w:footnote w:id="3"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>这是脚注2的内容</w:t></w:r></w:p></w:footnote>
</w:footnotes>`)
  
  // word/document.xml - 包含各种格式的段落
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <!-- 段落1: 含下标 (CO₂) -->
    <w:p>
      <w:r><w:t>CO</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r>
      <w:r><w:t>的浓度是400ppm</w:t></w:r>
    </w:p>
    <!-- 段落2: 含上标 (E=mc²) -->
    <w:p>
      <w:r><w:t>E=mc</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r>
      <w:r><w:t>是相对论公式</w:t></w:r>
    </w:p>
    <!-- 段落3: 含脚注引用 (上标 + footnoteReference) -->
    <w:p>
      <w:r><w:t>这是带有脚注的文本</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="2"/></w:r>
      <w:r><w:t>后面还有更多内容</w:t></w:r>
    </w:p>
    <!-- 段落4: 含脚注引用 + 下标 (最复杂情况) -->
    <w:p>
      <w:r><w:t>CO</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r>
      <w:r><w:t>排放量很高</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="3"/></w:r>
      <w:r><w:t>需要减排</w:t></w:r>
    </w:p>
    <!-- 段落5: 普通段落 (无特殊格式) -->
    <w:p>
      <w:r><w:t>这是普通的文本段落没有任何特殊格式</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`)
  
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  fs.writeFileSync(filePath, buffer)
  console.log(`[createTestDocx] Created: ${filePath}`)
}

// ====== 验证辅助 ======

async function readDocxTextAndStyles(filePath) {
  const doc = await loadDocx(filePath)
  const body = doc.getBody()
  const paragraphs = body.getParagraphs()
  
  const results = []
  for (const para of paragraphs) {
    const text = para.getText()
    const runs = para.getRuns()
    const runInfo = runs.map(r => ({
      text: r.getText(),
      style: r.getStyle()
    }))
    results.push({ text, runs: runInfo })
  }
  return results
}

// ====== 测试用例 ======

async function testSubscriptPreserved() {
  console.log('\n=== 测试1: 下标格式保留 (CO₂) ===')
  const inputPath = path.join(TMP_DIR, 'test1_input.docx')
  const outputPath = path.join(TMP_DIR, 'test1_output.docx')
  
  await createTestDocx(inputPath)
  
  // 替换 "浓度" → "含量" (在非下标区域)
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '浓度是400ppm', suggested: '含量是500ppm' }
  ])
  
  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p1 = paragraphs[0]
  
  // 验证文本正确
  console.log('  段落文本:', p1.text)
  assertIncludes(p1.text, 'CO', '应包含 CO')
  assertIncludes(p1.text, '含量是500ppm', '应替换为 含量是500ppm')
  
  // 验证下标保留: 应该有一个 run 的 text 是 "2" 且 vertAlign 是 subscript
  const subscriptRun = p1.runs.find(r => r.text === '2' && r.style.vertAlign === 'subscript')
  assertOk(subscriptRun, '应保留下标 run: text="2", vertAlign="subscript"')
  
  console.log('  ✅ 测试1通过: 下标格式保留正确')
}

async function testSuperscriptPreserved() {
  console.log('\n=== 测试2: 上标格式保留 (E=mc²) ===')
  const inputPath = path.join(TMP_DIR, 'test2_input.docx')
  const outputPath = path.join(TMP_DIR, 'test2_output.docx')
  
  await createTestDocx(inputPath)
  
  // 替换 "相对论" → "质能方程" (在非上标区域，但改变了文本长度)
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '是相对论公式', suggested: '是质能方程' }
  ])
  
  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p2 = paragraphs[1]
  
  console.log('  段落文本:', p2.text)
  assertIncludes(p2.text, 'E=mc', '应包含 E=mc')
  assertIncludes(p2.text, '是质能方程', '应替换为 是质能方程')
  
  const superscriptRun = p2.runs.find(r => r.text === '2' && r.style.vertAlign === 'superscript')
  assertOk(superscriptRun, '应保留上标 run: text="2", vertAlign="superscript"')
  
  console.log('  ✅ 测试2通过: 上标格式保留正确')
}

async function testFootnoteRefPreserved() {
  console.log('\n=== 测试3: 脚注引用保留 ===')
  const inputPath = path.join(TMP_DIR, 'test3_input.docx')
  const outputPath = path.join(TMP_DIR, 'test3_output.docx')
  
  await createTestDocx(inputPath)
  
  // 替换脚注引用附近的文本
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '带有脚注的文本', suggested: '包含脚注的文字' }
  ])
  
  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p3 = paragraphs[2]
  
  console.log('  段落文本:', p3.text)
  assertIncludes(p3.text, '包含脚注的文字', '应替换脚注前文本')
  assertIncludes(p3.text, '后面还有更多内容', '应保留脚注后文本')
  
  // 段落文本应包含脚注占位符（说明脚注引用未被破坏）
  // 注意: getText() 会显示 [[FOOTNOTE_REF:2]]
  assertIncludes(p3.text, '[[FOOTNOTE_REF:', '应保留脚注引用占位符')
  
  console.log('  ✅ 测试3通过: 脚注引用保留正确')
}

async function testSubscriptWithFootnote() {
  console.log('\n=== 测试4: 下标+脚注 同时保留 ===')
  const inputPath = path.join(TMP_DIR, 'test4_input.docx')
  const outputPath = path.join(TMP_DIR, 'test4_output.docx')
  
  await createTestDocx(inputPath)
  
  // 替换 "需要减排" → "必须减少排放"
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '需要减排', suggested: '必须减少排放' }
  ])
  
  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p4 = paragraphs[3]
  
  console.log('  段落文本:', p4.text)
  assertIncludes(p4.text, 'CO', '应包含 CO')
  assertIncludes(p4.text, '必须减少排放', '应替换为 必须减少排放')
  assertIncludes(p4.text, '[[FOOTNOTE_REF:', '应保留脚注引用')
  
  // 下标 "2" 应该保留
  const subscriptRun = p4.runs.find(r => r.text === '2' && r.style.vertAlign === 'subscript')
  assertOk(subscriptRun, '应保留下标 run')
  
  console.log('  ✅ 测试4通过: 下标+脚注同时保留正确')
}

async function testPlainParagraph() {
  console.log('\n=== 测试5: 普通段落替换 ===')
  const inputPath = path.join(TMP_DIR, 'test5_input.docx')
  const outputPath = path.join(TMP_DIR, 'test5_output.docx')
  
  await createTestDocx(inputPath)
  
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '普通的文本段落', suggested: '修改后的文本段落' }
  ])
  
  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p5 = paragraphs[4]
  
  console.log('  段落文本:', p5.text)
  assertIncludes(p5.text, '修改后的文本段落', '应替换普通文本')
  
  console.log('  ✅ 测试5通过: 普通段落替换正确')
}

async function testMultipleReplacements() {
  console.log('\n=== 测试6: 多个替换批量执行 ===')
  const inputPath = path.join(TMP_DIR, 'test6_input.docx')
  const outputPath = path.join(TMP_DIR, 'test6_output.docx')
  
  await createTestDocx(inputPath)
  
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '浓度是400ppm', suggested: '含量为350ppm' },
    { original: '是相对论公式', suggested: '是著名公式' },
    { original: '普通的文本段落', suggested: '简单的文字段落' }
  ])
  
  const paragraphs = await readDocxTextAndStyles(outputPath)
  
  // 验证段落1: 下标保留
  const p1 = paragraphs[0]
  console.log('  段落1:', p1.text)
  assertIncludes(p1.text, '含量为350ppm', '段落1应替换')
  const sub1 = p1.runs.find(r => r.text === '2' && r.style.vertAlign === 'subscript')
  assertOk(sub1, '段落1下标保留')
  
  // 验证段落2: 上标保留
  const p2 = paragraphs[1]
  console.log('  段落2:', p2.text)
  assertIncludes(p2.text, '是著名公式', '段落2应替换')
  const sup2 = p2.runs.find(r => r.text === '2' && r.style.vertAlign === 'superscript')
  assertOk(sup2, '段落2上标保留')
  
  // 验证段落5: 普通段落
  const p5 = paragraphs[4]
  console.log('  段落5:', p5.text)
  assertIncludes(p5.text, '简单的文字段落', '段落5应替换')
  
  console.log('  ✅ 测试6通过: 批量替换全部正确')
}

async function testNoMatchNoError() {
  console.log('\n=== 测试7: 无匹配项不报错 ===')
  const inputPath = path.join(TMP_DIR, 'test7_input.docx')
  const outputPath = path.join(TMP_DIR, 'test7_output.docx')
  
  await createTestDocx(inputPath)
  
  // 使用不匹配的替换
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '完全不存在的文本', suggested: '替换文本' }
  ])
  
  // 验证输出文件内容与输入一致
  const paragraphs = await readDocxTextAndStyles(outputPath)
  assertIncludes(paragraphs[0].text, 'CO', '未匹配时内容不变')
  
  console.log('  ✅ 测试7通过: 无匹配时不报错、内容不变')
}

/**
 * 测试8: 脚注引用 run 无显式 vertAlign 时也能正确替换
 * 这模拟了用户报告的真实场景：脚注引用在非 superscript run 中
 */
async function testFootnoteWithoutVertAlign() {
  console.log('\n=== 测试8: 脚注引用无显式上标格式 ===')
  const inputPath = path.join(TMP_DIR, 'test8_input.docx')
  const outputPath = path.join(TMP_DIR, 'test8_output.docx')
  
  // 创建一个脚注引用在无 vertAlign 的 run 中的文档
  const JSZip = require('jszip')
  const zip = new JSZip()
  
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
</Relationships>`)
  zip.file('word/footnotes.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="0"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="1"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  <w:footnote w:id="2"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t>脚注内容</w:t></w:r></w:p></w:footnote>
</w:footnotes>`)
  
  // 关键：脚注引用 run 没有 w:rPr/w:vertAlign —— 模拟真实场景
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t>这是带有脚注的段落</w:t></w:r>
      <w:r><w:footnoteReference w:id="2"/></w:r>
      <w:r><w:t>后面还有更多内容</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>
  </w:body>
</w:document>`)
  
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  fs.writeFileSync(inputPath, buffer)
  
  // 替换脚注附近的文本——这应该在之前会报错
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '带有脚注的段落', suggested: '包含脚注的文字' }
  ])
  
  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p = paragraphs[0]
  
  console.log('  段落文本:', p.text)
  assertIncludes(p.text, '包含脚注的文字', '应替换脚注前文本')
  assertIncludes(p.text, '[[FOOTNOTE_REF:', '应保留脚注引用')
  assertIncludes(p.text, '后面还有更多内容', '应保留脚注后文本')
  
  console.log('  ✅ 测试8通过: 无显式上标的脚注引用也正确处理')
}

/**
 * 测试9: 长文本变化替换，验证角标不漂移
 * 在 CO₂ 前面的文本做长→短的替换
 */
async function testLengthChangeNearSubscript() {
  console.log('\n=== 测试9: 角标前文本长度变化，角标不漂移 ===')
  const inputPath = path.join(TMP_DIR, 'test9_input.docx')
  const outputPath = path.join(TMP_DIR, 'test9_output.docx')
  
  await createTestDocx(inputPath)
  
  // 替换下标前面的文本，且改变长度: "的浓度" (3 chars) → "含量" (2 chars)
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '的浓度', suggested: '含量' }
  ])
  
  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p = paragraphs[0]
  
  console.log('  段落文本:', p.text)
  console.log('  Runs:', p.runs.map(r => `${r.text}[${r.style.vertAlign || 'normal'}]`).join(' | '))
  
  assertIncludes(p.text, 'CO', '应包含 CO')
  assertIncludes(p.text, '含量', '应替换为 含量')
  
  // 关键验证: 下标 run 仍然是 "2" 且 vertAlign 是 subscript
  const subscriptRun = p.runs.find(r => r.text === '2' && r.style.vertAlign === 'subscript')
  assertOk(subscriptRun, '下标 run 应该是 "2" 且 vertAlign="subscript"，不应该漂移到其他文本')
  
  console.log('  ✅ 测试9通过: 文本长度变化后角标不漂移')
}

/**
 * 测试10: 脚注引用在无 vertAlign 的 run 中，替换脚注后面的文本
 * 模拟用户原始报错场景: paragraph.props.text 包含 [[FOOTNOTE_REF:0]]，
 * 替换匹配时不应让占位符丢失导致 setText 报错。
 */
async function testFootnoteNoVertAlignReplaceAfter() {
  console.log('\n=== 测试10: 无上标脚注 + 替换脚注后文本 ===')
  const inputPath = path.join(TMP_DIR, 'test10_input.docx')
  const outputPath = path.join(TMP_DIR, 'test10_output.docx')
  
  const JSZip = require('jszip')
  const zip = new JSZip()
  
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
</Relationships>`)
  zip.file('word/footnotes.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="0"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="1"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  <w:footnote w:id="2"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t>来源说明</w:t></w:r></w:p></w:footnote>
</w:footnotes>`)
  
  // 无 vertAlign 的脚注引用 run
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t>根据最新研究报告</w:t></w:r>
      <w:r><w:footnoteReference w:id="2"/></w:r>
      <w:r><w:t>显示全球气温持续上升</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>
  </w:body>
</w:document>`)
  
  fs.writeFileSync(inputPath, await zip.generateAsync({ type: 'nodebuffer' }))
  
  // 替换脚注后面的文本
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '显示全球气温持续上升', suggested: '表明全球温度不断升高' }
  ])
  
  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p = paragraphs[0]
  
  console.log('  段落文本:', p.text)
  assertIncludes(p.text, '根据最新研究报告', '脚注前文本不变')
  assertIncludes(p.text, '[[FOOTNOTE_REF:2]]', '脚注引用保留')
  assertIncludes(p.text, '表明全球温度不断升高', '脚注后文本正确替换')
  
  console.log('  ✅ 测试10通过')
}

/**
 * 测试11: 脚注引用在无 vertAlign 的 run 中，替换跨越脚注的文本
 * 这是最危险的场景: mammoth 文本可能合并了脚注前后的文字
 */
async function testFootnoteCrossBoundaryNoCrash() {
  console.log('\n=== 测试11: 无上标脚注 + 替换文本跨越脚注边界（不应崩溃） ===')
  const inputPath = path.join(TMP_DIR, 'test11_input.docx')
  const outputPath = path.join(TMP_DIR, 'test11_output.docx')
  
  const JSZip = require('jszip')
  const zip = new JSZip()
  
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
</Relationships>`)
  zip.file('word/footnotes.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="0"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="1"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  <w:footnote w:id="2"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t>注脚</w:t></w:r></w:p></w:footnote>
</w:footnotes>`)
  
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t>研究报告</w:t></w:r>
      <w:r><w:footnoteReference w:id="2"/></w:r>
      <w:r><w:t>重要结论</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>
  </w:body>
</w:document>`)
  
  fs.writeFileSync(inputPath, await zip.generateAsync({ type: 'nodebuffer' }))
  
  // 尝试替换可能跨越脚注占位符的文本
  // 这个替换不应该崩溃，即使匹配失败也没关系
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '研究报告重要结论', suggested: '分析报告关键结论' }
  ])
  
  // 验证没有崩溃且文件有效
  const paragraphs = await readDocxTextAndStyles(outputPath)
  assertOk(paragraphs.length > 0, '应输出有效文件')
  console.log('  段落文本:', paragraphs[0].text)
  assertIncludes(paragraphs[0].text, '[[FOOTNOTE_REF:2]]', '脚注引用应保留')
  
  console.log('  ✅ 测试11通过: 跨脚注替换不崩溃')
}

/**
 * 测试12: 含公式占位符 [[MATH:...]] + 紧邻零宽字符 (U+200B) 的段落替换
 *
 * 这是用户报告的真实场景：docx-edit 抽取段落文本时，公式 OMML 边界的
 * U+200B 被带进 props.text，紧贴 [[MATH:AS]] 后面。校正结果的 original
 * 字段保留了同样的 "占位符+零宽" 组合。修复前，由于 JS 的 \s 不含 U+200B，
 * 匹配会静默失败，导出时该替换被丢弃。修复后应能正确匹配并替换。
 *
 * 场景构造：段落文本 = "前缀相似性矩阵[[MATH:AS]]<U+200B>，利用图卷积后缀"
 *              original = "相似性矩阵[[MATH:AS]]<U+200B>，利用图卷积"
 *              suggested = "相似性矩阵[[MATH:AS]]，借助图卷积"
 * 期望：替换成功，输出含"借助图卷积"且公式占位符保留
 */
async function testMathPlaceholderWithZeroWidth() {
  console.log('\n=== 测试12: 公式占位符 + 零宽字符 (U+200B) 替换 ===')
  const inputPath = path.join(TMP_DIR, 'test12_input.docx')
  const outputPath = path.join(TMP_DIR, 'test12_output.docx')

  const JSZip = require('jszip')
  const zip = new JSZip()

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)

  // 关键：段落 props.text 含 [[MATH:AS]] + U+200B（模拟 docx-edit 抽取结果）
  // 这里直接写一个普通段落，文本里手动嵌入占位符和零宽字符
  // U+200B 在 JS 字符串里用 \u200B 表示
  const paraText = '前缀相似性矩阵[[MATH:AS]]\u200B，利用图卷积后缀'
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${paraText}</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>
  </w:body>
</w:document>`)

  fs.writeFileSync(inputPath, await zip.generateAsync({ type: 'nodebuffer' }))

  // original 含与段落一致的 "占位符 + U+200B" 组合
  const replacementOriginal = '相似性矩阵[[MATH:AS]]\u200B，利用图卷积'
  const replacementSuggested = '相似性矩阵[[MATH:AS]]，借助图卷积'

  await replaceTextInDocx(inputPath, outputPath, [
    { original: replacementOriginal, suggested: replacementSuggested }
  ])

  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p = paragraphs[0]
  console.log('  段落文本:', JSON.stringify(p.text))

  // 修复前：匹配失败，文本不变（仍含"利用"和 U+200B）
  // 修复后：替换成功，应含"借助图卷积"，且公式占位符保留
  assertIncludes(p.text, '借助图卷积', '应成功替换为"借助图卷积"（修复前此处会失败）')
  assertIncludes(p.text, '[[MATH:AS]]', '公式占位符应保留')

  console.log('  ✅ 测试12通过: 公式占位符 + 零宽字符场景正确替换')
}

/**
 * 测试13: 真实 OMML 公式节点 + 上标 → run 级替换的占位符桥接
 *
 * 修复前的行为：含上标的段落走 run 级替换，fullText 只含 w:t 文本节点、
 * 不含 [[MATH:...]] token，而 original 里的字面 [[MATH:...]] 被烧进正则，
 * 永远匹配不上 → 替换静默丢失。
 * 修复后：占位符位置用 \s* 桥接，公式两侧的真实空格也能匹配。
 */
async function testRealMathNodeRunWithSuperscript() {
  console.log('\n=== 测试13: 真实公式节点+上标 run 级桥接替换 ===')
  const inputPath = path.join(TMP_DIR, 'test13_input.docx')
  const outputPath = path.join(TMP_DIR, 'test13_output.docx')

  const JSZip = require('jszip')
  const zip = new JSZip()

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)

  // 段落结构: "测得" + oMath(x²拼接为x2) + " 的取值范围是"(带前导空格) + 上标"1"
  // props.text = "测得[[MATH:x2]] 的取值范围是1"
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">测得</w:t></w:r>
      <m:oMath><m:r><m:t>x</m:t></m:r><m:r><m:t>2</m:t></m:r></m:oMath>
      <w:r><w:t xml:space="preserve"> 的取值范围是</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>
  </w:body>
</w:document>`)

  fs.writeFileSync(inputPath, await zip.generateAsync({ type: 'nodebuffer' }))

  // original 与 props.text 一致（含占位符和公式后的真实空格）
  await replaceTextInDocx(inputPath, outputPath, [
    { original: '测得[[MATH:x2]] 的取值范围', suggested: '求得[[MATH:x2]] 的取值区间' }
  ])

  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p = paragraphs[0]
  console.log('  段落文本:', JSON.stringify(p.text))

  assertIncludes(p.text, '求得', '应替换"测得"为"求得"（修复前此处会静默失败）')
  assertIncludes(p.text, '的取值区间', '应替换为"的取值区间"')
  assertIncludes(p.text, '[[MATH:x2]]', '真实公式节点应保留（占位符仍在）')
  assertIncludes(p.text, '是', '公式后未匹配文本应保留')

  // 上标 run 保留
  const supRun = p.runs.find(r => r.text === '1' && r.style.vertAlign === 'superscript')
  assertOk(supRun, '上标 run "1" 应保留')

  console.log('  ✅ 测试13通过: 真实公式节点+上标场景桥接替换正确')
}

/**
 * 测试14: 真实 OMML 公式节点（无上标）→ 整段 props.text 替换路径
 * 占位符作为 fixed token 由 ParagraphTextModel.setText 保留
 */
async function testRealMathNodeWholeParagraph() {
  console.log('\n=== 测试14: 真实公式节点整段替换 ===')
  const inputPath = path.join(TMP_DIR, 'test14_input.docx')
  const outputPath = path.join(TMP_DIR, 'test14_output.docx')

  const JSZip = require('jszip')
  const zip = new JSZip()

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)

  // props.text = "计算[[MATH:ab]] 结果如下"
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">计算</w:t></w:r>
      <m:oMath><m:r><m:t>a</m:t></m:r><m:r><m:t>b</m:t></m:r></m:oMath>
      <w:r><w:t xml:space="preserve"> 结果如下</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>
  </w:body>
</w:document>`)

  fs.writeFileSync(inputPath, await zip.generateAsync({ type: 'nodebuffer' }))

  await replaceTextInDocx(inputPath, outputPath, [
    { original: '计算[[MATH:ab]] 结果', suggested: '求解[[MATH:ab]] 结果' }
  ])

  const paragraphs = await readDocxTextAndStyles(outputPath)
  const p = paragraphs[0]
  console.log('  段落文本:', JSON.stringify(p.text))

  assertIncludes(p.text, '求解', '应替换"计算"为"求解"')
  assertIncludes(p.text, '[[MATH:ab]]', '公式占位符应保留（公式节点未丢失）')
  assertIncludes(p.text, '结果如下', '公式后文本应保留')

  console.log('  ✅ 测试14通过: 真实公式节点整段替换正确')
}

// ====== 断言辅助 ======

function assertIncludes(text, substring, msg) {
  if (!text.includes(substring)) {
    throw new Error(`❌ 断言失败: ${msg}\n  期望包含: "${substring}"\n  实际文本: "${text}"`)
  }
}

function assertOk(value, msg) {
  if (!value) {
    throw new Error(`❌ 断言失败: ${msg}`)
  }
}

// ====== 主入口 ======

async function main() {
  ensureTmpDir()
  let passed = 0
  let failed = 0

  const tests = [
    testSubscriptPreserved,
    testSuperscriptPreserved,
    testFootnoteRefPreserved,
    testSubscriptWithFootnote,
    testPlainParagraph,
    testMultipleReplacements,
    testNoMatchNoError,
    testFootnoteWithoutVertAlign,
    testLengthChangeNearSubscript,
    testFootnoteNoVertAlignReplaceAfter,
    testFootnoteCrossBoundaryNoCrash,
    testMathPlaceholderWithZeroWidth,
    testRealMathNodeRunWithSuperscript,
    testRealMathNodeWholeParagraph
  ]
  
  for (const test of tests) {
    try {
      await test()
      passed++
    } catch (err) {
      console.error(`  ❌ 测试失败: ${err.message}`)
      failed++
    }
  }
  
  console.log(`\n${'='.repeat(50)}`)
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`)
  if (failed > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('测试运行失败:', err)
  process.exit(1)
})
