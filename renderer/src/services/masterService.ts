import { api } from '@/services/api'
import type { MasterAccount, MasterInput, MasterStatus } from '@/types'

const one = async (request: Promise<{ data: { master: MasterAccount } }>) => (await request).data.master

export const masterService = {
  get: async () => (await api.get<{ master: MasterAccount | null }>('/master')).data.master,
  create: (payload: MasterInput) => one(api.post('/master', payload)),
  update: (payload: Partial<MasterInput>) => one(api.put('/master', payload)),
  remove: async () => {
    await api.delete('/master')
  },
  status: async () => (await api.get<MasterStatus>('/master/status')).data,
}
