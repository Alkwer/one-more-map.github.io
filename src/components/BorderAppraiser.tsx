import { formatDecimal, formatNumber, t, ui } from '../i18n/locale'
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
  weak: 'Low ceiling ratio',
  mixed: 'Medium ceiling ratio',
  strong: 'High ceiling ratio',
  excellent: 'Very high ceiling ratio',
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
  `${value > 0 ? '+' : ''}${Math.abs(value) < 0.05 ? '0.0' : formatDecimal(value, 1)}`

const segmentTitle = (segment: BorderSegmentAppraisal) => {
  if (!segment.bestLabel) return undefined
  return `Best known fit for this slot: ${segment.bestLabel} (${scoreText(segment.bestContribution)})`
}

function SegmentRow({
  segment,
  compact = false,
}: {
  segment: BorderSegmentAppraisal
  compact?: boolean
}) {
  const issue = segment.issue ? ISSUE_LABEL[segment.issue] : null
  const tone =
    segment.contribution < 0 ? 'negative' : segment.contribution > 0 ? 'positive' : 'zero'

  return (
    <div className={`border-appraisal-row ${tone}`} title={ui(segmentTitle(segment))}>
      <div className="border-appraisal-place">
        <span>{ui(segment.position)}</span>
        <span className="muted">{segment.chartName ?? t('Empty square')}</span>
      </div>
      <div className="border-appraisal-mod">
        <span>{ui(segment.modLabel) ?? t('No border selected')}</span>
        {!compact && (
          <span className="muted">
            {ui(issue) ??
              (segment.fit !== null
                ? t('{v0}% slot fit', { v0: Math.round(segment.fit * 100) })
                : t('Scored effect'))}
          </span>
        )}
      </div>
      <strong>{segment.modId ? ui(scoreText(segment.contribution)) : '—'}</strong>
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
          <h3 id="border-appraiser-title" className="panel-title">
            {t('Border Fit Diagnostic')}
          </h3>
          <div className="muted border-appraiser-subtitle">{ui(contextLabel)}</div>
        </div>
        <span className={`border-fit-badge ${appraisal.status}`}>
          {ui(STATUS_LABEL[appraisal.status])}
        </span>
      </div>

      <div className="border-appraisal-hero">
        <div>
          <div className="border-appraisal-score">{ui(scoreText(appraisal.score))}</div>
          <div className="muted">{t('marginal Voyage score')}</div>
        </div>
        <div className="border-fit">
          <div className="border-fit-line">
            <span>{t('Theoretical ceiling ratio')}</span>
            <strong>{fitPercent === null ? '—' : t('{v0}%', { v0: fitPercent })}</strong>
          </div>
          <div className="border-fit-track" aria-hidden="true">
            <span style={{ width: `${fitPercent ?? 0}%` }} />
          </div>
          <div className="muted border-fit-meta">
            {formatNumber(appraisal.enteredBorders)}
            {t('/12 entered · ')}
            {formatNumber(appraisal.activeSegments)}
            {t(' active')}
            {appraisal.attentionSegments > 0
              ? t(' · {v0} need attention', { v0: appraisal.attentionSegments })
              : ''}
          </div>
        </div>
      </div>

      <div className="muted small-note border-appraisal-note">
        {t(
          'Score is the difference versus this same layout with no borders. The ceiling ratio assumes a best-scoring known modifier in every relevant slot simultaneously; it is not a roll percentile and is never used as a keep/reroll threshold.',
        )}
      </div>

      {statGains.length > 0 && (
        <div className="border-stat-chips">
          {statGains.map(({ stat, value }) => (
            <span key={stat} className={value < 0 ? 'negative' : ''}>
              {value > 0 ? '+' : ''}
              {formatNumber(Math.round(value * 100))}% {ui(STAT_LABELS[stat])}
            </span>
          ))}
        </div>
      )}

      {top.length > 0 ? (
        <>
          <h4 className="panel-title small">{t('Strongest current matches')}</h4>
          <div className="border-appraisal-list top">
            {top.map((segment) => (
              <SegmentRow key={segment.segment} segment={segment} compact />
            ))}
          </div>
        </>
      ) : (
        <div className="border-appraisal-empty muted">
          {appraisal.placedCharts === 0
            ? t('Place charts to measure which borders support the layout.')
            : appraisal.enteredBorders === 0
              ? t('Enter or import the 12 current borders to appraise the roll.')
              : t('The entered borders add no positive value under the current weights.')}
        </div>
      )}

      <details className="border-appraisal-details">
        <summary>{t('All border contributions')}</summary>
        <div className="border-appraisal-list">
          {appraisal.segments.map((segment) => (
            <SegmentRow key={segment.segment} segment={segment} />
          ))}
        </div>
      </details>
    </section>
  )
}
