import { Activity, AlertTriangle, ArrowLeft, PauseCircle, Pencil, Play, Power, PowerOff, ScrollText, Trash2, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { HeartbeatErrorsButton, HeartbeatLogPanel } from '@/components/shared/HeartbeatLogDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { RelativeTime } from '@/components/shared/RelativeTime'
import { SetupIssueAlert } from '@/components/shared/SetupIssue'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { canToggle, isOff, toggleLabel, useAccountActions } from '@/hooks/useAccountActions'
import { isSetupIncomplete, useAccount } from '@/hooks/useAccounts'
import { useTabParam } from '@/hooks/useTabParam'
import { useProxy } from '@/hooks/useProxies'
import { getErrorMessage } from '@/services/api'
import type { Account } from '@/types'
import { deviceLabel } from './Accounts'

const MASK = '••••••••'
const TABS = ['overview', 'bet-settings', 'credentials', 'activity'] as const

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm font-medium sm:text-right">{children}</dd>
    </div>
  )
}

/** sid / mc come from the platform lookup; without them the account can't heartbeat. */
const Missing = () => <span className="text-destructive">Not set — update the token URL</span>

const when = (iso?: string) => <RelativeTime iso={iso} showExact />

/** Put on hold automatically after too many failed heartbeats: why, when, and the way out. */
function OnHoldAlert({ account, onResume, resuming, onViewLog }: { account: Account; onResume: () => void; resuming: boolean; onViewLog: () => void }) {
  return (
    <Alert className="border-warning/50 [&>svg]:text-warning">
      <PauseCircle className="h-4 w-4" />
      <AlertTitle>On hold — no requests are being sent</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {account.holdReason ?? 'Paused automatically after too many failed heartbeats in a row.'}
          {account.heldAt && (
            <>
              {' '}
              <span className="text-muted-foreground">
                (<RelativeTime iso={account.heldAt} showExact />)
              </span>
            </>
          )}
        </p>
        <p className="text-muted-foreground">Check the activity log for the cause, fix it (e.g. a dead proxy or expired token), then resume.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onResume} disabled={resuming}>
            {resuming ? <Spinner /> : <Play />} Resume
          </Button>
          <Button size="sm" variant="outline" onClick={onViewLog}>
            <ScrollText /> View log
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: account, isLoading, isError, error } = useAccount(id)
  const proxy = useProxy(account?.proxyId ?? undefined)
  const actions = useAccountActions()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [tab, setTab] = useTabParam(TABS, 'overview')

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (isError || !account) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn’t load account</AlertTitle>
          <AlertDescription>{getErrorMessage(error)}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to="/accounts">
            <ArrowLeft /> Back to accounts
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={account.name}
        description={`UID ${account.uid} · ${deviceLabel(account.deviceId)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/accounts">
                <ArrowLeft /> Back
              </Link>
            </Button>
            <Button variant="outline" onClick={() => actions.runTest(account)} disabled={actions.testing}>
              {actions.testing ? <Spinner /> : <Wifi />} Test connection
            </Button>
            {canToggle(account) && (
              <Button variant="outline" onClick={() => actions.toggleActive(account)} disabled={actions.toggling} title={toggleLabel(account)}>
                {actions.toggling ? <Spinner /> : isOff(account) ? <Power /> : <PowerOff />}
                {account.status === 'on_hold' ? 'Resume' : account.status === 'inactive' ? 'Activate' : 'Deactivate'}
              </Button>
            )}
            <Button asChild>
              <Link to={`/accounts/${account._id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 /> Delete
            </Button>
          </>
        }
      />

      {isSetupIncomplete(account) && <SetupIssueAlert account={account} />}
      {account.status === 'expired' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Token expired — no requests are being sent</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>The platform rejected this account’s token. Paste a fresh token URL from the emulator; the account starts again automatically once the platform accepts it.</p>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/accounts/${account._id}/edit`}>
                <Pencil /> Update token URL
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {account.status === 'on_hold' && <OnHoldAlert account={account} onResume={() => actions.toggleActive(account)} resuming={actions.toggling} onViewLog={() => setTab('activity')} />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bet-settings">Bet Settings</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="pt-6">
              <dl className="divide-y">
                <Row label="Status"><StatusBadge status={account.status} /></Row>
                <Row label="Balance">{account.lastBalance.toFixed(2)}</Row>
                <Row label="Last heartbeat">{when(account.lastHeartbeatAt)}</Row>
                <Row label="Heartbeat errors">
                  <span className="inline-flex items-center gap-2">
                    {(account.consecutiveFailures ?? 0) > 0 && <span className="text-xs text-muted-foreground">{account.consecutiveFailures} in a row now</span>}
                    <HeartbeatErrorsButton account={account} />
                  </span>
                </Row>
                <Row label="Total bets placed">{account.totalBetsPlaced}</Row>
                <Row label="Proxy">
                  {!account.proxyId ? 'None' : proxy.data ? `${proxy.data.name} — ${proxy.data.host}:${proxy.data.port}` : account.proxyId}
                </Row>
                <Row label="Created">{when(account.createdAt)}</Row>
                <Row label="Updated">{when(account.updatedAt)}</Row>
                <Row label="Notes">{account.notes || '—'}</Row>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bet-settings">
          <Card>
            <CardHeader>
              <CardTitle>Bet settings</CardTitle>
              <CardDescription>Change these from the Edit form.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label="Bet mode"><span className="capitalize">{account.betMode}</span></Row>
                {account.betMode === 'fixed' ? (
                  <Row label="Fixed amount">{account.fixedAmount}</Row>
                ) : (
                  <Row label="Multiplier">×{account.multiplier}</Row>
                )}
                <Row label="Max bet amount">{account.maxBetAmount}</Row>
                <Row label="Min balance threshold">{account.minBalanceThreshold}</Row>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credentials">
          <Card>
            <CardHeader>
              <CardTitle>Credentials</CardTitle>
              <CardDescription>Secrets are stored encrypted and never shown in the dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label="Token URL">{MASK}</Row>
                <Row label="Token">{MASK}</Row>
                <Row label="Session ID">{MASK}</Row>
                <Row label="SID">{account.sidEncrypted ? MASK : <Missing />}</Row>
                <Row label="MC">{account.mcEncrypted ? MASK : <Missing />}</Row>
                <Row label="M ID">{account.mId ?? '—'}</Row>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-3">
          {/* No inner scroll here: the page scrolls, and paging keeps it to 10 entries */}
          <HeartbeatLogPanel account={account} enabled={tab === 'activity'} listClassName="max-h-none overflow-visible" />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> Heartbeats and setup attempts are logged. Bets will appear here once bet placement is built.
          </p>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete account?"
        description={`“${account.name}” will be permanently removed. This can't be undone.`}
        confirmLabel="Delete"
        loading={actions.deleting}
        onConfirm={() => actions.remove(account, () => navigate('/accounts', { replace: true }))}
      />
    </>
  )
}
