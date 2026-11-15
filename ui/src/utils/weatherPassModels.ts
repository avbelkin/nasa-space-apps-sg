import trainedModels from '../data/weather-pass-models.json' with { type: 'json' }
import type { FireObservationGeometry } from './fireObservationGeometry.ts'
import type { FireObservationWeather } from './fireObservationWeather.ts'
import type { FireSpotTooltipInput } from './fireSpots.ts'
import { bandPassFeature, passModelFeatures } from './frpForecast.ts'
import type { ComputedOverpass } from './satelliteOverpassTimeline.ts'

interface PassModel {
  intercept: number
  coefficients: Record<string, number>
}

function predict(model: PassModel, features: readonly string[]): number {
  return features.reduce((sum, feature) => sum + (model.coefficients[feature] ?? 0), model.intercept)
}

export function getWeatherPassAdjustment(
  spot: FireSpotTooltipInput, pass: ComputedOverpass, weather: FireObservationWeather | null | undefined,
  geometry?: FireObservationGeometry | null, landCoverCode?: number,
) {
  if (!weather || !spot.instrument || pass.instrument !== spot.instrument ||
      !Number.isFinite(spot.frp) || spot.frp < 0 || Date.parse(weather.acquiredAtUtc) !== spot.timestamp) return null
  const isModis = spot.instrument === 'modis'
  const model = isModis ? trainedModels.gwis : trainedModels.cams
  const baselineFeatures = passModelFeatures(spot, pass, geometry, landCoverCode)
  const pair = baselineFeatures.at(-1)!
  if (!Object.hasOwn(model.detection.baseline.coefficients, pair)) return null

  const acquiredDate = new Date(spot.timestamp).toISOString().slice(0, 10)
  const eligibleSources = weather.sources.filter((source) => source.status === 'available' &&
    (isModis ? source.provider === 'Copernicus GWIS' : source.model === 'CAMS Global'))
  let availableFields = 0
  const enrichedFeatures = Object.entries(model.fields).map(([field, edges]) => {
    const measurement = eligibleSources.map((source) => source.values[field]).find((value) =>
      value && value.value !== null && Number.isFinite(value.value) &&
      (isModis ? value.validDateUtc === acquiredDate :
        Date.parse(value.validFromUtc ?? '') <= spot.timestamp &&
        Date.parse(value.validThroughUtc ?? '') >= spot.timestamp - 3_600_000))
    if (measurement) availableFields++
    return `${field}=${bandPassFeature(measurement?.value, edges)}`
  })
  if (availableFields === 0) return null

  const features = [...baselineFeatures, ...enrichedFeatures]
  const oddsMultiplier = Math.exp(
    predict(model.detection.enriched, features) - predict(model.detection.baseline, baselineFeatures),
  )
  const predictedFrp = isModis
    ? Math.max(0, Math.expm1(Math.log1p(spot.frp) + predict(trainedModels.gwis.frp, features)))
    : null
  return { source: isModis ? 'GWIS' : 'CAMS', oddsMultiplier, predictedFrp, pass }
}
