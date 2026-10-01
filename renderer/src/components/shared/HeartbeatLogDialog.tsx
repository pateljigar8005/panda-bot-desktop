import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, Search, Trash2, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
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

/** Plain-language hints for platform codes we know about. */
const CODE_HINTS: Record<string, string> = {
  '0401013': 'Token expired — paste a fresh token URL on the Edit page.',
  '401': 'Unauthorized — the token is no longer valid.',
}

/** "https://api.3qttu0s.com" → "api.3qttu0s.com" (port kept). */
const domainLabel = (apiBase: string) => {
  try {
    return new URL(apiBase).host
  } catch {
    return apiBase
  }
}

/** Our error, else the platform's own message (e.g. { code, msg: 'token invalid' }), else a generic line. */
function errorText(log: HeartbeatLog) {
  if (log.errorMessage) return log.errorMessage
  const body = log.responseBody as { msg?: unknown; message?: unknown } | null | undefined
  const platformMsg = body?.msg ?? body?.message
  if (typeof platformMsg === 'string' && platformMsg) return `Platform: ${platformMsg}`
  return log.event === 'setup' ? 'Setup failed' : 'Heartbeat rejected by the platform'
}

function hintFor(log: HeartbeatLog) {
  if (log.responseCode && CODE_HINTS[log.responseCode]) return CODE_HINTS[log.responseCode]
  const msg = log.errorMessage ?? ''
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return 'Host not found — check the proxy host, or remove the proxy.'
  if (/ECONNREFUSED/.test(msg)) return 'Connection refused — the proxy or platform is not accepting connections.'
  if (/timeout|ETIMEDOUT/i.test(msg)) return 'Timed out — slow proxy or platform.'
  if (/decryption failed/i.test(msg)) return 'Stored credentials could not be decrypted — update the token URL.'
  return null
}

