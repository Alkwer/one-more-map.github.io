import { t, ui } from '../i18n/locale'
import { useId, useMemo, useState } from 'react'
import { BORDER_MODS, VOYAGE_MODS } from '../data/mods'
import type { Scope } from '../types'
import { STAT_SHORT } from '../types'
import { useModalDialog } from './ModalDialog'

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
  const titleId = useId()
  const { dialogProps } = useModalDialog({ labelledBy: titleId, onClose })

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
    <div className="onboard-backdrop" data-modal-root onClick={onClose}>
      <div
        {...dialogProps}
        className="onboard modbrowser"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-title">
          <h2 id={titleId} className="panel-title-heading" data-dialog-initial-focus tabIndex={-1}>
            {t('Chart Modifiers')}
          </h2>
          <span className="spacer" />
          <button onClick={onClose}>{t('Done')}</button>
        </div>
        <p className="onboard-intro" style={{ marginBottom: 8 }}>
          {t(
            'Every modifier the solver knows about. Untick any you do not care about and it will be worth nothing in scoring. Your choices are saved and carry across updates.',
          )}
          {disabledCount > 0 ? t(' ({v0} off)', { v0: disabledCount }) : ''}
        </p>
        <input
          aria-label={t('Filter chart modifiers')}
          placeholder={t('Filter modifiers…')}
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
                <span className="mb-group-title">{ui(g.title)}</span>
                <span className="muted mb-group-hint">{ui(g.hint)}</span>
                <span className="spacer" />
                <button className="mb-bulk" onClick={() => onBulk(ids, anyOn)}>
                  {anyOn ? t('Disable all') : t('Enable all')}
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
                      <span className="mb-text">{ui(m.text)}</span>
                      {m.value && <span className="mb-value">{ui(m.value)}</span>}
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
