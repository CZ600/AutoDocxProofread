import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // dsh-plugin 是独立包，测试跑在 node --test 上（见 dsh-plugin/package.json）
    exclude: ['**/node_modules/**', 'dsh-plugin/**']
  }
})
