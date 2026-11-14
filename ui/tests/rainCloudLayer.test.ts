import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateSync } from 'node:zlib'
import {
  blurRainTileTexture,
  buildGibsDomainsUrl,
  buildRainCloudFragmentShaderSource,
  buildRainCloudVertexShaderSource,
  buildRainTileUrl,
  computeRainCloudLayerOpacity,
  decodeGibsIndexedPng,
  DEFAULT_RAIN_BASE_OPACITY,
  formatRainLookbackLabel,
  mapRgbaToRainSnow,
  MAX_RAIN_TILE_ZOOM,
  MIN_RAIN_TILE_ZOOM,
  normalizeRainCoveringTiles,
  parseGibsDomainsXml,
  RAIN_FADE_END_ZOOM,
  RAIN_FADE_IN_END_ZOOM,
  RAIN_FADE_IN_START_ZOOM,
  RAIN_FADE_START_ZOOM,
  RAIN_DOT_BASE_GRID_CELLS,
  RAIN_DOT_BASE_SPACING_CSS_PX,
  RAIN_DOT_COLOR_MODE,
  RAIN_DOT_INTENSITY_CUTOFF,
  RAIN_DOT_MIN_RADIUS_CSS_PX,
  RAIN_DOT_RADIUS_CSS_PX,
  RAIN_SOLO_OPACITY_MULTIPLIER,
  RAIN_TEXTURE_SIZE,
  RAIN_TILE_GUTTER,
  RAIN_TILE_INNER_SIZE,
  resolveRainObservationTime,
  snapRainLookbackMinutes,
  stitchRainTileGutter,
} from '../src/utils/rainCloudShader.ts'

function createSyntheticIndexedPng(
  paletteRgb: readonly [number, number, number][],
  alphaTable: readonly number[],
  pixelIndexFn: (x: number, y: number) => number,
  filterType = 0,
): Uint8Array {
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, RAIN_TILE_INNER_SIZE)
  ihdrView.setUint32(4, RAIN_TILE_INNER_SIZE)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 3 // indexed-color
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const plte = new Uint8Array(paletteRgb.length * 3)
  for (let i = 0; i < paletteRgb.length; i++) {
    plte[i * 3] = paletteRgb[i][0]
    plte[i * 3 + 1] = paletteRgb[i][1]
    plte[i * 3 + 2] = paletteRgb[i][2]
  }

  const trns = Uint8Array.from(alphaTable)

  const rawScanlines = new Uint8Array(RAIN_TILE_INNER_SIZE * (RAIN_TILE_INNER_SIZE + 1))
  let prevRow = new Uint8Array(RAIN_TILE_INNER_SIZE)
  for (let y = 0; y < RAIN_TILE_INNER_SIZE; y++) {
    const rowStart = y * (RAIN_TILE_INNER_SIZE + 1)
    rawScanlines[rowStart] = filterType
    const currRow = new Uint8Array(RAIN_TILE_INNER_SIZE)
    for (let x = 0; x < RAIN_TILE_INNER_SIZE; x++) {
      const idx = pixelIndexFn(x, y) & 0xff
      currRow[x] = idx
      if (filterType === 0) {
        rawScanlines[rowStart + 1 + x] = idx
      } else if (filterType === 1) {
        const left = x > 0 ? currRow[x - 1] : 0
        rawScanlines[rowStart + 1 + x] = (idx - left) & 0xff
      } else if (filterType === 2) {
        rawScanlines[rowStart + 1 + x] = (idx - prevRow[x]) & 0xff
      }
    }
    prevRow = currRow
  }

  const idat = new Uint8Array(deflateSync(rawScanlines))

  const makeChunk = (type: string, data: Uint8Array): Uint8Array => {
    const chunk = new Uint8Array(12 + data.length)
    const view = new DataView(chunk.buffer)
    view.setUint32(0, data.length)
    for (let i = 0; i < 4; i++) {
      chunk[4 + i] = type.charCodeAt(i)
    }
    chunk.set(data, 8)
    return chunk
  }

  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks = [
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('PLTE', plte),
    makeChunk('tRNS', trns),
    makeChunk('IDAT', idat),
    makeChunk('IEND', new Uint8Array(0)),
  ]
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
  const png = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
    png.set(c, offset)
    offset += c.length
  }
  return png
}

