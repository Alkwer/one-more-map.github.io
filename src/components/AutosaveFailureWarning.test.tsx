import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultState } from '../logic/storage'
import { AutosaveFailureWarning } from './AutosaveFailureWarning'

describe('AutosaveFailureWarning', () => {
  it('explains durability risk and exposes retry, recovery export, and scoped dismissal', () => {
    const html = renderToStaticMarkup(
      <AutosaveFailureWarning
        failure={{ ok: false, code: 'quota', message: 'Browser storage is full.' }}
        state={defaultState()}
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('current changes are not durable')
    expect(html).toContain('Browser storage is full.')
    expect(html).toContain('Retry save')
    expect(html).toContain('Export recovery JSON')
    expect(html).toContain('Dismiss until next change')
  })
})
