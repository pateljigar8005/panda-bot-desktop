import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { masterService } from '@/services/masterService'
import type { MasterInput } from '@/types'

export const masterKeys = { all: ['master'] as const, status: ['master', 'status'] as const }

export const useMasterAccount = () => useQuery({ queryKey: masterKeys.all, queryFn: masterService.get })

export const useMasterStatus = (enabled: boolean) =>
  useQuery({ queryKey: masterKeys.status, queryFn: masterService.status, enabled, refetchInterval: 15_000 })

function useMasterMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: masterKeys.all }) })
}

export const useCreateMaster = () => useMasterMutation((payload: MasterInput) => masterService.create(payload))
export const useUpdateMaster = () => useMasterMutation((payload: Partial<MasterInput>) => masterService.update(payload))
export const useDeleteMaster = () => useMasterMutation(() => masterService.remove())
