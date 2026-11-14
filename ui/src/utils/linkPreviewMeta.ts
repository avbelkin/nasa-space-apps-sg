export const LINK_PREVIEW_SITE_NAME = 'Earth Fire Calendar'

export const LINK_PREVIEW_TITLE =
  'Earth Fire Calendar — MODIS & VIIRS Active Fires'

export const LINK_PREVIEW_DESCRIPTION =
  'Explore recent NASA FIRMS fire detections from MODIS and VIIRS and follow their satellite tracks on an interactive 3D globe.'

export const LINK_PREVIEW_IMAGE_FILENAME = 'og-preview.png'
export const LINK_PREVIEW_IMAGE_WIDTH = 1200
export const LINK_PREVIEW_IMAGE_HEIGHT = 630

export const LINK_PREVIEW_IMAGE_ALT =
  '3D Earth horizon at night with glowing MODIS and VIIRS active-fire hotspot clusters and polar satellite orbital swaths for Earth Fire Calendar.'

export const LINK_PREVIEW_THEME_COLOR = '#090f1d'

export interface LinkPreviewUrlOptions {
  siteUrl?: string
  basePath?: string
}

export interface ResolvedLinkPreviewUrls {
  canonicalUrl: string | null
  imageUrl: string
  basePath: string
}

/**
 * Normalizes a Vite base path so it always starts and ends with '/'.
 */
export function normalizeBasePath(rawBasePath?: string): string {
  const trimmed = rawBasePath?.trim() ?? ''
  if (!trimmed || trimmed === '/') {
    return '/'
  }
  const stripped = trimmed.replace(/^\/+|\/+$/g, '')
  return stripped ? `/${stripped}/` : '/'
}

/**
 * Resolves absolute canonical and social-preview image URLs when a valid HTTP(S)
 * siteUrl is provided, falling back to a base-path-relative image URL otherwise.
 */
export function resolveLinkPreviewUrls(
  options: LinkPreviewUrlOptions = {},
): ResolvedLinkPreviewUrls {
  const basePath = normalizeBasePath(options.basePath)
  const rawSiteUrl = options.siteUrl?.trim() ?? ''

  if (rawSiteUrl) {
    let parsed: URL | null = null
    try {
      parsed = new URL(rawSiteUrl)
    } catch {
      parsed = null
    }

    if (parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
      if (parsed.pathname === '/' && basePath !== '/') {
        parsed.pathname = basePath
      } else if (!parsed.pathname.endsWith('/')) {
        parsed.pathname = `${parsed.pathname}/`
      }
      parsed.search = ''
      parsed.hash = ''

      const canonicalUrl = parsed.toString()
      const imageUrl = new URL(LINK_PREVIEW_IMAGE_FILENAME, canonicalUrl).toString()
      return {
        canonicalUrl,
        imageUrl,
        basePath,
      }
    }
  }

  return {
    canonicalUrl: null,
    imageUrl: `${basePath}${LINK_PREVIEW_IMAGE_FILENAME}`,
    basePath,
  }
}

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function replaceMetaContentAttribute(
  html: string,
  attrName: 'property' | 'name',
  attrValue: string,
  nextContent: string,
): string {
  const escapedContent = escapeHtmlAttr(nextContent)
  const tagRegex = new RegExp(
    `(<meta\\b[^>]*\\b${attrName}=["']${attrValue}["'][^>]*\\bcontent=["'])([^"']*)(["'][^>]*>)`,
    'i',
  )
  if (tagRegex.test(html)) {
    return html.replace(tagRegex, `$1${escapedContent}$3`)
  }
  const contentFirstRegex = new RegExp(
    `(<meta\\b[^>]*\\bcontent=["'])([^"']*)(["'][^>]*\\b${attrName}=["']${attrValue}["'][^>]*>)`,
    'i',
  )
  return html.replace(contentFirstRegex, `$1${escapedContent}$3`)
}

/**
 * Rewrites social link preview image tags and injects canonical / og:url tags
 * into index.html when an absolute canonical URL is resolved.
 */
export function applyLinkPreviewHtmlTransform(
  html: string,
  urls: ResolvedLinkPreviewUrls,
): string {
  let result = replaceMetaContentAttribute(html, 'property', 'og:image', urls.imageUrl)
  result = replaceMetaContentAttribute(result, 'name', 'twitter:image', urls.imageUrl)

  if (!urls.canonicalUrl) {
    return result
  }

  const escapedCanonicalUrl = escapeHtmlAttr(urls.canonicalUrl)
  const ogUrlRegex = /<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/i
  if (ogUrlRegex.test(result)) {
    result = replaceMetaContentAttribute(result, 'property', 'og:url', urls.canonicalUrl)
  } else {
    const ogDescMatch = /<meta\b[^>]*\bproperty=["']og:description["'][^>]*>/i.exec(result)
    if (ogDescMatch) {
      const insertAt = ogDescMatch.index + ogDescMatch[0].length
      result =
        result.slice(0, insertAt) +
        `\n    <meta property="og:url" content="${escapedCanonicalUrl}" />` +
        result.slice(insertAt)
    } else {
      result = result.replace(
        /<\/head>/i,
        `    <meta property="og:url" content="${escapedCanonicalUrl}" />\n  </head>`,
      )
    }
  }

  const canonicalLinkRegex = /(<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["'])([^"']*)(["'][^>]*>)/i
  if (canonicalLinkRegex.test(result)) {
    result = result.replace(canonicalLinkRegex, `$1${escapedCanonicalUrl}$3`)
  } else {
    result = result.replace(
      /<\/head>/i,
      `    <link rel="canonical" href="${escapedCanonicalUrl}" />\n  </head>`,
    )
  }

  return result
}