test('computeRainCloudLayerOpacity stays hidden at z<=6 and blends smoothly across z6..z14.5', () => {
  const soloPeak = Math.min(1, DEFAULT_RAIN_BASE_OPACITY * RAIN_SOLO_OPACITY_MULTIPLIER)

  assert.equal(DEFAULT_RAIN_BASE_OPACITY, 1)
  assert.equal(soloPeak, 1)
  assert.equal(RAIN_FADE_IN_START_ZOOM, 6)
  assert.equal(RAIN_FADE_IN_END_ZOOM, 9)
  assert.equal(computeRainCloudLayerOpacity(0), 0)
  assert.equal(computeRainCloudLayerOpacity(3), 0)
  assert.equal(computeRainCloudLayerOpacity(RAIN_FADE_IN_START_ZOOM), 0)

  const midRamp = computeRainCloudLayerOpacity(7.5)
  assert.ok(Math.abs(midRamp - 0.5) < 1e-9)

  assert.ok(Math.abs(computeRainCloudLayerOpacity(RAIN_FADE_IN_END_ZOOM) - 1) < 1e-9)
  assert.ok(Math.abs(computeRainCloudLayerOpacity(RAIN_FADE_START_ZOOM) - 1) < 1e-9)

  const midFade = computeRainCloudLayerOpacity(12.75)
  assert.ok(Math.abs(midFade - 0.5) < 1e-9)

  assert.equal(computeRainCloudLayerOpacity(RAIN_FADE_END_ZOOM), 0)
  assert.equal(computeRainCloudLayerOpacity(18), 0)
  assert.equal(computeRainCloudLayerOpacity(9, 0), 0)
})

test('snapRainLookbackMinutes and formatRainLookbackLabel align arbitrary offsets to 30-minute PT30M increments', () => {
  assert.equal(snapRainLookbackMinutes(0), 0)
  assert.equal(snapRainLookbackMinutes(-45), 0)
  assert.equal(snapRainLookbackMinutes(Number.NaN), 0)
  assert.equal(snapRainLookbackMinutes(16), 30)
  assert.equal(snapRainLookbackMinutes(14), 0)
  assert.equal(snapRainLookbackMinutes(90), 90)
  assert.equal(snapRainLookbackMinutes(232), 240)
  assert.equal(snapRainLookbackMinutes(9999), 1440)

  assert.equal(formatRainLookbackLabel(0), 'Latest')
  assert.equal(formatRainLookbackLabel(30), '-30m')
  assert.equal(formatRainLookbackLabel(90), '-1h 30m')
  assert.equal(formatRainLookbackLabel(240), '-4h')
  assert.equal(formatRainLookbackLabel(1440), '-24h')
})

