import type { Feature, FeatureCollection, Point } from 'geojson'
import type { SensorFilter } from '../data/stubSeasonalData.ts'

export const ACTIVE_AGE_SECONDS = 24 * 60 * 60
export const ACTIVE_AGE_MS = ACTIVE_AGE_SECONDS * 1000
export const ANIMATION_INTERVAL_MS = 80
export const MAX_INACTIVITY_MS = 5 * 60 * 1000
export const FAST_PERIOD_SECONDS = 1.4
export const SLOW_PERIOD_SECONDS = 5
export const FAST_FREQUENCY_HZ = 1 / FAST_PERIOD_SECONDS
export const SLOW_FREQUENCY_HZ = 1 / SLOW_PERIOD_SECONDS
export const MID_FREQUENCY_HZ = (FAST_FREQUENCY_HZ + SLOW_FREQUENCY_HZ) / 2
export const SPOT_RADIUS = 12
export const SPOT_EXPANSION = 8
export const STILL_OPACITY = 0.55
export const SPOT_OPACITY = 0.85
export const MIN_FRP = 1
export const MAX_FRP = 250
export const MIN_SCALE = 0.5
export const MAX_SCALE = 1.5
export const MIN_CONFIDENCE = 25
export const MAX_CONFIDENCE = 100
export const MIN_CONFIDENCE_OPACITY = 0.6
export const MAX_INDIVIDUAL_SPOT_TOOLTIPS = 3
export const PULSE_PHASE_COHORT_COUNT = 4

export type FireInstrument = 'modis' | 'viirs'
export type PhaseCohort = 0 | 1 | 2 | 3

export interface FirmsSourceSummary {
  code: number
  dataset: string
  label: string
  instrument: FireInstrument
  radiusMeters: number
  count: number
}

export type FirmsSpotTuple = [
  lng: number,
  lat: number,
  timestampMs: number,
  frp: number,
  brightnessK: number,
  confidence: number,
  sourceCode: number,
  satellite: string,
  dayNight: string,
]

export interface FirmsLiveSpotsResponse {
  generatedAtUtc: string
  fetchedAtUtc: string
  latestAcquiredAtUtc: string | null
  stale: boolean
  windowHours: number
  sensorFilter: string
  sources: FirmsSourceSummary[]
  count: number
  modisCount: number
  viirsCount: number
  maxFrpMw: number
  attribution: string
  columns: string[]
  spots: FirmsSpotTuple[]
}

export interface FireSpotFeatureProperties {
  timestamp: number
  frp: number
  brightnessK: number
  confidence: number
  instrument: FireInstrument
  source: string
  satellite: string
  dayNight: string
  radiusMeters: number
  powerScale: number
  certainty: number
  activity: number
  phaseCohort: PhaseCohort | -1
}

export interface BuiltFireSpotsData {
  featureCollection: FeatureCollection<Point, FireSpotFeatureProperties>
  cohortAgeSeconds: [number, number, number, number]
  cohortCounts: [number, number, number, number]
  activeSpotCount: number
  referenceNowMs: number
}

export interface FireSpotsSensorSummary {
  totalCount: number
  modisCount: number
  viirsCount: number
  maxFrpMw: number
  latestAcquiredAtUtc: string | null
}

export interface FireSpotTooltipInput {
  lng?: number
  lat?: number
  timestamp: number
  frp: number
  brightnessK?: number
  confidence?: number
  instrument?: FireInstrument
  source: string
  satellite?: string
  dayNight?: string
}

export interface FormattedFireSpotsTooltip {
  mode: 'individual' | 'aggregated'
  header: string
  lines: string[]
  count: number
}

interface SourceMetaEntry {
  label: string
  instrument: FireInstrument
  radiusMeters: number
}

const DEFAULT_SOURCE_META: Record<number, SourceMetaEntry> = {
  0: { label: 'MODIS 1km', instrument: 'modis', radiusMeters: 1000 },
  1: { label: 'VIIRS 375m / NOAA-20', instrument: 'viirs', radiusMeters: 375 },
  2: { label: 'VIIRS 375m / NOAA-21', instrument: 'viirs', radiusMeters: 375 },
}

