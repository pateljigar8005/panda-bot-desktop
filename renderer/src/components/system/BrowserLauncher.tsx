import { Globe } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useBrowserStatus, useCloseBrowser, useLaunchBrowser } from '@/hooks/useBrowserAutomation'
import { getErrorMessage } from '@/services/api'

/** Confirm, then open a real Chromium window on the master account's live session. */
export function LaunchBrowserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const launch = useLaunchBrowser()
  const confirm = () =>
    launch.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('masterAccount.browserOpened'))
        onOpenChange(false)
      },
      onError: (error) => toast.error(t('masterAccount.browserLaunchFailed'), { description: getErrorMessage(error) }),
    })

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('masterAccount.launchBrowserTitle')}
      description={t('masterAccount.launchBrowserDescription')}
      confirmLabel={t('masterAccount.startListener')}
      destructive={false}
      loading={launch.isPending}
      onConfirm={confirm}
    />
  )
}

export function CloseBrowserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const close = useCloseBrowser()
  const confirm = () =>
    close.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('masterAccount.browserClosed'))
        onOpenChange(false)
      },
      onError: (error) => toast.error(t('masterAccount.browserCloseFailed'), { description: getErrorMessage(error) }),
    })

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('masterAccount.stopListenerTitle')}
      description={t('masterAccount.stopListenerDescription')}
      confirmLabel={t('masterAccount.stopListener')}
      loading={close.isPending}
      onConfirm={confirm}
    />
  )
}

/**
 * Always-visible top bar control — same confirm dialogs as the Master Account page's buttons.
 * Two independent open states (not one shared boolean gating which dialog type renders): the
 * instant `running` flips to true on launch success, a shared boolean would make React swap in a
 * freshly-mounted CloseBrowserDialog with open still true for one render — a flash of "Close the
 * master browser?" right after confirming "Start". Each dialog owns its own state instead.
 */
export function BrowserLauncherTopbarButton() {
  const { t } = useTranslation()
  const status = useBrowserStatus()
  const running = status.data?.running
  const [launchOpen, setLaunchOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className={running ? 'text-success hover:bg-success/10 hover:text-success' : undefined}
            aria-label={running ? t('masterAccount.stopListener') : t('masterAccount.startListener')}
            onClick={() => (running ? setCloseOpen(true) : setLaunchOpen(true))}
            disabled={!status.data}
          >
            <Globe />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{running ? t('masterAccount.listenerRunningHint') : t('masterAccount.listenerStoppedHint')}</TooltipContent>
      </Tooltip>
      <LaunchBrowserDialog open={launchOpen} onOpenChange={setLaunchOpen} />
      <CloseBrowserDialog open={closeOpen} onOpenChange={setCloseOpen} />
    </>
  )
}
