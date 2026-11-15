import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fetchPinnedFireWeather,
  summarizeFireWeather,
  type FireObservationWeather,
} from '../src/utils/fireObservationWeather.ts'
import type { FireSpotTooltipInput } from '../src/utils/fireSpots.ts'

const modis: FireSpotTooltipInput = {
  lng: 4, lat: 7, timestamp: 1000, frp: 20, instrument: 'modis', source: 'MODIS 1km', satellite: 'Aqua',
}
const viirs: FireSpotTooltipInput = {
  ...modis, timestamp: 2000, instrument: 'viirs', source: 'VIIRS 375m', satellite: 'NOAA-20',
}

test('uses acquisition identities in 16-spot requests and preserves order through missing results', async (t) => {
  const signal = new AbortController().signal
  const mockFetch = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    const { spots } = JSON.parse(String(options.body)) as { spots: { timestampMs: number }[] }
    return {
      ok: true,
      json: () => ({
        spots: spots.map(({ timestampMs }) => ({
          acquiredAtUtc: new Date(timestampMs === 2000 ? 3000 : timestampMs).toISOString(),
          sources: [],
        })),
      }),
    }
  })
  const result = await fetchPinnedFireWeather('', [...Array(16).fill(modis), { ...modis, lng: undefined }, viirs], signal)
  const calls = mockFetch.mock.calls
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map(({ arguments: [, options] }) => JSON.parse(String(options?.body)).spots.length), [16, 1])
  assert.deepEqual(calls[0].arguments[0], '/api/fires/spots/weather')
  assert.equal(calls[0].arguments[1]?.signal, signal)
  assert.deepEqual(JSON.parse(String(calls[1].arguments[1]?.body)).spots, [{ lng: 4, lat: 7, timestampMs: 2000, satellite: 'NOAA-20' }])
  assert.ok(result.slice(0, 16).every((spot) => Date.parse(spot?.acquiredAtUtc ?? '') === 1000))
  assert.deepEqual(result.slice(16), [null, null])
})

test('summarizes available weather independently by sensor, including zero precipitation', () => {
  const sample = (temperature: number, rain: number | null): FireObservationWeather => ({
    acquiredAtUtc: new Date(1000).toISOString(),
    sources: [{ values: {
      temperature_2m: { value: temperature, unit: 'K' },
      precipitation_3h: { value: rain, unit: 'mm' },
    } }],
  })
  const summary = summarizeFireWeather([modis, modis, viirs], [sample(273.15, 0), null, sample(293.15, null)])
  assert.deepEqual(summary?.sensors, ['modis', 'viirs'])
  assert.deepEqual(summary?.rows.map(({ label }) => label), ['Air temperature', 'Precipitation · 3 h'])
  assert.deepEqual(summary?.rows[0].bySensor.map(({ text }) => text), ['0 °C', '20 °C'])
  assert.deepEqual(summary?.rows[1].bySensor, [
    { text: '0 mm', count: 1, total: 2 },
    { text: null, count: 0, total: 1 },
  ])
})
