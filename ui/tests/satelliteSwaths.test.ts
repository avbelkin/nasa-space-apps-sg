import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import type { MapSourceDataEvent } from 'maplibre-gl'
import {
  createSatelliteAnimationController,
  MAX_PENDING_ORBIT_SYNC_MS,
  SATELLITE_ORBITS_SOURCE_ID,
  shouldAdvanceSatelliteFrame,
  type SatelliteAnimationMapLike,
} from '../src/utils/satelliteAnimation.ts'
import {
  advanceSatelliteHudEntries,
  buildInstantaneousSwathPolygon,
  computeGreatCircleDistanceKm,
  computeLiveOrbitalState,
  computeSatelliteHudElapsedMinutes,
  fetchSatelliteOrbits,
  formatSatelliteHudSection,
  hasSatelliteHudCenterMoved,
  interpolateTrackAtTime,
  NADIR_SWATH_COLOR,
  NADIR_SWATH_FILL_OPACITY,
  NADIR_SWATH_STROKE_OPACITY,
  resolveSatelliteProcessingLagMinutes,
  SATELLITE_ANIMATION_FPS,
  SATELLITE_ANIMATION_INTERVAL_MS,
  SATELLITE_HUD_MIN_MOVE_KM,
  SATELLITE_ORBIT_FUTURE_MINUTES,
  SATELLITE_ORBIT_PAST_MINUTES,
  SATELLITE_ORBIT_STEP_SECONDS,
  SATELLITE_TRACK_LAG_DASH_ARRAY,
  WIDE_SWATH_COLOR,
  WIDE_SWATH_DASH_ARRAY,
  WIDE_SWATH_FILL_OPACITY,
  WIDE_SWATH_STROKE_OPACITY,
  type LiveOrbitalState,
  type LiveSatelliteSnapshot,
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

test('extremum swath styles and 30fps animation interval match', () => {
  assert.equal(SATELLITE_ANIMATION_FPS, 30)
  assert.equal(SATELLITE_ANIMATION_INTERVAL_MS, 1000 / 30)
  assert.equal(NADIR_SWATH_COLOR, '#92b4de')
  assert.equal(NADIR_SWATH_FILL_OPACITY, 0.14)
  assert.equal(NADIR_SWATH_STROKE_OPACITY, 0.32)
  assert.equal(WIDE_SWATH_COLOR, '#ffc078')
  assert.equal(WIDE_SWATH_FILL_OPACITY, 0.0875)
  assert.ok(Math.abs(WIDE_SWATH_FILL_OPACITY - (0.035 + NADIR_SWATH_FILL_OPACITY) / 2) < 1e-12)
  assert.equal(WIDE_SWATH_STROKE_OPACITY, 0.32)
  assert.equal(WIDE_SWATH_STROKE_OPACITY, NADIR_SWATH_STROKE_OPACITY)
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
  assert.equal(state.pastTracksGeoJson.features.length, 0)
  assert.equal(state.pastLagTracksGeoJson.features.length, 1)
  assert.equal(state.positionsGeoJson.features.length, 1)
  assert.equal(state.wideSwathsGeoJson.features[0].geometry.coordinates[0].length, 49)
  assert.equal(state.nadirSwathsGeoJson.features[0].geometry.coordinates[0].length, 49)

  const countByKind = new Map<string, number>()
  for (const feature of state.combinedGeoJson.features) {
    const kind = String(feature.properties?.orbitalFeatureKind ?? '')
    countByKind.set(kind, (countByKind.get(kind) ?? 0) + 1)
  }
  assert.equal(state.combinedGeoJson.features.length, 4)
  assert.equal(countByKind.get('wide-swath'), 1)
  assert.equal(countByKind.get('nadir-swath'), 1)
  assert.equal(countByKind.get('past-lag-track'), 1)
  assert.equal(countByKind.get('future-track'), undefined)
  assert.equal(countByKind.get('position'), 1)

  const hidden = computeLiveOrbitalState([orbit], 'harmonized', t0Ms + 500, false)
  assert.equal(hidden.wideSwathsGeoJson.features.length, 0)
  assert.equal(hidden.nadirSwathsGeoJson.features.length, 0)
  assert.equal(hidden.pastTracksGeoJson.features.length, 0)
  assert.equal(hidden.pastLagTracksGeoJson.features.length, 0)
  assert.equal(hidden.positionsGeoJson.features.length, 0)
  assert.equal(hidden.combinedGeoJson.features.length, 0)
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

test('interpolateTrackAtTime and swaths advance smoothly across 30fps frames, heading wraparound, and antimeridian', () => {
  const orbit = createSampleOrbit()
  const t0 = orbit.currentPosition.timestampUnixMs

  const framePositions = Array.from({ length: 12 }, (_, idx) => {
    const pos = interpolateTrackAtTime(orbit, t0 + idx * SATELLITE_ANIMATION_INTERVAL_MS)
    const ring = buildInstantaneousSwathPolygon(pos.lat, pos.lng, pos.headingDeg, 400, 180)
    return { pos, ring }
  })

  for (let i = 1; i < framePositions.length; i++) {
    const prev = framePositions[i - 1]
    const curr = framePositions[i]
    const dLat = curr.pos.lat - prev.pos.lat
    const dLng = curr.pos.lng - prev.pos.lng
    assert.ok(dLat > 0.001 && dLat < 0.002, `expected sub-pixel 30fps lat delta, got ${dLat}`)
    assert.ok(dLng < -0.0003 && dLng > -0.001, `expected sub-pixel 30fps lng delta, got ${dLng}`)
    assert.notDeepEqual(curr.ring[0], prev.ring[0])
  }

  // Smooth shortest-arc heading wraparound (355 deg -> 5 deg -> 15 deg) without 30s jumps
  const headingOrbit: SatelliteOrbit = {
    ...orbit,
    track: [
      { timestampUnixMs: t0, lat: 70, lng: 10, altitudeKm: 830, headingDeg: 355, isAscending: true },
      {
        timestampUnixMs: t0 + 30_000,
        lat: 71,
        lng: 11,
        altitudeKm: 830,
        headingDeg: 5,
        isAscending: true,
      },
      {
        timestampUnixMs: t0 + 60_000,
        lat: 72,
        lng: 12,
        altitudeKm: 830,
        headingDeg: 15,
        isAscending: true,
      },
    ],
  }
  const q1 = interpolateTrackAtTime(headingOrbit, t0 + 7_500)
  const mid = interpolateTrackAtTime(headingOrbit, t0 + 15_000)
  const q3 = interpolateTrackAtTime(headingOrbit, t0 + 22_500)
  const pastBoundary = interpolateTrackAtTime(headingOrbit, t0 + 30_000 + SATELLITE_ANIMATION_INTERVAL_MS)
  assert.ok(Math.abs(q1.headingDeg - 357.5) < 1e-6)
  assert.ok(mid.headingDeg < 1e-6 || Math.abs(mid.headingDeg - 360) < 1e-6)
  assert.ok(Math.abs(q3.headingDeg - 2.5) < 1e-6)
  assert.ok(Math.abs(pastBoundary.headingDeg - (5 + 10 / 900)) < 1e-6)

  // Spherical great-circle interpolation across the ±180° antimeridian stays near ±180°
  const antiOrbit: SatelliteOrbit = {
    ...orbit,
    track: [
      {
        timestampUnixMs: t0,
        lat: 5,
        lng: 179.8,
        altitudeKm: 830,
        headingDeg: 340,
        isAscending: true,
      },
      {
        timestampUnixMs: t0 + 30_000,
        lat: 6,
        lng: -179.8,
        altitudeKm: 830,
        headingDeg: 340,
        isAscending: true,
      },
    ],
  }
  const antiMid = interpolateTrackAtTime(antiOrbit, t0 + 15_000)
  assert.ok(Math.abs(antiMid.lng) >= 179.99, `expected antimeridian crossing near ±180, got ${antiMid.lng}`)
})

test('shouldAdvanceSatelliteFrame locks cleanly to 30fps on 60Hz and 120Hz displays with ±2ms jitter', () => {
  const simulateDisplay = (refreshHz: number, jitterSequence: readonly number[]) => {
    const refreshPeriodMs = 1000 / refreshHz
    let nextFrameTimeMs: number | null = null
    let steps = 0
    const totalVsyncs = refreshHz / 2 // 500ms window
    for (let i = 0; i < totalVsyncs; i++) {
      const jitter = jitterSequence[i % jitterSequence.length]
      const timestamp = (i + 1) * refreshPeriodMs + jitter
      const decision = shouldAdvanceSatelliteFrame(timestamp, nextFrameTimeMs)
      nextFrameTimeMs = decision.nextFrameTimeMs
      if (decision.shouldStep) {
        steps += 1
      }
    }
    return steps
  }

  const jitter = [0, -1.8, 1.9, -1.2, 2.0, -2.0]
  assert.equal(simulateDisplay(60, jitter), 15)
  assert.equal(simulateDisplay(120, jitter), 15)
})

test('createSatelliteAnimationController coordinates rAF pacing, sourcedata lockstep, backpressure, pause, and dispose', () => {
  const orbit = createSampleOrbit()
  let nowMs = orbit.currentPosition.timestampUnixMs
  let hidden = false
  let orbitsVisible = true
  let sourceLoaded = true
  let nextRafId = 1
  const pendingRafs = new Map<number, FrameRequestCallback>()
  const cancelledRafs: number[] = []
  const sourceListeners = new Set<(event: MapSourceDataEvent) => void>()

  const appliedStates: LiveOrbitalState[] = []
  const committedMarkers: Array<{ count: number; visible: boolean }> = []

  const mockMap: SatelliteAnimationMapLike = {
    isSourceLoaded: (id) => id === SATELLITE_ORBITS_SOURCE_ID && sourceLoaded,
    on: (type, listener) => {
      if (type === 'sourcedata') {
        sourceListeners.add(listener)
      }
    },
    off: (type, listener) => {
      if (type === 'sourcedata') {
        sourceListeners.delete(listener)
      }
    },
  }

  const controller = createSatelliteAnimationController({
    map: mockMap,
    getSatellites: () => [orbit],
    getSensorFilter: () => 'harmonized',
    isOrbitsVisible: () => orbitsVisible,
    onApplyOrbitalGeoJson: (state) => {
      appliedStates.push(state)
    },
    onCommitMarkers: (snapshots: readonly LiveSatelliteSnapshot[], visible: boolean) => {
      committedMarkers.push({ count: snapshots.length, visible })
    },
    nowProvider: () => nowMs,
    frameNowProvider: () => nowMs,
    requestFrame: (cb) => {
      const id = nextRafId++
      pendingRafs.set(id, cb)
      return id
    },
    cancelFrame: (id) => {
      cancelledRafs.push(id)
      pendingRafs.delete(id)
    },
    isDocumentHidden: () => hidden,
  })

  const runNextFrame = (frameTimeMs: number) => {
    const first = pendingRafs.entries().next()
    assert.ok(!first.done, 'expected a scheduled rAF callback')
    const [id, cb] = first.value
    pendingRafs.delete(id)
    cb(frameTimeMs)
  }

  const emitSourceData = () => {
    const event = { sourceId: SATELLITE_ORBITS_SOURCE_ID } as MapSourceDataEvent
    for (const listener of sourceListeners) {
      listener(event)
    }
  }

  // Initial synchronous sync
  controller.syncNow()
  assert.equal(appliedStates.length, 1)
  assert.equal(committedMarkers.length, 1)
  assert.equal(committedMarkers[0].count, 1)
  assert.equal(committedMarkers[0].visible, true)
  assert.equal(pendingRafs.size, 1)

  // Frame 0: applies GeoJSON and holds markers until sourcedata completes
  sourceLoaded = false
  nowMs += 16.67
  runNextFrame(16.67)
  assert.equal(appliedStates.length, 2)
  assert.equal(committedMarkers.length, 1)

  // Intermediate 60Hz VSync before 33.33ms interval: skipped cleanly
  nowMs += 16.67
  runNextFrame(33.34)
  assert.equal(appliedStates.length, 2)
  assert.equal(committedMarkers.length, 1)

  // Next 30fps tick while source is still loading (< 100ms): gated by backpressure
  nowMs += 16.67
  runNextFrame(50.01)
  assert.equal(appliedStates.length, 2)
  assert.equal(committedMarkers.length, 1)

  // Worker completes tile reload and emits sourcedata -> markers commit in lockstep
  sourceLoaded = true
  emitSourceData()
  assert.equal(committedMarkers.length, 2)

  // Next 30fps tick pushes GeoJSON; if sourcedata stalls >= MAX_PENDING_ORBIT_SYNC_MS, flush fallback triggers
  nowMs += 33.34
  runNextFrame(83.35)
  assert.equal(appliedStates.length, 3)
  assert.equal(committedMarkers.length, 2)

  sourceLoaded = false
  nowMs += MAX_PENDING_ORBIT_SYNC_MS + 1
  runNextFrame(83.35 + MAX_PENDING_ORBIT_SYNC_MS + 1)
  assert.equal(committedMarkers.length, 3)
  assert.equal(appliedStates.length, 4)

  // Pausing when hidden stops rAF loop
  hidden = true
  runNextFrame(250)
  assert.equal(pendingRafs.size, 0)

  // Resuming and hiding orbits clears markers and stops loop
  hidden = false
  controller.syncNow()
  assert.equal(pendingRafs.size, 1)
  orbitsVisible = false
  controller.syncNow()
  assert.equal(pendingRafs.size, 0)
  assert.equal(committedMarkers[committedMarkers.length - 1].visible, false)

  // Clean dispose cancels active rAF and detaches map listener
  orbitsVisible = true
  controller.syncNow()
  assert.equal(pendingRafs.size, 1)
  controller.dispose()
  assert.ok(cancelledRafs.length >= 1)
  assert.equal(pendingRafs.size, 0)
  assert.equal(sourceListeners.size, 0)
})

test('orbit window defaults and 2-part processing-lag tail splitting work for VIIRS (90m) and MODIS (120m)', () => {
  assert.equal(SATELLITE_ORBIT_PAST_MINUTES, 180)
  assert.equal(SATELLITE_ORBIT_FUTURE_MINUTES, 30)
  assert.equal(SATELLITE_ORBIT_STEP_SECONDS, 30)
  assert.deepEqual(SATELLITE_TRACK_LAG_DASH_ARRAY, [4, 2])

  assert.equal(
    resolveSatelliteProcessingLagMinutes({ instrument: 'viirs', typicalIngestionLagMinutes: 90 }),
    90,
  )
  assert.equal(
    resolveSatelliteProcessingLagMinutes({ instrument: 'modis', typicalIngestionLagMinutes: 120 }),
    120,
  )
  assert.equal(
    resolveSatelliteProcessingLagMinutes({ instrument: 'viirs', typicalIngestionLagMinutes: 0 }),
    90,
  )
  assert.equal(
    resolveSatelliteProcessingLagMinutes({ instrument: 'modis', typicalIngestionLagMinutes: Number.NaN }),
    120,
  )

  const t0 = 1_794_500_000_000
  const buildLongOrbit = (
    id: string,
    name: string,
    instrument: 'viirs' | 'modis',
    lagMinutes: number,
  ): SatelliteOrbit => {
    const track = []
    for (let mins = -180; mins <= 30; mins += 5) {
      const k = (mins + 180) / 5
      track.push({
        timestampUnixMs: t0 + mins * 60_000,
        lat: -10 + k * 0.5,
        lng: 120 - k * 0.25,
        altitudeKm: 705,
        headingDeg: 345,
        isAscending: true,
      })
    }
    return {
      ...createSampleOrbit(),
      id,
      name,
      instrument,
      typicalIngestionLagMinutes: lagMinutes,
      track,
    }
  }

  const viirsOrbit = buildLongOrbit('noaa-20', 'NOAA-20', 'viirs', 90)
  const modisOrbit = buildLongOrbit('terra', 'Terra', 'modis', 120)

  const now1 = t0 + 17_000
  const viirsState = computeLiveOrbitalState([viirsOrbit], 'harmonized', now1, true)
  const modisState = computeLiveOrbitalState([modisOrbit], 'harmonized', now1, true)

  for (const state of [viirsState, modisState]) {
    assert.equal(state.combinedGeoJson.features.length, 5)
    assert.equal(state.pastTracksGeoJson.features.length, 1)
    assert.equal(state.pastLagTracksGeoJson.features.length, 1)
    assert.equal(
      state.combinedGeoJson.features.some(
        (feature) => String(feature.properties?.orbitalFeatureKind) === 'future-track',
      ),
      false,
    )

    const pastSegs = state.pastTracksGeoJson.features[0].geometry.coordinates
    const lagSegs = state.pastLagTracksGeoJson.features[0].geometry.coordinates
    assert.equal(pastSegs.length, 1)
    assert.equal(lagSegs.length, 1)

    const pastEnd = pastSegs[0][pastSegs[0].length - 1]
    const lagStart = lagSegs[0][0]
    const lagEnd = lagSegs[0][lagSegs[0].length - 1]
    const posCoord = state.positionsGeoJson.features[0].geometry.coordinates

    assert.deepEqual(pastEnd, lagStart)
    assert.deepEqual(lagEnd, posCoord)
  }

  // Cutoff and live join coordinates both advance smoothly on the next 30fps tick
  const viirsNext = computeLiveOrbitalState(
    [viirsOrbit],
    'harmonized',
    now1 + SATELLITE_ANIMATION_INTERVAL_MS,
    true,
  )
  const cutoff1 = viirsState.pastLagTracksGeoJson.features[0].geometry.coordinates[0][0]
  const cutoff2 = viirsNext.pastLagTracksGeoJson.features[0].geometry.coordinates[0][0]
  assert.notDeepEqual(cutoff1, cutoff2)

  // Future points (> now1) are not rendered ahead of the spacecraft at now1,
  // yet +30m buffer points allow smooth client-side advancement up to now = t0 + 15m.
  const ptPlus15 = viirsOrbit.track.find((pt) => pt.timestampUnixMs === t0 + 15 * 60_000)!
  const coordPlus15 = [ptPlus15.lng, ptPlus15.lat]
  const hasCoord = (pts: number[][], target: number[]) =>
    pts.some((p) => p[0] === target[0] && p[1] === target[1])

  assert.equal(hasCoord(viirsState.pastTracksGeoJson.features[0].geometry.coordinates[0], coordPlus15), false)
  assert.equal(hasCoord(viirsState.pastLagTracksGeoJson.features[0].geometry.coordinates[0], coordPlus15), false)

  const viirsAtPlus15 = computeLiveOrbitalState([viirsOrbit], 'harmonized', t0 + 15 * 60_000, true)
  const posPlus15 = viirsAtPlus15.positionsGeoJson.features[0].geometry.coordinates
  const lagPlus15Pts = viirsAtPlus15.pastLagTracksGeoJson.features[0].geometry.coordinates[0]
  assert.deepEqual(posPlus15, coordPlus15)
  assert.deepEqual(lagPlus15Pts[lagPlus15Pts.length - 1], coordPlus15)

  // At -105m before t0: VIIRS (90m lag) places -105m in solid ready past-track,
  // while MODIS (120m lag) still keeps -105m inside dashed in-processing past-lag-track.
  const ptMinus105 = viirsOrbit.track.find((pt) => pt.timestampUnixMs === t0 - 105 * 60_000)!
  const coordMinus105 = [ptMinus105.lng, ptMinus105.lat]

  const viirsPastPts = viirsState.pastTracksGeoJson.features[0].geometry.coordinates[0]
  const viirsLagPts = viirsState.pastLagTracksGeoJson.features[0].geometry.coordinates[0]
  assert.equal(hasCoord(viirsPastPts, coordMinus105), true)
  assert.equal(hasCoord(viirsLagPts, coordMinus105), false)

  const modisPastPts = modisState.pastTracksGeoJson.features[0].geometry.coordinates[0]
  const modisLagPts = modisState.pastLagTracksGeoJson.features[0].geometry.coordinates[0]
  assert.equal(hasCoord(modisPastPts, coordMinus105), false)
  assert.equal(hasCoord(modisLagPts, coordMinus105), true)
})

test('fetchSatelliteOrbits requests 180m past and 30m future buffer', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    return new Response(
      JSON.stringify({
        generatedAtUtc: '2026-11-15T00:00:00Z',
        windowStartUnixMs: 0,
        windowEndUnixMs: 1,
        stepSeconds: 30,
        satellites: [],
        swaths: [],
        satelliteHud: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as typeof fetch

  try {
    await fetchSatelliteOrbits('https://api.example.test', undefined, { lat: 1.3521, lng: 103.8198 })
  } finally {
    globalThis.fetch = originalFetch
  }

  const parsed = new URL(requestedUrl)
  assert.equal(parsed.pathname, '/api/satellites/orbits')
  assert.equal(parsed.searchParams.get('pastMinutes'), '180')
  assert.equal(parsed.searchParams.get('futureMinutes'), '30')
  assert.equal(parsed.searchParams.get('stepSeconds'), '30')
})

test('EarthMapStage and MapLegend wire solid ready and dashed processing-lag tail without future track', () => {
  const mapStageSource = fs.readFileSync(
    new URL('../src/components/EarthMapStage.tsx', import.meta.url),
    'utf8',
  )
  assert.match(
    mapStageSource,
    /id:\s*'satellite-swaths-wide-fill'[\s\S]*?'fill-color':\s*WIDE_SWATH_COLOR[\s\S]*?'fill-opacity':\s*WIDE_SWATH_FILL_OPACITY/,
  )
  assert.match(
    mapStageSource,
    /id:\s*'satellite-swaths-wide-outline'[\s\S]*?'line-color':\s*WIDE_SWATH_COLOR[\s\S]*?'line-opacity':\s*WIDE_SWATH_STROKE_OPACITY/,
  )
  assert.match(mapStageSource, /id:\s*'satellite-tracks-past-line'[\s\S]*?'past-track'/)
  assert.match(
    mapStageSource,
    /id:\s*'satellite-tracks-lag-line'[\s\S]*?'past-lag-track'[\s\S]*?'line-dasharray':\s*SATELLITE_TRACK_LAG_DASH_ARRAY/,
  )
  assert.doesNotMatch(mapStageSource, /satellite-tracks-future-line/)
  assert.doesNotMatch(mapStageSource, /future-track/)

  const legendSource = fs.readFileSync(
    new URL('../src/components/MapLegend.tsx', import.meta.url),
    'utf8',
  )
  assert.match(
    legendSource,
    /Tracks:\s*solid ready,\s*dashed in processing \(\{orbitLagLabel\}\)/,
  )
  assert.doesNotMatch(legendSource, /dotted/)
})
