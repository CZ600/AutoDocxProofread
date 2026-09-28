"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceTextInDocx = replaceTextInDocx;
const { loadDocx } = require('docx-edit');
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// 脚注占位符匹配：docx-edit 的 getText() 会将脚注引用输出为 [[FOOTNOTE_REF:id]]
// 在 run 级别的 collectTextSegments 中不会包含脚注引用节点，因此 fullText 不含这些占位符
// 需要在匹配前从 searchText 中 strip 掉
const FOOTNOTE_PLACEHOLDER_RE = /\[\[FOOTNOTE_REF:\d+\]\]/g;
// 公式占位符同理：run 级 fullText 只收集 w:t 文本节点，不含 [[MATH:...]] token
// （公式是独立的 math 子节点）。含上下角标且含公式的段落走 run 级替换时，
// 若不从 search/replace 中剥离占位符，正则里的字面 [[MATH:...]] 永远匹配不上
const MATH_PLACEHOLDER_RE = /\[\[MATH:[\s\S]*?\]\]/g;
/**
 * 零宽字符集：U+200B (零宽空格)、U+200C (零宽非连接符)、
 * U+200D (零宽连接符)、U+FEFF (BOM/零宽不换行空格)。
 *
 * docx-edit 抽取段落文本时常把公式 OMML 边界、脚注引用边界上的零宽字符
 * 带进 props.text / fullText。JS 的 \s 不包含这些字符，若不专门处理，
 * 含零宽的文档文本与不含零宽的校正 original 之间会匹配失败，导致导出时
 * 该替换静默丢失。统一在匹配前剥离零宽字符，使匹配对它们完全不敏感。
 */
