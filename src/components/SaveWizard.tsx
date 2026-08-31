import { formatNumber, t, ui } from '../i18n/locale'
import { useId, useMemo, useState } from 'react'
import {
  CUSTOM_OPTIONS,
  PIECE_TYPES,
  customKey,
  customLabel,
  matchesPiece,
  selectPieceBank,
  type PieceType,
} from '../logic/pieceKeeps'
import type { StrategyReservationPreferences } from '../data/strategies'
import type { ChartData } from '../types'
import { useModalDialog } from './ModalDialog'

interface Props {
  pool: ChartData[]
  /** current keep-count overrides from app state */
  keeps: Record<string, number>
  reservations: StrategyReservationPreferences
  onApply: (keeps: Record<string, number>) => void
  onClose: () => void
}

/** wizard steps: BANKING piece types grouped per strategy, in claim-priority
 *  order (a family shared by several strategies gets one knob, on the first) */
const STEPS: { strategyId: string; strategyName: string; pieces: PieceType[] }[] = []
for (const p of PIECE_TYPES) {
  if (!p.banks) continue
  const last = STEPS[STEPS.length - 1]
  if (last?.strategyId === p.strategyId) last.pieces.push(p)
  else STEPS.push({ strategyId: p.strategyId, strategyName: p.strategyName, pieces: [p] })
}

/** Guided popup: step through the strategies and set how many of each
 *  recommended chart type to bank. The solver holds the best X of each. */
