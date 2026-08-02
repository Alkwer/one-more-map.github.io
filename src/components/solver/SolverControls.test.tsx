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

  it('shows each chart-type protection enabled by default for a low-investment strategy', () => {
    const html = renderToStaticMarkup(
      <SolverControls state={defaultState()} activeStrategy={strategy} onPatch={() => undefined} />,
    )

    expect(html).toContain('Protect chart types')
    expect(reservationInput(html, 'genericStrongboxes')).toContain('checked=""')
    expect(reservationInput(html, 'divinerStrongboxes')).toContain('checked=""')
    expect(reservationInput(html, 'arcanistStrongboxes')).toContain('checked=""')
    expect(reservationInput(html, 'operativeStrongboxes')).toContain('checked=""')
    expect(reservationInput(html, 'messages')).toContain('checked=""')
    expect(reservationInput(html, 'starfish')).toContain('checked=""')
    expect(reservationInput(html, 'globalRares')).toContain('checked=""')
    expect(reservationInput(html, 'adjacentRares')).toContain('checked=""')
    expect(reservationInput(html, 'meatfish')).toContain('checked=""')
    expect(reservationInput(html, 'ethereal')).toContain('checked=""')
  })

  it('renders a disabled protection as unchecked', () => {
    const state = defaultState()
    state.strategyReservations.starfish = false
    const html = renderToStaticMarkup(
      <SolverControls state={state} activeStrategy={strategy} onPatch={() => undefined} />,
    )

    expect(reservationInput(html, 'genericStrongboxes')).toContain('checked=""')
    expect(reservationInput(html, 'starfish')).not.toContain('checked=""')
  })

  it('shows every chart-type protection in manual mode', () => {
    const html = renderControls(null)

    expect(html).toContain('Protect chart types')
    expect(reservationInput(html, 'genericStrongboxes')).toContain('checked=""')
    expect(reservationInput(html, 'divinerStrongboxes')).toContain('checked=""')
    expect(reservationInput(html, 'starfish')).toContain('checked=""')
    expect(reservationInput(html, 'globalRares')).toContain('checked=""')
    expect(reservationInput(html, 'adjacentRares')).toContain('checked=""')
    expect(reservationInput(html, 'meatfish')).toContain('checked=""')
    expect(reservationInput(html, 'ethereal')).toContain('checked=""')
  })

  it('shows separate Rare protections for non-Divine strategies without reservation groups', () => {
    const html = renderControls('milky-meatfish')

    expect(reservationInput(html, 'globalRares')).toContain('checked=""')
    expect(reservationInput(html, 'adjacentRares')).toContain('checked=""')
  })

  it('hides fallback protections for Divine strategies', () => {
    const html = renderControls('divine-border-rares')

    expect(html).not.toContain('Protect chart types')
  })

  it('lets Speedrun use typed Strongboxes while independently protecting generic ones', () => {
    const html = renderControls('milky-speedrun')

    expect(reservationInput(html, 'genericStrongboxes')).toContain('checked=""')
    expect(reservationInput(html, 'starfish')).toContain('checked=""')
    expect(reservationInput(html, 'divinerStrongboxes')).toBeUndefined()
    expect(reservationInput(html, 'arcanistStrongboxes')).toBeUndefined()
    expect(reservationInput(html, 'operativeStrongboxes')).toBeUndefined()
  })
})
