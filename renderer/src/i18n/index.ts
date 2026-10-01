import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'

/** Read the persisted language synchronously (same storage as useUiStore) so there's no flash of English on launch. */
function initialLanguage(): string {
  try {
    const raw = localStorage.getItem('ui-store')
    const language = raw ? JSON.parse(raw).state?.language : null
    return typeof language === 'string' ? language : 'en'
  } catch {
    return 'en'
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-CN': { translation: zhCN }, 'zh-TW': { translation: zhTW } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
})

export default i18n
