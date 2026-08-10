import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const focusableElements = (dialog: HTMLElement): HTMLElement[] =>
  Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    const style = window.getComputedStyle(element)
    return (
      !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      element.getClientRects().length > 0
    )
  })

interface UseModalDialogOptions {
  labelledBy: string
  onClose: () => void
  initialFocusRef?: RefObject<HTMLElement>
  closeOnEscape?: boolean
  role?: 'dialog' | 'alertdialog'
}

export function useModalDialog({
  labelledBy,
  onClose,
  initialFocusRef,
  closeOnEscape = true,
  role = 'dialog',
}: UseModalDialogOptions) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreTargetRef = useRef<HTMLElement | null | undefined>(undefined)
  const restoreFrameRef = useRef<number>()

  useLayoutEffect(() => {
    if (restoreTargetRef.current === undefined) {
      const active = document.activeElement
      restoreTargetRef.current =
        active instanceof HTMLElement && active !== document.body ? active : null
    }
    if (restoreFrameRef.current !== undefined) {
      window.cancelAnimationFrame(restoreFrameRef.current)
    }
    const dialog = dialogRef.current
    if (!dialog) return

    const modalRoot = dialog.closest<HTMLElement>('[data-modal-root]')
    const app = dialog.closest<HTMLElement>('.app')
    const inertStates: Array<[HTMLElement, boolean]> = []

    if (modalRoot && app) {
      for (const child of Array.from(app.children)) {
        if (!(child instanceof HTMLElement) || child === modalRoot) continue
        inertStates.push([child, child.inert])
        child.inert = true
      }
    }

    const initialFocus =
      initialFocusRef?.current ??
      dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]') ??
      focusableElements(dialog)[0] ??
      dialog
    initialFocus.focus()

    return () => {
      for (const [element, wasInert] of inertStates) element.inert = wasInert

      const capturedTarget = restoreTargetRef.current
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        const fallback = document.querySelector<HTMLElement>(
          '[data-dialog-fallback-focus], header button, main button, main a[href]',
        )
        const target = capturedTarget?.isConnected ? capturedTarget : fallback
        target?.focus()
      })
    }
  }, [initialFocusRef])

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (closeOnEscape) onClose()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = focusableElements(dialog)
    if (focusable.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement)
    if (activeIndex === -1) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    } else if (event.shiftKey && activeIndex === 0) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
      event.preventDefault()
      first.focus()
    }
  }

  return {
    dialogProps: {
      ref: dialogRef,
      role,
      'aria-modal': true as const,
      'aria-labelledby': labelledBy,
      tabIndex: -1,
      onKeyDown: onDialogKeyDown,
    },
  }
}
