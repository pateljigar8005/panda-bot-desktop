import { api } from '@/services/api'
import type { NotificationSettings, NotificationSettingsInput } from '@/types'

export const settingsService = {
  notifications: async () => (await api.get<{ settings: NotificationSettings }>('/settings/notifications')).data.settings,
  updateNotifications: async (payload: NotificationSettingsInput) =>
    (await api.put<{ settings: NotificationSettings }>('/settings/notifications', payload)).data.settings,
  /** Sends a test email with these values (saved or not); 502 with the SMTP server's message on failure. */
  testNotifications: async (payload: NotificationSettingsInput) =>
    (await api.post<{ success: boolean; message: string }>('/settings/notifications/test', payload)).data,
}
