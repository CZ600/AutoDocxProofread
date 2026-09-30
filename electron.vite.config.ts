import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'

// 统一的 Electron + Vue3 + Vite 构建配置（替代原 forge + 4 个独立 vite 配置）
// 三入口：main / preload / renderer，由 electron-vite 编排，产物输出到 out/{main,preload,renderer}
export default defineConfig({
  main: {
    build: {
      // main 入口：src/main/main.ts（electron-vite 默认找 src/main/index.ts，需显式指定）
      rollupOptions: {
        input: resolve(__dirname, 'src/main/main.ts')
      }
    },
    resolve: {
      // 优先加载 ESM 入口（与原 vite.main.config.ts 保持一致）
      mainFields: ['module', 'jsnext:main', 'jsnext']
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      // preload 入口：src/main/preload.ts（项目放在 src/main/ 下而非默认的 src/preload/，需显式指定）
      rollupOptions: {
        input: resolve(__dirname, 'src/main/preload.ts')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // 入口 HTML 在项目根目录 index.html，而非默认的 src/renderer/index.html，需把 root 指向项目根
    root: resolve(__dirname),
    base: './',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        },
        output: {
          // vendor 拆包：element-plus / vue 全家 / 其余三方各自成 chunk，
          // 业务代码更新时这三块走缓存，不必随业务重新下载
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }
            // 兼容 Windows 反斜杠与 POSIX 正斜杠路径
            const normalized = id.replaceAll('\\', '/')
            if (normalized.includes('/node_modules/element-plus/') || normalized.includes('/node_modules/@element-plus/')) {
              return 'element-plus'
            }
            if (
              /[\\/]node_modules[\\/](vue|@vue|vue-router|pinia|pinia-plugin-persistedstate|vue-demi|vue-i18n|@intlify|@vueuse)[\\/]/.test(
                normalized
              )
            ) {
              return 'vue-vendor'
            }
            return 'vendor'
          }
        }
      }
    },
    resolve: {
      preserveSymlinks: true,
      alias: {
        // 强制使用 runtime-only 版本，去掉 vue-i18n 的编译器，减小体积
        'vue-i18n': resolve(__dirname, 'node_modules/vue-i18n/dist/vue-i18n.runtime.mjs')
      }
    },
    plugins: [
      vue(),
      VueI18nPlugin({
        include: resolve(__dirname, 'src/renderer/i18n/locales/**')
      })
    ]
  }
})
