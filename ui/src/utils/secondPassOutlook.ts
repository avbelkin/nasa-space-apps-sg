import { normalizeFullSatelliteLabel, type NegativeTimelineSubBar } from './fireTimeline.ts'
import type { FireSpotTooltipInput, FirmsLiveSpotsResponse } from './fireSpots.ts'
import { POSITIVE_PASS_MATCH_TOLERANCE_MS, type ComputedOverpass } from './satelliteOverpassTimeline.ts'
import { computeGreatCircleDistanceKm } from './satelliteOrbits.ts'
import type { FireObservationGeometry } from './fireObservationGeometry.ts'
import { scoreViirsDetection } from './viirsDetectionScore.ts'

const FOLLOWUP_WINDOW_MS = 6 * 60 * 60_000
const MATCH_RADIUS_KM = 1
const EXPECTED_DETECTION_THRESHOLD = 0.7
type PassFeed = Pick<FirmsLiveSpotsResponse, 'sources' | 'spots' | 'fetchedAtUtc' | 'windowStartUtc' | 'windowEndUtc'>

function isSettledFollowup(
  anchorTime: number, passTime: number, lagMinutes: number | undefined, availableThrough: number,
): boolean {
  const tolerance = POSITIVE_PASS_MATCH_TOLERANCE_MS
  const elapsed = passTime - anchorTime
  return elapsed > tolerance && elapsed + tolerance <= FOLLOWUP_WINDOW_MS &&
    lagMinutes !== undefined && passTime + tolerance + lagMinutes * 60_000 <= availableThrough
}

export function getSecondPassOutlook(
  spot: FireSpotTooltipInput,
  passes: readonly NegativeTimelineSubBar[],
  landCover: string,
  fetchedAtMs: number,
) {
  if (!spot.instrument || !spot.satellite || !Number.isFinite(fetchedAtMs)) return null
  const satellite = normalizeFullSatelliteLabel(spot.satellite, spot.source, spot.instrument)
  const pass = passes.find((candidate) => candidate.kind === 'non-detection' &&
    candidate.instrument === spot.instrument && candidate.satellite !== satellite &&
    isSettledFollowup(spot.timestamp, candidate.timestampMs, candidate.ingestionLagMinutes, fetchedAtMs))
  if (!pass) return null

  const fewer: string[] = []
  const more: string[] = []
  const distance = pass.distanceKm
  // These ranges describe associations in the November 2026 baseline snapshot.
  if (spot.instrument === 'modis') {
    if (landCover === 'Broadleaved evergreen trees') fewer.push('broadleaved evergreen cover')
    if (landCover === 'Open broadleaved deciduous trees') more.push('open broadleaved deciduous cover')
    if (distance !== undefined && distance < 250) fewer.push('a second ground track within 250 km')
    if (distance !== undefined && distance >= 1_000 && distance < 1_200) {
      more.push('a second ground track 1,000–1,200 km away')
    }
  } else {
    if (spot.frp >= 20 && spot.frp < 50) fewer.push('a first detection of 20–50 MW')
    if (spot.frp >= 2 && spot.frp < 5) more.push('a first detection of 2–5 MW')
    if (distance !== undefined && distance < 100) fewer.push('a second ground track within 100 km')
    if (distance !== undefined && distance >= 1_200) more.push('a second ground track at least 1,200 km away')
  }

  return fewer.length || more.length ? { satellite: pass.satellite, fewer, more } : null
}

function findUnmatchedFollowupPass(
  spot: FireSpotTooltipInput,
  passes: readonly ComputedOverpass[],
  feed: PassFeed,
  target: ComputedOverpass['instrument'],
  accepts: (pass: ComputedOverpass) => boolean = () => true,
) {
  const { lat, lng } = spot
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  const sources = feed.sources.filter((source) => source.instrument === target)
  const availableThrough = Math.min(Date.parse(feed.fetchedAtUtc), Date.parse(feed.windowEndUtc ?? ''))
  const availableFrom = Date.parse(feed.windowStartUtc ?? '')
  if (!sources.length || !Number.isFinite(availableThrough) || !Number.isFinite(availableFrom)) return undefined

  const sourceCodes = new Set(sources.map((source) => source.code))
  const tolerance = POSITIVE_PASS_MATCH_TOLERANCE_MS
  return passes.find((candidate) => candidate.instrument === target &&
    candidate.timestampMs - tolerance >= availableFrom &&
    isSettledFollowup(spot.timestamp, candidate.timestampMs, candidate.typicalIngestionLagMinutes, availableThrough) &&
    accepts(candidate) &&
    !feed.spots.some(([spotLng, spotLat, time, , , , sourceCode, satellite]) =>
      sourceCodes.has(sourceCode) && satellite === candidate.satellite &&
      Math.abs(time - candidate.timestampMs) <= tolerance &&
      computeGreatCircleDistanceKm({ lat, lng }, { lat: spotLat, lng: spotLng }) <= MATCH_RADIUS_KM))
}

export function getExpectedViirsMiss(
  spot: FireSpotTooltipInput, passes: readonly ComputedOverpass[], feed: PassFeed,
  geometry?: FireObservationGeometry | null, landCoverCode?: number,
) {
  const { satellite } = spot
  if (spot.instrument !== 'viirs' || (satellite !== 'NOAA-20' && satellite !== 'NOAA-21')) return null
  const partner = satellite === 'NOAA-20' ? 'NOAA-21' : 'NOAA-20'
  const score = (pass: ComputedOverpass) => scoreViirsDetection(spot, pass, geometry, landCoverCode)
  const pass = findUnmatchedFollowupPass(spot, passes, feed, 'viirs', (pass) =>
    pass.satellite === partner && score(pass) >= EXPECTED_DETECTION_THRESHOLD)
  return pass ? { pass, score: score(pass) } : null
}

export function getUnmatchedSameFamilyPass(
  spot: FireSpotTooltipInput, passes: readonly ComputedOverpass[], feed: PassFeed,
) {
  if (!spot.instrument) return undefined
  const satellite = normalizeFullSatelliteLabel(spot.satellite, spot.source, spot.instrument)
  return findUnmatchedFollowupPass(spot, passes, feed, spot.instrument, (pass) => pass.satellite !== satellite)
}

export function getCrossFamilyPassOutlook(
  spot: FireSpotTooltipInput, passes: readonly ComputedOverpass[], feed: PassFeed,
) {
  const { instrument } = spot
  if (!instrument) return null
  const target = instrument === 'modis' ? 'viirs' : 'modis'
  const pass = findUnmatchedFollowupPass(spot, passes, feed, target)
  if (!pass) return null

  const fewer: string[] = []
  const more: string[] = []
  // The cross-family baseline's near-track and far-track bands differ by target family.
  if (pass.distanceKm < 100) fewer.push('a ground track within 100 km')
  if (target === 'viirs' && pass.distanceKm >= 1_000) more.push('a ground track at least 1,000 km away')
  if (target === 'modis' && pass.distanceKm >= 800) more.push('a ground track at least 800 km away')
  if (instrument === 'viirs') {
    if (spot.frp >= 20 && spot.frp < 50) fewer.push('a first detection of 20–50 MW')
    if (spot.frp >= 2 && spot.frp < 5) more.push('a first detection of 2–5 MW')
  }
  return { satellite: pass.satellite, target, distanceKm: pass.distanceKm, fewer, more }
}