export function SaveWizard({ pool, keeps, reservations, onApply, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Record<string, number>>({ ...keeps })
  const [query, setQuery] = useState('')
  const titleId = useId()
  const { dialogProps } = useModalDialog({ labelledBy: titleId, onClose })

  const summary = step >= STEPS.length
  const current = summary ? null : STEPS[step]

  const have = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of PIECE_TYPES) counts.set(p.key, pool.filter((c) => matchesPiece(c, p)).length)
    return counts
  }, [pool])

  const keepOf = (p: PieceType) => draft[p.key] ?? p.defaultKeep
  const bumpKey = (key: string, base: number, delta: number) =>
    setDraft((d) => ({ ...d, [key]: Math.max(0, (d[key] ?? base) + delta) }))
  const moveToStep = (nextStep: number) => {
    setQuery('')
    setStep(nextStep)
  }

  const bankedByStrategy = useMemo(() => {
    const counts = new Map<string, number>()
    for (const piece of selectPieceBank(pool, draft, reservations).values()) {
      counts.set(piece.strategyId, (counts.get(piece.strategyId) ?? 0) + 1)
    }
    return counts
  }, [draft, pool, reservations])

  // ---- user-added chart types for the current step ----
  const customsOf = (strategyId: string) =>
    Object.keys(draft)
      .filter((k) => k.startsWith(`custom:${strategyId}:`))
      .map((k) => ({ key: k, modIds: k.split(':')[2].split('+') }))

  const customs = current ? customsOf(current.strategyId) : []
  // searchable list of tier families this step doesn't already cover
  const q = query.trim().toLowerCase()
  const addable = current
    ? CUSTOM_OPTIONS.filter(
        (o) =>
          !o.modIds.every((id) => current.pieces.some((p) => p.modIds?.includes(id))) &&
          !customs.some((c) => c.modIds.join('+') === o.value) &&
          (!q || o.label.toLowerCase().includes(q)),
      )
    : []

  const pinnedTotal = (strategyId: string, pieces: PieceType[]) =>
    pieces.reduce((sum, p) => sum + keepOf(p), 0) +
    customsOf(strategyId).reduce((sum, c) => sum + (draft[c.key] ?? 0), 0)

  return (
    <div className="onboard-backdrop save-wizard-backdrop" data-modal-root onClick={onClose}>
      <div
        {...dialogProps}
        className="onboard save-wizard"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-title">
          <h2 id={titleId} className="panel-title-heading" data-dialog-initial-focus tabIndex={-1}>
            {t('🔖 Keep charts for strategies')}
          </h2>
          <span className="muted sw-progress">
            {summary ? t('summary') : t('step {v0} of {v1}', { v0: step + 1, v1: STEPS.length })}
          </span>
          <span className="spacer" />
          <button onClick={onClose}>{t('Cancel')}</button>
        </div>

        {current && (
          <>
            <div className="sw-strat">
              <span className="sw-strat-name">{current.strategyName}</span>
            </div>
            <div className="muted small-note" style={{ marginTop: 2 }}>
              {t(
                'How many of each recommended chart type should stay banked for this strategy? The solver keeps your best X of each - anything beyond that gets spent like a normal chart. Set 0 to bank none.',
              )}
            </div>
            <div className="sw-list">
              {current.pieces.map((p) => {
                const keep = keepOf(p)
                const owned = have.get(p.key) ?? 0
                return (
                  <div key={p.key} className={`sw-row ${keep > 0 ? 'pinned' : ''}`}>
                    <span className="sw-name">{ui(p.label)}</span>
                    <span className="sw-mod muted">
                      {t('suggested ')}
                      {formatNumber(p.recommended)}
                      {t(' · you have ')}
                      {formatNumber(owned)}
                    </span>
                    <span className="spacer" />
                    <span className="sw-stepper">
                      <button
                        aria-label={t('Keep one fewer {v0}', { v0: p.label })}
                        onClick={() => bumpKey(p.key, p.defaultKeep, -1)}
                        disabled={keep === 0}
                      >
                        −
                      </button>
                      <span className={`sw-keep ${keep > owned ? 'short' : ''}`}>
                        {formatNumber(keep)}
                      </span>
                      <button
                        aria-label={t('Keep one more {v0}', { v0: p.label })}
                        onClick={() => bumpKey(p.key, p.defaultKeep, 1)}
                      >
                        +
                      </button>
                    </span>
                  </div>
                )
              })}
              {customs.map((c) => {
                const keep = draft[c.key] ?? 0
                const owned = pool.filter((ch) =>
                  ch.modIds.some((id) => c.modIds.includes(id)),
                ).length
                return (
                  <div key={c.key} className={`sw-row ${keep > 0 ? 'pinned' : ''}`}>
                    <span className="sw-name">{ui(customLabel(c.modIds))}</span>
                    <span className="sw-mod muted">
                      {t('your addition · you have ')}
                      {formatNumber(owned)}
                    </span>
                    <span className="spacer" />
                    <span className="sw-stepper">
                      <button
                        aria-label={t('Keep one fewer {v0}', { v0: customLabel(c.modIds) })}
                        onClick={() => bumpKey(c.key, 0, -1)}
                        disabled={keep === 0}
                      >
                        −
                      </button>
                      <span className={`sw-keep ${keep > owned ? 'short' : ''}`}>
                        {formatNumber(keep)}
                      </span>
                      <button
                        aria-label={t('Keep one more {v0}', { v0: customLabel(c.modIds) })}
                        onClick={() => bumpKey(c.key, 0, 1)}
                      >
                        +
                      </button>
                    </span>
                    <button
                      className="sw-remove"
                      title={t('Remove this chart type')}
                      aria-label={t('Remove {v0}', { v0: customLabel(c.modIds) })}
                      onClick={() =>
                        setDraft((d) => {
                          const next = { ...d }
                          delete next[c.key]
                          return next
                        })
                      }
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="sw-add">
              <label className="sr-only" htmlFor="sw-chart-type-search">
                {t('Search chart types to add')}
              </label>
              <input
                id="sw-chart-type-search"
                placeholder={t('+ Add a chart type… search (e.g. Diviner, Lantern, Barrel)')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {q && (
              <div className="sw-add-list">
                {addable.map((o) => (
                  <button
                    key={o.value}
                    className="sw-add-option"
                    onClick={() => {
                      setDraft((d) => ({
                        ...d,
                        [customKey(current.strategyId, o.modIds)]: 1,
                      }))
                      setQuery('')
                    }}
                  >
                    <span>{ui(o.label)}</span>
                    <span
                      className={`sw-add-scope scope-${o.scope === 'voyage' ? 'global' : 'adjacent'}`}
                    >
                      {o.scope}
                    </span>
                  </button>
                ))}
                {addable.length === 0 && <span className="muted pad">{t('No matches')}</span>}
              </div>
            )}
          </>
        )}

        {summary && (
          <>
            <div className="muted small-note">
              {t(
                'Press Save to apply. Banked charts show a 🔒 in the library naming their strategy; rerun this wizard any time to adjust the counts.',
              )}
            </div>
            <div className="sw-list">
              {STEPS.map((s) => {
                const total = pinnedTotal(s.strategyId, s.pieces)
                const banked = bankedByStrategy.get(s.strategyId) ?? 0
                return (
                  <div key={s.strategyId} className="sw-row summary">
                    <span className="sw-pin">{total > 0 ? '🔖' : '·'}</span>
                    <span className="sw-name">{s.strategyName}</span>
                    <span className="sw-mod muted">
                      {t('banking ')}
                      {formatNumber(banked)}
                      {t(' now · limit ')}
                      {formatNumber(total)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="sw-actions">
          <button disabled={step === 0} onClick={() => moveToStep(step - 1)}>
            {t('← Back')}
          </button>
          <span className="spacer" />
          {!summary && <button onClick={() => moveToStep(step + 1)}>{t('Next →')}</button>}
          {summary && (
            <button
              className="primary sw-save"
              onClick={() => {
                onApply(draft)
                onClose()
              }}
            >
              {t('💾 Save keep counts')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
