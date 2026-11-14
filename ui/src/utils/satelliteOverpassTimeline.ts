import type { SensorFilter } from '../data/stubSeasonalData.ts'
import type { FireInstrument, FireSpotTooltipInput } from './fireSpots.ts'
import {
  computeClusterCentroid,
  normalizeFullSatelliteLabel,
  type NegativePassInput,
} from './fireTimeline.ts'
import type { SatelliteOrbit } from './satelliteOrbits.ts'

const EARTH_MU_KM3_S2 = 398600.8
const EARTH_EQUATORIAL_RADIUS_KM = 6378.135
const EARTH_MEAN_RADIUS_KM = 6371.0
const EARTH_FLATTENING = 1.0 / 298.26
const J2_HARMONIC = 1.082616e-3
const SECONDS_PER_DAY = 86400.0
const MS_PER_DAY = 86_400_000.0
const TWO_PI = 2.0 * Math.PI
const DEG_TO_RAD = Math.PI / 180.0
const RAD_TO_DEG = 180.0 / Math.PI

const DEFAULT_LOOKBACK_HOURS = 26
const DEFAULT_LOOKAHEAD_MINUTES = 30
const SAMPLE_STEP_MS = 60_000
const REFINE_HALF_WINDOW_MS = 50_000
const REFINE_STEP_MS = 10_000
const SPATIAL_CACHE_MAX_ENTRIES = 512

/**
 * Matches a satellite overpass against a positive FIRMS pixel from the same spacecraft
 * within ±25 minutes so an orbital pass straddling an hour-slot boundary never emits
 * a phantom negative pass in the neighboring hour slot.
 */
export const POSITIVE_PASS_MATCH_TOLERANCE_MS = 25 * 60_000

export interface SatelliteCatalogDefaults {
  id: string
  noradId: number
  name: string
  instrument: FireInstrument
  nadirSwathKm: number
  wideSwathKm: number
  typicalIngestionLagMinutes: number
  defaultTleLine1: string
  defaultTleLine2: string
}

/**
 * Embedded fleet defaults synchronized with backend `SatelliteCatalog.Default`
 * and live FIRMS NRT datasets (`MODIS_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`).
 */
export const FIRMS_SATELLITE_FLEET_DEFAULTS: readonly SatelliteCatalogDefaults[] = [
  {
    id: 'terra',
    noradId: 25994,
    name: 'Terra',
    instrument: 'modis',
    nadirSwathKm: 400,
    wideSwathKm: 2330,
    typicalIngestionLagMinutes: 120,
    defaultTleLine1: '1 25994U 99068A   26317.92845958  .00000323  00000+0  74469-4 0  9991',
    defaultTleLine2: '2 25994  97.9265   1.3927 0003544 108.9156 353.6658 14.61196780431475',
  },
  {
    id: 'aqua',
    noradId: 27424,
    name: 'Aqua',
    instrument: 'modis',
    nadirSwathKm: 400,
    wideSwathKm: 2330,
    typicalIngestionLagMinutes: 120,
    defaultTleLine1: '1 27424U 02022A   26317.91074306  .00000799  00000+0  16835-3 0  9994',
    defaultTleLine2: '2 27424  98.4492 290.3525 0001149 107.8217 278.6300 14.62279014305150',
  },
  {
    id: 'noaa-20',
    noradId: 43013,
    name: 'NOAA-20',
    instrument: 'viirs',
    nadirSwathKm: 400,
    wideSwathKm: 3040,
    typicalIngestionLagMinutes: 90,
    defaultTleLine1: '1 43013U 17073A   26317.92457274  .00000075  00000+0  56363-4 0  9996',
    defaultTleLine2: '2 43013  98.7926 256.1370 0001164 130.8784 229.2493 14.19536900465713',
  },
  {
    id: 'noaa-21',
    noradId: 54234,
    name: 'NOAA-21',
    instrument: 'viirs',
    nadirSwathKm: 400,
    wideSwathKm: 3040,
    typicalIngestionLagMinutes: 90,
    defaultTleLine1: '1 54234U 22150A   26317.88453332  .00000065  00000+0  51446-4 0  9997',
    defaultTleLine2: '2 54234  98.7206 254.2287 0002651 111.2994 248.8466 14.19558773207785',
  },
] as const

