import {
  computeGlobeSubdivisionGranularity,
  computeTileSubUv,
  type CloudCoveringTile,
  type CloudShaderVariantData,
} from './satelliteCloudShader.ts'

export { computeGlobeSubdivisionGranularity, computeTileSubUv }

export const GIBS_WMTS_BASE_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
export const GIBS_IMERG_LAYER_ID = 'IMERG_Precipitation_Rate_30min'
export const GIBS_IMERG_TILE_MATRIX_SET = 'GoogleMapsCompatible_Level6'

export const MIN_RAIN_TILE_ZOOM = 3
export const MAX_RAIN_TILE_ZOOM = 3
export const RAIN_TILE_INNER_SIZE = 256
export const RAIN_TILE_GUTTER = 24
export const RAIN_TEXTURE_SIZE = RAIN_TILE_INNER_SIZE + RAIN_TILE_GUTTER * 2
export const RAIN_BLUR_RADIUS = 5
export const RAIN_BLUR_PASSES = 3

export const DEFAULT_RAIN_BASE_OPACITY = 1
export const RAIN_FADE_IN_START_ZOOM = 6
export const RAIN_FADE_IN_END_ZOOM = 9
export const RAIN_SOLO_OPACITY_MULTIPLIER = 1
export const RAIN_FADE_START_ZOOM = 11
export const RAIN_FADE_END_ZOOM = 14.5

export type RainDotColorMode = 'rainbow' | 'white'
export const RAIN_DOT_COLOR_MODE: RainDotColorMode = 'rainbow'
export const RAIN_DOT_INTENSITY_CUTOFF = 0.02
export const RAIN_DOT_FULL_OPACITY_INTENSITY = 0.72
export const ENABLE_RAIN_CLOUD_BACKDROP = true
export const RAIN_CLOUD_BACKDROP_MAX_OPACITY = 0.22
export const RAIN_DOT_BASE_GRID_CELLS = 32
export const RAIN_DOT_BASE_SPACING_CSS_PX = 21.5
export const RAIN_DOT_MIN_RADIUS_CSS_PX = 1.45
export const RAIN_DOT_RADIUS_CSS_PX = 1.75

export interface RainShaderBuildOptions {
  colorMode?: RainDotColorMode
  intensityCutoff?: number
  fullOpacityIntensity?: number
  enableCloudBackdrop?: boolean
}

export const RAIN_REFRESH_INTERVAL_MS = 10 * 60 * 1000
export const RAIN_TIME_STEP_MINUTES = 30
export const RAIN_TIME_STEP_MS = RAIN_TIME_STEP_MINUTES * 60 * 1000
export const MAX_RAIN_LOOKBACK_MINUTES = 24 * 60
export const DEFAULT_RAIN_FALLBACK_LAG_MS = 5.5 * 60 * 60 * 1000

export const RAIN_LOOKBACK_PRESETS = [
  { minutes: 0, label: 'Latest' },
  { minutes: 30, label: '-30m' },
  { minutes: 60, label: '-1h' },
  { minutes: 120, label: '-2h' },
  { minutes: 240, label: '-4h' },
  { minutes: 360, label: '-6h' },
  { minutes: 720, label: '-12h' },
  { minutes: 1440, label: '-24h' },
] as const

export interface GibsTimeInterval {
  startMs: number
  endMs: number
  stepMs: number
}

export interface ResolvedRainTime {
  timeParam: string
  effectiveTimeMs: number | null
  latestAvailableMs: number | null
  lookbackMinutes: number
}

export interface RainLayerMetadata {
  latestAvailableIso: string | null
  effectiveTimeIso: string | null
  lookbackMinutes: number
}

// Exact 220-color hex LUT from https://gibs.earthdata.nasa.gov/colormaps/v1.3/GPM_Precipitation_Rate.xml
// Indices 0..109 (ref 2..111) = Rain Rate 0.1..53.1+ mm/hr; indices 110..219 (ref 112..221) = Snow Rate 0.1..53.1+ mm/hr.
const GPM_PRECIP_HEX_LUT =
  '00764e00784b007b48007e4500814200833e00863a008936008c32008e2e00912900942400971f00991a009c14009f0f00a20900a50303a70009aa00' +
  '10ad0017b0001eb20026b5002db80035bb003dbd0045c0004ec30056c6005fc80068cb0072ce007bd10085d4008fd60099d900a3dc00aedf00b8e100' +
  'c3e400cfe700daea00e6ec00efed00f2e600f5e000f7d900fad200fdca00ffc201ffb904ffb006ffa809ffa00cff980fff9011ff8814ff8117ff7a1a' +
  'ff731cff6c1fff6522ff5f25ff5927ff532aff4d2dff4730ff4233ff342cff2626ff2020ff1a1aff1313ff0d0dff0707ff0101fa0000f30000ed0000' +
  'e70000e10000da0000d40000ce0000c80000c20000bb0000b50000af0000a90000a200009c00009600009000008a00008300007d0000770000710000' +
  '6a00006400005e00005800005200004b00004500003f0000390000330000b1faeeaefaefaaf9efa7f8f0a4f8f1a1f7f29ef6f39bf5f498f4f495f1f3' +
  '92eef28febf18ce7f089e4ef86e0ee84dded81d9ec7ed5ea7cd1e979cde876c9e674c5e571c1e46fbde26db8e16ab4df68b0dd66abdc63a7da61a2d8' +
  '5f9ed75d99d55b95d35990d1578ccf5587cd5383cb517ec94f7ac74d75c54f73c44d70c54c6dc64b6ac74a66c94963ca485fcb465ccc4558cd4454ce' +
  '4350d0424cd14048d23f44d33e40d43f3dd5413cd7433bd84539d94838da4a37db4d36dc5035de5334df5632e05931e15c30e25f2fe4632ee5662de6' +
  '6a2be76a25e86a1fe86b19e96d14e96f12e57010e1720fdd740dd9750cd5770bd1780acc790ac77a0ac17a09bc7b09b77b09b27b09ac7a08a77a08a2' +
  '79089d78089877079276078d74078872068370067d6e06786c067369056e6605696305635e045d59045654044f4f044849034244033c3f03363a0330'

