import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultState } from '../logic/storage'
import { SavedStateRecovery } from './SavedStateRecovery'

describe('SavedStateRecovery', () => {
  it('offers export, retry, migration, and explicit reset without dismissing recovery', () => {
    const html = renderToStaticMarkup(
      <SavedStateRecovery
        recovery={{
          status: 'recovery',
          raw: '{"v":2}',
          backupKey: 'allflame-voyage-solver-recovery-test',
          code: 'migration',
          message: 'state version 2 requires migration',
          warnings: ['migration required'],
          proposedState: defaultState(),
        }}
        onRetry={() => {}}
        onMigrate={() => {}}
        onReset={() => {}}
      />,
    )

    expect(html).toContain('Normal autosave is paused')
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-dialog-initial-focus="true"')
    expect(html).toContain('Export original JSON')
    expect(html).toContain('Retry decode')
    expect(html).toContain('Migrate recovered state')
    expect(html).toContain('Reset saved state…')
    expect(html).not.toContain('>Close<')
  })
})
