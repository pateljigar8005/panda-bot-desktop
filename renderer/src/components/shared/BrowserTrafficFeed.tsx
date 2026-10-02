import { CheckCircle2, ChevronLeft, ChevronRight, Eye, Search, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { domainLabel } from '@/components/shared/HeartbeatLogDialog'
import { IconAction } from '@/components/shared/IconAction'
import { RelativeTime } from '@/components/shared/RelativeTime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useBrowserTraffic, useClearBrowserTraffic } from '@/hooks/useBrowserTraffic'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'
import type { BrowserTrafficLog } from '@/types'

const LIMIT = 15

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

function DetailDialog({ entry, onClose }: { entry: BrowserTrafficLog | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 break-all">
                {entry.method} {entry.endpoint}
              </DialogTitle>
              <DialogDescription>
                <RelativeTime iso={entry.createdAt} showExact /> · {entry.statusCode ?? '—'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">{t('heartbeatLog.requestUrl')}</div>
                <div className="break-all rounded-md bg-muted p-2 font-mono text-xs">
                  {entry.method} {entry.url}
                </div>
              </div>
              <Json label={t('heartbeatLog.requestRedacted')} value={entry.requestPayload} />
              <Json label={t('heartbeatLog.response')} value={entry.responseBody} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Live feed of yewu* traffic captured from the master browser session, shown while it's open. */
export function BrowserTrafficFeed() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), 400)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<BrowserTrafficLog | null>(null)
  const clear = useClearBrowserTraffic()
  const [confirmClear, setConfirmClear] = useState(false)

  const traffic = useBrowserTraffic({ rangeMinutes: 24 * 60, q: q || undefined, sort: 'newest', page, limit: LIMIT })
  const pg = traffic.data?.pagination

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t('masterAccount.searchTraffic')}
            aria-label={t('masterAccount.searchTraffic')}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)}>
          <Trash2 /> {t('common.clear')}
        </Button>
      </div>

      <div className="divide-y rounded-md border">
        {traffic.isLoading ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="m-2 h-10" />)
        ) : !traffic.data?.traffic.length ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t('masterAccount.noTrafficYet')}</p>
        ) : (
          traffic.data.traffic.map((entry) => {
            const ok = entry.statusCode != null && entry.statusCode < 400
            return (
              <div key={entry._id} className="flex items-center gap-2 px-3 py-2 text-sm">
                {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{entry.method}</span>
                <span className="flex-1 truncate font-mono text-xs">{entry.endpoint}</span>
                <Badge variant="secondary" className="shrink-0 font-mono font-normal" title={entry.url}>
                  {domainLabel(entry.url)}
                </Badge>
                {entry.isBetOrder && <Badge variant="secondary">{t('masterAccount.betOrder')}</Badge>}
                <RelativeTime iso={entry.createdAt} />
                <IconAction label={t('heartbeatLog.viewResponseRequest')} icon={Eye} onClick={() => setSelected(entry)} />
              </div>
            )
          })
        )}
      </div>

      {pg && pg.pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">{t('dataTable.pageOf', { page: pg.page, pages: pg.pages })}</span>
          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || traffic.isFetching} aria-label={t('dataTable.previousPage')}>
            <ChevronLeft />
          </Button>
          <Button size="icon" variant="outline" className={cn('h-7 w-7')} onClick={() => setPage((p) => p + 1)} disabled={page >= pg.pages || traffic.isFetching} aria-label={t('dataTable.nextPage')}>
            <ChevronRight />
          </Button>
        </div>
      )}

      <DetailDialog entry={selected} onClose={() => setSelected(null)} />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('masterAccount.clearTrafficTitle')}
        description={t('masterAccount.clearTrafficDescription')}
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
    </div>
  )
}
