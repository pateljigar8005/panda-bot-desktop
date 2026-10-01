import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import {
  codeLabel,
  domainLabel,
  type EventFilter,
  LogEntry,
  Stat,
  type StatusFilter,
  useEventOptions,
  useRanges,
  useSorts,
  useStatuses,
} from '@/components/shared/HeartbeatLogDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { PlaceholderCard } from '@/components/shared/PlaceholderCard'
import { SelectField } from '@/components/shared/SelectField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivityLog, useClearActivityLog } from '@/hooks/useActivity'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'
import type { HeartbeatLogSort } from '@/types'

const LIMIT = 20 // entries per page

export default function LiveMonitor() {
  const { t } = useTranslation()
  const RANGES = useRanges()
  const SORTS = useSorts()
  const STATUSES = useStatuses()
  const EVENTS = useEventOptions()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [event, setEvent] = useState<EventFilter>('all')
  const [range, setRange] = useState('60')
  const [accountId, setAccountId] = useState('')
  const [code, setCode] = useState('')
  const [domain, setDomain] = useState('')
  const [sort, setSort] = useState<HeartbeatLogSort>('newest')
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), 400)
  const [page, setPage] = useState(1)
  const withReset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  const clear = useClearActivityLog()
  const [confirmClear, setConfirmClear] = useState(false)

  const logs = useActivityLog({
    rangeMinutes: Number(range),
    event: event === 'all' ? undefined : event,
    success: status === 'all' ? undefined : status === 'success',
    accountId: accountId || undefined,
    code: code || undefined,
    apiBase: domain || undefined,
    q: q || undefined,
    sort,
    page,
    limit: LIMIT,
  })

  const s = logs.data?.stats
  const entries = logs.data?.logs
  const pg = logs.data?.pagination
  const rate = s && s.total ? Math.round((s.success / s.total) * 100) : null
  const rangeShort = RANGES.find((r) => r.value === range)?.short ?? ''
  const filtersActive = status !== 'all' || event !== 'all' || !!accountId || !!code || !!domain || !!q || sort !== 'newest'
  // Keep a selected code visible even if it no longer occurs in the chosen window
  const codeOptions = [...new Set([...(logs.data?.codes ?? []), ...(code ? [code] : [])])].map((c) => ({ value: c, label: codeLabel(c, t) }))
  const accountOptions = (logs.data?.accounts ?? []).map((a) => ({ value: a.accountId, label: a.accountName ?? a.accountId }))

  const resetFilters = () => {
    setStatus('all')
    setEvent('all')
    setAccountId('')
    setCode('')
    setDomain('')
    setSort('newest')
    setSearch('')
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title={t('liveMonitor.title')}
        description={t('liveMonitor.description')}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => logs.refetch()} disabled={logs.isFetching}>
              <RefreshCw className={cn(logs.isFetching && 'animate-spin')} /> {t('common.refresh')}
            </Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)}>
              <Trash2 /> {t('common.clear')}
            </Button>
          </>
        }
      />

      <PlaceholderCard title={t('liveMonitor.eventStream')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {logs.isLoading ? (
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[62px]" />)
            ) : (
              <>
                <Stat label={t('liveMonitor.statTotalLifetime')} value={s?.total ?? 0} />
                <Stat label={t('liveMonitor.statSucceededLifetime')} value={s?.success ?? 0} tone="good" />
                <Stat label={t('liveMonitor.statFailedLifetime')} value={s?.failed ?? 0} tone={s?.failed ? 'bad' : undefined} />
                <Stat label={t('heartbeatLog.statSuccessRate')} value={rate === null ? '—' : `${rate}%`} tone={rate !== null && rate < 95 ? 'bad' : undefined} />
                <Stat label={t('heartbeatLog.statAvgLatency')} value={s?.avgLatency ? t('heartbeatLog.ms', { ms: Math.round(s.avgLatency) }) : '—'} />
              </>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t('heartbeatLog.filterByStatus')}>
                {STATUSES.map((f) => (
                  <Button
                    key={f.value}
                    size="sm"
                    variant={status === f.value ? 'secondary' : 'ghost'}
                    className="h-7"
                    onClick={() => withReset(setStatus)(f.value)}
                    aria-pressed={status === f.value}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              <SelectField value={range} onChange={withReset(setRange)} options={RANGES} className="h-8 w-36" aria-label={t('heartbeatLog.timeRange')} />
              <SelectField value={event} onChange={(v) => withReset(setEvent)(v as EventFilter)} options={EVENTS} className="h-8 w-40" aria-label={t('heartbeatLog.eventType')} />
              <SelectField value={accountId} onChange={withReset(setAccountId)} options={accountOptions} emptyLabel={t('liveMonitor.allAccounts')} className="h-8 w-44" aria-label={t('liveMonitor.filterByAccount')} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder={t('liveMonitor.searchPlaceholder')}
                  aria-label={t('liveMonitor.searchPlaceholder')}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <SelectField value={code} onChange={withReset(setCode)} options={codeOptions} emptyLabel={t('heartbeatLog.allCodes')} className="h-8 w-56" aria-label={t('heartbeatLog.filterByCode')} />
              <SelectField
                value={domain}
                onChange={withReset(setDomain)}
                options={[...new Set([...(logs.data?.domains ?? []), ...(domain ? [domain] : [])])].map((d) => ({ value: d, label: domainLabel(d) }))}
                emptyLabel={t('heartbeatLog.allDomains')}
                className="h-8 w-52"
                aria-label={t('heartbeatLog.filterByDomain')}
              />
              <SelectField value={sort} onChange={(v) => withReset(setSort)(v as HeartbeatLogSort)} options={SORTS} className="h-8 w-36" aria-label={t('heartbeatLog.sortLabel')} />
              {filtersActive && (
                <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={resetFilters}>
                  <X /> {t('common.reset')}
                </Button>
              )}
            </div>
          </div>

          {logs.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t('liveMonitor.couldNotLoad', { error: getErrorMessage(logs.error) })}</AlertDescription>
            </Alert>
          ) : logs.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : !entries?.length ? (
            <div className="space-y-1 py-8 text-center text-sm text-muted-foreground">
              <p>{filtersActive ? t('liveMonitor.noneMatchFilters', { range: rangeShort }) : t('liveMonitor.noActivity', { range: rangeShort })}</p>
              {/* The stats above are lifetime, not scoped to the time range — an empty list here with
                  non-zero lifetime stats just means the matching events are outside the current window. */}
              {Boolean(s?.total) && <p>{t('liveMonitor.lifetimeTotalHint', { count: s!.total })}</p>}
            </div>
          ) : (
            <ul className={cn('max-h-[32rem] divide-y overflow-y-auto pr-1', logs.isFetching && 'opacity-80')}>
              {entries.map((log) => (
                <LogEntry key={log._id} log={log} showAccount />
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {pg && pg.total > 0
                ? t('heartbeatLog.showingEntries', { from: (pg.page - 1) * pg.limit + 1, to: Math.min(pg.page * pg.limit, pg.total), total: pg.total.toLocaleString() })
                : t('heartbeatLog.noEntries')}{' '}
              · {t('heartbeatLog.keptDays')}
            </span>
            {pg && pg.pages > 1 && (
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || logs.isFetching} aria-label={t('dataTable.previousPage')}>
                  <ChevronLeft />
                </Button>
                <span className="px-1 tabular-nums">
                  {t('dataTable.pageOf', { page: pg.page, pages: pg.pages })}
                </span>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setPage((p) => p + 1)} disabled={page >= pg.pages || logs.isFetching} aria-label={t('dataTable.nextPage')}>
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        </div>
      </PlaceholderCard>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('liveMonitor.clearTitle')}
        description={t('liveMonitor.clearDescription')}
        confirmLabel={t('heartbeatLog.deletePermanently')}
        loading={clear.isPending}
        onConfirm={() =>
          clear.mutate(undefined, {
            onSuccess: ({ deletedCount }) => {
              toast.success(t('heartbeatLog.deletedEntries', { count: deletedCount }))
              setConfirmClear(false)
              setPage(1)
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  )
}
