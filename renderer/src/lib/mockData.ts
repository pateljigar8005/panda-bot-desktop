// Placeholder data used until the API is wired. Delete as each page moves to real queries.
import type { BetLog } from '@/types'

export const mockChart = [
  { time: '00:00', bets: 4 },
  { time: '04:00', bets: 9 },
  { time: '08:00', bets: 14 },
  { time: '12:00', bets: 22 },
  { time: '16:00', bets: 17 },
  { time: '20:00', bets: 26 },
]

export const mockBets: BetLog[] = [
  { id: 'b1', accountId: 'a1', accountUsername: 'acct_alpha', event: 'Team A vs Team B', market: '1X2', selection: 'Home', odds: 1.85, stake: 50, status: 'executed', capturedAt: '2026-09-30T09:12:00Z', executedAt: '2026-09-30T09:12:02Z' },
  { id: 'b2', accountId: 'a2', accountUsername: 'acct_beta', event: 'Team C vs Team D', market: 'O/U 2.5', selection: 'Over', odds: 2.1, stake: 30, status: 'failed', error: 'Odds changed', capturedAt: '2026-09-30T09:20:00Z', executedAt: null },
  { id: 'b3', accountId: 'a1', accountUsername: 'acct_alpha', event: 'Team E vs Team F', market: 'AH -0.5', selection: 'Away', odds: 1.95, stake: 40, status: 'captured', capturedAt: '2026-09-30T09:31:00Z', executedAt: null },
]

