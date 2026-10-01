import { CheckCircle2, Network, Radio, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
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
  const recent = useAccounts({ page: 1, limit: 5 })
  const active = useAccounts({ page: 1, limit: 1, status: 'active' })
  const proxies = useProxies({ page: 1, limit: 1 })
  const master = useMasterAccount()

  const num = (n?: number) => (n === undefined ? '—' : String(n))

  return (
    <>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Accounts" icon={Users} loading={recent.isLoading} value={num(recent.data?.pagination.total)} />
        <StatCard title="Active Accounts" icon={CheckCircle2} loading={active.isLoading} value={num(active.data?.pagination.total)} />
        <StatCard title="Total Proxies" icon={Network} loading={proxies.isLoading} value={num(proxies.data?.pagination.total)} />
        <StatCard
          title="Master Account"
          icon={Radio}
          loading={master.isLoading}
          value={master.isError ? '—' : master.data ? master.data.status[0].toUpperCase() + master.data.status.slice(1) : 'Not set'}
          hint={master.data?.name}
        />
      </div>

      <PlaceholderCard title="Activity" description="Placeholder data — real stats come in a later phase.">
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
          <h2 className="text-lg font-semibold leading-none tracking-tight">Recent accounts</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/accounts">View all</Link>
          </Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>UID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last heartbeat</TableHead>
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
                    {recent.isError ? 'Couldn’t load accounts.' : 'No accounts yet.'}
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
