import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Eye, Pencil, Plus, Power, PowerOff, RefreshCw, Trash2, Users, Wifi } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { HeartbeatErrorsButton } from '@/components/shared/HeartbeatLogDialog'
import { IconAction } from '@/components/shared/IconAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { RelativeTime } from '@/components/shared/RelativeTime'
import { SetupIssueBadge } from '@/components/shared/SetupIssue'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/shared/SelectField'
import { isSetupIncomplete, useAccounts } from '@/hooks/useAccounts'
import { canToggle, isOff, toggleLabel, useAccountActions } from '@/hooks/useAccountActions'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/api'
import type { Account, AccountStatus } from '@/types'

export const deviceLabel = (id: Account['deviceId']) => (id === '1' ? 'iOS' : 'Android')

// Every possible value, so filters offer all of them — not just those on the current page
const STATUSES: AccountStatus[] = ['active', 'inactive', 'on_hold', 'expired', 'banned']

function RowActions({ account }: { account: Account }) {
  const { t } = useTranslation()
  const actions = useAccountActions()
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <IconAction label={t('accounts.viewDetails')} icon={Eye} to={`/accounts/${account._id}`} />
        <IconAction label={t('accounts.editAccount')} icon={Pencil} to={`/accounts/${account._id}/edit`} />
        {canToggle(account) && (
          <IconAction
            label={toggleLabel(account)}
            icon={isOff(account) ? Power : PowerOff}
            onClick={() => actions.toggleActive(account)}
            loading={actions.toggling}
          />
        )}
        <IconAction label={t('accounts.testConnection')} icon={Wifi} onClick={() => actions.runTest(account)} loading={actions.testing} />
        <IconAction label={t('accounts.deleteAccount')} icon={Trash2} onClick={() => setConfirmOpen(true)} destructive />
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('accounts.deleteTitle')}
        description={t('accounts.deleteDescription', { name: account.name })}
        confirmLabel={t('common.delete')}
        loading={actions.deleting}
        onConfirm={() => actions.remove(account, () => setConfirmOpen(false))}
      />
    </>
  )
}

export default function Accounts() {
  const { t } = useTranslation()

  const STATUS_LABELS: Record<AccountStatus, string> = {
    active: t('accounts.statusActive'),
    inactive: t('accounts.statusInactive'),
    on_hold: t('accounts.statusOnHold'),
    expired: t('accounts.statusExpired'),
    banned: t('accounts.statusBanned'),
  }
  const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))
  const DEVICE_OPTIONS = [{ value: 'iOS', label: 'iOS' }, { value: 'Android', label: 'Android' }]
  const BET_MODE_OPTIONS = [{ value: 'fixed', label: t('accounts.betModeFixed') }, { value: 'proportional', label: t('accounts.betModeProportional') }]

  const columns: ColumnDef<Account>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: t('accounts.columnName'),
        meta: { filter: 'text' },
        cell: ({ row }) => (
          <Link to={`/accounts/${row.original._id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      { accessorKey: 'uid', header: t('accounts.columnUid'), meta: { filter: 'text' } },
      { id: 'device', accessorFn: (row) => deviceLabel(row.deviceId), header: t('accounts.columnDevice'), meta: { filter: 'select', options: DEVICE_OPTIONS } },
      { accessorKey: 'status', header: t('accounts.columnStatus'), meta: { filter: 'select', options: STATUS_OPTIONS }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { accessorKey: 'betMode', header: t('accounts.columnBetMode'), meta: { filter: 'select', options: BET_MODE_OPTIONS }, cell: ({ row }) => t(row.original.betMode === 'fixed' ? 'accounts.betModeFixed' : 'accounts.betModeProportional') },
      {
        id: 'lastHeartbeatAt',
        accessorFn: (row) => row.lastHeartbeatAt,
        header: t('accounts.columnLastHeartbeat'),
        meta: { filter: 'date' },
        sortUndefined: 'last',
        cell: ({ row }) => <RelativeTime iso={row.original.lastHeartbeatAt} />,
      },
      {
        accessorKey: 'heartbeatErrors',
        header: t('accounts.columnErrors'),
        meta: { filter: 'number' },
        cell: ({ row }) => (isSetupIncomplete(row.original) ? <SetupIssueBadge account={row.original} /> : <HeartbeatErrorsButton account={row.original} />),
      },
      { accessorKey: 'lastBalance', header: t('accounts.columnBalance'), meta: { filter: 'number' }, cell: ({ row }) => row.original.lastBalance.toFixed(2) },
      { id: 'actions', header: () => <span className="block text-right">{t('accounts.columnActions')}</span>, enableSorting: false, cell: ({ row }) => <RowActions account={row.original} /> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [status, setStatus] = useState<AccountStatus | ''>('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())

  const { data, isLoading, isError, error, refetch, isFetching } = useAccounts({
    page,
    limit,
    status: status || undefined,
    search: debouncedSearch || undefined,
  })

  // Also match locally so search works even if the API ignores the `search` param.
  const needle = debouncedSearch.toLowerCase()
  const rows = (data?.accounts ?? []).filter((a) => !needle || a.name.toLowerCase().includes(needle) || a.uid.toLowerCase().includes(needle))

  const hasFilters = !!status || !!debouncedSearch
  const showEmpty = !isLoading && !isError && data?.pagination.total === 0 && !hasFilters

  return (
    <>
      <PageHeader
        title={t('accounts.title')}
        description={t('accounts.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'animate-spin' : undefined} /> {t('common.refresh')}
            </Button>
            <Button asChild>
              <Link to="/accounts/new">
                <Plus /> {t('accounts.addAccount')}
              </Link>
            </Button>
          </>
        }
      />

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('accounts.couldNotLoad')}</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{getErrorMessage(error)}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw /> {t('common.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {showEmpty ? (
        <EmptyState
          icon={Users}
          title={t('accounts.noneYetTitle')}
          description={t('accounts.noneYetDescription')}
          action={
            <Button asChild>
              <Link to="/accounts/new">
                <Plus /> {t('accounts.addAccount')}
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
          emptyMessage={t('accounts.noneMatchFilters')}
          toolbarLeft={
            <>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder={t('accounts.searchPlaceholder')}
                aria-label={t('accounts.searchAriaLabel')}
                className="sm:max-w-xs"
              />
              <SelectField
                value={status}
                onChange={(v) => {
                  setStatus(v as AccountStatus | '')
                  setPage(1)
                }}
                options={STATUS_OPTIONS}
                emptyLabel={t('accounts.allStatuses')}
                aria-label={t('accounts.filterByStatus')}
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