const GPM_ENTRY_COUNT = GPM_PRECIP_HEX_LUT.length / 6
const GPM_RAIN_COUNT = 110
const NEAREST_COLOR_TOLERANCE = 9

interface GpmLutEntry {
  r: number
  g: number
  b: number
  rain: number
  snow: number
}

let cachedExactLut: Map<number, readonly [number, number]> | null = null
let cachedLutEntries: GpmLutEntry[] | null = null

function ensureGpmLut(): {
  exact: Map<number, readonly [number, number]>
  entries: GpmLutEntry[]
} {
  if (cachedExactLut && cachedLutEntries) {
    return { exact: cachedExactLut, entries: cachedLutEntries }
  }

  const exact = new Map<number, readonly [number, number]>()
  const entries: GpmLutEntry[] = []

  for (let k = 0; k < GPM_ENTRY_COUNT; k++) {
    const offset = k * 6
    const r = Number.parseInt(GPM_PRECIP_HEX_LUT.slice(offset, offset + 2), 16)
    const g = Number.parseInt(GPM_PRECIP_HEX_LUT.slice(offset + 2, offset + 4), 16)
    const b = Number.parseInt(GPM_PRECIP_HEX_LUT.slice(offset + 4, offset + 6), 16)
    const rain =
      k < GPM_RAIN_COUNT ? Math.max(4, Math.round(((k + 1) / GPM_RAIN_COUNT) * 255)) : 0
    const snow =
      k >= GPM_RAIN_COUNT
        ? Math.max(4, Math.round(((k - GPM_RAIN_COUNT + 1) / GPM_RAIN_COUNT) * 255))
        : 0

    exact.set((r << 16) | (g << 8) | b, [rain, snow])
    entries.push({ r, g, b, rain, snow })
  }

  cachedExactLut = exact
  cachedLutEntries = entries
  return { exact, entries }
}

/**
 * Maps an RGBA pixel from NASA GIBS GPM_Precipitation_Rate tiles into normalized
 * `[rainByte, snowByte]` intensities, ignoring transparent RGB fill values (`idx 0/1`).
 */
export function mapRgbaToRainSnow(
  r: number,
  g: number,
  b: number,
  a: number,
): readonly [number, number] {
  if (a < 16) {
    return [0, 0]
  }
  const { exact, entries } = ensureGpmLut()
  const key = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
  const hit = exact.get(key)
  if (hit) {
    return hit
  }

  let bestDist = NEAREST_COLOR_TOLERANCE + 1
  let bestPair: readonly [number, number] = [0, 0]
  for (const entry of entries) {
    const dist = Math.abs(r - entry.r) + Math.abs(g - entry.g) + Math.abs(b - entry.b)
    if (dist < bestDist) {
      bestDist = dist
      bestPair = [entry.rain, entry.snow]
      if (dist === 0) {
        break
      }
    }
  }
  return bestDist <= NEAREST_COLOR_TOLERANCE ? bestPair : [0, 0]
}

/**
 * Rain clouds stay hidden at global/regional zooms (z <= 6), blend in smoothly across z6..z9
 * as regular VIS/IR clouds fade out, hold across z9..z11, and gently fade out by z14.5.
 */
export function computeRainCloudLayerOpacity(
  zoom: number,
  baseOpacity: number = DEFAULT_RAIN_BASE_OPACITY,
): number {
  if (
    !Number.isFinite(zoom) ||
    !Number.isFinite(baseOpacity) ||
    baseOpacity <= 0 ||
    zoom <= RAIN_FADE_IN_START_ZOOM ||
    zoom >= RAIN_FADE_END_ZOOM
  ) {
    return 0
  }

  const clampedBase = Math.min(1, baseOpacity)
  const soloPeak = Math.min(1, clampedBase * RAIN_SOLO_OPACITY_MULTIPLIER)

  if (zoom < RAIN_FADE_IN_END_ZOOM) {
    const fadeIn =
      (zoom - RAIN_FADE_IN_START_ZOOM) / (RAIN_FADE_IN_END_ZOOM - RAIN_FADE_IN_START_ZOOM)
    return soloPeak * Math.max(0, Math.min(1, fadeIn))
  }
  if (zoom <= RAIN_FADE_START_ZOOM) {
    return soloPeak
  }

  const fadeFactor =
    (RAIN_FADE_END_ZOOM - zoom) / (RAIN_FADE_END_ZOOM - RAIN_FADE_START_ZOOM)
  return soloPeak * Math.max(0, Math.min(1, fadeFactor))
}

