import type { Feature, FeatureCollection, Point } from 'geojson'
import type { SensorFilter } from '../data/mapTypes.ts'
import type { FireObservationGeometry } from './fireObservationGeometry.ts'
import {
  buildFireDetectionsTimeline,
  compareMatchedFireSpots,
  normalizeFullSatelliteLabel,
  type FireDetectionsTimeline,
  type NegativePassInput,
} from './fireTimeline.ts'
import {
  evaluateSpotNegativePasses,
  type SatelliteOverpassIndex,
} from './satelliteOverpassTimeline.ts'

export { compareMatchedFireSpots }

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
export const MIN_FIRE_SPOT_ZOOM = 1
export const FULL_DETAIL_FIRE_SPOT_ZOOM = 7
export const DECLUTTER_CELL_DEGREES = [2.5, 1.25, 0.6, 0.3, 0.14, 0.06] as const

export type FireInstrument = 'modis' | 'viirs'
export type FireSensorGroup = FireInstrument | 'both' | 'single'
export type PhaseCohort = 0 | 1 | 2 | 3

export interface FirmsSourceSummary {
  code: number
  dataset: string
  label: string
  instrument: FireInstrument
  radiusMeters: number
  count: number
}

export interface LandCoverSummary {
  dominantCode: number
  coverage: number
  classes: Array<{ code: number; fraction: number }>
}

export interface LandCoverDataset {
  id: string
  year: number
  resolutionMeters: number
  classLabels: Record<number, string>
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
  landCover?: LandCoverSummary | null,
  geometry?: FireObservationGeometry | null,
]

export interface FirmsLiveSpotsResponse {
  generatedAtUtc: string
  fetchedAtUtc: string
  latestAcquiredAtUtc: string | null
  windowStartUtc?: string
  windowEndUtc?: string
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
  landCoverDataset?: LandCoverDataset
  landCoverPending?: boolean
  geometryStatus?: 'pending' | 'unavailable' | 'ready'
  geometryProgress?: { status: 'pending' | 'unavailable' | 'ready'; totalCount: number; readyCount: number; pendingCount: number }
  enrichmentStatus?: 'pending' | 'complete' | 'incomplete'
  weather?: {
    status: 'pending' | 'ready' | 'partial'
    sampledCount: number
    targetCount: number
    eligibleCount: number
    availableCount?: number
    retryCount?: number
    pendingCount?: number
  }
}

export interface FireSpotFeatureProperties {
  spotIndex: number
  screenSensorGroup?: FireSensorGroup
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
  minZoomAll: number
  minZoomModis: number
  minZoomViirs: number
  [key: `sensorGroupAtZoom${number}`]: FireInstrument | 'both' | undefined
}

export type DeclutterGroupMembersBySensor = Record<
  SensorFilter,
  ReadonlyArray<ReadonlyMap<number, readonly number[]>>
>

