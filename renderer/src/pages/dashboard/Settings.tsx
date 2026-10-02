import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/shared/PageHeader'
import { SelectField } from '@/components/shared/SelectField'
import { AutomationSettingsCard } from '@/components/system/AutomationSettingsCard'
import { CopyBettingCard } from '@/components/system/CopyBetting'
import { KillSwitchCard } from '@/components/system/KillSwitch'
import { PlaceholderCard } from '@/components/shared/PlaceholderCard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTabParam } from '@/hooks/useTabParam'
import { useUiStore, type Language } from '@/store/uiStore'

const TABS = ['general', 'automation'] as const

export default function Settings() {
  const { t } = useTranslation()
  const [tab, setTab] = useTabParam(TABS, 'general')
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const language = useUiStore((s) => s.language)
  const setLanguage = useUiStore((s) => s.setLanguage)
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '中文（简体）' },
    { value: 'zh-TW', label: '中文（繁體）' },
  ]

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="general">{t('settings.tabGeneral')}</TabsTrigger>
          <TabsTrigger value="automation">{t('settings.tabAutomation')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <PlaceholderCard title={t('settings.appearance')} description={t('settings.appearanceDescription')}>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="dark-mode">{t('settings.darkMode')}</Label>
                <p className="text-sm text-muted-foreground">{theme === 'system' ? t('settings.followingSystem') : theme === 'dark' ? t('settings.alwaysDark') : t('settings.alwaysLight')}</p>
              </div>
              <div className="flex items-center gap-3">
                {theme !== 'system' && (
                  <Button variant="ghost" size="sm" onClick={() => setTheme('system')}>
                    <Monitor /> {t('settings.useSystem')}
                  </Button>
                )}
                <Switch id="dark-mode" checked={isDark} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
              </div>
            </div>
          </PlaceholderCard>

          <PlaceholderCard title={t('settings.language')} description={t('settings.languageDescription')}>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="language-select">{t('settings.displayLanguage')}</Label>
              <SelectField id="language-select" value={language} onChange={(v) => setLanguage(v as Language)} options={languageOptions} className="w-56" aria-label={t('settings.displayLanguage')} />
            </div>
          </PlaceholderCard>
        </TabsContent>

        <TabsContent value="automation" className="space-y-6">
          <KillSwitchCard />
          <CopyBettingCard />
          <AutomationSettingsCard />
        </TabsContent>
      </Tabs>
    </>
  )
}
