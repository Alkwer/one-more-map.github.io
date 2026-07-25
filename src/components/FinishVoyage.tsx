import { useState } from 'react'
import type { ChartData } from '../types'

interface Props {
  /** the charts that were marked Preserved on the board */
  charts: ChartData[]
  onConfirm: (keptUids: Set<string>) => void
  onCancel: () => void
}

export function FinishVoyage({ charts, onConfirm, onCancel }: Props) {
  // default: assume all marked charts survived; the user unticks ones that didn't
  const [kept, setKept] = useState<Set<string>>(() => new Set(charts.map((c) => c.uid)))

  const toggle = (uid: string) =>
    setKept((s) => {
      const next = new Set(s)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })

  return (
    <div className="onboard-backdrop" onClick={onCancel}>
      <div className="onboard finishvoyage" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">Finish Voyage</div>
        <p className="onboard-intro" style={{ marginBottom: 10 }}>
          Preservation is a chance, so it may not have worked. Tick the charts that actually
          survived the Voyage. The rest, and every unmarked chart on the board, are consumed.
        </p>
        <div className="fv-list">
          {charts.map((c) => {
            const on = kept.has(c.uid)
            return (
              <label key={c.uid} className={`fv-row ${on ? 'kept' : 'lost'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(c.uid)} />
                <span className="fv-name">{c.name}</span>
                <span className="fv-status">{on ? 'kept' : 'consumed'}</span>
              </label>
            )
          })}
        </div>
        <div className="onboard-actions">
          <button className="primary" onClick={() => onConfirm(kept)}>
            Confirm ({kept.size} kept)
          </button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