export interface BuiltFireSpotsData {
  featureCollection: FeatureCollection<Point, FireSpotFeatureProperties>
  cohortAgeSeconds: [number, number, number, number]
  cohortCounts: [number, number, number, number]
  activeSpotCount: number
  referenceNowMs: number
  declutterGroupMembers: DeclutterGroupMembersBySensor
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

export interface FireSpotLandCover {
  dominantCode: number
  dominantLabel: string
  coverage: number
  classes: Array<{ code: number; label: string; fraction: number }>
}

export type FireSpotLandCoverLookup = ReadonlyMap<string, FireSpotLandCover>

export interface AggregatedFireSpotLandCover {
  // Detections that had a land cover summary; group fractions average per detection.
  detectionCount: number
  coverage: number
  classes: Array<{ code: number; label: string; fraction: number }>
}

export interface FormattedFireSpotsTooltip {
  landCoverLabel: string
  landCoverSummary: AggregatedFireSpotLandCover | null
  mode: 'individual' | 'timeline'
  header: string
  lines: string[]
  count: number
  timeline?: FireDetectionsTimeline
}

export interface FormatFireSpotsTooltipOptions {
  landCoverBySpot?: FireSpotLandCoverLookup
  sensorFilter?: SensorFilter
  timeZone?: string
  overpassIndex?: SatelliteOverpassIndex | null
  negativePasses?: readonly NegativePassInput[]
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

export function computeConfidenceBrightness(confidence: number): number {
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
  enrichment?: { landCover: boolean; geometry: boolean; weather?: boolean },
): Promise<FirmsLiveSpotsResponse> {
  const endpoint = apiBaseUrl ? `${apiBaseUrl}/api/fires/spots` : '/api/fires/spots'
  const search = new URLSearchParams({ hours: '24', sensor: 'harmonized' })
  if (enrichment?.landCover) search.set('enrichLandCover', 'true')
  if (enrichment?.geometry) search.set('enrichGeometry', 'true')
  if (enrichment?.weather) search.set('enrichWeather', 'true')
  const url = `${endpoint}?${search}`
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

type DeclutterZoomProp = 'minZoomAll' | 'minZoomModis' | 'minZoomViirs'

/** Computes an integer spatial hash bucket key with cos(lat) longitude scaling for uniform globe spacing. */
function computeDeclutterCellKey(lng: number, lat: number, cellDeg: number): number {
  const safeLat = clamp(lat, -89.999, 89.999)
  const safeLng = ((((lng + 180) % 360) + 360) % 360) - 180
  const cosLat = Math.max(0.2, Math.cos((safeLat * Math.PI) / 180))
  const lngStep = cellDeg / cosLat
  const cellY = Math.floor((safeLat + 90) / cellDeg)
  const cellX = Math.floor((safeLng + 180) / lngStep)
  return cellY * 16384 + cellX
}

/** Assigns additive minZoom tiers (z1..z7) and builds leader -> hidden-member maps per zoom tier. */
function assignDeclutterTierProperty(
  features: Array<Feature<Point, FireSpotFeatureProperties>>,
  sortedIndices: readonly number[],
  prop: DeclutterZoomProp,
): ReadonlyArray<ReadonlyMap<number, readonly number[]>> {
  const occupied = DECLUTTER_CELL_DEGREES.map(() => new Map<number, number>())
  for (const idx of sortedIndices) {
    const feature = features[idx]
    const [lng, lat] = feature.geometry.coordinates
    let assignedZoom = FULL_DETAIL_FIRE_SPOT_ZOOM
    let assignedTierIdx = -1
    for (let tierIdx = 0; tierIdx < DECLUTTER_CELL_DEGREES.length; tierIdx++) {
      const key = computeDeclutterCellKey(lng, lat, DECLUTTER_CELL_DEGREES[tierIdx])
      if (!occupied[tierIdx].has(key)) {
        assignedTierIdx = tierIdx
        assignedZoom = MIN_FIRE_SPOT_ZOOM + tierIdx
        occupied[tierIdx].set(key, idx)
        break
      }
    }
    if (assignedTierIdx >= 0) {
      // Reserve finer grid cells down to z6 so higher-priority spots remain exclusive within their footprint.
      for (let k = assignedTierIdx + 1; k < DECLUTTER_CELL_DEGREES.length; k++) {
        occupied[k].set(computeDeclutterCellKey(lng, lat, DECLUTTER_CELL_DEGREES[k]), idx)
      }
    }
    feature.properties[prop] = assignedZoom
  }

  const groupMembersByTier: Array<Map<number, number[]>> = DECLUTTER_CELL_DEGREES.map(
    () => new Map<number, number[]>(),
  )
  for (let tierIdx = 0; tierIdx < DECLUTTER_CELL_DEGREES.length; tierIdx++) {
    const tierZoom = MIN_FIRE_SPOT_ZOOM + tierIdx
    const cellDeg = DECLUTTER_CELL_DEGREES[tierIdx]
    const cellOwners = occupied[tierIdx]
    const groupMap = groupMembersByTier[tierIdx]

    for (const idx of sortedIndices) {
      const feature = features[idx]
      const assignedZoom = feature.properties[prop]
      const [lng, lat] = feature.geometry.coordinates
      const leaderIdx =
        assignedZoom <= tierZoom
          ? idx
          : (cellOwners.get(computeDeclutterCellKey(lng, lat, cellDeg)) ?? idx)

      let members = groupMap.get(leaderIdx)
      if (!members) {
        members = []
        groupMap.set(leaderIdx, members)
      }
      members.push(idx)
    }
  }

  return groupMembersByTier
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

    const spotIndex = features.length
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
        spotIndex,
        timestamp: Number.isFinite(safeTs) ? safeTs : 0,
        frp: Number.isFinite(frp) ? frp : 0,
        brightnessK: Number.isFinite(brightnessK) ? brightnessK : 0,
        confidence: Number.isFinite(confidence) ? confidence : 50,
        instrument: sourceMeta.instrument,
        source: sourceMeta.label,
        satellite: normalizeFullSatelliteLabel(satellite, sourceMeta.label, sourceMeta.instrument),
        dayNight: dayNight ?? '',
        radiusMeters: sourceMeta.radiusMeters,
        powerScale: computePowerScale(frp),
        certainty: computeConfidenceBrightness(confidence),
        activity,
        phaseCohort,
        minZoomAll: FULL_DETAIL_FIRE_SPOT_ZOOM,
        minZoomModis: FULL_DETAIL_FIRE_SPOT_ZOOM,
        minZoomViirs: FULL_DETAIL_FIRE_SPOT_ZOOM,
      },
    })
  }

  const sortedIndices = Array.from({ length: features.length }, (_, i) => i).sort(
    (a, b) => compareMatchedFireSpots(features[a].properties, features[b].properties) || a - b,
  )
  const harmonizedGroups = assignDeclutterTierProperty(features, sortedIndices, 'minZoomAll')
  for (const [tier, groups] of harmonizedGroups.entries()) {
    const key = `sensorGroupAtZoom${MIN_FIRE_SPOT_ZOOM + tier}` as const
    for (const [leader, members] of groups) {
      if (members.length > 1) {
        const properties = features[leader].properties
        const instrument = properties.instrument
        properties[key] = members.some((member) => features[member].properties.instrument !== instrument)
          ? 'both'
          : instrument
      }
    }
  }
  const modisGroups = assignDeclutterTierProperty(
    features,
    sortedIndices.filter((i) => features[i].properties.instrument === 'modis'),
    'minZoomModis',
  )
  const viirsGroups = assignDeclutterTierProperty(
    features,
    sortedIndices.filter((i) => features[i].properties.instrument === 'viirs'),
    'minZoomViirs',
  )

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
    declutterGroupMembers: {
      harmonized: harmonizedGroups,
      modis: modisGroups,
      viirs: viirsGroups,
    },
  }
}

