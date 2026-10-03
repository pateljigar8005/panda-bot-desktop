import { api } from '@/services/api'
import type { Account, AccountInput, AccountListParams, AccountTestResult, HeartbeatLogPage, HeartbeatLogParams, Pagination } from '@/types'

interface AccountList {
  accounts: Account[]
  pagination: Pagination
}

const one = async (request: Promise<{ data: { account: Account } }>) => (await request).data.account

export const accountService = {
  list: async (params: AccountListParams) => (await api.get<AccountList>('/accounts', { params })).data,
  get: (id: string) => one(api.get(`/accounts/${id}`)),
  create: (payload: AccountInput) => one(api.post('/accounts', payload)),
  update: (id: string, payload: Partial<AccountInput> & { status?: Account['status'] }) => one(api.put(`/accounts/${id}`, payload)),
  remove: async (id: string) => {
    await api.delete(`/accounts/${id}`)
  },
  /** proxyId null removes the proxy (direct connection). */
  assignProxy: (id: string, proxyId: string | null) => one(api.post(`/accounts/${id}/assign-proxy`, { proxyId })),
  /** Turns the account fully off: no heartbeats, no bets. */
  deactivate: (id: string) => one(api.post(`/accounts/${id}/deactivate`)),
  activate: (id: string) => one(api.post(`/accounts/${id}/activate`)),
  /** Re-runs the platform sid/mc lookup; 502 with { message } if it still fails. */
  retrySetup: (id: string) => one(api.post(`/accounts/${id}/retry-setup`)),
  test: async (id: string) => (await api.post<AccountTestResult>(`/accounts/${id}/test`)).data,
  refreshBalance: (id: string) => one(api.post(`/accounts/${id}/refresh-balance`)),
  /** Refreshes every account with sid/mc, staggered like a copy-bet run; { refreshed, failed, total }. */
  refreshBalances: async () => (await api.post<{ refreshed: number; failed: number; total: number }>('/accounts/refresh-balances')).data,
  /** One filtered page of logs, plus stats and seen codes for the time window — one request. */
  heartbeatLogs: async (id: string, params: HeartbeatLogParams) =>
    (await api.get<HeartbeatLogPage>(`/accounts/${id}/heartbeat-logs`, { params })).data,
  /** Permanently deletes all heartbeat logs for the account and resets its error count. */
  clearHeartbeatLogs: async (id: string) =>
    (await api.delete<{ success: boolean; deletedCount: number }>(`/accounts/${id}/heartbeat-logs`)).data,
}
