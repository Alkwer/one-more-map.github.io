import { t } from '../i18n/locale'

export function ImporterUpdateNoticeBody({
  onDismiss,
  feedbackUrl,
}: {
  onDismiss: () => void
  feedbackUrl: string
}) {
  return (
    <>
      <p className="tut-body">
        {t('The game now reveals every border tooltip while ')}
        <strong>{t('Alt')}</strong>
        {t(' is held, so the importer reads all 12 borders from a ')}
        <strong>{t('single screenshot')}</strong>
        {t(' — a couple of seconds instead of 15–30. No new calibration is needed.')}
      </p>
      <p className="tut-body">
        {t('Also new: the blank-row skip is configurable (wizard → ')}
        <em>{t('Sweep speed')}</em>
        {t(
          '; set 0 if you park charts at the bottom of a page), and the sweep covers both chart pages once the wizard knows your page tabs.',
        )}
      </p>
      <ol className="ahk-notice-steps">
        <li>{t('Download the script again and replace your old copy.')}</li>
        <li>
          <strong>{t('Exit the running script')}</strong>
          {t(' (tray icon → Exit) and start the new one — it does not reload itself.')}
        </li>
        <li>
          {t("Haven't set the page tabs yet? Rerun the wizard once (tray →")}{' '}
          <em>{t('Setup wizard…')}</em>
          {t('). Existing calibration is kept.')}
        </li>
      </ol>
      <div className="sw-actions">
        <a
          className="ahk-notice-dl"
          href={`${import.meta.env.BASE_URL}voyage-import.ahk`}
          download
          onClick={onDismiss}
        >
          {t('⬇ Download the updated script')}
        </a>
        <span className="spacer" />
        <button onClick={onDismiss}>{t('Got it')}</button>
      </div>
      <div className="muted small-note">
        {t('Something misbehaving?')}{' '}
        <a href={feedbackUrl} target="_blank" rel="noopener noreferrer">
          {t('Report it on GitHub')}
        </a>{' '}
        {t('— actively monitored.')}
      </div>
    </>
  )
}