test('parseGibsDomainsXml and resolveRainObservationTime handle default latest, -4h step back, date shorthand, and interval gaps', () => {
  const xml = `
    <Domains>
      <DimensionDomain>
        <ows:Identifier>time</ows:Identifier>
        <Domain>2026-11-11T14:30:00Z/2026-11-13/PT30M</Domain>
        <Domain>2026-11-13T04:00:00Z/2026-11-14T08:30:00Z/PT30M</Domain>
      </DimensionDomain>
    </Domains>
  `
  const intervals = parseGibsDomainsXml(xml)
  assert.equal(intervals.length, 2)
  assert.equal(intervals[0].endMs, Date.parse('2026-11-13T00:00:00Z'))
  assert.equal(intervals[1].endMs, Date.parse('2026-11-14T08:30:00Z'))

  const latest = resolveRainObservationTime(0, intervals)
  assert.equal(latest.timeParam, 'default')
  assert.equal(latest.effectiveTimeMs, Date.parse('2026-11-14T08:30:00Z'))
  assert.equal(latest.latestAvailableMs, Date.parse('2026-11-14T08:30:00Z'))

  const fourHoursBack = resolveRainObservationTime(240, intervals)
  assert.equal(fourHoursBack.timeParam, '2026-11-14T04:30:00Z')
  assert.equal(fourHoursBack.effectiveTimeMs, Date.parse('2026-11-14T04:30:00Z'))
  assert.equal(fourHoursBack.lookbackMinutes, 240)

  // Gap between 2026-11-13T00:00:00Z and 2026-11-13T04:00:00Z when stepping far back snaps to nearest available slot.
  const singleGapIntervals = parseGibsDomainsXml(
    '<Domains><DimensionDomain><Domain>2026-11-14T00:00:00Z/2026-11-14T02:00:00Z/PT30M</Domain><Domain>2026-11-14T05:00:00Z/2026-11-14T06:00:00Z/PT30M</Domain></DimensionDomain></Domains>',
  )
  // Latest = 06:00Z; -3h = 03:00Z -> closer to 02:00Z (1h away) than 05:00Z (2h away)
  const snappedAcrossGap = resolveRainObservationTime(180, singleGapIntervals)
  assert.equal(snappedAcrossGap.timeParam, '2026-11-14T02:00:00Z')

  // Empty intervals fallback still resolves 'default' at 0 and quantized UTC ISO at >0.
  const nowMs = Date.UTC(2026, 10, 14, 14, 15, 0)
  assert.equal(resolveRainObservationTime(0, [], nowMs).timeParam, 'default')
  assert.equal(resolveRainObservationTime(240, [], nowMs).timeParam, '2026-11-14T04:30:00Z')

  assert.equal(
    buildRainTileUrl(6, 35, 20, fourHoursBack.timeParam),
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/2026-11-14T04:30:00Z/GoogleMapsCompatible_Level6/6/20/35.png',
  )
  assert.match(buildGibsDomainsUrl(nowMs), /all\/2026-11-11T14:00:00Z--2026-11-15T14:30:00Z\.xml$/)
})

test('decodeGibsIndexedPng and mapRgbaToRainSnow ignore gray transparent entries and decode Rain/Snow rates cleanly', async () => {
  assert.deepEqual(mapRgbaToRainSnow(128, 128, 128, 0), [0, 0])
  assert.deepEqual(mapRgbaToRainSnow(191, 191, 191, 0), [0, 0])

  // Index 0/1 transparent gray; Index 2 = Rain min (0,118,78); Index 3 = Rain mid (255,152,15);
  // Index 4 = Rain max (51,0,0); Index 5 = Snow min (177,250,238); Index 6 = Snow max (58,3,48).
  const palette: [number, number, number][] = [
    [128, 128, 128],
    [191, 191, 191],
    [0, 118, 78],
    [255, 152, 15],
    [51, 0, 0],
    [177, 250, 238],
    [58, 3, 48],
  ]
  const alphas = [0, 0, 255, 255, 255, 255, 255]

  const png = createSyntheticIndexedPng(
    palette,
    alphas,
    (x, y) => {
      if (y === 0 && x === 0) return 0
      if (y === 0 && x === 1) return 1
      if (y === 0 && x === 2) return 2
      if (y === 0 && x === 3) return 3
      if (y === 0 && x === 4) return 4
      if (y === 0 && x === 5) return 5
      if (y === 0 && x === 6) return 6
      return 0
    },
    1,
  )

  const decoded = await decodeGibsIndexedPng(png)
  assert.ok(decoded !== null)
  assert.equal(decoded.length, RAIN_TILE_INNER_SIZE * RAIN_TILE_INNER_SIZE * 2)

  // Transparent entries must decode strictly to [0, 0]
  assert.deepEqual([decoded[0], decoded[1]], [0, 0])
  assert.deepEqual([decoded[2], decoded[3]], [0, 0])

  // Rain min/mid/max -> R > 0, G = 0
  assert.ok(decoded[4] > 0 && decoded[5] === 0)
  assert.ok(decoded[6] > decoded[4] && decoded[7] === 0)
  assert.equal(decoded[8], 255)
  assert.equal(decoded[9], 0)

  // Snow min/max -> R = 0, G > 0
  assert.ok(decoded[10] === 0 && decoded[11] > 0)
  assert.equal(decoded[12], 0)
  assert.equal(decoded[13], 255)
})

