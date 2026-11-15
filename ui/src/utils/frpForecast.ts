import coefficients from '../data/frp-forecast-coefficients.json' with { type: 'json' }
import type { FireObservationGeometry } from './fireObservationGeometry.ts'
import type { FireSpotTooltipInput } from './fireSpots.ts'
import { normalizeFullSatelliteLabel } from './fireTimeline.ts'
import { POSITIVE_PASS_MATCH_TOLERANCE_MS, type ComputedOverpass } from './satelliteOverpassTimeline.ts'

export const FRP_FORECAST_LOOKAHEAD_MINUTES = 360
const MINUTE_MS = 60_000

const models: Record<string, { intercept: number; coefficients: Record<string, number> }> = coefficients

export function bandPassFeature(value: number | null | undefined, boundaries: readonly number[]): string {
  if (value == null || !Number.isFinite(value)) return 'missing'
  const upper = boundaries.find((boundary) => value < boundary)
  return upper === undefined ? `>=${boundaries.at(-1)}` : `<${upper}`
}

export function forecastNextPassFrp(
  spot: FireSpotTooltipInput,
  passes: readonly ComputedOverpass[],
  nowMs: number,
  geometry?: FireObservationGeometry | null,
  landCoverCode?: number,
) {
  if (!spot.instrument || !spot.satellite || !Number.isFinite(spot.frp) || spot.frp < 0) return null
  const satellite = normalizeFullSatelliteLabel(spot.satellite, spot.source, spot.instrument)
  const tolerance = POSITIVE_PASS_MATCH_TOLERANCE_MS
  const pass = passes.find((candidate) =>
    candidate.satellite !== satellite && candidate.timestampMs > nowMs &&
    candidate.timestampMs > spot.timestamp + tolerance &&
    candidate.timestampMs + tolerance <= spot.timestamp + FRP_FORECAST_LOOKAHEAD_MINUTES * MINUTE_MS)
  if (!pass) return null

  const model = models[`${spot.instrument}-${pass.instrument}`]
  const pair = `pair=${satellite} to ${pass.satellite}`
  if (!model || !Object.hasOwn(model.coefficients, pair)) return null

  const features = passModelFeatures(spot, pass, geometry, landCoverCode)
  const logChange = features.reduce((sum, feature) => sum + (model.coefficients[feature] ?? 0), model.intercept)
  const predictedMw = Math.max(0, Math.expm1(Math.log1p(spot.frp) + logChange))
  return { pass, predictedMw, originalMw: spot.frp, differenceMw: predictedMw - spot.frp }
}

export function passModelFeatures(
  spot: FireSpotTooltipInput, pass: ComputedOverpass,
  geometry?: FireObservationGeometry | null, landCoverCode?: number,
): string[] {
  const band = bandPassFeature
  // These tokens are shared by the FRP and weather-model training scripts.
  return [
    `frp=${band(spot.frp, [2, 5, 10, 20, 50, 100, 250])}`,
    `brightness=${band(spot.brightnessK, [300, 315, 330, 345, 360, 400, 450])}`,
    `confidence=${band(spot.confidence, [30, 50, 65, 80, 95, 100])}`,
    `elapsed=${band((pass.timestampMs - spot.timestamp) / MINUTE_MS, [40, 55, 70, 90, 120, 180, 240, 300])}`,
    `distance=${band(pass.distanceKm, [100, 250, 400, 600, 800, 1000, 1200])}`,
    `nadir=${pass.isNadir}`,
    `offNadir=${band(geometry?.orbit?.offNadirDeg, [10, 20, 30, 40, 50, 60])}`,
    `glint=${band(geometry?.sun?.glintAngleDeg, [5, 15, 30, 60, 90])}`,
    `dayNight=${spot.dayNight}`,
    `sun=${band(geometry?.sun?.elevationDeg, [-30, -12, 0, 15, 30, 45, 60])}`,
    `moon=${band(geometry?.moon?.elevationDeg, [-30, 0, 30, 60])}`,
    `cover=${landCoverCode ?? 'missing'}`,
    `pair=${normalizeFullSatelliteLabel(spot.satellite, spot.source, spot.instrument)} to ${pass.satellite}`,
  ]
}
