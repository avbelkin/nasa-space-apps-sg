import { DEFAULT_SATELLITE_COLOR, SATELLITE_COLORS } from '../data/dataPalette.ts'
import type { SensorFilter } from '../data/mapTypes.ts'
import type { FireInstrument, FireSpotTooltipInput } from './fireSpots.ts'
import { computeSubsolarPoint } from './nightLightsShader.ts'

export const TIMELINE_SLOT_COUNT = 24
export const TIMELINE_WINDOW_HOURS = 24
export const TIMELINE_SLOT_MS = 3_600_000
export const SUNRISE_SUNSET_ALTITUDE_DEG = -0.833
export const MIN_TIMELINE_BAR_HEIGHT_PCT = 16
export const MIN_TIMELINE_CONFIDENCE_OPACITY = 0.32

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const SUN_SAMPLE_STEPS = 144
const SUN_BOUNDARY_MARGIN_MS = 15 * 60_000
const SUN_VIEWBOX_WIDTH = 240
const SUN_VIEWBOX_HEIGHT = 100
const SUN_HORIZON_Y = 52
const SUN_HALF_SPAN_Y = 40
const SUN_MIN_EFFECTIVE_ALT_RANGE_DEG = 25
const SUNRISE_SUNSET_ALTITUDE_SIN = Math.sin(SUNRISE_SUNSET_ALTITUDE_DEG * DEG_TO_RAD)
const SUN_MIN_EFFECTIVE_ALT_SIN_RANGE = Math.sin(SUN_MIN_EFFECTIVE_ALT_RANGE_DEG * DEG_TO_RAD)
const PAST_WINDOW_GRACE_MS = 30 * 60_000

const localTimeFormatterCache = new Map<string, Intl.DateTimeFormat>()

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getLocalTimeFormatter(timeZone?: string): Intl.DateTimeFormat {
  const key = timeZone?.trim() || '__local__'
  let formatter = localTimeFormatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    })
    localTimeFormatterCache.set(key, formatter)
  }
  return formatter
}

export function formatBrowserLocalHhMm(timestampMs: number, timeZone?: string): string {
  if (!Number.isFinite(timestampMs)) {
    return '--:--'
  }
  return getLocalTimeFormatter(timeZone).format(new Date(timestampMs))
}

export function compareMatchedFireSpots(
  first: Pick<FireSpotTooltipInput, 'frp' | 'timestamp' | 'confidence'>,
  second: Pick<FireSpotTooltipInput, 'frp' | 'timestamp' | 'confidence'>,
): number {
  const frpDiff = (Number(second.frp) || 0) - (Number(first.frp) || 0)
  if (frpDiff !== 0) {
    return frpDiff
  }
  const secondTs = Number(second.timestamp)
  const firstTs = Number(first.timestamp)
  if (Number.isFinite(firstTs) && Number.isFinite(secondTs)) {
    const tsDiff = secondTs - firstTs
    if (tsDiff !== 0) {
      return tsDiff
    }
  }
  const secondConf = Number(second.confidence)
  const firstConf = Number(first.confidence)
  if (Number.isFinite(firstConf) && Number.isFinite(secondConf)) {
    return secondConf - firstConf
  }
  return 0
}

export function normalizeFullSatelliteLabel(
  satellite?: string,
  source?: string,
  instrument?: FireInstrument,
): string {
  const trimmed = (satellite ?? '').trim()
  switch (trimmed.toUpperCase()) {
    case 'T':
    case 'TERRA':
      return 'Terra'
    case 'A':
    case 'AQUA':
      return 'Aqua'
    case '1':
    case 'J1':
    case 'N20':
    case 'NOAA-20':
    case 'NOAA20':
      return 'NOAA-20'
    case '2':
    case 'J2':
    case 'N21':
    case 'NOAA-21':
    case 'NOAA21':
      return 'NOAA-21'
    case 'N':
    case 'SNPP':
    case 'SUOMI NPP':
    case 'SUOMI-NPP':
      return 'Suomi NPP'
    default: {
      const upperSource = (source ?? '').toUpperCase()
      if (upperSource.includes('NOAA-20') || upperSource.includes('NOAA20') || upperSource.includes('VJ1')) {
        return 'NOAA-20'
      }
      if (upperSource.includes('NOAA-21') || upperSource.includes('NOAA21') || upperSource.includes('VJ2')) {
        return 'NOAA-21'
      }
      if (upperSource.includes('SNPP') || upperSource.includes('SUOMI') || upperSource.includes('VNP')) {
        return 'Suomi NPP'
      }
      if (trimmed.length > 0) {
        return trimmed
      }
      return instrument === 'modis' ? 'MODIS' : 'VIIRS'
    }
  }
}

