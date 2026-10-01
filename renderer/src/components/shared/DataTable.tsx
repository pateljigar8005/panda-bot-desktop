import { useMemo, useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { endOfDay, startOfDay } from 'date-fns'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/shared/DatePicker'
import { SelectField, toOption } from '@/components/shared/SelectField'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type ColumnFilterType = 'text' | 'select' | 'number' | 'date'

declare module '@tanstack/react-table' {
  // Type parameters must match the library's declaration exactly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Enables this column in the advanced filter panel. */
    filter?: ColumnFilterType
    /**
     * For 'select' filters with a known set of values: always offer all of them (value = what the
     * column's accessor returns). Without it, options come from the rows currently loaded.
     */
    options?: { value: string; label: string }[]
  }
}

type Range = [string, string]

const numberClass = 'h-9 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

const dateRangeFilter: FilterFn<never> = (row, columnId, value: Range) => {
  const [from, to] = value
  const raw = row.getValue<string | undefined>(columnId)
  if (!raw) return false
  const time = new Date(raw).getTime()
  if (from && time < startOfDay(new Date(from)).getTime()) return false
  if (to && time > endOfDay(new Date(to)).getTime()) return false
  return true
}
dateRangeFilter.autoRemove = (val: Range) => !val || (!val[0] && !val[1])

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  loading?: boolean
  emptyMessage?: string
  /** Show search, filters and sortable headers' toolbar. Default true. */
  toolbar?: boolean
  /** Show pagination footer. Default true. */
  pagination?: boolean
  pageSize?: number
  /** Show the built-in search box. Default true. */
  globalSearch?: boolean
  /** Extra controls rendered at the start of the toolbar (e.g. a server-side status filter). */
  toolbarLeft?: ReactNode
  /** When set, pages are fetched from the server; sort/filter still apply to the loaded page. */
  serverPagination?: ServerPagination
}

export interface ServerPagination {
  page: number
  limit: number
  total: number
  pages: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
}

