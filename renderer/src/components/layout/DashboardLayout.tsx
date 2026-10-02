import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useUiStore } from '@/store/uiStore'
import { CopyBettingBanner } from '@/components/system/CopyBetting'
import { FloatingMasterBrowser } from '@/components/system/FloatingMasterBrowser'
import { KillSwitchBanner } from '@/components/system/KillSwitch'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function DashboardLayout() {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden border-r bg-card transition-[width] duration-200 md:block',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">{t('layout.navigation')}</SheetTitle>
          <SheetDescription className="sr-only">{t('layout.navigationDescription')}</SheetDescription>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className={cn('transition-[padding] duration-200', collapsed ? 'md:pl-16' : 'md:pl-64')}>
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <KillSwitchBanner />
        <CopyBettingBanner />
        <main className="w-full space-y-6 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <FloatingMasterBrowser />
    </div>
  )
}