export interface ParsedSatelliteTle {
  noradId: number
  name: string
  epochMs: number
  inclinationDeg: number
  raanDeg: number
  eccentricity: number
  argPerigeeDeg: number
  meanAnomalyDeg: number
  meanMotionRevPerDay: number
}

export interface GeodeticPoint {
  latDeg: number
  lngDeg: number
  altitudeKm: number
}

interface IndexedSatelliteTrack {
  id: string
  noradId: number
  name: string
  instrument: FireInstrument
  nadirHalfWidthKm: number
  wideHalfWidthKm: number
  cosWideHalfAngle: number
  typicalIngestionLagMinutes: number
  tle: ParsedSatelliteTle
  ux: Float64Array
  uy: Float64Array
  uz: Float64Array
}

export interface ComputedOverpass {
  satelliteId: string
  satellite: string
  noradId: number
  instrument: FireInstrument
  timestampMs: number
  distanceKm: number
  isNadir: boolean
  typicalIngestionLagMinutes: number
}

export interface SatelliteOverpassIndex {
  anchorStartMs: number
  anchorEndMs: number
  stepMs: number
  sampleCount: number
  satellites: readonly IndexedSatelliteTrack[]
  evaluateAtLatLng: (latDeg: number, lngDeg: number) => readonly ComputedOverpass[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeTwoPi(radians: number): number {
  const mod = radians % TWO_PI
  return mod < 0 ? mod + TWO_PI : mod
}

function normalizeLongitudeDegrees(degrees: number): number {
  const wrapped = ((((degrees + 180.0) % 360.0) + 360.0) % 360.0) - 180.0
  return clamp(wrapped, -180.0, 180.0)
}

function solveKepler(meanAnomaly: number, eccentricity: number): number {
  let eccentricAnomaly = meanAnomaly
  for (let i = 0; i < 6; i++) {
    const f = eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly
    const fPrime = 1.0 - eccentricity * Math.cos(eccentricAnomaly)
    eccentricAnomaly -= f / fPrime
  }
  return eccentricAnomaly
}

function computeGreenwichMeanSiderealTimeRadians(unixMs: number): number {
  const julianDate = unixMs / MS_PER_DAY + 2440587.5
  const ut1Centuries = (julianDate - 2451545.0) / 36525.0
  const thetaSeconds =
    67310.54841 +
    (876600.0 * 3600.0 + 8640184.812866) * ut1Centuries +
    0.093104 * ut1Centuries * ut1Centuries -
    6.2e-6 * ut1Centuries * ut1Centuries * ut1Centuries

  const thetaRad = ((thetaSeconds % SECONDS_PER_DAY) * TWO_PI) / SECONDS_PER_DAY
  return normalizeTwoPi(thetaRad)
}

export function parseSatelliteTle(
  name: string,
  line1: string,
  line2: string,
): ParsedSatelliteTle | null {
  if (!line1 || !line2) {
    return null
  }
  const cleanLine1 = line1.trim()
  const cleanLine2 = line2.trim()
  if (cleanLine1.length < 68 || cleanLine2.length < 68) {
    return null
  }
  if (!cleanLine1.startsWith('1 ') || !cleanLine2.startsWith('2 ')) {
    return null
  }

  const norad1 = Number.parseInt(cleanLine1.slice(2, 7).trim(), 10)
  const norad2 = Number.parseInt(cleanLine2.slice(2, 7).trim(), 10)
  if (!Number.isInteger(norad1) || !Number.isInteger(norad2) || norad1 !== norad2) {
    return null
  }

  const twoDigitYear = Number.parseInt(cleanLine1.slice(18, 20).trim(), 10)
  const dayOfYear = Number.parseFloat(cleanLine1.slice(20, 32).trim())
  const inclinationDeg = Number.parseFloat(cleanLine2.slice(8, 16).trim())
  const raanDeg = Number.parseFloat(cleanLine2.slice(17, 25).trim())
  const eccentricity = Number.parseFloat(`0.${cleanLine2.slice(26, 33).trim()}`)
  const argPerigeeDeg = Number.parseFloat(cleanLine2.slice(34, 42).trim())
  const meanAnomalyDeg = Number.parseFloat(cleanLine2.slice(43, 51).trim())
  const meanMotionRevPerDay = Number.parseFloat(cleanLine2.slice(52, 63).trim())

  if (
    !Number.isInteger(twoDigitYear) ||
    !Number.isFinite(dayOfYear) ||
    !Number.isFinite(inclinationDeg) ||
    !Number.isFinite(raanDeg) ||
    !Number.isFinite(eccentricity) ||
    !Number.isFinite(argPerigeeDeg) ||
    !Number.isFinite(meanAnomalyDeg) ||
    !Number.isFinite(meanMotionRevPerDay) ||
    meanMotionRevPerDay <= 0
  ) {
    return null
  }

  const year = twoDigitYear < 57 ? 2000 + twoDigitYear : 1900 + twoDigitYear
  const epochMs = Date.UTC(year, 0, 1, 0, 0, 0) + (dayOfYear - 1.0) * MS_PER_DAY
  const cleanName =
    name.trim() ||
    FIRMS_SATELLITE_FLEET_DEFAULTS.find((entry) => entry.noradId === norad1)?.name ||
    `SAT-${norad1}`

  return {
    noradId: norad1,
    name: cleanName,
    epochMs,
    inclinationDeg,
    raanDeg,
    eccentricity,
    argPerigeeDeg,
    meanAnomalyDeg,
    meanMotionRevPerDay,
  }
}

export function propagateSatelliteGeodetic(
  tle: ParsedSatelliteTle,
  unixMs: number,
): GeodeticPoint {
  const dtSeconds = (unixMs - tle.epochMs) / 1000.0
  const n0RadPerSec = (tle.meanMotionRevPerDay * TWO_PI) / SECONDS_PER_DAY
  const a0Km = Math.cbrt(EARTH_MU_KM3_S2 / (n0RadPerSec * n0RadPerSec))

  const i0 = tle.inclinationDeg * DEG_TO_RAD
  const e0 = clamp(tle.eccentricity, 0.0, 0.99)
  const cosI = Math.cos(i0)
  const sinI = Math.sin(i0)
  const beta2 = 1.0 - e0 * e0
  const pKm = a0Km * beta2
  const radiusRatio = EARTH_EQUATORIAL_RADIUS_KM / pKm
  const j2Factor = 1.5 * J2_HARMONIC * radiusRatio * radiusRatio

  const nBar = n0RadPerSec * (1.0 + j2Factor * Math.sqrt(beta2) * (1.0 - 1.5 * sinI * sinI))
  const aKm = Math.cbrt(EARTH_MU_KM3_S2 / (nBar * nBar))

  const raanDot = -j2Factor * nBar * cosI
  const argPerigeeDot = 0.5 * j2Factor * nBar * (4.0 - 5.0 * sinI * sinI)

  const raan = normalizeTwoPi(tle.raanDeg * DEG_TO_RAD + raanDot * dtSeconds)
  const argPerigee = normalizeTwoPi(tle.argPerigeeDeg * DEG_TO_RAD + argPerigeeDot * dtSeconds)
  const meanAnomaly = normalizeTwoPi(tle.meanAnomalyDeg * DEG_TO_RAD + nBar * dtSeconds)

  const eccentricAnomaly = solveKepler(meanAnomaly, e0)
  const sinE = Math.sin(eccentricAnomaly)
  const cosE = Math.cos(eccentricAnomaly)

  const trueAnomaly = Math.atan2(Math.sqrt(beta2) * sinE, cosE - e0)
  const radiusKm = aKm * (1.0 - e0 * cosE)
  const u = argPerigee + trueAnomaly

  const sinU = Math.sin(u)
  const cosU = Math.cos(u)
  const sinRaan = Math.sin(raan)
  const cosRaan = Math.cos(raan)

  const xEci = radiusKm * (cosRaan * cosU - sinRaan * sinU * cosI)
  const yEci = radiusKm * (sinRaan * cosU + cosRaan * sinU * cosI)
  const zEci = radiusKm * (sinU * sinI)

  const gmst = computeGreenwichMeanSiderealTimeRadians(unixMs)
  const cosGmst = Math.cos(gmst)
  const sinGmst = Math.sin(gmst)

  const xEcef = xEci * cosGmst + yEci * sinGmst
  const yEcef = -xEci * sinGmst + yEci * cosGmst
  const zEcef = zEci

  const lonRad = Math.atan2(yEcef, xEcef)
  const lngDeg = normalizeLongitudeDegrees(lonRad * RAD_TO_DEG)

  const rXy = Math.hypot(xEcef, yEcef)
  const e2 = EARTH_FLATTENING * (2.0 - EARTH_FLATTENING)
  let latRad = Math.atan2(zEcef, rXy)

  for (let iter = 0; iter < 4; iter++) {
    const sinLat = Math.sin(latRad)
    const c = 1.0 / Math.sqrt(1.0 - e2 * sinLat * sinLat)
    latRad = Math.atan2(zEcef + EARTH_EQUATORIAL_RADIUS_KM * c * e2 * sinLat, rXy)
  }

  const sinFinalLat = Math.sin(latRad)
  const cosFinalLat = Math.cos(latRad)
  const cFinal = 1.0 / Math.sqrt(1.0 - e2 * sinFinalLat * sinFinalLat)
  const altitudeKm =
    Math.abs(cosFinalLat) < 1e-5
      ? Math.abs(zEcef) - EARTH_EQUATORIAL_RADIUS_KM * (1.0 - EARTH_FLATTENING)
      : rXy / cosFinalLat - EARTH_EQUATORIAL_RADIUS_KM * cFinal

  return {
    latDeg: clamp(latRad * RAD_TO_DEG, -89.999, 89.999),
    lngDeg,
    altitudeKm,
  }
}

function latLngToUnitVector(latDeg: number, lngDeg: number): [number, number, number] {
  const latRad = clamp(latDeg, -90, 90) * DEG_TO_RAD
  const lngRad = lngDeg * DEG_TO_RAD
  const cosLat = Math.cos(latRad)
  return [cosLat * Math.cos(lngRad), cosLat * Math.sin(lngRad), Math.sin(latRad)]
}

function dotProductAtPoint(
  tle: ParsedSatelliteTle,
  unixMs: number,
  px: number,
  py: number,
  pz: number,
): number {
  const pt = propagateSatelliteGeodetic(tle, unixMs)
  const [ux, uy, uz] = latLngToUnitVector(pt.latDeg, pt.lngDeg)
  return ux * px + uy * py + uz * pz
}

export function buildSatelliteOverpassIndex(
  satellites?: readonly SatelliteOrbit[] | null,
  referenceNowMs = Date.now(),
): SatelliteOverpassIndex {
  const anchorStartMs =
    Math.floor((referenceNowMs - DEFAULT_LOOKBACK_HOURS * 3_600_000) / SAMPLE_STEP_MS) *
    SAMPLE_STEP_MS
  const anchorEndMs =
    Math.ceil((referenceNowMs + DEFAULT_LOOKAHEAD_MINUTES * 60_000) / SAMPLE_STEP_MS) *
    SAMPLE_STEP_MS
  const sampleCount = Math.max(2, Math.floor((anchorEndMs - anchorStartMs) / SAMPLE_STEP_MS) + 1)

  const liveByNorad = new Map<number, SatelliteOrbit>()
  if (satellites) {
    for (const sat of satellites) {
      liveByNorad.set(sat.noradId, sat)
    }
  }

  const indexedSatellites: IndexedSatelliteTrack[] = []
  for (const defaults of FIRMS_SATELLITE_FLEET_DEFAULTS) {
    const live = liveByNorad.get(defaults.noradId)
    const name = normalizeFullSatelliteLabel(live?.name ?? defaults.name, undefined, defaults.instrument)
    const line1 = live?.tleLine1?.trim() ? live.tleLine1 : defaults.defaultTleLine1
    const line2 = live?.tleLine2?.trim() ? live.tleLine2 : defaults.defaultTleLine2
    const tle =
      parseSatelliteTle(name, line1, line2) ??
      parseSatelliteTle(defaults.name, defaults.defaultTleLine1, defaults.defaultTleLine2)
    if (!tle) {
      continue
    }

    const nadirHalfWidthKm = (live?.nadirSwathKm ?? defaults.nadirSwathKm) * 0.5
    const wideHalfWidthKm = Math.max(
      live?.nadirSwathKm ?? defaults.nadirSwathKm,
      live?.wideSwathKm ?? defaults.wideSwathKm,
    ) * 0.5
    const cosWideHalfAngle = Math.cos(wideHalfWidthKm / EARTH_MEAN_RADIUS_KM)

    const ux = new Float64Array(sampleCount)
    const uy = new Float64Array(sampleCount)
    const uz = new Float64Array(sampleCount)

    for (let i = 0; i < sampleCount; i++) {
      const t = anchorStartMs + i * SAMPLE_STEP_MS
      const geo = propagateSatelliteGeodetic(tle, t)
      const [vx, vy, vz] = latLngToUnitVector(geo.latDeg, geo.lngDeg)
      ux[i] = vx
      uy[i] = vy
      uz[i] = vz
    }

    indexedSatellites.push({
      id: defaults.id,
      noradId: defaults.noradId,
      name,
      instrument: live?.instrument ?? defaults.instrument,
      nadirHalfWidthKm,
      wideHalfWidthKm,
      cosWideHalfAngle,
      typicalIngestionLagMinutes:
        live?.typicalIngestionLagMinutes ?? defaults.typicalIngestionLagMinutes,
      tle,
      ux,
      uy,
      uz,
    })
  }

  const cellCache = new Map<string, readonly ComputedOverpass[]>()

  const evaluateAtLatLng = (latDeg: number, lngDeg: number): readonly ComputedOverpass[] => {
    if (!Number.isFinite(latDeg) || !Number.isFinite(lngDeg) || indexedSatellites.length === 0) {
      return []
    }
    const quantizedLat = clamp(Math.round(latDeg * 20) / 20, -89.999, 89.999)
    const quantizedLng = normalizeLongitudeDegrees(Math.round(lngDeg * 20) / 20)
    const cacheKey = `${quantizedLat.toFixed(2)},${quantizedLng.toFixed(2)}`
    const cached = cellCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const [px, py, pz] = latLngToUnitVector(quantizedLat, quantizedLng)
    const overpasses: ComputedOverpass[] = []

    for (const sat of indexedSatellites) {
      let inRun = false
      let peakDot = -1
      let peakIdx = -1

      const finalizeRun = () => {
        if (!inRun || peakIdx < 0) {
          return
        }
        const tPeak = anchorStartMs + peakIdx * SAMPLE_STEP_MS
        const refineStart = Math.max(anchorStartMs, tPeak - REFINE_HALF_WINDOW_MS)
        const refineEnd = Math.min(anchorEndMs, tPeak + REFINE_HALF_WINDOW_MS)
        let bestTs = tPeak
        let bestDot = peakDot

        for (let t = refineStart; t <= refineEnd; t += REFINE_STEP_MS) {
          const d = dotProductAtPoint(sat.tle, t, px, py, pz)
          if (d > bestDot) {
            bestDot = d
            bestTs = t
          }
        }

        const distanceKm = EARTH_MEAN_RADIUS_KM * Math.acos(clamp(bestDot, -1, 1))
        if (distanceKm <= sat.wideHalfWidthKm) {
          overpasses.push({
            satelliteId: sat.id,
            satellite: sat.name,
            noradId: sat.noradId,
            instrument: sat.instrument,
            timestampMs: bestTs,
            distanceKm: Math.round(distanceKm * 10) / 10,
            isNadir: distanceKm <= sat.nadirHalfWidthKm,
            typicalIngestionLagMinutes: sat.typicalIngestionLagMinutes,
          })
        }
        inRun = false
        peakDot = -1
        peakIdx = -1
      }

      for (let i = 0; i < sampleCount; i++) {
        const d = sat.ux[i] * px + sat.uy[i] * py + sat.uz[i] * pz
        if (d >= sat.cosWideHalfAngle) {
          if (!inRun || d > peakDot) {
            peakDot = d
            peakIdx = i
          }
          inRun = true
        } else if (inRun) {
          finalizeRun()
        }
      }
      finalizeRun()
    }

    overpasses.sort((a, b) => a.timestampMs - b.timestampMs)

    if (cellCache.size >= SPATIAL_CACHE_MAX_ENTRIES) {
      const oldestKey = cellCache.keys().next().value
      if (oldestKey !== undefined) {
        cellCache.delete(oldestKey)
      }
    }
    cellCache.set(cacheKey, overpasses)
    return overpasses
  }

  return {
    anchorStartMs,
    anchorEndMs,
    stepMs: SAMPLE_STEP_MS,
    sampleCount,
    satellites: indexedSatellites,
    evaluateAtLatLng,
  }
}

export interface EvaluateNegativePassesOptions {
  nowMs?: number
  windowStartMs?: number
  windowEndMs?: number
  sensorFilter?: SensorFilter
}

export function evaluateSpotNegativePasses(
  index: SatelliteOverpassIndex | null | undefined,
  spots: readonly FireSpotTooltipInput[],
  options: EvaluateNegativePassesOptions = {},
): NegativePassInput[] {
  if (!index || spots.length === 0) {
    return []
  }

  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs! : Date.now()
  let maxSpotTs = -Infinity
  for (const spot of spots) {
    if (Number.isFinite(spot.timestamp) && spot.timestamp > maxSpotTs) {
      maxSpotTs = spot.timestamp
    }
  }
  const windowEndMs = Number.isFinite(options.windowEndMs)
    ? options.windowEndMs!
    : Number.isFinite(maxSpotTs)
      ? Math.max(nowMs, maxSpotTs)
      : nowMs
  const windowStartMs = Number.isFinite(options.windowStartMs)
    ? options.windowStartMs!
    : windowEndMs - 24 * 3_600_000

  const sensorFilter = options.sensorFilter ?? 'harmonized'
  const [centroidLng, centroidLat] = computeClusterCentroid(spots)
  const overpasses = index.evaluateAtLatLng(centroidLat, centroidLng)

  const positiveBySatellite = new Map<string, number[]>()
  for (const spot of spots) {
    if (!Number.isFinite(spot.timestamp) || spot.timestamp <= 0) {
      continue
    }
    const satName = normalizeFullSatelliteLabel(spot.satellite, spot.source, spot.instrument)
    let list = positiveBySatellite.get(satName)
    if (!list) {
      list = []
      positiveBySatellite.set(satName, list)
    }
    list.push(spot.timestamp)
  }

  const results: NegativePassInput[] = []
  for (const overpass of overpasses) {
    if (sensorFilter === 'modis' && overpass.instrument !== 'modis') {
      continue
    }
    if (sensorFilter === 'viirs' && overpass.instrument !== 'viirs') {
      continue
    }
    if (overpass.timestampMs < windowStartMs || overpass.timestampMs > windowEndMs) {
      continue
    }

    const sameSatTimestamps = positiveBySatellite.get(overpass.satellite)
    const matchedPositive =
      sameSatTimestamps?.some(
        (ts) => Math.abs(ts - overpass.timestampMs) <= POSITIVE_PASS_MATCH_TOLERANCE_MS,
      ) ?? false
    if (matchedPositive) {
      continue
    }

    const lagMs = overpass.typicalIngestionLagMinutes * 60_000
    const status = nowMs - overpass.timestampMs < lagMs ? 'pending' : 'non-detection'

    results.push({
      timestampMs: overpass.timestampMs,
      satellite: overpass.satellite,
      instrument: overpass.instrument,
      isNadir: overpass.isNadir,
      distanceKm: overpass.distanceKm,
      ingestionLagMinutes: overpass.typicalIngestionLagMinutes,
      status,
    })
  }

  return results
}
