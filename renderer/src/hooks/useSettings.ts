import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsService } from '@/services/settingsService'
import type { NotificationSettingsInput } from '@/types'

const notificationKey = ['settings', 'notifications'] as const

export const useNotificationSettings = () => useQuery({ queryKey: notificationKey, queryFn: settingsService.notifications })

export const useUpdateNotificationSettings = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: NotificationSettingsInput) => settingsService.updateNotifications(payload),
    onSuccess: (settings) => queryClient.setQueryData(notificationKey, settings),
  })
}

export const useTestNotification = () => useMutation({ mutationFn: (payload: NotificationSettingsInput) => settingsService.testNotifications(payload) })
