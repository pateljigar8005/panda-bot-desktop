import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { proxyService } from '@/services/proxyService'
import type { ProxyInput, ProxyListParams } from '@/types'

export const proxyKeys = {
  all: ['proxies'] as const,
  list: (params: ProxyListParams) => ['proxies', 'list', params] as const,
  detail: (id: string) => ['proxies', 'detail', id] as const,
  accounts: (id: string) => ['proxies', 'accounts', id] as const,
}

export const useProxies = (params: ProxyListParams = {}) =>
  useQuery({ queryKey: proxyKeys.list(params), queryFn: () => proxyService.list(params), placeholderData: keepPreviousData })

export const useProxy = (id: string | undefined) =>
  useQuery({ queryKey: proxyKeys.detail(id ?? ''), queryFn: () => proxyService.get(id!), enabled: !!id })

function useProxyMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: proxyKeys.all }) })
}

export const useCreateProxy = () => useProxyMutation((payload: ProxyInput) => proxyService.create(payload))
export const useUpdateProxy = (id: string) => useProxyMutation((payload: Partial<ProxyInput>) => proxyService.update(id, payload))
export const useDeleteProxy = () => useProxyMutation((id: string) => proxyService.remove(id))
export const useProxyHealthCheck = () => useProxyMutation((id: string) => proxyService.healthCheck(id))

/** Accounts using a proxy; only fetched while its dialog is open. */
export const useProxyAccounts = (id: string, enabled: boolean) =>
  useQuery({ queryKey: proxyKeys.accounts(id), queryFn: () => proxyService.accounts(id), enabled, staleTime: 0 })