export const COHORT_PHASE_RADIANS: readonly [number, number, number, number] = [
  0,
  Math.PI * 0.5,
  Math.PI,
  Math.PI * 1.5,
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function computeWildfireActivity(ageSeconds: number, motionEnabled: boolean): number {
  if (!motionEnabled || !Number.isFinite(ageSeconds) || ageSeconds >= ACTIVE_AGE_SECONDS) {
    return 0
  }
  const safeAge = Math.max(0, ageSeconds)
  return clamp(1 - safeAge / ACTIVE_AGE_SECONDS, 0, 1)
}

export function computeWildfirePulse(
  ageSeconds: number,
  phaseRad: number,
  motionEnabled: boolean,
): number {
  const activity = computeWildfireActivity(ageSeconds, motionEnabled)
  if (activity <= 0) {
    return 0
  }
  const safeAge = Math.max(0, ageSeconds)
  const frequency = MID_FREQUENCY_HZ + (FAST_FREQUENCY_HZ - MID_FREQUENCY_HZ) * activity
  const cycles = safeAge * frequency
  return activity * (0.5 + 0.5 * Math.sin(2 * Math.PI * cycles + phaseRad))
}

export function computePowerScale(frpMw: number): number {
  if (!Number.isFinite(frpMw)) {
    return MIN_SCALE
  }
  const t = clamp((frpMw - MIN_FRP) / (MAX_FRP - MIN_FRP), 0, 1)
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * t
}

export function computeConfidenceOpacity(confidence: number): number {
  if (!Number.isFinite(confidence)) {
    return MIN_CONFIDENCE_OPACITY
  }
  const t = clamp((confidence - MIN_CONFIDENCE) / (MAX_CONFIDENCE - MIN_CONFIDENCE), 0, 1)
  return MIN_CONFIDENCE_OPACITY + (1 - MIN_CONFIDENCE_OPACITY) * t
}

export function computeSpatialPhaseCohort(lng: number, lat: number): PhaseCohort {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return 0
  }
  const qLng = Math.round(lng * 1000) | 0
  const qLat = Math.round(lat * 1000) | 0
  const hash = (((qLng * 73856093) ^ (qLat * 19349663)) >>> 0) % PULSE_PHASE_COHORT_COUNT
  return hash as PhaseCohort
}

export async function fetchLiveFireSpots(
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<FirmsLiveSpotsResponse> {
  const endpoint = apiBaseUrl ? `${apiBaseUrl}/api/fires/spots` : '/api/fires/spots'
  const url = `${endpoint}?hours=24&sensor=harmonized`
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    let detail = `HTTP ${response.status} ${response.statusText}`
    try {
      const errBody = (await response.json()) as { error?: unknown }
      if (typeof errBody?.error === 'string' && errBody.error.trim().length > 0) {
        detail = errBody.error
      }
    } catch {
      // Ignore non-JSON error responses.
    }
    throw new Error(detail)
  }
  return (await response.json()) as FirmsLiveSpotsResponse
}

function buildSourceLookup(sources: readonly FirmsSourceSummary[]): Map<number, SourceMetaEntry> {
  const map = new Map<number, SourceMetaEntry>()
  for (const [code, entry] of Object.entries(DEFAULT_SOURCE_META)) {
    map.set(Number(code), entry)
  }
  for (const src of sources) {
    map.set(src.code, {
      label: src.label,
      instrument: src.instrument === 'modis' ? 'modis' : 'viirs',
      radiusMeters: src.radiusMeters,
    })
  }
  return map
}

