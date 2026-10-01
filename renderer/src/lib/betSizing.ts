import type { BetMode } from '@/types'

export interface BetSizingSettings {
  betMode: BetMode
  fixedAmount?: number
  multiplier?: number
  maxBetAmount?: number
  minBalanceThreshold?: number
}

export type BetOutcome =
  | { kind: 'bet'; stake: number; capped: boolean; uncapped: number }
  | { kind: 'skip'; reason: 'low-balance' | 'incomplete' }

/**
 * How much a sub-account stakes when the master places `masterStake`.
 * Intended rules (the bet executor must implement the same):
 *  - fixed: always `fixedAmount`; proportional: `masterStake × multiplier`
 *  - never more than `maxBetAmount`
 *  - no bet while the account balance is below `minBalanceThreshold`
 */
export function computeStake(s: BetSizingSettings, masterStake: number, balance?: number): BetOutcome {
  const base = s.betMode === 'fixed' ? s.fixedAmount : s.multiplier !== undefined ? masterStake * s.multiplier : undefined
  if (base === undefined || !Number.isFinite(base) || base <= 0) return { kind: 'skip', reason: 'incomplete' }
  if (balance !== undefined && s.minBalanceThreshold !== undefined && balance < s.minBalanceThreshold) {
    return { kind: 'skip', reason: 'low-balance' }
  }
  const uncapped = Math.round(base * 100) / 100
  const capped = s.maxBetAmount !== undefined && s.maxBetAmount > 0 && uncapped > s.maxBetAmount
  return { kind: 'bet', stake: capped ? s.maxBetAmount! : uncapped, capped, uncapped }
}

export const formatAmount = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
