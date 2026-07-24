import { useMemo, useState } from 'react'
import { BORDER_MODS, VOYAGE_MODS } from '../data/mods'
import type { Scope } from '../types'
import { STAT_SHORT } from '../types'

interface Props {
  disabled: Set<string>
  onToggle: (id: string, off: boolean) => void
  onBulk: (ids: string[], off: boolean) => void
  onClose: () => void
}

interface Group {
  title: string
  hint: string
  mods: { id: string; text: string; short?: string; value?: string }[]
}

const valueLabel = (effects: { stat: string; percent: number }[]): string | undefined => {
  const e = effects[0]
  if (!e) return undefined
  return `${e.percent > 0 ? '+' : ''}${e.percent}% ${STAT_SHORT[e.stat as keyof typeof STAT_SHORT] ?? e.stat}`
}

export function ModBrowser({ disabled, onToggle, onBulk, onClose }: Props) {
  const [q, setQ] = useState('')

  const groups: Group[] = useMemo(() => {
    const byScope = (scope: Scope) =>
      VOYAGE_MODS.filter((m) => m.scope === scope).map((m) => ({
        id: m.id,
        text: m.text,
        short: m.short,
        value: valueLabel(m.effects),
      }))
    return [
      { title: 'Area Modifiers', hint: "a chart's own area", mods: byScope('self') },
      { title: 'Adjacent Modifiers', hint: 'neighbouring areas', mods: byScope('adjacent') },
      { title: 'Voyage Modifiers', hint: 'the whole voyage', mods: byScope('global') },
      {
        title: 'Border Modifiers',
        hint: 'Corruption Currents',
        mods: BORDER_MODS.map((m) => ({
          id: m.id,
          text: m.text,
          short: m.short,
          value: valueLabel(m.effects) ?? (m.magnitude ? `${m.magnitude}% Magnitude` : undefined),
        })),
      },
    ]
  }, [])

  const query = q.trim().toLowerCase()
  const match = (m: { text: string; short?: string }) =>
    !query || m.text.toLowerCase().includes(query) || (m.short ?? '').toLowerCase().includes(query)

  const disabledCount = disabled.size

  return (
    <div className="onboard-backdrop" onClick={onClose}>
      <div className="onboard modbrowser" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          Chart Modifiers
          <span className="spacer" />
          <button onClick={onClose}>Done</button>
        </div>
        <p className="onboard-intro" style={{ marginBottom: 8 }}>
          Every modifier the solver knows about. Untick any you do not care about and it will be
          worth nothing in scoring. Your choices are saved and carry across updates.
          {disabledCount > 0 ? ` (${disabledCount} off)` : ''}
        </p>
        <input
          placeholder="Filter modifiers…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        {groups.map((g) => {
          const shown = g.mods.filter(match)
          if (shown.length === 0) return null
          const ids = shown.map((m) => m.id)
          const anyOn = shown.some((m) => !disabled.has(m.id))
          return (
            <div key={g.title} className="mb-group">
              <div className="mb-group-head">
                <span className="mb-group-title">{g.title}</span>
                <span className="muted mb-group-hint">{g.hint}</span>
                <span className="spacer" />
                <button className="mb-bulk" onClick={() => onBulk(ids, anyOn)}>
                  {anyOn ? 'Disable all' : 'Enable all'}
                </button>
              </div>
              <div className="mb-list">
                {shown.map((m) => {
                  const on = !disabled.has(m.id)
                  return (
                    <label key={m.id} className={`mb-row ${on ? '' : 'off'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => onToggle(m.id, !e.target.checked)}
                      />
                      <span className="mb-text">{m.text}</span>
                      {m.value && <span className="mb-value">{m.value}</span>}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
