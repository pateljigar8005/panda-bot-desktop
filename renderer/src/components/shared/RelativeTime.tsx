import { format, type Locale } from 'date-fns'
import { enUS } from 'date-fns/locale'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useNow } from '@/hooks/useNow'
import { useDateLocale } from '@/hooks/useDateLocale'

/** Exact timestamp with seconds, e.g. "Oct 1, 2026, 2:15:07 PM" (localized when a locale is given). */
export const formatExact = (iso: string, locale: Locale = enUS) => format(new Date(iso), 'PPpp', { locale })

/** Compact age with seconds: "8s ago", "3m 20s ago", "2h 5m ago", "3d 4h ago" (localized via t). */
export function formatAgo(iso: string, now: number, t: TFunction) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return t('time.secondsAgo', { s })
  const m = Math.floor(s / 60)
  if (m < 60) return t('time.minutesSecondsAgo', { m, s: s % 60 })
  const h = Math.floor(m / 60)
  if (h < 24) return t('time.hoursMinutesAgo', { h, m: m % 60 })
  const d = Math.floor(h / 24)
  return t('time.daysHoursAgo', { d, h: h % 24 })
}

interface RelativeTimeProps {
  iso?: string | null
  /** Also show the exact timestamp before the relative age. */
  showExact?: boolean
  fallback?: string
}

/** Live-updating (every second) relative time; hover shows the exact time with seconds. */
export function RelativeTime({ iso, showExact = false, fallback = '—' }: RelativeTimeProps) {
  const now = useNow()
  const locale = useDateLocale()
  const { t } = useTranslation()
  if (!iso) return <>{fallback}</>
  const exact = formatExact(iso, locale)
  const ago = formatAgo(iso, now, t)
  return (
    <time dateTime={iso} title={exact} className="tabular-nums">
      {showExact ? `${exact} (${ago})` : ago}
    </time>
  )
}
