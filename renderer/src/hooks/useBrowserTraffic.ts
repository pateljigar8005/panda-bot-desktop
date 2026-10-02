import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { browserService } from '@/services/browserService'
import type { BrowserTrafficParams } from '@/types'

export const browserTrafficKeys = {
  all: ['browser', 'traffic'] as const,
  list: (params: BrowserTrafficParams) => ['browser', 'traffic', params] as const,
}

/** Realtime bridge invalidates this on every browser:traffic event for a live feel. */
export const useBrowserTraffic = (params: BrowserTrafficParams) =>
  useQuery({ queryKey: browserTrafficKeys.list(params), queryFn: () => browserService.traffic(params), placeholderData: keepPreviousData })

export function useClearBrowserTraffic() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: browserService.clearTraffic,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: browserTrafficKeys.all }),
  })
}
