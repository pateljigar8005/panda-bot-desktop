import { Activity, FileText, Home, Network, Radio, Settings, TrendingUp, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  labelKey: string
  to: string
  icon: LucideIcon
  end?: boolean
}

export const navItems: NavItem[] = [
  { labelKey: 'nav.overview', to: '/', icon: Home, end: true },
  { labelKey: 'nav.accounts', to: '/accounts', icon: Users },
  { labelKey: 'nav.proxies', to: '/proxies', icon: Network },
  { labelKey: 'nav.master', to: '/master', icon: Radio },
  { labelKey: 'nav.bets', to: '/bets', icon: TrendingUp },
  { labelKey: 'nav.monitor', to: '/monitor', icon: Activity },
  { labelKey: 'nav.settings', to: '/settings', icon: Settings },
  { labelKey: 'nav.audit', to: '/audit', icon: FileText },
]
