import { useMemo, useState } from 'react'
import {
  PIECE_TYPES,
  customKey,
  matchesPiece,
  type PieceType,
} from '../logic/pieceKeeps'
import { VOYAGE_MODS, voyageModById } from '../data/mods'
import type { ChartData } from '../types'

interface Props {
  pool: ChartData[]
  /** current keep-count overrides from app state */
  keeps: Record<string, number>
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
export function SaveWizard({ pool, keeps, onApply, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Record<string, number>>({ ...keeps })
  const [pendingMod, setPendingMod] = useState('')

  const summary = step >= STEPS.length
  const current = summary ? null : STEPS[step]

  const have = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of PIECE_TYPES)
      counts.set(p.key, pool.filter((c) => matchesPiece(c, p)).length)
    return counts
  }, [pool])

  const keepOf = (p: PieceType) => draft[p.key] ?? p.defaultKeep
  const bumpKey = (key: string, base: number, delta: number) =>
    setDraft((d) => ({ ...d, [key]: Math.max(0, (d[key] ?? base) + delta) }))

  // ---- user-added chart types for the current step ----
  const customsOf = (strategyId: string) =>
    Object.keys(draft)
      .filter((k) => k.startsWith(`custom:${strategyId}:`))
      .map((k) => ({ key: k, modId: k.split(':')[2] }))

  const customs = current ? customsOf(current.strategyId) : []
  // dropdown: any non-self mod this step doesn't already cover
  const addable = current
    ? VOYAGE_MODS.filter(
        (m) =>
          m.scope !== 'self' &&
          !current.pieces.some((p) => p.modIds?.includes(m.id)) &&
          !customs.some((c) => c.modId === m.id),
      )
    : []

  const pinnedTotal = (strategyId: string, pieces: PieceType[]) =>
    pieces.reduce((sum, p) => sum + keepOf(p), 0) +
    customsOf(strategyId).reduce((sum, c) => sum + (draft[c.key] ?? 0), 0)

  return (
    <div className="onboard-backdrop" onClick={onClose}>
      <div className="onboard save-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          🔖 Keep charts for strategies
          <span className="muted sw-progress">
            {summary ? 'summary' : `step ${step + 1} of ${STEPS.length}`}
          </span>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
        </div>

        {current && (
          <>
            <div className="sw-strat">
              <span className="sw-strat-name">{current.strategyName}</span>
            </div>
            <div className="muted small-note" style={{ marginTop: 2 }}>
              How many of each recommended chart type should stay banked for this strategy? The
              solver keeps your best X of each - anything beyond that gets spent like a normal
              chart. Set 0 to bank none.
            </div>
            <div className="sw-list">
              {current.pieces.map((p) => {
                const keep = keepOf(p)
                const owned = have.get(p.key) ?? 0
                return (
                  <div key={p.key} className={`sw-row ${keep > 0 ? 'pinned' : ''}`}>
                    <span className="sw-name">{p.label}</span>
                    <span className="sw-mod muted">
                      suggested {p.recommended} · you have {owned}
                    </span>
                    <span className="spacer" />
                    <span className="sw-stepper">
                      <button onClick={() => bumpKey(p.key, p.defaultKeep, -1)} disabled={keep === 0}>
                        −
                      </button>
                      <span className={`sw-keep ${keep > owned ? 'short' : ''}`}>{keep}</span>
                      <button onClick={() => bumpKey(p.key, p.defaultKeep, 1)}>+</button>
                    </span>
                  </div>
                )
              })}
              {customs.map((c) => {
                const mod = voyageModById.get(c.modId)
                const keep = draft[c.key] ?? 0
                const owned = pool.filter((ch) => ch.modIds.includes(c.modId)).length
                return (
                  <div key={c.key} className={`sw-row ${keep > 0 ? 'pinned' : ''}`}>
                    <span className="sw-name">{mod?.short ?? mod?.text ?? c.modId}</span>
                    <span className="sw-mod muted">your addition · you have {owned}</span>
                    <span className="spacer" />
                    <span className="sw-stepper">
                      <button onClick={() => bumpKey(c.key, 0, -1)} disabled={keep === 0}>
                        −
                      </button>
                      <span className={`sw-keep ${keep > owned ? 'short' : ''}`}>{keep}</span>
                      <button onClick={() => bumpKey(c.key, 0, 1)}>+</button>
                    </span>
                    <button
                      className="sw-remove"
                      title="Remove this chart type"
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
              <select value={pendingMod} onChange={(e) => setPendingMod(e.target.value)}>
                <option value="">+ Add a chart type to this strategy…</option>
                {addable.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.short ?? m.text} ({m.scope === 'global' ? 'voyage' : 'adjacent'})
                  </option>
                ))}
              </select>
              <button
                disabled={!pendingMod}
                onClick={() => {
                  if (!current || !pendingMod) return
                  setDraft((d) => ({
                    ...d,
                    [customKey(current.strategyId, pendingMod)]: 1,
                  }))
                  setPendingMod('')
                }}
              >
                Add
              </button>
            </div>
          </>
        )}

        {summary && (
          <>
            <div className="muted small-note">
              Press Save to apply. Banked charts show a 🔒 in the library naming their strategy;
              rerun this wizard any time to adjust the counts.
            </div>
            <div className="sw-list">
              {STEPS.map((s) => {
                const total = pinnedTotal(s.strategyId, s.pieces)
                return (
                  <div key={s.strategyId} className="sw-row summary">
                    <span className="sw-pin">{total > 0 ? '🔖' : '·'}</span>
                    <span className="sw-name">{s.strategyName}</span>
                    <span className="sw-mod muted">keeping up to {total}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="sw-actions">
          <button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            ← Back
          </button>
          <span className="spacer" />
          {!summary && <button onClick={() => setStep((s) => s + 1)}>Next →</button>}
          {summary && (
            <button
              className="primary sw-save"
              onClick={() => {
                onApply(draft)
                onClose()
              }}
            >
              💾 Save keep counts
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
