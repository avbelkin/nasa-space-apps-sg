import model from '../data/viirs-detection-model.json' with { type: 'json' }
import type { FireObservationGeometry } from './fireObservationGeometry.ts'
import type { FireSpotTooltipInput } from './fireSpots.ts'
import type { ComputedOverpass } from './satelliteOverpassTimeline.ts'

const coefficients: Record<string, number> = model.coefficients

function band(value: number | null | undefined, edges: readonly number[]): string {
  if (value == null || !Number.isFinite(value)) return 'missing'
  const upperIndex = edges.findIndex((edge) => value < edge)
  if (upperIndex === 0) return `<${edges[0]}`
  if (upperIndex < 0) return `>=${edges.at(-1)}`
  return `${edges[upperIndex - 1]} to <${edges[upperIndex]}`
}

export function scoreViirsDetection(
  spot: FireSpotTooltipInput, pass: ComputedOverpass,
  geometry?: FireObservationGeometry | null, landCoverCode?: number,
): number {
  // Feature names and bands match the fitted same-family VIIRS baseline.
  const features = [
    `frpMw=${band(spot.frp, [2, 5, 10, 20, 50, 100, 250])}`,
    `brightnessK=${band(spot.brightnessK, [300, 315, 330, 345, 360, 400, 450])}`,
    `confidence=${band(spot.confidence, [30, 50, 65, 80, 95, 100])}`,
    `elapsedMinutes=${band((pass.timestampMs - spot.timestamp) / 60_000, [40, 55, 70, 90, 120, 180, 240, 300])}`,
    `secondTrackDistanceKm=${band(pass.distanceKm, [100, 250, 400, 600, 800, 1000, 1200])}`,
    `secondNadirSwath=${pass.isNadir}`,
    `firstOffNadirDeg=${band(geometry?.orbit?.offNadirDeg, [10, 20, 30, 40, 50, 60])}`,
    `firstGlintAngleDeg=${band(geometry?.sun?.glintAngleDeg, [5, 15, 30, 60, 90])}`,
    `dayNight=${spot.dayNight}`,
    `sunElevationDeg=${band(geometry?.sun?.elevationDeg, [-30, -12, 0, 15, 30, 45, 60])}`,
    `moonElevationDeg=${band(geometry?.moon?.elevationDeg, [-30, 0, 30, 60])}`,
    `satellitePair=${spot.satellite} to ${pass.satellite}`,
    `landCover=${landCoverCode ?? 'missing'}`,
  ]
  const missLogit = features.reduce((sum, feature) => sum + (coefficients[feature] ?? 0), model.missIntercept)
  const { bias, slope } = model.detectionCalibration
  return 1 / (1 + Math.exp(slope * missLogit - bias))
}
