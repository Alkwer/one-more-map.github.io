import { useId } from 'react'
import { ModalDialog } from './ModalDialogSurface'

interface Props {
  title: string
  onClose: () => void
}

export function LazyModalFallback({ title, onClose }: Props) {
  const titleId = useId()

  return (
    <ModalDialog
      labelledBy={titleId}
      onClose={onClose}
      className="onboard lazy-modal-loading"
      restoreFocus="immediate"
    >
      <h2 id={titleId} className="panel-title" data-dialog-initial-focus tabIndex={-1}>
        {title}
      </h2>
      <p role="status" aria-live="polite">
        Loading this screen…
      </p>
      <div className="sw-actions">
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
      </div>
    </ModalDialog>
  )
}
