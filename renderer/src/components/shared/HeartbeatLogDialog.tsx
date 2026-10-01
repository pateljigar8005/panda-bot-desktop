import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, Trash2, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { IconAction } from '@/components/shared/IconAction'
import { SelectField } from '@/components/shared/SelectField'
import { formatExact, RelativeTime } from '@/components/shared/RelativeTime'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useClearHeartbeatLogs, useHeartbeatLogs } from '@/hooks/useAccounts'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'
import type { Account, HeartbeatLog, HeartbeatLogSort } from '@/types'

const LOG_LIMIT = 10 // entries per page

// The only GET among the logged platform calls (see platformClient.js USER_INFO_ENDPOINT)
const USER_INFO_ENDPOINT = '/yewu12/user/getUserInfoPB'

/** "https://api.3qttu0s.com" → "api.3qttu0s.com" (port kept). */
export const domainLabel = (apiBase: string) => {
  try {
    return new URL(apiBase).host
  } catch {
    return apiBase
  }
}

/** Our error, else the platform's own message (e.g. { code, msg: 'token invalid' }), else a generic line. */
function errorText(log: HeartbeatLog, t: TFunction) {
  if (log.errorMessage) return log.errorMessage
  const body = log.responseBody as { msg?: unknown; message?: unknown } | null | undefined
  const platformMsg = body?.msg ?? body?.message
  if (typeof platformMsg === 'string' && platformMsg) return t('heartbeatLog.platformMessage', { message: platformMsg })
  return log.event === 'setup' ? t('heartbeatLog.setupFailed') : t('heartbeatLog.heartbeatRejected')
}

/** Plain-language hints for platform codes/errors we know about. */
function hintFor(log: HeartbeatLog, t: TFunction) {
  if (log.responseCode === '0401013') return t('heartbeatLog.hintTokenExpired')
  if (log.responseCode === '401') return t('heartbeatLog.hintUnauthorized')
  const msg = log.errorMessage ?? ''
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return t('heartbeatLog.hintHostNotFound')
  if (/ECONNREFUSED/.test(msg)) return t('heartbeatLog.hintConnectionRefused')
  if (/timeout|ETIMEDOUT/i.test(msg)) return t('heartbeatLog.hintTimedOut')
  if (/decryption failed/i.test(msg)) return t('heartbeatLog.hintDecryptionFailed')
  return null
}

