import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { shouldCloseOnboardingAfterDemo } from '../logic/chartCapacity'
import { Onboarding } from './Onboarding'

describe('Onboarding', () => {
  it('disables and explains demo additions when the 250-chart library is full', () => {
    const html = renderToStaticMarkup(
      <Onboarding
        onClose={() => {}}
        onDemo={() => ({ added: 0, skipped: 25 })}
        remainingChartCapacity={0}
      />,
    )

    expect(html).toContain('Try it with 25 demo charts</button>')
    expect(html).toContain('disabled=""')
    expect(html).toContain('The library is full (250-chart limit)')
    expect(html).toContain('role="status"')
  })

  it('keeps the demo action available when one chart slot remains', () => {
    const html = renderToStaticMarkup(
      <Onboarding
        onClose={() => {}}
        onDemo={() => ({ added: 1, skipped: 24 })}
        remainingChartCapacity={1}
      />,
    )

    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('The library is full (250-chart limit)')
  })

  it('qualifies exhaustive and heuristic solver guarantees', () => {
    const html = renderToStaticMarkup(
      <Onboarding
        onClose={() => {}}
        onDemo={() => ({ added: 25, skipped: 0 })}
        remainingChartCapacity={250}
      />,
    )

    expect(html).toContain('exhaustive search proves result #1 optimal')
    expect(html).toContain('best layout found without claiming a global optimum')
    expect(html).not.toContain('highest-value arrangement')
  })

  it('only closes after the whole demo batch was added', () => {
    expect(shouldCloseOnboardingAfterDemo({ added: 25, skipped: 0 })).toBe(true)
    expect(shouldCloseOnboardingAfterDemo({ added: 1, skipped: 24 })).toBe(false)
    expect(shouldCloseOnboardingAfterDemo({ added: 0, skipped: 25 })).toBe(false)
  })
})
