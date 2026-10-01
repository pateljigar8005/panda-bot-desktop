import { endOfDay, startOfDay } from 'date-fns'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
import { useAuditFilters, useAuditLogs } from '@/hooks/useAuditLogs'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'
import type { AuditLog as AuditEntry, AuditSortField } from '@/types'

const PAGE_SIZE = 20

/** Readable names for audit actions; unknown ones are humanised. */
const ACTION_LABELS: Record<string, string> = {
  account_created: 'Created account',
  account_updated: 'Updated account',
  account_deleted: 'Deleted account',
  account_proxy_assigned: 'Changed account proxy',
  account_deactivated: 'Deactivated account',
  account_activated: 'Activated account',
  account_connection_tested: 'Tested account connection',
  account_setup_retried: 'Retried account setup',
  heartbeat_logs_cleared: 'Cleared heartbeat log',
  account_auto_held: 'Put on hold automatically',
  proxy_created: 'Created proxy',
  proxy_updated: 'Updated proxy',
  proxy_deleted: 'Deleted proxy',
  proxy_health_checked: 'Checked proxy health',
  master_created: 'Created master account',
  master_updated: 'Updated master account',
  master_deleted: 'Deleted master account',
  notification_settings_updated: 'Updated notification settings',
  notification_test_sent: 'Sent test email',
}
/** One local owner: an entry is either theirs or the app's own (automatic). */
const actor = (entry: AuditEntry) => (entry.meta?.automatic ? 'System (automatic)' : 'You')

