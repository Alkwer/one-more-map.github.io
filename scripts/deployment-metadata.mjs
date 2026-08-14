export const DEFAULT_CANONICAL_ORIGIN = 'https://alkwer.github.io'
export const DEFAULT_PRODUCTION_SITE_PREFIX = '/one-more-map.github.io/'
export const APP_DIRECTORY = 'allflame-voyage-solver'

export function sitePrefixSegments(value) {
  const segments = value.split('/').filter(Boolean)
  if (
    segments.some(
      (segment) => segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment),
    )
  ) {
    throw new Error(`Invalid site prefix: ${value}`)
  }
  return segments
}

export function canonicalAppUrl(sitePrefix, canonicalOrigin = DEFAULT_CANONICAL_ORIGIN) {
  const origin = new URL(canonicalOrigin)
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error(`Invalid canonical origin: ${canonicalOrigin}`)
  }

  const prefix = sitePrefixSegments(sitePrefix)
  return new URL([...prefix, APP_DIRECTORY, ''].join('/'), origin).href
}

export function setCanonicalLink(html, canonicalUrl, sourceName) {
  const pattern = /<link\s+rel="canonical"\s+href="[^"]+"\s*\/?\s*>/gi
  const matches = html.match(pattern) ?? []
  if (matches.length !== 1) {
    throw new Error(
      `${sourceName} must contain exactly one canonical link; found ${matches.length}.`,
    )
  }
  return html.replace(pattern, `<link rel="canonical" href="${canonicalUrl}" />`)
}