test('stitchRainTileGutter fills 2px gutter from wrapped horizontal and vertical neighbors and clamps missing edges', () => {
  const makeFilledTile = (rain: number, snow: number): Uint8Array => {
    const buf = new Uint8Array(RAIN_TILE_INNER_SIZE * RAIN_TILE_INNER_SIZE * 2)
    for (let i = 0; i < RAIN_TILE_INNER_SIZE * RAIN_TILE_INNER_SIZE; i++) {
      buf[i * 2] = rain
      buf[i * 2 + 1] = snow
    }
    return buf
  }

  const center = makeFilledTile(100, 10)
  const westWrappedNeighbor = makeFilledTile(200, 20) // x=1, y=0 when center is z=1, x=0, y=0
  const southNeighbor = makeFilledTile(150, 30) // x=0, y=1

  const stitched = stitchRainTileGutter(
    center,
    (_z, tx, ty) => {
      if (tx === 1 && ty === 0) return westWrappedNeighbor
      if (tx === 0 && ty === 1) return southNeighbor
      return null
    },
    1,
    0,
    0,
  )

  assert.equal(stitched.length, RAIN_TEXTURE_SIZE * RAIN_TEXTURE_SIZE * 2)
  const readRg = (ox: number, oy: number) => {
    const idx = (oy * RAIN_TEXTURE_SIZE + ox) * 2
    return [stitched[idx], stitched[idx + 1]]
  }

  const eastStart = RAIN_TILE_GUTTER + RAIN_TILE_INNER_SIZE
  const southStart = RAIN_TILE_GUTTER + RAIN_TILE_INNER_SIZE
  const maxTexIdx = RAIN_TEXTURE_SIZE - 1

  // Inner pixel (ox=gutter, oy=gutter) -> center
  assert.deepEqual(readRg(RAIN_TILE_GUTTER, RAIN_TILE_GUTTER), [100, 10])
  // West gutter at (ox=0..gutter-1, oy=gutter+8) -> wraps across antimeridian to (z=1, x=1, y=0)
  assert.deepEqual(readRg(0, RAIN_TILE_GUTTER + 8), [200, 20])
  assert.deepEqual(readRg(RAIN_TILE_GUTTER - 1, RAIN_TILE_GUTTER + 8), [200, 20])
  // North pole edge (ox=gutter+8, oy=0) at y=0 -> clamps cleanly to center
  assert.deepEqual(readRg(RAIN_TILE_GUTTER + 8, 0), [100, 10])
  // South gutter (ox=gutter+8, oy=southStart..maxTexIdx) -> samples southNeighbor
  assert.deepEqual(readRg(RAIN_TILE_GUTTER + 8, southStart), [150, 30])
  assert.deepEqual(readRg(RAIN_TILE_GUTTER + 8, maxTexIdx), [150, 30])
  // East gutter (ox=eastStart, oy=gutter+8) where (x=1, y=0) IS present -> west/east both point to x=1 at z=1
  assert.deepEqual(readRg(eastStart, RAIN_TILE_GUTTER + 8), [200, 20])
  // Missing diagonal neighbor (x=1, y=1) at corner (ox=maxTexIdx, oy=maxTexIdx) -> falls back safely to center
  assert.deepEqual(readRg(maxTexIdx, maxTexIdx), [100, 10])
})

