import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { BetLog } from '@/types'
import { BetStatusBadge } from './BetStatusBadge'
import { DataTable } from './DataTable'

interface BetsTableProps {
  data: BetLog[]
  loading?: boolean
  /** Plain table without search, filters or pagination (e.g. dashboard preview). */
  compact?: boolean
}

export function BetsTable({ data, loading, compact }: BetsTableProps) {
  const { t } = useTranslation()

  // Every possible bet status, so the filter offers all of them
  const BET_STATUS_OPTIONS = [
    { value: 'captured', label: t('betStatus.captured') },
    { value: 'executed', label: t('betStatus.executed') },
    { value: 'failed', label: t('betStatus.failed') },
    { value: 'skipped', label: t('betStatus.skipped') },
  ]
  const columns: ColumnDef<BetLog>[] = useMemo(
    () => [
      { accessorKey: 'capturedAt', header: t('bets.columnTime'), meta: { filter: 'date' }, cell: ({ row }) => format(new Date(row.original.capturedAt), 'MMM d, HH:mm:ss') },
      { accessorKey: 'accountUsername', header: t('bets.columnAccount'), meta: { filter: 'select' } },
      { accessorKey: 'event', header: t('bets.columnEvent'), meta: { filter: 'text' } },
      { accessorKey: 'selection', header: t('bets.columnSelection'), meta: { filter: 'text' } },
      { accessorKey: 'odds', header: t('bets.columnOdds'), meta: { filter: 'number' }, cell: ({ row }) => row.original.odds.toFixed(2) },
      { accessorKey: 'stake', header: t('bets.columnStake'), meta: { filter: 'number' }, cell: ({ row }) => `$${row.original.stake.toFixed(2)}` },
      { accessorKey: 'status', header: t('bets.columnStatus'), meta: { filter: 'select', options: BET_STATUS_OPTIONS }, cell: ({ row }) => <BetStatusBadge status={row.original.status} /> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  return (
    <DataTable columns={columns} data={data} loading={loading} emptyMessage={t('bets.noBetsYet')} toolbar={!compact} pagination={!compact} />
  )
}
