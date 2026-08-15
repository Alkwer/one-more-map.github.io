import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Windows OCR privacy documentation matches the in-memory helper lifecycle', async () => {
  const [readme, guide, importer] = await Promise.all([
    readProjectFile('README.md'),
    readProjectFile('docs/windows-ocr.md'),
    readProjectFile('public/voyage-import.ahk'),
  ])

  assert.doesNotMatch(
    `${readme}\n${guide}`,
    /generated (?:PowerShell )?bridge/i,
    'documentation must not describe the retired on-disk PowerShell bridge',
  )
  assert.match(readme, /PowerShell helper source[\s\S]*executed from memory/)
  assert.match(readme, /full-window PoE screenshot/)
  assert.match(readme, /filtered screenshot/)
  assert.match(readme, /contrast-normalized fallback image/)
  assert.match(readme, /UTF-8 OCR result/)
  assert.match(guide, /no `\.ps1` bridge is\s+generated/)

  for (const [documentedName, runtimeName] of [
    ['voyage-border-<run>-<child>-<index>.png', 'voyage-border-$RunId-$PID-$Index.png'],
    [
      'voyage-ocr-filtered-<run>-<child>-<random>.png',
      "voyage-ocr-filtered-$RunId-$PID-$([Guid]::NewGuid().ToString('N')).png",
    ],
    [
      'voyage-ocr-normalized-<run>-<child>-<random>.png',
      "voyage-ocr-normalized-$RunId-$PID-$([Guid]::NewGuid().ToString('N')).png",
    ],
  ]) {
    assert.ok(guide.includes(documentedName), `OCR guide must document ${documentedName}`)
    assert.ok(
      importer.includes(runtimeName),
      `importer must still use the runtime artifact matching ${documentedName}`,
    )
  }

  assert.match(guide, /voyage-border-ocr-<helper>\.txt/)
  assert.match(importer, /OcrOutput := TempDir "\\voyage-border-ocr-"/)
  assert.match(importer, /StartHiddenPowerShell\(applicationName, commandLine\)/)
  assert.match(importer, /PROC_THREAD_ATTRIBUTE_HANDLE_LIST := 0x00020002/)
  assert.match(importer, /CREATE_NO_WINDOW := 0x08000000/)
  assert.match(importer, /WriteUtf8Pipe\(OcrStdinHandle, ocrSource\)/)
  assert.match(importer, /CloseNativeHandle\(OcrStdinHandle\)/)
  assert.doesNotMatch(importer, /WScript\.Shell|shell\.Exec\(/)
  assert.doesNotMatch(
    importer,
    /FileAppend\s+OcrPowerShell\(\)/,
    'the embedded helper source must not be written to a script file',
  )
})
