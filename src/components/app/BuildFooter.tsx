import { BUILD_INFO, REPOSITORY_URL, type BuildInfo } from '../../buildInfo'

export function BuildFooter({ build = BUILD_INFO }: { build?: BuildInfo }) {
  return (
    <footer className="build-footer" aria-label="Application build">
      <span>
        Build{' '}
        {build.commit === 'local' ? (
          'local (development)'
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
        Built <time dateTime={build.builtAt}>{build.builtAt}</time>
      </span>
    </footer>
  )
}
