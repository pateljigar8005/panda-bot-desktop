import { useEffect } from 'react'
import i18n from '@/i18n'
import { useUiStore } from '@/store/uiStore'

/** Keeps i18next in sync with the persisted language preference (useUiStore). */
export function useLanguageEffect() {
  const language = useUiStore((s) => s.language)

  useEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language)
  }, [language])
}
