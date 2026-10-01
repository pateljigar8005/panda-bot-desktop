import { AlertTriangle, RefreshCw, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HeartbeatLogDialog } from '@/components/shared/HeartbeatLogDialog'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useRetrySetup } from '@/hooks/useAccounts'
import { getErrorMessage } from '@/services/api'
import type { Account } from '@/types'

/** Compact badge for the accounts table: heartbeats aren't running because setup failed. Opens the setup log. */
export function SetupIssueBadge({ account }: { account: Account }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={account.setupError || t('setupIssue.reasonFallback')}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-warning/50 px-2 py-0.5 text-xs font-semibold text-warning hover:bg-warning/10"
      >
        <AlertTriangle className="h-3 w-3" /> {t('setupIssue.notRunning')}
      </button>
      <HeartbeatLogDialog account={account} open={open} onOpenChange={setOpen} initialEvent="setup" />
    </>
  )
}

/** Banner for the account page, with the reason and a retry. */
export function SetupIssueAlert({ account }: { account: Account }) {
  const { t } = useTranslation()
  const retry = useRetrySetup()
  const navigate = useNavigate()
  const viewLog = () => navigate(`/accounts/${account._id}?tab=activity`, { replace: true })
  return (
    <Alert className="border-warning/50 [&>svg]:text-warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('setupIssue.heartbeatsNotRunning')}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {t('setupIssue.explanation')}
          <br />
          <span className="text-muted-foreground">{t('setupIssue.lastFailure')} </span>
          <span className="break-words font-medium">{account.setupError || t('setupIssue.reasonFallback')}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(account._id, {
                onSuccess: () => toast.success(t('setupIssue.retrySuccess')),
                onError: (error) =>
                  toast.error(t('setupIssue.retryFailed'), {
                    description: getErrorMessage(error), // the platform's reply, verbatim
                    action: { label: t('setupIssue.viewLog'), onClick: viewLog },
                    duration: 15_000,
                  }),
              })
            }
          >
            {retry.isPending ? <Spinner /> : <RefreshCw />} {t('setupIssue.retrySetup')}
          </Button>
          <Button size="sm" variant="outline" onClick={viewLog}>
            <ScrollText /> {t('setupIssue.viewLog')}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/accounts/${account._id}/edit`}>{t('setupIssue.updateTokenUrl')}</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
