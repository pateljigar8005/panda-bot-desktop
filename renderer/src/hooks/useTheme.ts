import { useEffect } from 'react'
import { useUiStore } from '@/store/uiStore'

/** Applies the `dark` class to <html>, following system preference when theme === 'system'. */
export function useThemeEffect() {
  const theme = useUiStore((s) => s.theme)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mql.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [theme])
}
