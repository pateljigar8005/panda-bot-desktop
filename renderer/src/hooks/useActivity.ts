import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { activityService } from '@/services/activityService'
import type { ActivityLogParams } from '@/types'

export const activityKeys = {
  all: ['activity'] as const,
  list: (params: ActivityLogParams) => ['activity', 'list', params] as const,
}

/**
 * Live Monitor's data: heartbeat/setup activity across every account, persisted (not session-only).
 * Polls every 5s as a fallback — the realtime bridge (useRealtimeBridge) invalidates this on every
 * heartbeat for near-instant updates, but this page has no other refresh trigger if that ever misses.
 */
export const useActivityLog = (params: ActivityLogParams) =>
  useQuery({
    queryKey: activityKeys.list(params),
    queryFn: () => activityService.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: 5_000,
  })

/** Also resets every account's error counters (derived from the log), so Accounts needs to refresh too. */
export function useClearActivityLog() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: activityService.clear,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
