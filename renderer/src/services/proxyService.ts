import { api } from '@/services/api'
import type { Pagination, Proxy, ProxyAccount, ProxyHealthResult, ProxyInput, ProxyListParams } from '@/types'

interface ProxyList {
  proxies: Proxy[]
  pagination: Pagination
}

const one = async (request: Promise<{ data: { proxy: Proxy } }>) => (await request).data.proxy

export const proxyService = {
  list: async (params: ProxyListParams) => (await api.get<ProxyList>('/proxies', { params })).data,
  get: (id: string) => one(api.get(`/proxies/${id}`)),
  create: (payload: ProxyInput) => one(api.post('/proxies', payload)),
  update: (id: string, payload: Partial<ProxyInput>) => one(api.put(`/proxies/${id}`, payload)),
  remove: async (id: string) => {
    await api.delete(`/proxies/${id}`)
  },
  accounts: async (id: string) => (await api.get<{ accounts: ProxyAccount[] }>(`/proxies/${id}/accounts`)).data.accounts,
  healthCheck: async (id: string) => (await api.post<ProxyHealthResult>(`/proxies/${id}/health-check`)).data,
}
