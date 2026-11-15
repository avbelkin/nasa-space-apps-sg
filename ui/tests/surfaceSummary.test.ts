import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FirmsLiveSpotsResponse, FirmsSpotTuple } from '../src/utils/fireSpots.ts'
import { summarizeSurfaceBySensor } from '../src/utils/surfaceSummary.ts'

const nowMs = Date.UTC(2026, 6, 15, 12, 0, 0)

function makePayload(spots: FirmsSpotTuple[]): FirmsLiveSpotsResponse {
  return {
    generatedAtUtc: new Date(nowMs).toISOString(),
    fetchedAtUtc: new Date(nowMs).toISOString(),
    latestAcquiredAtUtc: null,
    stale: false,
    windowHours: 24,
    sensorFilter: 'harmonized',
    sources: [
      { code: 0, dataset: 'MODIS_NRT', label: 'MODIS 1km', instrument: 'modis', radiusMeters: 1000, count: 0 },
      { code: 1, dataset: 'VIIRS_NOAA20_NRT', label: 'VIIRS 375m / NOAA-20', instrument: 'viirs', radiusMeters: 375, count: 0 },
    ],
    count: spots.length,
    modisCount: spots.filter((spot) => spot[6] === 0).length,
    viirsCount: spots.filter((spot) => spot[6] === 1).length,
    maxFrpMw: 0,
    attribution: 'NASA FIRMS',
    columns: [],
    spots,
    landCoverDataset: {
      id: 'test',
      year: 2019,
      resolutionMeters: 1200,
      classLabels: { 10: 'Cropland', 50: 'Forest', 190: 'Urban areas' },
    },
  }
}

function spot(sourceCode: number, dominantCode: number | null, index: number): FirmsSpotTuple {
  return [
    index, index, nowMs - index * 60_000, 10, 330, 80, sourceCode,
    sourceCode === 0 ? 'Terra' : 'NOAA-20', 'D',
    dominantCode === null
      ? null
      : { dominantCode, coverage: 1, classes: [{ code: dominantCode, fraction: 1 }] },
  ]
}

describe('summarizeSurfaceBySensor', () => {
  it('groups by dominant class, splits sensors, and folds small classes', () => {
    const spots: FirmsSpotTuple[] = [
      ...Array.from({ length: 4 }, (_, i) => spot(0, 10, i)),
      ...Array.from({ length: 3 }, (_, i) => spot(1, 10, 10 + i)),
      ...Array.from({ length: 6 }, (_, i) => spot(1, 50, 20 + i)),
      spot(0, 190, 30),
      spot(1, 190, 31),
      spot(1, null, 32),
    ]
    const rows = summarizeSurfaceBySensor(makePayload(spots))

    assert.deepEqual(
      rows.map(({ label, modisCount, viirsCount, total, kind }) => [label, modisCount, viirsCount, total, kind]),
      [
        ['Cropland', 4, 3, 7, 'class'],
        ['Forest', 0, 6, 6, 'class'],
        ['Other (1 small class)', 1, 1, 2, 'other'],
        ['Not classified', 0, 1, 1, 'unclassified'],
      ],
    )
    assert.equal(
      rows.reduce((sum, row) => sum + row.total, 0),
      spots.length,
    )
  })

  it('returns no rows without a payload or detections', () => {
    assert.deepEqual(summarizeSurfaceBySensor(null), [])
    assert.deepEqual(summarizeSurfaceBySensor(makePayload([])), [])
  })
})
