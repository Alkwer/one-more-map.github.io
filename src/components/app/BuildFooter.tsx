import { BUILD_INFO, REPOSITORY_URL, feedbackUrl, type BuildInfo } from '../../buildInfo'
import { t } from '../../i18n/locale'

export function BuildFooter({ build = BUILD_INFO }: { build?: BuildInfo }) {
  return (
    <footer className="build-footer" aria-label={t('Application build')}>
      <span>
        {t('Build')}{' '}
        {build.commit === 'local' ? (
          t('local (development)')
        ) : (
          <a
            href={`${REPOSITORY_URL}/commit/${build.commit}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {build.shortCommit}
          </a>
        )}
      </span>
      <span>
        {t('Built')} <time dateTime={build.builtAt}>{build.builtAt}</time>
      </span>
      <a href={feedbackUrl(build, 'feature_request.yml')} target="_blank" rel="noopener noreferrer">
        {t('Request a feature')}
      </a>
    </footer>
  )
}
