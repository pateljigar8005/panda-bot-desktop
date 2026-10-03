import { endOfDay, startOfDay } from 'date-fns'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DatePicker } from '@/components/shared/DatePicker'
import { IconAction } from '@/components/shared/IconAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatExact } from '@/components/shared/RelativeTime'
import { SelectField } from '@/components/shared/SelectField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuditFilters, useAuditLogs, useClearAuditLogs } from '@/hooks/useAuditLogs'
import { useDateLocale } from '@/hooks/useDateLocale'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'
import type { AuditLog as AuditEntry, AuditSortField } from '@/types'

const PAGE_SIZE = 20

/** Readable names for audit actions; unknown ones are humanised. */
const ACTION_KEYS: Record<string, string> = {
  account_created: 'auditLog.actionAccountCreated',
  account_updated: 'auditLog.actionAccountUpdated',
  account_deleted: 'auditLog.actionAccountDeleted',
  account_proxy_assigned: 'auditLog.actionAccountProxyAssigned',
  account_deactivated: 'auditLog.actionAccountDeactivated',
  account_activated: 'auditLog.actionAccountActivated',
  account_connection_tested: 'auditLog.actionAccountConnectionTested',
  account_setup_retried: 'auditLog.actionAccountSetupRetried',
  account_balance_refreshed: 'auditLog.actionAccountBalanceRefreshed',
  account_balances_refreshed: 'auditLog.actionAccountBalancesRefreshed',
  heartbeat_logs_cleared: 'auditLog.actionHeartbeatLogsCleared',
  activity_log_cleared: 'auditLog.actionActivityLogCleared',
  audit_log_cleared: 'auditLog.actionAuditLogCleared',
  account_auto_held: 'auditLog.actionAccountAutoHeld',
  proxy_created: 'auditLog.actionProxyCreated',
  proxy_updated: 'auditLog.actionProxyUpdated',
  proxy_deleted: 'auditLog.actionProxyDeleted',
  proxy_health_checked: 'auditLog.actionProxyHealthChecked',
  master_created: 'auditLog.actionMasterCreated',
  master_updated: 'auditLog.actionMasterUpdated',
  master_deleted: 'auditLog.actionMasterDeleted',
  system_settings_updated: 'auditLog.actionSystemSettingsUpdated',
  kill_switch_activated: 'auditLog.actionKillSwitchActivated',
  kill_switch_released: 'auditLog.actionKillSwitchReleased',
  copy_betting_armed: 'auditLog.actionCopyBettingArmed',
  copy_betting_disarmed: 'auditLog.actionCopyBettingDisarmed',
  copy_bet_run: 'auditLog.actionCopyBetRun',
  browser_launched: 'auditLog.actionBrowserLaunched',
  browser_closed: 'auditLog.actionBrowserClosed',
  browser_traffic_cleared: 'auditLog.actionBrowserTrafficCleared',
  bet_retried: 'auditLog.actionBetRetried',
}
/** One local owner: an entry is either theirs or the app's own (automatic). */
const actor = (entry: AuditEntry, t: TFunction) => (entry.meta?.automatic ? t('auditLog.systemAutomatic') : t('auditLog.you'))

const actionLabel = (action: string, t: TFunction) => (ACTION_KEYS[action] ? t(ACTION_KEYS[action]) : action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()))

// Reuses the nav labels so "Account"/"Proxy"/… reads the same here as in the sidebar.
const RESOURCE_TYPE_KEYS: Record<string, string> = {
  account: 'nav.accounts',
  proxy: 'nav.proxies',
  master: 'nav.master',
  settings: 'nav.settings',
  system: 'auditLog.resourceTypeSystem',
}
const resourceTypeLabel = (type: string, t: TFunction) => (RESOURCE_TYPE_KEYS[type] ? t(RESOURCE_TYPE_KEYS[type]) : type)

// ---------- Sorting ----------
type Sort = { field: AuditSortField; order: 'asc' | 'desc' }
const DEFAULT_SORT: Sort = { field: 'createdAt', order: 'desc' }