/**
 * Expands lower-zoom covering tiles (e.g. z=0..2 on pitched horizons) into z=3 source
 * quads so only z3 IMERG tiles are fetched and rendered without horizon gaps.
 */
export function normalizeRainCoveringTiles(
  tiles: readonly CloudCoveringTile[],
): CloudCoveringTile[] {
  const normalized: CloudCoveringTile[] = []
  const seen = new Set<string>()

  const pushUnique = (z: number, x: number, y: number, wrap: number) => {
    const key = `${wrap}:${z}/${x}/${y}`
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    normalized.push({ canonical: { z, x, y }, wrap })
  }

  for (const tile of tiles) {
    const { z, x, y } = tile.canonical
    if (z < 0 || z > MAX_RAIN_TILE_ZOOM) {
      continue
    }
    if (z < MIN_RAIN_TILE_ZOOM) {
      const shift = MIN_RAIN_TILE_ZOOM - z
      const span = 1 << shift
      const baseX = x << shift
      const baseY = y << shift
      for (let dy = 0; dy < span; dy++) {
        for (let dx = 0; dx < span; dx++) {
          pushUnique(MIN_RAIN_TILE_ZOOM, baseX + dx, baseY + dy, tile.wrap)
        }
      }
    } else {
      pushUnique(z, x, y, tile.wrap)
    }
  }

  return normalized
}

export function snapRainLookbackMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 0
  }
  const snapped = Math.round(minutes / RAIN_TIME_STEP_MINUTES) * RAIN_TIME_STEP_MINUTES
  return Math.min(MAX_RAIN_LOOKBACK_MINUTES, Math.max(0, snapped))
}

export function formatRainLookbackLabel(minutes: number): string {
  const snapped = snapRainLookbackMinutes(minutes)
  if (snapped === 0) {
    return 'Latest'
  }
  const hours = Math.floor(snapped / 60)
  const mins = snapped % 60
  if (hours > 0 && mins > 0) {
    return `-${hours}h ${mins}m`
  }
  if (hours > 0) {
    return `-${hours}h`
  }
  return `-${mins}m`
}

export function formatGibsIsoTimestamp(unixMs: number): string {
  const roundedMs = Math.round(unixMs / 60_000) * 60_000
  return `${new Date(roundedMs).toISOString().slice(0, 16)}:00Z`
}

export function buildGibsDomainsUrl(nowMs: number = Date.now()): string {
  const startMs =
    Math.floor((nowMs - 72 * 3600_000) / RAIN_TIME_STEP_MS) * RAIN_TIME_STEP_MS
  const endMs =
    Math.ceil((nowMs + 24 * 3600_000) / RAIN_TIME_STEP_MS) * RAIN_TIME_STEP_MS
  const startIso = formatGibsIsoTimestamp(startMs)
  const endIso = formatGibsIsoTimestamp(endMs)
  return `${GIBS_WMTS_BASE_URL}/1.0.0/${GIBS_IMERG_LAYER_ID}/default/${GIBS_IMERG_TILE_MATRIX_SET}/all/${startIso}--${endIso}.xml`
}

function parseGibsTimestampMs(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : null
}

function parseIsoDurationMs(raw: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(raw.trim())
  if (!match) {
    return RAIN_TIME_STEP_MS
  }
  const days = match[1] ? Number(match[1]) : 0
  const hours = match[2] ? Number(match[2]) : 0
  const mins = match[3] ? Number(match[3]) : 0
  const secs = match[4] ? Number(match[4]) : 0
  const totalMs = ((days * 24 + hours) * 60 + mins) * 60_000 + secs * 1000
  return totalMs > 0 ? totalMs : RAIN_TIME_STEP_MS
}

export function parseGibsDomainsXml(xmlText: string): GibsTimeInterval[] {
  const intervals: GibsTimeInterval[] = []
  const domainMatches = xmlText.matchAll(/<Domain>([\s\S]*?)<\/Domain>/gi)

  for (const match of domainMatches) {
    const tokens = match[1]
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0)

    for (const token of tokens) {
      if (token.includes('/')) {
        const parts = token.split('/')
        const startMs = parseGibsTimestampMs(parts[0] ?? '')
        const endMs = parseGibsTimestampMs(parts[1] ?? '')
        const stepMs = parts[2] ? parseIsoDurationMs(parts[2]) : RAIN_TIME_STEP_MS
        if (startMs !== null && endMs !== null && startMs <= endMs && stepMs > 0) {
          intervals.push({ startMs, endMs, stepMs })
        }
      } else {
        const ts = parseGibsTimestampMs(token)
        if (ts !== null) {
          intervals.push({ startMs: ts, endMs: ts, stepMs: RAIN_TIME_STEP_MS })
        }
      }
    }
  }

  intervals.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  return intervals
}

/**
 * Resolves the GIBS `{Time}` path parameter for a requested lookback offset, defaulting
 * to `'default'` when `lookbackMinutes === 0` and snapping past offsets onto the nearest
 * available `PT30M` observation inside the parsed `<Domain>` intervals.
 */
