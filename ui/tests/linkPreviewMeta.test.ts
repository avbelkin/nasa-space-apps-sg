import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  applyLinkPreviewHtmlTransform,
  LINK_PREVIEW_DESCRIPTION,
  LINK_PREVIEW_IMAGE_ALT,
  LINK_PREVIEW_IMAGE_HEIGHT,
  LINK_PREVIEW_IMAGE_WIDTH,
  LINK_PREVIEW_SITE_NAME,
  LINK_PREVIEW_TITLE,
  normalizeBasePath,
  resolveLinkPreviewUrls,
} from '../src/utils/linkPreviewMeta.ts'

test('normalizeBasePath handles empty, root, and repo subpaths consistently', () => {
  assert.equal(normalizeBasePath(undefined), '/')
  assert.equal(normalizeBasePath(''), '/')
  assert.equal(normalizeBasePath('   '), '/')
  assert.equal(normalizeBasePath('/'), '/')
  assert.equal(normalizeBasePath('nasa-space-apps-sg'), '/nasa-space-apps-sg/')
  assert.equal(normalizeBasePath('/nasa-space-apps-sg'), '/nasa-space-apps-sg/')
  assert.equal(normalizeBasePath('/nasa-space-apps-sg/'), '/nasa-space-apps-sg/')
})

test('resolveLinkPreviewUrls produces exact absolute URLs without duplicating repo subpath', () => {
  const pagesFull = resolveLinkPreviewUrls({
    siteUrl: 'https://avbelkin.github.io/nasa-space-apps-sg',
    basePath: '/nasa-space-apps-sg/',
  })
  assert.equal(pagesFull.canonicalUrl, 'https://avbelkin.github.io/nasa-space-apps-sg/')
  assert.equal(
    pagesFull.imageUrl,
    'https://avbelkin.github.io/nasa-space-apps-sg/og-preview.png',
  )
  assert.equal(pagesFull.basePath, '/nasa-space-apps-sg/')

  const originOnly = resolveLinkPreviewUrls({
    siteUrl: 'https://avbelkin.github.io',
    basePath: '/nasa-space-apps-sg/',
  })
  assert.equal(originOnly.canonicalUrl, 'https://avbelkin.github.io/nasa-space-apps-sg/')
  assert.equal(
    originOnly.imageUrl,
    'https://avbelkin.github.io/nasa-space-apps-sg/og-preview.png',
  )
})

test('resolveLinkPreviewUrls falls back cleanly when siteUrl is empty or invalid', () => {
  const rootRelative = resolveLinkPreviewUrls({ basePath: '/' })
  assert.equal(rootRelative.canonicalUrl, null)
  assert.equal(rootRelative.imageUrl, '/og-preview.png')

  const subpathRelative = resolveLinkPreviewUrls({
    siteUrl: '',
    basePath: '/nasa-space-apps-sg/',
  })
  assert.equal(subpathRelative.canonicalUrl, null)
  assert.equal(subpathRelative.imageUrl, '/nasa-space-apps-sg/og-preview.png')

  const malformed = resolveLinkPreviewUrls({
    siteUrl: 'not-a-valid-url',
    basePath: '/nasa-space-apps-sg/',
  })
  assert.equal(malformed.canonicalUrl, null)
  assert.equal(malformed.imageUrl, '/nasa-space-apps-sg/og-preview.png')

  const nonHttp = resolveLinkPreviewUrls({
    siteUrl: 'javascript:alert(1)',
    basePath: '/',
  })
  assert.equal(nonHttp.canonicalUrl, null)
  assert.equal(nonHttp.imageUrl, '/og-preview.png')
})

test('ui/index.html declares approved link preview metadata and transforms cleanly for deployment', () => {
  const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')

  assert.match(indexHtml, /<title>Earth Fire Calendar<\/title>/)
  assert.match(indexHtml, new RegExp(`property="og:site_name"\\s+content="${LINK_PREVIEW_SITE_NAME}"`))
  assert.match(indexHtml, /property="og:title"\s+content="Earth Fire Calendar — MODIS &amp; VIIRS Active Fires"/)
  assert.match(indexHtml, /name="twitter:card"\s+content="summary_large_image"/)
  assert.match(indexHtml, new RegExp(`property="og:image:width"\\s+content="${LINK_PREVIEW_IMAGE_WIDTH}"`))
  assert.match(indexHtml, new RegExp(`property="og:image:height"\\s+content="${LINK_PREVIEW_IMAGE_HEIGHT}"`))
  assert.ok(indexHtml.includes(LINK_PREVIEW_DESCRIPTION))
  assert.ok(indexHtml.includes(LINK_PREVIEW_IMAGE_ALT))
  assert.equal(LINK_PREVIEW_TITLE.startsWith(LINK_PREVIEW_SITE_NAME), true)

  const deployedHtml = applyLinkPreviewHtmlTransform(
    indexHtml,
    resolveLinkPreviewUrls({
      siteUrl: 'https://avbelkin.github.io/nasa-space-apps-sg',
      basePath: '/nasa-space-apps-sg/',
    }),
  )
  assert.match(
    deployedHtml,
    /<meta property="og:url" content="https:\/\/avbelkin\.github\.io\/nasa-space-apps-sg\/" \/>/,
  )
  assert.match(
    deployedHtml,
    /<link rel="canonical" href="https:\/\/avbelkin\.github\.io\/nasa-space-apps-sg\/" \/>/,
  )
  assert.match(
    deployedHtml,
    /<meta property="og:image" content="https:\/\/avbelkin\.github\.io\/nasa-space-apps-sg\/og-preview\.png" \/>/,
  )
  assert.match(
    deployedHtml,
    /<meta name="twitter:image" content="https:\/\/avbelkin\.github\.io\/nasa-space-apps-sg\/og-preview\.png" \/>/,
  )

  const localHtml = applyLinkPreviewHtmlTransform(
    indexHtml,
    resolveLinkPreviewUrls({ basePath: '/' }),
  )
  assert.doesNotMatch(localHtml, /property="og:url"/)
  assert.doesNotMatch(localHtml, /rel="canonical"/)
  assert.match(localHtml, /<meta property="og:image" content="\/og-preview\.png" \/>/)
  assert.match(localHtml, /<meta name="twitter:image" content="\/og-preview\.png" \/>/)
})

test('ui/public/og-preview.png exists as a 1200x630 PNG image', () => {
  const pngBuffer = fs.readFileSync(
    new URL('../public/og-preview.png', import.meta.url),
  )
  const pngSignature = pngBuffer.subarray(0, 8)
  assert.deepEqual(
    [...pngSignature],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  )
  assert.equal(pngBuffer.readUInt32BE(16), 1200)
  assert.equal(pngBuffer.readUInt32BE(20), 630)
})
