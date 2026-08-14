import { appendFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const DEFAULT_ATTEMPTS = 12
const DEFAULT_RETRY_DELAY_MS = 10_000
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_SOLVER_SUBPATH = 'allflame-voyage-solver/'

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, received ${value}`)
  }
  return parsed
}

function directoryUrl(value, name) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be an absolute URL, received ${value}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${name} must use HTTP or HTTPS, received ${url.protocol}`)
  }
  url.search = ''
  url.hash = ''
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
  return match?.[2]
}

function metaRefreshTarget(html, baseUrl) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []
  const refresh = metaTags.find((tag) => attribute(tag, 'http-equiv')?.toLowerCase() === 'refresh')
  if (!refresh) throw new Error('root page is missing its meta refresh redirect')

  const content = attribute(refresh, 'content')
  const match = content?.match(/^\s*\d+\s*;\s*url\s*=\s*(.+?)\s*$/i)
  if (!match)
    throw new Error(`root page has an invalid meta refresh: ${content ?? 'missing content'}`)
  return new URL(match[1].replace(/^["']|["']$/g, ''), baseUrl)
}

function assetUrls(html, baseUrl) {
  const scripts = (html.match(/<script\b[^>]*>/gi) ?? [])
    .map((tag) => attribute(tag, 'src'))
    .filter(Boolean)
  const styles = (html.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) =>
      (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet'),
    )
    .map((tag) => attribute(tag, 'href'))
    .filter(Boolean)

  const hashedScript = scripts.find((value) =>
    /(?:^|\/)[^/?#]+-[A-Za-z0-9_-]{8,}\.js(?:[?#]|$)/.test(value),
  )
  const hashedStyle = styles.find((value) =>
    /(?:^|\/)[^/?#]+-[A-Za-z0-9_-]{8,}\.css(?:[?#]|$)/.test(value),
  )
  if (!hashedScript) throw new Error('solver HTML does not reference a hashed JavaScript asset')
  if (!hashedStyle) throw new Error('solver HTML does not reference a hashed CSS asset')
  return [new URL(hashedScript, baseUrl), new URL(hashedStyle, baseUrl)]
}

async function responseText(fetchImpl, url, expectedType, timeoutMs) {
  const response = await fetchImpl(url, {
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes(expectedType)) {
    throw new Error(`${url} returned ${contentType || 'no content type'}; expected ${expectedType}`)
  }
  return { response, text: await response.text() }
}

function assertSolverAsset(url, solverUrl) {
  if (url.origin !== solverUrl.origin || !url.pathname.startsWith(solverUrl.pathname)) {
    throw new Error(`solver asset escaped the published solver path: ${url}`)
  }
}

export async function verifyPublishedArtifact({
  pageUrl,
  solverSubpath = DEFAULT_SOLVER_SUBPATH,
  expectedCommit,
  fetchImpl = fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  const rootUrl = directoryUrl(pageUrl, 'PAGE_URL')
  const solverUrl = directoryUrl(new URL(solverSubpath, rootUrl), 'SOLVER_SUBPATH')
  if (
    solverUrl.origin !== rootUrl.origin ||
    solverUrl.href === rootUrl.href ||
    !solverUrl.pathname.startsWith(rootUrl.pathname)
  ) {
    throw new Error(`SOLVER_SUBPATH must stay below the published root ${rootUrl}`)
  }
  const cacheKey = encodeURIComponent(expectedCommit)

  const root = await responseText(
    fetchImpl,
    new URL(`?pages-smoke=${cacheKey}`, rootUrl),
    'text/html',
    requestTimeoutMs,
  )
  const redirectTarget = metaRefreshTarget(root.text, root.response.url || rootUrl)
  if (directoryUrl(redirectTarget, 'root redirect').href !== solverUrl.href) {
    throw new Error(`root redirect points to ${redirectTarget}; expected ${solverUrl}`)
  }

  const solver = await responseText(
    fetchImpl,
    new URL(`?pages-smoke=${cacheKey}`, solverUrl),
    'text/html',
    requestTimeoutMs,
  )
  const assets = assetUrls(solver.text, solver.response.url || solverUrl)
  for (const asset of assets) {
    assertSolverAsset(asset, solverUrl)
    const expectedType = asset.pathname.endsWith('.js') ? 'javascript' : 'text/css'
    await responseText(fetchImpl, asset, expectedType, requestTimeoutMs)
  }

  const markerUrl = new URL(`deployment.json?pages-smoke=${cacheKey}`, solverUrl)
  const marker = await responseText(fetchImpl, markerUrl, 'application/json', requestTimeoutMs)
  let deployment
  try {
    deployment = JSON.parse(marker.text)
  } catch {
    throw new Error(`${markerUrl} did not contain valid JSON`)
  }
  if (deployment.commit !== expectedCommit) {
    throw new Error(
      `published commit marker is ${String(deployment.commit)}; expected ${expectedCommit}`,
    )
  }

  return { rootUrl: rootUrl.href, solverUrl: solverUrl.href, assets: assets.map(String) }
}

export async function smokeTestPages({
  pageUrl,
  solverSubpath = DEFAULT_SOLVER_SUBPATH,
  expectedCommit,
  attempts = DEFAULT_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImpl = fetch,
  sleep = delay,
  log = console.log,
}) {
  if (!pageUrl) throw new Error('PAGE_URL is required but deploy-pages returned no URL')
  if (!expectedCommit) throw new Error('EXPECTED_COMMIT_SHA is required')
  const boundedAttempts = positiveInteger(attempts, DEFAULT_ATTEMPTS, 'MAX_ATTEMPTS')
  const boundedDelay = positiveInteger(retryDelayMs, DEFAULT_RETRY_DELAY_MS, 'RETRY_DELAY_MS')
  const boundedTimeout = positiveInteger(
    requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    'REQUEST_TIMEOUT_MS',
  )

  let lastError
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    try {
      const result = await verifyPublishedArtifact({
        pageUrl,
        solverSubpath,
        expectedCommit,
        fetchImpl,
        requestTimeoutMs: boundedTimeout,
      })
      log(
        `Published Pages smoke test passed on attempt ${attempt}/${boundedAttempts}: ${result.solverUrl}`,
      )
      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      log(`Pages propagation attempt ${attempt}/${boundedAttempts} failed: ${lastError.message}`)
      if (attempt < boundedAttempts) await sleep(boundedDelay)
    }
  }

  throw new Error(
    `Published Pages artifact at ${pageUrl} was unavailable or stale after ${boundedAttempts} attempts. ` +
      `Expected commit ${expectedCommit}. Last failure: ${lastError?.message ?? 'unknown error'}. ` +
      'Inspect the deployment URL and GitHub Pages environment, then re-run the workflow.',
  )
}

function workflowCommandValue(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

async function appendSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
  }
}

async function main() {
  try {
    const result = await smokeTestPages({
      pageUrl: process.env.PAGE_URL,
      solverSubpath: process.env.SOLVER_SUBPATH,
      expectedCommit: process.env.EXPECTED_COMMIT_SHA,
      attempts: process.env.MAX_ATTEMPTS,
      retryDelayMs: process.env.RETRY_DELAY_MS,
      requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS,
    })
    await appendSummary(
      `### Published Pages smoke test passed\n\n- Root: ${result.rootUrl}\n- Solver: ${result.solverUrl}\n- Commit: \`${process.env.EXPECTED_COMMIT_SHA}\``,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `::error title=Published Pages smoke test failed::${workflowCommandValue(message)}`,
    )
    await appendSummary(`### Published Pages smoke test failed\n\n${message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
