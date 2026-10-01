import { Activity, FileText, Home, Network, Radio, Settings, TrendingUp, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

export const navItems: NavItem[] = [
  { label: 'Overview', to: '/', icon: Home, end: true },
  { label: 'Accounts', to: '/accounts', icon: Users },
  { label: 'Proxies', to: '/proxies', icon: Network },
  { label: 'Master', to: '/master', icon: Radio },
  { label: 'Bets', to: '/bets', icon: TrendingUp },
  { label: 'Monitor', to: '/monitor', icon: Activity },
  { label: 'Settings', to: '/settings', icon: Settings },
  { label: 'Audit', to: '/audit', icon: FileText },
]
