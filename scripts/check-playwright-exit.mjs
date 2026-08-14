import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const playwrightCli = require.resolve('@playwright/test/cli')
const timeoutMs = Number(process.env.PLAYWRIGHT_EXIT_TIMEOUT_MS ?? 20_000)

export const failingProbeMarker = 'PLAYWRIGHT_EXIT_PROBE_BROWSER_STARTED_7A3956F7'
export const expectedFailureSignature = 'PLAYWRIGHT_EXIT_PROBE_EXPECTED_FAILURE_E44D809A'

function assertExitOne(name, { code, signal }) {
  assert.equal(signal, null, `${name} exited via signal ${signal}`)
  assert.equal(code, 1, `Expected ${name} to exit 1, received ${code}`)
}

function normalizedOutputLines(output) {
  return stripVTControlCharacters(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function verifyNoTestsProbeResult(result) {
  assertExitOne('Playwright no-tests probe', result)
  assert.match(result.output, /No tests found/i)
}

export function verifyFailingProbeResult(result) {
  assertExitOne('Playwright failing-test probe', result)
  const lines = normalizedOutputLines(result.output)

  assert.ok(
    lines.includes(failingProbeMarker),
    `Playwright did not emit the exact browser-start marker: ${failingProbeMarker}`,
  )
  assert.ok(
    lines.includes(`Error: ${expectedFailureSignature}`),
    `Playwright did not emit the exact expected failure: ${expectedFailureSignature}`,
  )
}

function availablePort(port = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      const address = server.address()
      const selected = typeof address === 'object' && address ? address.port : port
      server.close((error) => (error ? reject(error) : resolve(selected)))
    })
  })
}

function terminateTree(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

async function waitForPortRelease(port) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      await availablePort(port)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error(`Playwright preview port ${port} remained in use after the runner exited`)
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function runProbe(name, args, verifyResult, env = {}) {
  const port = await availablePort()
  const startedAt = Date.now()
  let output = ''
  const child = spawn(process.execPath, [playwrightCli, 'test', ...args, '--reporter=line'], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: { ...process.env, ...env, CI: '1', PLAYWRIGHT_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
  }

  const exitPromise = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  const outcome = await Promise.race([
    exitPromise.then((exit) => ({ timedOut: false, exit })),
    delay(timeoutMs).then(() => ({ timedOut: true })),
  ])

  if (outcome.timedOut) {
    terminateTree(child)
    await Promise.race([exitPromise, delay(2_000)])
    throw new Error(`${name} did not exit within ${timeoutMs}ms`)
  }

  verifyResult({ ...outcome.exit, output })
  await waitForPortRelease(port)

  console.log(`${name} exited in ${Date.now() - startedAt}ms and released port ${port}.`)
}

async function main() {
  await runProbe(
    'Playwright no-tests probe',
    ['--grep', '__never_matches__'],
    verifyNoTestsProbeResult,
  )
  await runProbe(
    'Playwright failing-test probe',
    [
      'e2e/playwright-exit-probe.spec.ts',
      '--project',
      'chromium',
      '--grep',
      'fails after the intended Chromium page starts',
      '--retries',
      '0',
      '--workers',
      '1',
    ],
    verifyFailingProbeResult,
    {
      PLAYWRIGHT_EXIT_PROBE: '1',
    },
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
