import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuxiliaryStoreRecovery } from './AuxiliaryStoreRecovery'

describe('AuxiliaryStoreRecovery', () => {
  it('offers export, retry or migration, and an explicit reset for quarantined data', () => {
    const html = renderToStaticMarkup(
      <AuxiliaryStoreRecovery
        label="Border research"
        filename="research-recovery.json"
        recovery={{
          code: 'incompatible',
          message: 'A newer schema was found.',
          raw: '{"version":99}',
          backupKey: 'allflame-border-roll-research-recovery-test',
        }}
        onRetry={() => undefined}
        onReset={() => undefined}
      />,
    )

    expect(html).toContain('Border research needs recovery')
    expect(html).toContain('Normal writes to this store are paused')
    expect(html).toContain('Export original JSON')
    expect(html).toContain('Retry / migrate')
    expect(html).toContain('Reset this store…')
  })
})