/** Header that sorts server-side: first click sorts (time newest-first, text A→Z), second reverses. */
function SortHeader({ field, sort, onSort, children }: { field: AuditSortField; sort: Sort; onSort: (s: Sort) => void; children: ReactNode }) {
  const active = sort.field === field
  const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown
  const firstOrder = field === 'createdAt' || field === 'duration' ? 'desc' : 'asc'
  return (
    <TableHead aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        onClick={() => onSort({ field, order: active ? (sort.order === 'asc' ? 'desc' : 'asc') : firstOrder })}
        className="-ml-2 inline-flex items-center gap-1.5 rounded px-2 py-1 outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {children}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-40')} />
      </button>
    </TableHead>
  )
}

// ---------- Advanced search ----------
type Advanced = { resourceType: string; resourceName: string; ip: string; method: string; statusCode: string; message: string }
const EMPTY_ADVANCED: Advanced = { resourceType: '', resourceName: '', ip: '', method: '', statusCode: '', message: '' }
const RESOURCE_TYPE_VALUES = ['account', 'proxy', 'master', 'system']
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'].map((v) => ({ value: v, label: v }))

function AdvancedSearch({
  open,
  onOpenChange,
  value,
  onChange,
  total,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: Advanced
  onChange: (next: Advanced) => void
  total?: number
}) {
  const { t } = useTranslation()
  const RESOURCE_TYPES = RESOURCE_TYPE_VALUES.map((v) => ({ value: v, label: resourceTypeLabel(v, t) }))
  const set = (key: keyof Advanced) => (v: string) => onChange({ ...value, [key]: v })
  const text = (key: keyof Advanced, label: string, placeholder: string, inputMode?: 'numeric') => (
    <div className="space-y-1.5">
      <Label htmlFor={`adv-${key}`}>{label}</Label>
      <Input id={`adv-${key}`} value={value[key]} onChange={(e) => set(key)(e.target.value)} placeholder={placeholder} inputMode={inputMode} />
    </div>
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('dataTable.advancedSearch')}</DialogTitle>
          <DialogDescription>{t('auditLog.advancedSearchDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('auditLog.resourceType')}</Label>
            <SelectField value={value.resourceType} onChange={set('resourceType')} options={RESOURCE_TYPES} emptyLabel={t('auditLog.anyType')} aria-label={t('auditLog.resourceType')} />
          </div>
          {text('resourceName', t('auditLog.resourceNameContains'), 'e.g. SUB ACC 1')}
          <div className="space-y-1.5">
            <Label>{t('auditLog.httpMethod')}</Label>
            <SelectField value={value.method} onChange={set('method')} options={METHODS} emptyLabel={t('auditLog.anyMethod')} aria-label={t('auditLog.httpMethod')} />
          </div>
          {text('statusCode', t('auditLog.statusCode'), 'e.g. 400', 'numeric')}
          {text('ip', t('auditLog.ipContains'), 'e.g. 192.168.')}
          {text('message', t('auditLog.messageContains'), 'e.g. invalid')}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onChange(EMPTY_ADVANCED)} disabled={!Object.values(value).some(Boolean)}>
            {t('dataTable.clearFilters')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{total === undefined ? t('auditLog.done') : t('dataTable.showResults', { count: total })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Link to the affected record, unless it was deleted. */
function resourceHref(e: AuditEntry) {
  if (!e.resourceId || e.action.endsWith('_deleted')) return null
  if (e.resourceType === 'account') return `/accounts/${e.resourceId}`
  if (e.resourceType === 'proxy') return `/proxies/${e.resourceId}/edit`
  if (e.resourceType === 'master') return '/master'
  return null
}

function ResultBadge({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant="outline"
      title={entry.message ?? undefined}
      className={cn('whitespace-nowrap tabular-nums', entry.success ? 'border-success/40 text-success' : 'border-destructive/50 text-destructive')}
    >
      {entry.success ? t('auditLog.ok') : t('heartbeatLog.statusFilter.failed')} {entry.statusCode ?? ''}
    </Badge>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

function EntryDetails({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const hasRequest = !!entry?.request && typeof entry.request === 'object' && Object.keys(entry.request as object).length > 0
  const hasMeta = !!entry && Object.keys(entry.meta ?? {}).length > 0
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>{actionLabel(entry.action, t)}</DialogTitle>
              <DialogDescription>{formatExact(entry.createdAt, locale)}</DialogDescription>
            </DialogHeader>
            <dl className="divide-y">
              <Detail label={t('auditLog.by')}>{actor(entry, t)}</Detail>
              <Detail label={t('auditLog.result')}>
                <ResultBadge entry={entry} />
                {entry.message && <span className="ml-2 text-destructive">{entry.message}</span>}
              </Detail>
              <Detail label={t('auditLog.resource')}>
                {entry.resourceType ? <span className="capitalize">{resourceTypeLabel(entry.resourceType, t)}</span> : '—'}
                {entry.resourceName && <span className="font-medium"> · {entry.resourceName}</span>}
                {entry.resourceId && <span className="ml-2 font-mono text-xs text-muted-foreground">{entry.resourceId}</span>}
              </Detail>
              <Detail label={t('auditLog.request')}>
                <span className="font-mono text-xs">
                  {entry.method} {entry.path}
                </span>
                {entry.durationMs != null && <span className="ml-2 text-muted-foreground">{t('heartbeatLog.ms', { ms: entry.durationMs })}</span>}
              </Detail>
              <Detail label={t('auditLog.ip')}>{entry.ip ?? '—'}</Detail>
              <Detail label={t('auditLog.browser')}>
                <span className="text-xs text-muted-foreground">{entry.userAgent ?? '—'}</span>
              </Detail>
            </dl>
            {hasRequest && <JsonBlock label={t('auditLog.submittedData')} value={entry.request} />}
            {hasMeta && <JsonBlock label={t('auditLog.details')} value={entry.meta} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function AuditLog() {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const RESULTS = [
    { value: 'all', label: t('auditLog.allResults') },
    { value: 'success', label: t('auditLog.succeeded') },
    { value: 'failed', label: t('heartbeatLog.statusFilter.failed') },
  ]
  const filters = useAuditFilters()
  const [action, setAction] = useState('')
  const [result, setResult] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), 400)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditEntry | null>(null)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [advanced, setAdvanced] = useState<Advanced>(EMPTY_ADVANCED)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const clear = useClearAuditLogs()
  const [confirmClear, setConfirmClear] = useState(false)
  const advancedCount = Object.values(advanced).filter(Boolean).length
  // Typing is debounced; clearing applies immediately
  const debouncedAdvanced = useDebouncedValue(advanced, 400)
  const adv = advancedCount === 0 ? EMPTY_ADVANCED : debouncedAdvanced
  const statusCode = /^\d{3}$/.test(adv.statusCode) ? Number(adv.statusCode) : undefined

  // Any filter change goes back to page 1
  const withReset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  // Dates are picked in local time; send each whole local day as an ISO range
  const logs = useAuditLogs({
    action: action || undefined,
    success: result === 'all' ? undefined : result === 'success',
    from: from ? startOfDay(new Date(`${from}T00:00:00`)).toISOString() : undefined,
    to: to ? endOfDay(new Date(`${to}T00:00:00`)).toISOString() : undefined,
    q: q || undefined,
    resourceType: adv.resourceType || undefined,
    resourceName: adv.resourceName.trim() || undefined,
    ip: adv.ip.trim() || undefined,
    method: adv.method || undefined,
    statusCode,
    message: adv.message.trim() || undefined,
    sort: sort.field,
    order: sort.order,
    page,
    limit: PAGE_SIZE,
  })

  const filtersActive = !!action || result !== 'all' || !!from || !!to || !!search || advancedCount > 0
  const resetFilters = () => {
    setAction('')
    setResult('all')
    setFrom('')
    setTo('')
    setSearch('')
    setAdvanced(EMPTY_ADVANCED)
    setPage(1)
  }
  const pg = logs.data?.pagination

  return (
    <>
      <PageHeader
        title={t('auditLog.title')}
        description={t('auditLog.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => logs.refetch()} disabled={logs.isFetching}>
              <RefreshCw className={cn(logs.isFetching && 'animate-spin')} /> {t('common.refresh')}
            </Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)}>
              <Trash2 /> {t('common.clear')}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => withReset(setSearch)(e.target.value)}
            placeholder={t('auditLog.searchPlaceholder')}
            aria-label={t('auditLog.searchAriaLabel')}
            className="pl-9"
          />
        </div>
        <SelectField
          value={action}
          onChange={withReset(setAction)}
          options={(filters.data?.actions ?? []).map((a) => ({ value: a, label: actionLabel(a, t) }))}
          emptyLabel={t('auditLog.allActions')}
          className="w-60"
          aria-label={t('auditLog.filterByAction')}
        />
        <SelectField value={result} onChange={withReset(setResult)} options={RESULTS} className="w-36" aria-label={t('auditLog.filterByResult')} />
        <DatePicker value={from} onChange={withReset(setFrom)} max={to || undefined} placeholder={t('auditLog.fromDate')} aria-label={t('auditLog.fromDate')} className="w-40" />
        <DatePicker value={to} onChange={withReset(setTo)} min={from || undefined} placeholder={t('auditLog.toDate')} aria-label={t('auditLog.toDate')} className="w-40" />
        <Button variant="outline" onClick={() => setAdvancedOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal /> {t('common.filters')}
          {advancedCount > 0 && <Badge className="ml-1 px-1.5 py-0">{advancedCount}</Badge>}
        </Button>
        {filtersActive && (
          <Button variant="ghost" onClick={resetFilters} className="text-muted-foreground">
            <X /> {t('common.reset')}
          </Button>
        )}
      </div>

      {logs.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('auditLog.couldNotLoad', { error: getErrorMessage(logs.error) })}</AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHeader field="createdAt" sort={sort} onSort={withReset(setSort)}>{t('auditLog.columnTime')}</SortHeader>
                <TableHead>{t('auditLog.by')}</TableHead>
                <SortHeader field="action" sort={sort} onSort={withReset(setSort)}>{t('auditLog.columnAction')}</SortHeader>
                <SortHeader field="resource" sort={sort} onSort={withReset(setSort)}>{t('auditLog.resource')}</SortHeader>
                <SortHeader field="status" sort={sort} onSort={withReset(setSort)}>{t('auditLog.result')}</SortHeader>
                <SortHeader field="ip" sort={sort} onSort={withReset(setSort)}>{t('auditLog.ip')}</SortHeader>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody className={cn(logs.isFetching && !logs.isLoading && 'opacity-70')}>
              {logs.isLoading ? (
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !logs.data?.logs.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {filtersActive ? t('auditLog.noneMatchFilters') : t('auditLog.noActivityYet')}
                  </TableCell>
                </TableRow>
              ) : (
                logs.data.logs.map((e) => {
                  const href = resourceHref(e)
                  return (
                    <TableRow key={e._id} className="cursor-pointer" onClick={() => setSelected(e)}>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatExact(e.createdAt, locale)}</TableCell>
                      <TableCell className={cn('whitespace-nowrap', !!e.meta?.automatic && 'text-muted-foreground')}>{actor(e, t)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{actionLabel(e.action, t)}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {e.method} {e.path}
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.resourceName || e.resourceType ? (
                          <div className="flex flex-col">
                            {href ? (
                              <Link to={href} className="font-medium hover:underline" onClick={(ev) => ev.stopPropagation()}>
                                {e.resourceName ?? e.resourceId}
                              </Link>
                            ) : (
                              <span className="font-medium">{e.resourceName ?? '—'}</span>
                            )}
                            <span className="text-xs capitalize text-muted-foreground">{e.resourceType && resourceTypeLabel(e.resourceType, t)}</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <ResultBadge entry={e} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.ip ?? '—'}</TableCell>
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <IconAction label={t('auditLog.viewDetails')} icon={Eye} onClick={() => setSelected(e)} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {pg && pg.total > 0
            ? t('heartbeatLog.showingEntries', { from: (pg.page - 1) * pg.limit + 1, to: Math.min(pg.page * pg.limit, pg.total), total: pg.total.toLocaleString() })
            : t('heartbeatLog.noEntries')}
        </span>
        {pg && pg.pages > 1 && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || logs.isFetching} aria-label={t('dataTable.previousPage')}>
              <ChevronLeft />
            </Button>
            <span className="px-2 tabular-nums">
              {t('dataTable.pageOf', { page: pg.page, pages: pg.pages })}
            </span>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPage((p) => p + 1)} disabled={page >= pg.pages || logs.isFetching} aria-label={t('dataTable.nextPage')}>
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>

      <EntryDetails entry={selected} onClose={() => setSelected(null)} />
      <AdvancedSearch
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        value={advanced}
        onChange={withReset(setAdvanced)}
        total={logs.isFetching ? undefined : pg?.total}
      />

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('auditLog.clearTitle')}
        description={t('auditLog.clearDescription')}
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
