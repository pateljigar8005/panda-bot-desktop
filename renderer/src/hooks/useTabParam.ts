import { useSearchParams } from 'react-router-dom'

/**
 * Keeps the selected tab in the URL (?tab=…) so it survives a refresh and can be linked to.
 * Unknown values fall back to the default; the default tab is left out of the URL.
 * Uses `replace`, so switching tabs doesn't add browser-history entries (Back leaves the page).
 */
export function useTabParam<T extends string>(tabs: readonly T[], defaultTab: T, param = 'tab') {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(param)
  const tab = tabs.includes(raw as T) ? (raw as T) : defaultTab

  const setTab = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === defaultTab) params.delete(param)
        else params.set(param, next)
        return params
      },
      { replace: true },
    )
  }

  return [tab, setTab] as const
}
