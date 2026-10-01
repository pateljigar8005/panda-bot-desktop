import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import type { BetLog } from '@/types'
import { BetStatusBadge } from './BetStatusBadge'
import { DataTable } from './DataTable'


// Every possible bet status, so the filter offers all of them
const BET_STATUS_OPTIONS = [
  { value: 'captured', label: 'Captured' },
  { value: 'executed', label: 'Executed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
]
const columns: ColumnDef<BetLog>[] = [
  { accessorKey: 'capturedAt', header: 'Time', meta: { filter: 'date' }, cell: ({ row }) => format(new Date(row.original.capturedAt), 'MMM d, HH:mm:ss') },
  { accessorKey: 'accountUsername', header: 'Account', meta: { filter: 'select' } },
  { accessorKey: 'event', header: 'Event', meta: { filter: 'text' } },
  { accessorKey: 'selection', header: 'Selection', meta: { filter: 'text' } },
  { accessorKey: 'odds', header: 'Odds', meta: { filter: 'number' }, cell: ({ row }) => row.original.odds.toFixed(2) },
  { accessorKey: 'stake', header: 'Stake', meta: { filter: 'number' }, cell: ({ row }) => `$${row.original.stake.toFixed(2)}` },
  { accessorKey: 'status', header: 'Status', meta: { filter: 'select', options: BET_STATUS_OPTIONS }, cell: ({ row }) => <BetStatusBadge status={row.original.status} /> },
]

interface BetsTableProps {
  data: BetLog[]
  loading?: boolean
  /** Plain table without search, filters or pagination (e.g. dashboard preview). */
  compact?: boolean
}

export function BetsTable({ data, loading, compact }: BetsTableProps) {
  return (
    <DataTable columns={columns} data={data} loading={loading} emptyMessage="No bets yet." toolbar={!compact} pagination={!compact} />
  )
}