export function featureToTooltipInput(
  feature: Feature<Point, FireSpotFeatureProperties>,
): FireSpotTooltipInput {
  const [lng, lat] = feature.geometry.coordinates
  const props = feature.properties
  return {
    lng,
    lat,
    timestamp: props.timestamp,
    frp: props.frp,
    brightnessK: props.brightnessK,
    confidence: props.confidence,
    instrument: props.instrument,
    source: props.source,
    satellite: props.satellite,
    dayNight: props.dayNight,
  }
}

export function expandHoveredFireSpots(
  built: BuiltFireSpotsData,
  hitSpotIndices: readonly number[],
  zoom: number,
  sensorFilter: SensorFilter,
): FireSpotTooltipInput[] {
  const features = built.featureCollection.features
  if (features.length === 0 || hitSpotIndices.length === 0) {
    return []
  }

  const expandedIndices = new Set<number>()
  const tierGroups =
    zoom < FULL_DETAIL_FIRE_SPOT_ZOOM
      ? built.declutterGroupMembers[sensorFilter][
          clamp(
            Math.floor(zoom) - MIN_FIRE_SPOT_ZOOM,
            0,
            DECLUTTER_CELL_DEGREES.length - 1,
          )
        ]
      : undefined

  for (const hitIdx of hitSpotIndices) {
    if (!Number.isInteger(hitIdx) || hitIdx < 0 || hitIdx >= features.length) {
      continue
    }
    if (tierGroups) {
      const members = tierGroups.get(hitIdx)
      if (members && members.length > 0) {
        for (const memberIdx of members) {
          expandedIndices.add(memberIdx)
        }
        continue
      }
    }
    expandedIndices.add(hitIdx)
  }

  const results: FireSpotTooltipInput[] = []
  for (const idx of expandedIndices) {
    const feature = features[idx]
    if (!feature) {
      continue
    }
    if (sensorFilter !== 'harmonized' && feature.properties.instrument !== sensorFilter) {
      continue
    }
    results.push(featureToTooltipInput(feature))
  }
  return results
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
  // Global per-sensor counts stay global under a filter: a filtered view must not
  // present the other sensor as zero detections.
  const modisCount = payload.modisCount
  const viirsCount = payload.viirsCount
  let maxFrpMw = 0
  let latestMs = -Infinity

  for (const tuple of payload.spots) {
    const [, , timestampMs, frp, , , sourceCode] = tuple
    const meta = sourceLookup.get(sourceCode) ?? DEFAULT_SOURCE_META[1]
    if (meta.instrument !== sensorFilter) {
      continue
    }

    totalCount += 1

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

function fireSpotKey(lng: number, lat: number, timestamp: number, source: string): string {
  return `${lng.toFixed(4)}|${lat.toFixed(4)}|${timestamp}|${source}`
}

export function buildFireSpotLandCoverLookup(
  payload: FirmsLiveSpotsResponse | null,
): FireSpotLandCoverLookup {
  const labels = payload?.landCoverDataset?.classLabels
  const landCoverBySpot = new Map<string, FireSpotLandCover>()
  if (!payload || !labels) return landCoverBySpot

  const sources = buildSourceLookup(payload.sources ?? [])
  for (const [lng, lat, timestamp, , , , sourceCode, , , landCover] of payload.spots) {
    if (!landCover || !Number.isFinite(lng) || !Number.isFinite(lat)) continue

    const dominantLabel = labels[landCover.dominantCode]
    if (!dominantLabel) continue

    const source = sources.get(sourceCode) ?? DEFAULT_SOURCE_META[1]
    landCoverBySpot.set(fireSpotKey(lng, lat, timestamp, source.label), {
      dominantCode: landCover.dominantCode,
      dominantLabel,
      coverage: landCover.coverage,
      classes: landCover.classes
        .filter(({ code, fraction }) => labels[code] && Number.isFinite(fraction) && fraction > 0)
        .map(({ code, fraction }) => ({ code, label: labels[code], fraction })),
    })
  }
  return landCoverBySpot
}

function lookupSpotLandCover(
  spot: FireSpotTooltipInput,
  landCoverBySpot?: FireSpotLandCoverLookup,
): FireSpotLandCover | undefined {
  const { lng, lat, timestamp, source } = spot
  if (lng === undefined || lat === undefined || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return undefined
  }
  return landCoverBySpot?.get(fireSpotKey(lng, lat, timestamp, source))
}

function summarizeFireSpotLandCover(
  spots: readonly FireSpotTooltipInput[],
  landCoverBySpot?: FireSpotLandCoverLookup,
): string {
  if (!landCoverBySpot?.size) return ''

  const counts = new Map<string, number>()
  for (const spot of spots) {
    const label = lookupSpotLandCover(spot, landCoverBySpot)?.dominantLabel
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts]
    .sort(([first, firstCount], [second, secondCount]) =>
      secondCount - firstCount || first.localeCompare(second, 'en'))
    .slice(0, 3)
    .map(([label]) => label)
    .join(', ')
}

export function aggregateFireSpotLandCover(
  spots: readonly FireSpotTooltipInput[],
  landCoverBySpot?: FireSpotLandCoverLookup,
): AggregatedFireSpotLandCover | null {
  const summaries: FireSpotLandCover[] = []
  for (const spot of spots) {
    const summary = lookupSpotLandCover(spot, landCoverBySpot)
    if (summary) summaries.push(summary)
  }
  if (summaries.length === 0) return null

  const fractionSums = new Map<number, { label: string; sum: number }>()
  let coverageSum = 0
  for (const summary of summaries) {
    coverageSum += Number.isFinite(summary.coverage) ? summary.coverage : 0
    for (const { code, label, fraction } of summary.classes) {
      const entry = fractionSums.get(code) ?? { label, sum: 0 }
      entry.sum += fraction
      fractionSums.set(code, entry)
    }
  }

  return {
    detectionCount: summaries.length,
    coverage: coverageSum / summaries.length,
    classes: [...fractionSums.entries()]
      .map(([code, { label, sum }]) => ({ code, label, fraction: sum / summaries.length }))
      .sort((a, b) => b.fraction - a.fraction || a.label.localeCompare(b.label, 'en')),
  }
}

export function isFireSelectionInPayload(
  inputs: readonly FireSpotTooltipInput[],
  payload: FirmsLiveSpotsResponse | null,
): boolean {
  if (!payload) return false
  const sources = buildSourceLookup(payload.sources ?? [])
  const keys = new Set<string>()
  for (const [lng, lat, timestamp, , , , sourceCode] of payload.spots) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const source = sources.get(sourceCode) ?? DEFAULT_SOURCE_META[1]
    keys.add(fireSpotKey(lng, lat, timestamp, source.label))
  }
  return inputs.some(
    (spot) =>
      Number.isFinite(spot.lng) &&
      Number.isFinite(spot.lat) &&
      keys.has(fireSpotKey(spot.lng!, spot.lat!, spot.timestamp, spot.source)),
  )
}

export function deduplicateSpotMatches(spots: readonly FireSpotTooltipInput[]): FireSpotTooltipInput[] {
  const seen = new Set<string>()
  const unique: FireSpotTooltipInput[] = []

  for (const spot of spots) {
    if (Number.isFinite(spot.lng) && Number.isFinite(spot.lat)) {
      const key = fireSpotKey(spot.lng!, spot.lat!, spot.timestamp, spot.source)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
    }
    unique.push(spot)
  }

  return unique
}

export function classifyFireSensorGroup(
  spots: readonly Pick<FireSpotTooltipInput, 'instrument'>[],
): FireSensorGroup | null {
  if (spots.length === 1) {
    return 'single'
  }
  const hasModis = spots.some((spot) => spot.instrument === 'modis')
  const hasViirs = spots.some((spot) => spot.instrument === 'viirs')
  if (hasModis && hasViirs) {
    return 'both'
  }
  const instrument = spots[0]?.instrument
  return instrument && spots.every((spot) => spot.instrument === instrument) ? instrument : null
}

export function formatFireSpotsTooltip(
  spots: readonly FireSpotTooltipInput[],
  nowMs = Date.now(),
  options: FormatFireSpotsTooltipOptions = {},
): FormattedFireSpotsTooltip | null {
  const uniqueSpots = deduplicateSpotMatches(spots)
  if (uniqueSpots.length === 0) {
    return null
  }

  const sensorFilter = options.sensorFilter ?? 'harmonized'
  const negativePasses =
    options.negativePasses ??
    (options.overpassIndex
      ? evaluateSpotNegativePasses(options.overpassIndex, uniqueSpots, {
          nowMs,
          sensorFilter,
        })
      : undefined)

  const timeline = buildFireDetectionsTimeline(uniqueSpots, {
    nowMs,
    sensorFilter,
    timeZone: options.timeZone,
    negativePasses,
  })

  return {
    mode: 'timeline',
    landCoverLabel: summarizeFireSpotLandCover(uniqueSpots, options.landCoverBySpot),
    landCoverSummary: aggregateFireSpotLandCover(uniqueSpots, options.landCoverBySpot),
    header:
      uniqueSpots.length === 1
        ? '1 Fire Detection'
        : `${uniqueSpots.length} Grouped Fire Detections`,
    lines: [timeline.accessibleSummary],
    count: uniqueSpots.length,
    timeline,
  }
}
