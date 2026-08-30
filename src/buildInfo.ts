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

export function feedbackUrl(build: BuildInfo): string {
  const url = new URL(`${REPOSITORY_URL}/issues/new`)
  url.searchParams.set('template', 'bug_report.yml')
  url.searchParams.set('build', buildDescription(build))
  return url.href
}

export const FEEDBACK_URL = feedbackUrl(BUILD_INFO)
