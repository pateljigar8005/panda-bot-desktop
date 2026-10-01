import { CheckCircle2, Network, Radio, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PlaceholderCard } from '@/components/shared/PlaceholderCard'
import { StatCard } from '@/components/shared/StatCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RelativeTime } from '@/components/shared/RelativeTime'
import { useAccounts } from '@/hooks/useAccounts'
import { useMasterAccount } from '@/hooks/useMasterAccount'
import { useProxies } from '@/hooks/useProxies'
import { mockChart } from '@/lib/mockData'

export default function Overview() {
  const { t } = useTranslation()
  const recent = useAccounts({ page: 1, limit: 5 })
  const active = useAccounts({ page: 1, limit: 1, status: 'active' })
  const proxies = useProxies({ page: 1, limit: 1 })
  const master = useMasterAccount()

  const num = (n?: number) => (n === undefined ? '—' : String(n))

  return (
    <>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={t('overview.totalAccounts')} icon={Users} loading={recent.isLoading} value={num(recent.data?.pagination.total)} />
        <StatCard title={t('overview.activeAccounts')} icon={CheckCircle2} loading={active.isLoading} value={num(active.data?.pagination.total)} />
        <StatCard title={t('overview.totalProxies')} icon={Network} loading={proxies.isLoading} value={num(proxies.data?.pagination.total)} />
        <StatCard
          title={t('overview.masterAccount')}
          icon={Radio}
          loading={master.isLoading}
          value={master.isError ? '—' : master.data ? t(`status.${master.data.status}`, master.data.status) : t('overview.notSet')}
          hint={master.data?.name}
        />
      </div>

      <PlaceholderCard title={t('overview.activity')} description={t('overview.activityDescription')}>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mockChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
              <Line type="monotone" dataKey="bets" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </PlaceholderCard>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold leading-none tracking-tight">{t('overview.recentAccounts')}</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/accounts">{t('overview.viewAll')}</Link>
          </Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('overview.columnName')}</TableHead>
                <TableHead>{t('overview.columnUid')}</TableHead>
                <TableHead>{t('overview.columnStatus')}</TableHead>
                <TableHead>{t('overview.columnLastHeartbeat')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : recent.data?.accounts.length ? (
                recent.data.accounts.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>
                      <Link to={`/accounts/${a._id}`} className="font-medium hover:underline">
                        {a.name}
                      </Link>
                    </TableCell>
                    <TableCell>{a.uid}</TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell>
                      <RelativeTime iso={a.lastHeartbeatAt} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    {recent.isError ? t('overview.couldNotLoad') : t('overview.noAccountsYet')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  )
}
