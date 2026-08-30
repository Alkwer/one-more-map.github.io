import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { resolveBuildIdentity } from '../scripts/build-identity'
import { buildDescription, feedbackUrl } from '../src/buildInfo'
import { BuildFooter } from '../src/components/app/BuildFooter'

const commit = '0123456789abcdef0123456789abcdef01234567'
const builtAt = '2026-08-31T10:15:00.000Z'
const build = resolveBuildIdentity({ GITHUB_SHA: commit }, new Date(builtAt))

describe('deployed build identity', () => {
  it('uses the full CI revision and one UTC timestamp, with an explicit local fallback', () => {
    expect(build).toEqual({ commit, shortCommit: '0123456', builtAt })
    expect(resolveBuildIdentity({}, new Date(builtAt))).toEqual({
      commit: 'local',
      shortCommit: 'local',
      builtAt,
    })
    expect(() => resolveBuildIdentity({ GITHUB_SHA: 'not-a-revision' })).toThrow('GITHUB_SHA')
  })

  it('links the displayed short revision to its exact commit and exposes the timestamp', () => {
    const html = renderToStaticMarkup(<BuildFooter build={build} />)
    expect(html).toContain(`/commit/${commit}`)
    expect(html).toContain('0123456</a>')
    expect(html).toContain(`<time dateTime="${builtAt}">${builtAt}</time>`)
    const local = renderToStaticMarkup(<BuildFooter build={resolveBuildIdentity({})} />)
    expect(local).toContain('local (development)')
    expect(local).not.toContain('/commit/local')
  })

  it('prefills the structured bug report with the same full build identity', () => {
    const url = new URL(feedbackUrl(build))
    expect(url.origin + url.pathname).toBe(
      'https://github.com/Alkwer/one-more-map.github.io/issues/new',
    )
    expect(url.searchParams.get('template')).toBe('bug_report.yml')
    expect(url.searchParams.get('build')).toBe(buildDescription(build))
    expect(url.searchParams.get('build')).toBe(`${commit} (built ${builtAt})`)
  })
})
