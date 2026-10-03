import { api } from '@/services/api'
import type { BetChart, BetLog, BetLogPage, BetLogParams } from '@/types'

export const betsService = {
  list: async (params: BetLogParams) => (await api.get<BetLogPage>('/bets', { params })).data,
  chart: async (rangeHours: number) => (await api.get<BetChart>('/bets/chart', { params: { rangeHours } })).data,
  /** Re-sends a failed sub-account leg with the same selection/odds/stake but fresh bet-slip ids. */
  retry: async (id: string) => (await api.post<{ bet: BetLog }>(`/bets/${id}/retry`)).data.bet,
}