const ZERO_WIDTH_CHARS_RE = /[\u200B-\u200D\uFEFF]/g;
function stripZeroWidth(text) {
    return (text || '').replace(ZERO_WIDTH_CHARS_RE, '');
}
function stripNonTextPlaceholders(text) {
    return stripZeroWidth(text.replace(FOOTNOTE_PLACEHOLDER_RE, '').replace(MATH_PLACEHOLDER_RE, ''));
}
function replaceFirstWhitespaceInsensitive(text, searchValue, replacement) {
    // 文档文本与 searchValue 都剥离零宽字符后再匹配，
    // 避免 OMML 边界残留的 U+200B 等导致静默不匹配。
    const haystack = stripZeroWidth(text);
    const normalizedSearch = stripZeroWidth(searchValue.trim());
    if (!normalizedSearch) {
        return { count: 0, text };
    }
    // 空白折叠为 \s+，同时吞掉残余的零宽字符（双重保险）
    const pattern = escapeRegExp(normalizedSearch).replace(/[\s\u200B-\u200D\uFEFF]+/g, '\\s+');
    const regex = new RegExp(pattern);
    if (!regex.test(haystack)) {
        return { count: 0, text };
    }
    return {
        count: 1,
        text: haystack.replace(regex, replacement)
    };
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
function needsRunLevelReplacement(paraNode) {
    function visit(parent) {
        if (!parent || !parent.children)
            return false;
        for (const child of parent.children) {
            if (child.type === 'run') {
                const style = child.props.style || {};
                if (style.vertAlign === 'superscript' || style.vertAlign === 'subscript') {
                    return true;
                }
                // run 内含脚注/尾注引用
                if (child.children) {
                    for (const rc of child.children) {
                        if (rc.type === 'footnoteReference' || rc.type === 'endnoteReference') {
                            return true;
                        }
                    }
                }
            }
            else if (child.type === 'hyperlink') {
                if (visit(child))
                    return true;
            }
            else if (child.type === 'math') {
                return true;
            }
        }
        return false;
    }
    return visit(paraNode);
}
/**
 * 收集段落中所有 w:t 文本节点及其在拼接文本中的位置。
 * 深入遍历 run 及 hyperlink 容器，跳过 tab、break 等非文本节点。
 */
function collectTextSegments(paraNode) {
    const segments = [];
    let cursor = 0;
    function visit(parent) {
        if (!parent || !parent.children)
            return;
        for (const child of parent.children) {
            if (child.type === 'run') {
                for (const textChild of child.children || []) {
                    if (textChild.type === 'text') {
                        const text = textChild.props.text || '';
                        segments.push({ node: textChild, start: cursor, end: cursor + text.length, text });
                        cursor += text.length;
                    }
                }
            }
            else if (child.type === 'hyperlink') {
                visit(child);
            }
        }
    }
    visit(paraNode);
    return segments;
}
/**
 * 在段落内执行 run 级别的文本替换，保留每个 run 的格式（上下角标、加粗等）。
 *
 * 核心原理：仅修改 w:t 文本节点的 props.text，不修改 paragraph.props.text。
 * 这使得 patch 引擎在处理时走 children 路径而非 setText() 路径，
 * 从而避免了 ParagraphTextModel.setText() 按原始字符数重分配文本导致的
 * 格式边界错位问题。
 *
 * 局限性：当匹配跨越 tab / break 等非文本节点时，可能无法匹配成功。
 * 对于校对场景，这种情况极少出现。
 */
function replaceInParagraphRuns(paraNode, searchText, replaceText) {
    const segments = collectTextSegments(paraNode);
    if (segments.length === 0)
        return false;
    const fullText = segments.map(s => s.text).join('');
    if (!fullText)
        return false;
    // 空白不敏感匹配。脚注/公式占位符在 run 级 fullText（只含 w:t 文本）中不存在，
    // 不能直接删除了事——占位符两侧在文档里可能有真实空格
    // （如 "测得 [[MATH:x2]] 的"），直接拼接两侧文字会失配。
    // 因此把占位符替换为 \u0000 哨兵，正则转义后再统一转为 \s* 桥接。
    const bridged = stripZeroWidth(searchText.trim())
        .replace(FOOTNOTE_PLACEHOLDER_RE, '\u0000')
        .replace(MATH_PLACEHOLDER_RE, '\u0000');
    if (!bridged.replace(/\u0000/g, '').trim())
        return false;
    // replaceText 中不能包含脚注/公式占位符——它们是独立的 XML 元素，
    // 不在 w:t 文本节点中。写入时必须 strip，否则 doc.patch() 会产生乱码。
    const cleanReplaceText = stripNonTextPlaceholders(replaceText);
    // fullText（来自文档树）可能含 OMML 边界残留的零宽字符，而 normalizedSearch
    // 已被剥离。直接剥离 fullText 会破坏偏移量与 segments 的对应关系。
    // 解决：构建"剥离零宽后的 fullText"及其到原始 fullText 的索引映射，
    // 在干净版本上匹配，再把匹配区间换算回原始坐标。
    let cleanFullText = '';
    const indexMap = []; // indexMap[i] = cleanFullText[i] 在原始 fullText 中的位置
    for (let i = 0; i < fullText.length; i++) {
        const ch = fullText[i];
        if (/[\u200B-\u200D\uFEFF]/.test(ch))
            continue;
        indexMap[cleanFullText.length] = i;
        cleanFullText += ch;
    }
    // 末尾哨兵：cleanFullText.length 位置映射到 fullText.length
    indexMap[cleanFullText.length] = fullText.length;
    // 哨兵 → \s* 桥接占位符原来的位置；其余空白折叠为 \s+
    const pattern = escapeRegExp(bridged)
        .replace(/\u0000/g, '\\s*')
        .replace(/[\s\u200B-\u200D\uFEFF]+/g, '\\s+');
    const regex = new RegExp(pattern);
    const match = cleanFullText.match(regex);
    if (!match || match.index === undefined)
        return false;
    // 把 cleanFullText 坐标换算回原始 fullText 坐标
    // matchStart 取匹配起点的原始位置；matchEnd 取匹配终点对应的原始位置
    // （由于末尾哨兵，indexMap[matchEnd in clean] 会指向原始 fullText 中
    //   匹配段最后一个字符的下一个位置，可能跨越若干被剥离的零宽字符——
    //   这正是我们想要的，回写时连零宽脏字符一并清除）
    const matchStart = indexMap[match.index];
    const cleanEnd = match.index + match[0].length;
    const matchEnd = indexMap[cleanEnd];
    // 找出被匹配覆盖的文本片段
    const affected = segments.filter(s => s.start < matchEnd && s.end > matchStart);
    if (affected.length === 0)
        return false;
    if (affected.length === 1) {
        // 匹配在单个文本节点内——直接做字符串替换
        const seg = affected[0];
        const localStart = matchStart - seg.start;
        const localEnd = matchEnd - seg.start;
        seg.node.props.text = seg.text.slice(0, localStart) + cleanReplaceText + seg.text.slice(localEnd);
        return true;
    }
    // 匹配跨越多个文本节点：按各节点被消耗的字符数比例分配替换文本
    const consumedLengths = affected.map(seg => {
        return Math.min(seg.end, matchEnd) - Math.max(seg.start, matchStart);
    });
    const totalConsumed = consumedLengths.reduce((a, b) => a + b, 0);
    if (totalConsumed === 0)
        return false;
    let replaceCursor = 0;
    for (let i = 0; i < affected.length; i++) {
        const seg = affected[i];
        const isLast = i === affected.length - 1;
        const localMatchStart = Math.max(0, matchStart - seg.start);
        const localMatchEnd = Math.min(seg.text.length, matchEnd - seg.start);
        let replacementPortion;
        if (isLast) {
            // 最后一个片段取剩余全部
            replacementPortion = cleanReplaceText.slice(replaceCursor);
        }
        else {
            // 按比例截取
            const portionLength = Math.round((cleanReplaceText.length * consumedLengths[i]) / totalConsumed);
            replacementPortion = cleanReplaceText.slice(replaceCursor, replaceCursor + portionLength);
            replaceCursor += portionLength;
        }
        seg.node.props.text =
            seg.text.slice(0, localMatchStart) + replacementPortion + seg.text.slice(localMatchEnd);
    }
    return true;
}
// ====== 树遍历辅助函数 ======
/**
 * 递归收集一个节点下的所有段落节点（包括表格单元格、文本框内的段落）。
 */
function collectAllParagraphs(node, result = []) {
    if (!node || !node.children)
        return result;
    for (const child of node.children) {
        if (child.type === 'paragraph') {
            result.push(child);
        }
        else if (child.type === 'table') {
            for (const row of child.children || []) {
                if (row.type === 'table-row') {
                    for (const cell of row.children || []) {
                        if (cell.type === 'table-cell') {
                            collectAllParagraphs(cell, result);
                        }
                    }
                }
            }
        }
        else if (child.type === 'text-box') {
            collectAllParagraphs(child, result);
        }
    }
    return result;
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
async function replaceTextInDocx(inputPath, outputPath, replacements) {
    const sanitizedReplacements = replacements.filter(item => item && item.original && item.suggested !== undefined);
    const doc = await loadDocx(inputPath);
    let appliedCount = 0;
    const unmatched = [];
    // 一次取树，批量应用所有替换，最后一次 patch
    const tree = doc.toComponentTree();
    // 收集所有文档部件中的段落（body / header / footer 等）
    const allParagraphs = [];
    for (const part of tree.children) {
        collectAllParagraphs(part, allParagraphs);
    }
    for (const replacement of sanitizedReplacements) {
        let applied = false;
        for (const paraNode of allParagraphs) {
            if (needsRunLevelReplacement(paraNode)) {
                // 含上下角标或脚注/尾注：run 级别替换，保留格式
                applied = replaceInParagraphRuns(paraNode, replacement.original, replacement.suggested);
            }
            else {
                // 普通段落：整段文本替换（兼容 tab / break）
                const currentText = paraNode.props.text || '';
                const result = replaceFirstWhitespaceInsensitive(currentText, replacement.original, replacement.suggested);
                if (result.count > 0) {
                    paraNode.props.text = result.text;
                    applied = true;
                }
            }
            if (applied) {
                appliedCount += 1;
                break;
            }
        }
        if (!applied) {
            unmatched.push(replacement);
        }
    }
    if (appliedCount > 0) {
        doc.patch(tree);
    }
    await doc.saveAs(outputPath);
    console.log('[exportCorrectedDocx] export finished:', {
        inputPath,
        outputPath,
        totalReplacements: sanitizedReplacements.length,
        appliedCount,
        unmatchedCount: unmatched.length,
        unmatched
    });
}
