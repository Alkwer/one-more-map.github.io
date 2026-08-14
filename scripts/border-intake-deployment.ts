export const CANONICAL_REPOSITORY = 'Alkwer/one-more-map.github.io'
export const CANONICAL_REF = 'refs/heads/main'
export const BORDER_INTAKE_ENDPOINT_ENV = 'BORDER_ROLL_INTAKE_URL'

const BASE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
]
const FINAL_CSP_DIRECTIVES = ["object-src 'none'", "base-uri 'self'"]

export interface BorderIntakeDeployment {
  endpoint: string
  connectOrigin: string | null
  configured: boolean
  target: 'canonical' | 'e2e' | 'unconfigured'
}

type DeploymentEnvironment = Record<string, string | undefined>

function configuredTarget(
  environment: DeploymentEnvironment,
  mode: string,
): BorderIntakeDeployment['target'] {
  if (mode === 'e2e') return 'e2e'
  const canonicalEvent =
    environment.GITHUB_EVENT_NAME === 'push' ||
    environment.GITHUB_EVENT_NAME === 'workflow_dispatch'
  return environment.GITHUB_REPOSITORY === CANONICAL_REPOSITORY &&
    environment.GITHUB_REF === CANONICAL_REF &&
    canonicalEvent
    ? 'canonical'
    : 'unconfigured'
}

function validatedEndpoint(rawEndpoint: string | undefined): URL {
  const endpoint = rawEndpoint?.trim()
  if (!endpoint) {
    throw new Error(`${BORDER_INTAKE_ENDPOINT_ENV} is required for this configured build.`)
  }

  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new Error(`${BORDER_INTAKE_ENDPOINT_ENV} must be an absolute HTTPS URL.`)
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search
  ) {
    throw new Error(
      `${BORDER_INTAKE_ENDPOINT_ENV} must be an absolute HTTPS URL without credentials, query, or fragment.`,
    )
  }
  return parsed
}

export function resolveBorderIntakeDeployment(
  environment: DeploymentEnvironment,
  mode = 'production',
): BorderIntakeDeployment {
  const target = configuredTarget(environment, mode)
  if (target === 'unconfigured') {
    return { endpoint: '', connectOrigin: null, configured: false, target }
  }

  const endpoint = validatedEndpoint(environment[BORDER_INTAKE_ENDPOINT_ENV])
  return {
    endpoint: endpoint.href,
    connectOrigin: endpoint.origin,
    configured: true,
    target,
  }
}

export function borderIntakeContentSecurityPolicy(deployment: BorderIntakeDeployment): string {
  const connectSources = ["'self'", deployment.connectOrigin].filter(Boolean).join(' ')
  return [...BASE_CSP_DIRECTIVES, `connect-src ${connectSources}`, ...FINAL_CSP_DIRECTIVES].join(
    '; ',
  )
}
