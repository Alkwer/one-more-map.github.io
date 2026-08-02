import { useMemo } from 'react'
import { adviseBorders } from '../logic/borderAdvisor'
import type { StrategyDef } from '../data/strategies'
import type { Borders, Weights } from '../types'

interface Props {
  borders: Borders
  weights: Weights
  activeStrategy: StrategyDef | null
}

const VERDICT: Record<string, { label: string; cls: string }> = {
  jackpot: { label: '🎰 KEEP - jackpot border rolled', cls: 'jackpot' },
  keep: { label: '✓ Keep this set', cls: 'keep' },
  coinflip: { label: '≈ Coin flip', cls: 'coinflip' },
  reroll: { label: '↻ Reroll - below average', cls: 'reroll' },
}

/** Compact strip under the board: is the current border set worth keeping? */
export function BorderAdvisor({ borders, weights, activeStrategy }: Props) {
  const advice = useMemo(
    () => adviseBorders(borders, weights, activeStrategy),
    [borders, weights, activeStrategy],
  )
  if (advice.filled === 0) return null
  const v = VERDICT[advice.verdict]
  return (
    <div
      className={`border-advisor ba-${v.cls}`}
      title="Assumes every border modifier is equally likely to roll (no datamined weights exist). Value is scored with your active weights."
    >
      <span className={`ba-verdict ba-${v.cls}`}>{v.label}</span>
      <span className="ba-detail muted">
        value {Math.round(advice.currentValue / 100)} vs avg{' '}
        {Math.round(advice.meanValue / 100)} · better than {Math.round(advice.percentile)}% of
        rolls{advice.filled < 12 ? ` (${advice.filled}/12 entered)` : ''}
      </span>
      <span className="spacer" />
      <span className={`ba-jackpot ${advice.jackpot.present ? 'hit' : ''}`}>
        {advice.jackpot.present
          ? `🎯 ${advice.jackpot.label} active`
          : `🎯 ${advice.jackpot.label}: ~${advice.jackpot.chancePct.toFixed(0)}% per reroll`}
      </span>
    </div>
  )
}
