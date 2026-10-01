import { ArrowRight, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { computeStake, formatAmount, type BetSizingSettings } from '@/lib/betSizing'
import { cn } from '@/lib/utils'

// Example master stakes; the largest usually shows the max-bet cap in action.
const EXAMPLE_MASTER_STAKES = [10, 50, 100, 500]

/** Live "if the master bets X, this account bets Y" examples for the current form values. */
export function BetSizingPreview(settings: BetSizingSettings) {
  const { t } = useTranslation()
  const { betMode, multiplier, fixedAmount, maxBetAmount, minBalanceThreshold } = settings
  const incomplete = computeStake(settings, 100).kind === 'skip'

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Info className="h-4 w-4 text-muted-foreground" /> {t('betSizing.whatThisAccountWillBet')}
      </div>

      {incomplete ? (
        <p className="text-sm text-muted-foreground">
          {betMode === 'fixed' ? t('betSizing.enterFixedAmount') : t('betSizing.enterMultiplier')}
        </p>
      ) : (
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          {EXAMPLE_MASTER_STAKES.map((master) => {
            const out = computeStake(settings, master)
            if (out.kind !== 'bet') return null
            return (
              <li key={master} className="flex flex-wrap items-center gap-x-2 tabular-nums">
                <span className="text-muted-foreground">{t('betSizing.masterBets', { amount: formatAmount(master) })}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">{t('betSizing.thisBets', { amount: formatAmount(out.stake) })}</span>
                {out.capped && (
                  <span className="text-xs text-warning" title={t('betSizing.aboveMaxBet', { amount: formatAmount(out.uncapped) })}>
                    {t('betSizing.cappedFrom', { amount: formatAmount(out.uncapped) })}
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
              <b className="text-foreground">{t('betSizing.fixedLabel')}</b> {t('betSizing.fixedExplanation', { amount: fixedAmount ? formatAmount(fixedAmount) : t('betSizing.theFixedAmount') })}
            </>
          ) : (
            <>
              <b className="text-foreground">{t('betSizing.proportionalLabel')}</b>{' '}
              {t('betSizing.proportionalExplanation', { multiplier: multiplier !== undefined ? formatAmount(multiplier) : t('betSizing.multiplierWord') })}
              {multiplier !== undefined && (
                <>
                  {' '}
                  (
                  {multiplier === 1
                    ? t('betSizing.sameAsMaster')
                    : multiplier < 1
                      ? t('betSizing.percentOfMaster', { percent: formatAmount(multiplier * 100) })
                      : t('betSizing.timesOfMaster', { multiplier: formatAmount(multiplier) })}
                  )
                </>
              )}
              .
            </>
          )}
        </li>
        <li className={cn(!maxBetAmount && 'opacity-70')}>
          <b className="text-foreground">{t('betSizing.maxBetLabel')}</b>{' '}
          {maxBetAmount ? t('betSizing.maxBetExplanation', { amount: formatAmount(maxBetAmount) }) : t('betSizing.notSetYet')}
        </li>
        <li className={cn(minBalanceThreshold === undefined && 'opacity-70')}>
          <b className="text-foreground">{t('betSizing.minBalanceLabel')}</b>{' '}
          {minBalanceThreshold !== undefined ? t('betSizing.minBalanceExplanation', { amount: formatAmount(minBalanceThreshold) }) : t('betSizing.notSetYet')}
        </li>
      </ul>
    </div>
  )
}
