import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('page script trust boundary', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

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
})
