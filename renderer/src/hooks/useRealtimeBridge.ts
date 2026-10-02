import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { SOCKET_EVENTS, type SocketEventName } from '@/types'

// These change account/system data the dashboard shows, so react-query needs to refetch immediately
// instead of waiting for its next poll.
const ACCOUNT_EVENTS: SocketEventName[] = ['heartbeat:update', 'account:status', 'balance:update']

/**
 * Subscribes once to the main process's live event stream (see src/main/services/events.js) and
 * invalidates the queries those events affect, so screens like Accounts and Account Detail update
 * the moment a heartbeat happens, not on the next 30s poll.
 */
export function useRealtimeBridge() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      window.panda.onEvent((envelope) => {
        if (!(SOCKET_EVENTS as readonly string[]).includes(envelope.name)) return
        const name = envelope.name as SocketEventName

        if (ACCOUNT_EVENTS.includes(name)) {
          void queryClient.invalidateQueries({ queryKey: ['accounts'] })
          void queryClient.invalidateQueries({ queryKey: ['activity'] })
        }
        if (name === 'kill-switch:activated') void queryClient.invalidateQueries({ queryKey: ['system', 'status'] })
        if (name === 'browser:status') void queryClient.invalidateQueries({ queryKey: ['browser', 'status'] })
        if (name === 'browser:traffic') void queryClient.invalidateQueries({ queryKey: ['browser', 'traffic'] })
        if (name === 'bet:captured' || name === 'bet:executed') void queryClient.invalidateQueries({ queryKey: ['bets'] })
      }),
    [queryClient],
  )
}