export function normalizeShortSatelliteLabel(
  satellite?: string,
  source?: string,
  instrument?: FireInstrument,
): string {
  const full = normalizeFullSatelliteLabel(satellite, source, instrument)
  if (full === 'Suomi NPP') {
    return 'SNPP'
  }
  return full
}

export function computeClusterCentroid(spots: readonly FireSpotTooltipInput[]): [number, number] {
  let sumLat = 0
  let sumSinLng = 0
  let sumCosLng = 0
  let count = 0
  let fallbackLng = 0

  for (const spot of spots) {
    if (
      typeof spot.lng !== 'number' ||
      typeof spot.lat !== 'number' ||
      !Number.isFinite(spot.lng) ||
      !Number.isFinite(spot.lat)
    ) {
      continue
    }
    if (count === 0) {
      fallbackLng = spot.lng
    }
    const lngRad = spot.lng * DEG_TO_RAD
    sumSinLng += Math.sin(lngRad)
    sumCosLng += Math.cos(lngRad)
    sumLat += clamp(spot.lat, -90, 90)
    count += 1
  }

  if (count === 0) {
    return [0, 0]
  }

  const meanLat = sumLat / count
  const meanLng =
    Math.hypot(sumSinLng, sumCosLng) < 1e-12
      ? fallbackLng
      : Math.atan2(sumSinLng, sumCosLng) * RAD_TO_DEG
  return [meanLng, meanLat]
}

export function computeSolarAltitudeSin(unixMs: number, latDeg: number, lngDeg: number): number {
  const subsolar = computeSubsolarPoint(unixMs)
  const latRad = clamp(latDeg, -90, 90) * DEG_TO_RAD
  const lonRad = lngDeg * DEG_TO_RAD
  return clamp(
    Math.sin(latRad) * Math.sin(subsolar.latRad) +
      Math.cos(latRad) * Math.cos(subsolar.latRad) * Math.cos(lonRad - subsolar.lonRad),
    -1,
    1,
  )
}

export function computeSolarAltitudeDeg(unixMs: number, latDeg: number, lngDeg: number): number {
  return Math.asin(computeSolarAltitudeSin(unixMs, latDeg, lngDeg)) * RAD_TO_DEG
}

function refineCrossingTimestampMs(
  tStartMs: number,
  tEndMs: number,
  evalStart: number,
  evalFn: (ms: number) => number,
): number {
  let low = tStartMs
  let high = tEndMs
  let lowVal = evalStart
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) * 0.5
    const midVal = evalFn(mid)
    if ((lowVal <= 0 && midVal <= 0) || (lowVal >= 0 && midVal >= 0)) {
      low = mid
      lowVal = midVal
    } else {
      high = mid
    }
  }
  return (low + high) * 0.5
}

export interface PlaceSunTimeline {
  latDeg: number
  lngDeg: number
  viewBoxWidth: number
  viewBoxHeight: number
  horizonY: number
  pathD: string
  nowX: number
  nowY: number
  nowYPct: number
  isDaylightNow: boolean
  polarState: 'normal' | 'polar-day' | 'polar-night'
  sunriseMs: number | null
  sunsetMs: number | null
  sunriseLabel: string | null
  sunsetLabel: string | null
}

