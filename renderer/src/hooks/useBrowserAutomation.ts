import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { browserService } from '@/services/browserService'
import type { BrowserStatus } from '@/types'

export const browserStatusKey = ['browser', 'status'] as const

/** Short poll as a fallback; the realtime bridge invalidates this on every browser:status event. */
export const useBrowserStatus = () => useQuery({ queryKey: browserStatusKey, queryFn: browserService.status, refetchInterval: 5_000 })

function useBrowserMutation(fn: () => Promise<BrowserStatus>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (status) => queryClient.setQueryData(browserStatusKey, status),
  })
}

export const useLaunchBrowser = () => useBrowserMutation(browserService.launch)
export const useCloseBrowser = () => useBrowserMutation(browserService.close)
