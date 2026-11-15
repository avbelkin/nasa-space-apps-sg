import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FireSpotTooltipInput } from '../src/utils/fireSpots.ts'
import type { ComputedOverpass } from '../src/utils/satelliteOverpassTimeline.ts'
import { getWeatherPassAdjustment } from '../src/utils/weatherPassModels.ts'

const aqua: FireSpotTooltipInput = {
  satellite: 'Aqua', frp: 18, brightnessK: 318.9, confidence: 70, dayNight: 'D',
  timestamp: 1_794_659_220_000, source: 'modis', instrument: 'modis',
}
const terra: ComputedOverpass = {
  satellite: 'Terra', satelliteId: 'terra', noradId: 25994, instrument: 'modis',
  timestampMs: 1_794_677_240_000, distanceKm: 22, isNadir: true, typicalIngestionLagMinutes: 120,
}
const modisGeometry = {
  orbit: { slantRangeKm: 856, offNadirDeg: 34.1 },
  sun: { elevationDeg: 33.7, glintAngleDeg: 17.9 },
  moon: { elevationDeg: 80.6, glintAngleDeg: 40.2 }, moonIlluminatedFraction: 0.2339,
}
function gwisDay(validDateUtc: string) {
  return {
    acquiredAtUtc: new Date(aqua.timestamp).toISOString(),
    sources: [{
      provider: 'Copernicus GWIS', status: 'available',
      values: {
        fire_weather_index: { value: 32.15, unit: '1', validDateUtc },
        fine_fuel_moisture_code: { value: 91.54, unit: '1', validDateUtc },
        fire_weather_drought_code: { value: 981.61, unit: '1', validDateUtc },
      },
    }],
  }
}

test('applies GWIS acquisition-day fields to MODIS detection odds and FRP', () => {
  const result = getWeatherPassAdjustment(aqua, terra, gwisDay('2026-11-14'), modisGeometry, 110)
  assert.ok(result)
  assert.equal(result.source, 'GWIS')
  assert.ok(Math.abs(result.oddsMultiplier - 1.5225815445916755) < 1e-8)
  assert.ok(Math.abs(result.predictedFrp! - 10.738625184635417) < 1e-8)
  assert.equal(getWeatherPassAdjustment(aqua, terra, gwisDay('2026-11-15'), modisGeometry, 110), null)
  assert.equal(getWeatherPassAdjustment(aqua, { ...terra, instrument: 'viirs' }, gwisDay('2026-11-14')), null)
})

test('uses CAMS for VIIRS detection odds and preserves the VIIRS FRP baseline', () => {
  const viirs: FireSpotTooltipInput = {
    satellite: 'NOAA-21', frp: 13.5, brightnessK: 330.2, confidence: 65, dayNight: 'D',
    timestamp: 1_794_671_400_000, source: 'viirs', instrument: 'viirs',
  }
  const next: ComputedOverpass = {
    satellite: 'NOAA-20', satelliteId: 'noaa20', noradId: 43013, instrument: 'viirs',
    timestampMs: 1_794_674_870_000, distanceKm: 115.3, isNadir: true, typicalIngestionLagMinutes: 90,
  }
  const viirsGeometry = {
    orbit: { slantRangeKm: 1772, offNadirDeg: 55.6 },
    sun: { elevationDeg: 67.5, glintAngleDeg: 54.8 },
    moon: { elevationDeg: 32.6, glintAngleDeg: 112 }, moonIlluminatedFraction: 0.2502,
  }
  const timestamp = '2026-11-14T15:00:00Z'
  const field = (value: number) => ({ value, unit: '1', validFromUtc: timestamp, validThroughUtc: timestamp })
  const weather = {
    acquiredAtUtc: new Date(viirs.timestamp).toISOString(),
    sources: [{ model: 'CAMS Global', status: 'available',
      values: { aerosol_optical_depth: field(0.26), dust: field(1), pm2_5: field(6.9), carbon_monoxide: field(128) } }],
  }
  const result = getWeatherPassAdjustment(viirs, next, weather, viirsGeometry, 160)
  assert.equal(result?.source, 'CAMS')
  assert.ok(Math.abs(result!.oddsMultiplier - 1.238091895807744) < 1e-8)
  assert.equal(result?.predictedFrp, null)
  assert.equal(getWeatherPassAdjustment(viirs, next, undefined), null)
})
