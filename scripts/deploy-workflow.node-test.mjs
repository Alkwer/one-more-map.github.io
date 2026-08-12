import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const workflowUrl = new URL('../.github/workflows/deploy.yml', import.meta.url)
const securityAuditUrl = new URL('../.github/workflows/security-audit.yml', import.meta.url)
const dependabotUrl = new URL('../.github/dependabot.yml', import.meta.url)
const packageUrl = new URL('../package.json', import.meta.url)

test('Pages deploy waits for every required validation job', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')
  const deployStart = workflow.indexOf('\n  deploy:\n')

  assert.notEqual(deployStart, -1, 'deploy job is missing')
  const deployBlock = workflow.slice(deployStart)

  assert.match(
    deployBlock,
    /^    needs: \[scope, quality, windows-playwright-exit\]$/m,
    'deploy must wait for change detection and both validation jobs',
  )
  assert.match(deployBlock, /^        always\(\) &&$/m)
  assert.match(deployBlock, /^        github\.event_name != 'pull_request' &&$/m)
  assert.match(deployBlock, /^        github\.ref == 'refs\/heads\/main' &&$/m)
  assert.match(deployBlock, /^        needs\.scope\.result == 'success' &&$/m)
  assert.match(deployBlock, /^        needs\.quality\.result == 'success' &&$/m)
  assert.match(
    deployBlock,
    /^        \(needs\.windows-playwright-exit\.result == 'success' \|\| needs\.windows-playwright-exit\.result == 'skipped'\)$/m,
    'dataset-only main pushes must deploy after the intentionally skipped Windows job',
  )
})

test('dataset-only updates keep required checks while skipping browser jobs', async () => {
  const [workflow, packageJson] = await Promise.all([
    readFile(workflowUrl, 'utf8'),
    readFile(packageUrl, 'utf8').then(JSON.parse),
  ])
  const scopeStart = workflow.indexOf('\n  scope:\n')
  const windowsStart = workflow.indexOf('\n  windows-playwright-exit:\n')
  const qualityStart = workflow.indexOf('\n  quality:\n')
  const deployStart = workflow.indexOf('\n  deploy:\n')

  assert.notEqual(scopeStart, -1, 'change-detection job is missing')
  assert.notEqual(windowsStart, -1, 'Windows validation job is missing')
  assert.notEqual(qualityStart, -1, 'quality job is missing')
  assert.notEqual(deployStart, -1, 'deploy job is missing')

  const scopeBlock = workflow.slice(scopeStart, windowsStart)
  const windowsBlock = workflow.slice(windowsStart, qualityStart)
  const qualityBlock = workflow.slice(qualityStart, deployStart)

  assert.match(scopeBlock, /^    runs-on: ubuntu-slim$/m)
  assert.match(scopeBlock, /^          fetch-depth: 0$/m)
  assert.match(
    scopeBlock,
    /mapfile -t changed_files < <\(git diff --name-only "\$BASE_SHA" "\$HEAD_SHA"\)/,
  )
  assert.match(scopeBlock, /\$\{#changed_files\[@\]\} == 1/)
  assert.match(scopeBlock, /"data\/border-rolls-v2\.json"/)
  assert.match(scopeBlock, /echo "data_only=\$data_only" >> "\$GITHUB_OUTPUT"/)

  assert.match(windowsBlock, /^    needs: scope$/m)
  assert.match(windowsBlock, /^    if: needs\.scope\.outputs\.data_only != 'true'$/m)

  assert.match(qualityBlock, /^    needs: scope$/m)
  assert.match(qualityBlock, /^      - name: Validate dataset update$/m)
  assert.match(qualityBlock, /^        if: needs\.scope\.outputs\.data_only == 'true'$/m)
  assert.match(qualityBlock, /fetch-accepted-border-roll-issues\.mjs/)
  assert.match(qualityBlock, /^          npm run validate:data-update$/m)
  assert.match(qualityBlock, /^      - name: Run full validation$/m)
  assert.match(qualityBlock, /^        if: needs\.scope\.outputs\.data_only != 'true'$/m)
  assert.match(qualityBlock, /^        run: npm run validate$/m)
  assert.match(
    qualityBlock,
    /^        if: needs\.scope\.outputs\.data_only != 'true' \|\| \(github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'\)$/m,
    'dataset-only main pushes must still stage the Pages artifact',
  )
  assert.equal(
    packageJson.scripts['validate:data-update'],
    'node scripts/validate-canonical-border-roll-dataset.mjs && npm run test:data && vitest run --config vitest.config.ts tests/border-roll-model.test.ts && npm run build',
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
  assert.match(qualityBlock, /^        if: needs\.scope\.outputs\.data_only != 'true'$/m)
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

test('dependency audit runs on an independent weekly schedule', async () => {
  const workflow = await readFile(securityAuditUrl, 'utf8')

  assert.match(workflow, /^name: Dependency security audit$/m)
  assert.match(workflow, /^  schedule:$/m)
  assert.match(workflow, /^    - cron: '17 3 \* \* 1'$/m)
  assert.match(workflow, /^  workflow_dispatch:$/m)
  assert.match(workflow, /^permissions:\n  contents: read$/m)
  assert.match(workflow, /^      - run: npm ci$/m)
  assert.match(workflow, /^        run: npm run audit:ci$/m)
})
