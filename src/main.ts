import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { i18n, initializeDocumentLocale } from './i18n'
import router from './router'
import './styles/tokens.css'
import './styles/base.css'

initializeDocumentLocale()

createApp(App)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .use(ElementPlus, { size: 'small' })
  .mount('#app')
