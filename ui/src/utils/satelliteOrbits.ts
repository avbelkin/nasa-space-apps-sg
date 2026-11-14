import type { Feature, FeatureCollection, LineString, MultiLineString, Polygon } from 'geojson'
import type { SensorFilter } from '../data/stubSeasonalData.ts'

export interface OrbitTrackPoint {
  timestampUnixMs: number
  lat: number
  lng: number
  altitudeKm: number
  headingDeg: number
  isAscending: boolean
}

export interface SatellitePosition {
  timestampUnixMs: number
  lat: number
  lng: number
  altitudeKm: number
  groundSpeedKmS: number
  headingDeg: number
  isAscending: boolean
}

export interface SatelliteOrbit {
  id: string
  name: string
  noradId: number
  instrument: 'modis' | 'viirs'
  instrumentLabel: string
  crossingNote: string
  nadirSwathKm: number
  wideSwathKm: number | null
  typicalIngestionLagMinutes: number
  layerVariantIds?: string[]
  tleSource: string
  tleEpochUtc: string
  inclinationDeg: number
  periodMinutes: number
  currentPosition: SatellitePosition
  track: OrbitTrackPoint[]
}

export interface GeoBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface SatelliteHudEntry {
  noradId: number
  name: string
  minutesSincePass: number
  ingestionLagMinutes: number
  isIngested: boolean
  isNadir: boolean
  nextPassMinutes: number | null
  layerVariantIds: string[]
}

export interface SatelliteHudItem {
  id: string
  label: string
  value: string
  detail: string
  badge: string
  tone: 'ready' | 'pending'
}

export interface SatelliteHudSection {
  title: string
  summary: string
  items: SatelliteHudItem[]
}

export interface SatelliteSwathsResponse {
  type: 'FeatureCollection'
  features: Array<Feature<Polygon | LineString>>
  satelliteHud: SatelliteHudEntry[]
}

export interface SatelliteOrbitsResponse {
  generatedAtUtc: string
  windowStartUnixMs: number
  windowEndUnixMs: number
  stepSeconds: number
  satellites: SatelliteOrbit[]
  swaths?: Array<Feature<Polygon>>
  satelliteHud?: SatelliteHudEntry[]
}

export interface LiveSatelliteSnapshot {
  id: string
  name: string
  noradId: number
  instrument: 'modis' | 'viirs'
  instrumentLabel: string
  crossingNote: string
  nadirSwathKm: number
  wideSwathKm: number | null
  typicalIngestionLagMinutes: number
  layerVariantIds: string[]
  tleSource: string
  tleEpochUtc: string
  inclinationDeg: number
  periodMinutes: number
  lat: number
  lng: number
  altitudeKm: number
  groundSpeedKmS: number
  headingDeg: number
  isAscending: boolean
  color: string
  glyph: string
  shortBadge: string
}

export interface LiveOrbitalState {
  snapshots: LiveSatelliteSnapshot[]
  wideSwathsGeoJson: FeatureCollection<Polygon>
  nadirSwathsGeoJson: FeatureCollection<Polygon>
  pastTracksGeoJson: FeatureCollection<MultiLineString>
  futureTracksGeoJson: FeatureCollection<MultiLineString>
}

interface SatelliteVisualStyle {
  color: string
  glyph: string
  shortBadge: string
}

const SATELLITE_STYLES: Record<string, SatelliteVisualStyle> = {
  terra: { color: '#22d3ee', glyph: '◆', shortBadge: 'TERRA · MODIS' },
  aqua: { color: '#60a5fa', glyph: '◆', shortBadge: 'AQUA · MODIS' },
  'noaa-20': { color: '#34d399', glyph: '●', shortBadge: 'NOAA-20 · VIIRS' },
  'noaa-21': { color: '#c084fc', glyph: '●', shortBadge: 'NOAA-21 · VIIRS' },
}

const DEFAULT_SATELLITE_STYLE: SatelliteVisualStyle = {
  color: '#38bdf8',
  glyph: '●',
  shortBadge: 'SAT',
}

