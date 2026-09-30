import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import './assets/css/tokens.css'
import './assets/css/common.css'
import './assets/css/preview.css'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { setupI18n } from './i18n'
import { useLocaleStore } from './stores/localeStore'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(router)
app.use(pinia)

const i18n = setupI18n()
app.use(i18n)

const localeStore = useLocaleStore()
i18n.global.locale.value = localeStore.locale
// 启动时把持久化的 locale 同步给主进程，保证首次校对即使用正确语言的提示词。
// （主进程 currentLocale 默认硬编码为 'zh-CN'，否则重启后会与界面语言不一致。）
localeStore.syncLocale()

app.use(ElementPlus)

app.mount('#app')
