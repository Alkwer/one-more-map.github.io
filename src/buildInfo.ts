export interface BuildInfo {
  commit: string
  shortCommit: string
  builtAt: string
}

export const REPOSITORY_URL = 'https://github.com/Alkwer/one-more-map.github.io'
export const BUILD_INFO: BuildInfo = __APP_BUILD_INFO__

export function buildDescription(build: BuildInfo): string {
  return `${build.commit} (built ${build.builtAt})`
}

export function feedbackUrl(
  build: BuildInfo,
  template: 'bug_report.yml' | 'feature_request.yml' = 'bug_report.yml',
): string {
  const url = new URL(`${REPOSITORY_URL}/issues/new`)
  url.searchParams.set('template', template)
  url.searchParams.set('build', buildDescription(build))
  return url.href
}

export const FEEDBACK_URL = feedbackUrl(BUILD_INFO)

export const FEATURE_REQUEST_URL = feedbackUrl(BUILD_INFO, 'feature_request.yml')
