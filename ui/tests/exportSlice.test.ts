import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildFireSliceCsv, fireSliceFileName } from '../src/utils/exportSlice.ts'
import type { FirmsLiveSpotsResponse } from '../src/utils/fireSpots.ts'

const nowMs = Date.UTC(2026, 6, 15, 12, 0, 0)

const payload: FirmsLiveSpotsResponse = {
  generatedAtUtc: new Date(nowMs).toISOString(),
  fetchedAtUtc: new Date(nowMs).toISOString(),
  latestAcquiredAtUtc: null,
  stale: false,
  windowHours: 24,
  sensorFilter: 'harmonized',
  sources: [
    { code: 0, dataset: 'MODIS_NRT', label: 'MODIS 1km', instrument: 'modis', radiusMeters: 1000, count: 1 },
    { code: 1, dataset: 'VIIRS_NOAA20_NRT', label: 'VIIRS 375m / NOAA-20', instrument: 'viirs', radiusMeters: 375, count: 1 },
  ],
  count: 2,
  modisCount: 1,
  viirsCount: 1,
  maxFrpMw: 50,
  attribution: 'NASA FIRMS',
  columns: [],
  spots: [
    [10, 20, nowMs - 60_000, 50, 340, 95, 0, 'Terra', 'D',
      { dominantCode: 10, coverage: 0.9, classes: [{ code: 10, fraction: 0.75 }, { code: 130, fraction: 0.25 }] }],
    [11, 21, nowMs - 120_000, 5, 320, 60, 1, 'NOAA-20', 'N', null],
  ],
  landCoverDataset: {
    id: 'test',
    year: 2019,
    resolutionMeters: 1200,
    classLabels: { 10: 'Cropland', 130: 'Grassland' },
  },
}

describe('buildFireSliceCsv', () => {
  it('exports one row per detection with surface fractions', () => {
    const lines = buildFireSliceCsv(payload, 'harmonized').trimEnd().split('\n')
    assert.equal(lines.length, 3)
    assert.match(lines[0], /landcover_dominant,landcover_coverage,lc_10,lc_130$/)
    assert.match(lines[1], /Terra,modis,50,340,95,D,Cropland,0\.9,0\.75,0\.25$/)
    // Unclassified spot: surface fields stay empty, the row is still exported.
    assert.match(lines[2], /NOAA-20,viirs,5,320,60,N,{2,}/)
  })

  it('respects the sensor filter', () => {
    const lines = buildFireSliceCsv(payload, 'viirs').trimEnd().split('\n')
    assert.equal(lines.length, 2)
    assert.match(lines[1], /NOAA-20,viirs/)
  })

  it('names the file after filter and snapshot date', () => {
    assert.equal(fireSliceFileName(payload, 'modis'), 'fire-slice_modis_2026-07-15.csv')
  })
})
