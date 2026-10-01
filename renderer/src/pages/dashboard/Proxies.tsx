import type { ColumnDef } from '@tanstack/react-table'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Network, Pencil, Plus, RefreshCw, Stethoscope, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ProxyAccountsDialog } from '@/components/shared/ProxyAccountsDialog'
import { IconAction } from '@/components/shared/IconAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/shared/SelectField'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDeleteProxy, useProxies, useProxyHealthCheck } from '@/hooks/useProxies'
import { ApiError, getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'
import type { Proxy, ProxyStatus } from '@/types'

/** Account count for a proxy; opens the accounts dialog. */
function AccountsCell({ proxy }: { proxy: Proxy }) {
  const [open, setOpen] = useState(false)
  const n = proxy.accountCount ?? 0
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="See and manage accounts using this proxy"
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors hover:bg-accent',
          n === 0 && 'text-muted-foreground',
        )}
      >
        <Users className="h-3 w-3" /> {n} account{n === 1 ? '' : 's'}
      </button>
      <ProxyAccountsDialog proxy={proxy} open={open} onOpenChange={setOpen} />
    </>
  )
}

function RowActions({ proxy }: { proxy: Proxy }) {
  const health = useProxyHealthCheck()
  const del = useDeleteProxy()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const inUse = proxy.accountCount ?? 0

  // A proxy used by accounts can't be deleted (the API refuses with 409); explain instead of asking to confirm
  const requestDelete = () => (inUse > 0 ? setBlockedOpen(true) : setConfirmOpen(true))

  const check = () =>
    health.mutate(proxy._id, {
      onSuccess: (r) => (r.success ? toast.success(`${proxy.name} is ${r.status} · ${r.latencyMs} ms · ${r.ip}`) : toast.error(`${proxy.name} is ${r.status}`)),
      onError: (error) => toast.error(getErrorMessage(error)),
    })

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <IconAction label="Health check (test the proxy connection)" icon={Stethoscope} onClick={check} loading={health.isPending} />
        <IconAction label="Edit proxy" icon={Pencil} to={`/proxies/${proxy._id}/edit`} />
        <IconAction label="Manage accounts using this proxy" icon={Users} onClick={() => setAssignOpen(true)} />
        <IconAction label={inUse > 0 ? `Delete proxy (in use by ${inUse} account${inUse === 1 ? '' : 's'} — remove them first)` : 'Delete proxy'} icon={Trash2} onClick={requestDelete} destructive />
      </div>
      <ProxyAccountsDialog proxy={proxy} open={assignOpen} onOpenChange={setAssignOpen} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete proxy?"
        description={`“${proxy.name}” will be permanently removed. No accounts use it.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(proxy._id, {
            onSuccess: () => {
              toast.success('Proxy deleted')
              setConfirmOpen(false)
            },
            onError: (error) => {
              // In use after all (e.g. assigned since the list loaded): show why, with the way out
              if (error instanceof ApiError && error.status === 409) {
                setConfirmOpen(false)
                setBlockedOpen(true)
              }
              toast.error(getErrorMessage(error))
            },
          })
        }
      />
      <Dialog open={blockedOpen} onOpenChange={setBlockedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Can’t delete “{proxy.name}”</DialogTitle>
            <DialogDescription>
              {inUse > 0 ? `It’s used by ${inUse} account${inUse === 1 ? '' : 's'}.` : 'It’s used by one or more accounts.'} Remove it from
              those accounts first — or move them to another proxy — then delete it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBlockedOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setBlockedOpen(false)
                setAssignOpen(true)
              }}
            >
              <Users /> Manage accounts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Every possible value, so filters offer all of them — not just those on the current page
const STATUSES: ProxyStatus[] = ['healthy', 'dead', 'unknown']
const PROXY_STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))
const PROTOCOL_OPTIONS = [{ value: 'http', label: 'HTTP' }, { value: 'https', label: 'HTTPS' }, { value: 'socks5', label: 'SOCKS5' }]

const columns: ColumnDef<Proxy>[] = [
  { accessorKey: 'name', header: 'Name', meta: { filter: 'text' }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
  { id: 'address', accessorFn: (row) => `${row.host}:${row.port}`, header: 'Host:Port', meta: { filter: 'text' } },
  { accessorKey: 'protocol', header: 'Protocol', meta: { filter: 'select', options: PROTOCOL_OPTIONS }, cell: ({ row }) => row.original.protocol.toUpperCase() },
  { accessorKey: 'country', header: 'Country', meta: { filter: 'select' }, cell: ({ row }) => row.original.country || '—' },
  { accessorKey: 'status', header: 'Status', meta: { filter: 'select', options: PROXY_STATUS_OPTIONS }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: 'accountCount', header: 'Accounts', meta: { filter: 'number' }, cell: ({ row }) => <AccountsCell proxy={row.original} /> },
  {
    id: 'lastCheck',
    accessorFn: (row) => row.lastCheck,
    header: 'Last check',
    meta: { filter: 'date' },
    sortUndefined: 'last',
    cell: ({ row }) => (row.original.lastCheck ? formatDistanceToNow(new Date(row.original.lastCheck), { addSuffix: true }) : 'Never'),
  },
  { id: 'actions', header: () => <span className="block text-right">Actions</span>, enableSorting: false, cell: ({ row }) => <RowActions proxy={row.original} /> },
]



export default function Proxies() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [status, setStatus] = useState<ProxyStatus | ''>('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())

  const { data, isLoading, isError, error, refetch, isFetching } = useProxies({
    page,
    limit,
    status: status || undefined,
    search: debouncedSearch || undefined,
  })

  // Also match locally so search works even if the API ignores the `search` param.
  const needle = debouncedSearch.toLowerCase()
  const rows = (data?.proxies ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.host.toLowerCase().includes(needle))

  const hasFilters = !!status || !!debouncedSearch
  const showEmpty = !isLoading && !isError && data?.pagination.total === 0 && !hasFilters

  return (
    <>
      <PageHeader
        title="Proxies"
        description="Proxy pool health and account assignments."
        actions={
          <Button asChild>
            <Link to="/proxies/new">
              <Plus /> Add Proxy
            </Link>
          </Button>
        }
      />

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn’t load proxies</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{getErrorMessage(error)}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {showEmpty ? (
        <EmptyState
          icon={Network}
          title="No proxies yet"
          description="Add a proxy so accounts can connect from distinct IP addresses."
          action={
            <Button asChild>
              <Link to="/proxies/new">
                <Plus /> Add Proxy
              </Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={isLoading}
          globalSearch={false}
          emptyMessage="No proxies match your filters."
          toolbarLeft={
            <>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search name or host…"
                aria-label="Search proxies"
                className="sm:max-w-xs"
              />
              <SelectField
                value={status}
                onChange={(v) => {
                  setStatus(v as ProxyStatus | '')
                  setPage(1)
                }}
                options={PROXY_STATUS_OPTIONS}
                emptyLabel="All statuses"
                aria-label="Filter by status"
                className="sm:w-44"
              />
            </>
          }
          serverPagination={
            data && {
              ...data.pagination,
              onPageChange: setPage,
              onLimitChange: (n) => {
                setLimit(n)
                setPage(1)
              },
            }
          }
        />
      )}
    </>
  )
}
