import { api } from '@/services/api'
import type { BetChart, BetLogPage, BetLogParams } from '@/types'

export const betsService = {
  list: async (params: BetLogParams) => (await api.get<BetLogPage>('/bets', { params })).data,
  chart: async (rangeHours: number) => (await api.get<BetChart>('/bets/chart', { params: { rangeHours } })).data,
}