export function resolveRainObservationTime(
  lookbackMinutes: number,
  intervals: readonly GibsTimeInterval[],
  nowMs: number = Date.now(),
): ResolvedRainTime {
  const snapped = snapRainLookbackMinutes(lookbackMinutes)

  if (intervals.length > 0) {
    let latestMs = intervals[0].endMs
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].endMs > latestMs) {
        latestMs = intervals[i].endMs
      }
    }

    if (snapped === 0) {
      return {
        timeParam: 'default',
        effectiveTimeMs: latestMs,
        latestAvailableMs: latestMs,
        lookbackMinutes: 0,
      }
    }

    const desiredMs = latestMs - snapped * 60_000
    let bestMs = latestMs
    let bestDiff = Number.POSITIVE_INFINITY

    for (const interval of intervals) {
      const clamped = Math.min(interval.endMs, Math.max(interval.startMs, desiredMs))
      const step = interval.stepMs > 0 ? interval.stepMs : RAIN_TIME_STEP_MS
      const stepsFromStart = Math.round((clamped - interval.startMs) / step)
      let candidate = interval.startMs + stepsFromStart * step
      if (candidate > interval.endMs) {
        candidate =
          interval.startMs + Math.floor((interval.endMs - interval.startMs) / step) * step
      }
      if (candidate < interval.startMs) {
        candidate = interval.startMs
      }
      const diff = Math.abs(candidate - desiredMs)
      if (diff < bestDiff || (diff === bestDiff && candidate > bestMs)) {
        bestDiff = diff
        bestMs = candidate
      }
    }

    return {
      timeParam: formatGibsIsoTimestamp(bestMs),
      effectiveTimeMs: bestMs,
      latestAvailableMs: latestMs,
      lookbackMinutes: snapped,
    }
  }

  if (snapped === 0) {
    return {
      timeParam: 'default',
      effectiveTimeMs: null,
      latestAvailableMs: null,
      lookbackMinutes: 0,
    }
  }

  const fallbackLatestMs =
    Math.floor((nowMs - DEFAULT_RAIN_FALLBACK_LAG_MS) / RAIN_TIME_STEP_MS) * RAIN_TIME_STEP_MS
  const bestMs = fallbackLatestMs - snapped * 60_000

  return {
    timeParam: formatGibsIsoTimestamp(bestMs),
    effectiveTimeMs: bestMs,
    latestAvailableMs: fallbackLatestMs,
    lookbackMinutes: snapped,
  }
}

export function buildRainTileUrl(
  z: number,
  x: number,
  y: number,
  timeParam: string = 'default',
): string {
  return `${GIBS_WMTS_BASE_URL}/${GIBS_IMERG_LAYER_ID}/default/${timeParam}/${GIBS_IMERG_TILE_MATRIX_SET}/${z}/${y}/${x}.png`
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) {
    return a
  }
  if (pb <= pc) {
    return b
  }
  return c
}

/**
 * Decodes an 8-bit indexed-color 256x256 NASA GIBS IMERG PNG directly via
 * `DecompressionStream('deflate')` into a continuous `[rain, snow]` `Uint8Array(256 * 256 * 2)`
 * scalar field so transparent gray fill indices never bleed into bilinear/spline filtering.
 * Returns `null` if the PNG is non-indexed or `DecompressionStream` is unavailable.
 */
