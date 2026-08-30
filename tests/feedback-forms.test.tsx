import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { feedbackUrl, type BuildInfo } from '../src/buildInfo'
import { BuildFooter } from '../src/components/app/BuildFooter'

const build: BuildInfo = {
  commit: '0123456789abcdef0123456789abcdef01234567',
  shortCommit: '0123456',
  builtAt: '2026-08-31T10:15:00.000Z',
}
const privateReporting = 'https://github.com/Alkwer/one-more-map.github.io/security/advisories/new'

describe('structured feedback', () => {
  it.each(['bug_report.yml', 'feature_request.yml'] as const)(
    'prefills an existing %s form that captures reproducible context and routes security privately',
    (template) => {
      const url = new URL(feedbackUrl(build, template))
      const form = readFileSync(
        new URL(`../.github/ISSUE_TEMPLATE/${template}`, import.meta.url),
        'utf8',
      )
      expect(url.searchParams.get('template')).toBe(template)
      expect(url.searchParams.get('build')).toContain(build.commit)
      expect(url.searchParams.get('build')).toContain(build.builtAt)
      for (const id of ['reproduction', 'browser-os', 'game-patch', 'build']) {
        expect(form).toContain(`    id: ${id}\n`)
      }
      expect(form).toContain(privateReporting)
      expect(form).toContain('Do not report it here')
    },
  )

  it('offers a feature link carrying the displayed build and keeps the security channel in the chooser', () => {
    const html = renderToStaticMarkup(<BuildFooter build={build} />)
    expect(html).toContain('template=feature_request.yml')
    expect(html).toContain(`build=${build.commit}`)
    expect(html).toContain('Request a feature</a>')
    const config = readFileSync(
      new URL('../.github/ISSUE_TEMPLATE/config.yml', import.meta.url),
      'utf8',
    )
    expect(config).toContain('blank_issues_enabled: false')
    expect(config).toContain(privateReporting)
  })
})
