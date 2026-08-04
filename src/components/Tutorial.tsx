import { useId, useLayoutEffect, useState } from 'react'
import { useModalDialog } from './ModalDialog'

interface Props {
  onClose: () => void
}

interface Step {
  icon: string
  title: string
  /** where this lives on the page */
  where: string
  /** CSS selector of the section to spotlight */
  target: string
  body: string[]
}

const STEPS: Step[] = [
  {
    icon: '🗺️',
    title: 'What this site does',
    where: 'The whole page, left to right: Library → Board → Strategies',
    target: 'main',
    body: [
      'The Voyage board takes 9 charts. Where each chart sits decides what its modifiers touch - adjacent bonuses shoot into neighbouring squares, border rolls only pay out on the tiles they touch, and connectors have to line up or the voyage will not run.',
      'This site keeps your chart collection, knows the real placement rules, and finds the best runnable board for you - either with your own priorities or with a curated community strategy.',
    ],
  },
  {
    icon: '📥',
    title: 'Get your charts in',
    where: 'Chart Library (left column) and the Import panel below it',
    target: '.library-col',
    body: [
      'Quick way: Ctrl+C a chart in game, then Ctrl+V anywhere on this page. It imports instantly - name, level, modifiers, shape, everything.',
      'Whole collection: download the Windows bulk importer from the Import panel. Its first-run wizard calibrates your chart grid once; after that one hotkey (F9) sweeps every chart AND reads all 12 board borders with local OCR in seconds.',
      'Works with English and Korean clients. Rare charts trigger a golden alert so you know Divine fuel arrived.',
    ],
  },
  {
    icon: '🧭',
    title: 'Enter your borders',
    where: 'The board (middle) - the small slots around its edge',
    target: '.board-grid',
    body: [
      'Border modifiers (Corruption Currents) only affect the tiles they touch, so the solver needs to know them. The bulk importer fills all 12 automatically.',
      'By hand: click any border slot and search. Corners touch 2 tiles, edges 1.',
      'Watch for the jackpot: a "+1 Divine Orb per Rare Monster" border turns a rares board into a money printer - the site flags it loudly when you enter one.',
    ],
  },
  {
    icon: '⚑',
    title: 'Pick a strategy (or go manual)',
    where: 'Strategies (right column)',
    target: '.strategies',
    body: [
      'Curated community builds: Alc & Go for burning spares, Speedrun Strongboxes as the daily farm, Meatfish as the juiced board, and two Divine-border jackpot builds.',
      'Each card shows the guide, the in-game rolling regexes, and whether you actually have the pieces - if not, it tells you what is missing and what to run in the meantime.',
      'Prefer your own priorities? Stay on "None (manual)" and set per-reward weights in Solver Settings.',
    ],
  },
  {
    icon: '🔖',
    title: 'Bank your keeper charts',
    where: 'Chart Library → "Save charts for strategies…"',
    target: '.savefor-bar',
    body: [
      'The keep-count wizard walks each strategy\'s recommended chart types with a "keep X" stepper - the solver banks your best X of each and spends everything beyond that.',
      'Banked charts wear a 🔒 naming their strategy, never get burned by other solves or filler voyages, and are always available when their own strategy runs.',
      'Defaults match what each strategy actually needs, so you can skip this entirely and it just works.',
    ],
  },
  {
    icon: '⚙',
    title: 'Solve',
    where: 'The Solver panel in Diagnostics',
    target: '.solver-actions',
    body: [
      'Press Solve. Ranked results appear below when the worker finishes; click the result you want to load onto the board. Nothing is applied automatically.',
      'Every suggestion obeys the real rules: connectors match, all 9 squares filled, everything reachable from the ⚓ start.',
      'Connector rules, reward weights, protections and the filler-voyage builder are in the same Solver panel.',
    ],
  },
  {
    icon: '📋',
    title: 'Copy it into the game',
    where: '"Copy into game" below the board',
    target: '.voyage-finish',
    body: [
      'The game fills the board bottom-left first - this walks your board in exactly that order.',
      'Each step copies an in-game search string for the right chart: paste it in your chart inventory, Ctrl+click the chart it highlights, press Ctrl+C here to advance. Nine charts, no mistakes.',
      'Lock a chart to a square first? Mark it 🔒 preserved on the tile and every future solve pins it exactly there.',
    ],
  },
  {
    icon: '🌊',
    title: 'Run it, finish it, repeat',
    where: '"Finish Voyage" below the board; 📋 Plan sits next to Solve in Diagnostics',
    target: '.voyage-finish',
    body: [
      'After the voyage, press Finish Voyage (next to Copy into game): it consumes the board charts and asks, one by one, which preserved charts actually survived.',
      'The 📋 Plan button beside Solve sequences your whole library into a run order - juiced boards when ready, Speedruns while centre charts last, Alc & Go with the rest.',
      'The Updates button up top lists everything new. Good luck out there - may every border be Divine.',
    ],
  },
]

const RING_PAD = 6

/** Guided "how to use this site" walkthrough: dims the page and spotlights
 *  the section each step talks about, with the card docked out of the way. */
export function Tutorial({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const titleId = useId()
  const { dialogProps } = useModalDialog({ labelledBy: titleId, onClose })
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  // track the spotlighted section (through smooth scrolling and resizes)
  useLayoutEffect(() => {
    const el = document.querySelector(STEPS[step].target)
    if (!el) {
      setRect(null)
      return
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const update = () => setRect(el.getBoundingClientRect())
    update()
    const timer = window.setInterval(update, 120)
    window.addEventListener('resize', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', update)
    }
  }, [step])

  // dock the card where it won't cover the spotlight
  const dockTop = !!rect && rect.bottom > window.innerHeight * 0.62

  return (
    <div data-modal-root>
      <div className="tut-catcher" onClick={onClose} />
      {rect ? (
        <div
          className="tut-ring"
          aria-hidden="true"
          style={{
            top: rect.top - RING_PAD,
            left: rect.left - RING_PAD,
            width: rect.width + RING_PAD * 2,
            height: rect.height + RING_PAD * 2,
          }}
        />
      ) : (
        <div className="tut-dim" aria-hidden="true" />
      )}
      <div {...dialogProps} className={`onboard tutorial tut-docked ${dockTop ? 'tut-top' : ''}`}>
        <div className="panel-title">
          <h2 id={titleId} className="panel-title-heading" data-dialog-initial-focus tabIndex={-1}>
            {s.icon} {s.title}
          </h2>
          <span className="spacer" />
          <button aria-label="Close tutorial" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="tut-where">📍 {s.where}</div>
        {s.body.map((p, i) => (
          <p key={i} className="tut-body">
            {p}
          </p>
        ))}
        <div className="tut-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`tut-dot ${i === step ? 'on' : ''}`}
              onClick={() => setStep(i)}
              title={`${STEPS[i].icon} ${STEPS[i].title}`}
              aria-label={`Go to tutorial step ${i + 1}: ${STEPS[i].title}`}
              aria-current={i === step ? 'step' : undefined}
            />
          ))}
        </div>
        <div className="sw-actions">
          <button disabled={step === 0} onClick={() => setStep((x) => x - 1)}>
            ← Back
          </button>
          <span className="spacer" />
          <span className="muted tut-count">
            {step + 1} / {STEPS.length}
          </span>
          <span className="spacer" />
          {!last && (
            <button className="primary tut-next" onClick={() => setStep((x) => x + 1)}>
              Next →
            </button>
          )}
          {last && (
            <button className="primary tut-next" onClick={onClose}>
              ⚓ Set sail
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
