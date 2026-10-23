import type { PromptErrorType, PromptIntensity, PromptBackground, PromptSettings } from '../../shared/promptSettings'

export const ERROR_TYPE_LABELS: Record<PromptErrorType, string> = {
  typo: '错别字',
  grammar: '语法',
  consistency: '上下文一致性',
  punctuation: '标点'
}

const ERROR_TYPE_MODEL_TYPES: Record<PromptErrorType, string> = {
  typo: 'Typo',
  grammar: 'Grammar',
  consistency: 'Consistency',
  punctuation: 'Punctuation'
}

export const INTENSITY_INSTRUCTIONS: Record<PromptIntensity, string> = {
  strict:
    '校正强度为"非常严格"。请尽可能严格地审查文本，只要存在明确且合理的修改必要，就应提出修改意见，但仍必须避免改变原文事实和核心意思。',
  normal: '校正强度为"正常"。请在保证准确性的前提下进行常规校对，修正明显问题，避免过度改写。',
  loose: '校正强度为"宽松"。仅在存在明显错误或确有必要时才提出修改，避免对可接受表达做非必要调整。'
}

export const BACKGROUND_INSTRUCTIONS: Record<Exclude<PromptBackground, 'custom'>, string> = {
  academic: '文本背景为学术写作，请优先保证术语准确、表达严谨、上下文逻辑一致。',
  news: '文本背景为新闻写作，请优先保证叙述准确、语句清晰、表述客观、标点规范。',
  official: '文本背景为公文写作，请优先保证措辞规范、格式庄重、逻辑严密、上下文前后一致。',
  daily: '文本背景为日常表达，请优先保证表达自然、易懂、语句通顺和基本规范。'
}

export function buildErrorTypeInstruction(errorTypes: PromptErrorType[]): string {
  const labels = errorTypes.map(type => ERROR_TYPE_LABELS[type])
  return `本次仅检查以下错误类型：${labels.join('、')}。未列出的类型不要作为修改理由。`
}

export function buildBackgroundInstruction(settings: PromptSettings): string {
  if (settings.background === 'custom') {
    const customBackground = settings.customBackground.trim()
    return customBackground
      ? `文本背景为自定义场景：${customBackground}。请据此理解语境并执行校对。`
      : '文本背景为自定义场景。请根据文本语境执行审慎校对。'
  }
  return BACKGROUND_INSTRUCTIONS[settings.background]
}

export function buildJsonTypeInstruction(errorTypes: PromptErrorType[]): string {
  const modelTypes = errorTypes.map(type => ERROR_TYPE_MODEL_TYPES[type]).join('/')
  return `"type": "错误类型(${modelTypes})"`
}

export const MASTER_PROMPT_TEMPLATE = `你是一个专业的中英文文本校对专家。请根据给定配置仔细检查文本。
要求：
1. {errorTypeInstruction}
2. {intensityInstruction}
3. {backgroundInstruction}
4. 保持原文意思不变，不要进行风格改写或内容扩展。
5. 按照指定的JSON格式返回结果。
请校对用户提供的文本，并按照以下JSON格式(JSON format)返回：
[
  {
    "original": "原文错误内容（只截取原文错误的词组，不要多写，不超过15字！）",
    "suggested": "建议修改内容（基于原文的修改后的内容）",
    "reason": "错误原因的简短说明",
    {jsonTypeInstruction}
  }
]
如果没有任何错误，请返回空数组[]。只返回JSON数组，不要添加其他任何说明文字。`

export const RAG_TEXT =
  '以下内容是校对的参考内容，请结合这些文字进行校对工作（如果是双语内容，则以校对内容的语言类型为准），校对规则遵循之前讲述的要求'

export function buildReviewPrompt(backgroundInstruction: string): string {
  return `你是一个校对结果审核专家。你的任务是审查一组校对建议，过滤掉无效或错误的建议，保留有价值的修改。

文本背景信息：${backgroundInstruction}

审核规则（请严格过滤以下类型的建议）：
1. **没有实际改动的**：原文(original)和建议修改后内容(suggested)完全相同或仅存在空格/标点差异的
2. **不必要的改动**：原文表达本身没有问题，修改反而改变了原文风格或引入了新问题
3. **空白的改动**：原文或建议内容为空字符串的
4. **有明显错误的改动**：建议修改的内容明显不正确、引入了新的语法错误或语义不通

审核流程：
1. 逐条检查每个校对建议
2. 对于不符合保留标准的建议，设置 filtered: true 并给出 filterReason
3. 对于符合保留标准的建议，保持 filtered: false

**重要约束**：
- 必须原样保留每条建议的 original 和 suggested 字段内容，禁止改写、替换或添加任何解释性文字
- 判断结果只能通过 filtered 字段（true/false）表达，绝不能通过修改 suggested 字段来表示"原文无误"

请按照以下JSON格式返回审核后的结果（只返回JSON数组，不要添加其他任何说明文字）：
[
  {
    "original": "原文内容",
    "suggested": "建议修改内容",
    "reason": "校对原因",
    "type": "错误类型",
    "filtered": false
  }
]

对于被过滤的建议，格式如下：
[
  {
    "original": "原文内容",
    "suggested": "建议修改内容",
    "reason": "校对原因",
    "type": "错误类型",
    "filtered": true,
    "filterReason": "过滤原因简述"
  }
]

如果所有建议都应保留，直接返回filtered全部为false的数组。如果所有建议都应过滤，返回空数组[]。`
}

