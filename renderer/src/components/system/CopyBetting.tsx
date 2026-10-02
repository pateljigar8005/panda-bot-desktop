import { Radio, ShieldAlert, ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { RelativeTime } from '@/components/shared/RelativeTime'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useBrowserStatus } from '@/hooks/useBrowserAutomation'
import { useArmCopyBetting, useDisarmCopyBetting, useSystemStatus } from '@/hooks/useSystem'
import { getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'

function useDisarm() {
  const { t } = useTranslation()
  const disarm = useDisarmCopyBetting()
  return () =>
    disarm.mutate(undefined, {
      onSuccess: () => toast.success(t('copyBetting.disarmedToast')),
      onError: (error) => toast.error(t('copyBetting.disarmFailed'), { description: getErrorMessage(error) }),
    })
}

/** Confirm, then arm: from this point, a detected master bet gets replicated to sub-accounts. */
export function ArmCopyBettingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const arm = useArmCopyBetting()
  const confirm = () =>
    arm.mutate(undefined, {
      onSuccess: () => {
        toast.warning(t('copyBetting.armedToast'))
        onOpenChange(false)
      },
      onError: (error) => toast.error(t('copyBetting.armFailed'), { description: getErrorMessage(error) }),
    })

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('copyBetting.armTitle')}
      description={t('copyBetting.armDescription')}
      confirmLabel={t('copyBetting.arm')}
      loading={arm.isPending}
      onConfirm={confirm}
    />
  )
}

/** Settings → Automation: status, history and the controls. Disarming is instant — no dialog — so there's never friction stopping it. */
export function CopyBettingCard() {
  const { t } = useTranslation()
  const status = useSystemStatus()
  const [armOpen, setArmOpen] = useState(false)
  const disarm = useDisarmCopyBetting()
  const onDisarm = useDisarm()
  const cb = status.data?.copyBetting

  return (
    <Card className={cn(cb?.armed && 'border-warning')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-warning" /> {t('copyBetting.title')}
        </CardTitle>
        <CardDescription>{t('copyBetting.cardDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : cb?.armed ? (
          <Alert className="border-warning text-warning [&>svg]:text-warning">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>{t('copyBetting.armedTitle')}</AlertTitle>
            {cb.armedAt && (
              <AlertDescription className="text-warning">
                {t('copyBetting.armedSince')} <RelativeTime iso={cb.armedAt} />
              </AlertDescription>
            )}
          </Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
            <span>{t('copyBetting.notArmed')}</span>
            {cb?.disarmedAt && (
              <span className="text-muted-foreground">
                {t('copyBetting.lastDisarmed')} <RelativeTime iso={cb.disarmedAt} />
              </span>
            )}
          </div>
        )}

        {cb?.armed ? (
          <Button variant="outline" onClick={onDisarm} disabled={disarm.isPending}>
            {disarm.isPending ? <Spinner /> : <ShieldOff />} {t('copyBetting.disarm')}
          </Button>
        ) : (
          <Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => setArmOpen(true)} disabled={!status.data}>
            <Radio /> {t('copyBetting.arm')}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{t('copyBetting.scopeHint')}</p>
      </CardContent>
      <ArmCopyBettingDialog open={armOpen} onOpenChange={setArmOpen} />
    </Card>
  )
}

/**
 * Shown app-wide only when BOTH the master browser is open AND copy-betting is armed — that's the
 * one moment real money starts moving on its own, so it needs to be unmissable from any page.
 */
export function CopyBettingBanner() {
  const { t } = useTranslation()
  const status = useSystemStatus()
  const browser = useBrowserStatus()
  const disarm = useDisarmCopyBetting()
  const onDisarm = useDisarm()
  const armed = status.data?.copyBetting.armed
  const running = browser.data?.running
  if (!armed || !running) return null

  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-warning px-4 py-2.5 text-sm text-warning-foreground md:px-6">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 shrink-0" />
        <span>
          <b>{t('copyBetting.bannerOn')}</b> — {t('copyBetting.bannerDescription')}
        </span>
      </div>
      <Button size="sm" variant="secondary" className="h-7" onClick={onDisarm} disabled={disarm.isPending}>
        {disarm.isPending ? <Spinner /> : <ShieldOff />} {t('copyBetting.disarm')}
      </Button>
    </div>
  )
}
