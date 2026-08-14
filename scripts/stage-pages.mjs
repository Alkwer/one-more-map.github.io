import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  APP_DIRECTORY,
  canonicalAppUrl,
  DEFAULT_CANONICAL_ORIGIN,
  DEFAULT_PRODUCTION_SITE_PREFIX,
  setCanonicalLink,
  sitePrefixSegments,
} from './deployment-metadata.mjs'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const staging = join(root, 'staging')
const playwrightStaging = join(root, 'staging-playwright')
const rawProjectSitePrefix =
  process.env.PLAYWRIGHT_PROJECT_SITE_PREFIX ?? '/one-more-map.github.io/'
const productionSitePrefix =
  process.env.PAGES_PRODUCTION_SITE_PREFIX ?? DEFAULT_PRODUCTION_SITE_PREFIX
const canonicalOrigin = process.env.PAGES_CANONICAL_ORIGIN ?? DEFAULT_CANONICAL_ORIGIN
const prefixSegments = sitePrefixSegments(rawProjectSitePrefix)

async function stageDeployment(target, sitePrefix) {
  const appDirectory = join(target, APP_DIRECTORY)
  const canonicalUrl = canonicalAppUrl(sitePrefix, canonicalOrigin)
  await mkdir(appDirectory, { recursive: true })
  await cp(dist, appDirectory, { recursive: true })
  await cp(join(root, 'redirect.html'), join(target, 'index.html'))

  for (const path of [join(target, 'index.html'), join(appDirectory, 'index.html')]) {
    const html = await readFile(path, 'utf8')
    await writeFile(path, setCanonicalLink(html, canonicalUrl, path))
  }
}

await rm(staging, { recursive: true, force: true })
await rm(playwrightStaging, { recursive: true, force: true })
await stageDeployment(staging, productionSitePrefix)
await stageDeployment(playwrightStaging, '/')

if (prefixSegments.length > 0) {
  await stageDeployment(join(playwrightStaging, ...prefixSegments), rawProjectSitePrefix)
}

console.log(
  `Staged GitHub Pages artifact at ${staging} with canonical ${canonicalAppUrl(productionSitePrefix, canonicalOrigin)}`,
)
console.log(
  `Staged root-site and project-site Playwright artifacts at ${playwrightStaging} with canonical origin ${canonicalOrigin}`,
)