// Extremum swatch and cadence tokens (--blue-300 / --orange-300 / --gray-300)
export const SATELLITE_ANIMATION_INTERVAL_MS = 500
export const SATELLITE_SWATH_POLL_INTERVAL_MS = 15_000
export const SAT_ONLY_MIN_HALF_SPAN_DEGREES = 5
export const SAT_ONLY_BOUNDS_EPSILON_DEGREES = 0.5
const MIN_HALF_SPAN_DEGREES = 0.1

export const NADIR_SWATH_COLOR = '#92b4de'
export const NADIR_SWATH_FILL_OPACITY = 0.14
export const NADIR_SWATH_STROKE_OPACITY = 0.32
export const WIDE_SWATH_COLOR = '#f49a74'
export const WIDE_SWATH_FILL_OPACITY = 0.035
export const WIDE_SWATH_STROKE_OPACITY = 0.12
export const WIDE_SWATH_DASH_ARRAY: [number, number] = [4, 6]
export const SATELLITE_WING_COLOR = '#92b4de'
export const SATELLITE_BODY_COLOR = '#b0b0b0'

const MAX_HUD_FRESHNESS_ITEMS = 3
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const SWATH_EDGE_SUBDIVISIONS = 12
const METERS_PER_DEGREE_LATITUDE = 111_194.9266
const MIN_EFFECTIVE_COS_LATITUDE = 0.35
const MAX_POLAR_COS_REFERENCE_LAT = 75
const MAX_SWATH_LATITUDE = 78
const MAX_CROSS_TRACK_LON_HALF_SPAN = 25
const MAX_TOTAL_LON_HALF_SPAN = 35
const ANTIMERIDIAN_CLAMP_DEG = 179.99

function appendBoundsQuery(params: URLSearchParams, bounds?: GeoBounds | null): void {
  if (!bounds) {
    return
  }
  params.set('west', String(Number(bounds.west.toFixed(4))))
  params.set('south', String(Number(bounds.south.toFixed(4))))
  params.set('east', String(Number(bounds.east.toFixed(4))))
  params.set('north', String(Number(bounds.north.toFixed(4))))
}

export async function fetchSatelliteOrbits(
  apiBaseUrl: string,
  signal?: AbortSignal,
  bounds?: GeoBounds | null,
): Promise<SatelliteOrbitsResponse> {
  const endpoint = apiBaseUrl ? `${apiBaseUrl}/api/satellites/orbits` : '/api/satellites/orbits'
  const params = new URLSearchParams({
    pastMinutes: '45',
    futureMinutes: '90',
    stepSeconds: '30',
  })
  appendBoundsQuery(params, bounds)
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as SatelliteOrbitsResponse
}

