import type {
  BorderAppraisal,
  BorderAppraisalStatus,
  BorderSegmentAppraisal,
  BorderSegmentIssue,
} from '../logic/borderAppraisal'
import { ALL_STATS, STAT_LABELS } from '../types'

interface Props {
  appraisal: BorderAppraisal
  contextLabel: string
}

const STATUS_LABEL: Record<BorderAppraisalStatus, string> = {
  empty: 'Needs board data',
  incomplete: 'Partial appraisal',
  unscored: 'No weighted value',
  weak: 'Weak fit',
  mixed: 'Mixed fit',
  strong: 'Strong fit',
  excellent: 'Excellent fit',
}

const ISSUE_LABEL: Record<Exclude<BorderSegmentIssue, null>, string> = {
  'empty-border': 'Border not entered',
  'empty-tile': 'No chart in the touched square',
  disabled: 'Modifier disabled',
  unknown: 'Unknown modifier',
  unscored: 'No value under current weights',
  harmful: 'Reduces the weighted score here',
}

const scoreText = (value: number) =>
  `${value > 0 ? '+' : ''}${Math.abs(value) < 0.05 ? '0.0' : value.toFixed(1)}`

const segmentTitle = (segment: BorderSegmentAppraisal) => {
  if (!segment.bestLabel) return undefined
  return `Best known fit for this slot: ${segment.bestLabel} (${scoreText(segment.bestContribution)})`
}

function SegmentRow({ segment, compact = false }: { segment: BorderSegmentAppraisal; compact?: boolean }) {
  const issue = segment.issue ? ISSUE_LABEL[segment.issue] : null
  const tone =
    segment.contribution < 0 ? 'negative' : segment.contribution > 0 ? 'positive' : 'zero'

  return (
    <div className={`border-appraisal-row ${tone}`} title={segmentTitle(segment)}>
      <div className="border-appraisal-place">
        <span>{segment.position}</span>
        <span className="muted">{segment.chartName ?? 'Empty square'}</span>
      </div>
      <div className="border-appraisal-mod">
        <span>{segment.modLabel ?? 'No border selected'}</span>
        {!compact && (
          <span className="muted">
            {issue ??
              (segment.fit !== null ? `${Math.round(segment.fit * 100)}% slot fit` : 'Scored effect')}
          </span>
        )}
      </div>
      <strong>{segment.modId ? scoreText(segment.contribution) : '—'}</strong>
    </div>
  )
}

export function BorderAppraiser({ appraisal, contextLabel }: Props) {
  const top = [...appraisal.segments]
    .filter((segment) => segment.active && segment.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
  const statGains = ALL_STATS.map((stat) => ({ stat, value: appraisal.perStat[stat] }))
    .filter(({ value }) => Math.abs(value) >= 0.005)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 5)
  const fitPercent = appraisal.fit === null ? null : Math.round(appraisal.fit * 100)

  return (
    <section className="border-appraiser" aria-labelledby="border-appraiser-title">
      <div className="border-appraiser-head">
        <div>
          <div id="border-appraiser-title" className="panel-title">
            Border Fit Diagnostic
          </div>
          <div className="muted border-appraiser-subtitle">
            {contextLabel}
          </div>
        </div>
        <span className={`border-fit-badge ${appraisal.status}`}>
          {STATUS_LABEL[appraisal.status]}
        </span>
      </div>

      <div className="border-appraisal-hero">
        <div>
          <div className="border-appraisal-score">{scoreText(appraisal.score)}</div>
          <div className="muted">marginal Voyage score</div>
        </div>
        <div className="border-fit">
          <div className="border-fit-line">
            <span>Board fit</span>
            <strong>{fitPercent === null ? '—' : `${fitPercent}%`}</strong>
          </div>
          <div className="border-fit-track" aria-hidden="true">
            <span style={{ width: `${fitPercent ?? 0}%` }} />
          </div>
          <div className="muted border-fit-meta">
            {appraisal.enteredBorders}/12 entered · {appraisal.activeSegments} active
            {appraisal.attentionSegments > 0 ? ` · ${appraisal.attentionSegments} need attention` : ''}
          </div>
        </div>
      </div>

      <div className="muted small-note border-appraisal-note">
        Score is the difference versus this same layout with no borders. Fit compares each slot with
        its best-scoring known modifier; it is not a roll percentile or a keep/reroll recommendation.
      </div>

      {statGains.length > 0 && (
        <div className="border-stat-chips">
          {statGains.map(({ stat, value }) => (
            <span key={stat} className={value < 0 ? 'negative' : ''}>
              {value > 0 ? '+' : ''}
              {Math.round(value * 100)}% {STAT_LABELS[stat]}
            </span>
          ))}
        </div>
      )}

      {top.length > 0 ? (
        <>
          <div className="panel-title small">Strongest current matches</div>
          <div className="border-appraisal-list top">
            {top.map((segment) => (
              <SegmentRow key={segment.segment} segment={segment} compact />
            ))}
          </div>
        </>
      ) : (
        <div className="border-appraisal-empty muted">
          {appraisal.placedCharts === 0
            ? 'Place charts to measure which borders support the layout.'
            : appraisal.enteredBorders === 0
              ? 'Enter or import the 12 current borders to appraise the roll.'
              : 'The entered borders add no positive value under the current weights.'}
        </div>
      )}

      <details className="border-appraisal-details">
        <summary>All border contributions</summary>
        <div className="border-appraisal-list">
          {appraisal.segments.map((segment) => (
            <SegmentRow key={segment.segment} segment={segment} />
          ))}
        </div>
      </details>
    </section>
  )
}
