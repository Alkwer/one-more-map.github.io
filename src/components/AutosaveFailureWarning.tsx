import { t, ui } from '../i18n/locale'
import { serializeState, type AppState, type LocalSaveResult } from '../logic/storage'

interface Props {
  failure: Extract<LocalSaveResult, { ok: false }>
  state: AppState
  onRetry: () => void
  onDismiss: () => void
}

function exportRecoveryState(state: AppState) {
  const blob = new Blob([serializeState(state, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'voyage-solver-unsaved-recovery.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AutosaveFailureWarning({ failure, state, onRetry, onDismiss }: Props) {
  return (
    <section className="share-banner error" role="alert" aria-live="assertive">
      <div className="share-banner-copy">
        <strong>{t('Autosave failed — current changes are not durable')}</strong>
        <span>
          {ui(failure.message)}
          {t(' Keep this tab open, retry the save, or export a recovery copy before reloading.')}
        </span>
      </div>
      <div className="share-banner-actions">
        <button onClick={onRetry}>{t('Retry save')}</button>
        <button onClick={() => exportRecoveryState(state)}>{t('Export recovery JSON')}</button>
        <button
          onClick={onDismiss}
          title={t('The warning will return if the next change cannot save')}
        >
          {t('Dismiss until next change')}
        </button>
      </div>
    </section>
  )
}
