import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1]
}

function requiredTag(html, tagName, key, value) {
  const tags = (html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) ?? []).filter(
    (tag) => attribute(tag, key) === value,
  )
  if (tags.length !== 1)
    throw new Error(`Expected exactly one ${value} metadata tag; found ${tags.length}`)
  return tags[0]
}

function metaContent(html, key, value) {
  const content = attribute(requiredTag(html, 'meta', key, value), 'content')
  if (!content?.trim()) throw new Error(`Empty ${value} metadata`)
  return content
}

export function setAppSocialUrls(html, canonicalUrl) {
  let result = html
  for (const [key, value, content] of [
    ['property', 'og:url', canonicalUrl],
    ['property', 'og:image', new URL('social-preview.png', canonicalUrl).href],
    ['name', 'twitter:image', new URL('social-preview.png', canonicalUrl).href],
  ]) {
    const tag = requiredTag(result, 'meta', key, value)
    result = result.replace(tag, tag.replace(/content="[^"]*"/i, `content="${content}"`))
  }
  return result
}

export function assertAppMetadata(html, canonicalUrl) {
  const expectedTitle = 'Allflame Voyage Solver - PoE 3.29'
  if (!html.includes(`<title>${expectedTitle}</title>`)) throw new Error('Missing product title')
  const canonical = attribute(requiredTag(html, 'link', 'rel', 'canonical'), 'href')
  if (canonical !== canonicalUrl) throw new Error(`Canonical URL does not match ${canonicalUrl}`)
  const description = metaContent(html, 'name', 'description')
  if (description.length < 40 || description.length > 160)
    throw new Error('Description must have 40-160 characters')
  if (metaContent(html, 'name', 'theme-color') !== '#0a0908')
    throw new Error('Missing app theme color')
  if (metaContent(html, 'property', 'og:type') !== 'website')
    throw new Error('Missing website Open Graph type')
  if (metaContent(html, 'property', 'og:url') !== canonicalUrl)
    throw new Error('Open Graph URL does not match canonical')
  if (metaContent(html, 'name', 'twitter:card') !== 'summary_large_image')
    throw new Error('Missing Twitter image card')
  for (const [key, value] of [
    ['property', 'og:site_name'],
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['property', 'og:image:alt'],
    ['name', 'twitter:title'],
    ['name', 'twitter:description'],
    ['name', 'twitter:image:alt'],
  ])
    metaContent(html, key, value)
  for (const [key, value] of [
    ['property', 'og:image'],
    ['name', 'twitter:image'],
  ]) {
    if (metaContent(html, key, value) !== new URL('social-preview.png', canonicalUrl).href) {
      throw new Error(`${value} must resolve below the canonical app URL`)
    }
  }
  const icon = attribute(requiredTag(html, 'link', 'rel', 'icon'), 'href')
  if (!icon || new URL(icon, canonicalUrl).href !== new URL('favicon.svg', canonicalUrl).href) {
    throw new Error('Favicon must resolve below the app URL')
  }
  if (
    metaContent(html, 'property', 'og:image:width') !== '1200' ||
    metaContent(html, 'property', 'og:image:height') !== '630'
  ) {
    throw new Error('Social image dimensions must be 1200x630')
  }
}

export async function assertStagedAppMetadata(appDirectory, canonicalUrl) {
  assertAppMetadata(await readFile(join(appDirectory, 'index.html'), 'utf8'), canonicalUrl)
  const favicon = await readFile(join(appDirectory, 'favicon.svg'), 'utf8')
  if (!favicon.includes('<svg')) throw new Error('Staged favicon is not an SVG')
  const preview = await readFile(join(appDirectory, 'social-preview.png'))
  if (
    preview.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    preview.readUInt32BE(16) !== 1200 ||
    preview.readUInt32BE(20) !== 630
  ) {
    throw new Error('Staged social preview must be a 1200x630 PNG')
  }
}
