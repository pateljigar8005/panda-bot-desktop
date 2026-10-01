import { Monitor } from 'lucide-react'
import { NotificationSettingsCard } from '@/components/settings/NotificationSettingsCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { AutomationSettingsCard } from '@/components/system/AutomationSettingsCard'
import { KillSwitchCard } from '@/components/system/KillSwitch'
import { PlaceholderCard } from '@/components/shared/PlaceholderCard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTabParam } from '@/hooks/useTabParam'
import { useUiStore } from '@/store/uiStore'

const TABS = ['general', 'automation', 'notifications'] as const

export default function Settings() {
  const [tab, setTab] = useTabParam(TABS, 'general')
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <>
      <PageHeader title="Settings" description="System configuration." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <PlaceholderCard title="Appearance" description="Choose how the dashboard looks.">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="dark-mode">Dark mode</Label>
                <p className="text-sm text-muted-foreground">{theme === 'system' ? 'Following your system preference.' : `Always ${theme}.`}</p>
              </div>
              <div className="flex items-center gap-3">
                {theme !== 'system' && (
                  <Button variant="ghost" size="sm" onClick={() => setTheme('system')}>
                    <Monitor /> Use system
                  </Button>
                )}
                <Switch id="dark-mode" checked={isDark} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
              </div>
            </div>
          </PlaceholderCard>
        </TabsContent>

        <TabsContent value="automation" className="space-y-6">
          <KillSwitchCard />
          <AutomationSettingsCard />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettingsCard />
        </TabsContent>
      </Tabs>
    </>
  )
}
