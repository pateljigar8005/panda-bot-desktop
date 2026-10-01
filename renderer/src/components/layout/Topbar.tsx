import { Menu, Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { KillSwitchTopbarButton } from '@/components/system/KillSwitch'
import { useUiStore, type Theme } from '@/store/uiStore'

interface TopbarProps {
  onOpenMobileNav: () => void
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const { t } = useTranslation()
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileNav} aria-label={t('layout.openNavigation')}>
        <Menu />
      </Button>

      <div className="flex-1" />

      <KillSwitchTopbarButton />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('layout.toggleTheme')}>
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            <DropdownMenuRadioItem value="light"><Sun className="mr-2 h-4 w-4" />{t('layout.themeLight')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark"><Moon className="mr-2 h-4 w-4" />{t('layout.themeDark')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system"><Monitor className="mr-2 h-4 w-4" />{t('layout.themeSystem')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