export async function fetchSatelliteSwaths(
  apiBaseUrl: string,
  bounds?: GeoBounds | null,
  signal?: AbortSignal,
): Promise<SatelliteSwathsResponse> {
  const endpoint = apiBaseUrl ? `${apiBaseUrl}/api/satellites/swaths` : '/api/satellites/swaths'
  const params = new URLSearchParams()
  appendBoundsQuery(params, bounds)
  const query = params.toString()
  const response = await fetch(query ? `${endpoint}?${query}` : endpoint, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as SatelliteSwathsResponse
}

export function normalizeLng(degrees: number): number {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180
  return Math.max(-180, Math.min(180, wrapped))
}

function computeSphericalHeadingDeg(lat0: number, lng0: number, lat1: number, lng1: number): number {
  let dLng = lng1 - lng0
  if (dLng > 180) {
    dLng -= 360
  } else if (dLng < -180) {
    dLng += 360
  }
  const phi0 = lat0 * DEG_TO_RAD
  const phi1 = lat1 * DEG_TO_RAD
  const lambdaDelta = dLng * DEG_TO_RAD
  const y = Math.sin(lambdaDelta) * Math.cos(phi1)
  const x = Math.cos(phi0) * Math.sin(phi1) - Math.sin(phi0) * Math.cos(phi1) * Math.cos(lambdaDelta)
  return (((Math.atan2(y, x) * RAD_TO_DEG) % 360) + 360) % 360
}

export function interpolateTrackAtTime(
  sat: SatelliteOrbit,
  targetUnixMs: number,
): {
  lat: number
  lng: number
  altitudeKm: number
  headingDeg: number
  groundSpeedKmS: number
  isAscending: boolean
} {
  const { track, currentPosition } = sat
  if (track.length === 0) {
    return {
      lat: currentPosition.lat,
      lng: normalizeLng(currentPosition.lng),
      altitudeKm: currentPosition.altitudeKm,
      headingDeg: currentPosition.headingDeg,
      groundSpeedKmS: currentPosition.groundSpeedKmS,
      isAscending: currentPosition.isAscending,
    }
  }

  if (targetUnixMs <= track[0].timestampUnixMs) {
    const first = track[0]
    return {
      lat: first.lat,
      lng: normalizeLng(first.lng),
      altitudeKm: first.altitudeKm,
      headingDeg: first.headingDeg,
      groundSpeedKmS: currentPosition.groundSpeedKmS,
      isAscending: first.isAscending,
    }
  }

  const last = track[track.length - 1]
  if (targetUnixMs >= last.timestampUnixMs) {
    return {
      lat: last.lat,
      lng: normalizeLng(last.lng),
      altitudeKm: last.altitudeKm,
      headingDeg: last.headingDeg,
      groundSpeedKmS: currentPosition.groundSpeedKmS,
      isAscending: last.isAscending,
    }
  }

  let low = 0
  let high = track.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (track[mid].timestampUnixMs <= targetUnixMs) {
      low = mid
    } else {
      high = mid
    }
  }

  const p0 = track[low]
  const p1 = track[high]
  const span = p1.timestampUnixMs - p0.timestampUnixMs
  const t = span > 0 ? (targetUnixMs - p0.timestampUnixMs) / span : 0

  let dLng = p1.lng - p0.lng
  if (dLng > 180) {
    dLng -= 360
  } else if (dLng < -180) {
    dLng += 360
  }

  const lat = p0.lat + (p1.lat - p0.lat) * t
  const lng = normalizeLng(p0.lng + dLng * t)
  const altitudeKm = p0.altitudeKm + (p1.altitudeKm - p0.altitudeKm) * t
  const headingDeg =
    Math.abs(p1.lat - p0.lat) > 1e-4 || Math.abs(dLng) > 1e-4
      ? computeSphericalHeadingDeg(p0.lat, p0.lng, p1.lat, p1.lng)
      : p0.headingDeg

  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    altitudeKm: Number(altitudeKm.toFixed(1)),
    headingDeg: Number(headingDeg.toFixed(1)),
    groundSpeedKmS: currentPosition.groundSpeedKmS,
    isAscending: p1.lat >= p0.lat,
  }
}

export function splitAntimeridianCoordinates(
  points: ReadonlyArray<readonly [number, number]>,
): number[][][] {
  if (points.length < 2) {
    return []
  }

  const segments: number[][][] = []
  let currentSegment: number[][] = [[points[0][0], points[0][1]]]

  for (let i = 1; i < points.length; i++) {
    const [lng1, lat1] = points[i - 1]
    const [lng2, lat2] = points[i]

    if (Math.abs(lng2 - lng1) > 180) {
      const dLng = lng2 > lng1 ? lng2 - 360 - lng1 : lng2 + 360 - lng1
      const boundary1 = dLng >= 0 ? 180 : -180
      const frac = dLng !== 0 ? Math.min(1, Math.max(0, (boundary1 - lng1) / dLng)) : 0.5
      const crossLat = Number((lat1 + (lat2 - lat1) * frac).toFixed(4))

      currentSegment.push([boundary1, crossLat])
      if (currentSegment.length >= 2) {
        segments.push(currentSegment)
      }
      currentSegment = [
        [-boundary1, crossLat],
        [lng2, lat2],
      ]
    } else {
      currentSegment.push([lng2, lat2])
    }
  }

  if (currentSegment.length >= 2) {
    segments.push(currentSegment)
  }

  return segments
}

