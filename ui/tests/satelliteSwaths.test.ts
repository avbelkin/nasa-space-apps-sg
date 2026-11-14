import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeLiveOrbitalState,
  formatSatelliteHudSection,
  NADIR_SWATH_COLOR,
  NADIR_SWATH_FILL_OPACITY,
  NADIR_SWATH_STROKE_OPACITY,
  SATELLITE_ANIMATION_INTERVAL_MS,
  WIDE_SWATH_COLOR,
  WIDE_SWATH_DASH_ARRAY,
  WIDE_SWATH_FILL_OPACITY,
  WIDE_SWATH_STROKE_OPACITY,
  type SatelliteHudEntry,
  type SatelliteOrbit,
} from '../src/utils/satelliteOrbits.ts'

function createSampleOrbit(): SatelliteOrbit {
  const t0 = 1_794_500_000_000
  return {
    id: 'noaa-20',
    name: 'NOAA-20',
    noradId: 43013,
    instrument: 'viirs',
    instrumentLabel: 'VIIRS (375 m)',
    crossingNote: '13:30 LT ascending (JPSS-1)',
    nadirSwathKm: 400,
    wideSwathKm: 3040,
    typicalIngestionLagMinutes: 90,
    layerVariantIds: ['viirs', 'harmonized', 'wF'],
    tleSource: 'celestrak',
    tleEpochUtc: '2026-11-13T22:11:00Z',
    inclinationDeg: 98.79,
    periodMinutes: 101.44,
    currentPosition: {
      timestampUnixMs: t0,
      lat: 1.5,
      lng: 103.8,
      altitudeKm: 830.2,
      groundSpeedKmS: 7.42,
      headingDeg: 348,
      isAscending: true,
    },
    track: [
      {
        timestampUnixMs: t0 - 30_000,
        lat: 0.1,
        lng: 104.2,
        altitudeKm: 830,
        headingDeg: 348,
        isAscending: true,
      },
      {
        timestampUnixMs: t0,
        lat: 1.5,
        lng: 103.8,
        altitudeKm: 830.2,
        headingDeg: 348,
        isAscending: true,
      },
      {
        timestampUnixMs: t0 + 30_000,
        lat: 2.9,
        lng: 103.4,
        altitudeKm: 830.4,
        headingDeg: 348,
        isAscending: true,
      },
    ],
  }
}

test('extremum swath styles and 500ms animation interval match', () => {
  assert.equal(SATELLITE_ANIMATION_INTERVAL_MS, 500)
  assert.equal(NADIR_SWATH_COLOR, '#92b4de')
  assert.equal(NADIR_SWATH_FILL_OPACITY, 0.14)
  assert.equal(NADIR_SWATH_STROKE_OPACITY, 0.32)
  assert.equal(WIDE_SWATH_COLOR, '#f49a74')
  assert.equal(WIDE_SWATH_FILL_OPACITY, 0.035)
  assert.equal(WIDE_SWATH_STROKE_OPACITY, 0.12)
  assert.deepEqual(WIDE_SWATH_DASH_ARRAY, [4, 6])
})

test('formatSatelliteHudSection formats SAT freshness, ready fallback, and sensor filtering', () => {
  const hudEntries: SatelliteHudEntry[] = [
    {
      noradId: 43013,
      name: 'NOAA-20',
      minutesSincePass: 12,
      ingestionLagMinutes: 90,
      isIngested: false,
      isNadir: true,
      nextPassMinutes: 48,
      layerVariantIds: ['viirs', 'harmonized', 'wF'],
    },
    {
      noradId: 54234,
      name: 'NOAA-21',
      minutesSincePass: 35,
      ingestionLagMinutes: 90,
      isIngested: false,
      isNadir: false,
      nextPassMinutes: 85,
      layerVariantIds: ['viirs', 'harmonized', 'wF'],
    },
    {
      noradId: 25994,
      name: 'Terra',
      minutesSincePass: 150,
      ingestionLagMinutes: 120,
      isIngested: false,
      isNadir: false,
      nextPassMinutes: 110,
      layerVariantIds: ['modis', 'harmonized', 'wF'],
    },
    {
      noradId: 27424,
      name: 'Aqua',
      minutesSincePass: 240,
      ingestionLagMinutes: 120,
      isIngested: true,
      isNadir: true,
      nextPassMinutes: 140,
      layerVariantIds: ['modis', 'harmonized', 'wF'],
    },
  ]

  const section = formatSatelliteHudSection(hudEntries, {
    sensorFilter: 'harmonized',
    showOrbits: true,
  })
  assert.ok(section)
  assert.equal(section.title, 'SAT')
  assert.equal(section.summary, 'next NOAA-20 ~48m')
  assert.equal(section.items.length, 3)
  assert.equal(section.items[0].badge, 'processing')
  assert.equal(section.items[0].detail, 'lag ~1.5h')
  assert.equal(section.items[2].label, 'Aqua')
  assert.equal(section.items[2].badge, 'ready')

  assert.equal(
    formatSatelliteHudSection(hudEntries, { sensorFilter: 'viirs', showOrbits: true })?.items
      .length,
    2,
  )
  assert.equal(
    formatSatelliteHudSection(hudEntries, { sensorFilter: 'harmonized', showOrbits: false }),
    null,
  )
})

test('computeLiveOrbitalState builds separate 49-vertex wide and nadir swaths plus positions', () => {
  const orbit = createSampleOrbit()
  const t0Ms = 1_794_500_000_000

  const state = computeLiveOrbitalState([orbit], 'harmonized', t0Ms + 500, true)
  assert.equal(state.snapshots.length, 1)
  assert.equal(state.wideSwathsGeoJson.features.length, 1)
  assert.equal(state.nadirSwathsGeoJson.features.length, 1)
  assert.equal(state.positionsGeoJson.features.length, 1)
  assert.equal(state.wideSwathsGeoJson.features[0].geometry.coordinates[0].length, 49)
  assert.equal(state.nadirSwathsGeoJson.features[0].geometry.coordinates[0].length, 49)

  const hidden = computeLiveOrbitalState([orbit], 'harmonized', t0Ms + 500, false)
  assert.equal(hidden.wideSwathsGeoJson.features.length, 0)
  assert.equal(hidden.nadirSwathsGeoJson.features.length, 0)
  assert.equal(hidden.positionsGeoJson.features.length, 0)
})
