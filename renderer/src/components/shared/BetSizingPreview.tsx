import { ArrowRight, Info } from 'lucide-react'
import { computeStake, formatAmount, type BetSizingSettings } from '@/lib/betSizing'
import { cn } from '@/lib/utils'

// Example master stakes; the largest usually shows the max-bet cap in action.
const EXAMPLE_MASTER_STAKES = [10, 50, 100, 500]

/** Live "if the master bets X, this account bets Y" examples for the current form values. */
export function BetSizingPreview(settings: BetSizingSettings) {
  const { betMode, multiplier, fixedAmount, maxBetAmount, minBalanceThreshold } = settings
  const incomplete = computeStake(settings, 100).kind === 'skip'

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Info className="h-4 w-4 text-muted-foreground" /> What this account will bet
      </div>

      {incomplete ? (
        <p className="text-sm text-muted-foreground">
          Enter {betMode === 'fixed' ? 'a fixed amount' : 'a multiplier'} to see examples.
        </p>
      ) : (
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          {EXAMPLE_MASTER_STAKES.map((master) => {
            const out = computeStake(settings, master)
            if (out.kind !== 'bet') return null
            return (
              <li key={master} className="flex flex-wrap items-center gap-x-2 tabular-nums">
                <span className="text-muted-foreground">Master bets {formatAmount(master)}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">bets {formatAmount(out.stake)}</span>
                {out.capped && (
                  <span className="text-xs text-warning" title={`${formatAmount(out.uncapped)} is above the max bet amount`}>
                    (capped from {formatAmount(out.uncapped)})
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
        <li>
          {betMode === 'fixed' ? (
            <>
              <b className="text-foreground">Fixed:</b> every bet is {fixedAmount ? formatAmount(fixedAmount) : 'the fixed amount'}, whatever the master stakes.
            </>
          ) : (
            <>
              <b className="text-foreground">Proportional:</b> master stake × {multiplier !== undefined ? formatAmount(multiplier) : 'multiplier'}
              {multiplier !== undefined && (
                <> ({multiplier === 1 ? 'same as the master' : multiplier < 1 ? `${formatAmount(multiplier * 100)}% of the master stake` : `${formatAmount(multiplier)}× the master stake`})</>
              )}
              .
            </>
          )}
        </li>
        <li className={cn(!maxBetAmount && 'opacity-70')}>
          <b className="text-foreground">Max bet:</b>{' '}
          {maxBetAmount ? `no single bet above ${formatAmount(maxBetAmount)}; larger stakes are reduced to it.` : 'not set yet.'}
        </li>
        <li className={cn(minBalanceThreshold === undefined && 'opacity-70')}>
          <b className="text-foreground">Min balance:</b>{' '}
          {minBalanceThreshold !== undefined
            ? `if the balance drops below ${formatAmount(minBalanceThreshold)}, bets are skipped until it's topped up.`
            : 'not set yet.'}
        </li>
      </ul>
    </div>
  )
}
