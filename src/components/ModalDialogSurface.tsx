import type { PropsWithChildren } from 'react'
import { useModalDialog } from './ModalDialog'

interface ModalDialogProps {
  labelledBy: string
  onClose: () => void
  className: string
}

export function ModalDialog({
  labelledBy,
  onClose,
  className,
  children,
}: PropsWithChildren<ModalDialogProps>) {
  const { dialogProps } = useModalDialog({ labelledBy, onClose })
  return (
    <div className="onboard-backdrop" data-modal-root onClick={onClose}>
      <div {...dialogProps} className={className} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
