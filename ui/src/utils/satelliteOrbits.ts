import type { Feature, FeatureCollection, MultiLineString, Point, Polygon } from 'geojson'
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

export interface SatelliteSwathDto {
  id: string
  satelliteId: string
  swathRole: 'nadir' | 'wide'
  swathWidthKm: number
  coordinates: number[][]
}

export interface SatelliteOrbit {
  id: string
  name: string
  noradId: number
  instrument: 'modis' | 'viirs'
  instrumentLabel: string
  crossingNote: string
  nadirSwathKm: number
  wideSwathKm: number
  typicalIngestionLagMinutes: number
  layerVariantIds?: string[]
  tleSource: string
  tleEpochUtc: string
  inclinationDeg: number
  periodMinutes: number
  currentPosition: SatellitePosition
  track: OrbitTrackPoint[]
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

export interface SatelliteOrbitsResponse {
  generatedAtUtc: string
  windowStartUnixMs: number
  windowEndUnixMs: number
  stepSeconds: number
  satellites: SatelliteOrbit[]
  swaths?: SatelliteSwathDto[]
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
  wideSwathKm: number
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
  positionsGeoJson: FeatureCollection<Point>
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

export const SATELLITE_ANIMATION_INTERVAL_MS = 500
export const NADIR_SWATH_COLOR = '#92b4de'
export const NADIR_SWATH_FILL_OPACITY = 0.14
export const NADIR_SWATH_STROKE_OPACITY = 0.32
export const WIDE_SWATH_COLOR = '#f49a74'
export const WIDE_SWATH_FILL_OPACITY = 0.035
export const WIDE_SWATH_STROKE_OPACITY = 0.12
export const WIDE_SWATH_DASH_ARRAY: [number, number] = [4, 6]

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

export async function fetchSatelliteOrbits(
  apiBaseUrl: string,
  signal?: AbortSignal,
  center?: { lat: number; lng: number },
): Promise<SatelliteOrbitsResponse> {
  const endpoint = apiBaseUrl ? `${apiBaseUrl}/api/satellites/orbits` : '/api/satellites/orbits'
  const params = new URLSearchParams({
    pastMinutes: '45',
    futureMinutes: '90',
    stepSeconds: '30',
  })
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    params.set('lat', String(Number(Math.max(-90, Math.min(90, center.lat)).toFixed(4))))
    params.set('lng', String(Number(normalizeLng(center.lng).toFixed(4))))
  }
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as SatelliteOrbitsResponse
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
): LiveOrbitalState {
  const visibleSatellites = satellites.filter(
    (sat) => sensorFilter === 'harmonized' || sat.instrument === sensorFilter,
  )

  const snapshots: LiveSatelliteSnapshot[] = []
  const wideSwathFeatures: Array<Feature<Polygon>> = []
  const nadirSwathFeatures: Array<Feature<Polygon>> = []
  const pastTrackFeatures: Array<Feature<MultiLineString>> = []
  const futureTrackFeatures: Array<Feature<MultiLineString>> = []
  const positionFeatures: Array<Feature<Point>> = []

  for (const sat of visibleSatellites) {
    const style = SATELLITE_STYLES[sat.id] ?? {
      ...DEFAULT_SATELLITE_STYLE,
      shortBadge: `${sat.name.toUpperCase()} · ${sat.instrument.toUpperCase()}`,
    }

    const pos = interpolateTrackAtTime(sat, nowUnixMs)

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
      lat: pos.lat,
      lng: pos.lng,
      altitudeKm: pos.altitudeKm,
      groundSpeedKmS: pos.groundSpeedKmS,
      headingDeg: pos.headingDeg,
      isAscending: pos.isAscending,
      color: style.color,
      glyph: style.glyph,
      shortBadge: style.shortBadge,
    })

    if (!showOrbits) {
      continue
    }

    const liveCoord: readonly [number, number] = [pos.lng, pos.lat]
    positionFeatures.push({
      type: 'Feature',
      id: `${sat.id}-pos`,
      geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] },
      properties: {
        id: sat.id,
        name: sat.name,
        instrument: sat.instrument,
        color: style.color,
        shortBadge: style.shortBadge,
      },
    })

    const pastRaw: Array<readonly [number, number]> = []
    const futureRaw: Array<readonly [number, number]> = []
    for (const pt of sat.track) {
      if (pt.timestampUnixMs < nowUnixMs) {
        pastRaw.push([pt.lng, pt.lat])
      } else if (pt.timestampUnixMs > nowUnixMs) {
        futureRaw.push([pt.lng, pt.lat])
      }
    }

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

    if (sat.wideSwathKm > sat.nadirSwathKm) {
      const wideRing = buildInstantaneousSwathPolygon(
        pos.lat,
        pos.lng,
        pos.headingDeg,
        sat.wideSwathKm,
        280,
      )
      wideSwathFeatures.push({
        type: 'Feature',
        id: `${sat.id}-swath-wide`,
        geometry: { type: 'Polygon', coordinates: [wideRing] },
        properties: {
          id: sat.id,
          name: sat.name,
          instrument: sat.instrument,
          swathRole: 'wide',
        },
      })
    }

    const nadirRing = buildInstantaneousSwathPolygon(
      pos.lat,
      pos.lng,
      pos.headingDeg,
      sat.nadirSwathKm,
      180,
    )
    nadirSwathFeatures.push({
      type: 'Feature',
      id: `${sat.id}-swath-nadir`,
      geometry: { type: 'Polygon', coordinates: [nadirRing] },
      properties: {
        id: sat.id,
        name: sat.name,
        instrument: sat.instrument,
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
    positionsGeoJson: { type: 'FeatureCollection', features: positionFeatures },
  }
}
