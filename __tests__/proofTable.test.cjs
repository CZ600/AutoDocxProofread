/**
 * 表格章节收集集成测试（proof.ts extractDocxEditHeadings）
 *
 * 验证:
 *  1. 表格文字被收集为独立 "表格 N" section（isTable 标记）
 *  2. 正文章节内容不含表格文字（段落流不被打乱）
 *  3. 纯数字/符号行被过滤（不送 LLM）
 *  4. 嵌套表格不重复收集
 *  5. 公式占位符正常出现在正文 section 文本中
 *
 * 运行: node __tests__/proofTable.test.cjs
 * 依赖: __tests__/tmp_compile/main/proof.js（由 tsc 从 src/main/proof.ts 编译，
 *       编译命令见文件底部注释）
 */
const fs = require('fs')
const path = require('path')

// ---- electron stub ----
// 编译后的 lancedb.js 顶层调用 app.getPath('userData')，纯 node 环境没有 electron。
// 在 require 前注入 require 缓存即可。
const electronResolved = require.resolve('electron')
require.cache[electronResolved] = {
  id: electronResolved,
  filename: electronResolved,
  loaded: true,
  exports: {
    app: { getPath: p => path.join(__dirname, 'fake-userdata', p) }
  }
}

const { extractDocxEditHeadings } = require('./tmp_compile/main/proof')
const JSZip = require('jszip')

const TMP_DIR = path.join(__dirname, '__tests__', 'tmp')

async function createTableTestDocx(filePath) {
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

  // 文档结构:
  //   Heading1 "第一章 绪论"
  //   正文段（含错别字）
  //   表格1: 3行——文字行 / 纯数字行 / 文字+数字混合行
  //   嵌套表格（在表格1的第一个单元格内）
  //   Heading1 "第二章 方法"
  //   含公式的正文段
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章 绪论</w:t></w:r></w:p>
    <w:p><w:r><w:t>这是正文的段落，包含错务内容。</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>试验教据统计结果</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>3.2</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>1.5</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2.6</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>嵌套表格所在单元格</w:t></w:r></w:p>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>嵌套表内容</w:t></w:r></w:p></w:tc></w:tr>
          </w:tbl>
        </w:tc>
        <w:tc><w:p><w:r><w:t>采样频率设置为50Hz</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第二章 方法</w:t></w:r></w:p>
    <w:p>
      <w:r><w:t xml:space="preserve">计算</w:t></w:r>
      <m:oMath><m:r><m:t>a</m:t></m:r><m:r><m:t>b</m:t></m:r></m:oMath>
      <w:r><w:t xml:space="preserve"> 的结果如下所述</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>
  </w:body>
</w:document>`)

  fs.writeFileSync(filePath, await zip.generateAsync({ type: 'nodebuffer' }))
}

function assert(cond, msg) {
  if (!cond) throw new Error(`❌ 断言失败: ${msg}`)
}

async function main() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
  const docxPath = path.join(TMP_DIR, 'table_test_input.docx')
  await createTableTestDocx(docxPath)

  const structure = await extractDocxEditHeadings(docxPath)
  assert(structure !== null, '应提取到文档结构（有 Heading1）')
  console.log('文档标题:', structure.title)
  for (const s of structure.sections) {
    console.log(`  [level=${s.level}${s.isTable ? ' TABLE' : ''}] ${s.title}`)
    console.log(`    content: ${JSON.stringify(s.content.slice(0, 120))}`)
  }

  // 1. 表格 section 存在且带 isTable 标记
  const tableSections = structure.sections.filter(s => s.isTable)
  assert(tableSections.length === 1, `应收集到 1 个表格 section（实际 ${tableSections.length}）——嵌套表不应重复收集`)

  const table = tableSections[0]
  assert(table.title === '表格 1', `表格 section 标题应为 "表格 1"（实际 "${table.title}"）`)

  // 2. 表格内容包含单元格文字
  assert(table.content.includes('试验教据统计结果'), '表格内容应包含 "试验教据统计结果"')
  assert(table.content.includes('采样频率设置为50Hz'), '表格内容应包含 "采样频率设置为50Hz"')

  // 3. 嵌套表内容只出现一次（通过外层 cell.getParagraphs 收集，不重复）
  const nestedCount = (table.content.match(/嵌套表内容/g) || []).length
  assert(nestedCount === 1, `嵌套表内容应恰好出现 1 次（实际 ${nestedCount} 次）`)
  assert(table.content.includes('嵌套表格所在单元格'), '嵌套表所在外层单元格文字应包含在表格 section 中')

  // 4. 纯数字行被过滤
  const lines = table.content.split('\n')
  assert(!lines.some(l => l.includes('1.5') || l.includes('2.6')), `纯数字行 "1.5\\t2.6" 应被过滤（实际行: ${JSON.stringify(lines)}）`)

  // 5. 正文章节不含表格文字
  const bodySections = structure.sections.filter(s => !s.isTable)
  const bodyText = bodySections.map(s => s.title + '\n' + s.content).join('\n')
  assert(!bodyText.includes('试验教据统计结果'), '正文章节不应包含表格文字')
  assert(!bodyText.includes('采样频率'), '正文章节不应包含表格文字（采样频率）')

  // 6. 正文内容与公式占位符正常提取
  assert(bodyText.includes('这是正文的段落，包含错务内容'), '正文段落应被提取')
  assert(bodyText.includes('[[MATH:ab]]'), '公式占位符应出现在正文 section（值为 [[MATH:ab]]）')

  console.log('\n✅ 全部表格提取断言通过')
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})

// 编译命令（wordProcess/proof.ts 更新后需重新生成 tmp_compile）:
//   npx tsc src/main/wordProcess.ts --target es2020 --module commonjs --esModuleInterop --skipLibCheck --moduleResolution node --outDir __tests__/tmp_compile
//   npx tsc src/main/proof.ts     --target es2020 --module commonjs --esModuleInterop --skipLibCheck --moduleResolution node --outDir __tests__/tmp_compile
