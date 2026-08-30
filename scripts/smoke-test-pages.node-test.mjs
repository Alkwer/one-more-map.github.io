import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smokeTestPages, verifyPublishedArtifact } from './smoke-test-pages.mjs'

const pageUrl = 'https://example.test/one-more-map.github.io/'
const solverUrl = `${pageUrl}allflame-voyage-solver/`
const commit = '0123456789abcdef0123456789abcdef01234567'
const appHtml = `<!doctype html><html><head>
  <script type="module" src="./assets/index-AbCdEf12.js"></script>
  <link rel="stylesheet" href="./assets/index-ZyXwVu98.css">
</head><body></body></html>`

function response(body, contentType, status = 200) {
  return new Response(body, { status, headers: { 'content-type': contentType } })
}

function publishedFetch({ markerCommit = commit, rootStatus = 200, requests = [] } = {}) {
  return async (input) => {
    const url = new URL(input)
    requests.push(url.href)
    if (url.pathname === '/one-more-map.github.io/') {
      return response(
        '<meta http-equiv="refresh" content="0; url=./allflame-voyage-solver/">',
        'text/html',
        rootStatus,
      )
    }
    if (url.pathname === '/one-more-map.github.io/allflame-voyage-solver/') {
      return response(appHtml, 'text/html')
    }
    if (url.pathname.endsWith('.js')) return response('export default true', 'text/javascript')
    if (url.pathname.endsWith('.css')) return response('body{}', 'text/css')
    if (url.pathname.endsWith('/deployment.json')) {
      return response(JSON.stringify({ commit: markerCommit }), 'application/json')
    }
    return response('missing', 'text/plain', 404)
  }
}

test('checks the root redirect, solver assets, and exact deployment marker', async () => {
  const requests = []
  const result = await verifyPublishedArtifact({
    pageUrl,
    expectedCommit: commit,
    fetchImpl: publishedFetch({ requests }),
  })

  assert.equal(result.rootUrl, pageUrl)
  assert.equal(result.solverUrl, solverUrl)
  assert.deepEqual(result.assets, [
    `${solverUrl}assets/index-AbCdEf12.js`,
    `${solverUrl}assets/index-ZyXwVu98.css`,
  ])
  assert.equal(requests.length, 5)
  assert.ok(requests.every((request) => request.startsWith(pageUrl)))
})

test('retries a stale artifact and succeeds after propagation', async () => {
  let attempt = 0
  const sleeps = []
  const result = await smokeTestPages({
    pageUrl,
    expectedCommit: commit,
    attempts: 3,
    retryDelayMs: 1,
    fetchImpl: async (input, init) => {
      const url = new URL(input)
      if (url.pathname.endsWith('/deployment.json')) attempt += 1
      return publishedFetch({ markerCommit: attempt === 1 ? 'stale' : commit })(input, init)
    },
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    log: () => {},
  })

  assert.equal(result.solverUrl, solverUrl)
  assert.deepEqual(sleeps, [1])
  assert.equal(attempt, 2)
})

test('fails with actionable diagnostics after the bounded attempts are exhausted', async () => {
  let rootRequests = 0
  await assert.rejects(
    smokeTestPages({
      pageUrl,
      expectedCommit: commit,
      attempts: 3,
      retryDelayMs: 1,
      fetchImpl: async (...args) => {
        rootRequests += 1
        return publishedFetch({ rootStatus: 503 })(...args)
      },
      sleep: async () => {},
      log: () => {},
    }),
    (error) => {
      assert.match(error.message, /unavailable or stale after 3 attempts/)
      assert.match(error.message, /returned HTTP 503/)
      assert.match(error.message, /re-run the workflow/)
      return true
    },
  )
  assert.equal(rootRequests, 3)
})

test('rejects unhashed production assets', async () => {
  await assert.rejects(
    verifyPublishedArtifact({
      pageUrl,
      expectedCommit: commit,
      fetchImpl: async (input) => {
        const url = new URL(input)
        if (url.pathname === '/one-more-map.github.io/') {
          return response(
            '<meta http-equiv="refresh" content="0; url=./allflame-voyage-solver/">',
            'text/html',
          )
        }
        return response(
          '<script src="./assets/index.js"></script><link rel="stylesheet" href="./assets/index.css">',
          'text/html',
        )
      },
    }),
    /does not reference a hashed JavaScript asset/,
  )
})

test('keeps the solver URL below a project Pages root', async () => {
  await assert.rejects(
    verifyPublishedArtifact({
      pageUrl,
      solverSubpath: '../other-site/',
      expectedCommit: commit,
      fetchImpl: publishedFetch(),
    }),
    /must stay below the published root/,
  )
})

test('verifies the package homepage is the app reached from the deployed Pages URL', async () => {
  const result = await verifyPublishedArtifact({
    pageUrl,
    expectedAppUrl: solverUrl,
    expectedCommit: commit,
    fetchImpl: publishedFetch(),
  })
  assert.equal(result.solverUrl, solverUrl)
  await assert.rejects(
    verifyPublishedArtifact({
      pageUrl,
      expectedAppUrl: 'https://example.test/wrong-prefix/allflame-voyage-solver/',
      expectedCommit: commit,
      fetchImpl: publishedFetch(),
    }),
    /does not match package homepage/,
  )
})
