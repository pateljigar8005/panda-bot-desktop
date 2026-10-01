import { api } from '@/services/api'
import type { ActivityLogPage, ActivityLogParams } from '@/types'

export const activityService = {
  /** Heartbeat/setup activity across every account (GET /heartbeat-logs), for Live Monitor. */
  list: async (params: ActivityLogParams) => (await api.get<ActivityLogPage>('/heartbeat-logs', { params })).data,
  /** Permanently deletes every account's heartbeat/setup log and resets their error counters. */
  clear: async () => (await api.delete<{ success: boolean; deletedCount: number }>('/heartbeat-logs')).data,
}
