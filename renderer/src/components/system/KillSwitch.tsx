import { OctagonX, Play, Power } from 'lucide-react'
import { useState } from 'react'
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
import { useActivateKillSwitch, useReleaseKillSwitch, useSystemStatus } from '@/hooks/useSystem'
import { getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'
import type { KillSwitchResult } from '@/types'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function reportWarnings(result: KillSwitchResult) {
  for (const w of result.warnings) toast.warning('Kill switch warning', { description: w, duration: 20_000 })
}

/** Confirm, optionally give a reason, then stop everything. */
export function ActivateKillSwitchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const activate = useActivateKillSwitch()
  const [reason, setReason] = useState('')

  const confirm = () =>
    activate.mutate(reason || undefined, {
      onSuccess: (r) => {
        toast.error('Kill switch activated — everything is stopped', {
          description: `Stopped ${plural(r.stoppedHeartbeats ?? 0, 'heartbeat loop')}${r.clearedQueues?.length ? `, cleared ${plural(r.clearedQueues.length, 'queue')}` : ''}.`,
          duration: 10_000,
        })
        reportWarnings(r)
        setReason('')
        onOpenChange(false)
      },
      onError: (error) => toast.error('Could not activate the kill switch', { description: getErrorMessage(error) }),
    })

  return (
    <Dialog open={open} onOpenChange={(next) => !activate.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <OctagonX className="h-5 w-5" /> Stop everything?
          </DialogTitle>
          <DialogDescription>Use this if something is going wrong. It takes effect immediately, for every account.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>All heartbeats stop, for every account</li>
          <li>Every queued job (e.g. pending bets) is deleted</li>
          <li>Nothing restarts — not even after a server restart — until someone resumes</li>
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="kill-reason">Reason (optional)</Label>
          <Textarea id="kill-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Unexpected bets being placed" />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={activate.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={activate.isPending}>
            {activate.isPending ? <Spinner /> : <OctagonX />} Stop everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Confirm resuming: heartbeats restart for all active accounts. */
export function ReleaseKillSwitchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const release = useReleaseKillSwitch()
  const confirm = () =>
    release.mutate(undefined, {
      onSuccess: (r) => {
        toast.success('Operations resumed', { description: `Restarted ${plural(r.restartedHeartbeats ?? 0, 'heartbeat loop')}.` })
        reportWarnings(r)
        onOpenChange(false)
      },
      onError: (error) => toast.error('Could not resume', { description: getErrorMessage(error), duration: 15_000 }),
    })

  return (
    <Dialog open={open} onOpenChange={(next) => !release.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resume operations?</DialogTitle>
          <DialogDescription>
            Heartbeats restart for every active account, and automation is allowed again. Make sure whatever caused the stop is fixed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={release.isPending}>
            Keep stopped
          </Button>
          <Button onClick={confirm} disabled={release.isPending}>
            {release.isPending ? <Spinner /> : <Play />} Resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Always-visible top bar control: one click (plus confirmation) to stop everything. */
export function KillSwitchTopbarButton() {
  const status = useSystemStatus()
  const [open, setOpen] = useState(false)
  const active = status.data?.killSwitch.active

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {active ? (
            <Button size="sm" variant="destructive" className="h-8 gap-1.5 rounded-full px-3 text-xs font-semibold" onClick={() => setOpen(true)}>
              <OctagonX className="h-4 w-4" /> STOPPED
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setOpen(true)}
              aria-label="Kill switch — stop everything"
              disabled={!status.data}
            >
              <Power />
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent>{active ? 'Kill switch is on — click to resume' : 'Kill switch — stop everything'}</TooltipContent>
      </Tooltip>
      {active ? <ReleaseKillSwitchDialog open={open} onOpenChange={setOpen} /> : <ActivateKillSwitchDialog open={open} onOpenChange={setOpen} />}
    </>
  )
}

/** Red banner across the dashboard while the kill switch is on. */
export function KillSwitchBanner() {
  const status = useSystemStatus()
  const [open, setOpen] = useState(false)
  const ks = status.data?.killSwitch
  if (!ks?.active) return null

  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-destructive px-4 py-2.5 text-sm text-destructive-foreground md:px-6">
      <div className="flex items-center gap-2">
        <OctagonX className="h-4 w-4 shrink-0" />
        <span>
          <b>Kill switch is ON</b> — all heartbeats and automation are stopped.
          {ks.activatedAt && (
            <>
              {' '}Activated <RelativeTime iso={ks.activatedAt} />.
            </>
          )}
          {ks.reason && <> Reason: “{ks.reason}”</>}
        </span>
      </div>
      <Button size="sm" variant="secondary" className="h-7" onClick={() => setOpen(true)}>
        <Play /> Resume
      </Button>
      <ReleaseKillSwitchDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

/** Settings → Automation: status, history and the controls. */
export function KillSwitchCard() {
  const status = useSystemStatus()
  const [activateOpen, setActivateOpen] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const ks = status.data?.killSwitch

  return (
    <Card className={cn(ks?.active && 'border-destructive')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <OctagonX className="h-5 w-5 text-destructive" /> Kill switch
        </CardTitle>
        <CardDescription>
          Emergency stop for all automation: stops every heartbeat, deletes every queued job and keeps everything stopped — even across server restarts — until
          someone resumes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : ks?.active ? (
          <Alert variant="destructive">
            <OctagonX className="h-4 w-4" />
            <AlertTitle>Active — everything is stopped</AlertTitle>
            <AlertDescription className="space-y-0.5">
              {ks.activatedAt && <div>Since {formatExact(ks.activatedAt)}</div>}
              {ks.reason && <div>Reason: “{ks.reason}”</div>}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span>
              Not active — automation is running ({plural(status.data?.runningHeartbeats ?? 0, 'heartbeat loop')} in this server).
            </span>
            {ks?.releasedAt && (
              <span className="text-muted-foreground">
                Last resumed {formatExact(ks.releasedAt)}.
              </span>
            )}
          </div>
        )}

        {ks?.active ? (
          <Button onClick={() => setReleaseOpen(true)}>
            <Play /> Resume operations
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setActivateOpen(true)} disabled={!status.data}>
            <Power /> Activate kill switch
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Also available from the <Power className="inline h-3.5 w-3.5 text-destructive" /> button in the top bar on every page.
        </p>
      </CardContent>
      <ActivateKillSwitchDialog open={activateOpen} onOpenChange={setActivateOpen} />
      <ReleaseKillSwitchDialog open={releaseOpen} onOpenChange={setReleaseOpen} />
    </Card>
  )
}
