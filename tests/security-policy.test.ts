import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('page script trust boundary', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const entrypoint = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')

  it('loads no third-party page scripts', () => {
    const scriptSources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(
      (match) => match[1],
    )

    expect(scriptSources).toEqual(['/src/main.tsx'])
    expect(html).not.toContain('goatcounter')
    expect(html).not.toContain('gc.zgo.at')
  })

  it('restricts scripts to the application origin', () => {
    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain("script-src 'self'")
    expect(html).toContain("object-src 'none'")
    expect(html).toContain("base-uri 'self'")
  })

  it('checks the top-level browsing context before loading stateful application modules', () => {
    const frameCheck = entrypoint.indexOf('window.top !== window.self')
    const appImport = entrypoint.indexOf("import('./App')")
    const storageAccess = entrypoint.indexOf("localStorage.getItem('theme')")

    expect(frameCheck).toBeGreaterThan(-1)
    expect(appImport).toBeGreaterThan(frameCheck)
    expect(storageAccess).toBeGreaterThan(frameCheck)
    expect(entrypoint).not.toMatch(/^import App/m)
    expect(entrypoint).toContain('blockFramedApplication()')
  })
})

describe('workflow dependency trust boundary', () => {
  const workflowsDirectory = new URL('../.github/workflows/', import.meta.url)
  const workflowSources = readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => ({
      name,
      source: readFileSync(new URL(name, workflowsDirectory), 'utf8'),
    }))

  it('pins every external action to a full commit SHA and records its release tag', () => {
    const actionReferences = workflowSources.flatMap(({ name, source }) =>
      [...source.matchAll(/^\s*(?:-\s*)?uses:\s+([^\s#]+)(?:\s+#\s*(\S+))?\s*$/gm)].map(
        (match) => ({ name, reference: match[1], release: match[2] }),
      ),
    )

    expect(actionReferences.length).toBeGreaterThan(0)
    for (const { name, reference, release } of actionReferences) {
      if (reference.startsWith('./')) continue

      const separator = reference.lastIndexOf('@')
      expect(separator, `${name}: ${reference}`).toBeGreaterThan(0)
      expect(reference.slice(separator + 1), `${name}: ${reference}`).toMatch(/^[0-9a-f]{40}$/)
      expect(release, `${name}: ${reference}`).toMatch(/^v\d+\.\d+\.\d+$/)
    }
  })

  it('enables controlled Dependabot updates for GitHub Actions', () => {
    const dependabot = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf8')

    expect(dependabot).toContain('package-ecosystem: github-actions')
    expect(dependabot).toContain('interval: weekly')
    expect(dependabot).toContain('open-pull-requests-limit: 5')
  })
})
