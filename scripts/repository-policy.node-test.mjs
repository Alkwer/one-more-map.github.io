import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const policy = JSON.parse(await readFile('.github/rulesets/main.json', 'utf8'))

test('main ruleset requires pull requests and every deployment check', () => {
  assert.equal(policy.enforcement, 'active')
  assert.deepEqual(policy.conditions.ref_name.include, ['refs/heads/main'])
  assert.deepEqual(policy.bypass_actors, [])
  const byType = new Map(policy.rules.map((rule) => [rule.type, rule]))
  assert.ok(byType.has('pull_request'))
  assert.ok(byType.has('deletion'))
  assert.ok(byType.has('non_fast_forward'))
  assert.deepEqual(
    byType
      .get('required_status_checks')
      .parameters.required_status_checks.map(({ context }) => context),
    ['scope', 'quality', 'windows-playwright-exit'],
  )
  assert.equal(
    byType.get('required_status_checks').parameters.strict_required_status_checks_policy,
    true,
  )
})

test('dataset automation remains pull-request based', async () => {
  const workflow = await readFile('.github/workflows/build-border-roll-dataset.yml', 'utf8')
  const reconciler = await readFile('scripts/reconcile-border-roll-dataset-pr.mjs', 'utf8')
  assert.match(workflow, /Reconcile dataset update pull request/)
  assert.match(reconciler, /pulls/)
  assert.doesNotMatch(workflow, /git push origin main/)
})

test('security reporting points to the enabled canonical private channel', async () => {
  const securityPolicy = await readFile('SECURITY.md', 'utf8')
  const workflow = await readFile('.github/workflows/deploy.yml', 'utf8')
  assert.match(
    securityPolicy,
    /https:\/\/github\.com\/Alkwer\/one-more-map\.github\.io\/security\/advisories\/new/,
  )
  assert.match(workflow, /repos\/\$GITHUB_REPOSITORY\/private-vulnerability-reporting/)
  assert.match(workflow, /--jq ['"]?\.enabled['"]?/)
})