export function buildFireSpotsGeoJson(
  payload: FirmsLiveSpotsResponse,
  referenceNowMs = Date.now(),
): BuiltFireSpotsData {
  const sourceLookup = buildSourceLookup(payload.sources ?? [])
  const features: Array<Feature<Point, FireSpotFeatureProperties>> = []
  const cohortAgeSums: [number, number, number, number] = [0, 0, 0, 0]
  const cohortCounts: [number, number, number, number] = [0, 0, 0, 0]
  let activeSpotCount = 0

  for (const tuple of payload.spots) {
    const [lng, lat, timestampMs, frp, brightnessK, confidence, sourceCode, satellite, dayNight] =
      tuple
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue
    }

    const sourceMeta = sourceLookup.get(sourceCode) ?? DEFAULT_SOURCE_META[1]
    const safeTs = Number.isFinite(timestampMs) ? timestampMs : NaN
    const ageSeconds = Number.isFinite(safeTs) ? (referenceNowMs - safeTs) / 1000 : Infinity
    const activity = computeWildfireActivity(ageSeconds, true)
    const isActive = Number.isFinite(ageSeconds) && ageSeconds < ACTIVE_AGE_SECONDS

    let phaseCohort: PhaseCohort | -1 = -1
    if (isActive) {
      phaseCohort = computeSpatialPhaseCohort(lng, lat)
      cohortAgeSums[phaseCohort] += Math.max(0, ageSeconds)
      cohortCounts[phaseCohort] += 1
      activeSpotCount += 1
    }

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      properties: {
        timestamp: Number.isFinite(safeTs) ? safeTs : 0,
        frp: Number.isFinite(frp) ? frp : 0,
        brightnessK: Number.isFinite(brightnessK) ? brightnessK : 0,
        confidence: Number.isFinite(confidence) ? confidence : 50,
        instrument: sourceMeta.instrument,
        source: sourceMeta.label,
        satellite: satellite ?? '',
        dayNight: dayNight ?? '',
        radiusMeters: sourceMeta.radiusMeters,
        powerScale: computePowerScale(frp),
        certainty: computeConfidenceOpacity(confidence),
        activity,
        phaseCohort,
      },
    })
  }

  const cohortAgeSeconds: [number, number, number, number] = [
    cohortCounts[0] > 0 ? cohortAgeSums[0] / cohortCounts[0] : 0,
    cohortCounts[1] > 0 ? cohortAgeSums[1] / cohortCounts[1] : 0,
    cohortCounts[2] > 0 ? cohortAgeSums[2] / cohortCounts[2] : 0,
    cohortCounts[3] > 0 ? cohortAgeSums[3] / cohortCounts[3] : 0,
  ]

  return {
    featureCollection: {
      type: 'FeatureCollection',
      features,
    },
    cohortAgeSeconds,
    cohortCounts,
    activeSpotCount,
    referenceNowMs,
  }
}

export function summarizeFireSpotsForSensor(
  payload: FirmsLiveSpotsResponse | null,
  sensorFilter: SensorFilter,
): FireSpotsSensorSummary {
  if (!payload) {
    return {
      totalCount: 0,
      modisCount: 0,
      viirsCount: 0,
      maxFrpMw: 0,
      latestAcquiredAtUtc: null,
    }
  }

  if (sensorFilter === 'harmonized') {
    return {
      totalCount: payload.count,
      modisCount: payload.modisCount,
      viirsCount: payload.viirsCount,
      maxFrpMw: payload.maxFrpMw,
      latestAcquiredAtUtc: payload.latestAcquiredAtUtc,
    }
  }

  const sourceLookup = buildSourceLookup(payload.sources ?? [])
  let totalCount = 0
  let modisCount = 0
  let viirsCount = 0
  let maxFrpMw = 0
  let latestMs = -Infinity

  for (const tuple of payload.spots) {
    const [, , timestampMs, frp, , , sourceCode] = tuple
    const meta = sourceLookup.get(sourceCode) ?? DEFAULT_SOURCE_META[1]
    if (meta.instrument !== sensorFilter) {
      continue
    }

    totalCount += 1
    if (meta.instrument === 'modis') {
      modisCount += 1
    } else {
      viirsCount += 1
    }

    if (Number.isFinite(frp) && frp > maxFrpMw) {
      maxFrpMw = frp
    }
    if (Number.isFinite(timestampMs) && timestampMs > latestMs) {
      latestMs = timestampMs
    }
  }

  return {
    totalCount,
    modisCount,
    viirsCount,
    maxFrpMw: Number(maxFrpMw.toFixed(1)),
    latestAcquiredAtUtc: Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : null,
  }
}

export function compareMatchedFireSpots(
  first: Pick<FireSpotTooltipInput, 'frp' | 'timestamp'>,
  second: Pick<FireSpotTooltipInput, 'frp' | 'timestamp'>,
): number {
  const frpDiff = (Number(second.frp) || 0) - (Number(first.frp) || 0)
  if (frpDiff !== 0) {
    return frpDiff
  }
  const secondTs = Number(second.timestamp)
  const firstTs = Number(first.timestamp)
  if (Number.isFinite(firstTs) && Number.isFinite(secondTs)) {
    return secondTs - firstTs
  }
  return 0
}

