import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BORDER_INTAKE_ENDPOINT_ENV,
  borderIntakeContentSecurityPolicy,
  resolveBorderIntakeDeployment,
} from './border-intake-deployment.ts'

const endpoint = 'https://intake.example/api/border-rolls'

test('canonical main deployment injects the endpoint and only its CSP origin', () => {
  const deployment = resolveBorderIntakeDeployment({
    GITHUB_REPOSITORY: 'Alkwer/one-more-map.github.io',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'push',
    [BORDER_INTAKE_ENDPOINT_ENV]: endpoint,
  })

  assert.deepEqual(deployment, {
    endpoint,
    connectOrigin: 'https://intake.example',
    configured: true,
    target: 'canonical',
  })
  const policy = borderIntakeContentSecurityPolicy(deployment)
  assert.match(policy, /connect-src 'self' https:\/\/intake\.example(?:;|$)/)
  assert.doesNotMatch(policy, /api\/border-rolls/)
})

test('local builds default to an unconfigured endpoint and self-only CSP', () => {
  const deployment = resolveBorderIntakeDeployment({})

  assert.deepEqual(deployment, {
    endpoint: '',
    connectOrigin: null,
    configured: false,
    target: 'unconfigured',
  })
  assert.match(borderIntakeContentSecurityPolicy(deployment), /connect-src 'self'(?:;|$)/)
})

test('unrelated fork builds ignore even a copied canonical endpoint setting', () => {
  const deployment = resolveBorderIntakeDeployment({
    GITHUB_REPOSITORY: 'someone-else/one-more-map.github.io',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'push',
    [BORDER_INTAKE_ENDPOINT_ENV]: endpoint,
  })

  assert.equal(deployment.configured, false)
  assert.equal(deployment.endpoint, '')
  assert.doesNotMatch(borderIntakeContentSecurityPolicy(deployment), /intake\.example/)
})

test('canonical pull-request builds remain unconfigured because they are not deployed', () => {
  const deployment = resolveBorderIntakeDeployment({
    GITHUB_REPOSITORY: 'Alkwer/one-more-map.github.io',
    GITHUB_REF: 'refs/pull/348/merge',
    GITHUB_EVENT_NAME: 'pull_request',
    [BORDER_INTAKE_ENDPOINT_ENV]: endpoint,
  })

  assert.equal(deployment.configured, false)
})

test('configured builds reject unsafe endpoint forms', () => {
  const environment = {
    GITHUB_REPOSITORY: 'Alkwer/one-more-map.github.io',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
  }

  assert.throws(
    () =>
      resolveBorderIntakeDeployment({
        ...environment,
        [BORDER_INTAKE_ENDPOINT_ENV]: 'http://intake.example/api?token=visible',
      }),
    /absolute HTTPS URL without credentials, query, or fragment/,
  )
})
