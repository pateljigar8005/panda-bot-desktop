import { api } from '@/services/api'
import type { KillSwitchResult, SystemSettings, SystemStatus } from '@/types'

export const systemService = {
  status: async () => (await api.get<SystemStatus>('/system/status')).data,
  updateSettings: async (payload: Partial<SystemSettings>) => (await api.put<SystemStatus>('/system/settings', payload)).data,
  /** Stops every heartbeat, clears every queue, sets the global flag. */
  activateKillSwitch: async (reason?: string) => (await api.post<KillSwitchResult>('/system/kill-switch', { reason })).data,
  releaseKillSwitch: async () => (await api.post<KillSwitchResult>('/system/kill-switch/release')).data,
  /** Independent of the kill switch — gates whether a detected master bet actually gets replicated. */
  armCopyBetting: async () => (await api.post<SystemStatus>('/system/copy-betting/arm')).data,
  disarmCopyBetting: async () => (await api.post<SystemStatus>('/system/copy-betting/disarm')).data,
}
