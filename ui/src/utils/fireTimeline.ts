import { DEFAULT_SATELLITE_COLOR, SATELLITE_COLORS } from '../data/dataPalette.ts'
import type { ViewMode } from '../data/stubSeasonalData.ts'
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
const SUN_SAMPLE_STEPS = 96
const SUN_BOUNDARY_MARGIN_MS = 15 * 60_000
const SUN_VIEWBOX_WIDTH = 240
const SUN_VIEWBOX_HEIGHT = 100
const SUN_HORIZON_Y = 52
const SUN_HALF_SPAN_Y = 40
const SUN_MIN_EFFECTIVE_ALT_RANGE_DEG = 25
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

export function computeSolarAltitudeDeg(unixMs: number, latDeg: number, lngDeg: number): number {
  const subsolar = computeSubsolarPoint(unixMs)
  const latRad = clamp(latDeg, -90, 90) * DEG_TO_RAD
  const lonRad = lngDeg * DEG_TO_RAD
  const sinAlt = clamp(
    Math.sin(latRad) * Math.sin(subsolar.latRad) +
      Math.cos(latRad) * Math.cos(subsolar.latRad) * Math.cos(lonRad - subsolar.lonRad),
    -1,
    1,
  )
  return Math.asin(sinAlt) * RAD_TO_DEG
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
    computeSolarAltitudeDeg(ms, latDeg, lngDeg) - SUNRISE_SUNSET_ALTITUDE_DEG

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

  const denom = Math.max(SUN_MIN_EFFECTIVE_ALT_RANGE_DEG, maxAbsEffectiveAlt)
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

export function computeTimelineBarColor(
  _frpMw: number,
  _viewMode: ViewMode,
  instrument: FireInstrument,
  satellite?: string,
  source?: string,
): string {
  return resolveSatellitePaletteColor(satellite, source, instrument)
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
  instrument: FireInstrument
  source: string
  mergedCount: number
}

export interface NegativeTimelinePass {
  kind: 'non-detection'
  slotIndex: number
  slotStartMs: number
  slotEndMs: number
  timestampMs: number
  localTimeLabel: string
  satellite: string
  shortSatellite: string
  color: string
  instrument: FireInstrument
  isNadir?: boolean
}

export type TimelineSlotObservation = PositiveTimelineDetection | NegativeTimelinePass

export interface NegativePassInput {
  timestampMs: number
  satellite: string
  instrument: FireInstrument
  isNadir?: boolean
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
  sun: PlaceSunTimeline
  slots: Array<TimelineSlotObservation | null>
  axisTicks: TimelineAxisTick[]
  accessibleSummary: string
}

export interface BuildFireTimelineOptions {
  nowMs?: number
  viewMode?: ViewMode
  timeZone?: string
  negativePasses?: readonly NegativePassInput[]
}

export function buildFireDetectionsTimeline(
  spots: readonly FireSpotTooltipInput[],
  options: BuildFireTimelineOptions = {},
): FireDetectionsTimeline {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs! : Date.now()
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

  interface SlotCandidate {
    winner: FireSpotTooltipInput
    mergedCount: number
  }

  const slotCandidates: Array<SlotCandidate | null> = Array.from(
    { length: TIMELINE_SLOT_COUNT },
    () => null,
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
    const existing = slotCandidates[slotIndex]
    if (!existing) {
      slotCandidates[slotIndex] = { winner: spot, mergedCount: 1 }
    } else {
      const winner = compareMatchedFireSpots(spot, existing.winner) < 0 ? spot : existing.winner
      slotCandidates[slotIndex] = {
        winner,
        mergedCount: existing.mergedCount + 1,
      }
    }
  }

  let peakSlotFrpMw = 0
  for (const candidate of slotCandidates) {
    if (candidate) {
      const frp = Number.isFinite(candidate.winner.frp) ? Math.max(0, candidate.winner.frp) : 0
      if (frp > peakSlotFrpMw) {
        peakSlotFrpMw = frp
      }
    }
  }

  const scaleCeilingMw = Math.max(peakSlotFrpMw, 1)
  const slots: Array<TimelineSlotObservation | null> = slotCandidates.map((candidate, slotIndex) => {
    const slotStartMs = windowStartMs + slotIndex * TIMELINE_SLOT_MS
    const slotEndMs = slotStartMs + TIMELINE_SLOT_MS

    if (!candidate) {
      return null
    }

    const { winner, mergedCount } = candidate
    const instrument: FireInstrument = winner.instrument === 'modis' ? 'modis' : 'viirs'
    const frpMw = Math.round((Number.isFinite(winner.frp) ? Math.max(0, winner.frp) : 0) * 10) / 10
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
    const shortSatellite = normalizeShortSatelliteLabel(winner.satellite, winner.source, instrument)

    return {
      kind: 'detection',
      slotIndex,
      slotStartMs,
      slotEndMs,
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
    }
  })

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
      const existing = slots[slotIndex]
      if (existing?.kind === 'detection') {
        continue
      }
      if (existing?.kind === 'non-detection' && existing.timestampMs >= pass.timestampMs) {
        continue
      }
      const slotStartMs = windowStartMs + slotIndex * TIMELINE_SLOT_MS
      const satellite = normalizeFullSatelliteLabel(pass.satellite, undefined, pass.instrument)
      const shortSatellite = normalizeShortSatelliteLabel(pass.satellite, undefined, pass.instrument)
      slots[slotIndex] = {
        kind: 'non-detection',
        slotIndex,
        slotStartMs,
        slotEndMs: slotStartMs + TIMELINE_SLOT_MS,
        timestampMs: pass.timestampMs,
        localTimeLabel: formatBrowserLocalHhMm(pass.timestampMs, timeZone),
        satellite,
        shortSatellite,
        color: resolveSatellitePaletteColor(pass.satellite, undefined, pass.instrument),
        instrument: pass.instrument,
        isNadir: pass.isNadir,
      }
    }
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
  const timeRangeStr =
    Number.isFinite(minSpotTs) && Number.isFinite(maxSpotTs)
      ? `${formatBrowserLocalHhMm(minSpotTs, timeZone)}–${formatBrowserLocalHhMm(maxSpotTs, timeZone)} local`
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

  const summaryParts = [
    `${spots.length} detections (${timeRangeStr})`,
    `${roundedTotalFrp.toLocaleString('en-US')} MW total (peak ${roundedPeakFrp.toLocaleString('en-US')} MW)`,
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
    sun,
    slots,
    axisTicks,
    accessibleSummary: summaryParts.join(' · '),
  }
}
