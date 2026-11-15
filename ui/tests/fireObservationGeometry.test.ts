import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fetchPinnedFireGeometry,
  readPinnedFireGeometry,
  summarizeFireGeometry,
  type FireObservationGeometry,
} from '../src/utils/fireObservationGeometry.ts'
import type { FireSpotTooltipInput } from '../src/utils/fireSpots.ts'

const modis: FireSpotTooltipInput = {
  lng: 4, lat: 7, timestamp: 1000, frp: 20, instrument: 'modis', source: 'MODIS 1km', satellite: 'Aqua',
}
const viirs: FireSpotTooltipInput = {
  ...modis, timestamp: 2000, instrument: 'viirs', source: 'VIIRS 375m / NOAA-20', satellite: 'NOAA-20',
}
const geometry: FireObservationGeometry = {
  orbit: { offNadirDeg: 12, slantRangeKm: 722 },
  sun: { elevationDeg: -4, glintAngleDeg: null },
  moon: { elevationDeg: 30, glintAngleDeg: 22 },
  moonIlluminatedFraction: 0.15,
}

test('rolls up negative elevations and available glint values independently by instrument', () => {
  const summary = summarizeFireGeometry([modis, viirs, modis, viirs], [
    geometry,
    { ...geometry, moonIlluminatedFraction: 0.42 },
    { ...geometry, sun: { elevationDeg: 5, glintAngleDeg: 10 }, orbit: null },
    null,
  ])
  assert.deepEqual(summary?.sensors, ['modis', 'viirs'])
  assert.deepEqual(summary?.rows.map(({ bySensor }) => bySensor.map(({ text }) => text)), [
    ['12°', '12°'],
    ['722 km', '722 km'],
    ['-4–5°', '-4°'],
    ['10°', null],
    ['30°', '30°'],
    ['22°', '22°'],
    ['15%', '42%'],
  ])
  assert.deepEqual(summary?.rows[3].bySensor[0], { text: '10°', count: 1, total: 2 })
  assert.deepEqual(summarizeFireGeometry([viirs], [geometry])?.sensors, ['viirs'])
})

test('uses geometry from the live rows and requests only missing pinned detections', async (t) => {
  const feedGeometry = readPinnedFireGeometry({
    geometryStatus: 'ready',
    spots: [
      [4, 7, 1000, 20, 350, 80, 1, 'NOAA-20', 'D', null, { ...geometry, orbit: null }],
      [4, 7, 1000, 20, 350, 80, 0, 'Aqua', 'D', null, geometry],
    ],
  }, [viirs, modis])
  assert.deepEqual(feedGeometry, [null, geometry])

  const mockFetch = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.deepEqual(JSON.parse(String(options.body)).spots, [
      { lng: 4, lat: 7, timestampMs: 2000, satellite: 'NOAA-20' },
    ])
    return { ok: true, json: () => ({ status: 'ready', spots: [{ ...geometry, orbit: null }] }) }
  })
  const result = await fetchPinnedFireGeometry('', [viirs, modis], new AbortController().signal, feedGeometry)
  assert.deepEqual(result, [{ ...geometry, orbit: null }, geometry])
  assert.equal(mockFetch.mock.callCount(), 1)
})

test('polls pending geometry and preserves selection order when an input has no lookup key', { timeout: 5000 }, async (t) => {
  let requests = 0
  const mockFetch = t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/fires/spots/geometry')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(String(options.body)).spots.map(({ satellite }: { satellite: string }) => satellite), ['Aqua', 'NOAA-20'])
    if (++requests === 1) {
      return { ok: true, json: () => ({ status: 'pending', spots: null }) }
    }
    return { ok: true, json: () => ({ status: 'ready', spots: [geometry, { ...geometry, orbit: null }] }) }
  })
  const result = await fetchPinnedFireGeometry('', [modis, { ...modis, lng: undefined }, viirs], new AbortController().signal)
  assert.deepEqual(result, [geometry, null, { ...geometry, orbit: null }])
  assert.equal(mockFetch.mock.callCount(), 2)
})
