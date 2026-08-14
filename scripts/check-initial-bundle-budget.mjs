import { gzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const ENTRY_SURFACE_GZIP_BUDGET = 100 * 1024
export const COMPLETE_STARTUP_GZIP_BUDGET = 120 * 1024

function entryKey(manifest) {
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry)
  if (entries.length !== 1) {
    throw new Error(`Expected exactly one Vite entry chunk, found ${entries.length}.`)
  }
  return entries[0][0]
}

/**
 * The entry surface matches the issue's stable, comparable metric: the HTML
 * entry plus only the modules it deliberately boots (React DOM and App).
 * Nested dynamic imports are optional screens and must stay out of this set.
 */
export function collectEntrySurfaceKeys(manifest) {
  const entry = entryKey(manifest)
  return new Set([entry, ...(manifest[entry].dynamicImports ?? [])])
}

/** Follow eager imports from the entry surfaces so moving code to a shared
 * chunk cannot hide it from the stricter complete-startup guardrail. */
export function collectCompleteStartupKeys(manifest) {
  const startup = collectEntrySurfaceKeys(manifest)
  const pending = [...startup]
  while (pending.length > 0) {
    const key = pending.pop()
    const chunk = manifest[key]
    if (!chunk) throw new Error(`Vite manifest references missing chunk ${key}.`)
    for (const imported of chunk.imports ?? []) {
      if (startup.has(imported)) continue
      startup.add(imported)
      pending.push(imported)
    }
  }
  return startup
}

async function measureKeys(manifest, keys, outDir) {
  const files = []
  let gzipBytes = 0
  for (const key of [...keys].sort()) {
    const file = manifest[key]?.file
    if (!file) throw new Error(`Vite manifest chunk ${key} has no output file.`)
    const bytes = gzipSync(await readFile(path.join(outDir, file)), { level: 9 }).byteLength
    files.push({ file, gzipBytes: bytes })
    gzipBytes += bytes
  }
  return { files, gzipBytes }
}

export async function measureInitialBundle(outDir = 'dist') {
  const manifest = JSON.parse(await readFile(path.join(outDir, '.vite', 'manifest.json'), 'utf8'))
  return {
    entrySurface: await measureKeys(manifest, collectEntrySurfaceKeys(manifest), outDir),
    completeStartup: await measureKeys(manifest, collectCompleteStartupKeys(manifest), outDir),
  }
}

export function assertBundleBudgets(measurement) {
  const failures = []
  if (measurement.entrySurface.gzipBytes > ENTRY_SURFACE_GZIP_BUDGET) {
    failures.push(
      `entry surfaces are ${measurement.entrySurface.gzipBytes} bytes gzip (budget ${ENTRY_SURFACE_GZIP_BUDGET})`,
    )
  }
  if (measurement.completeStartup.gzipBytes > COMPLETE_STARTUP_GZIP_BUDGET) {
    failures.push(
      `complete startup is ${measurement.completeStartup.gzipBytes} bytes gzip (budget ${COMPLETE_STARTUP_GZIP_BUDGET})`,
    )
  }
  if (failures.length > 0)
    throw new Error(`Initial bundle budget exceeded: ${failures.join('; ')}.`)
}

function kib(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`
}

async function main() {
  const measurement = await measureInitialBundle()
  for (const [label, result] of Object.entries(measurement)) {
    console.log(`${label}: ${kib(result.gzipBytes)} gzip`)
    for (const file of result.files) console.log(`  ${file.file}: ${kib(file.gzipBytes)}`)
  }
  assertBundleBudgets(measurement)
  console.log('Initial bundle budgets passed.')
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
