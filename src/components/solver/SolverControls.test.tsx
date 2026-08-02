import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { strategyById } from '../../data/strategies'
import { defaultState } from '../../logic/storage'
import { SolverControls } from './SolverControls'

const reservationInput = (html: string, id: string) =>
  html.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))?.[0]

describe('solver strategy protections', () => {
  const strategy = strategyById.get('alc-and-go')!

  const renderControls = (strategyId: string | null) =>
    renderToStaticMarkup(
      <SolverControls
        state={defaultState()}
        activeStrategy={strategyId ? strategyById.get(strategyId)! : null}
        onPatch={() => undefined}
      />,
    )

  it('shows each keeper category enabled by default for a low-investment strategy', () => {
    const html = renderToStaticMarkup(
      <SolverControls state={defaultState()} activeStrategy={strategy} onPatch={() => undefined} />,
    )

    expect(html).toContain('Protect charts for other strategies')
    expect(reservationInput(html, 'divine')).toContain('checked=""')
    expect(reservationInput(html, 'meatfish')).toContain('checked=""')
    expect(reservationInput(html, 'ethereal')).toContain('checked=""')
  })

  it('renders a disabled protection as unchecked', () => {
    const state = defaultState()
    state.strategyReservations.meatfish = false
    const html = renderToStaticMarkup(
      <SolverControls state={state} activeStrategy={strategy} onPatch={() => undefined} />,
    )

    expect(reservationInput(html, 'divine')).toContain('checked=""')
    expect(reservationInput(html, 'meatfish')).not.toContain('checked=""')
  })

  it('shows every strategy protection in manual mode', () => {
    const html = renderControls(null)

    expect(html).toContain('Protect charts for other strategies')
    expect(reservationInput(html, 'divine')).toContain('checked=""')
    expect(reservationInput(html, 'meatfish')).toContain('checked=""')
    expect(reservationInput(html, 'ethereal')).toContain('checked=""')
  })

  it('shows the Divine protection for non-Divine strategies without reservation groups', () => {
    const html = renderControls('milky-meatfish')

    expect(reservationInput(html, 'divine')).toContain('checked=""')
  })

  it('hides fallback protections for Divine strategies', () => {
    const html = renderControls('divine-border-rares')

    expect(html).not.toContain('Protect charts for other strategies')
  })
})
