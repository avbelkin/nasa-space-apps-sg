import assert from 'node:assert/strict'
import { test } from 'node:test'
import { forecastNextPassFrp } from '../src/utils/frpForecast.ts'
import type { ComputedOverpass } from '../src/utils/satelliteOverpassTimeline.ts'

const minute = 60_000
const spot = {
  instrument: 'viirs' as const, satellite: 'NOAA-21', source: 'VIIRS', timestamp: 1_794_652_920_000,
  frp: 27.5, brightnessK: 367, confidence: 95, dayNight: 'D',
}
const next: ComputedOverpass = {
  instrument: 'viirs', satellite: 'NOAA-20', satelliteId: 'noaa20', noradId: 43013,
  timestampMs: 1_794_656_310_000, distanceKm: 210.6, isNadir: false, typicalIngestionLagMinutes: 90,
}
const geometry = {
  orbit: { slantRangeKm: 1441, offNadirDeg: 49.9 },
  sun: { elevationDeg: 73.3, glintAngleDeg: 43.3 },
  moon: { elevationDeg: 46.9, glintAngleDeg: 98 }, moonIlluminatedFraction: 0.2324,
}

test('reproduces the fitted FRP estimate for a same-family pair', () => {
  const forecast = forecastNextPassFrp(spot, [next], spot.timestamp + 5 * minute, geometry, 120)
  assert.ok(forecast)
  assert.equal(forecast.originalMw, spot.frp)
  assert.ok(Math.abs(forecast.predictedMw - 10.270357224567041) < 1e-9)
  assert.equal(forecast.differenceMw, forecast.predictedMw - spot.frp)
})

test('reproduces the fitted FRP estimate for a cross-family pair', () => {
  const modis = {
    instrument: 'modis' as const, satellite: 'Terra', source: 'MODIS', timestamp: 1_794_653_460_000,
    frp: 25.2, brightnessK: 323.7, confidence: 100, dayNight: 'N',
  }
  const pass = { ...next, satellite: 'NOAA-21', timestampMs: 1_794_668_670_000, distanceKm: 739.6 }
  const modisGeometry = {
    orbit: { slantRangeKm: 745, offNadirDeg: 19.8 },
    sun: { elevationDeg: -31.1, glintAngleDeg: null },
    moon: { elevationDeg: 23.3, glintAngleDeg: 45 }, moonIlluminatedFraction: 0.2227,
  }
  const forecast = forecastNextPassFrp(modis, [pass], modis.timestamp + 5 * minute, modisGeometry, 122)
  assert.ok(forecast)
  assert.ok(Math.abs(forecast.predictedMw - 3.0133849098386785) < 1e-9)
})

test('excludes past passes, same-spacecraft passes, and passes outside the training window', () => {
  assert.equal(forecastNextPassFrp(spot, [next], next.timestampMs), null)
  assert.equal(forecastNextPassFrp(spot, [{ ...next, satellite: spot.satellite }], spot.timestamp), null)
  assert.equal(forecastNextPassFrp(spot, [{ ...next, timestampMs: spot.timestamp + 350 * minute }], spot.timestamp), null)
})