const actionLabel = (action: string) => ACTION_LABELS[action] ?? action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const RESULTS = [
  { value: 'all', label: 'All results' },
  { value: 'success', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
]

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
const RESOURCE_TYPES = ['account', 'proxy', 'master', 'settings', 'system'].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))
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
          <DialogTitle>Advanced search</DialogTitle>
          <DialogDescription>Results update as you type and search the whole history, not just this page.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Resource type</Label>
            <SelectField value={value.resourceType} onChange={set('resourceType')} options={RESOURCE_TYPES} emptyLabel="Any type" aria-label="Resource type" />
          </div>
          {text('resourceName', 'Resource name contains', 'e.g. SUB ACC 1')}
          <div className="space-y-1.5">
            <Label>HTTP method</Label>
            <SelectField value={value.method} onChange={set('method')} options={METHODS} emptyLabel="Any method" aria-label="HTTP method" />
          </div>
          {text('statusCode', 'Status code', 'e.g. 400', 'numeric')}
          {text('ip', 'IP address contains', 'e.g. 192.168.')}
          {text('message', 'Error message contains', 'e.g. invalid')}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onChange(EMPTY_ADVANCED)} disabled={!Object.values(value).some(Boolean)}>
            Clear filters
          </Button>
          <Button onClick={() => onOpenChange(false)}>{total === undefined ? 'Done' : `Show ${total.toLocaleString()} result${total === 1 ? '' : 's'}`}</Button>
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
  return (
    <Badge
      variant="outline"
      title={entry.message ?? undefined}
      className={cn('whitespace-nowrap tabular-nums', entry.success ? 'border-success/40 text-success' : 'border-destructive/50 text-destructive')}
    >
      {entry.success ? 'OK' : 'Failed'} {entry.statusCode ?? ''}
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
  const hasRequest = !!entry?.request && typeof entry.request === 'object' && Object.keys(entry.request as object).length > 0
  const hasMeta = !!entry && Object.keys(entry.meta ?? {}).length > 0
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>{actionLabel(entry.action)}</DialogTitle>
              <DialogDescription>{formatExact(entry.createdAt)}</DialogDescription>
            </DialogHeader>
            <dl className="divide-y">
              <Detail label="By">{actor(entry)}</Detail>
              <Detail label="Result">
                <ResultBadge entry={entry} />
                {entry.message && <span className="ml-2 text-destructive">{entry.message}</span>}
              </Detail>
              <Detail label="Resource">
                {entry.resourceType ? <span className="capitalize">{entry.resourceType}</span> : '—'}
                {entry.resourceName && <span className="font-medium"> · {entry.resourceName}</span>}
                {entry.resourceId && <span className="ml-2 font-mono text-xs text-muted-foreground">{entry.resourceId}</span>}
              </Detail>
              <Detail label="Request">
                <span className="font-mono text-xs">
                  {entry.method} {entry.path}
                </span>
                {entry.durationMs != null && <span className="ml-2 text-muted-foreground">{entry.durationMs} ms</span>}
              </Detail>
              <Detail label="IP">{entry.ip ?? '—'}</Detail>
              <Detail label="Browser">
                <span className="text-xs text-muted-foreground">{entry.userAgent ?? '—'}</span>
              </Detail>
            </dl>
            {hasRequest && <JsonBlock label="Submitted data (secrets redacted)" value={entry.request} />}
            {hasMeta && <JsonBlock label="Details" value={entry.meta} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function AuditLog() {
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
        title="Audit Log"
        description="Every change made in the app, by you or automatically: what, when, and whether it worked."
        actions={
          <Button variant="outline" onClick={() => logs.refetch()} disabled={logs.isFetching}>
            <RefreshCw className={cn(logs.isFetching && 'animate-spin')} /> Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => withReset(setSearch)(e.target.value)}
            placeholder="Search account, proxy, error…"
            aria-label="Search audit log"
            className="pl-9"
          />
        </div>
        <SelectField
          value={action}
          onChange={withReset(setAction)}
          options={(filters.data?.actions ?? []).map((a) => ({ value: a, label: actionLabel(a) }))}
          emptyLabel="All actions"
          className="w-60"
          aria-label="Filter by action"
        />
        <SelectField value={result} onChange={withReset(setResult)} options={RESULTS} className="w-36" aria-label="Filter by result" />
        <DatePicker value={from} onChange={withReset(setFrom)} max={to || undefined} placeholder="From date" aria-label="From date" className="w-40" />
        <DatePicker value={to} onChange={withReset(setTo)} min={from || undefined} placeholder="To date" aria-label="To date" className="w-40" />
        <Button variant="outline" onClick={() => setAdvancedOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal /> Filters
          {advancedCount > 0 && <Badge className="ml-1 px-1.5 py-0">{advancedCount}</Badge>}
        </Button>
        {filtersActive && (
          <Button variant="ghost" onClick={resetFilters} className="text-muted-foreground">
            <X /> Reset
          </Button>
        )}
      </div>

      {logs.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Couldn’t load the audit log: {getErrorMessage(logs.error)}</AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHeader field="createdAt" sort={sort} onSort={withReset(setSort)}>Time</SortHeader>
                <TableHead>By</TableHead>
                <SortHeader field="action" sort={sort} onSort={withReset(setSort)}>Action</SortHeader>
                <SortHeader field="resource" sort={sort} onSort={withReset(setSort)}>Resource</SortHeader>
                <SortHeader field="status" sort={sort} onSort={withReset(setSort)}>Result</SortHeader>
                <SortHeader field="ip" sort={sort} onSort={withReset(setSort)}>IP</SortHeader>
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
                    {filtersActive ? 'No entries match these filters.' : 'No activity recorded yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                logs.data.logs.map((e) => {
                  const href = resourceHref(e)
                  return (
                    <TableRow key={e._id} className="cursor-pointer" onClick={() => setSelected(e)}>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatExact(e.createdAt)}</TableCell>
                      <TableCell className={cn('whitespace-nowrap', !!e.meta?.automatic && 'text-muted-foreground')}>{actor(e)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{actionLabel(e.action)}</div>
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
                            <span className="text-xs capitalize text-muted-foreground">{e.resourceType}</span>
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
                        <IconAction label="View details" icon={Eye} onClick={() => setSelected(e)} />
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
            ? `Showing ${(pg.page - 1) * pg.limit + 1}–${Math.min(pg.page * pg.limit, pg.total)} of ${pg.total.toLocaleString()}`
            : 'No entries'}
        </span>
        {pg && pg.pages > 1 && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || logs.isFetching} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="px-2 tabular-nums">
              Page {pg.page} of {pg.pages}
            </span>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPage((p) => p + 1)} disabled={page >= pg.pages || logs.isFetching} aria-label="Next page">
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
    </>
  )
}
