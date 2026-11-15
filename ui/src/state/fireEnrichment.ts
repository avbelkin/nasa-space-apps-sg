import type { FirmsLiveSpotsResponse } from '../utils/fireSpots.ts'

export const FIRE_ENRICHMENT_DELAY_MS = 10_000

export function fireEnrichmentDelay(unchangedChecks: number): number {
  if (unchangedChecks >= 6) return 60_000
  if (unchangedChecks >= 3) return 30_000
  return FIRE_ENRICHMENT_DELAY_MS
}

export function fireEnrichmentProgressKey(data: Pick<FirmsLiveSpotsResponse,
  'fetchedAtUtc' | 'geometryStatus' | 'geometryProgress' | 'landCoverPending' | 'weather'>): string {
  return [
    data.fetchedAtUtc, data.geometryStatus, data.geometryProgress?.readyCount,
    data.geometryProgress?.pendingCount, data.landCoverPending, data.weather?.status,
    data.weather?.sampledCount, data.weather?.availableCount, data.weather?.retryCount,
    data.weather?.targetCount, data.weather?.eligibleCount,
    data.weather?.coverage?.gridCount ?? data.weather?.coverage?.cachedCount,
  ].join('|')
}
