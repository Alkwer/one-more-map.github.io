import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canonicalAppUrl,
  DEFAULT_CANONICAL_ORIGIN,
  DEFAULT_PRODUCTION_SITE_PREFIX,
  setCanonicalLink,
  sitePrefixSegments,
} from './deployment-metadata.mjs'

test('canonical deployment stays on the maintained Alkwer project site', () => {
  assert.equal(DEFAULT_CANONICAL_ORIGIN, 'https://alkwer.github.io')
  assert.equal(DEFAULT_PRODUCTION_SITE_PREFIX, '/one-more-map.github.io/')
  assert.equal(
    canonicalAppUrl(DEFAULT_PRODUCTION_SITE_PREFIX),
    'https://alkwer.github.io/one-more-map.github.io/allflame-voyage-solver/',
  )
})

test('canonical URL follows root-site and project-site deployment prefixes', () => {
  assert.equal(canonicalAppUrl('/'), 'https://alkwer.github.io/allflame-voyage-solver/')
  assert.equal(
    canonicalAppUrl('/preview/project/'),
    'https://alkwer.github.io/preview/project/allflame-voyage-solver/',
  )
  assert.deepEqual(sitePrefixSegments('/preview/project/'), ['preview', 'project'])
  assert.throws(() => canonicalAppUrl('/../upstream/'), /Invalid site prefix/)
  assert.throws(() => canonicalAppUrl('/', 'http://alkwer.github.io'), /Invalid canonical origin/)
})

test('canonical metadata rewriting fails closed', () => {
  const html = '<head><link rel="canonical" href="https://example.test/old/" /></head>'
  const canonical = 'https://alkwer.github.io/allflame-voyage-solver/'
  assert.equal(
    setCanonicalLink(html, canonical, 'fixture.html'),
    `<head><link rel="canonical" href="${canonical}" /></head>`,
  )
  assert.throws(() => setCanonicalLink('<head></head>', canonical, 'missing.html'), /found 0/)
  assert.throws(() => setCanonicalLink(`${html}${html}`, canonical, 'duplicate.html'), /found 2/)
})

// These assertions also run against every built Pages artifact during staging.
test('production metadata supports root and nested deployments without stale social links', async () => {
  const { readFile } = await import('node:fs/promises')
  const { assertAppMetadata, setAppSocialUrls } = await import('./app-metadata.mjs')
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  for (const prefix of ['/', '/one-more-map.github.io/', '/preview/nested/']) {
    const canonical = canonicalAppUrl(prefix)
    const html = setAppSocialUrls(setCanonicalLink(template, canonical, 'index.html'), canonical)
    assert.doesNotThrow(() => assertAppMetadata(html, canonical))
    assert.match(html, new RegExp(`${canonical}social-preview.png`.replaceAll('.', '\\.')))
    assert.throws(
      () => assertAppMetadata(html.replace('name="description"', 'name="removed"'), canonical),
      /description/,
    )
    assert.throws(
      () => assertAppMetadata(html.replace('property="og:url"', 'property="removed"'), canonical),
      /og:url/,
    )
    assert.throws(
      () => assertAppMetadata(html.replace('rel="icon"', 'rel="removed"'), canonical),
      /icon/,
    )
    assert.throws(
      () =>
        assertAppMetadata(
          html.replaceAll(`${canonical}social-preview.png`, 'https://example.test/old.png'),
          canonical,
        ),
      /canonical app URL/,
    )
  }
})
