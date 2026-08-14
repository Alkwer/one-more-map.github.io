import type { PropsWithChildren } from 'react'
import { useModalDialog } from './ModalDialog'

interface ModalDialogProps {
  labelledBy: string
  onClose: () => void
  className: string
  restoreFocus?: 'deferred' | 'immediate' | 'none'
}

export function ModalDialog({
  labelledBy,
  onClose,
  className,
  restoreFocus,
  children,
}: PropsWithChildren<ModalDialogProps>) {
  const { dialogProps } = useModalDialog({ labelledBy, onClose, restoreFocus })
  return (
    <div className="onboard-backdrop" data-modal-root onClick={onClose}>
      <div {...dialogProps} className={className} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
