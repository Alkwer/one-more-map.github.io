import { Component, Suspense, useState, type ReactNode } from 'react'
import { t } from '../i18n/locale'

class HelpErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? (
      <p className="muted" role="alert">
        {t(
          'Help could not be loaded. Importing still works. Reload the page to try the help again.',
        )}
      </p>
    ) : (
      this.props.children
    )
  }
}

/** Keep the native disclosure and its focus/state stable while optional help
 * downloads. Once requested, retain the help subtree across close/reopen. */
export function ImportHelpDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [requested, setRequested] = useState(false)
  return (
    <details
      className="ahk-help"
      onToggle={(event) => {
        if (event.currentTarget.open) setRequested(true)
      }}
    >
      <summary>{title}</summary>
      {requested && <OptionalHelpContent>{children}</OptionalHelpContent>}
    </details>
  )
}

export function OptionalHelpContent({ children }: { children: ReactNode }) {
  return (
    <HelpErrorBoundary>
      <Suspense
        fallback={
          <p className="muted" role="status" aria-live="polite">
            {t('Loading help…')}
          </p>
        }
      >
        {children}
      </Suspense>
    </HelpErrorBoundary>
  )
}
