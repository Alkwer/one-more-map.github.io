import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { BORDER_MODS, borderModById } from '../../data/mods'
import { STAT_SHORT } from '../../types'

interface BorderPickerProps {
  value: string | null
  onChange: (id: string | null) => void
  segment: number
  vertical?: boolean
}

export function BorderPicker({ value, onChange, segment, vertical }: BorderPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const pickerId = useId()
  const pickerTitleId = `${pickerId}-title`
  const mod = value ? borderModById.get(value) : null
  const effect = mod?.effects[0]
  const filtered = BORDER_MODS.filter((candidate) =>
    candidate.text.toLowerCase().includes(query.toLowerCase()),
  )
  // keep the popover on-screen: right-column segments align right, left-column align left
  const align = segment >= 3 && segment <= 5 ? 'right' : segment >= 9 ? 'left' : 'center'

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  const closePicker = () => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const pick = (id: string | null) => {
    onChange(id)
    closePicker()
  }
  const openPicker = () => {
    setQuery('')
    setOpen(true)
  }

  const onPickerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={`bslot-wrap ${vertical ? 'bslot-vertical' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`bslot ${mod ? 'filled' : ''}`}
        title={mod?.text ?? 'Border segment: activate to search'}
        aria-label={`Border segment ${segment + 1}: ${mod?.text ?? 'No border'}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? pickerId : undefined}
        onClick={openPicker}
      >
        {mod ? (
          <span>
            {mod.short ??
              (effect
                ? `+${effect.percent}% ${STAT_SHORT[effect.stat]}`
                : mod.magnitude
                  ? `${mod.magnitude}% Magnitude`
                  : '✦')}
          </span>
        ) : (
          <span className="bslot-empty">·</span>
        )}
      </button>
      {open && (
        <>
          <div className="bpop-backdrop" aria-hidden="true" onClick={closePicker} />
          <div
            ref={dialogRef}
            id={pickerId}
            className={`bpop bpop-${align}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={pickerTitleId}
            onKeyDown={onPickerKeyDown}
          >
            <div className="bpop-head">
              <h3 id={pickerTitleId} className="sr-only">
                Choose a modifier for border segment {segment + 1}
              </h3>
              <button
                type="button"
                className="bpop-close"
                aria-label={`Close border segment ${segment + 1} picker`}
                onClick={closePicker}
              >
                ×
              </button>
            </div>
            <input
              ref={searchRef}
              aria-label="Search border modifiers"
              placeholder="Search border mods…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filtered.length > 0) pick(filtered[0].id)
              }}
            />
            <div className="bpop-list">
              <button type="button" className="bpop-item muted" onClick={() => pick(null)}>
                No border
              </button>
              {filtered.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  className={`bpop-item ${candidate.id === value ? 'active' : ''}`}
                  aria-pressed={candidate.id === value}
                  onClick={() => pick(candidate.id)}
                >
                  {candidate.short && <span className="bpop-short">{candidate.short}</span>}
                  <span className="bpop-full">{candidate.text}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <span className="bpop-none" role="status">
                  No matches
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
