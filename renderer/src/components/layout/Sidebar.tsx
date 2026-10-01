import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Logo } from '@/components/shared/Logo'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { navItems } from './navigation'

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
  /** Called after a link is clicked (used to close the mobile sheet). */
  onNavigate?: () => void
}

export function Sidebar({ collapsed = false, onToggle, onNavigate }: SidebarProps) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center gap-2 border-b px-4', collapsed && 'justify-center px-2')}>
        <Logo size={30} />
        {!collapsed && <span className="truncate font-semibold">Panda Bot</span>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map(({ labelKey, to, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            title={collapsed ? t(labelKey) : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                collapsed && 'justify-center px-2',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{t(labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      {onToggle && (
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={onToggle} aria-label={t('layout.toggleSidebar')}>
            {collapsed ? <ChevronsRight /> : <><ChevronsLeft /> {t('layout.collapse')}</>}
          </Button>
        </div>
      )}
    </div>
  )
}
