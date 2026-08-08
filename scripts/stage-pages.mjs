import { cp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const staging = join(root, 'staging')
const playwrightStaging = join(root, 'staging-playwright')
const appDirectory = join(staging, 'allflame-voyage-solver')
const rawProjectSitePrefix =
  process.env.PLAYWRIGHT_PROJECT_SITE_PREFIX ?? '/one-more-map.github.io/'

function projectSiteSegments(value) {
  const segments = value.split('/').filter(Boolean)
  if (
    segments.some(
      (segment) => segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment),
    )
  ) {
    throw new Error(`Invalid PLAYWRIGHT_PROJECT_SITE_PREFIX: ${value}`)
  }
  return segments
}

const prefixSegments = projectSiteSegments(rawProjectSitePrefix)

await rm(staging, { recursive: true, force: true })
await rm(playwrightStaging, { recursive: true, force: true })
await mkdir(appDirectory, { recursive: true })
await cp(dist, appDirectory, { recursive: true })
await cp(join(root, 'redirect.html'), join(staging, 'index.html'))
await cp(staging, playwrightStaging, { recursive: true })

if (prefixSegments.length > 0) {
  await cp(staging, join(playwrightStaging, ...prefixSegments), { recursive: true })
}

console.log(`Staged GitHub Pages artifact at ${staging}`)
console.log(
  `Staged Playwright project-site wrapper at ${playwrightStaging}/${prefixSegments.join('/')}`,
)