/** TanStack Table v8 wrapper: sorting, global search, per-column advanced filters and pagination. */
export function DataTable<TData>({
  columns,
  data,
  loading,
  emptyMessage,
  toolbar = true,
  pagination = true,
  pageSize = 10,
  globalSearch = true,
  toolbarLeft,
  serverPagination,
}: DataTableProps<TData>) {
  const { t } = useTranslation()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [showFilters, setShowFilters] = useState(false)

  // Pick a filter function from `meta.filter` unless the column already defines one.
  const resolvedColumns = useMemo(
    () =>
      columns.map((col) => {
        if (col.filterFn || !col.meta?.filter) return col
        const filterFn =
          col.meta.filter === 'number' ? 'inNumberRange' : col.meta.filter === 'date' ? dateRangeFilter : col.meta.filter === 'select' ? 'equalsString' : 'includesString'
        return { ...col, filterFn } as ColumnDef<TData, unknown>
      }),
    [columns],
  )

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: pagination && !serverPagination ? getPaginationRowModel() : undefined,
    manualPagination: !!serverPagination,
    pageCount: serverPagination?.pages,
    initialState: { pagination: { pageSize } },
  })

  const filterable = table.getAllLeafColumns().filter((c) => c.columnDef.meta?.filter)
  const activeCount = columnFilters.length
  const isFiltered = activeCount > 0 || globalFilter !== ''
  const clearAll = () => {
    setGlobalFilter('')
    setColumnFilters([])
  }

  const local = table.getState().pagination
  const filteredTotal = serverPagination ? serverPagination.total : table.getFilteredRowModel().rows.length
  // With server paging, filters/search only apply to the loaded page: count matches on it, not the server total
  const pageMatches = table.getFilteredRowModel().rows.length
  const matchCount = serverPagination && isFiltered ? pageMatches : filteredTotal
  const pageIndex = serverPagination ? serverPagination.page - 1 : local.pageIndex
  const size = serverPagination ? serverPagination.limit : local.pageSize
  const pageCount = serverPagination ? Math.max(serverPagination.pages, 1) : table.getPageCount()
  const canPrev = serverPagination ? serverPagination.page > 1 : table.getCanPreviousPage()
  const canNext = serverPagination ? serverPagination.page < serverPagination.pages : table.getCanNextPage()
  const goPrev = () => (serverPagination ? serverPagination.onPageChange(serverPagination.page - 1) : table.previousPage())
  const goNext = () => (serverPagination ? serverPagination.onPageChange(serverPagination.page + 1) : table.nextPage())
  const setSize = (n: number) => (serverPagination ? serverPagination.onLimitChange(n) : table.setPageSize(n))
  const from = filteredTotal === 0 ? 0 : pageIndex * size + 1
  const to = Math.min((pageIndex + 1) * size, filteredTotal)

  return (
    <div className="space-y-3">
      {toolbar && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {toolbarLeft}
            {globalSearch && (
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={t('dataTable.searchPlaceholder')}
                aria-label={t('common.search')}
                className="pl-9"
              />
            </div>
            )}
            {filterable.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowFilters(true)}
                aria-haspopup="dialog"
              >
                <SlidersHorizontal /> {t('common.filters')}
                {activeCount > 0 && <Badge className="ml-1 px-1.5 py-0">{activeCount}</Badge>}
              </Button>
            )}
            {isFiltered && (
              <Button variant="ghost" onClick={clearAll}>
                <X /> {t('common.clear')}
              </Button>
            )}
          </div>

          {filterable.length > 0 && (
            <Dialog open={showFilters} onOpenChange={setShowFilters}>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t('dataTable.advancedSearch')}</DialogTitle>
                  <DialogDescription>{t('dataTable.advancedSearchDescription')}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2 sm:grid-cols-2">
                  {filterable.map((column) => (
                    <ColumnFilter key={column.id} column={column} data={data} />
                  ))}
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setColumnFilters([])} disabled={activeCount === 0}>
                    {t('dataTable.clearFilters')}
                  </Button>
                  <Button onClick={() => setShowFilters(false)}>
                    {serverPagination && isFiltered ? t('dataTable.showResultsOnPage', { count: matchCount }) : t('dataTable.showResults', { count: matchCount })}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-ml-2 inline-flex items-center gap-1.5 rounded px-2 py-1 outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon className={cn('h-3.5 w-3.5', !sorted && 'opacity-40')} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {isFiltered ? t('dataTable.noResultsFiltered') : (emptyMessage ?? t('dataTable.noResults'))}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && !loading && filteredTotal > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span>
            {serverPagination && isFiltered
              ? t('dataTable.pageMatches', { pageMatches, pageTotal: data.length, filteredTotal })
              : isFiltered
                ? t('dataTable.showingFiltered', { from, to, filteredTotal, dataTotal: data.length })
                : t('dataTable.showing', { from, to, filteredTotal })}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              {t('dataTable.rows')}
              <SelectField
                value={String(size)}
                onChange={(v) => setSize(Number(v))}
                options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
                className="h-9 w-20"
                aria-label={t('dataTable.rowsPerPage')}
              />
            </label>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrev} disabled={!canPrev} aria-label={t('dataTable.previousPage')}>
              <ChevronLeft />
            </Button>
            <span className="min-w-[5rem] text-center">
              {t('dataTable.pageOf', { page: pageIndex + 1, pages: pageCount })}
            </span>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={goNext} disabled={!canNext} aria-label={t('dataTable.nextPage')}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ColumnFilter<TData>({ column, data }: { column: Column<TData, unknown>; data: TData[] }) {
  const { t } = useTranslation()
  const type = column.columnDef.meta?.filter
  const label = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id
  const id = `filter-${column.id}`

  const fixedOptions = column.columnDef.meta?.options
  const options = useMemo(() => {
    if (type !== 'select' || !column.accessorFn) return []
    const seen = Array.from(new Set(data.map((row, i) => column.accessorFn!(row, i)).filter((v) => v != null && v !== '').map(String))).sort()
    if (!fixedOptions) return seen.map(toOption)
    // Known values first (all of them, in their defined order), then anything unexpected found in the data
    const known = new Set(fixedOptions.map((o) => o.value))
    return [...fixedOptions, ...seen.filter((v) => !known.has(v)).map(toOption)]
  }, [type, column, data, fixedOptions])

  const value = column.getFilterValue()
  const range = (Array.isArray(value) ? value : ['', '']) as Range
  const setRange = (index: 0 | 1, next: string) => {
    const updated: Range = [range[0], range[1]]
    updated[index] = next
    column.setFilterValue(updated[0] || updated[1] ? updated : undefined)
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {type === 'text' && (
        <Input id={id} value={(value as string) ?? ''} onChange={(e) => column.setFilterValue(e.target.value || undefined)} placeholder={t('dataTable.filterLabel', { label: label.toLowerCase() })} className="h-9" />
      )}
      {type === 'select' && (
        <SelectField
          id={id}
          value={(value as string) ?? ''}
          onChange={(v) => column.setFilterValue(v || undefined)}
          options={options}
          emptyLabel={t('common.all')}
          className="h-9"
        />
      )}
      {type === 'number' && (
        <div className="flex items-center gap-2">
          <Input id={id} type="number" inputMode="decimal" value={range[0]} onChange={(e) => setRange(0, e.target.value)} placeholder={t('dataTable.min')} aria-label={t('dataTable.labelMinimum', { label })} className={numberClass} />
          <Input type="number" inputMode="decimal" value={range[1]} onChange={(e) => setRange(1, e.target.value)} placeholder={t('dataTable.max')} aria-label={t('dataTable.labelMaximum', { label })} className={numberClass} />
        </div>
      )}
      {type === 'date' && (
        <div className="flex items-center gap-2">
          <DatePicker value={range[0]} max={range[1] || undefined} onChange={(v) => setRange(0, v)} placeholder={t('dataTable.from')} aria-label={t('dataTable.labelFrom', { label })} />
          <DatePicker value={range[1]} min={range[0] || undefined} onChange={(v) => setRange(1, v)} placeholder={t('dataTable.to')} aria-label={t('dataTable.labelTo', { label })} />
        </div>
      )}
    </div>
  )
}