export function computePlaceSunTimeline(
  latDeg: number,
  lngDeg: number,
  windowStartMs: number,
  windowEndMs: number,
  timeZone?: string,
): PlaceSunTimeline {
  const safeSpanMs = Math.max(TIMELINE_SLOT_MS, windowEndMs - windowStartMs)
  const evalEffectiveAlt = (ms: number) =>
    computeSolarAltitudeSin(ms, latDeg, lngDeg) - SUNRISE_SUNSET_ALTITUDE_SIN

  const sampleEffectiveAlts: number[] = []
  let maxAbsEffectiveAlt = 0
  let allAbove = true
  let allBelow = true

  for (let i = 0; i <= SUN_SAMPLE_STEPS; i++) {
    const t = windowStartMs + (i / SUN_SAMPLE_STEPS) * safeSpanMs
    const effAlt = evalEffectiveAlt(t)
    sampleEffectiveAlts.push(effAlt)
    maxAbsEffectiveAlt = Math.max(maxAbsEffectiveAlt, Math.abs(effAlt))
    if (effAlt < 0) allAbove = false
    if (effAlt >= 0) allBelow = false
  }

  const scanCrossings = (scanStartMs: number, scanEndMs: number) => {
    const stepMs = 15 * 60_000
    const steps = Math.max(1, Math.ceil((scanEndMs - scanStartMs) / stepMs))
    let prevT = scanStartMs
    let prevAlt = evalEffectiveAlt(prevT)
    let latestSunrise: number | null = null
    let latestSunset: number | null = null

    for (let i = 1; i <= steps; i++) {
      const currT = scanStartMs + (i / steps) * (scanEndMs - scanStartMs)
      const currAlt = evalEffectiveAlt(currT)
      if (prevAlt < 0 && currAlt >= 0) {
        latestSunrise = refineCrossingTimestampMs(prevT, currT, prevAlt, evalEffectiveAlt)
      } else if (prevAlt >= 0 && currAlt < 0) {
        latestSunset = refineCrossingTimestampMs(prevT, currT, prevAlt, evalEffectiveAlt)
      }
      prevT = currT
      prevAlt = currAlt
    }

    return { latestSunrise, latestSunset }
  }

  let { latestSunrise: sunriseMs, latestSunset: sunsetMs } = scanCrossings(
    windowStartMs,
    windowEndMs,
  )

  if (sunriseMs === null || sunsetMs === null) {
    const extended = scanCrossings(
      windowStartMs - SUN_BOUNDARY_MARGIN_MS,
      windowEndMs + SUN_BOUNDARY_MARGIN_MS,
    )
    if (sunriseMs === null) {
      sunriseMs = extended.latestSunrise
    }
    if (sunsetMs === null) {
      sunsetMs = extended.latestSunset
    }
  }

  const polarState: PlaceSunTimeline['polarState'] =
    sunriseMs === null && sunsetMs === null
      ? allAbove
        ? 'polar-day'
        : allBelow
          ? 'polar-night'
          : 'normal'
      : 'normal'

  const denom = Math.max(SUN_MIN_EFFECTIVE_ALT_SIN_RANGE, maxAbsEffectiveAlt)
  const mapY = (effectiveAlt: number) =>
    clamp(SUN_HORIZON_Y - (effectiveAlt / denom) * SUN_HALF_SPAN_Y, 6, 96)

  const segments: string[] = []
  for (let i = 0; i <= SUN_SAMPLE_STEPS; i++) {
    const x = (i / SUN_SAMPLE_STEPS) * SUN_VIEWBOX_WIDTH
    const y = mapY(sampleEffectiveAlts[i])
    segments.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
  }

  const nowEffectiveAlt = sampleEffectiveAlts[sampleEffectiveAlts.length - 1]
  const nowY = mapY(nowEffectiveAlt)
  const nowYPct = Number(((nowY / SUN_VIEWBOX_HEIGHT) * 100).toFixed(2))

  return {
    latDeg,
    lngDeg,
    viewBoxWidth: SUN_VIEWBOX_WIDTH,
    viewBoxHeight: SUN_VIEWBOX_HEIGHT,
    horizonY: SUN_HORIZON_Y,
    pathD: segments.join(' '),
    nowX: SUN_VIEWBOX_WIDTH,
    nowY: Number(nowY.toFixed(2)),
    nowYPct,
    isDaylightNow: nowEffectiveAlt >= 0,
    polarState,
    sunriseMs,
    sunsetMs,
    sunriseLabel: sunriseMs !== null ? formatBrowserLocalHhMm(sunriseMs, timeZone) : null,
    sunsetLabel: sunsetMs !== null ? formatBrowserLocalHhMm(sunsetMs, timeZone) : null,
  }
}

export function resolveSatellitePaletteColor(
  satellite?: string,
  source?: string,
  instrument?: FireInstrument,
): string {
  switch (normalizeFullSatelliteLabel(satellite, source, instrument)) {
    case 'Terra':
      return SATELLITE_COLORS.terra
    case 'Aqua':
      return SATELLITE_COLORS.aqua
    case 'NOAA-20':
      return SATELLITE_COLORS['noaa-20']
    case 'NOAA-21':
      return SATELLITE_COLORS['noaa-21']
    default:
      return DEFAULT_SATELLITE_COLOR
  }
}