export function buildInstantaneousSwathPolygon(
  lat: number,
  lng: number,
  headingDeg: number,
  swathWidthKm: number,
  alongTrackKm: number,
): number[][] {
  const centerLat = Math.max(-MAX_SWATH_LATITUDE, Math.min(MAX_SWATH_LATITUDE, lat))
  const centerLon = Math.max(-ANTIMERIDIAN_CLAMP_DEG, Math.min(ANTIMERIDIAN_CLAMP_DEG, lng))

  const halfWidthMeters = Math.max(1000, swathWidthKm * 500)
  const halfLengthMeters = Math.max(5000, alongTrackKm * 500)

  const cosRefLat = Math.cos(
    Math.max(-MAX_POLAR_COS_REFERENCE_LAT, Math.min(MAX_POLAR_COS_REFERENCE_LAT, centerLat)) *
      DEG_TO_RAD,
  )
  const effectiveCosLat = Math.max(MIN_EFFECTIVE_COS_LATITUDE, cosRefLat)

  const maxAllowedHalfWidthMeters =
    MAX_CROSS_TRACK_LON_HALF_SPAN * METERS_PER_DEGREE_LATITUDE * effectiveCosLat
  const clampedHalfWidthMeters = Math.min(halfWidthMeters, maxAllowedHalfWidthMeters)

  const headingRad = headingDeg * DEG_TO_RAD
  const alongNorthUnit = Math.cos(headingRad)
  const alongEastUnit = Math.sin(headingRad)
  const rightNorthUnit = -Math.sin(headingRad)
  const rightEastUnit = Math.cos(headingRad)

  const computePerimeterVertex = (alongFactor: number, rightFactor: number): number[] => {
    const northMeters =
      alongFactor * halfLengthMeters * alongNorthUnit +
      rightFactor * clampedHalfWidthMeters * rightNorthUnit
    const eastMeters =
      alongFactor * halfLengthMeters * alongEastUnit +
      rightFactor * clampedHalfWidthMeters * rightEastUnit

    const deltaLat = northMeters / METERS_PER_DEGREE_LATITUDE
    const deltaLon = Math.max(
      -MAX_TOTAL_LON_HALF_SPAN,
      Math.min(MAX_TOTAL_LON_HALF_SPAN, eastMeters / (METERS_PER_DEGREE_LATITUDE * effectiveCosLat)),
    )

    const vLat = Math.max(-MAX_SWATH_LATITUDE, Math.min(MAX_SWATH_LATITUDE, centerLat + deltaLat))
    const vLon = Math.max(
      -ANTIMERIDIAN_CLAMP_DEG,
      Math.min(ANTIMERIDIAN_CLAMP_DEG, centerLon + deltaLon),
    )
    return [Number(vLon.toFixed(4)), Number(vLat.toFixed(4))]
  }

  const ring: number[][] = []
  for (let i = 0; i < SWATH_EDGE_SUBDIVISIONS; i++) {
    ring.push(computePerimeterVertex(1, -1 + (2 * i) / SWATH_EDGE_SUBDIVISIONS))
  }
  for (let i = 0; i < SWATH_EDGE_SUBDIVISIONS; i++) {
    ring.push(computePerimeterVertex(1 - (2 * i) / SWATH_EDGE_SUBDIVISIONS, 1))
  }
  for (let i = 0; i < SWATH_EDGE_SUBDIVISIONS; i++) {
    ring.push(computePerimeterVertex(-1, 1 - (2 * i) / SWATH_EDGE_SUBDIVISIONS))
  }
  for (let i = 0; i < SWATH_EDGE_SUBDIVISIONS; i++) {
    ring.push(computePerimeterVertex(-1 + (2 * i) / SWATH_EDGE_SUBDIVISIONS, -1))
  }

  ring.push([...ring[0]])
  return ring
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Normalizes and clamps geographic bounds for satellite viewport tracking,
 * enforcing a minimum half-span matching extremum-searchandrescue-tools.
 */
export function clampViewportBounds(
  bounds: GeoBounds | null | undefined,
  options: { satelliteOnly?: boolean } = {},
): GeoBounds | null {
  if (!bounds) {
    return null
  }
  const { west: rawWest, south: rawSouth, east: rawEast, north: rawNorth } = bounds
  if (
    !Number.isFinite(rawWest) ||
    !Number.isFinite(rawSouth) ||
    !Number.isFinite(rawEast) ||
    !Number.isFinite(rawNorth)
  ) {
    return null
  }

  const satelliteOnly = Boolean(options.satelliteOnly)
  const minHalfSpan = satelliteOnly ? SAT_ONLY_MIN_HALF_SPAN_DEGREES : MIN_HALF_SPAN_DEGREES

  const fullGlobeSpan = rawEast - rawWest >= 360
  let rawWidth = fullGlobeSpan ? 360 : rawEast - rawWest
  if (!fullGlobeSpan && rawWidth < 0) {
    rawWidth = 360 + rawWidth
  }
  const centerLon = fullGlobeSpan
    ? 0
    : clampNumber(
        rawEast >= rawWest ? (rawWest + rawEast) / 2 : normalizeLng(rawWest + rawWidth / 2),
        -180,
        180,
      )
  const centerLat = clampNumber((rawSouth + rawNorth) / 2, -85, 85)
  const halfWidth = clampNumber(rawWidth / 2, minHalfSpan, 180)
  const halfHeight = clampNumber((rawNorth - rawSouth) / 2, minHalfSpan, 180)

  const west = Math.max(-180, centerLon - halfWidth)
  const east = Math.min(180, centerLon + halfWidth)
  const south = Math.max(-85, centerLat - halfHeight)
  const north = Math.min(85, centerLat + halfHeight)

  if (east <= west || north <= south) {
    return null
  }

  return { west, south, east, north }
}

export function areBoundsClose(
  a: GeoBounds | null | undefined,
  b: GeoBounds | null | undefined,
  epsilon = SAT_ONLY_BOUNDS_EPSILON_DEGREES,
): boolean {
  if (!a || !b) {
    return false
  }
  return (
    Math.abs(a.west - b.west) <= epsilon &&
    Math.abs(a.south - b.south) <= epsilon &&
    Math.abs(a.east - b.east) <= epsilon &&
    Math.abs(a.north - b.north) <= epsilon
  )
}

/**
 * Interpolates between backend startRing and endRing at the target timestamp,
 * guarding against interpolating across an antimeridian jump (> 180 deg).
 */
export function interpolateSwathRing(
  startRing: readonly (readonly number[])[],
  endRing: readonly (readonly number[])[] | null | undefined,
  startUnixSeconds: number,
  endUnixSeconds: number,
  nowUnixSeconds: number,
): number[][] {
  if (
    !Array.isArray(endRing) ||
    endRing.length !== startRing.length ||
    !Number.isFinite(startUnixSeconds) ||
    !Number.isFinite(endUnixSeconds) ||
    endUnixSeconds <= startUnixSeconds
  ) {
    return startRing.map((pt) => [pt[0], pt[1]])
  }

  const ratio = clampNumber(
    (nowUnixSeconds - startUnixSeconds) / (endUnixSeconds - startUnixSeconds),
    0,
    1,
  )

  for (let i = 0; i < startRing.length; i++) {
    if (Math.abs(endRing[i][0] - startRing[i][0]) > 180) {
      const selected = ratio < 0.5 ? startRing : endRing
      return selected.map((pt) => [pt[0], pt[1]])
    }
  }

  return startRing.map((startPt, idx) => {
    const endPt = endRing[idx]
    return [
      Number((startPt[0] + (endPt[0] - startPt[0]) * ratio).toFixed(5)),
      Number((startPt[1] + (endPt[1] - startPt[1]) * ratio).toFixed(5)),
    ]
  })
}

export function interpolateTrajectoryPosition(
  coords: readonly (readonly number[])[],
  nowUnixSeconds: number,
): { lng: number; lat: number; elevationMeters: number } | null {
  if (!Array.isArray(coords) || coords.length === 0) {
    return null
  }
  if (coords.length === 1) {
    return {
      lng: coords[0][0],
      lat: coords[0][1],
      elevationMeters: coords[0][2] ?? 0,
    }
  }

  const c0 = coords[0]
  const c1 = coords[coords.length - 1]
  const t0 = c0[3]
  const t1 = c1[3]
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) {
    return { lng: c0[0], lat: c0[1], elevationMeters: c0[2] ?? 0 }
  }

  const ratio = clampNumber((nowUnixSeconds - t0) / (t1 - t0), 0, 1)
  let dLng = c1[0] - c0[0]
  if (dLng > 180) {
    dLng -= 360
  } else if (dLng < -180) {
    dLng += 360
  }

  return {
    lng: normalizeLng(c0[0] + dLng * ratio),
    lat: c0[1] + (c1[1] - c0[1]) * ratio,
    elevationMeters: (c0[2] ?? 0) + ((c1[2] ?? 0) - (c0[2] ?? 0)) * ratio,
  }
}

