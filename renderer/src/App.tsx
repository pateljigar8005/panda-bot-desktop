import { Route, Routes } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { useLanguageEffect } from '@/hooks/useLanguage'
import { useRealtimeBridge } from '@/hooks/useRealtimeBridge'
import { useThemeEffect } from '@/hooks/useTheme'
import AccountDetail from '@/pages/dashboard/AccountDetail'
import AccountForm from '@/pages/dashboard/AccountForm'
import Accounts from '@/pages/dashboard/Accounts'
import AuditLog from '@/pages/dashboard/AuditLog'
import Bets from '@/pages/dashboard/Bets'
import LiveMonitor from '@/pages/dashboard/LiveMonitor'
import MasterAccount from '@/pages/dashboard/MasterAccount'
import Overview from '@/pages/dashboard/Overview'
import ProxyForm from '@/pages/dashboard/ProxyForm'
import Proxies from '@/pages/dashboard/Proxies'
import Settings from '@/pages/dashboard/Settings'
import NotFound from '@/pages/NotFound'

export default function App() {
  useThemeEffect()
  useLanguageEffect()
  useRealtimeBridge()

  // No login: the app runs locally for its owner and opens straight to the dashboard
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Overview />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="accounts/new" element={<AccountForm />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="accounts/:id/edit" element={<AccountForm />} />
        <Route path="proxies" element={<Proxies />} />
        <Route path="proxies/new" element={<ProxyForm />} />
        <Route path="proxies/:id/edit" element={<ProxyForm />} />
        <Route path="master" element={<MasterAccount />} />
        <Route path="bets" element={<Bets />} />
        <Route path="monitor" element={<LiveMonitor />} />
        <Route path="settings" element={<Settings />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