export function computeTimelineConfidenceOpacity(confidence?: number): number {
  const safeConfidence =
    typeof confidence === 'number' && Number.isFinite(confidence) ? clamp(confidence, 0, 100) : 50
  return Number(
    (MIN_TIMELINE_CONFIDENCE_OPACITY + (1 - MIN_TIMELINE_CONFIDENCE_OPACITY) * (safeConfidence / 100)).toFixed(
      3,
    ),
  )
}

function formatLagDurationLabel(lagMinutes: number): string {
  const hours = Math.round((lagMinutes / 60) * 10) / 10
  return `~${hours}h`
}

function getProcessingCutoffConfig(sensorFilter: SensorFilter): {
  lagMinutes: number
  shortLabel: string
} {
  switch (sensorFilter) {
    case 'viirs':
      return { lagMinutes: 90, shortLabel: '~1.5h lag' }
    case 'modis':
      return { lagMinutes: 120, shortLabel: '~2h lag' }
    default:
      return { lagMinutes: 120, shortLabel: '~1.5\u20132h lag' }
  }
}

export interface PositiveTimelineSubBar {
  kind: 'detection'
  timestampMs: number
  localTimeLabel: string
  frpMw: number
  heightPct: number
  confidence: number
  opacity: number
  color: string
  satellite: string
  shortSatellite: string
  instrument: FireInstrument
  source: string
  mergedCount: number
}

export interface NegativeTimelineSubBar {
  kind: 'non-detection' | 'pending'
  timestampMs: number
  localTimeLabel: string
  satellite: string
  shortSatellite: string
  color: string
  instrument: FireInstrument
  isNadir?: boolean
  distanceKm?: number
  ingestionLagMinutes?: number
}

export type TimelineSubBar = PositiveTimelineSubBar | NegativeTimelineSubBar

export interface PositiveTimelineDetection {
  kind: 'detection'
  slotIndex: number
  slotStartMs: number
  slotEndMs: number
  timestampMs: number
  localTimeLabel: string
  frpMw: number
  heightPct: number
  confidence: number
  opacity: number
  color: string
  satellite: string
  shortSatellite: string
  label: string
  tooltipTitle: string
  instrument: FireInstrument
  source: string
  mergedCount: number
  subBars: TimelineSubBar[]
}

export interface NegativeTimelinePass {
  kind: 'non-detection' | 'pending'
  slotIndex: number
  slotStartMs: number
  slotEndMs: number
  timestampMs: number
  localTimeLabel: string
  satellite: string
  shortSatellite: string
  label: string
  tooltipTitle: string
  color: string
  instrument: FireInstrument
  isNadir?: boolean
  distanceKm?: number
  ingestionLagMinutes?: number
  subBars: TimelineSubBar[]
}

export type TimelineSlotObservation = PositiveTimelineDetection | NegativeTimelinePass

export interface NegativePassInput {
  timestampMs: number
  satellite: string
  instrument: FireInstrument
  isNadir?: boolean
  distanceKm?: number
  ingestionLagMinutes?: number
  status?: 'non-detection' | 'pending'
}

export interface TimelineProcessingCutoff {
  sensorFilter: SensorFilter
  lagMinutes: number
  cutoffStartMs: number
  cutoffEndMs: number
  startPct: number
  widthPct: number
  shortLabel: string
  nonDetectionCount: number
  pendingCount: number
}

export interface TimelineAccessibleRow {
  timeLabel: string
  satellite: string
  status: string
  detail: string
}

export interface TimelineAxisTick {
  slotIndex: number
  label: string
  relativeLabel: string
}

export interface FireDetectionsTimeline {
  windowStartMs: number
  windowEndMs: number
  centroidLngLat: [number, number]
  detectionCount: number
  totalFrpMw: number
  peakFrpMw: number
  singleSpotDetail: string | null
  processingCutoff: TimelineProcessingCutoff
  sun: PlaceSunTimeline
  slots: Array<TimelineSlotObservation | null>
  axisTicks: TimelineAxisTick[]
  accessibleRows: TimelineAccessibleRow[]
  accessibleSummary: string
}

export interface BuildFireTimelineOptions {
  nowMs?: number
  sensorFilter?: SensorFilter
  timeZone?: string
  negativePasses?: readonly NegativePassInput[]
}

function compareNegativePasses(first: NegativeTimelineSubBar, second: NegativeTimelineSubBar): number {
  const firstNadirRank = first.isNadir ? 0 : 1
  const secondNadirRank = second.isNadir ? 0 : 1
  const firstDist =
    typeof first.distanceKm === 'number' && Number.isFinite(first.distanceKm)
      ? first.distanceKm
      : firstNadirRank * 1000
  const secondDist =
    typeof second.distanceKm === 'number' && Number.isFinite(second.distanceKm)
      ? second.distanceKm
      : secondNadirRank * 1000
  if (firstDist !== secondDist) {
    return firstDist - secondDist
  }
  return second.timestampMs - first.timestampMs
}