export function getSatelliteTooltip(sat: {
  name: string
  altitudeKm?: number
  groundSpeedKmS?: number
}): string {
  const parts = [sat.name]
  if (typeof sat.altitudeKm === 'number' && Number.isFinite(sat.altitudeKm)) {
    parts.push(`altitude ${sat.altitudeKm} km`)
  }
  if (typeof sat.groundSpeedKmS === 'number' && Number.isFinite(sat.groundSpeedKmS)) {
    parts.push(`speed ${sat.groundSpeedKmS} km/s`)
  }
  return parts.join(', ')
}

export function shouldIncludeSatelliteInHud(
  entry: SatelliteHudEntry | null | undefined,
  sensorFilter: SensorFilter,
): boolean {
  if (!entry) {
    return false
  }
  const variants = Array.isArray(entry.layerVariantIds) ? entry.layerVariantIds : []
  if (variants.length === 0) {
    return true
  }
  if (sensorFilter === 'harmonized') {
    return variants.includes('harmonized') || variants.includes('wF')
  }
  return variants.includes(sensorFilter)
}

function formatDurationBrief(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return ''
  }
  if (minutes < MINUTES_PER_HOUR) {
    return `${Math.round(minutes)}m`
  }
  if (minutes < MINUTES_PER_DAY) {
    const hours = Math.round((minutes / MINUTES_PER_HOUR) * 10) / 10
    return `${hours}h`
  }
  const days = Math.round((minutes / MINUTES_PER_DAY) * 10) / 10
  return `${days}d`
}

