import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { systemService } from '@/services/systemService'
import type { SystemSettings, SystemStatus } from '@/types'

const statusKey = ['system', 'status'] as const

/** Polled every 30s so every open dashboard notices a kill switch within half a minute. */
export const useSystemStatus = () => useQuery({ queryKey: statusKey, queryFn: systemService.status, refetchInterval: 30_000 })

function useSystemMutation<TVars, TResult extends SystemStatus>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (status) => {
      queryClient.setQueryData(statusKey, { settings: status.settings, killSwitch: status.killSwitch, copyBetting: status.copyBetting, runningHeartbeats: status.runningHeartbeats })
      // Account heartbeat state changes with the kill switch
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export const useUpdateSystemSettings = () => useSystemMutation((payload: Partial<SystemSettings>) => systemService.updateSettings(payload))
export const useActivateKillSwitch = () => useSystemMutation((reason: string | undefined) => systemService.activateKillSwitch(reason))
export const useReleaseKillSwitch = () => useSystemMutation(() => systemService.releaseKillSwitch())
export const useArmCopyBetting = () => useSystemMutation(() => systemService.armCopyBetting())
export const useDisarmCopyBetting = () => useSystemMutation(() => systemService.disarmCopyBetting())
