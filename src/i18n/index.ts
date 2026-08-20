import { createI18n } from 'vue-i18n'
import enUS from '@/locales/en-US'
import zhCN from '@/locales/zh-CN'

export const LANGUAGE_STORAGE_KEY = 'robot-language'
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as AppLocale)
}

function initialLocale(): AppLocale {
  if (typeof localStorage === 'undefined') return 'zh-CN'
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return isAppLocale(stored) ? stored : 'zh-CN'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

export function persistLocale(locale: AppLocale) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, locale)
  document.documentElement.lang = locale
}

export function initializeDocumentLocale() {
  document.documentElement.lang = i18n.global.locale.value
}