export function formatSatelliteHudSection(
  hudEntries: readonly SatelliteHudEntry[] | null | undefined,
  options: { sensorFilter: SensorFilter; showOrbits: boolean },
): SatelliteHudSection | null {
  if (!options.showOrbits || !Array.isArray(hudEntries) || hudEntries.length === 0) {
    return null
  }

  const matching = hudEntries.filter((entry) =>
    shouldIncludeSatelliteInHud(entry, options.sensorFilter),
  )
  if (matching.length === 0) {
    return null
  }

  const sortedMatching = matching.slice().sort((a, b) => a.minutesSincePass - b.minutesSincePass)
  const candidates = sortedMatching.slice(0, MAX_HUD_FRESHNESS_ITEMS)
  if (candidates.length > 0 && candidates.every((c) => !c.isIngested)) {
    const firstReady = sortedMatching.find((c) => c.isIngested)
    if (firstReady) {
      if (candidates.length < MAX_HUD_FRESHNESS_ITEMS) {
        candidates.push(firstReady)
      } else {
        candidates[candidates.length - 1] = firstReady
      }
    }
  }

  if (candidates.length === 0) {
    return null
  }

  const upcoming = matching
    .filter((entry) => typeof entry.nextPassMinutes === 'number' && Number.isFinite(entry.nextPassMinutes))
    .sort((a, b) => (a.nextPassMinutes ?? 0) - (b.nextPassMinutes ?? 0))[0]

  const summary =
    upcoming && upcoming.nextPassMinutes !== null
      ? `next ${upcoming.name} ~${formatDurationBrief(upcoming.nextPassMinutes)}`
      : ''

  const items: SatelliteHudItem[] = candidates.map((entry) => {
    const isNow = Math.round(entry.minutesSincePass) <= 0
    const passAgo = isNow ? 'now' : `${formatDurationBrief(entry.minutesSincePass)} ago`
    const detail = entry.isIngested
      ? ''
      : `lag ~${formatDurationBrief(entry.ingestionLagMinutes)}`
    const badge = entry.isIngested ? 'ready' : 'processing'
    return {
      id: `sat-hud-${entry.noradId}-${entry.isIngested ? 'ready' : 'processing'}`,
      label: entry.name,
      value: passAgo,
      detail,
      badge,
      tone: entry.isIngested ? 'ready' : 'pending',
    }
  })

  return {
    title: 'SAT',
    summary,
    items,
  }
}