export async function decodeGibsIndexedPng(pngBytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream !== 'function' || pngBytes.length < 33) {
    return null
  }

  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (pngBytes[i] !== PNG_SIGNATURE[i]) {
      return null
    }
  }

  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength)
  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let compression = 0
  let filter = 0
  let interlace = 0
  let hasIhdr = false
  let plte: Uint8Array | null = null
  let trns: Uint8Array | null = null
  const idats: Uint8Array[] = []
  let totalIdatBytes = 0

  while (pos + 12 <= pngBytes.length) {
    const chunkLen = view.getUint32(pos)
    const dataStart = pos + 8
    const dataEnd = dataStart + chunkLen
    if (dataEnd + 4 > pngBytes.length) {
      break
    }

    const type = String.fromCharCode(
      pngBytes[pos + 4],
      pngBytes[pos + 5],
      pngBytes[pos + 6],
      pngBytes[pos + 7],
    )
    const data = pngBytes.subarray(dataStart, dataEnd)

    if (type === 'IHDR' && chunkLen >= 13) {
      hasIhdr = true
      width = view.getUint32(dataStart)
      height = view.getUint32(dataStart + 4)
      bitDepth = data[8]
      colorType = data[9]
      compression = data[10]
      filter = data[11]
      interlace = data[12]
    } else if (type === 'PLTE') {
      plte = data
    } else if (type === 'tRNS') {
      trns = data
    } else if (type === 'IDAT') {
      idats.push(data)
      totalIdatBytes += chunkLen
    } else if (type === 'IEND') {
      break
    }

    pos = dataEnd + 4
  }

  if (
    !hasIhdr ||
    width !== RAIN_TILE_INNER_SIZE ||
    height !== RAIN_TILE_INNER_SIZE ||
    bitDepth !== 8 ||
    colorType !== 3 ||
    compression !== 0 ||
    filter !== 0 ||
    interlace !== 0 ||
    !plte ||
    idats.length === 0
  ) {
    return null
  }

  const paletteRg = new Uint8Array(256 * 2)
  const entryCount = Math.min(256, Math.floor(plte.length / 3))
  for (let i = 0; i < entryCount; i++) {
    const r = plte[i * 3]
    const g = plte[i * 3 + 1]
    const b = plte[i * 3 + 2]
    const a = trns && i < trns.length ? trns[i] : 255
    const [rain, snow] = mapRgbaToRainSnow(r, g, b, a)
    paletteRg[i * 2] = rain
    paletteRg[i * 2 + 1] = snow
  }

  const idatBuffer = new ArrayBuffer(totalIdatBytes)
  const merged = new Uint8Array(idatBuffer)
  let offset = 0
  for (const chunk of idats) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  let inflated: Uint8Array
  try {
    const decompressedStream = new Blob([idatBuffer])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'))
    inflated = new Uint8Array(await new Response(decompressedStream).arrayBuffer())
  } catch {
    return null
  }

  const stride = RAIN_TILE_INNER_SIZE + 1
  if (inflated.length < RAIN_TILE_INNER_SIZE * stride) {
    return null
  }

  const out = new Uint8Array(RAIN_TILE_INNER_SIZE * RAIN_TILE_INNER_SIZE * 2)
  let prevRow = new Uint8Array(RAIN_TILE_INNER_SIZE)
  let currRow = new Uint8Array(RAIN_TILE_INNER_SIZE)

  for (let y = 0; y < RAIN_TILE_INNER_SIZE; y++) {
    const rowStart = y * stride
    const filterType = inflated[rowStart]
    const rowBaseOut = y * RAIN_TILE_INNER_SIZE * 2

    for (let x = 0; x < RAIN_TILE_INNER_SIZE; x++) {
      const rawByte = inflated[rowStart + 1 + x]
      const a = x > 0 ? currRow[x - 1] : 0
      const b = prevRow[x]
      const c = x > 0 ? prevRow[x - 1] : 0

      let value: number
      if (filterType === 0) {
        value = rawByte
      } else if (filterType === 1) {
        value = (rawByte + a) & 0xff
      } else if (filterType === 2) {
        value = (rawByte + b) & 0xff
      } else if (filterType === 3) {
        value = (rawByte + ((a + b) >> 1)) & 0xff
      } else if (filterType === 4) {
        value = (rawByte + paethPredictor(a, b, c)) & 0xff
      } else {
        return null
      }

      currRow[x] = value
      out[rowBaseOut + x * 2] = paletteRg[value * 2]
      out[rowBaseOut + x * 2 + 1] = paletteRg[value * 2 + 1]
    }

    const tmp = prevRow
    prevRow = currRow
    currRow = tmp
  }

  return out
}

/**
 * Builds a 260x260 `RG` texture buffer (256x256 tile + 2px cross-tile neighbor gutter)
 * wrapping horizontally across the antimeridian and clamping at poles or missing neighbors.
 */
export function stitchRainTileGutter(
  centerRg: Uint8Array,
  getTileRg: (z: number, x: number, y: number) => Uint8Array | null,
  z: number,
  x: number,
  y: number,
): Uint8Array {
  const out = new Uint8Array(RAIN_TEXTURE_SIZE * RAIN_TEXTURE_SIZE * 2)
  const tilesPerAxis = 1 << z
  const totalPx = tilesPerAxis * RAIN_TILE_INNER_SIZE

  for (let ly = 0; ly < RAIN_TILE_INNER_SIZE; ly++) {
    const srcStart = ly * RAIN_TILE_INNER_SIZE * 2
    const dstStart = ((ly + RAIN_TILE_GUTTER) * RAIN_TEXTURE_SIZE + RAIN_TILE_GUTTER) * 2
    out.set(centerRg.subarray(srcStart, srcStart + RAIN_TILE_INNER_SIZE * 2), dstStart)
  }

  const writeBorderTexel = (ox: number, oy: number) => {
    const localX = ox - RAIN_TILE_GUTTER
    const localY = oy - RAIN_TILE_GUTTER
    const gx = x * RAIN_TILE_INNER_SIZE + localX
    const gy = y * RAIN_TILE_INNER_SIZE + localY
    const wrappedGx = ((gx % totalPx) + totalPx) % totalPx
    const clampedGy = Math.max(0, Math.min(totalPx - 1, gy))

    const tx = wrappedGx >> 8
    const ty = clampedGy >> 8
    const lx = wrappedGx & 255
    const ly = clampedGy & 255

    let srcTile = tx === x && ty === y ? centerRg : getTileRg(z, tx, ty)
    let sx = lx
    let sy = ly

    if (!srcTile) {
      srcTile = centerRg
      sx = Math.max(0, Math.min(RAIN_TILE_INNER_SIZE - 1, localX))
      sy = Math.max(0, Math.min(RAIN_TILE_INNER_SIZE - 1, localY))
    }

    const srcIdx = (sy * RAIN_TILE_INNER_SIZE + sx) * 2
    const dstIdx = (oy * RAIN_TEXTURE_SIZE + ox) * 2
    out[dstIdx] = srcTile[srcIdx]
    out[dstIdx + 1] = srcTile[srcIdx + 1]
  }

  for (let oy = 0; oy < RAIN_TEXTURE_SIZE; oy++) {
    if (oy < RAIN_TILE_GUTTER || oy >= RAIN_TILE_GUTTER + RAIN_TILE_INNER_SIZE) {
      for (let ox = 0; ox < RAIN_TEXTURE_SIZE; ox++) {
        writeBorderTexel(ox, oy)
      }
    } else {
      for (let ox = 0; ox < RAIN_TILE_GUTTER; ox++) {
        writeBorderTexel(ox, oy)
      }
      for (
        let ox = RAIN_TILE_GUTTER + RAIN_TILE_INNER_SIZE;
        ox < RAIN_TEXTURE_SIZE;
        ox++
      ) {
        writeBorderTexel(ox, oy)
      }
    }
  }

  return out
}

