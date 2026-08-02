import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { strategyById } from '../data/strategies'
import { defaultState } from '../logic/storage'
import { SolverPanel } from './SolverPanel'

const reservationInput = (html: string, id: string) =>
  html.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))?.[0]

function renderReservations(meatfish = true): string {
  const state = defaultState()
  state.strategyReservations.meatfish = meatfish
  return renderToStaticMarkup(
    <SolverPanel
      state={state}
      activeStrategy={strategyById.get('alc-and-go')!}
      onPatch={() => undefined}
      onResults={() => undefined}
    />,
  )
}

describe('solver strategy protections', () => {
  it('shows all three keeper categories enabled by default', () => {
    const html = renderReservations()

    expect(html).toContain('Protect charts for other strategies')
    expect(reservationInput(html, 'divine')).toContain('checked=""')
    expect(reservationInput(html, 'meatfish')).toContain('checked=""')
    expect(reservationInput(html, 'ethereal')).toContain('checked=""')
  })

  it('renders a disabled category as unchecked', () => {
    const html = renderReservations(false)

    expect(reservationInput(html, 'divine')).toContain('checked=""')
    expect(reservationInput(html, 'meatfish')).not.toContain('checked=""')
  })
})
