import assert from 'node:assert/strict'
import test from 'node:test'
import {
  areBoundsClose,
  clampViewportBounds,
  computeLiveOrbitalState,
  formatSatelliteHudSection,
  getSatelliteTooltip,
  interpolateSwathRing,
  NADIR_SWATH_COLOR,
  SATELLITE_ANIMATION_INTERVAL_MS,
  WIDE_SWATH_COLOR,
  type SatelliteHudEntry,
  type SatelliteOrbit,
  type SatelliteSwathsResponse,
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

test('extremum swath visual palette and 500ms cadence constants match', () => {
  assert.equal(SATELLITE_ANIMATION_INTERVAL_MS, 500)
  assert.equal(NADIR_SWATH_COLOR, '#92b4de')
  assert.equal(WIDE_SWATH_COLOR, '#f49a74')
})

test('clampViewportBounds handles narrow satelliteOnly padding and full-globe span', () => {
  const zoomedIn = clampViewportBounds(
    { west: 103.5, south: 1.0, east: 104.1, north: 1.6 },
    { satelliteOnly: true },
  )
  assert.ok(zoomedIn)
  assert.equal(zoomedIn.east - zoomedIn.west, 10)
  assert.equal(zoomedIn.north - zoomedIn.south, 10)

  const fullGlobe = clampViewportBounds(
    { west: -220, south: -88, east: 210, north: 89 },
    { satelliteOnly: true },
  )
  assert.deepEqual(fullGlobe, { west: -180, south: -85, east: 180, north: 85 })

  assert.equal(
    areBoundsClose(
      { west: 95, south: -5, east: 115, north: 10 },
      { west: 95.3, south: -4.8, east: 115.2, north: 9.7 },
    ),
    true,
  )
  assert.equal(
    areBoundsClose(
      { west: 95, south: -5, east: 115, north: 10 },
      { west: 98, south: -5, east: 115, north: 10 },
    ),
    false,
  )
})

test('interpolateSwathRing linearly blends coordinates and guards antimeridian jumps', () => {
  const startRing = [
    [10, 20],
    [12, 20],
    [12, 22],
    [10, 22],
    [10, 20],
  ]
  const endRing = [
    [11, 21],
    [13, 21],
    [13, 23],
    [11, 23],
    [11, 21],
  ]
  const mid = interpolateSwathRing(startRing, endRing, 100, 110, 105)
  assert.deepEqual(mid[0], [10.5, 20.5])
  assert.deepEqual(mid[2], [12.5, 22.5])

  const antimeridianStart = [
    [179, 50],
    [179.9, 50],
  ]
  const antimeridianEnd = [
    [-179, 50],
    [-178.1, 50],
  ]
  const early = interpolateSwathRing(antimeridianStart, antimeridianEnd, 100, 110, 102)
  assert.deepEqual(early, antimeridianStart)
  const late = interpolateSwathRing(antimeridianStart, antimeridianEnd, 100, 110, 108)
  assert.deepEqual(late, antimeridianEnd)
})

test('getSatelliteTooltip and formatSatelliteHudSection produce extremum formatting', () => {
  assert.equal(
    getSatelliteTooltip({ name: 'NOAA-20', altitudeKm: 830.2, groundSpeedKmS: 7.42 }),
    'NOAA-20, altitude 830.2 km, speed 7.42 km/s',
  )

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

test('computeLiveOrbitalState interpolates backend swaths and falls back cleanly when stale', () => {
  const orbit = createSampleOrbit()
  const t0Ms = 1_794_500_000_000
  const t0Sec = t0Ms / 1000
  const liveSwaths: SatelliteSwathsResponse = {
    type: 'FeatureCollection',
    satelliteHud: [],
    features: [
      {
        type: 'Feature',
        id: 'sat_43013',
        properties: {
          id: 'sat_43013',
          noradId: 43013,
          name: 'NOAA-20',
          angle: 348,
          altitudeKm: 830.2,
          speedKmS: 7.42,
          type: 'satellite',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [103.8, 1.5, 830200, t0Sec],
            [103.6, 1.8, 830200, t0Sec + 5],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {
          satelliteId: 'sat_43013',
          swathRole: 'wide',
          type: 'satellite-swath',
          endRing: [
            [100, 0],
            [108, 0],
            [108, 4],
            [100, 4],
            [100, 0],
          ],
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [100, -1],
              [108, -1],
              [108, 3],
              [100, 3],
              [100, -1],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {
          satelliteId: 'sat_43013',
          swathRole: 'nadir',
          type: 'satellite-swath',
          endRing: [
            [102, 1],
            [105, 1],
            [105, 3],
            [102, 3],
            [102, 1],
          ],
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [102, 0],
              [105, 0],
              [105, 2],
              [102, 2],
              [102, 0],
            ],
          ],
        },
      },
    ],
  }

  const midState = computeLiveOrbitalState([orbit], 'harmonized', t0Ms + 2500, true, liveSwaths)
  assert.equal(midState.snapshots[0].lat, 1.65)
  assert.equal(midState.wideSwathsGeoJson.features.length, 1)
  assert.equal(midState.nadirSwathsGeoJson.features.length, 1)
  assert.deepEqual(midState.wideSwathsGeoJson.features[0].geometry.coordinates[0][0], [100, -0.5])
  assert.deepEqual(midState.nadirSwathsGeoJson.features[0].geometry.coordinates[0][0], [102, 0.5])

  // Beyond +15s past end timestamp, fallback computes 49-vertex swaths from orbit track
  const fallbackState = computeLiveOrbitalState(
    [orbit],
    'harmonized',
    t0Ms + 25_000,
    true,
    liveSwaths,
  )
  assert.equal(fallbackState.wideSwathsGeoJson.features[0].geometry.coordinates[0].length, 49)
  assert.equal(fallbackState.nadirSwathsGeoJson.features[0].geometry.coordinates[0].length, 49)
})
