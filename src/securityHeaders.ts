type HeadersLike = Pick<Headers, 'get'>

export interface SecurityHeaders {
  [name: string]: string
  'Content-Security-Policy': string
  'X-Frame-Options': string
}

export function antiFramingContentSecurityPolicy(contentSecurityPolicy: string): string {
  const directives = contentSecurityPolicy
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean)
  if (
    directives.some(
      (directive) => directive.split(/\s+/, 1)[0]?.toLowerCase() === 'frame-ancestors',
    )
  ) {
    throw new Error('Base Content-Security-Policy must not define frame-ancestors')
  }
  return [...directives, "frame-ancestors 'none'"].join('; ')
}

export function productionSecurityHeaders(contentSecurityPolicy: string): SecurityHeaders {
  return {
    'Content-Security-Policy': antiFramingContentSecurityPolicy(contentSecurityPolicy),
    'X-Frame-Options': 'DENY',
  }
}

export function antiFramingHeaderProblems(headers: HeadersLike): string[] {
  const problems: string[] = []
  const xFrameOptions = headers.get('x-frame-options')?.trim()
  if (xFrameOptions?.toUpperCase() !== 'DENY') {
    problems.push('X-Frame-Options must be exactly DENY')
  }

  const policy = headers.get('content-security-policy') ?? ''
  const frameAncestorDirectives = policy
    .split(';')
    .map((directive) => directive.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter((directive) => directive.split(' ', 1)[0] === 'frame-ancestors')

  if (
    frameAncestorDirectives.length !== 1 ||
    frameAncestorDirectives[0] !== "frame-ancestors 'none'"
  ) {
    problems.push("Content-Security-Policy must contain exactly frame-ancestors 'none'")
  }

  return problems
}

export function renderStaticHeadersConfig(contentSecurityPolicy: string): string {
  const headers = productionSecurityHeaders(contentSecurityPolicy)
  return [
    '/*',
    `  Content-Security-Policy: ${headers['Content-Security-Policy']}`,
    `  X-Frame-Options: ${headers['X-Frame-Options']}`,
    '',
  ].join('\n')
}

export function parseStaticHeadersConfig(config: string): SecurityHeaders {
  const lines = config.split(/\r?\n/)
  if (lines.shift()?.trim() !== '/*') {
    throw new Error('Static security headers must apply to /*')
  }

  const values = new Map<string, string>()
  for (const line of lines) {
    if (!line.trim()) continue
    const separator = line.indexOf(':')
    if (separator < 0) throw new Error(`Malformed static security header: ${line}`)
    const name = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (values.has(name)) throw new Error(`Duplicate static security header: ${name}`)
    values.set(name, value)
  }

  if (
    values.size !== 2 ||
    !values.has('content-security-policy') ||
    !values.has('x-frame-options')
  ) {
    throw new Error('Static security headers must define only CSP and X-Frame-Options')
  }

  const headers = new Headers(Object.fromEntries(values))
  const problems = antiFramingHeaderProblems(headers)
  if (problems.length > 0) throw new Error(problems.join('; '))

  return {
    'Content-Security-Policy': values.get('content-security-policy')!,
    'X-Frame-Options': values.get('x-frame-options')!,
  }
}
