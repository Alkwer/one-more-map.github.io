import { useEffect, useState } from 'react'

// PoE item-tooltip recreation: ornate header bar with medallion end-caps,
// dark body with centred mod lines (see in-game item hovers).

export interface TooltipLine {
  text: string
  cls?: string // e.g. 'scope-self' | 'scope-adjacent' | 'scope-global' | 'muted'
}
export interface TooltipData {
  title: string
  lines: TooltipLine[]
}

type Listener = (state: { anchor: DOMRect; data: TooltipData } | null) => void
let listener: Listener | null = null

export function showPoeTooltip(el: HTMLElement, data: TooltipData) {
  listener?.({ anchor: el.getBoundingClientRect(), data })
}
export function hidePoeTooltip() {
  listener?.(null)
}

/** Convenience props spread: <div {...tooltipProps({title, lines})}> */
export function tooltipProps(data: TooltipData) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showPoeTooltip(e.currentTarget, data),
    onMouseLeave: hidePoeTooltip,
  }
}

// Header built from the game's 3-piece asset: left cap, tiling middle, right cap.

export function TooltipLayer() {
  const [state, setState] = useState<{ anchor: DOMRect; data: TooltipData } | null>(null)
  useEffect(() => {
    listener = setState
    return () => {
      listener = null
    }
  }, [])

  if (!state) return null
  const { anchor, data } = state

  const width = 320
  let left = anchor.left + anchor.width / 2 - width / 2
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
  // prefer above the anchor; flip below when cramped
  const estHeight = 60 + data.lines.length * 22
  const above = anchor.top - 8 - estHeight > 0
  const style: React.CSSProperties = above
    ? { left, width, bottom: window.innerHeight - anchor.top + 8 }
    : { left, width, top: anchor.bottom + 8 }

  return (
    <div className="poe-tooltip" style={style}>
      <div className="poe-tt-header">
        <span className="poe-tt-title">{data.title}</span>
      </div>
      {data.lines.length > 0 && (
        <div className="poe-tt-body">
          {data.lines.map((l, i) => (
            <div key={i} className={`poe-tt-line ${l.cls ?? ''}`}>
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
