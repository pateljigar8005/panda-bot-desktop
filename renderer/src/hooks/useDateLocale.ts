import { enUS, zhCN, zhTW } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { useUiStore } from '@/store/uiStore'
import type { Language } from '@/store/uiStore'

const DATE_FNS_LOCALES: Record<Language, Locale> = { en: enUS, 'zh-CN': zhCN, 'zh-TW': zhTW }

/** date-fns locale matching the app's current language setting. */
export function useDateLocale(): Locale {
  return useUiStore((s) => DATE_FNS_LOCALES[s.language])
}
