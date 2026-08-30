import { FEEDBACK_URL } from '../../buildInfo'
import { setLocale, t, ui, type Locale } from '../../i18n/locale'
import { useLocale } from '../../i18n/useLocale'
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
  const locale = useLocale()
  return (
    <header>
      <h1>
        {t('Allflame ')}
        <span className="accent">{t('Voyage Solver')}</span>
      </h1>
      <button className="tutorial-btn" data-dialog-fallback-focus onClick={props.onOpenTutorial}>
        {t('🧭 TUTORIAL · how to use this')}
      </button>
      <div className="header-right">
        <label className="language-picker">
          <span className="sr-only">{t('Language')}</span>
          <select
            aria-label={t('Language')}
            title={t('Interface language (untranslated text uses English)')}
            value={locale}
            onChange={(event) => void setLocale(event.target.value as Locale)}
          >
            <option value="en" lang="en">
              English
            </option>
            <option value="ko" lang="ko">
              한국어
            </option>
          </select>
        </label>
        <span className="tag">{t('PoE 3.29: Curse of the Allflame')}</span>
        <button
          aria-label={t('Open how it works guide')}
          title={t('How it works')}
          onClick={props.onOpenOnboarding}
        >
          ?
        </button>
        <button
          aria-label={props.updatesUnseen ? t('Updates — new updates') : t('Updates')}
          className={props.updatesUnseen ? 'updates-btn unseen' : 'updates-btn'}
          title={t("What's new on the site")}
          onClick={props.onOpenUpdates}
        >
          {t('Updates')}
        </button>
        <a
          className="feedback-link"
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t('Bug reports and feature requests on GitHub')}
        >
          {t('🐛 Feedback')}
        </a>
        <button
          title={t("Browse all modifiers and switch off ones you don't want")}
          onClick={props.onOpenMods}
        >
          {t('Mods')}
          {props.disabledModCount > 0 ? t(' ({count} off)', { count: props.disabledModCount }) : ''}
        </button>
        <button
          className="theme-link"
          aria-label={props.harvestTheme ? t('Use the Allflame theme') : t('Use the Harvest theme')}
          title={
            props.harvestTheme
              ? t('Back to the Allflame theme')
              : t('Harvest Edition, like the old garden planner sheets')
          }
          onClick={props.onToggleTheme}
        >
          {props.harvestTheme ? '🔥' : '🌱'}
        </button>
        <button aria-label={t('Share layout')} onClick={props.onShare}>
          {ui(props.shareMessage) || t('Share layout')}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {ui(props.shareMessage)}
        </span>
      </div>
    </header>
  )
}
