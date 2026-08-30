import { t } from '../i18n/locale'

export function WindowsImportHelp({ feedbackUrl }: { feedbackUrl: string }) {
  return (
    <>
      <p className="muted">
        {t(
          'A self-contained AutoHotkey script copies up to 120 charts from both chart-stash tabs, reads all 12 board-border tooltips with Windows OCR, opens this trusted solver page, and pastes one combined payload automatically. If the browser cannot be opened and focused, the payload stays on your clipboard for a manual Ctrl+V. OCR stays on your PC and no screenshots are uploaded.',
        )}
      </p>
      <a className="ahk-dl" href={`${import.meta.env.BASE_URL}voyage-import.ahk`} download>
        {t('⬇ Download voyage-import.ahk')}
      </a>
      <details className="ahk-faq">
        <summary>{t("Is this allowed under GGG's third-party policy?")}</summary>
        <p className="muted small">
          {t(
            "Our read: yes. GGG's macro rules govern inputs that affect the game, and the importer's sweep is read-only - mouse hovers and Ctrl+C copies (the same primitive Awakened PoE Trade sends on every price-check), plus holding Alt to reveal tooltips for the screenshot. Nothing is moved, used, created or decided in-game; your character and stash are identical before and after a run. The only real UI interaction is flipping the chart panel's page tab, which the script flips back when done. Invocation is always your own keypress - nothing ever triggers from timers or screen-watching.",
          )}
        </p>
        <p className="muted small">
          {t(
            "That said, this is our interpretation, not a GGG ruling. If GGG ever indicates otherwise, the tool will change immediately. And if you'd rather not use the importer at all, everything works by hand - the solver itself is just a webpage you paste item text into; it never touches the game.",
          )}
        </p>
      </details>
      <ol className="ahk-steps">
        <li>
          {t('Install')}{' '}
          <a href="https://www.autohotkey.com/" target="_blank" rel="noopener noreferrer">
            {t('AutoHotkey v2')}
          </a>{' '}
          {t('(Windows only).')}
        </li>
        <li>
          {t(
            'In PoE (Windowed or Windowed Fullscreen), open the Voyage board so your chart panel is fully visible and not scrolled.',
          )}
        </li>
        <li>
          {t(
            'Double-click the script. There is no browser or game binding: the helper opens this solver URL through your default browser and authenticates the foreground PoE window whenever a calibration or scan hotkey is pressed. No setup shortcut is required.',
          )}
        </li>
        <li>
          {t(
            'Keep the real Path of Exile window focused while calibrating. Positions are saved relative to its client area, so moving the game between monitors no longer moves clicks back to the old screen. Existing screen-based calibration is cleared once; recalibrate the points below after updating the script.',
          )}
        </li>
        <li>
          {t('For quick board calibration, point at the')}{' '}
          <strong>{t('top-left corner of the border-modifier square')}</strong>
          {t(' and press ')}
          <kbd>{t('F5')}</kbd>
          {t('; then point at its ')}
          <strong>{t('bottom-right corner')}</strong>
          {t(' and press ')}
          <kbd>{t('F6')}</kbd>.
        </li>
        <li>
          {t('If any border is missed, press ')}
          <kbd>{t('Ctrl+F5')}</kbd>
          {t(' to start exact calibration. Hover the modifier named by the script and press ')}
          <kbd>{t('Ctrl+F6')}</kbd>
          {t(' to save it; repeat for all 12. Press ')}
          <kbd>{t('Ctrl+F4')}</kbd>
          {t(' to preview the saved positions without running OCR.')}
        </li>
        <li>
          {t('Hover the ')}
          <strong>{t('compass-shaped border reroll button')}</strong>
          {t(' so its cost tooltip is visible, then press ')}
          <kbd>{t('Ctrl+F7')}</kbd>
          {t(
            ". This lets each scan read the next reroll cost and synchronize the solver's reroll counter automatically.",
          )}
        </li>
        <li>
          {t('For chart import, calibrate the shared grid: hover the ')}
          <strong>{t('top-left')}</strong>
          {t(' chart slot and press ')}
          <kbd>{t('F7')}</kbd>
          {t(', then hover the ')}
          <strong>{t('bottom-right')}</strong>
          {t(' slot and press ')}
          <kbd>{t('F8')}</kbd>
          {t('. Next, hover chart-stash tab ')}
          <strong>1</strong>
          {t(' and press')} <kbd>{t('Shift+F7')}</kbd>
          {t(', then hover tab ')}
          <strong>2</strong>
          {t(' and press ')}
          <kbd>{t('Shift+F8')}</kbd>
          {t(". (Edit GridCols/GridRows if your panel isn't 6×10.)")}
        </li>
        <li>
          <kbd>{t('F9')}</kbd>
          {t(
            ' switches through both chart-stash tabs, copies their charts, and scans the 12 borders · ',
          )}
          <kbd>{t('Ctrl+F9')}</kbd>
          {t(
            ' refreshes only the 12 borders after a reroll, without rescanning charts, and also reads the calibrated reroll-cost tooltip. Both commands open the solver in the default browser, activate its window without a saved mouse click, and paste automatically. If opening or activation fails, the payload stays on the clipboard for a manual ',
          )}
          <kbd>{t('Ctrl+V')}</kbd>. <kbd>{t('F10')}</kbd>
          {t(
            " aborts. Border OCR can take around 15–30 seconds on a 4K screen. The script's tray menu lets you configure how many fully empty chart rows end a tab sweep; use 0 if you keep Charts below large gaps.",
          )}
        </li>
      </ol>
      <p className="muted small">
        {t(
          "If PoE runs as administrator, run the script as administrator too, or its keypresses won't reach the game. Don't touch the mouse or keyboard while it's running.",
        )}
      </p>
      <p className="muted small">
        {t('Problems or ideas?')}{' '}
        <a href={feedbackUrl} target="_blank" rel="noopener noreferrer">
          {t('Open a GitHub issue')}
        </a>{' '}
        {t('— actively monitored, and pull requests are welcome.')}
      </p>
    </>
  )
}
