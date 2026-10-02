import { api } from '@/services/api'
import type { BrowserStatus, BrowserTrafficPage, BrowserTrafficParams } from '@/types'

export const browserService = {
  status: async () => (await api.get<BrowserStatus>('/browser/status')).data,
  /** Opens a visible Chromium window on the master account's token URL. */
  launch: async () => (await api.post<BrowserStatus>('/browser/launch')).data,
  close: async () => (await api.post<BrowserStatus>('/browser/close')).data,
  traffic: async (params: BrowserTrafficParams) => (await api.get<BrowserTrafficPage>('/browser/traffic', { params })).data,
  clearTraffic: async () => (await api.delete<{ success: boolean; deletedCount: number }>('/browser/traffic')).data,
}