export function computeLiveOrbitalState(
  satellites: readonly SatelliteOrbit[],
  sensorFilter: SensorFilter,
  nowUnixMs: number,
  showOrbits: boolean,
  liveSwaths?: SatelliteSwathsResponse | null,
): LiveOrbitalState {
  const visibleSatellites = satellites.filter(
    (sat) => sensorFilter === 'harmonized' || sat.instrument === sensorFilter,
  )
  const visibleByNorad = new Map(visibleSatellites.map((sat) => [sat.noradId, sat]))
  const nowUnixSeconds = nowUnixMs / 1000

  const liveSatByNorad = new Map<
    number,
    {
      satId: string
      angle: number
      altitudeKm: number
      speedKmS: number
      coords: number[][]
    }
  >()
  const liveSwathsBySatId = new Map<
    string,
    Array<{
      swathRole: string
      ring: number[][]
      endRing?: number[][]
    }>
  >()

  if (liveSwaths && Array.isArray(liveSwaths.features)) {
    for (const feature of liveSwaths.features) {
      const props = feature.properties ?? {}
      if (props.type === 'satellite' && feature.geometry.type === 'LineString') {
        const noradId = Number(props.noradId)
        if (!visibleByNorad.has(noradId)) {
          continue
        }
        const coords = feature.geometry.coordinates
        const tEnd = coords[coords.length - 1]?.[3]
        if (Number.isFinite(tEnd) && nowUnixSeconds <= tEnd + 15) {
          liveSatByNorad.set(noradId, {
            satId: String(props.id ?? feature.id ?? `sat_${noradId}`),
            angle: Number(props.angle ?? 0),
            altitudeKm: Number(props.altitudeKm ?? 0),
            speedKmS: Number(props.speedKmS ?? 0),
            coords,
          })
        }
      } else if (props.type === 'satellite-swath' && feature.geometry.type === 'Polygon') {
        const satId = String(props.satelliteId ?? '')
        const swathRole = String(props.swathRole ?? 'nadir')
        const ring = feature.geometry.coordinates[0] ?? []
        const endRing = Array.isArray(props.endRing) ? (props.endRing as number[][]) : undefined
        const existing = liveSwathsBySatId.get(satId) ?? []
        existing.push({ swathRole, ring, endRing })
        liveSwathsBySatId.set(satId, existing)
      }
    }
  }

  const snapshots: LiveSatelliteSnapshot[] = []
  const wideSwathFeatures: Array<Feature<Polygon>> = []
  const nadirSwathFeatures: Array<Feature<Polygon>> = []
  const pastTrackFeatures: Array<Feature<MultiLineString>> = []
  const futureTrackFeatures: Array<Feature<MultiLineString>> = []

  for (const sat of visibleSatellites) {
    const style = SATELLITE_STYLES[sat.id] ?? {
      ...DEFAULT_SATELLITE_STYLE,
      shortBadge: `${sat.name.toUpperCase()} · ${sat.instrument.toUpperCase()}`,
    }

    const liveTrackPos = interpolateTrackAtTime(sat, nowUnixMs)
    const liveBackendFeature = liveSatByNorad.get(sat.noradId)
    const interpolatedLiveCoords = liveBackendFeature
      ? interpolateTrajectoryPosition(liveBackendFeature.coords, nowUnixSeconds)
      : null

    const lat = interpolatedLiveCoords
      ? Number(interpolatedLiveCoords.lat.toFixed(4))
      : liveTrackPos.lat
    const lng = interpolatedLiveCoords
      ? Number(interpolatedLiveCoords.lng.toFixed(4))
      : liveTrackPos.lng
    const altitudeKm = liveBackendFeature?.altitudeKm || liveTrackPos.altitudeKm
    const groundSpeedKmS = liveBackendFeature?.speedKmS || liveTrackPos.groundSpeedKmS
    const headingDeg = liveBackendFeature ? liveBackendFeature.angle : liveTrackPos.headingDeg

    snapshots.push({
      id: sat.id,
      name: sat.name,
      noradId: sat.noradId,
      instrument: sat.instrument,
      instrumentLabel: sat.instrumentLabel,
      crossingNote: sat.crossingNote,
      nadirSwathKm: sat.nadirSwathKm,
      wideSwathKm: sat.wideSwathKm,
      typicalIngestionLagMinutes: sat.typicalIngestionLagMinutes,
      layerVariantIds: sat.layerVariantIds ?? [sat.instrument, 'harmonized', 'wF'],
      tleSource: sat.tleSource,
      tleEpochUtc: sat.tleEpochUtc,
      inclinationDeg: sat.inclinationDeg,
      periodMinutes: sat.periodMinutes,
      lat,
      lng,
      altitudeKm,
      groundSpeedKmS,
      headingDeg,
      isAscending: liveTrackPos.isAscending,
      color: style.color,
      glyph: style.glyph,
      shortBadge: style.shortBadge,
    })

    if (!showOrbits) {
      continue
    }

    const pastRaw: Array<readonly [number, number]> = []
    const futureRaw: Array<readonly [number, number]> = []
    for (const pt of sat.track) {
      if (pt.timestampUnixMs < nowUnixMs) {
        pastRaw.push([pt.lng, pt.lat])
      } else if (pt.timestampUnixMs > nowUnixMs) {
        futureRaw.push([pt.lng, pt.lat])
      }
    }

    const liveCoord: readonly [number, number] = [lng, lat]
    const pastPoints = pastRaw.length > 0 ? [...pastRaw, liveCoord] : []
    const futurePoints = futureRaw.length > 0 ? [liveCoord, ...futureRaw] : []

    const pastSegments = splitAntimeridianCoordinates(pastPoints)
    if (pastSegments.length > 0) {
      pastTrackFeatures.push({
        type: 'Feature',
        id: `${sat.id}-past`,
        geometry: { type: 'MultiLineString', coordinates: pastSegments },
        properties: { id: sat.id, name: sat.name, instrument: sat.instrument, color: style.color },
      })
    }

    const futureSegments = splitAntimeridianCoordinates(futurePoints)
    if (futureSegments.length > 0) {
      futureTrackFeatures.push({
        type: 'Feature',
        id: `${sat.id}-future`,
        geometry: { type: 'MultiLineString', coordinates: futureSegments },
        properties: { id: sat.id, name: sat.name, instrument: sat.instrument, color: style.color },
      })
    }

    const backendSwaths =
      liveBackendFeature && liveSwathsBySatId.get(liveBackendFeature.satId)
    if (backendSwaths && backendSwaths.length > 0) {
      const t0 = liveBackendFeature.coords[0]?.[3] ?? nowUnixSeconds
      const t1 = liveBackendFeature.coords[liveBackendFeature.coords.length - 1]?.[3] ?? t0
      for (const swath of backendSwaths) {
        const ring = interpolateSwathRing(swath.ring, swath.endRing, t0, t1, nowUnixSeconds)
        const targetCollection = swath.swathRole === 'wide' ? wideSwathFeatures : nadirSwathFeatures
        targetCollection.push({
          type: 'Feature',
          id: `${sat.id}-swath-${swath.swathRole}`,
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: {
            id: sat.id,
            satelliteId: liveBackendFeature.satId,
            swathRole: swath.swathRole,
          },
        })
      }
      continue
    }

    if (sat.wideSwathKm !== null && sat.wideSwathKm > sat.nadirSwathKm) {
      const wideRing = buildInstantaneousSwathPolygon(
        lat,
        lng,
        headingDeg,
        sat.wideSwathKm,
        280,
      )
      wideSwathFeatures.push({
        type: 'Feature',
        id: `${sat.id}-swath-wide`,
        geometry: { type: 'Polygon', coordinates: [wideRing] },
        properties: {
          id: sat.id,
          swathRole: 'wide',
        },
      })
    }

    const nadirRing = buildInstantaneousSwathPolygon(
      lat,
      lng,
      headingDeg,
      sat.nadirSwathKm,
      180,
    )
    nadirSwathFeatures.push({
      type: 'Feature',
      id: `${sat.id}-swath-nadir`,
      geometry: { type: 'Polygon', coordinates: [nadirRing] },
      properties: {
        id: sat.id,
        swathRole: 'nadir',
      },
    })
  }

  return {
    snapshots,
    wideSwathsGeoJson: { type: 'FeatureCollection', features: wideSwathFeatures },
    nadirSwathsGeoJson: { type: 'FeatureCollection', features: nadirSwathFeatures },
    pastTracksGeoJson: { type: 'FeatureCollection', features: pastTrackFeatures },
    futureTracksGeoJson: { type: 'FeatureCollection', features: futureTrackFeatures },
  }
}
