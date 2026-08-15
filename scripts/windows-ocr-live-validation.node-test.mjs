import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Windows OCR matrix keeps every required environment unexecuted by default', async () => {
  const guide = await readProjectFile('docs/windows-ocr-live-validation.md')

  for (const matrixId of [
    'W10-1080-Q',
    'W10-1440-E',
    'W10-4K-E',
    'W11-1080-E',
    'W11-1440-Q',
    'W11-4K-E',
    'UIPI-PASS',
    'UIPI-FAIL',
  ]) {
    assert.match(
      guide,
      new RegExp(`\\|\\s*${matrixId}\\s*\\|\\s*Not run\\s*\\|`),
      `${matrixId} must remain Not run until reviewed live evidence exists`,
    )
  }
})

test('live runbook and evidence template cover workflows without collecting private data', async () => {
  const [guide, record] = await Promise.all([
    readProjectFile('docs/windows-ocr-live-validation.md'),
    readProjectFile('docs/windows-ocr-live-validation-record.md'),
  ])
  const combined = `${guide}\n${record}`.toLowerCase()

  for (const required of [
    '`F9`',
    '`Ctrl+F9`',
    '`F10`',
    '`Ctrl+F4`',
    'Quick',
    'Exact',
    'genuinely different visible grid',
    'reroll',
    'stale',
    'success / failure / abort / exit',
    'manual border entry',
  ]) {
    assert.ok(combined.includes(required.toLowerCase()), `missing live invariant: ${required}`)
  }
  assert.match(record, /Status: Not run/)
  assert.match(record, /No screenshots or image crops/)
  assert.match(record, /plain text, minimized, synthetic where possible/)
  assert.doesNotMatch(record, /Status: Pass/)
})

test('preflight is read-only, privacy-safe, and wired into repository commands', async () => {
  const [preflight, probe, packageJson, gitignore] = await Promise.all([
    readProjectFile('scripts/windows-ocr-preflight.ps1'),
    readProjectFile('scripts/windows-ocr-window-probe.ahk'),
    readProjectFile('package.json').then(JSON.parse),
    readProjectFile('.gitignore'),
  ])

  assert.equal(
    packageJson.scripts['windows-ocr:preflight'],
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-ocr-preflight.ps1',
  )
  assert.match(packageJson.scripts['test:workflow'], /windows-ocr-live-validation\.node-test\.mjs/)
  assert.match(gitignore, /!scripts\/windows-ocr-window-probe\.ahk/)
  assert.match(preflight, /availableLanguageCount/)
  assert.match(preflight, /selectedLanguage = \$null/)
  assert.match(preflight, /currentCount = \$artifactNames\.Count/)
  assert.match(preflight, /No paths, screenshots, OCR text, clipboard contents/)
  assert.match(preflight, /-WindowStyle Hidden/)
  assert.match(preflight, /Remove-Item -LiteralPath \$probeOutputPath/)
  assert.doesNotMatch(preflight, /Get-Clipboard|Set-Clipboard|CopyFromScreen/)
  assert.match(probe, /GetDpiForWindow/)
  assert.match(probe, /GetTokenInformation/)
  assert.doesNotMatch(probe, /\b(?:Send|Click|MouseMove|PixelSearch)\b/)
})

test('cleanup evidence uses the current in-memory OCR artifact contract', async () => {
  const [guide, importer] = await Promise.all([
    readProjectFile('docs/windows-ocr-live-validation.md'),
    readProjectFile('public/voyage-import.ahk'),
  ])

  for (const artifact of [
    'voyage-border-<run>-<child>-<index>.png',
    'voyage-ocr-filtered-<run>-<child>-<random>.png',
    'voyage-ocr-normalized-<run>-<child>-<random>.png',
    'voyage-border-ocr-<helper>.txt',
  ]) {
    assert.ok(guide.includes(artifact), `live guide must document ${artifact}`)
  }
  assert.match(guide, /does not\s+create a `\.ps1` bridge/)
  assert.match(importer, /helper := shell\.Exec\(command\)/)
  assert.match(importer, /helper\.StdIn\.Write\(OcrPowerShell\(\)\)/)
  assert.match(importer, /helper\.StdIn\.Close\(\)/)
  assert.doesNotMatch(importer, /FileAppend\s+OcrPowerShell\(\)/)
  assert.doesNotMatch(importer, /-ExecutionPolicy Bypass -File/)
})
