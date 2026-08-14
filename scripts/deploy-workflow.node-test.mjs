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
    /^ {4}needs: \[scope, quality, windows-playwright-exit\]$/m,
    'deploy must wait for change detection and both validation jobs',
  )
  assert.match(deployBlock, /^ {8}always\(\) &&$/m)
  assert.match(deployBlock, /^ {8}github\.event_name != 'pull_request' &&$/m)
  assert.match(deployBlock, /^ {8}github\.ref == 'refs\/heads\/main' &&$/m)
  assert.match(deployBlock, /^ {8}needs\.scope\.result == 'success' &&$/m)
  assert.match(deployBlock, /^ {8}needs\.quality\.result == 'success' &&$/m)
  assert.match(
    deployBlock,
    /^ {8}\(needs\.windows-playwright-exit\.result == 'success' \|\| needs\.windows-playwright-exit\.result == 'skipped'\)$/m,
    'dataset-only main pushes must deploy after the intentionally skipped Windows job',
  )
})

test('dataset and generated research-summary updates keep required checks while skipping browser jobs', async () => {
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

  assert.match(scopeBlock, /^ {4}runs-on: ubuntu-slim$/m)
  assert.match(scopeBlock, /^ {10}fetch-depth: 0$/m)
  assert.match(
    scopeBlock,
    /mapfile -t changed_files < <\(git diff --name-only "\$BASE_SHA" "\$HEAD_SHA"\)/,
  )
  assert.match(scopeBlock, /\$\{#changed_files\[@\]\} <= 2/)
  assert.match(scopeBlock, /"data\/border-rolls-v2\.json"/)
  assert.match(scopeBlock, /"RESEARCH\.md"/)
  assert.match(scopeBlock, /has_dataset=true/)
  assert.match(scopeBlock, /supported_files=false/)
  assert.match(scopeBlock, /echo "data_only=\$data_only" >> "\$GITHUB_OUTPUT"/)

  assert.match(windowsBlock, /^ {4}needs: scope$/m)
  assert.match(windowsBlock, /^ {4}if: needs\.scope\.outputs\.data_only != 'true'$/m)

  assert.match(qualityBlock, /^ {4}needs: scope$/m)
  assert.match(qualityBlock, /^ {6}PAGES_CANONICAL_ORIGIN: https:\/\/alkwer\.github\.io$/m)
  assert.match(qualityBlock, /^ {6}PAGES_PRODUCTION_SITE_PREFIX: \/one-more-map\.github\.io\/$/m)
  assert.match(qualityBlock, /^ {6}- name: Validate dataset update$/m)
  assert.match(qualityBlock, /^ {8}if: needs\.scope\.outputs\.data_only == 'true'$/m)
  assert.match(qualityBlock, /fetch-accepted-border-roll-issues\.mjs/)
  assert.match(qualityBlock, /^ {10}npm run validate:data-update$/m)
  assert.match(qualityBlock, /^ {6}- name: Run full validation$/m)
  assert.match(qualityBlock, /^ {8}if: needs\.scope\.outputs\.data_only != 'true'$/m)
  assert.match(qualityBlock, /^ {8}run: npm run validate$/m)
  assert.match(qualityBlock, /^ {6}BORDER_ROLL_INTAKE_URL: https:\/\//m)
  assert.match(qualityBlock, /^ {6}- name: Stage root-site artifact and project-site E2E wrapper$/m)
  assert.match(qualityBlock, /^ {8}if: needs\.scope\.outputs\.data_only != 'true'$/m)
  assert.match(qualityBlock, /^ {8}run: npm run build:pages:e2e$/m)
  assert.match(qualityBlock, /^ {6}- name: Prepare the deployment-scoped Pages artifact$/m)
  assert.match(
    qualityBlock,
    /^ {8}if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'$/m,
    'only a main non-PR run may prepare an artifact for Pages upload',
  )
  assert.match(qualityBlock, /^ {8}run: npm run build:pages$/m)
  assert.equal(
    packageJson.scripts['validate:data-update'],
    'node scripts/validate-canonical-border-roll-dataset.mjs && npm run check:research-stats && npm run test:data && vitest run --config vitest.config.ts tests/border-roll-model.test.ts && npm run check:eol && npm run format:check && npm run build',
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
  assert.match(qualityBlock, /^ {6}- name: Enforce npm audit policy$/m)
  assert.match(qualityBlock, /^ {8}if: needs\.scope\.outputs\.data_only != 'true'$/m)
  assert.match(qualityBlock, /^ {8}run: npm run audit:ci$/m)

  assert.notEqual(npmStart, -1, 'npm Dependabot updates are missing')
  assert.match(npmBlock, /^ {4}open-pull-requests-limit: 3$/m)
  assert.match(npmBlock, /^ {6}development-tooling:$/m)
  assert.match(npmBlock, /^ {8}dependency-type: development$/m)
  assert.match(npmBlock, /^ {10}- minor$/m)
  assert.match(npmBlock, /^ {10}- patch$/m)

  assert.equal(packageJson.scripts['audit:production'], 'npm audit --omit=dev')
  assert.equal(packageJson.scripts['audit:high'], 'npm audit --audit-level=high')
  assert.equal(packageJson.scripts['audit:ci'], 'npm run audit:production && npm run audit:high')
})

test('workflow validation includes the Windows OCR privacy invariant', async () => {
  const packageJson = JSON.parse(await readFile(packageUrl, 'utf8'))

  assert.match(packageJson.scripts['test:workflow'], /scripts\/windows-ocr-privacy\.node-test\.mjs/)
})

test('dependency audit runs on an independent weekly schedule', async () => {
  const workflow = await readFile(securityAuditUrl, 'utf8')

  assert.match(workflow, /^name: Dependency security audit$/m)
  assert.match(workflow, /^ {2}schedule:$/m)
  assert.match(workflow, /^ {4}- cron: '17 3 \* \* 1'$/m)
  assert.match(workflow, /^ {2}workflow_dispatch:$/m)
  assert.match(workflow, /^permissions:\n {2}contents: read$/m)
  assert.match(workflow, /^ {6}- run: npm ci$/m)
  assert.match(workflow, /^ {8}run: npm run audit:ci$/m)
})
