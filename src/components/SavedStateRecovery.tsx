import { t, ui } from '../i18n/locale'
import { useId } from 'react'
import type { LocalStateRecovery } from '../logic/storage'
import { useModalDialog } from './ModalDialog'

interface Props {
  recovery: LocalStateRecovery
  actionError?: string
  onRetry: () => void
  onMigrate: () => void
  onReset: () => void
}

function exportRawState(raw: string) {
  const blob = new Blob([raw], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'allflame-voyage-solver-recovery.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function SavedStateRecovery({ recovery, actionError, onRetry, onMigrate, onReset }: Props) {
  const titleId = useId()
  const hasBackup = recovery.backupKey !== null
  const { dialogProps } = useModalDialog({
    labelledBy: titleId,
    onClose: () => undefined,
    closeOnEscape: false,
    role: 'alertdialog',
  })

  return (
    <div className="onboard-backdrop saved-state-recovery-backdrop" data-modal-root>
      <div {...dialogProps} className="onboard saved-state-recovery">
        <h2 id={titleId} data-dialog-initial-focus tabIndex={-1}>
          {t('Saved state needs recovery')}
        </h2>
        <p>
          {t('The app did not overwrite your saved data. ')}
          {ui(recovery.message)}
          {t('. Normal autosave is paused until you choose how to continue.')}
        </p>
        {recovery.warnings.length > 1 && (
          <ul className="saved-state-recovery-warnings">
            {recovery.warnings.slice(1, 6).map((warning) => (
              <li key={warning}>{ui(warning)}</li>
            ))}
          </ul>
        )}
        <p className={hasBackup ? 'recovery-backup-ok' : 'recovery-backup-error'} role="status">
          {hasBackup
            ? t('Exact raw backup created as localStorage entry “{v0}”.', {
                v0: recovery.backupKey,
              })
            : t(
                'A browser backup could not be created. Export remains available; migration and reset stay disabled.',
              )}
        </p>
        {actionError && (
          <p className="recovery-backup-error" role="alert">
            {ui(actionError)}
          </p>
        )}
        <div className="saved-state-recovery-actions">
          <button onClick={() => exportRawState(recovery.raw)}>{t('Export original JSON')}</button>
          <button onClick={onRetry}>{t('Retry decode')}</button>
          {recovery.proposedState && (
            <button disabled={!hasBackup} onClick={onMigrate}>
              {t('Migrate recovered state')}
            </button>
          )}
          <button className="danger" disabled={!hasBackup} onClick={onReset}>
            {t('Reset saved state…')}
          </button>
        </div>
      </div>
    </div>
  )
}
