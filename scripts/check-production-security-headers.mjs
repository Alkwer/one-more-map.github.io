import { antiFramingHeaderProblems } from '../src/securityHeaders.ts'

const target = process.argv[2] ?? process.env.PRODUCTION_URL

if (!target) {
  console.error('Usage: npm run check:production-headers -- https://deployed.example/app/')
  process.exitCode = 2
} else {
  try {
    await checkProductionSecurityHeaders(target)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

async function checkProductionSecurityHeaders(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid production URL: ${rawUrl}`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`Production URL must use HTTPS: ${url}`)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  timeout.unref()
  let response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'allflame-production-security-gate/1.0' },
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    throw new Error(`Expected a successful response from ${url}; received ${response.status}`)
  }
  if (!response.url.startsWith('https://')) {
    throw new Error(`Final response URL must use HTTPS: ${response.url}`)
  }

  const problems = antiFramingHeaderProblems(response.headers)
  if (problems.length > 0) {
    throw new Error(
      `Anti-framing header check failed for ${response.url}:\n- ${problems.join('\n- ')}`,
    )
  }

  console.log(`Anti-framing headers verified at ${response.url}`)
}
