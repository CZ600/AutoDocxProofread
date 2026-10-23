# docx-proofread — Word 文档校对

用大模型校对 Word 文档(.docx):**错词校对、综合校对、全文润色**,生成建议清单,用户确认后保格式应用回文档。所有模型调用走宿主配置的 provider(默认 `deepseek-official`),无需另行提供 API key。

## 何时使用

用户说"校对/检查这份 Word"、"帮我改错别字/病句"、"润色这份文档"时使用。降 AI 率改写与知识库检索暂不支持。

## 核心工具

| 工具 | 作用 |
|---|---|
| `docx_info` | 读文档统计(字符/段落/预估分片),校对前先跑 |
| `proofread_docx` | 执行校对,建议写入 `<文档名>.corrections.json` |
| `apply_corrections` | 把选中的建议应用为新文档 `<文档名>-proofread.docx` |

`proofread_docx` 的 `proofType`:`wordError`(错词,按句,快)/`ComprehensiveError`(综合,按段,覆盖上下文一致性问题)/`polish`(整篇润色)。可选 `intensity`(strict/normal/loose)与 `background`(academic/news/official/daily)。

## 标准工作流(闭环)

1. **先评估**:`docx_info` 看规模。预估分片 > 50 时先告知用户预计耗时,再继续。
2. **校对**:`proofread_docx`。完成后向用户展示建议摘要(类型分布 + 代表性条目),**不要自动应用**。
3. **等确认**:让用户决定全部应用、只应用某些条(报序号,对应 corrections 清单下标)或不应用。
4. **应用**:`apply_corrections`(全部或 `indices` 选择)。输出是新文件,原文件不动。
5. **验证**:应用后重新 `docx_info` 或让用户打开输出文件抽查;`unmatchedCount > 0` 时说明有条目原文匹配不到,如实告知用户哪些建议被跳过。

## 硬规则

1. **不未经确认就改文档**:校对只产出建议文件;`apply_corrections` 必须在用户明确同意后调用。
2. **原文件只读**:apply 永远输出新文件,绝不原地覆盖。
3. **如实汇报**:`unmatchedCount`、`failedSegments`、被过滤(`filtered`)的建议都要告诉用户,不静默吞掉。
4. **建议内容不编造**:向用户转述建议时逐条来自 corrections 文件,不改写原意。
5. 长文档校对耗时与分片数成正比,先给用户预期;工具支持取消,用户要求停止时直接取消。
