import { format } from 'date-fns'
import { useNow } from '@/hooks/useNow'

/** Exact timestamp with seconds, e.g. "Oct 1, 2026, 2:15:07 PM". */
export const formatExact = (iso: string) => format(new Date(iso), 'PPpp')

/** Compact age with seconds: "8s ago", "3m 20s ago", "2h 5m ago", "3d 4h ago". */
export function formatAgo(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m ago`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h ago`
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
  if (!iso) return <>{fallback}</>
  const exact = formatExact(iso)
  return (
    <time dateTime={iso} title={exact} className="tabular-nums">
      {showExact ? `${exact} (${formatAgo(iso, now)})` : formatAgo(iso, now)}
    </time>
  )
}