test('blurRainTileTexture creates a wide monotonic gradient and exact agreement across shared tile seams', () => {
  const makeFilledTile = (rain: number, snow: number): Uint8Array => {
    const buf = new Uint8Array(RAIN_TILE_INNER_SIZE * RAIN_TILE_INNER_SIZE * 2)
    for (let i = 0; i < RAIN_TILE_INNER_SIZE * RAIN_TILE_INNER_SIZE; i++) {
      buf[i * 2] = rain
      buf[i * 2 + 1] = snow
    }
    return buf
  }

  // Two adjacent tiles at z=1, y=0: west tile (x=0) is dry [0,0], east tile (x=1) is heavy rain [255,0].
  const dryWestTile = makeFilledTile(0, 0)
  const wetEastTile = makeFilledTile(255, 0)
  const lookup = (_z: number, tx: number, ty: number) => {
    if (ty !== 0) return null
    return tx === 0 ? dryWestTile : wetEastTile
  }

  const stitchedWest = stitchRainTileGutter(dryWestTile, lookup, 1, 0, 0)
  const stitchedEast = stitchRainTileGutter(wetEastTile, lookup, 1, 1, 0)

  const blurredWest = blurRainTileTexture(stitchedWest)
  const blurredEast = blurRainTileTexture(stitchedEast)
  assert.equal(blurredWest.length, RAIN_TEXTURE_SIZE * RAIN_TEXTURE_SIZE * 2)

  const row = RAIN_TILE_GUTTER + Math.floor(RAIN_TILE_INNER_SIZE / 2)
  const sampleWestR = (ox: number) => blurredWest[(row * RAIN_TEXTURE_SIZE + ox) * 2]
  const sampleEastR = (ox: number) => blurredEast[(row * RAIN_TEXTURE_SIZE + ox) * 2]

  // Check wide monotonic transition band across the x=255 | x=0 seam (> 10 texels wide)
  const seamStart = RAIN_TILE_GUTTER + RAIN_TILE_INNER_SIZE - 14
  const seamEnd = RAIN_TILE_GUTTER + RAIN_TILE_INNER_SIZE - 1
  for (let ox = seamStart; ox < seamEnd; ox++) {
    assert.ok(sampleWestR(ox) <= sampleWestR(ox + 1) + 1e-6)
  }
  const activeTransitionCols = Array.from(
    { length: 28 },
    (_, i) => sampleWestR(RAIN_TILE_GUTTER + RAIN_TILE_INNER_SIZE - 14 + i),
  ).filter((v) => v > 0.02 && v < 0.98)
  assert.ok(activeTransitionCols.length > 10, `expected wide blur zone (>10 texels), got ${activeTransitionCols.length}`)

  // Compare overlapping post-blur texels around the shared boundary:
  // West inner right edge (ox = gutter + 255) == East left gutter -1 (ox = gutter - 1), and
  // West right gutter +0 (ox = gutter + 256) == East inner left edge (ox = gutter)
  const westInnerEdge = sampleWestR(RAIN_TILE_GUTTER + RAIN_TILE_INNER_SIZE - 1)
  const eastLeftGutter = sampleEastR(RAIN_TILE_GUTTER - 1)
  const westRightGutter = sampleWestR(RAIN_TILE_GUTTER + RAIN_TILE_INNER_SIZE)
  const eastInnerEdge = sampleEastR(RAIN_TILE_GUTTER)
  assert.ok(Math.abs(westInnerEdge - eastLeftGutter) < 1e-6)
  assert.ok(Math.abs(westRightGutter - eastInnerEdge) < 1e-6)
  assert.ok(westInnerEdge < 0.5 && eastInnerEdge > 0.5)
})