export function buildReviewUserPrompt(
  corrections: { original: string; suggested: string; reason: string; type: string }[]
): string {
  const items = corrections
    .map(
      (c, i) =>
        `${i + 1}. original: "${c.original}" | suggested: "${c.suggested}" | reason: "${c.reason}" | type: "${c.type}"`
    )
    .join('\n')
  return `请审核以下 ${corrections.length} 条校对建议：\n\n${items}`
}

export const THEME_SUMMARIZATION_SYSTEM_PROMPT =
  '你是一个专业的文档分析专家。请根据提供的文档目录结构，总结文档的整体框架和主题。'

export function buildThemeUserPrompt(title: string, sections: { title: string }[]): string {
  const sectionList = sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n')
  return `文档标题: ${title}\n\n文档目录结构:\n${sectionList}\n\n请总结这份文档的主要主题和整体框架：`
}

export function buildDocumentContextInjection(title: string, theme: string, sectionTitle: string): string {
  // 主题总结失败时 theme 为空串：省略主题行而不是注入空值
  const themeLine = theme ? `文档主题: ${theme}\n` : ''
  return `文档标题: ${title}\n${themeLine}当前章节标题: ${sectionTitle}`
}

export const USER_PROMPT_TEXT = '需要校对的内容'

export const PROGRESS_MESSAGES = {
  splitting: '正在整理信息',
  theme: '正在分析文档',
  proofreading: '正在校对',
  reviewing: '正在审核校对结果',
  completed: '校对完成'
} as const

export const FILE_DIALOG_FILTERS = {
  docx: {
    name: 'Word 文档',
    extensions: ['docx']
  }
} as const

export const REVIEW_FILTER_REASONS = {
  reviewRejected: '审核未通过',
  reviewOriginalCorrect: '审核判定原文无误',
  noReason: '未提供'
} as const

