import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PlaceholderCard } from '@/components/shared/PlaceholderCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRealtimeStore } from '@/store/realtimeStore'

export default function LiveMonitor() {
  const events = useRealtimeStore((s) => s.events)
  const clearEvents = useRealtimeStore((s) => s.clearEvents)

  return (
    <>
      <PageHeader
        title="Live Monitor"
        description="Live events from the app: heartbeats, bets, account changes."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={clearEvents} disabled={!events.length}>
              <Trash2 /> Clear
            </Button>
          </>
        }
      />
      <PlaceholderCard title="Event stream" description={`${events.length} event(s) received this session.`}>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Waiting for events…</p>
        ) : (
          <ul className="max-h-[28rem] divide-y overflow-auto">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:gap-3">
                <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{format(e.receivedAt, 'HH:mm:ss')}</span>
                <Badge variant="outline" className="w-fit shrink-0">{e.name}</Badge>
                <code className="break-all text-xs text-muted-foreground">{JSON.stringify(e.payload)}</code>
              </li>
            ))}
          </ul>
        )}
      </PlaceholderCard>
    </>
  )
}
