import { create } from 'zustand'
import type { SocketEvent } from '@/types'

const MAX_EVENTS = 200

/** Live events pushed by the app's main process (heartbeats, bets, alerts) for this session. */
interface RealtimeState {
  events: SocketEvent[]
  unreadAlerts: number
  pushEvent: (event: SocketEvent) => void
  clearEvents: () => void
  markAlertsRead: () => void
}

export const useRealtimeStore = create<RealtimeState>()((set) => ({
  events: [],
  unreadAlerts: 0,
  pushEvent: (event) =>
    set((s) => ({
      events: [event, ...s.events].slice(0, MAX_EVENTS),
      unreadAlerts:
        event.name === 'system:alert' || event.name === 'kill-switch:activated' ? s.unreadAlerts + 1 : s.unreadAlerts,
    })),
  clearEvents: () => set({ events: [] }),
  markAlertsRead: () => set({ unreadAlerts: 0 }),
}))
