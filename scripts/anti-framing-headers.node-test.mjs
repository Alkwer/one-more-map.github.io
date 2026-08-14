import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  borderIntakeContentSecurityPolicy,
  resolveBorderIntakeDeployment,
} from './border-intake-deployment.ts'
import {
  antiFramingContentSecurityPolicy,
  antiFramingHeaderProblems,
  parseStaticHeadersConfig,
  productionSecurityHeaders,
  renderStaticHeadersConfig,
} from '../src/securityHeaders.ts'

const baseContentSecurityPolicy = borderIntakeContentSecurityPolicy(
  resolveBorderIntakeDeployment({}),
)
const contentSecurityPolicy = antiFramingContentSecurityPolicy(baseContentSecurityPolicy)
const productionHeaders = productionSecurityHeaders(baseContentSecurityPolicy)

test('accepts the production anti-framing headers', () => {
  const headers = new Headers(productionHeaders)

  assert.deepEqual(antiFramingHeaderProblems(headers), [])
})

test('rejects missing or weaker anti-framing headers', () => {
  assert.deepEqual(antiFramingHeaderProblems(new Headers()), [
    'X-Frame-Options must be exactly DENY',
    "Content-Security-Policy must contain exactly frame-ancestors 'none'",
  ])

  const weakerHeaders = new Headers({
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'self'",
    'X-Frame-Options': 'SAMEORIGIN',
  })
  assert.deepEqual(antiFramingHeaderProblems(weakerHeaders), [
    'X-Frame-Options must be exactly DENY',
    "Content-Security-Policy must contain exactly frame-ancestors 'none'",
  ])
})

test('rejects an ambiguous duplicate frame-ancestors directive', () => {
  const headers = new Headers({
    'Content-Security-Policy': `${contentSecurityPolicy}; frame-ancestors 'self'`,
    'X-Frame-Options': 'DENY',
  })

  assert.deepEqual(antiFramingHeaderProblems(headers), [
    "Content-Security-Policy must contain exactly frame-ancestors 'none'",
  ])
})

test('renders a deployment-root _headers file with the exact policy', () => {
  const config = renderStaticHeadersConfig(baseContentSecurityPolicy)
  assert.equal(
    config,
    `/*\n  Content-Security-Policy: ${contentSecurityPolicy}\n  X-Frame-Options: DENY\n`,
  )
  assert.deepEqual(parseStaticHeadersConfig(config), productionHeaders)
})

test('fails closed instead of emitting duplicate frame-ancestors directives', () => {
  assert.throws(
    () => antiFramingContentSecurityPolicy(contentSecurityPolicy),
    /must not define frame-ancestors/,
  )
})

test('refuses to preview a malformed or weaker static header artifact', () => {
  assert.throws(
    () => parseStaticHeadersConfig('/*\n  X-Frame-Options: SAMEORIGIN\n'),
    /must define only CSP and X-Frame-Options/,
  )
  assert.throws(
    () =>
      parseStaticHeadersConfig(
        "/*\n  Content-Security-Policy: default-src 'self'; frame-ancestors 'self'\n  X-Frame-Options: DENY\n",
      ),
    /frame-ancestors 'none'/,
  )
})
