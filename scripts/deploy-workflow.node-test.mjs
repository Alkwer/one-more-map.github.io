import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const workflowUrl = new URL('../.github/workflows/deploy.yml', import.meta.url)
const dependabotUrl = new URL('../.github/dependabot.yml', import.meta.url)
const packageUrl = new URL('../package.json', import.meta.url)

test('Pages deploy waits for every required validation job', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')
  const deployStart = workflow.indexOf('\n  deploy:\n')

  assert.notEqual(deployStart, -1, 'deploy job is missing')
  const deployBlock = workflow.slice(deployStart)

  assert.match(
    deployBlock,
    /^    needs: \[quality, windows-playwright-exit\]$/m,
    'deploy must wait for both the Linux quality job and the Windows Playwright teardown job',
  )
  assert.match(
    deployBlock,
    /^    if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'$/m,
    'pull requests must validate without deploying',
  )
})

test('dependency maintenance and audit policy stay enforced', async () => {
  const [workflow, dependabot, packageJson] = await Promise.all([
    readFile(workflowUrl, 'utf8'),
    readFile(dependabotUrl, 'utf8'),
    readFile(packageUrl, 'utf8').then(JSON.parse),
  ])
  const qualityStart = workflow.indexOf('\n  quality:\n')
  const deployStart = workflow.indexOf('\n  deploy:\n')
  const qualityBlock = workflow.slice(qualityStart, deployStart)
  const npmStart = dependabot.indexOf('  - package-ecosystem: npm\n')
  const npmBlock = dependabot.slice(npmStart)

  assert.notEqual(qualityStart, -1, 'quality job is missing')
  assert.match(qualityBlock, /^      - name: Enforce npm audit policy$/m)
  assert.match(qualityBlock, /^        run: npm run audit:ci$/m)

  assert.notEqual(npmStart, -1, 'npm Dependabot updates are missing')
  assert.match(npmBlock, /^    open-pull-requests-limit: 3$/m)
  assert.match(npmBlock, /^      development-tooling:$/m)
  assert.match(npmBlock, /^        dependency-type: development$/m)
  assert.match(npmBlock, /^          - minor$/m)
  assert.match(npmBlock, /^          - patch$/m)

  assert.equal(packageJson.scripts['audit:production'], 'npm audit --omit=dev')
  assert.equal(packageJson.scripts['audit:high'], 'npm audit --audit-level=high')
  assert.equal(packageJson.scripts['audit:ci'], 'npm run audit:production && npm run audit:high')
})