export function Stat({ label, value, tone, hint }: { label: string; value: string | number; tone?: 'good' | 'bad'; hint?: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-semibold tabular-nums', tone === 'good' && 'text-success', tone === 'bad' && 'text-destructive')}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

/** Request/response detail for one log entry, in its own popup instead of expanding the row. */
function LogDetailDialog({ log, open, onOpenChange }: { log: HeartbeatLog; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {log.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
            {formatExact(log.createdAt)}
          </DialogTitle>
          {!log.success && <DialogDescription className="text-destructive">{errorText(log, t)}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          {log.apiBase && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{t('heartbeatLog.requestUrl')}</div>
              <div className="break-all rounded-md bg-muted p-2 font-mono text-xs">
                {log.endpoint === USER_INFO_ENDPOINT ? 'GET' : 'POST'} {log.apiBase}
                {log.endpoint ?? ''}
              </div>
            </div>
          )}
          <Json label={t('heartbeatLog.response')} value={log.responseBody} />
          <Json label={t('heartbeatLog.requestRedacted')} value={log.requestPayload} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function LogEntry({ log, showAccount = false }: { log: HeartbeatLog; showAccount?: boolean }) {
  const { t } = useTranslation()
  const [detailOpen, setDetailOpen] = useState(false)
  const hint = log.success ? null : hintFor(log, t)
  const hasDetails = log.responseBody != null || log.requestPayload != null

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {log.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
          <time dateTime={log.createdAt} className="tabular-nums">
            {formatExact(log.createdAt)}
          </time>
          {showAccount && log.accountName && (
            <Link to={`/accounts/${log.accountId}`} className="text-sm font-medium hover:underline">
              {log.accountName}
            </Link>
          )}
          {log.event === 'setup' && (
            <Badge variant="outline" className="border-warning/50 text-warning" title={t('heartbeatLog.setupTitle')}>
              {t('heartbeatLog.setup')}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {log.apiBase && (
            <Badge variant="secondary" className="font-mono font-normal" title={t('heartbeatLog.sentTo', { url: `${log.apiBase}${log.endpoint ?? ''}` })}>
              {domainLabel(log.apiBase)}
            </Badge>
          )}
          {log.statusCode != null && <Badge variant="outline">{t('heartbeatLog.http', { code: log.statusCode })}</Badge>}
          {log.responseCode && <Badge variant="outline">{t('heartbeatLog.code', { code: log.responseCode })}</Badge>}
          {log.latencyMs != null && <Badge variant="secondary">{t('heartbeatLog.ms', { ms: log.latencyMs })}</Badge>}
          {(hasDetails || log.apiBase) && <IconAction label={t('heartbeatLog.viewResponseRequest')} icon={Eye} onClick={() => setDetailOpen(true)} />}
        </div>
      </div>

      {log.success && log.event === 'setup' && (
        <p className="pl-6 text-sm text-muted-foreground">{t('heartbeatLog.setupSucceeded')}</p>
      )}

      {!log.success && (
        <div className="space-y-1 pl-6 text-sm">
          <p className="break-words font-medium text-destructive">{errorText(log, t)}</p>
          {hint && <p className="text-muted-foreground">{hint}</p>}
        </div>
      )}

      {(hasDetails || log.apiBase) && <LogDetailDialog log={log} open={detailOpen} onOpenChange={setDetailOpen} />}
    </li>
  )
}

const RANGE_VALUES = ['15', '60', '360', '1440', '10080'] as const
/** Translated on every call, so it stays correct across a live language switch (not a module-level constant). */
export function useRanges() {
  const { t } = useTranslation()
  return RANGE_VALUES.map((value) => ({ value, label: t(`heartbeatLog.rangeLabel.${value}`), short: t(`heartbeatLog.rangeShort.${value}`) }))
}

const SORT_VALUES = ['newest', 'oldest', 'slowest'] as const
export function useSorts() {
  const { t } = useTranslation()
  return SORT_VALUES.map((value) => ({ value, label: t(`heartbeatLog.sort.${value}`) }))
}

const STATUS_VALUES = ['all', 'success', 'failed'] as const
export type StatusFilter = (typeof STATUS_VALUES)[number]
export function useStatuses() {
  const { t } = useTranslation()
  return STATUS_VALUES.map((value) => ({ value, label: t(`heartbeatLog.statusFilter.${value}`) }))
}

export const NO_CODE = 'none'
/** code === '0000000' -> "0000000 · OK"; unrecognised codes show as-is. */
export function codeLabel(code: string, t: TFunction) {
  if (code === NO_CODE) return t('heartbeatLog.codeNone')
  const known = code === '0000000' ? t('heartbeatLog.codeOk') : code === '0401013' ? t('heartbeatLog.codeTokenExpired') : null
  return known ? `${code} · ${known}` : code
}

const EVENT_VALUES = ['all', 'heartbeat', 'setup'] as const
export type EventFilter = (typeof EVENT_VALUES)[number]
export function useEventOptions() {
  const { t } = useTranslation()
  return EVENT_VALUES.map((value) => ({ value, label: t(`heartbeatLog.eventFilter.${value}`) }))
}

interface HeartbeatLogPanelProps {
  account: Account
  /** Only fetch while visible (dialog open / tab selected). */
  enabled: boolean
  initialEvent?: EventFilter
  /** Scroll area height for the entries list. */
  listClassName?: string
}

/** Stats, filters and the paged heartbeat/setup log for one account. Used in the log dialog and the Activity Log tab. */
export function HeartbeatLogPanel({ account, enabled, initialEvent = 'all', listClassName = 'max-h-[45vh]' }: HeartbeatLogPanelProps) {
  const { t } = useTranslation()
  const RANGES = useRanges()
  const SORTS = useSorts()
  const STATUSES = useStatuses()
  const EVENTS = useEventOptions()
  const [status, setStatus] = useState<StatusFilter>((account.consecutiveFailures ?? 0) > 0 || initialEvent === 'setup' ? 'failed' : 'all')
  const [event, setEvent] = useState<EventFilter>(initialEvent)
  const [range, setRange] = useState('1440')
  const [code, setCode] = useState('')
  const [domain, setDomain] = useState('')
  const [sort, setSort] = useState<HeartbeatLogSort>('newest')
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), 400)
  const [page, setPage] = useState(1)
  // Any filter change goes back to page 1
  const withReset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  const logs = useHeartbeatLogs(
    account._id,
    {
      rangeMinutes: Number(range),
      event: event === 'all' ? undefined : event,
      success: status === 'all' ? undefined : status === 'success',
      code: code || undefined,
      apiBase: domain || undefined,
      q: q || undefined,
      sort,
      page,
      limit: LOG_LIMIT,
    },
    enabled,
  )
  const clear = useClearHeartbeatLogs()
  const [confirmClear, setConfirmClear] = useState(false)
  const s = logs.data?.stats
  const entries = logs.data?.logs
  const pg = logs.data?.pagination
  const rate = s && s.total ? Math.round((s.success / s.total) * 100) : null
  const rangeShort = RANGES.find((r) => r.value === range)?.short ?? ''
  const filtersActive = status !== 'all' || event !== 'all' || !!code || !!domain || !!q || sort !== 'newest'
  // Keep a selected code visible even if it no longer occurs in the chosen window
  const codeOptions = [...new Set([...(logs.data?.codes ?? []), ...(code ? [code] : [])])].map((c) => ({ value: c, label: codeLabel(c, t) }))

  const resetFilters = () => {
    setStatus('all')
    setEvent('all')
    setCode('')
    setDomain('')
    setSort('newest')
    setSearch('')
    setPage(1)
  }

  return (
    <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {logs.isLoading ? (
            Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[62px]" />)
          ) : (
            <>
              <Stat label={t('heartbeatLog.statTotal', { range: rangeShort })} value={s?.total ?? 0} />
              <Stat label={t('heartbeatLog.statSucceeded', { range: rangeShort })} value={s?.success ?? 0} tone="good" />
              <Stat
                label={t('heartbeatLog.statFailed', { range: rangeShort })}
                value={s?.failed ?? 0}
                tone={s?.failed ? 'bad' : undefined}
                // The account's counter is the current streak; this card counts every failure in the window
                hint={(account.consecutiveFailures ?? 0) > 0 ? t('heartbeatLog.inARowNow', { count: account.consecutiveFailures }) : s?.failed ? t('heartbeatLog.allRecovered') : undefined}
              />
              <Stat label={t('heartbeatLog.statSuccessRate')} value={rate === null ? '—' : `${rate}%`} tone={rate !== null && rate < 95 ? 'bad' : undefined} />
              <Stat label={t('heartbeatLog.statAvgLatency')} value={s?.avgLatency ? t('heartbeatLog.ms', { ms: Math.round(s.avgLatency) }) : '—'} />
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => logs.refetch()} disabled={logs.isFetching}>
                <RefreshCw className={cn(logs.isFetching && 'animate-spin')} /> {t('common.refresh')}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)}>
                <Trash2 /> {t('heartbeatLog.clearLog')}
              </Button>
            </div>
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
                placeholder={t('heartbeatLog.searchErrorPlaceholder')}
                aria-label={t('heartbeatLog.searchErrorPlaceholder')}
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
            <AlertDescription>{t('heartbeatLog.couldNotLoad', { error: getErrorMessage(logs.error) })}</AlertDescription>
          </Alert>
        ) : logs.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : !entries?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {filtersActive ? t('heartbeatLog.noneMatchFilters') : t('heartbeatLog.noneInRange', { range: rangeShort })}
          </p>
        ) : (
          <ul className={cn('divide-y overflow-y-auto pr-1', listClassName, logs.isFetching && 'opacity-80')}>
            {entries.map((log) => (
              <LogEntry key={log._id} log={log} />
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {pg && pg.total > 0 ? t('heartbeatLog.showingEntries', { from: (pg.page - 1) * pg.limit + 1, to: Math.min(pg.page * pg.limit, pg.total), total: pg.total.toLocaleString() }) : t('heartbeatLog.noEntries')}{' '}
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

        {/* Rendered inside the panel, so inside DialogContent when in the dialog: Radix treats it as a nested layer. */}
        <ConfirmDialog
          open={confirmClear}
          onOpenChange={setConfirmClear}
          title={t('heartbeatLog.clearLogTitle')}
          description={t('heartbeatLog.clearLogDescription', { name: account.name })}
          confirmLabel={t('heartbeatLog.deletePermanently')}
          loading={clear.isPending}
          onConfirm={() =>
            clear.mutate(account._id, {
              onSuccess: ({ deletedCount }) => {
                toast.success(t('heartbeatLog.deletedEntries', { count: deletedCount }))
                setConfirmClear(false)
                setPage(1)
              },
              onError: (error) => toast.error(getErrorMessage(error)),
            })
          }
        />
    </div>
  )
}

interface HeartbeatLogDialogProps {
  account: Account
  open: boolean
  onOpenChange: (open: boolean) => void
  initialEvent?: EventFilter
}

export function HeartbeatLogDialog({ account, open, onOpenChange, initialEvent }: HeartbeatLogDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('heartbeatLog.title', { name: account.name })}</DialogTitle>
          <DialogDescription>
            {account.heartbeatErrors > 0
              ? t('heartbeatLog.failedSinceCleared', { count: account.heartbeatErrors }) +
                ((account.consecutiveFailures ?? 0) > 0 ? ` ${t('heartbeatLog.inARowNowParen', { count: account.consecutiveFailures })}` : ` ${t('heartbeatLog.recoveredParen')}`) +
                '. '
              : `${t('heartbeatLog.noCurrentErrors')}. `}
            {t('heartbeatLog.lastSuccessfulHeartbeat')} <RelativeTime iso={account.lastHeartbeatAt} fallback={t('heartbeatLog.never')} />.
          </DialogDescription>
        </DialogHeader>
        {/* Remount per open so filters start fresh each time */}
        {open && <HeartbeatLogPanel account={account} enabled={open} initialEvent={initialEvent} />}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Clickable error count (every failed heartbeat since the log was cleared) that opens the log.
 * Red while it's failing right now; amber once it has recovered; reset only by Clear log.
 */
export function HeartbeatErrorsButton({ account }: { account: Account }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const errors = account.heartbeatErrors
  const streak = account.consecutiveFailures ?? 0
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          errors > 0
            ? t('heartbeatLog.errorsTitle', { count: errors }) + (streak > 0 ? ` · ${t('heartbeatLog.inARowNow', { count: streak })}` : ` · ${t('heartbeatLog.recovered')}`) + ` — ${t('heartbeatLog.viewHeartbeatLog')}`
            : t('heartbeatLog.viewHeartbeatLog')
        }
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors',
          streak > 0
            ? 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90'
            : errors > 0
              ? 'border-warning/50 text-warning hover:bg-warning/10'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        {errors > 0 && <AlertTriangle className="h-3 w-3" />}
        {errors > 0 ? t('heartbeatLog.errorsCount', { count: errors }) : t('heartbeatLog.noErrors')}
      </button>
      {/* Always mounted (so the close animation plays); it only fetches while open. */}
      <HeartbeatLogDialog account={account} open={open} onOpenChange={setOpen} />
    </>
  )
}
