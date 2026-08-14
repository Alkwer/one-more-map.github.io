import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { test } from 'node:test'

const binaryAssetExtensions = new Set([
  '.7z',
  '.avif',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.ttf',
  '.wasm',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
])

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr.trim() ?? 'git ls-files failed')
  }
  return result.stdout.split('\0').filter(Boolean)
}

test('every bundled binary asset has verified provenance and redistribution permission', async () => {
  const manifest = JSON.parse(await readFile('docs/bundled-assets.json', 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.ok(Array.isArray(manifest.assets))

  const manifestPaths = new Set()
  for (const asset of manifest.assets) {
    assert.equal(typeof asset.path, 'string')
    assert.ok(asset.path.length > 0)
    assert.equal(typeof asset.source, 'string')
    assert.ok(asset.source.length > 0)
    assert.equal(typeof asset.author, 'string')
    assert.ok(asset.author.length > 0)
    assert.equal(typeof asset.license, 'string')
    assert.ok(asset.license.length > 0)
    assert.equal(asset.permissionStatus, 'verified')
    assert.equal(typeof asset.evidence, 'string')
    assert.ok(asset.evidence.length > 0)
    assert.equal(manifestPaths.has(asset.path), false, `duplicate asset entry: ${asset.path}`)
    manifestPaths.add(asset.path)
  }

  const binaryPaths = trackedFiles().filter((path) =>
    binaryAssetExtensions.has(extname(path).toLowerCase()),
  )
  assert.deepEqual([...manifestPaths].sort(), binaryPaths.sort())
})

test('license scope and non-affiliation notice remain explicit', async () => {
  const license = await readFile('LICENSE', 'utf8')
  const notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8')
  assert.match(license, /applies only to source code, documentation, and other original/)
  assert.match(notices, /not affiliated with, endorsed by, sponsored by,\s+or approved by/i)
  assert.match(notices, /Grinding Gear Games/)
})
