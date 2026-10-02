import { Activity, AlertTriangle, ArrowLeft, PauseCircle, Pencil, Play, Power, PowerOff, ScrollText, Trash2, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
function Missing() {
  const { t } = useTranslation()
  return <span className="text-destructive">{t('accountDetail.notSet')}</span>
}

const when = (iso?: string) => <RelativeTime iso={iso} showExact />

/** Put on hold automatically after too many failed heartbeats: why, when, and the way out. */
function OnHoldAlert({ account, onResume, resuming, onViewLog }: { account: Account; onResume: () => void; resuming: boolean; onViewLog: () => void }) {
  const { t } = useTranslation()
  return (
    <Alert className="border-warning/50 [&>svg]:text-warning">
      <PauseCircle className="h-4 w-4" />
      <AlertTitle>{t('accountDetail.onHoldTitle')}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {account.holdReason ?? t('accountDetail.onHoldDefaultReason')}
          {account.heldAt && (
            <>
              {' '}
              <span className="text-muted-foreground">
                (<RelativeTime iso={account.heldAt} showExact />)
              </span>
            </>
          )}
        </p>
        <p className="text-muted-foreground">{t('accountDetail.onHoldHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onResume} disabled={resuming}>
            {resuming ? <Spinner /> : <Play />} {t('killSwitch.resume')}
          </Button>
          <Button size="sm" variant="outline" onClick={onViewLog}>
            <ScrollText /> {t('setupIssue.viewLog')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

export default function AccountDetail() {
  const { t } = useTranslation()
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
          <AlertTitle>{t('accountForm.couldNotLoad')}</AlertTitle>
          <AlertDescription>{getErrorMessage(error)}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to="/accounts">
            <ArrowLeft /> {t('accountDetail.backToAccounts')}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={account.name}
        description={t('accountDetail.uidDevice', { uid: account.uid, device: deviceLabel(account.deviceId) })}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/accounts">
                <ArrowLeft /> {t('common.back')}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => actions.runTest(account)} disabled={actions.testing}>
              {actions.testing ? <Spinner /> : <Wifi />} {t('accountDetail.testConnection')}
            </Button>
            {canToggle(account) && (
              <Button variant="outline" onClick={() => actions.toggleActive(account)} disabled={actions.toggling} title={toggleLabel(account)}>
                {actions.toggling ? <Spinner /> : isOff(account) ? <Power /> : <PowerOff />}
                {account.status === 'on_hold' ? t('killSwitch.resume') : account.status === 'inactive' ? t('accountDetail.activate') : t('accountDetail.deactivate')}
              </Button>
            )}
            <Button asChild>
              <Link to={`/accounts/${account._id}/edit`}>
                <Pencil /> {t('common.edit')}
              </Link>
            </Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 /> {t('common.delete')}
            </Button>
          </>
        }
      />

      {isSetupIncomplete(account) && <SetupIssueAlert account={account} />}
      {account.status === 'expired' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('accountDetail.tokenExpiredTitle')}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{t('accountDetail.tokenExpiredDescription')}</p>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/accounts/${account._id}/edit`}>
                <Pencil /> {t('setupIssue.updateTokenUrl')}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {account.status === 'on_hold' && <OnHoldAlert account={account} onResume={() => actions.toggleActive(account)} resuming={actions.toggling} onViewLog={() => setTab('activity')} />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">{t('accountDetail.tabOverview')}</TabsTrigger>
          <TabsTrigger value="bet-settings">{t('accountDetail.tabBetSettings')}</TabsTrigger>
          <TabsTrigger value="credentials">{t('accountDetail.tabCredentials')}</TabsTrigger>
          <TabsTrigger value="activity">{t('accountDetail.tabActivity')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="pt-6">
              <dl className="divide-y">
                <Row label={t('accounts.columnStatus')}><StatusBadge status={account.status} /></Row>
                <Row label={t('accounts.columnBalance')}>{account.lastBalance.toFixed(2)}</Row>
                <Row label={t('accounts.columnLastHeartbeat')}>{when(account.lastHeartbeatAt)}</Row>
                <Row label={t('accountDetail.heartbeatErrors')}>
                  <span className="inline-flex items-center gap-2">
                    {(account.consecutiveFailures ?? 0) > 0 && <span className="text-xs text-muted-foreground">{t('heartbeatLog.inARowNow', { count: account.consecutiveFailures })}</span>}
                    <HeartbeatErrorsButton account={account} />
                  </span>
                </Row>
                <Row label={t('accountDetail.totalBetsPlaced')}>{account.totalBetsPlaced}</Row>
                <Row label={t('accountDetail.proxy')}>
                  {!account.proxyId ? t('common.none') : proxy.data ? `${proxy.data.name} — ${proxy.data.host}:${proxy.data.port}` : account.proxyId}
                </Row>
                <Row label={t('accountDetail.created')}>{when(account.createdAt)}</Row>
                <Row label={t('accountDetail.updated')}>{when(account.updatedAt)}</Row>
                <Row label={t('accountForm.notes')}>{account.notes || '—'}</Row>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bet-settings">
          <Card>
            <CardHeader>
              <CardTitle>{t('accountForm.betSettings')}</CardTitle>
              <CardDescription>{t('accountDetail.betSettingsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label={t('accountForm.betMode')}>{t(account.betMode === 'fixed' ? 'accounts.betModeFixed' : 'accounts.betModeProportional')}</Row>
                {account.betMode === 'fixed' ? (
                  <Row label={t('accountForm.fixedAmount')}>{account.fixedAmount}</Row>
                ) : (
                  <Row label={t('accountForm.multiplier')}>×{account.multiplier}</Row>
                )}
                <Row label={t('accountForm.maxBetAmount')}>{account.maxBetAmount}</Row>
                <Row label={t('accountForm.minBalanceThreshold')}>{account.minBalanceThreshold}</Row>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credentials">
          <Card>
            <CardHeader>
              <CardTitle>{t('accountDetail.credentials')}</CardTitle>
              <CardDescription>{t('accountDetail.credentialsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label={t('accountForm.tokenUrl')}>{MASK}</Row>
                <Row label={t('accountDetail.token')}>{MASK}</Row>
                <Row label={t('accountDetail.sessionId')}>{MASK}</Row>
                <Row label={t('accountDetail.sid')}>{account.sid ? MASK : <Missing />}</Row>
                <Row label={t('accountDetail.mc')}>{account.mc ? MASK : <Missing />}</Row>
                <Row label={t('accountDetail.mId')}>{account.mId ?? '—'}</Row>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-3">
          {/* No inner scroll here: the page scrolls, and paging keeps it to 10 entries */}
          <HeartbeatLogPanel account={account} enabled={tab === 'activity'} listClassName="max-h-none overflow-visible" />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> {t('accountDetail.activityHint')}
          </p>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('accounts.deleteTitle')}
        description={t('accounts.deleteDescription', { name: account.name })}
        confirmLabel={t('common.delete')}
        loading={actions.deleting}
        onConfirm={() => actions.remove(account, () => navigate('/accounts', { replace: true }))}
      />
    </>
  )
}