function formatSubBarTooltipTitle(sub: TimelineSubBar, fallbackLagMinutes: number): string {
  if (sub.kind === 'detection') {
    const mergedLabel = sub.mergedCount > 1 ? ` \u00b7 ${sub.mergedCount} spots` : ''
    return `${sub.localTimeLabel} \u00b7 ${sub.satellite} \u00b7 ${sub.frpMw} MW \u00b7 Conf ${Math.round(sub.confidence)}%${mergedLabel}`
  }
  if (sub.kind === 'pending') {
    const lagLabel = formatLagDurationLabel(sub.ingestionLagMinutes ?? fallbackLagMinutes)
    return `${sub.localTimeLabel} \u00b7 ${sub.satellite} overpass (in processing, ${lagLabel} lag)`
  }
  const nadirNote = sub.isNadir ? ', near nadir' : ''
  return `${sub.localTimeLabel} \u00b7 ${sub.satellite} overpass (no detection${nadirNote})`
}

export function buildFireDetectionsTimeline(
  spots: readonly FireSpotTooltipInput[],
  options: BuildFireTimelineOptions = {},
): FireDetectionsTimeline {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs! : Date.now()
  const sensorFilter = options.sensorFilter ?? 'harmonized'
  const timeZone = options.timeZone

  let maxSpotTs = -Infinity
  let minSpotTs = Infinity
  let totalFrp = 0
  let peakFrp = 0
  const satellitesSet = new Set<string>()

  for (const spot of spots) {
    if (Number.isFinite(spot.timestamp) && spot.timestamp > 0) {
      if (spot.timestamp > maxSpotTs) maxSpotTs = spot.timestamp
      if (spot.timestamp < minSpotTs) minSpotTs = spot.timestamp
    }
    const frp = Number.isFinite(spot.frp) ? Math.max(0, Number(spot.frp)) : 0
    totalFrp += frp
    if (frp > peakFrp) {
      peakFrp = frp
    }
    const sat = normalizeFullSatelliteLabel(spot.satellite, spot.source, spot.instrument)
    if (sat) {
      satellitesSet.add(sat)
    }
  }

  const windowEndMs = Number.isFinite(maxSpotTs) ? Math.max(nowMs, maxSpotTs) : nowMs
  const windowStartMs = windowEndMs - TIMELINE_WINDOW_HOURS * TIMELINE_SLOT_MS
  const centroidLngLat = computeClusterCentroid(spots)
  const sun = computePlaceSunTimeline(
    centroidLngLat[1],
    centroidLngLat[0],
    windowStartMs,
    windowEndMs,
    timeZone,
  )

  interface PositiveSatCandidate {
    winner: FireSpotTooltipInput
    mergedCount: number
  }

  const positiveBySlot = Array.from(
    { length: TIMELINE_SLOT_COUNT },
    () => new Map<string, PositiveSatCandidate>(),
  )

  for (const spot of spots) {
    if (!Number.isFinite(spot.timestamp) || spot.timestamp <= 0) {
      continue
    }
    if (spot.timestamp < windowStartMs - PAST_WINDOW_GRACE_MS || spot.timestamp > windowEndMs) {
      continue
    }
    const rawIdx = Math.floor((spot.timestamp - windowStartMs) / TIMELINE_SLOT_MS)
    const slotIndex = clamp(rawIdx, 0, TIMELINE_SLOT_COUNT - 1)
    const instrument: FireInstrument = spot.instrument === 'modis' ? 'modis' : 'viirs'
    const satName = normalizeFullSatelliteLabel(spot.satellite, spot.source, instrument)
    const slotMap = positiveBySlot[slotIndex]
    const existing = slotMap.get(satName)
    if (!existing) {
      slotMap.set(satName, { winner: spot, mergedCount: 1 })
    } else {
      const winner = compareMatchedFireSpots(spot, existing.winner) < 0 ? spot : existing.winner
      slotMap.set(satName, {
        winner,
        mergedCount: existing.mergedCount + 1,
      })
    }
  }

  let peakSlotFrpMw = 0
  for (const slotMap of positiveBySlot) {
    for (const candidate of slotMap.values()) {
      const frp = Number.isFinite(candidate.winner.frp) ? Math.max(0, candidate.winner.frp) : 0
      if (frp > peakSlotFrpMw) {
        peakSlotFrpMw = frp
      }
    }
  }

  const positiveSubBarsBySlot: Array<Map<string, PositiveTimelineSubBar>> = positiveBySlot.map(
    (slotMap) => {
      const built = new Map<string, PositiveTimelineSubBar>()
      for (const [satName, candidate] of slotMap) {
        const { winner, mergedCount } = candidate
        const instrument: FireInstrument = winner.instrument === 'modis' ? 'modis' : 'viirs'
        const frpMw =
          Math.round((Number.isFinite(winner.frp) ? Math.max(0, winner.frp) : 0) * 10) / 10
        const scaleCeilingMw = Math.max(peakSlotFrpMw, 1)
        const heightPct =
          peakSlotFrpMw > 0
            ? Math.round(
                (MIN_TIMELINE_BAR_HEIGHT_PCT +
                  (100 - MIN_TIMELINE_BAR_HEIGHT_PCT) * clamp(frpMw / scaleCeilingMw, 0, 1)) *
                  10,
              ) / 10
            : MIN_TIMELINE_BAR_HEIGHT_PCT
        const confidence =
          typeof winner.confidence === 'number' && Number.isFinite(winner.confidence)
            ? clamp(Math.round(winner.confidence), 0, 100)
            : 50
        const satellite = normalizeFullSatelliteLabel(winner.satellite, winner.source, instrument)
        const shortSatellite = normalizeShortSatelliteLabel(
          winner.satellite,
          winner.source,
          instrument,
        )

        built.set(satName, {
          kind: 'detection',
          timestampMs: winner.timestamp,
          localTimeLabel: formatBrowserLocalHhMm(winner.timestamp, timeZone),
          frpMw,
          heightPct,
          confidence,
          opacity: computeTimelineConfidenceOpacity(confidence),
          color: resolveSatellitePaletteColor(winner.satellite, winner.source, instrument),
          satellite,
          shortSatellite,
          instrument,
          source: winner.source,
          mergedCount,
        })
      }
      return built
    },
  )

  const negativeSubBarsBySlot: Array<Map<string, NegativeTimelineSubBar>> = Array.from(
    { length: TIMELINE_SLOT_COUNT },
    () => new Map<string, NegativeTimelineSubBar>(),
  )

  const cutoffConfig = getProcessingCutoffConfig(sensorFilter)

  if (options.negativePasses) {
    for (const pass of options.negativePasses) {
      if (
        !Number.isFinite(pass.timestampMs) ||
        pass.timestampMs < windowStartMs - PAST_WINDOW_GRACE_MS ||
        pass.timestampMs > windowEndMs
      ) {
        continue
      }
      const slotIndex = clamp(
        Math.floor((pass.timestampMs - windowStartMs) / TIMELINE_SLOT_MS),
        0,
        TIMELINE_SLOT_COUNT - 1,
      )
      const satellite = normalizeFullSatelliteLabel(pass.satellite, undefined, pass.instrument)
      if (positiveSubBarsBySlot[slotIndex].has(satellite)) {
        continue
      }

      const shortSatellite = normalizeShortSatelliteLabel(
        pass.satellite,
        undefined,
        pass.instrument,
      )
      const kind: NegativeTimelineSubBar['kind'] =
        pass.status === 'pending' ? 'pending' : 'non-detection'
      const candidateSubBar: NegativeTimelineSubBar = {
        kind,
        timestampMs: pass.timestampMs,
        localTimeLabel: formatBrowserLocalHhMm(pass.timestampMs, timeZone),
        satellite,
        shortSatellite,
        color: resolveSatellitePaletteColor(pass.satellite, undefined, pass.instrument),
        instrument: pass.instrument,
        isNadir: pass.isNadir,
        distanceKm: pass.distanceKm,
        ingestionLagMinutes: pass.ingestionLagMinutes,
      }

      const existing = negativeSubBarsBySlot[slotIndex].get(satellite)
      if (!existing || compareNegativePasses(candidateSubBar, existing) < 0) {
        negativeSubBarsBySlot[slotIndex].set(satellite, candidateSubBar)
      }
    }
  }

  let nonDetectionCount = 0
  let pendingCount = 0
  const accessibleRows: TimelineAccessibleRow[] = []

  const slots: Array<TimelineSlotObservation | null> = Array.from(
    { length: TIMELINE_SLOT_COUNT },
    (_, slotIndex) => {
      const slotStartMs = windowStartMs + slotIndex * TIMELINE_SLOT_MS
      const slotEndMs = slotStartMs + TIMELINE_SLOT_MS
      const posSubs = [...positiveSubBarsBySlot[slotIndex].values()]
      const negSubs = [...negativeSubBarsBySlot[slotIndex].values()]
      const subBars: TimelineSubBar[] = [...posSubs, ...negSubs].sort(
        (a, b) => a.timestampMs - b.timestampMs,
      )
      if (subBars.length === 0) {
        return null
      }

      for (const sub of subBars) {
        if (sub.kind === 'detection') {
          accessibleRows.push({
            timeLabel: sub.localTimeLabel,
            satellite: sub.satellite,
            status: 'Detected',
            detail: `${sub.frpMw} MW, Conf ${Math.round(sub.confidence)}%${
              sub.mergedCount > 1 ? `, ${sub.mergedCount} spots` : ''
            }`,
          })
        } else if (sub.kind === 'non-detection') {
          nonDetectionCount += 1
          accessibleRows.push({
            timeLabel: sub.localTimeLabel,
            satellite: sub.satellite,
            status: 'No detection',
            detail: sub.isNadir ? 'Near-nadir swath overpass' : 'Wide-swath overpass',
          })
        } else {
          pendingCount += 1
          const lagStr = formatLagDurationLabel(sub.ingestionLagMinutes ?? cutoffConfig.lagMinutes)
          accessibleRows.push({
            timeLabel: sub.localTimeLabel,
            satellite: sub.satellite,
            status: 'In processing',
            detail: `Overpass within ${lagStr} NRT lag`,
          })
        }
      }

      const tooltipTitle = subBars
        .map((sub) => formatSubBarTooltipTitle(sub, cutoffConfig.lagMinutes))
        .join(' / ')

      if (posSubs.length > 0) {
        let winner = posSubs[0]
        for (let i = 1; i < posSubs.length; i++) {
          const cand = posSubs[i]
          if (
            cand.frpMw > winner.frpMw ||
            (cand.frpMw === winner.frpMw && cand.timestampMs > winner.timestampMs)
          ) {
            winner = cand
          }
        }
        const label =
          subBars.length > 1 ? `${winner.shortSatellite} +${subBars.length - 1}` : winner.shortSatellite
        return {
          kind: 'detection',
          slotIndex,
          slotStartMs,
          slotEndMs,
          timestampMs: winner.timestampMs,
          localTimeLabel: winner.localTimeLabel,
          frpMw: winner.frpMw,
          heightPct: winner.heightPct,
          confidence: winner.confidence,
          opacity: winner.opacity,
          color: winner.color,
          satellite: winner.satellite,
          shortSatellite: winner.shortSatellite,
          label,
          tooltipTitle,
          instrument: winner.instrument,
          source: winner.source,
          mergedCount: winner.mergedCount,
          subBars,
        }
      }

      const confirmedNegs = negSubs.filter((sub) => sub.kind === 'non-detection')
      const pool = confirmedNegs.length > 0 ? confirmedNegs : negSubs
      let winner = pool[0]
      for (let i = 1; i < pool.length; i++) {
        if (compareNegativePasses(pool[i], winner) < 0) {
          winner = pool[i]
        }
      }
      const label =
        subBars.length > 1 ? `${winner.shortSatellite} +${subBars.length - 1}` : winner.shortSatellite
      return {
        kind: winner.kind,
        slotIndex,
        slotStartMs,
        slotEndMs,
        timestampMs: winner.timestampMs,
        localTimeLabel: winner.localTimeLabel,
        satellite: winner.satellite,
        shortSatellite: winner.shortSatellite,
        label,
        tooltipTitle,
        color: winner.color,
        instrument: winner.instrument,
        isNadir: winner.isNadir,
        distanceKm: winner.distanceKm,
        ingestionLagMinutes: winner.ingestionLagMinutes,
        subBars,
      }
    },
  )

  const totalSpanMs = Math.max(TIMELINE_SLOT_MS, windowEndMs - windowStartMs)
  const cutoffEndMs = clamp(nowMs, windowStartMs, windowEndMs)
  const cutoffStartMs = clamp(
    nowMs - cutoffConfig.lagMinutes * 60_000,
    windowStartMs,
    cutoffEndMs,
  )
  const processingCutoff: TimelineProcessingCutoff = {
    sensorFilter,
    lagMinutes: cutoffConfig.lagMinutes,
    cutoffStartMs,
    cutoffEndMs,
    startPct: Number((((cutoffStartMs - windowStartMs) / totalSpanMs) * 100).toFixed(2)),
    widthPct: Number((((cutoffEndMs - cutoffStartMs) / totalSpanMs) * 100).toFixed(2)),
    shortLabel: cutoffConfig.shortLabel,
    nonDetectionCount,
    pendingCount,
  }

  const axisTicks: TimelineAxisTick[] = [
    {
      slotIndex: 0,
      label: formatBrowserLocalHhMm(windowStartMs, timeZone),
      relativeLabel: '-24h',
    },
    {
      slotIndex: 6,
      label: formatBrowserLocalHhMm(windowStartMs + 6 * TIMELINE_SLOT_MS, timeZone),
      relativeLabel: '-18h',
    },
    {
      slotIndex: 12,
      label: formatBrowserLocalHhMm(windowStartMs + 12 * TIMELINE_SLOT_MS, timeZone),
      relativeLabel: '-12h',
    },
    {
      slotIndex: 18,
      label: formatBrowserLocalHhMm(windowStartMs + 18 * TIMELINE_SLOT_MS, timeZone),
      relativeLabel: '-6h',
    },
    {
      slotIndex: 24,
      label: formatBrowserLocalHhMm(windowEndMs, timeZone),
      relativeLabel: 'Now',
    },
  ]

  const roundedTotalFrp = Math.round(totalFrp * 10) / 10
  const roundedPeakFrp = Math.round(peakFrp * 10) / 10

  let singleSpotDetail: string | null = null
  if (spots.length === 1) {
    const spot = spots[0]
    const detailParts = [`${roundedPeakFrp} MW`]
    if (
      typeof spot.brightnessK === 'number' &&
      Number.isFinite(spot.brightnessK) &&
      spot.brightnessK > 0
    ) {
      const celsius = Math.round(spot.brightnessK - 273.15)
      detailParts.push(`${spot.brightnessK.toFixed(1)} K (${celsius}\u00b0C)`)
    }
    if (typeof spot.confidence === 'number' && Number.isFinite(spot.confidence)) {
      detailParts.push(`Conf ${Math.round(spot.confidence)}%`)
    }
    singleSpotDetail = detailParts.join(' \u00b7 ')
  }

  const timeRangeStr =
    Number.isFinite(minSpotTs) && Number.isFinite(maxSpotTs)
      ? minSpotTs === maxSpotTs
        ? `${formatBrowserLocalHhMm(minSpotTs, timeZone)} local`
        : `${formatBrowserLocalHhMm(minSpotTs, timeZone)}\u2013${formatBrowserLocalHhMm(maxSpotTs, timeZone)} local`
      : 'last 24h local'
  const sunSummaryStr =
    sun.polarState === 'polar-day'
      ? 'Polar day'
      : sun.polarState === 'polar-night'
        ? 'Polar night'
        : [
            sun.sunriseLabel ? `Sunrise ${sun.sunriseLabel}` : null,
            sun.sunsetLabel ? `Sunset ${sun.sunsetLabel}` : null,
          ]
            .filter(Boolean)
            .join(', ')
  const satSummary = satellitesSet.size > 0 ? [...satellitesSet].join(', ') : ''
  const detectionCountStr =
    spots.length === 1
      ? `1 detection (${timeRangeStr})`
      : `${spots.length} detections (${timeRangeStr})`
  const negativeSummaryStr =
    nonDetectionCount > 0
      ? `${nonDetectionCount} negative pass${nonDetectionCount === 1 ? '' : 'es'}`
      : null
  const pendingSummaryStr =
    pendingCount > 0 ? `${pendingCount} pass${pendingCount === 1 ? '' : 'es'} in processing` : null

  const summaryParts = [
    detectionCountStr,
    `${roundedTotalFrp.toLocaleString('en-US')} MW total (peak ${roundedPeakFrp.toLocaleString('en-US')} MW)`,
    negativeSummaryStr,
    pendingSummaryStr,
    satSummary,
    sunSummaryStr,
  ].filter(Boolean)

  return {
    windowStartMs,
    windowEndMs,
    centroidLngLat,
    detectionCount: spots.length,
    totalFrpMw: roundedTotalFrp,
    peakFrpMw: roundedPeakFrp,
    singleSpotDetail,
    processingCutoff,
    sun,
    slots,
    axisTicks,
    accessibleRows,
    accessibleSummary: summaryParts.join(' \u00b7 '),
  }
}