function Stat({ label, value, tone, hint }: { label: string; value: string | number; tone?: 'good' | 'bad'; hint?: string }) {
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

function LogEntry({ log }: { log: HeartbeatLog }) {
  const [open, setOpen] = useState(false)
  const hint = log.success ? null : hintFor(log)
  const hasDetails = log.responseBody != null || log.requestPayload != null

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {log.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
          <time dateTime={log.createdAt} className="tabular-nums">
            {formatExact(log.createdAt)}
          </time>
          {log.event === 'setup' && (
            <Badge variant="outline" className="border-warning/50 text-warning" title="Fetching session details (sid/mc) from the platform">
              Setup
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {log.apiBase && (
            <Badge variant="secondary" className="font-mono font-normal" title={`Sent to ${log.apiBase}${log.endpoint ?? ''}`}>
              {domainLabel(log.apiBase)}
            </Badge>
          )}
          {log.statusCode != null && <Badge variant="outline">HTTP {log.statusCode}</Badge>}
          {log.responseCode && <Badge variant="outline">Code {log.responseCode}</Badge>}
          {log.latencyMs != null && <Badge variant="secondary">{log.latencyMs} ms</Badge>}
        </div>
      </div>

      {log.success && log.event === 'setup' && (
        <p className="pl-6 text-sm text-muted-foreground">Session details (sid/mc) fetched — heartbeats can start.</p>
      )}

      {!log.success && (
        <div className="space-y-1 pl-6 text-sm">
          <p className="break-words font-medium text-destructive">{errorText(log)}</p>
          {hint && <p className="text-muted-foreground">{hint}</p>}
        </div>
      )}

      {(hasDetails || log.apiBase) && (
        <div className="pl-6">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
            {open ? 'Hide' : 'Show'} response &amp; request
          </button>
          {open && (
            <div className="mt-2 space-y-2">
              {log.apiBase && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Request URL</div>
                  <div className="break-all rounded-md bg-muted p-2 font-mono text-xs">{log.endpoint === USER_INFO_ENDPOINT ? 'GET' : 'POST'} {log.apiBase}{log.endpoint ?? ''}</div>
                </div>
              )}
              <Json label="Response" value={log.responseBody} />
              <Json label="Request (secrets redacted)" value={log.requestPayload} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

const RANGES = [
  { value: '15', label: 'Last 15 min', short: '15 min' },
  { value: '60', label: 'Last 1 hour', short: '1h' },
  { value: '360', label: 'Last 6 hours', short: '6h' },
  { value: '1440', label: 'Last 24 hours', short: '24h' },
  { value: '10080', label: 'Last 7 days', short: '7 days' },
]

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'slowest', label: 'Slowest first' },
]

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
] as const
type StatusFilter = (typeof STATUSES)[number]['value']

const NO_CODE = 'none'
const CODE_LABELS: Record<string, string> = {
  '0000000': 'OK',
  '0401013': 'Token expired',
  [NO_CODE]: 'No response', // network / proxy / timeout errors
}
const codeLabel = (code: string) => (code === NO_CODE ? CODE_LABELS[code] : `${code}${CODE_LABELS[code] ? ` · ${CODE_LABELS[code]}` : ''}`)

const EVENTS = [
  { value: 'all', label: 'All events' },
  { value: 'heartbeat', label: 'Heartbeats' },
  { value: 'setup', label: 'Setup attempts' },
]
export type EventFilter = 'all' | 'heartbeat' | 'setup'

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
  const codeOptions = [...new Set([...(logs.data?.codes ?? []), ...(code ? [code] : [])])].map((c) => ({ value: c, label: codeLabel(c) }))

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
              <Stat label={`Total · ${rangeShort}`} value={s?.total ?? 0} />
              <Stat label={`Succeeded · ${rangeShort}`} value={s?.success ?? 0} tone="good" />
              <Stat
                label={`Failed · ${rangeShort}`}
                value={s?.failed ?? 0}
                tone={s?.failed ? 'bad' : undefined}
                // The account's counter is the current streak; this card counts every failure in the window
                hint={(account.consecutiveFailures ?? 0) > 0 ? `${account.consecutiveFailures} in a row now` : s?.failed ? 'all recovered' : undefined}
              />
              <Stat label="Success rate" value={rate === null ? '—' : `${rate}%`} tone={rate !== null && rate < 95 ? 'bad' : undefined} />
              <Stat label="Avg latency" value={s?.avgLatency ? `${Math.round(s.avgLatency)} ms` : '—'} />
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Filter by status">
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
              <SelectField value={range} onChange={withReset(setRange)} options={RANGES} className="h-8 w-36" aria-label="Time range" />
              <SelectField value={event} onChange={(v) => withReset(setEvent)(v as EventFilter)} options={EVENTS} className="h-8 w-40" aria-label="Event type" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => logs.refetch()} disabled={logs.isFetching}>
                <RefreshCw className={cn(logs.isFetching && 'animate-spin')} /> Refresh
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)}>
                <Trash2 /> Clear log
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
                placeholder="Search error message…"
                aria-label="Search error message"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <SelectField value={code} onChange={withReset(setCode)} options={codeOptions} emptyLabel="All codes" className="h-8 w-56" aria-label="Filter by code" />
            <SelectField
              value={domain}
              onChange={withReset(setDomain)}
              options={[...new Set([...(logs.data?.domains ?? []), ...(domain ? [domain] : [])])].map((d) => ({ value: d, label: domainLabel(d) }))}
              emptyLabel="All domains"
              className="h-8 w-52"
              aria-label="Filter by platform domain"
            />
            <SelectField value={sort} onChange={(v) => withReset(setSort)(v as HeartbeatLogSort)} options={SORTS} className="h-8 w-36" aria-label="Sort" />
            {filtersActive && (
              <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={resetFilters}>
                <X /> Reset
              </Button>
            )}
          </div>
        </div>

        {logs.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Couldn’t load heartbeat log: {getErrorMessage(logs.error)}</AlertDescription>
          </Alert>
        ) : logs.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : !entries?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {filtersActive ? 'No heartbeats match these filters.' : `No heartbeats in the last ${rangeShort}.`}
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
            {pg && pg.total > 0
              ? `Showing ${(pg.page - 1) * pg.limit + 1}–${Math.min(pg.page * pg.limit, pg.total)} of ${pg.total.toLocaleString()}`
              : 'No entries'}{' '}
            · logs are kept 7 days
          </span>
          {pg && pg.pages > 1 && (
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || logs.isFetching} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <span className="px-1 tabular-nums">
                Page {pg.page} of {pg.pages}
              </span>
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setPage((p) => p + 1)} disabled={page >= pg.pages || logs.isFetching} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>

        {/* Rendered inside the panel, so inside DialogContent when in the dialog: Radix treats it as a nested layer. */}
        <ConfirmDialog
          open={confirmClear}
          onOpenChange={setConfirmClear}
          title="Permanently delete heartbeat log?"
          description={`All heartbeat log entries for “${account.name}” will be permanently deleted and its error count reset to 0. This can't be undone. New heartbeats will keep being logged.`}
          confirmLabel="Delete permanently"
          loading={clear.isPending}
          onConfirm={() =>
            clear.mutate(account._id, {
              onSuccess: ({ deletedCount }) => {
                toast.success(`Deleted ${deletedCount} log entr${deletedCount === 1 ? 'y' : 'ies'}`)
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Heartbeat log · {account.name}</DialogTitle>
          <DialogDescription>
            {account.heartbeatErrors > 0
              ? `${account.heartbeatErrors} failed heartbeat${account.heartbeatErrors === 1 ? '' : 's'} since the log was cleared${(account.consecutiveFailures ?? 0) > 0 ? ` (${account.consecutiveFailures} in a row now)` : ' (recovered)'}. `
              : 'No current errors. '}
            Last successful heartbeat: <RelativeTime iso={account.lastHeartbeatAt} fallback="never" />.
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
  const [open, setOpen] = useState(false)
  const errors = account.heartbeatErrors
  const streak = account.consecutiveFailures ?? 0
  const plural = (n: number) => `${n} failed heartbeat${n === 1 ? '' : 's'}`
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          errors > 0
            ? `${plural(errors)} since the log was cleared${streak > 0 ? ` · ${streak} in a row now` : ' · recovered'} — view the heartbeat log`
            : 'View heartbeat log'
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
        {errors > 0 ? `${errors} error${errors === 1 ? '' : 's'}` : 'No errors'}
      </button>
      {/* Always mounted (so the close animation plays); it only fetches while open. */}
      <HeartbeatLogDialog account={account} open={open} onOpenChange={setOpen} />
    </>
  )
}
