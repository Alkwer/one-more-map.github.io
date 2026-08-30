import { ui } from '../i18n/locale'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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
type TooltipState = NonNullable<Parameters<Listener>[0]>
interface ViewportBounds {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}
interface TooltipPlacement {
  source: TooltipState
  left: number
  top: number
  width: number
  maxHeight: number
}

const TOOLTIP_WIDTH = 320
const VIEWPORT_GUTTER = 8
const ANCHOR_GAP = 8

function viewportBounds(): ViewportBounds {
  const viewport = window.visualViewport
  const left = viewport?.offsetLeft ?? 0
  const top = viewport?.offsetTop ?? 0
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  return { left, top, right: left + width, bottom: top + height, width, height }
}

function clampToRange(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, Math.max(minimum, maximum)))
}

function placeTooltip(anchor: DOMRect, tooltip: DOMRect, viewport: ViewportBounds) {
  const minimumLeft = viewport.left + VIEWPORT_GUTTER
  const maximumLeft = viewport.right - VIEWPORT_GUTTER - tooltip.width
  const left = clampToRange(
    anchor.left + anchor.width / 2 - tooltip.width / 2,
    minimumLeft,
    maximumLeft,
  )
  const minimumTop = viewport.top + VIEWPORT_GUTTER
  const maximumTop = viewport.bottom - VIEWPORT_GUTTER - tooltip.height
  const spaceAbove = anchor.top - minimumTop - ANCHOR_GAP
  const spaceBelow = viewport.bottom - VIEWPORT_GUTTER - anchor.bottom - ANCHOR_GAP
  const preferredTop =
    spaceAbove >= tooltip.height || spaceAbove >= spaceBelow
      ? anchor.top - ANCHOR_GAP - tooltip.height
      : anchor.bottom + ANCHOR_GAP

  return {
    left,
    top: clampToRange(preferredTop, minimumTop, maximumTop),
  }
}
let listener: Listener | null = null
let activeAnchor: HTMLElement | null = null

export function showPoeTooltip(el: HTMLElement, data: TooltipData) {
  activeAnchor = el
  listener?.({ anchor: el.getBoundingClientRect(), data })
}
export function hidePoeTooltip() {
  activeAnchor = null
  listener?.(null)
}

function togglePoeTooltip(el: HTMLElement, data: TooltipData) {
  if (activeAnchor === el) hidePoeTooltip()
  else showPoeTooltip(el, data)
}

export function TooltipDescription({ id, data }: { id: string; data: TooltipData }) {
  return (
    <span id={id} className="sr-only">
      {data.title}. {ui(data.lines.map((line) => line.text).join('. '))}
    </span>
  )
}

/** Convenience props spread: <div {...tooltipProps({title, lines})}> */
export function tooltipProps(data: TooltipData, descriptionId: string, toggle = false) {
  if (toggle) {
    return {
      'aria-describedby': descriptionId,
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation()
        togglePoeTooltip(e.currentTarget, data)
      },
      onBlur: hidePoeTooltip,
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          hidePoeTooltip()
        }
      },
    }
  }
  return {
    'aria-describedby': descriptionId,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showPoeTooltip(e.currentTarget, data),
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      if (document.activeElement !== e.currentTarget) hidePoeTooltip()
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => showPoeTooltip(e.currentTarget, data),
    onBlur: hidePoeTooltip,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        hidePoeTooltip()
      }
    },
  }
}

// Header built from the game's 3-piece asset: left cap, tiling middle, right cap.

export function TooltipLayer() {
  const [state, setState] = useState<TooltipState | null>(null)
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listener = setState
    return () => {
      listener = null
    }
  }, [])

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!state || !tooltip) return

    const updatePlacement = () => {
      const viewport = viewportBounds()
      const width = Math.max(1, Math.min(TOOLTIP_WIDTH, viewport.width - VIEWPORT_GUTTER * 2))
      const maxHeight = Math.max(1, viewport.height - VIEWPORT_GUTTER * 2)
      tooltip.style.width = `${width}px`
      tooltip.style.maxHeight = `${maxHeight}px`
      const tooltipRect = tooltip.getBoundingClientRect()
      const anchor = activeAnchor?.getBoundingClientRect() ?? state.anchor
      const position = placeTooltip(anchor, tooltipRect, viewport)
      setPlacement((current) => {
        const next = { source: state, ...position, width, maxHeight }
        return current?.source === state &&
          current.left === next.left &&
          current.top === next.top &&
          current.width === next.width &&
          current.maxHeight === next.maxHeight
          ? current
          : next
      })
    }

    updatePlacement()
    const resizeObserver = new ResizeObserver(updatePlacement)
    const capturedPassiveScroll = { capture: true, passive: true } as const
    const passiveScroll = { passive: true } as const
    resizeObserver.observe(tooltip)
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, capturedPassiveScroll)
    window.visualViewport?.addEventListener('resize', updatePlacement)
    window.visualViewport?.addEventListener('scroll', updatePlacement, passiveScroll)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
      window.visualViewport?.removeEventListener('resize', updatePlacement)
      window.visualViewport?.removeEventListener('scroll', updatePlacement)
    }
  }, [state])

  if (!state) return null
  const { data } = state
  const viewport = viewportBounds()
  const currentPlacement = placement?.source === state ? placement : null
  const style: React.CSSProperties = {
    left: currentPlacement?.left ?? viewport.left + VIEWPORT_GUTTER,
    top: currentPlacement?.top ?? viewport.top + VIEWPORT_GUTTER,
    width:
      currentPlacement?.width ??
      Math.max(1, Math.min(TOOLTIP_WIDTH, viewport.width - VIEWPORT_GUTTER * 2)),
    maxHeight: currentPlacement?.maxHeight ?? Math.max(1, viewport.height - VIEWPORT_GUTTER * 2),
    visibility: currentPlacement ? 'visible' : 'hidden',
  }

  return (
    <div ref={tooltipRef} className="poe-tooltip" style={style} aria-hidden="true">
      <div className="poe-tt-header">
        <span className="poe-tt-title">{data.title}</span>
      </div>
      {data.lines.length > 0 && (
        <div className="poe-tt-body">
          {data.lines.map((l, i) => (
            <div key={i} className={`poe-tt-line ${l.cls ?? ''}`}>
              {ui(l.text)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
