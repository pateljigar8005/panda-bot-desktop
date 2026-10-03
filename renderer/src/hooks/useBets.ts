import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { betsService } from '@/services/betsService'
import type { BetLogParams } from '@/types'

export const betKeys = {
  all: ['bets'] as const,
  list: (params: BetLogParams) => ['bets', 'list', params] as const,
}

/** Copy-bet history. Polled as a fallback; useRealtimeBridge invalidates this on bet:captured/bet:executed. */
export const useBets = (params: BetLogParams) =>
  useQuery({ queryKey: betKeys.list(params), queryFn: () => betsService.list(params), placeholderData: keepPreviousData, refetchInterval: 10_000 })

/** Overview dashboard chart: sub-account copy-bet outcomes bucketed over time. */
export const useBetsChart = (rangeHours: number) =>
  useQuery({ queryKey: ['bets', 'chart', rangeHours], queryFn: () => betsService.chart(rangeHours), refetchInterval: 30_000 })

/** Manual retry of one failed sub-account leg; invalidates the list/chart like a fresh bet would. */
export const useRetryBet = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => betsService.retry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: betKeys.all }),
  })
}
