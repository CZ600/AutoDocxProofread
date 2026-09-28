module.exports = {
  // 必须显式指定：extends 里的 @typescript-eslint/recommended 会把顶层 parser
  // 覆盖为 TS parser，导致所有 .vue 文件按纯 TS 解析报 Parsing error
  parser: 'vue-eslint-parser',
  parserOptions: {
    // <script> 块内仍用 TS parser 解析
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2020,
    sourceType: 'module',
    extraFileExtensions: ['.vue']
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  rules: {
    // 降低缩进错误严重性为警告，并设置缩进为2个空格
    'indent': ['warn', 2],
    // 允许在Vue模板中使用任意缩进（switchCase / alignAttributesVertically 为 eslint-plugin-vue 的合法选项名）
    'vue/html-indent': ['warn', 2, {
      'attribute': 1,
      'baseIndent': 1,
      'switchCase': 1,
      'closeBracket': 0,
      'alignAttributesVertically': false,
      'ignores': []
    }]
  }
};