function formatUtcHhMm(timestampMs: number): string {
  const date = new Date(timestampMs)
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatRelativeAge(timestampMs: number, nowMs: number): string {
  const diffMs = Math.max(0, nowMs - timestampMs)
  const diffMinutes = Math.round(diffMs / 60_000)
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }
  const diffHours = Math.floor(diffMinutes / 60)
  return `${diffHours}h ago`
}

function deduplicateSpotMatches(spots: readonly FireSpotTooltipInput[]): FireSpotTooltipInput[] {
  const seen = new Set<string>()
  const unique: FireSpotTooltipInput[] = []

  for (const spot of spots) {
    if (Number.isFinite(spot.lng) && Number.isFinite(spot.lat)) {
      const key = `${spot.lng!.toFixed(4)}|${spot.lat!.toFixed(4)}|${spot.timestamp}|${spot.source}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
    }
    unique.push(spot)
  }

  return unique
}

export function formatFireSpotsTooltip(
  spots: readonly FireSpotTooltipInput[],
  nowMs = Date.now(),
): FormattedFireSpotsTooltip | null {
  const uniqueSpots = deduplicateSpotMatches(spots)
  if (uniqueSpots.length === 0) {
    return null
  }

  const sorted = [...uniqueSpots].sort(compareMatchedFireSpots)

  if (sorted.length <= MAX_INDIVIDUAL_SPOT_TOOLTIPS) {
    const lines = sorted.map((spot) => {
      const parts: string[] = []
      if (Number.isFinite(spot.timestamp) && spot.timestamp > 0) {
        parts.push(`${formatUtcHhMm(spot.timestamp)} UTC (${formatRelativeAge(spot.timestamp, nowMs)})`)
      }
      const roundedFrp = Math.round((Number(spot.frp) || 0) * 10) / 10
      parts.push(`${roundedFrp} MW`)

      const sourceLabel = spot.satellite
        ? `${spot.source} (${spot.satellite})`
        : spot.source
      if (sourceLabel) {
        parts.push(sourceLabel)
      }

      if (typeof spot.brightnessK === 'number' && Number.isFinite(spot.brightnessK) && spot.brightnessK > 0) {
        const celsius = Math.round(spot.brightnessK - 273.15)
        parts.push(`${spot.brightnessK.toFixed(1)} K (${celsius}\u00b0C)`)
      }

      if (typeof spot.confidence === 'number' && Number.isFinite(spot.confidence)) {
        parts.push(`Conf ${Math.round(spot.confidence)}%`)
      }

      return parts.join(' \u00b7 ')
    })

    return {
      mode: 'individual',
      header:
        sorted.length === 1
          ? 'NASA FIRMS Active Spot'
          : `${sorted.length} Active Fire Spots`,
      lines,
      count: sorted.length,
    }
  }

  let minTs = Infinity
  let maxTs = -Infinity
  let totalFrp = 0
  let maxFrp = 0
  const sourcesSet = new Set<string>()

  for (const spot of sorted) {
    if (Number.isFinite(spot.timestamp) && spot.timestamp > 0) {
      if (spot.timestamp < minTs) minTs = spot.timestamp
      if (spot.timestamp > maxTs) maxTs = spot.timestamp
    }
    const frp = Number(spot.frp) || 0
    totalFrp += frp
    if (frp > maxFrp) {
      maxFrp = frp
    }
    if (spot.source) {
      sourcesSet.add(spot.source)
    }
  }

  const parts: string[] = []
  if (Number.isFinite(minTs) && Number.isFinite(maxTs)) {
    const fromTime = formatUtcHhMm(minTs)
    const toTime = formatUtcHhMm(maxTs)
    const windowStr = fromTime === toTime ? `${toTime} UTC` : `${fromTime}\u2013${toTime} UTC`
    parts.push(`${windowStr} (${formatRelativeAge(maxTs, nowMs)})`)
  }
  parts.push(`${sorted.length}\u00d7 spots`)
  parts.push(
    `${(Math.round(totalFrp * 10) / 10).toLocaleString('en-US')} MW total (peak ${(Math.round(maxFrp * 10) / 10).toLocaleString('en-US')} MW)`,
  )
  if (sourcesSet.size > 0) {
    parts.push([...sourcesSet].join(', '))
  }

  return {
    mode: 'aggregated',
    header: `${sorted.length} Overlapping Fire Spots`,
    lines: [parts.join(' \u00b7 ')],
    count: sorted.length,
  }
}
