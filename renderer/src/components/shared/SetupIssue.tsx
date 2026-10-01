import { AlertTriangle, RefreshCw, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HeartbeatLogDialog } from '@/components/shared/HeartbeatLogDialog'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useRetrySetup } from '@/hooks/useAccounts'
import { getErrorMessage } from '@/services/api'
import type { Account } from '@/types'

const REASON_FALLBACK = 'Session details (sid/mc) could not be fetched from the platform.'

/** Compact badge for the accounts table: heartbeats aren't running because setup failed. Opens the setup log. */
export function SetupIssueBadge({ account }: { account: Account }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={account.setupError || REASON_FALLBACK}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-warning/50 px-2 py-0.5 text-xs font-semibold text-warning hover:bg-warning/10"
      >
        <AlertTriangle className="h-3 w-3" /> Not running
      </button>
      <HeartbeatLogDialog account={account} open={open} onOpenChange={setOpen} initialEvent="setup" />
    </>
  )
}

/** Banner for the account page, with the reason and a retry. */
export function SetupIssueAlert({ account }: { account: Account }) {
  const retry = useRetrySetup()
  const navigate = useNavigate()
  const viewLog = () => navigate(`/accounts/${account._id}?tab=activity`, { replace: true })
  return (
    <Alert className="border-warning/50 [&>svg]:text-warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Heartbeats are not running</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          This account has no session details (sid/mc) from the platform, so no heartbeats are sent.
          <br />
          <span className="text-muted-foreground">Last failure: </span>
          <span className="break-words font-medium">{account.setupError || REASON_FALLBACK}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(account._id, {
                onSuccess: () => toast.success('Setup complete — heartbeats started'),
                onError: (error) =>
                  toast.error('Setup failed', {
                    description: getErrorMessage(error), // the platform's reply, verbatim
                    action: { label: 'View log', onClick: viewLog },
                    duration: 15_000,
                  }),
              })
            }
          >
            {retry.isPending ? <Spinner /> : <RefreshCw />} Retry setup
          </Button>
          <Button size="sm" variant="outline" onClick={viewLog}>
            <ScrollText /> View log
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/accounts/${account._id}/edit`}>Update token URL</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
