import { AlertTriangle, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { RelativeTime } from '@/components/shared/RelativeTime'
import { SelectField } from '@/components/shared/SelectField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useAccounts, useAssignProxy } from '@/hooks/useAccounts'
import { useProxies, useProxyAccounts } from '@/hooks/useProxies'
import { getErrorMessage } from '@/services/api'
import type { Proxy } from '@/types'

interface ProxyAccountsDialogProps {
  proxy: Proxy
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** See which accounts use a proxy (and when each last used it), add more, or remove them. */
export function ProxyAccountsDialog({ proxy, open, onOpenChange }: ProxyAccountsDialogProps) {
  const using = useProxyAccounts(proxy._id, open)
  const allAccounts = useAccounts({ limit: 100 })
  const allProxies = useProxies({ limit: 100 })
  const assign = useAssignProxy()
  const [toAdd, setToAdd] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)

  const proxyName = (id?: string | null) => allProxies.data?.proxies.find((p) => p._id === id)?.name ?? 'another proxy'
  const usingIds = new Set((using.data ?? []).map((a) => a._id))
  const addOptions = (allAccounts.data?.accounts ?? [])
    .filter((a) => !usingIds.has(a._id))
    .map((a) => ({ value: a._id, label: a.proxyId ? `${a.name} — moves from ${proxyName(a.proxyId)}` : a.name }))

  const add = () =>
    assign.mutate(
      { id: toAdd, proxyId: proxy._id },
      {
        onSuccess: (account) => {
          toast.success(`${account.name} now uses ${proxy.name}`)
          setToAdd('')
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    )

  const remove = (id: string, name: string) => {
    setRemovingId(id)
    assign.mutate(
      { id, proxyId: null },
      {
        onSuccess: () => toast.success(`${name} removed — it now connects directly`),
        onError: (error) => toast.error(getErrorMessage(error)),
        onSettled: () => setRemovingId(null),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Accounts using {proxy.name}</DialogTitle>
          <DialogDescription>
            {proxy.host}:{proxy.port} · {proxy.protocol.toUpperCase()}. One proxy can be shared by several accounts.
          </DialogDescription>
        </DialogHeader>

        {proxy.status === 'dead' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>This proxy failed its last health check. Accounts using it will fail their heartbeats.</AlertDescription>
          </Alert>
        )}

        {using.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Couldn’t load accounts: {getErrorMessage(using.error)}</AlertDescription>
          </Alert>
        ) : using.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : !using.data?.length ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">No accounts use this proxy yet.</p>
        ) : (
          <ul className="max-h-[45vh] divide-y overflow-y-auto rounded-md border">
            {using.data.map((a) => (
              <li key={a._id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Link to={`/accounts/${a._id}`} className="truncate font-medium hover:underline" onClick={() => onOpenChange(false)}>
                      {a.name}
                    </Link>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    UID {a.uid} · Last used through this proxy: <RelativeTime iso={a.proxyLastUsedAt} fallback="not yet" />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(a._id, a.name)}
                  disabled={assign.isPending}
                  aria-label={`Remove ${a.name} from this proxy`}
                >
                  {removingId === a._id ? <Spinner /> : <X />} Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1.5">
          <div className="text-sm font-medium">Add an account</div>
          <div className="flex gap-2">
            <SelectField
              value={toAdd}
              onChange={setToAdd}
              options={addOptions}
              placeholder={allAccounts.isLoading ? 'Loading accounts…' : addOptions.length ? 'Select an account' : 'All accounts already use this proxy'}
              disabled={allAccounts.isLoading || !addOptions.length}
              className="flex-1"
              aria-label="Account to add"
            />
            <Button onClick={add} disabled={!toAdd || assign.isPending}>
              {assign.isPending && !removingId ? <Spinner /> : <Plus />} Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">An account uses one proxy at a time; adding it here moves it from its current proxy.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
