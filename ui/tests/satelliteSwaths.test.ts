import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  advanceSatelliteHudEntries,
  computeGreatCircleDistanceKm,
  computeLiveOrbitalState,
  computeSatelliteHudElapsedMinutes,
  formatSatelliteHudSection,
  hasSatelliteHudCenterMoved,
  NADIR_SWATH_COLOR,
  NADIR_SWATH_FILL_OPACITY,
  NADIR_SWATH_STROKE_OPACITY,
  SATELLITE_ANIMATION_INTERVAL_MS,
  SATELLITE_HUD_MIN_MOVE_KM,
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
  assert.equal(section.title, 'Satellite passes')
  assert.equal(section.summary, 'Next: NOAA-20 in ~48m')
  assert.equal(section.items.length, 3)
  assert.equal(section.items[0].badge, 'processing')
  assert.equal(section.items[0].detail, '~1.5h delay')
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

test('formatSatelliteHudSection deduplicates repeated satellite entries by noradId', () => {
  const hudEntries: SatelliteHudEntry[] = [
    {
      noradId: 27424,
      name: 'Aqua',
      minutesSincePass: 114,
      ingestionLagMinutes: 120,
      isIngested: false,
      isNadir: false,
      nextPassMinutes: 190,
      layerVariantIds: ['modis', 'harmonized', 'wF'],
    },
    {
      noradId: 27424,
      name: 'Aqua',
      minutesSincePass: 120,
      ingestionLagMinutes: 120,
      isIngested: true,
      isNadir: false,
      nextPassMinutes: 190,
      layerVariantIds: ['modis', 'harmonized', 'wF'],
    },
    {
      noradId: 54234,
      name: 'NOAA-21',
      minutesSincePass: 228,
      ingestionLagMinutes: 90,
      isIngested: true,
      isNadir: false,
      nextPassMinutes: 250,
      layerVariantIds: ['viirs', 'harmonized', 'wF'],
    },
    {
      noradId: 43013,
      name: 'NOAA-20',
      minutesSincePass: 276,
      ingestionLagMinutes: 90,
      isIngested: true,
      isNadir: false,
      nextPassMinutes: 180,
      layerVariantIds: ['viirs', 'harmonized', 'wF'],
    },
  ]

  const section = formatSatelliteHudSection(hudEntries, {
    sensorFilter: 'harmonized',
    showOrbits: true,
  })
  assert.ok(section)
  assert.equal(section.items.filter((item) => item.label === 'Aqua').length, 1)
  assert.deepEqual(
    section.items.map((item) => item.label),
    ['Aqua', 'NOAA-21', 'NOAA-20'],
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

test('hasSatelliteHudCenterMoved respects minMoveKm threshold and antimeridian wrap', () => {
  const singapore = { lat: 1.3521, lng: 103.8198 }
  assert.equal(hasSatelliteHudCenterMoved(null, singapore), true)
  assert.equal(hasSatelliteHudCenterMoved(singapore, { lat: 1.4, lng: 103.85 }), false)
  assert.equal(hasSatelliteHudCenterMoved(singapore, { lat: 1.8, lng: 103.8198 }), true)

  // Antimeridian crossing: 0.1 deg apart (~11 km at equator) vs 1.0 deg apart (~111 km at equator)
  const nearEast = { lat: 0, lng: 179.95 }
  const nearWest = { lat: 0, lng: -179.95 }
  assert.ok(computeGreatCircleDistanceKm(nearEast, nearWest) < SATELLITE_HUD_MIN_MOVE_KM)
  assert.equal(hasSatelliteHudCenterMoved(nearEast, nearWest), false)

  const farEast = { lat: 0, lng: 179.5 }
  const farWest = { lat: 0, lng: -179.5 }
  assert.ok(computeGreatCircleDistanceKm(farEast, farWest) >= SATELLITE_HUD_MIN_MOVE_KM)
  assert.equal(hasSatelliteHudCenterMoved(farEast, farWest), true)
})

test('formatSatelliteHudSection advances elapsed minutes, flips processing to ready, and handles pass rollover', () => {
  const generatedAtUtc = '2026-11-14T15:00:00Z'
  const generatedAtMs = Date.parse(generatedAtUtc)

  assert.equal(computeSatelliteHudElapsedMinutes(generatedAtUtc, generatedAtMs + 59_000), 0)
  assert.equal(computeSatelliteHudElapsedMinutes(generatedAtUtc, generatedAtMs + 60_000), 1)
  assert.equal(computeSatelliteHudElapsedMinutes(generatedAtUtc, generatedAtMs - 5_000), 0)

  const hudEntries: SatelliteHudEntry[] = [
    {
      noradId: 43013,
      name: 'NOAA-20',
      minutesSincePass: 85,
      ingestionLagMinutes: 90,
      isIngested: false,
      isNadir: true,
      nextPassMinutes: 15,
      layerVariantIds: ['viirs', 'harmonized', 'wF'],
    },
    {
      noradId: 25994,
      name: 'Terra',
      minutesSincePass: 140,
      ingestionLagMinutes: 120,
      isIngested: true,
      isNadir: false,
      nextPassMinutes: 10,
      layerVariantIds: ['modis', 'harmonized', 'wF'],
    },
    {
      noradId: 54234,
      name: 'NOAA-21',
      minutesSincePass: 200,
      ingestionLagMinutes: 90,
      isIngested: true,
      isNadir: false,
      nextPassMinutes: 25,
      layerVariantIds: ['viirs', 'harmonized', 'wF'],
    },
  ]

  // Sub-minute elapsed delta keeps original snapshot without flickering
  const initialSection = formatSatelliteHudSection(hudEntries, {
    sensorFilter: 'harmonized',
    showOrbits: true,
    generatedAtUtc,
    nowUnixMs: generatedAtMs + 45_000,
  })
  assert.ok(initialSection)
  assert.equal(initialSection.items[0].value, '1.4h ago')
  assert.equal(initialSection.items[0].badge, 'processing')
  assert.equal(initialSection.summary, 'Next: Terra in ~10m')

  // +6 minutes: NOAA-20 crosses 90m ingestion lag -> flips processing to ready; Terra next pass shrinks to 4m
  const readySection = formatSatelliteHudSection(hudEntries, {
    sensorFilter: 'harmonized',
    showOrbits: true,
    generatedAtUtc,
    nowUnixMs: generatedAtMs + 6 * 60_000,
  })
  assert.ok(readySection)
  assert.equal(readySection.items[0].label, 'NOAA-20')
  assert.equal(readySection.items[0].value, '1.5h ago')
  assert.equal(readySection.items[0].badge, 'ready')
  assert.equal(readySection.items[0].detail, '')
  assert.equal(readySection.summary, 'Next: Terra in ~4m')

  // +12 minutes: Terra passes overhead (nextPassMinutes=10 -> 2m ago, processing) and moves to top; summary updates to NOAA-20
  const rolledEntries = advanceSatelliteHudEntries(hudEntries, 12)
  assert.equal(rolledEntries[1].minutesSincePass, 2)
  assert.equal(rolledEntries[1].isIngested, false)
  assert.equal(rolledEntries[1].nextPassMinutes, null)

  const rolloverSection = formatSatelliteHudSection(hudEntries, {
    sensorFilter: 'harmonized',
    showOrbits: true,
    elapsedMinutes: 12,
  })
  assert.ok(rolloverSection)
  assert.equal(rolloverSection.items[0].label, 'Terra')
  assert.equal(rolloverSection.items[0].value, '2m ago')
  assert.equal(rolloverSection.items[0].badge, 'processing')
  assert.equal(rolloverSection.summary, 'Next: NOAA-20 in ~3m')
})

test('map-hud-bottom keeps SatelliteHud bottom-anchored when fire-tooltip-card appears', () => {
  const appCss = fs.readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
  const match = appCss.match(/\.map-hud-bottom\s*\{([^}]*)\}/)
  assert.ok(match, 'expected .map-hud-bottom CSS rule')
  const body = match[1]
  assert.match(body, /display:\s*flex\s*;/)
  assert.match(body, /flex-wrap:\s*wrap\s*;/)
  assert.match(body, /align-items:\s*flex-end\s*;/)
  assert.doesNotMatch(body, /wrap-reverse/)
})
