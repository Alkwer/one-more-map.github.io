interface Props {
  disabledModCount: number
  harvestTheme: boolean
  shareMessage: string
  updatesUnseen: boolean
  onOpenOnboarding: () => void
  onOpenMods: () => void
  onOpenTutorial: () => void
  onOpenUpdates: () => void
  onToggleTheme: () => void
  onShare: () => void
}

export function AppHeader(props: Props) {
  return (
    <header>
      <h1>
        Allflame <span className="accent">Voyage Solver</span>
      </h1>
      <button className="tutorial-btn" data-dialog-fallback-focus onClick={props.onOpenTutorial}>
        🧭 TUTORIAL · how to use this
      </button>
      <div className="header-right">
        <span className="tag">PoE 3.29: Curse of the Allflame</span>
        <button
          aria-label="Open how it works guide"
          title="How it works"
          onClick={props.onOpenOnboarding}
        >
          ?
        </button>
        <button
          aria-label={props.updatesUnseen ? 'Updates — new updates' : 'Updates'}
          className={props.updatesUnseen ? 'updates-btn unseen' : 'updates-btn'}
          title="What's new on the site"
          onClick={props.onOpenUpdates}
        >
          Updates
        </button>
        <button
          title="Browse all modifiers and switch off ones you don't want"
          onClick={props.onOpenMods}
        >
          Mods{props.disabledModCount > 0 ? ` (${props.disabledModCount} off)` : ''}
        </button>
        <button
          className="theme-link"
          aria-label={props.harvestTheme ? 'Use the Allflame theme' : 'Use the Harvest theme'}
          title={
            props.harvestTheme
              ? 'Back to the Allflame theme'
              : 'Harvest Edition, like the old garden planner sheets'
          }
          onClick={props.onToggleTheme}
        >
          {props.harvestTheme ? '🔥' : '🌱'}
        </button>
        <button aria-label="Share layout" onClick={props.onShare}>
          {props.shareMessage || 'Share layout'}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {props.shareMessage}
        </span>
      </div>
    </header>
  )
}
