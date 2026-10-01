import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountService } from '@/services/accountService'
import type { Account, AccountInput, AccountListParams, HeartbeatLogParams } from '@/types'

export const accountKeys = {
  all: ['accounts'] as const,
  list: (params: AccountListParams) => ['accounts', 'list', params] as const,
  detail: (id: string) => ['accounts', 'detail', id] as const,
  heartbeatLogs: (id: string, params: HeartbeatLogParams) => ['accounts', 'heartbeat-logs', id, params] as const,
}

// Keeps "last heartbeat" and error counts reasonably current without hammering the API
// (the relative times tick locally every second in between). Paused while the tab is hidden.
const LIVE_REFRESH_MS = 30_000

export const useAccounts = (params: AccountListParams = {}) =>
  useQuery({
    queryKey: accountKeys.list(params),
    queryFn: () => accountService.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  })

export const useAccount = (id: string | undefined) =>
  useQuery({ queryKey: accountKeys.detail(id ?? ''), queryFn: () => accountService.get(id!), enabled: !!id, refetchInterval: LIVE_REFRESH_MS })

/** Fetched when the heartbeat log dialog opens (logs + stats in one request); no polling — refresh is manual. */
export const useHeartbeatLogs = (id: string, params: HeartbeatLogParams, enabled: boolean) =>
  useQuery({
    queryKey: accountKeys.heartbeatLogs(id, params),
    queryFn: () => accountService.heartbeatLogs(id, params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 0, // reopening the dialog shows fresh entries
  })

/** Invalidates everything under 'accounts', so the logs, stats and error badges all refresh. */
export const useClearHeartbeatLogs = () => useAccountMutation((id: string) => accountService.clearHeartbeatLogs(id))


function useAccountMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }) })
}

export const useCreateAccount = () => useAccountMutation((payload: AccountInput) => accountService.create(payload))

export const useUpdateAccount = (id: string) =>
  useAccountMutation((payload: Partial<AccountInput> & { status?: Account['status'] }) => accountService.update(id, payload))

export const useDeleteAccount = () => useAccountMutation((id: string) => accountService.remove(id))
export const useDeactivateAccount = () => useAccountMutation((id: string) => accountService.deactivate(id))
/** Refetches on failure too: the backend records the new failure reason on the account. */
export const useRetrySetup = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accountService.retrySetup(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  })
}
export const useActivateAccount = () => useAccountMutation((id: string) => accountService.activate(id))
/** Assign (proxyId) or remove (null). Refreshes accounts and proxies (counts, per-proxy account lists). */
export const useAssignProxy = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, proxyId }: { id: string; proxyId: string | null }) => accountService.assignProxy(id, proxyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['proxies'] })
    },
  })
}

/** Not cached: a connection test is a one-off action with a result to toast. */
export const useTestAccount = () => useMutation({ mutationFn: (id: string) => accountService.test(id) })

/** Heartbeats need sid/mc from the platform; without them the scheduler never starts. */
export const isSetupIncomplete = (account: Pick<Account, 'sidEncrypted' | 'mcEncrypted'>) => !account.sidEncrypted || !account.mcEncrypted
