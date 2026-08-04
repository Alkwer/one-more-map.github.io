import { useId } from 'react'
import type { AuxiliaryStorageRecovery } from '../logic/auxiliaryStorageRecovery'

interface Props {
  label: string
  filename: string
  recovery: AuxiliaryStorageRecovery
  onRetry: () => void
  onReset: () => void
}

function exportRawPayload(raw: string, filename: string) {
  const blob = new Blob([raw], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AuxiliaryStoreRecovery({ label, filename, recovery, onRetry, onReset }: Props) {
  const titleId = useId()
  const canReset = recovery.backupKey !== null

  return (
    <section className="auxiliary-store-recovery" role="alert" aria-labelledby={titleId}>
      <h3 id={titleId}>{label} needs recovery</h3>
      <p>
        {recovery.message} The original active value was not overwritten. Normal writes to this
        store are paused until recovery is resolved.
      </p>
      {recovery.raw === null ? (
        <p className="recovery-backup-error" role="status">
          Browser storage is unavailable, so there is no readable payload to export or reset.
        </p>
      ) : (
        <p className={canReset ? 'recovery-backup-ok' : 'recovery-backup-error'} role="status">
          {canReset
            ? `Exact raw backup created as localStorage entry “${recovery.backupKey}”.`
            : 'A browser backup could not be verified. Export the exact raw payload before leaving this page.'}
        </p>
      )}
      <div className="saved-state-recovery-actions">
        <button
          disabled={recovery.raw === null}
          onClick={() => recovery.raw && exportRawPayload(recovery.raw, filename)}
        >
          Export original JSON
        </button>
        <button onClick={onRetry}>Retry / migrate</button>
        <button className="danger" disabled={!canReset} onClick={onReset}>
          Reset this store…
        </button>
      </div>
    </section>
  )
}