/**
 * Applies multi-pass separable box smoothing over a stitched RG tile texture,
 * approximating a wide isotropic Gaussian blur (`radius * passes <= RAIN_TILE_GUTTER`)
 * and returning normalized `[0..1]` float pairs for band-free `gl.RG16F` filtering.
 */
export function blurRainTileTexture(
  stitchedRg: Uint8Array,
  size = RAIN_TEXTURE_SIZE,
  radius = RAIN_BLUR_RADIUS,
  passes = RAIN_BLUR_PASSES,
): Float32Array {
  const len = size * size * 2
  const data = new Float32Array(len)
  const inv255 = 1 / 255
  for (let i = 0; i < len; i++) {
    data[i] = stitchedRg[i] * inv255
  }

  if (passes <= 0 || radius <= 0) {
    return data
  }

  const scratch = new Float32Array(len)
  const kernelSize = radius * 2 + 1
  const invKernel = 1 / kernelSize
  const maxCoord = size - 1

  for (let pass = 0; pass < passes; pass++) {
    // Horizontal pass: data -> scratch
    for (let y = 0; y < size; y++) {
      const rowOffset = y * size
      for (let x = 0; x < size; x++) {
        let sumR = 0
        let sumG = 0
        for (let k = -radius; k <= radius; k++) {
          const sx = Math.max(0, Math.min(maxCoord, x + k))
          const srcIdx = (rowOffset + sx) * 2
          sumR += data[srcIdx]
          sumG += data[srcIdx + 1]
        }
        const dstIdx = (rowOffset + x) * 2
        scratch[dstIdx] = sumR * invKernel
        scratch[dstIdx + 1] = sumG * invKernel
      }
    }

    // Vertical pass: scratch -> data
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        let sumR = 0
        let sumG = 0
        for (let k = -radius; k <= radius; k++) {
          const sy = Math.max(0, Math.min(maxCoord, y + k))
          const srcIdx = (sy * size + x) * 2
          sumR += scratch[srcIdx]
          sumG += scratch[srcIdx + 1]
        }
        const dstIdx = (y * size + x) * 2
        data[dstIdx] = sumR * invKernel
        data[dstIdx + 1] = sumG * invKernel
      }
    }
  }

  return data
}

export function buildRainCloudVertexShaderSource(shaderData: CloudShaderVariantData): string {
  const sourceTileGrid = 1 << MIN_RAIN_TILE_ZOOM
  return `#version 300 es
${shaderData.vertexShaderPrelude}
${shaderData.define}
layout(location = 0) in vec2 a_pos;
uniform vec2 u_uv_offset;
uniform float u_uv_scale;
uniform vec2 u_tileOrigin;
out vec2 v_textureCoord;
out vec2 v_worldMercator;
#ifdef GLOBE
out float v_depth;
#endif
void main() {
  vec2 inTile = a_pos / 8192.0;
#ifdef GLOBE
  if (a_pos.y < -32767.5) { inTile.y = 0.0; }
  if (a_pos.y > 32766.5) { inTile.y = 1.0; }
#endif
  vec2 inSourceTile = u_uv_offset + inTile * u_uv_scale;
  v_textureCoord = (${RAIN_TILE_GUTTER.toFixed(1)} + inSourceTile * ${RAIN_TILE_INNER_SIZE.toFixed(1)}) / ${RAIN_TEXTURE_SIZE.toFixed(1)};
  v_worldMercator = (u_tileOrigin + inSourceTile) / ${sourceTileGrid.toFixed(1)};
  gl_Position = projectTile(a_pos, a_pos);
#ifdef GLOBE
  v_depth = gl_Position.z / gl_Position.w;
#endif
}
`
}

/**
 * WebGL2 rain cloud shader using a 9-point isotropic ring of 4-tap hardware-bilinear
 * C2 Cubic B-Spline samples over 304x304 pre-blurred neighbor-stitched RG16F tiles,
 * rendering map-anchored zoom-octave staggered hex rain dots (rainbow calibration or white)
 * composited over an easily removable neutral overcast cloud backdrop across z6..z14.5.
 */
