import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const { scripts } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const readme = await readFile(new URL('README.md', root), 'utf8')
const contributing = await readFile(new URL('CONTRIBUTING.md', root), 'utf8')
const commandReference = readme.split(/^## Commands\r?$/m)[1]?.split(/^## /m)[0]
assert.ok(commandReference, 'README.md must contain a Commands section')

const documentedScripts = [...commandReference.matchAll(/^\| `npm (?:run ([\w:-]+)|(test))`/gm)]
  .map((match) => match[1] ?? match[2])
  .sort()
assert.deepEqual(
  documentedScripts,
  Object.keys(scripts).sort(),
  'README.md Commands must document every package.json script exactly once, without stale entries',
)

for (const [name, document] of [
  ['README.md', readme],
  ['CONTRIBUTING.md', contributing],
]) {
  for (const [, script] of document.matchAll(/\bnpm run ([\w:-]+)/g)) {
    assert.ok(Object.hasOwn(scripts, script), `${name} references unknown npm script: ${script}`)
  }
}

console.log(`Command documentation matches all ${documentedScripts.length} npm scripts.`)