test('normalizeRainCoveringTiles locks source tiles to z=3 and WebGL2 shaders match wide-gutter B-spline spec', () => {
  assert.equal(MIN_RAIN_TILE_ZOOM, 3)
  assert.equal(MAX_RAIN_TILE_ZOOM, 3)
  assert.ok(RAIN_DOT_BASE_SPACING_CSS_PX >= 18.5)
  assert.equal(RAIN_DOT_BASE_GRID_CELLS % 8, 0)
  assert.ok(RAIN_DOT_MIN_RADIUS_CSS_PX < RAIN_DOT_RADIUS_CSS_PX)
  assert.ok(RAIN_DOT_RADIUS_CSS_PX <= 1.85)
  const expanded = normalizeRainCoveringTiles([
    { canonical: { z: 2, x: 0, y: 0 }, wrap: 0 },
    { canonical: { z: 3, x: 6, y: 3 }, wrap: 0 },
    { canonical: { z: 4, x: 12, y: 6 }, wrap: 0 },
    { canonical: { z: 6, x: 48, y: 24 }, wrap: 0 },
  ])
  assert.equal(expanded.length, 5)
  assert.ok(expanded.every((t) => t.canonical.z === 3))

  const vertexSource = buildRainCloudVertexShaderSource({
    vertexShaderPrelude: 'vec4 projectTile(vec2 p, vec2 r) { return vec4(p, 0.0, 1.0); }',
    define: '#define GLOBE',
  })
  assert.match(vertexSource, /^#version 300 es/)
  assert.match(vertexSource, /uniform vec2 u_tileOrigin;/)
  assert.match(vertexSource, /out vec2 v_worldMercator;/)
  assert.match(
    vertexSource,
    new RegExp(
      `\\(${RAIN_TILE_GUTTER.toFixed(1).replace('.', '\\.')} \\+ inSourceTile \\* ${RAIN_TILE_INNER_SIZE.toFixed(1).replace('.', '\\.')}\\) \\/ ${RAIN_TEXTURE_SIZE.toFixed(1).replace('.', '\\.')}`,
    ),
  )

  assert.equal(RAIN_DOT_COLOR_MODE, 'solid')
  assert.equal(RAIN_DOT_INTENSITY_CUTOFF, 0.3)

  const fragmentSource = buildRainCloudFragmentShaderSource({
    vertexShaderPrelude: '',
    define: '#define GLOBE',
  })
  assert.match(fragmentSource, /^#version 300 es/)
  assert.match(fragmentSource, /sampleCubicBSpline/)
  assert.match(fragmentSource, /evaluateZoomOctaveDots/)
  assert.match(fragmentSource, /vec3\(0\.302,\s*0\.588,\s*1\.000\)/)
  assert.match(fragmentSource, /0\.3000/)
  assert.doesNotMatch(fragmentSource, /evaluateRainbowDotColor/)
  assert.match(fragmentSource, /evaluateExperimentalCloudBackdrop/)
  assert.match(fragmentSource, /uniform float u_zoom;/)
  assert.match(fragmentSource, /smoothstep\(6\.00,\s*9\.00,\s*u_zoom\)/)
  assert.match(fragmentSource, /if \(v_depth > 1\.0\) discard;/)

  const dFdxIndex = fragmentSource.indexOf('dFdx(v_worldMercator)')
  const dFdyIndex = fragmentSource.indexOf('dFdy(v_worldMercator)')
  const firstDiscardIndex = fragmentSource.indexOf('discard;')
  assert.ok(dFdxIndex > 0 && dFdyIndex > 0 && firstDiscardIndex > 0)
  assert.ok(dFdxIndex < firstDiscardIndex && dFdyIndex < firstDiscardIndex)

  const rainbowSource = buildRainCloudFragmentShaderSource(
    {
      vertexShaderPrelude: '',
      define: '#define GLOBE',
    },
    { colorMode: 'rainbow' },
  )
  assert.match(rainbowSource, /evaluateRainbowDotColor/)

  const whiteNoBackdropSource = buildRainCloudFragmentShaderSource(
    {
      vertexShaderPrelude: '',
      define: '#define GLOBE',
    },
    {
      colorMode: 'white',
      intensityCutoff: 0.55,
      enableCloudBackdrop: false,
    },
  )
  assert.match(whiteNoBackdropSource, /vec3\(0\.973,\s*0\.980,\s*0\.988\)/)
  assert.match(whiteNoBackdropSource, /0\.5500/)
  assert.doesNotMatch(whiteNoBackdropSource, /evaluateRainbowDotColor/)
  assert.doesNotMatch(whiteNoBackdropSource, /evaluateExperimentalCloudBackdrop/)
})
