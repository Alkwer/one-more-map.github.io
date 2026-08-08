import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const workflowUrl = new URL('../.github/workflows/deploy.yml', import.meta.url)

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