export function buildRainCloudFragmentShaderSource(
  shaderData: CloudShaderVariantData,
  options: RainShaderBuildOptions = {},
): string {
  const colorMode = options.colorMode ?? RAIN_DOT_COLOR_MODE
  const intensityCutoff = options.intensityCutoff ?? RAIN_DOT_INTENSITY_CUTOFF
  const fullOpacityIntensity = options.fullOpacityIntensity ?? RAIN_DOT_FULL_OPACITY_INTENSITY
  const enableCloudBackdrop = options.enableCloudBackdrop ?? ENABLE_RAIN_CLOUD_BACKDROP

  return `#version 300 es
precision highp float;
${shaderData.define}
uniform sampler2D u_tileTexture;
uniform float u_opacity;
uniform float u_zoom;
uniform float u_pixelRatio;
uniform float u_enableCloudBackdrop;
in vec2 v_textureCoord;
in vec2 v_worldMercator;
#ifdef GLOBE
in float v_depth;
#endif
out vec4 fragColor;

const float TEXTURE_PIXEL_SIZE = ${RAIN_TEXTURE_SIZE.toFixed(1)};
const float MIN_PRECIP_SIGNAL = 0.002;
const float BLUR_RING_RADIUS = 3.2;
const float DIAG_OFFSET = 2.2627417;
const vec2 HEX_STEP = vec2(1.0, 1.73205081);
const vec2 HEX_HALF = HEX_STEP * 0.5;

vec2 sampleCubicBSpline(vec2 uv) {
  vec2 coord = uv * TEXTURE_PIXEL_SIZE - 0.5;
  vec2 index = floor(coord);
  vec2 t = coord - index;
  vec2 oneMinusT = 1.0 - t;
  vec2 w0 = (oneMinusT * oneMinusT * oneMinusT) / 6.0;
  vec2 t2 = t * t;
  vec2 t3 = t2 * t;
  vec2 w1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
  vec2 w3 = t3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = ((index - 1.0) + w1 / g0 + 0.5) / TEXTURE_PIXEL_SIZE;
  vec2 h1 = ((index + 1.0) + w3 / g1 + 0.5) / TEXTURE_PIXEL_SIZE;
  vec2 s00 = texture(u_tileTexture, vec2(h0.x, h0.y)).rg;
  vec2 s10 = texture(u_tileTexture, vec2(h1.x, h0.y)).rg;
  vec2 s01 = texture(u_tileTexture, vec2(h0.x, h1.y)).rg;
  vec2 s11 = texture(u_tileTexture, vec2(h1.x, h1.y)).rg;
  vec2 sy0 = mix(s10, s00, g0.x);
  vec2 sy1 = mix(s11, s01, g0.x);
  return mix(sy1, sy0, g0.y);
}

float sampleHexLatticeMask(vec2 worldMercator, float freq, float worldPerCssPx, float radiusCssPx) {
  vec2 p = worldMercator * freq;
  vec2 a = mod(p + HEX_HALF, HEX_STEP) - HEX_HALF;
  vec2 b = mod(p, HEX_STEP) - HEX_HALF;
  vec2 nearest = (dot(a, a) < dot(b, b)) ? a : b;
  float distCells = length(nearest);
  float cellsPerCssPx = freq * worldPerCssPx;
  float radiusCells = min(0.38, radiusCssPx * cellsPerCssPx);
  float aaCells = max(1.05 * cellsPerCssPx, 1e-5);
  return 1.0 - smoothstep(radiusCells - aaCells * 0.5, radiusCells + aaCells * 0.5, distCells);
}

float evaluateZoomOctaveDots(vec2 worldMercator, float worldPerCssPx, float radiusCssPx) {
  float idealScale = 1.0 / (${RAIN_DOT_BASE_SPACING_CSS_PX.toFixed(2)} * ${RAIN_DOT_BASE_GRID_CELLS.toFixed(1)} * worldPerCssPx);
  float octave = clamp(log2(max(idealScale, 1.0)), 0.0, 18.0);
  float k0 = floor(octave);
  float fracOctave = octave - k0;
  float freq0 = ${RAIN_DOT_BASE_GRID_CELLS.toFixed(1)} * exp2(k0);
  float freq1 = freq0 * 2.0;
  float mask0 = sampleHexLatticeMask(worldMercator, freq0, worldPerCssPx, radiusCssPx);
  float subFade = smoothstep(0.48, 0.92, fracOctave);
  if (subFade <= 0.001) {
    return mask0;
  }
  float mask1 = sampleHexLatticeMask(worldMercator, freq1, worldPerCssPx, radiusCssPx);
  return max(mask0, mask1 * subFade);
}
${
  colorMode === 'rainbow'
    ? `
vec3 evaluateRainbowDotColor(float v) {
  vec3 c0 = vec3(0.231, 0.510, 0.965);
  vec3 c1 = vec3(0.024, 0.714, 0.831);
  vec3 c2 = vec3(0.133, 0.773, 0.369);
  vec3 c3 = vec3(0.918, 0.702, 0.031);
  vec3 c4 = vec3(0.937, 0.267, 0.267);
  vec3 c5 = vec3(0.910, 0.475, 0.976);

  if (v < 0.15) {
    return c0;
  }
  if (v < 0.35) {
    return mix(c0, c1, smoothstep(0.15, 0.35, v));
  }
  if (v < 0.50) {
    return mix(c1, c2, smoothstep(0.35, 0.50, v));
  }
  if (v < 0.62) {
    return mix(c2, c3, smoothstep(0.50, 0.62, v));
  }
  if (v < 0.75) {
    return mix(c3, c4, smoothstep(0.62, 0.75, v));
  }
  return mix(c4, c5, smoothstep(0.75, 0.88, v));
}
`
    : ''
}${
  enableCloudBackdrop
    ? `
vec4 evaluateExperimentalCloudBackdrop(float total, float relief, float soloMode) {
  vec3 neutralCloud = mix(vec3(0.48, 0.53, 0.60), vec3(0.74, 0.79, 0.85), relief);
  float feather = smoothstep(MIN_PRECIP_SIGNAL, 0.24, total);
  float alpha = feather * mix(0.05, ${RAIN_CLOUD_BACKDROP_MAX_OPACITY.toFixed(3)}, pow(total, 0.85)) * mix(0.65, 1.0, soloMode);
  return vec4(neutralCloud, clamp(alpha, 0.0, 1.0));
}
`
    : ''
}
void main() {
  // Derivatives must be evaluated in uniform control flow before any discard.
  vec2 dxW = dFdx(v_worldMercator);
  vec2 dyW = dFdy(v_worldMercator);
  float worldPerDevicePx = sqrt(0.5 * (dot(dxW, dxW) + dot(dyW, dyW)));
  float safePixelRatio = max(u_pixelRatio, 0.5);
  float worldPerCssPx = max(worldPerDevicePx * safePixelRatio, 1e-8);

#ifdef GLOBE
  if (v_depth > 1.0) discard;
#endif
  float r = BLUR_RING_RADIUS / TEXTURE_PIXEL_SIZE;
  float d = DIAG_OFFSET / TEXTURE_PIXEL_SIZE;

  vec2 sC = sampleCubicBSpline(v_textureCoord);
  vec2 sE = sampleCubicBSpline(v_textureCoord + vec2(r, 0.0));
  vec2 sW = sampleCubicBSpline(v_textureCoord - vec2(r, 0.0));
  vec2 sN = sampleCubicBSpline(v_textureCoord - vec2(0.0, r));
  vec2 sS = sampleCubicBSpline(v_textureCoord + vec2(0.0, r));
  vec2 sNE = sampleCubicBSpline(v_textureCoord + vec2(d, -d));
  vec2 sNW = sampleCubicBSpline(v_textureCoord + vec2(-d, -d));
  vec2 sSE = sampleCubicBSpline(v_textureCoord + vec2(d, d));
  vec2 sSW = sampleCubicBSpline(v_textureCoord + vec2(-d, d));

  vec2 blurred =
    sC * 0.24 +
    (sE + sW + sN + sS) * 0.11 +
    (sNE + sNW + sSE + sSW) * 0.08;

  float rain = pow(clamp(blurred.r * 1.65, 0.0, 1.0), 0.78);
  float snow = pow(clamp(blurred.g * 1.65, 0.0, 1.0), 0.78);
  float total = max(rain, snow);
  if (total < MIN_PRECIP_SIGNAL) discard;

  float mE = max(sE.r, sE.g);
  float mW = max(sW.r, sW.g);
  float mN = max(sN.r, sN.g);
  float mS = max(sS.r, sS.g);
  float mNE = max(sNE.r, sNE.g);
  float mNW = max(sNW.r, sNW.g);
  float mSE = max(sSE.r, sSE.g);
  float mSW = max(sSW.r, sSW.g);
  float dX = (mE + 0.70710678 * (mNE + mSE)) - (mW + 0.70710678 * (mNW + mSW));
  float dY = (mS + 0.70710678 * (mSE + mSW)) - (mN + 0.70710678 * (mNE + mNW));
  float relief = clamp(0.5 + dX * 0.65 + dY * 0.85, 0.0, 1.0);

  float soloMode = smoothstep(${RAIN_FADE_IN_START_ZOOM.toFixed(2)}, ${RAIN_FADE_IN_END_ZOOM.toFixed(2)}, u_zoom);

  float normIntensity = clamp(
    (total - ${intensityCutoff.toFixed(4)}) / max(1e-4, ${(fullOpacityIntensity - intensityCutoff).toFixed(4)}),
    0.0,
    1.0
  );
  float dotStrength = smoothstep(0.0, 1.0, normIntensity);
  float radiusCssPx = mix(${RAIN_DOT_MIN_RADIUS_CSS_PX.toFixed(2)}, ${RAIN_DOT_RADIUS_CSS_PX.toFixed(2)}, dotStrength);
  float dotMask = (dotStrength > 0.001) ? evaluateZoomOctaveDots(v_worldMercator, worldPerCssPx, radiusCssPx) : 0.0;
  vec3 dotColor = ${colorMode === 'white' ? 'vec3(0.973, 0.980, 0.988)' : 'evaluateRainbowDotColor(total)'};
  float dotA = clamp(dotStrength * dotMask * u_opacity, 0.0, 1.0);

  ${
    enableCloudBackdrop
      ? 'vec4 backdrop = (u_enableCloudBackdrop > 0.5) ? evaluateExperimentalCloudBackdrop(total, relief, soloMode) : vec4(0.0);'
      : 'vec4 backdrop = vec4(0.0);'
  }
  float backA = clamp(backdrop.a * u_opacity, 0.0, 1.0);
  float outAlpha = dotA + backA * (1.0 - dotA);
  if (outAlpha <= 0.001) discard;

  vec3 outPremul = dotColor * dotA + backdrop.rgb * backA * (1.0 - dotA);
  fragColor = vec4(outPremul, outAlpha);
}
`
}
