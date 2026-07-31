import { cp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const staging = join(root, 'staging')
const appDirectory = join(staging, 'allflame-voyage-solver')

await rm(staging, { recursive: true, force: true })
await mkdir(appDirectory, { recursive: true })
await cp(dist, appDirectory, { recursive: true })
await cp(join(root, 'redirect.html'), join(staging, 'index.html'))

console.log(`Staged GitHub Pages artifact at ${staging}`)
