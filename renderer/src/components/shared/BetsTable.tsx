import type { ColumnDef } from '@tanstack/react-table'
import { RotateCw } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatAmount } from '@/lib/betSizing'
import { IconAction } from '@/components/shared/IconAction'
import { RelativeTime } from '@/components/shared/RelativeTime'
import { useDateLocale } from '@/hooks/useDateLocale'
import { useRetryBet } from '@/hooks/useBets'
import { getErrorMessage } from '@/services/api'
import type { BetLog } from '@/types'
import { BetStatusBadge } from './BetStatusBadge'
import { DataTable, type ServerPagination } from './DataTable'

function RetryBetAction({ bet }: { bet: BetLog }) {
  const { t } = useTranslation()
  const retry = useRetryBet()
  if (bet.accountType !== 'sub' || bet.status !== 'failed') return null
  return (
    <IconAction
      label={t('bets.retry')}
      icon={RotateCw}
      loading={retry.isPending}
      onClick={() =>
        retry.mutate(bet._id, {
          onSuccess: (row) => (row.status === 'executed' ? toast.success(t('bets.retrySucceeded')) : toast.error(t('bets.retryStillFailed'))),
          onError: (error) => toast.error(getErrorMessage(error)),
        })
      }
    />
  )
}

interface BetsTableProps {
  data: BetLog[]
  loading?: boolean
  /** Plain table without search, filters or pagination (e.g. dashboard preview). */
  compact?: boolean
  serverPagination?: ServerPagination
  toolbarLeft?: ReactNode
}

export function BetsTable({ data, loading, compact, serverPagination, toolbarLeft }: BetsTableProps) {
  const { t } = useTranslation()
  const locale = useDateLocale()

  // Every possible bet status, so the filter offers all of them
  const BET_STATUS_OPTIONS = [
    { value: 'captured', label: t('betStatus.captured') },
    { value: 'executed', label: t('betStatus.executed') },
    { value: 'failed', label: t('betStatus.failed') },
    { value: 'skipped', label: t('betStatus.skipped') },
  ]
  const columns: ColumnDef<BetLog>[] = useMemo(
    () => [
      { accessorKey: 'createdAt', header: t('bets.columnTime'), meta: { filter: 'date' }, cell: ({ row }) => <RelativeTime iso={row.original.createdAt} showExact /> },
      {
        accessorKey: 'accountName',
        header: t('bets.columnAccount'),
        meta: { filter: 'select' },
        cell: ({ row }) => row.original.accountName ?? (row.original.accountType === 'master' ? t('bets.master') : '—'),
      },
      { accessorKey: 'matchName', header: t('bets.columnEvent'), meta: { filter: 'text' }, cell: ({ row }) => row.original.matchName ?? '—' },
      { accessorKey: 'selection', header: t('bets.columnSelection'), meta: { filter: 'text' }, cell: ({ row }) => row.original.selection ?? '—' },
      { accessorKey: 'odds', header: t('bets.columnOdds'), meta: { filter: 'number' }, cell: ({ row }) => (row.original.odds != null ? formatAmount(row.original.odds) : '—') },
      { accessorKey: 'stake', header: t('bets.columnStake'), meta: { filter: 'number' }, cell: ({ row }) => (row.original.stake != null ? formatAmount(row.original.stake) : '—') },
      {
        accessorKey: 'status',
        header: t('bets.columnStatus'),
        meta: { filter: 'select', options: BET_STATUS_OPTIONS },
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <BetStatusBadge status={row.original.status} />
            {(row.original.skipReason || row.original.errorMessage) && (
              <span className="text-xs text-muted-foreground">{row.original.skipReason || row.original.errorMessage}</span>
            )}
          </div>
        ),
      },
      { id: 'actions', header: () => <span className="block text-right">{t('accounts.columnActions')}</span>, enableSorting: false, cell: ({ row }) => <div className="flex justify-end"><RetryBetAction bet={row.original} /></div> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale],
  )

  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      emptyMessage={t('bets.noBetsYet')}
      toolbar={!compact}
      pagination={!compact}
      toolbarLeft={toolbarLeft}
      serverPagination={serverPagination}
    />
  )
}
