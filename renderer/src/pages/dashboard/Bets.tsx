import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Stat } from '@/components/shared/HeartbeatLogDialog'
import { BetsTable } from '@/components/shared/BetsTable'
import { PageHeader } from '@/components/shared/PageHeader'
import { SelectField } from '@/components/shared/SelectField'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBets } from '@/hooks/useBets'
import { getErrorMessage } from '@/services/api'
import type { BetStatus } from '@/types'

export default function Bets() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [status, setStatus] = useState<BetStatus | ''>('')

  const STATUS_OPTIONS = [
    { value: 'captured', label: t('betStatus.captured') },
    { value: 'executed', label: t('betStatus.executed') },
    { value: 'failed', label: t('betStatus.failed') },
    { value: 'skipped', label: t('betStatus.skipped') },
  ]

  const { data, isLoading, isError, error, refetch, isFetching } = useBets({ page, limit, status: status || undefined })
  const s = data?.stats

  return (
    <>
      <PageHeader
        title={t('betsPage.title')}
        description={t('betsPage.description')}
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} /> {t('common.refresh')}
          </Button>
        }
      />

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('betsPage.couldNotLoad')}</AlertTitle>
          <AlertDescription>{getErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[62px]" />)
        ) : (
          <>
            <Stat label={t('betsPage.statTotal')} value={s?.total ?? 0} />
            <Stat label={t('betStatus.executed')} value={s?.executed ?? 0} tone="good" />
            <Stat label={t('betStatus.failed')} value={s?.failed ?? 0} tone={s?.failed ? 'bad' : undefined} />
            <Stat label={t('betStatus.skipped')} value={s?.skipped ?? 0} />
          </>
        )}
      </div>

      <BetsTable
        data={data?.bets ?? []}
        loading={isLoading}
        toolbarLeft={
          <SelectField
            value={status}
            onChange={(v) => {
              setStatus(v as BetStatus | '')
              setPage(1)
            }}
            options={STATUS_OPTIONS}
            emptyLabel={t('auditLog.allResults')}
            className="w-44"
            aria-label={t('bets.columnStatus')}
          />
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
    </>
  )
}
