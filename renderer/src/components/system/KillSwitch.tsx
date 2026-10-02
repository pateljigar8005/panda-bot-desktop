import { OctagonX, Play, Power } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatExact, RelativeTime } from '@/components/shared/RelativeTime'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDateLocale } from '@/hooks/useDateLocale'
import { useActivateKillSwitch, useReleaseKillSwitch, useSystemStatus } from '@/hooks/useSystem'
import { getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'
import type { KillSwitchResult } from '@/types'

function useReportWarnings() {
  const { t } = useTranslation()
  return (result: KillSwitchResult) => {
    for (const w of result.warnings) toast.warning(t('killSwitch.warningTitle'), { description: w, duration: 20_000 })
  }
}

/** Confirm, optionally give a reason, then stop everything. */
export function ActivateKillSwitchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const activate = useActivateKillSwitch()
  const reportWarnings = useReportWarnings()
  const [reason, setReason] = useState('')

  const confirm = () =>
    activate.mutate(reason || undefined, {
      onSuccess: (r) => {
        toast.error(t('killSwitch.activatedTitle'), {
          description:
            t('killSwitch.stoppedLoops', { count: r.stoppedHeartbeats ?? 0 }) +
            (r.clearedQueues?.length ? `, ${t('killSwitch.clearedQueues', { count: r.clearedQueues.length })}` : '') +
            '.',
          duration: 10_000,
        })
        reportWarnings(r)
        setReason('')
        onOpenChange(false)
      },
      onError: (error) => toast.error(t('killSwitch.activateFailed'), { description: getErrorMessage(error) }),
    })

  return (
    <Dialog open={open} onOpenChange={(next) => !activate.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <OctagonX className="h-5 w-5" /> {t('killSwitch.stopEverything')}
          </DialogTitle>
          <DialogDescription>{t('killSwitch.stopEverythingDescription')}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{t('killSwitch.bulletHeartbeats')}</li>
          <li>{t('killSwitch.bulletQueues')}</li>
          <li>{t('killSwitch.bulletNoRestart')}</li>
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="kill-reason">{t('killSwitch.reasonOptional')}</Label>
          <Textarea id="kill-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('killSwitch.reasonPlaceholder')} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={activate.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={activate.isPending}>
            {activate.isPending ? <Spinner /> : <OctagonX />} {t('killSwitch.stopEverything')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Confirm resuming: heartbeats restart for all active accounts. */
export function ReleaseKillSwitchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const release = useReleaseKillSwitch()
  const reportWarnings = useReportWarnings()
  const confirm = () =>
    release.mutate(undefined, {
      onSuccess: (r) => {
        toast.success(t('killSwitch.resumedTitle'), { description: t('killSwitch.restartedLoops', { count: r.restartedHeartbeats ?? 0 }) })
        reportWarnings(r)
        onOpenChange(false)
      },
      onError: (error) => toast.error(t('killSwitch.resumeFailed'), { description: getErrorMessage(error), duration: 15_000 }),
    })

  return (
    <Dialog open={open} onOpenChange={(next) => !release.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('killSwitch.resumeTitle')}</DialogTitle>
          <DialogDescription>{t('killSwitch.resumeDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={release.isPending}>
            {t('killSwitch.keepStopped')}
          </Button>
          <Button onClick={confirm} disabled={release.isPending}>
            {release.isPending ? <Spinner /> : <Play />} {t('killSwitch.resume')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Always-visible top bar control: one click (plus confirmation) to stop everything. */
export function KillSwitchTopbarButton() {
  const { t } = useTranslation()
  const status = useSystemStatus()
  const [open, setOpen] = useState(false)
  const active = status.data?.killSwitch.active

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {active ? (
            <Button size="sm" variant="destructive" className="h-8 gap-1.5 rounded-full px-3 text-xs font-semibold" onClick={() => setOpen(true)}>
              <OctagonX className="h-4 w-4" /> {t('killSwitch.stopped')}
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setOpen(true)}
              aria-label={t('killSwitch.stopEverything')}
              disabled={!status.data}
            >
              <Power />
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent>{active ? t('killSwitch.onClickToResume') : t('killSwitch.stopEverything')}</TooltipContent>
      </Tooltip>
      {active ? <ReleaseKillSwitchDialog open={open} onOpenChange={setOpen} /> : <ActivateKillSwitchDialog open={open} onOpenChange={setOpen} />}
    </>
  )
}

/** Red banner across the dashboard while the kill switch is on. */
export function KillSwitchBanner() {
  const { t } = useTranslation()
  const status = useSystemStatus()
  const [open, setOpen] = useState(false)
  const ks = status.data?.killSwitch
  if (!ks?.active) return null

  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-destructive px-4 py-2.5 text-sm text-destructive-foreground md:px-6">
      <div className="flex items-center gap-2">
        <OctagonX className="h-4 w-4 shrink-0" />
        <span>
          <b>{t('killSwitch.bannerOn')}</b> — {t('killSwitch.bannerStopped')}
          {ks.activatedAt && (
            <>
              {' '}{t('killSwitch.activated')} <RelativeTime iso={ks.activatedAt} />.
            </>
          )}
          {ks.reason && <> {t('killSwitch.reason', { reason: ks.reason })}</>}
        </span>
      </div>
      <Button size="sm" variant="secondary" className="h-7" onClick={() => setOpen(true)}>
        <Play /> {t('killSwitch.resume')}
      </Button>
      <ReleaseKillSwitchDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

/** Settings → Automation: status, history and the controls. */
export function KillSwitchCard() {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const status = useSystemStatus()
  const [activateOpen, setActivateOpen] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const ks = status.data?.killSwitch

  return (
    <Card className={cn(ks?.active && 'border-destructive')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <OctagonX className="h-5 w-5 text-destructive" /> {t('killSwitch.title')}
        </CardTitle>
        <CardDescription>{t('killSwitch.cardDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : ks?.active ? (
          <Alert variant="destructive">
            <OctagonX className="h-4 w-4" />
            <AlertTitle>{t('killSwitch.activeTitle')}</AlertTitle>
            <AlertDescription className="space-y-0.5">
              {ks.activatedAt && <div>{t('killSwitch.since', { time: formatExact(ks.activatedAt, locale) })}</div>}
              {ks.reason && <div>{t('killSwitch.reason', { reason: ks.reason })}</div>}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span>{t('killSwitch.notActive', { count: status.data?.runningHeartbeats ?? 0 })}</span>
            {ks?.releasedAt && <span className="text-muted-foreground">{t('killSwitch.lastResumed', { time: formatExact(ks.releasedAt, locale) })}</span>}
          </div>
        )}

        {ks?.active ? (
          <Button onClick={() => setReleaseOpen(true)}>
            <Play /> {t('killSwitch.resumeOperations')}
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setActivateOpen(true)} disabled={!status.data}>
            <Power /> {t('killSwitch.activate')}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {t('killSwitch.alsoAvailable')} <Power className="inline h-3.5 w-3.5 text-destructive" /> {t('killSwitch.topBarHint')}
        </p>
      </CardContent>
      <ActivateKillSwitchDialog open={activateOpen} onOpenChange={setActivateOpen} />
      <ReleaseKillSwitchDialog open={releaseOpen} onOpenChange={setReleaseOpen} />
    </Card>
  )
}
