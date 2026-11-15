import { normalizeFullSatelliteLabel, type NegativeTimelineSubBar } from './fireTimeline.ts'
import type { FireSpotTooltipInput } from './fireSpots.ts'
import { POSITIVE_PASS_MATCH_TOLERANCE_MS } from './satelliteOverpassTimeline.ts'

const FOLLOWUP_WINDOW_MS = 6 * 60 * 60_000

export function getSecondPassOutlook(
  spot: FireSpotTooltipInput,
  passes: readonly NegativeTimelineSubBar[],
  landCover: string,
  fetchedAtMs: number,
) {
  if (!spot.instrument || !spot.satellite || !Number.isFinite(fetchedAtMs)) return null
  const satellite = normalizeFullSatelliteLabel(spot.satellite, spot.source, spot.instrument)
  const tolerance = POSITIVE_PASS_MATCH_TOLERANCE_MS
  const pass = passes.find((candidate) => {
    const elapsed = candidate.timestampMs - spot.timestamp
    return candidate.kind === 'non-detection' &&
      candidate.instrument === spot.instrument && candidate.satellite !== satellite &&
      elapsed > tolerance && elapsed + tolerance <= FOLLOWUP_WINDOW_MS &&
      candidate.ingestionLagMinutes !== undefined &&
      candidate.timestampMs + tolerance + candidate.ingestionLagMinutes * 60_000 <= fetchedAtMs
  })
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