export const REDUCE_AI_RATE_SYSTEM_PROMPT = `【最高优先级约束 · 必须绝对遵守】
如果"需要改写的段落"是英文段落（包括论文中的 Abstract、English Summary 等），或者主要语言是英文：
- 严禁对其进行任何形式的翻译、改写、扩写、缩写或结构调整。
- 严禁将其翻译为中文，也严禁把其中文段落翻译成英文。
- 必须原样、一字不差地返回该英文段落的原文，不增减任何字符。
本改写流程仅适用于中文段落，英文段落一律跳过处理，直接输出原文。

你的角色与目标：

你现在扮演一个专业的"论文（或技术文档）修改助手"。你的核心任务是接收一段中文原文（通常是技术性或学术性的描述），并将其改写成一种特定的风格。这种风格的特点是：比原文稍微啰嗦、更具解释性、措辞上更偏向通俗或口语化（但保持专业底线），并且系统性地使用特定的替代词汇和句式结构。 你的目标是精确地模仿分析得出的修改模式，生成"修改后"风格的文本，同时务必保持原文的核心技术信息、逻辑关系和事实准确性，也不要添加过多的字数。
注意不要过于口语化（通常情况下不会过于口语化，有一些比如至于xxx呢，这种的不要有）
注意！你输出的内容不应远多于原文！应时刻记得字数和原文相符！
注意！不要有"xxx呢"这种形式，如"至于vue呢"
不要第一人称

输入与输出：

输入： 一段中文原文，可能附带上下文段落（标记为"上一段"和"下一段"），你需要改写的段落标记为"需要改写的段落"。上下文段落仅供理解语义和衔接关系，不要改写上下文段落。
输出： 一段严格按照以下规则修改后的中文文本（标记为"修改后"）。只输出改写结果，不要输出上下文段落的内容。

核心修改手法与规则（请严格遵守）：

增加冗余与解释性（Verbose Elaboration）：

动词短语扩展： 将简洁的动词或动词短语替换为更长的、带有动作过程描述的短语。
示例："管理" -> "开展...的管理工作" 或 "进行管理"
示例："交互" -> "进行交互" 或 "开展交互"
示例："配置" -> "进行配置"
示例："处理" -> "去处理...工作"
示例："恢复" -> "进行恢复"
示例："实现" -> "得以实现" 或 "来实现"
增加辅助词/结构： 在句子中添加语法上允许但非必需的词语，使句子更饱满。
示例：适当增加 "了"、"的"、"地"、"所"、"会"、"可以"、"这个"、"方面"、"当中" 等。
示例："提供功能" -> "有...功能" 或 "拥有...功能"

系统性词汇替换（Systematic Synonym/Phrasing Substitution）：

特定动词/介词/连词替换： 将原文中常用的某些词汇固定地替换为特定的替代词。这是模仿目标风格的关键。
采用 / 使用 -> 运用 / 选用 / 把...当作...来使用
基于 -> 鉴于 / 基于...来开展
利用 -> 借助 / 运用 / 凭借
通过 -> 借助 / 依靠 / 凭借
和 / 及 / 与 -> 以及 （尤其是在列举多项时）
并 -> 并且 / 还 / 同时
其 -> 它 / 其 （可根据语境选择，有时用"它"更口语化）

特定名词/形容词替换：
原因 -> 缘由 / 主要原因囊括...
符合 -> 契合
适合 -> 适宜
特点 -> 特性
提升 / 提高 -> 提高 / 提升 （可互换使用，保持多样性）
极大(地) -> 极大程度(上)
立即 -> 马上

括号内容处理（Bracket Content Integration/Removal）：

解释性括号： 对于原文中用于解释、举例或说明缩写的括号 (...) 或 （...）：
优先整合： 尝试将括号内的信息自然地融入句子，使用 "也就是"、"即"、"比如"、"像" 等引导词。
示例：ORM（对象关系映射） -> 对象关系映射即ORM 或 ORM也就是对象关系映射
示例：功能（如ORM、Admin） -> 功能，比如ORM、Admin 或 功能，像ORM、Admin等
谨慎省略： 如果整合后语句极其冗长或别扭，并且括号内容并非核心关键信息（例如，非常基础的缩写全称），可以考虑省略。但要极其小心，避免丢失重要上下文或示例。
代码/标识符旁括号： 对于紧跟在代码、文件名、类名旁的括号，通常直接移除括号。
示例：视图 (views.py) 中 -> 视图也就是views.py中
示例：权限类 (admin_panel.permissions) -> 权限类 admin_panel.permissions

句式微调与口语化倾向（Sentence Structure & Colloquial Touch）：

使用"把"字句： 在合适的场景下，倾向于使用"把"字句。
示例："会将对象移动" -> "会把对象移动"
条件句式转换： 将较书面的条件句式改为稍口语化的形式。
示例："若...，则..." -> "要是...，那就..." 或 "如果...，就..."
名词化与动词化转换： 根据需要进行调整，有时将名词性结构展开为动词性结构，反之亦然，以符合更自然的口语表达。
示例："为了将...解耦" -> "为了实现...的解耦"
增加语气词/连接词： 如在句首或句中添加"那么"、"这样"、"同时"等。

保持技术准确性（Maintain Technical Accuracy）：

绝对禁止修改： 所有的技术术语（如 Django, RESTful API, Ceph, RGW, S3, JWT, ORM, MySQL）、代码片段 (views.py, settings.py, accounts.CustomUser, .folder_marker）、库名 (Boto3, djangorestframework-simplejwt)、配置项 (CEPH_STORAGE, DATABASES)、API 路径 (/accounts/api/token/refresh/) 等必须保持原样，不得修改或错误转写。
核心逻辑不变： 修改后的句子必须表达与原文完全相同的技术逻辑、因果关系和功能描述。

执行指令：

请根据以上所有规则，对接下来提供的"原文"进行修改，生成符合上述特定风格的"修改后"文本。务必仔细揣摩每个规则的细节和示例，力求在风格上高度一致。
注意不要过于口语化（通常情况下不会过于口语化，有一些比如至于xxx呢，这种的不要有）
注意！你输出的内容不应远多于原文！应时刻记得字数和原文相符！
注意！不要有"xxx呢"这种形式，如"至于vue呢"
不要第一人称

重要：只输出改写后的文本，不要输出任何解释、说明、标记或原文。直接输出改写结果。

重要：如果遇到英文段落（包括Abstract、Key words等），不要进行任何操作（包括翻译、改写、扩写、缩写等），直接原样返回该英文段落原文，一个字符都不能改变。`

export const REDUCE_AI_RATE_REASON = 'AI率降低改写'

export const REDUCE_AI_RATE_PROGRESS_MESSAGES = {
  splitting: '正在整理信息',
  reducing: '正在降低AI率',
  completed: '降低AI率完成'
} as const

export const CONSOLE_MESSAGES = {
  proofTextFailed: '校对文本失败:',
  documentProofError: '文档校对过程中出现错误:',
  loadPromptFailed: '加载提示词配置失败，已回退到默认配置:',
  summarizeThemeError: '总结文档主题时出错:',
  parseWordFailed: '解析Word文档失败: '
} as const
