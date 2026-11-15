import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildFireSpotSourceData,
  diffFireSpotScreenColors,
  groupProjectedFireSpots,
} from '../src/utils/fireSpotScreenGroups.ts'
import { FIRE_SPOT_COLORS } from '../src/data/dataPalette.ts'
import {
  ACTIVE_AGE_SECONDS,
  buildFireSpotsGeoJson,
  classifyFireSensorGroup,
  COHORT_PHASE_RADIANS,
  compareMatchedFireSpots,
  computeConfidenceBrightness,
  computePowerScale,
  computeWildfireActivity,
  computeWildfirePulse,
  deduplicateSpotMatches,
  expandHoveredFireSpots,
  formatFireSpotsTooltip,
  FULL_DETAIL_FIRE_SPOT_ZOOM,
  MIN_FIRE_SPOT_ZOOM,
  summarizeFireSpotsForSensor,
  type FireSpotTooltipInput,
  type FirmsLiveSpotsResponse,
} from '../src/utils/fireSpots.ts'
import {
  buildFireSpotLayers,
  FIRMS_SPOTS_CORE_LAYER_ID,
  FIRMS_SPOTS_PULSE_LAYER_IDS,
} from '../src/utils/fireSpotsAnimation.ts'

describe('wildfire activity and pulse math', () => {
  it('computes 24h linear activity decay and respects motionEnabled flag', () => {
    assert.equal(computeWildfireActivity(0, true), 1)
    assert.equal(computeWildfireActivity(-120, true), 1)
    assert.equal(computeWildfireActivity(ACTIVE_AGE_SECONDS / 2, true), 0.5)
    assert.equal(computeWildfireActivity(ACTIVE_AGE_SECONDS, true), 0)
    assert.equal(computeWildfireActivity(ACTIVE_AGE_SECONDS + 3600, true), 0)
    assert.equal(computeWildfireActivity(100, false), 0)
    assert.equal(computeWildfireActivity(Number.NaN, true), 0)
  })

  it('computes bounded pulse values across phase cohorts and disables when stopped', () => {
    assert.equal(computeWildfirePulse(0, 0, false), 0)
    assert.equal(computeWildfirePulse(ACTIVE_AGE_SECONDS, 0, true), 0)
    assert.equal(computeWildfirePulse(Number.NaN, 0, true), 0)

    const p0 = computeWildfirePulse(0, COHORT_PHASE_RADIANS[0], true)
    const p1 = computeWildfirePulse(0, COHORT_PHASE_RADIANS[1], true)
    const p2 = computeWildfirePulse(0, COHORT_PHASE_RADIANS[2], true)
    const p3 = computeWildfirePulse(0, COHORT_PHASE_RADIANS[3], true)

    assert.ok(Math.abs(p0 - 0.5) < 1e-12)
    assert.ok(Math.abs(p1 - 1.0) < 1e-12)
    assert.ok(Math.abs(p2 - 0.5) < 1e-12)
    assert.ok(Math.abs(p3 - 0.0) < 1e-12)

    for (const age of [1, 3600, 43200, 86000]) {
      for (const phase of COHORT_PHASE_RADIANS) {
        const pulse = computeWildfirePulse(age, phase, true)
        assert.ok(pulse >= 0 && pulse <= 1, `pulse ${pulse} out of [0, 1] range`)
      }
    }
  })

  it('scales power from FRP (1..250 MW -> 0.5..1.5) and confidence brightness (25..100 -> 0.6..1.0)', () => {
    assert.equal(computePowerScale(0), 0.5)
    assert.equal(computePowerScale(1), 0.5)
    assert.equal(computePowerScale(125.5), 1)
    assert.equal(computePowerScale(250), 1.5)
    assert.equal(computePowerScale(900), 1.5)
    assert.equal(computePowerScale(Number.NaN), 0.5)

    assert.equal(computeConfidenceBrightness(10), 0.6)
    assert.equal(computeConfidenceBrightness(25), 0.6)
    assert.ok(Math.abs(computeConfidenceBrightness(62.5) - 0.8) < 1e-12)
    assert.equal(computeConfidenceBrightness(100), 1)
    assert.equal(computeConfidenceBrightness(120), 1)
    assert.equal(computeConfidenceBrightness(Number.NaN), 0.6)
  })
})

describe('buildFireSpotsGeoJson & summarizeFireSpotsForSensor', () => {
  const referenceNowMs = Date.UTC(2026, 6, 15, 12, 0, 0)
  const samplePayload: FirmsLiveSpotsResponse = {
    generatedAtUtc: new Date(referenceNowMs).toISOString(),
    fetchedAtUtc: new Date(referenceNowMs - 60_000).toISOString(),
    latestAcquiredAtUtc: new Date(referenceNowMs - 15 * 60_000).toISOString(),
    stale: false,
    windowHours: 24,
    sensorFilter: 'harmonized',
    sources: [
      { code: 0, dataset: 'MODIS_NRT', label: 'MODIS 1km', instrument: 'modis', radiusMeters: 1000, count: 1 },
      { code: 1, dataset: 'VIIRS_NOAA20_NRT', label: 'VIIRS 375m / NOAA-20', instrument: 'viirs', radiusMeters: 375, count: 2 },
      { code: 2, dataset: 'VIIRS_NOAA21_NRT', label: 'VIIRS 375m / NOAA-21', instrument: 'viirs', radiusMeters: 375, count: 1 },
    ],
    count: 4,
    modisCount: 1,
    viirsCount: 3,
    maxFrpMw: 320.4,
    attribution: 'NASA FIRMS',
    columns: ['lng', 'lat', 'timestampMs', 'frp', 'brightnessK', 'confidence', 'sourceCode', 'satellite', 'dayNight'],
    spots: [
      [103.85, 1.35, referenceNowMs - 15 * 60_000, 125.5, 345.2, 100, 0, 'Terra', 'D'],
      [-120.5, 38.7, referenceNowMs - 2 * 3600_000, 320.4, 362.1, 80, 1, 'NOAA-20', 'N'],
      [14.2, -9.5, referenceNowMs - 6 * 3600_000, 12.0, 318.0, 55, 2, 'NOAA-21', 'D'],
      [25.0, 40.0, referenceNowMs - 25 * 3600_000, 40.0, 315.0, 70, 1, 'NOAA-20', 'N'],
    ],
  }

  it('builds GeoJSON features with sensor resolutions and active vs expired cohorts', () => {
    const built = buildFireSpotsGeoJson(samplePayload, referenceNowMs)

    assert.equal(built.featureCollection.features.length, 4)
    assert.equal(built.activeSpotCount, 3)

    const cohortSum = built.cohortCounts.reduce((acc, val) => acc + val, 0)
    assert.equal(cohortSum, 3)

    const modisFeature = built.featureCollection.features[0]
    assert.equal(modisFeature.properties.instrument, 'modis')
    assert.equal(modisFeature.properties.radiusMeters, 1000)
    assert.equal(modisFeature.properties.source, 'MODIS 1km')
    assert.ok(modisFeature.properties.phaseCohort >= 0 && modisFeature.properties.phaseCohort <= 3)

    const viirsFeature = built.featureCollection.features[1]
    assert.equal(viirsFeature.properties.instrument, 'viirs')
    assert.equal(viirsFeature.properties.radiusMeters, 375)
    assert.equal(viirsFeature.properties.powerScale, 1.5)

    const expiredFeature = built.featureCollection.features[3]
    assert.equal(expiredFeature.properties.activity, 0)
    assert.equal(expiredFeature.properties.phaseCohort, -1)
  })

  it('summarizes counts, peak FRP, and latest acquisition per sensor filter', () => {
    const harmonized = summarizeFireSpotsForSensor(samplePayload, 'harmonized')
    assert.deepEqual(harmonized, {
      totalCount: 4,
      modisCount: 1,
      viirsCount: 3,
      maxFrpMw: 320.4,
      latestAcquiredAtUtc: new Date(referenceNowMs - 15 * 60_000).toISOString(),
    })

    const modisOnly = summarizeFireSpotsForSensor(samplePayload, 'modis')
    assert.deepEqual(modisOnly, {
      totalCount: 1,
      modisCount: 1,
      viirsCount: 0,
      maxFrpMw: 125.5,
      latestAcquiredAtUtc: new Date(referenceNowMs - 15 * 60_000).toISOString(),
    })

    const viirsOnly = summarizeFireSpotsForSensor(samplePayload, 'viirs')
    assert.deepEqual(viirsOnly, {
      totalCount: 3,
      modisCount: 0,
      viirsCount: 3,
      maxFrpMw: 320.4,
      latestAcquiredAtUtc: new Date(referenceNowMs - 2 * 3600_000).toISOString(),
    })
  })
})

describe('fire spot tooltips and hit sorting', () => {
  const nowMs = Date.UTC(2026, 6, 15, 12, 0, 0)

  it('sorts matched spots by FRP descending then timestamp descending', () => {
    const spots: FireSpotTooltipInput[] = [
      { timestamp: nowMs - 600_000, frp: 20, source: 'VIIRS 375m / NOAA-20' },
      { timestamp: nowMs - 300_000, frp: 20, source: 'VIIRS 375m / NOAA-21' },
      { timestamp: nowMs - 1800_000, frp: 95, source: 'MODIS 1km' },
    ]
    const sorted = [...spots].sort(compareMatchedFireSpots)
    assert.equal(sorted[0].frp, 95)
    assert.equal(sorted[1].source, 'VIIRS 375m / NOAA-21')
    assert.equal(sorted[2].source, 'VIIRS 375m / NOAA-20')
  })

  it('formats 1 spot as a 24h timeline with single-spot telemetry and deduplicates tile-boundary duplicates', () => {
    assert.equal(formatFireSpotsTooltip([], nowMs), null)

    const single = formatFireSpotsTooltip(
      [
        {
          lng: 103.851,
          lat: 1.352,
          timestamp: nowMs - 30 * 60_000,
          frp: 84.3,
          brightnessK: 340.15,
          confidence: 92,
          instrument: 'modis',
          source: 'MODIS 1km',
          satellite: 'Aqua',
        },
        {
          lng: 103.851,
          lat: 1.352,
          timestamp: nowMs - 30 * 60_000,
          frp: 84.3,
          brightnessK: 340.15,
          confidence: 92,
          instrument: 'modis',
          source: 'MODIS 1km',
          satellite: 'Aqua',
        },
      ],
      nowMs,
      { timeZone: 'Asia/Singapore', sensorFilter: 'modis' },
    )

    assert.ok(single)
    assert.equal(single.mode, 'timeline')
    assert.equal(single.count, 1)
    assert.equal(single.header, '1 Fire Detection')
    assert.ok(single.timeline)
    assert.equal(single.timeline.detectionCount, 1)
    assert.ok(single.timeline.singleSpotDetail)
    assert.match(single.timeline.singleSpotDetail, /84\.3 MW/)
    assert.match(single.timeline.singleSpotDetail, /340\.1 K \(67°C\)|340\.2 K \(67°C\)/)
    assert.match(single.timeline.singleSpotDetail, /Conf 92%/)
    assert.equal(single.timeline.processingCutoff.sensorFilter, 'modis')
    assert.equal(single.timeline.processingCutoff.lagMinutes, 120)
    assert.equal(single.lines.length, 1)
    assert.match(single.lines[0], /1 detection \(19:30 local\)/)
    assert.doesNotMatch(single.lines[0], /\bUTC\b/)
    assert.match(single.lines[0], /84\.3 MW total/)
    assert.match(single.lines[0], /Aqua/)
  })

  it('formats 2+ spots as a 24h grouped timeline with sun context and accessible summary', () => {
    const pair: FireSpotTooltipInput[] = [
      {
        lng: 103.85,
        lat: 1.35,
        timestamp: nowMs - 4 * 3600_000,
        frp: 35,
        confidence: 65,
        instrument: 'viirs',
        source: 'VIIRS 375m / NOAA-20',
        satellite: '1',
      },
      {
        lng: 103.852,
        lat: 1.352,
        timestamp: nowMs - 30 * 60_000,
        frp: 88,
        confidence: 95,
        instrument: 'modis',
        source: 'MODIS 1km',
        satellite: 'T',
      },
    ]

    const pairTooltip = formatFireSpotsTooltip(pair, nowMs, { timeZone: 'Asia/Singapore' })
    assert.ok(pairTooltip)
    assert.equal(pairTooltip.mode, 'timeline')
    assert.equal(pairTooltip.count, 2)
    assert.equal(pairTooltip.header, '2 Grouped Fire Detections')
    assert.ok(pairTooltip.timeline)
    assert.equal(pairTooltip.timeline.detectionCount, 2)
    assert.equal(pairTooltip.timeline.peakFrpMw, 88)

    const spots: FireSpotTooltipInput[] = [
      {
        lng: 10.1,
        lat: 20.1,
        timestamp: nowMs - 3 * 3600_000,
        frp: 15,
        confidence: 50,
        instrument: 'viirs',
        source: 'VIIRS 375m / NOAA-20',
        satellite: 'NOAA-20',
      },
      {
        lng: 10.2,
        lat: 20.2,
        timestamp: nowMs - 2 * 3600_000,
        frp: 45,
        confidence: 75,
        instrument: 'viirs',
        source: 'VIIRS 375m / NOAA-21',
        satellite: 'NOAA-21',
      },
      {
        lng: 10.3,
        lat: 20.3,
        timestamp: nowMs - 1 * 3600_000,
        frp: 110,
        confidence: 95,
        instrument: 'modis',
        source: 'MODIS 1km',
        satellite: 'Terra',
      },
      {
        lng: 10.4,
        lat: 20.4,
        timestamp: nowMs - 30 * 60_000,
        frp: 30,
        confidence: 80,
        instrument: 'viirs',
        source: 'VIIRS 375m / NOAA-20',
        satellite: 'NOAA-20',
      },
    ]

    const grouped = formatFireSpotsTooltip(spots, nowMs, { timeZone: 'UTC' })
    assert.ok(grouped)
    assert.equal(grouped.mode, 'timeline')
    assert.equal(grouped.count, 4)
    assert.equal(grouped.header, '4 Grouped Fire Detections')
    assert.equal(grouped.lines.length, 1)
    assert.ok(grouped.timeline)
    assert.equal(grouped.timeline.totalFrpMw, 200)
    assert.equal(grouped.timeline.peakFrpMw, 110)
    assert.match(grouped.lines[0], /09:00–11:30 local/)
    assert.match(grouped.lines[0], /4 detections/)
    assert.match(grouped.lines[0], /200 MW total \(peak 110 MW\)/)
    assert.match(grouped.lines[0], /Terra/)
    assert.match(grouped.lines[0], /NOAA-20/)
    assert.match(grouped.lines[0], /NOAA-21/)
  })
})

describe('hierarchical z1..z7 spatial decluttering', () => {
  const referenceNowMs = Date.UTC(2026, 6, 15, 12, 0, 0)

  it('assigns additive minZoom tiers from z1 coarse leaders down to z7 individual pixels', () => {
    const payload: FirmsLiveSpotsResponse = {
      generatedAtUtc: new Date(referenceNowMs).toISOString(),
      fetchedAtUtc: new Date(referenceNowMs).toISOString(),
      latestAcquiredAtUtc: new Date(referenceNowMs).toISOString(),
      stale: false,
      windowHours: 24,
      sensorFilter: 'harmonized',
      sources: [
        { code: 0, dataset: 'MODIS_NRT', label: 'MODIS 1km', instrument: 'modis', radiusMeters: 1000, count: 0 },
        { code: 1, dataset: 'VIIRS_NOAA20_NRT', label: 'VIIRS 375m / NOAA-20', instrument: 'viirs', radiusMeters: 375, count: 4 },
      ],
      count: 4,
      modisCount: 0,
      viirsCount: 4,
      maxFrpMw: 280,
      attribution: 'NASA FIRMS',
      columns: ['lng', 'lat', 'timestampMs', 'frp', 'brightnessK', 'confidence', 'sourceCode', 'satellite', 'dayNight'],
      spots: [
        // Cluster leader inside z1 (100..102.5, 0..2.5)
        [101.05, 1.05, referenceNowMs - 600_000, 280, 355, 95, 1, 'NOAA-20', 'D'],
        // Immediate neighbor (< 0.01° away): deferred to full resolution z7
        [101.055, 1.055, referenceNowMs - 500_000, 90, 330, 80, 1, 'NOAA-20', 'D'],
        // Same z1 (2.5°) cell, separate z2 (1.25°) cell (~1.35° north)
        [101.05, 2.4, referenceNowMs - 400_000, 140, 342, 85, 1, 'NOAA-20', 'D'],
        // Distant spot (~8° east): gets z1 immediately
        [109.0, 1.05, referenceNowMs - 300_000, 50, 325, 75, 1, 'NOAA-20', 'D'],
      ],
    }

    const { featureCollection } = buildFireSpotsGeoJson(payload, referenceNowMs)
    const [leader, neighbor, midDist, distant] = featureCollection.features

    assert.equal(leader.properties.minZoomAll, 1)
    assert.equal(neighbor.properties.minZoomAll, 7)
    assert.equal(midDist.properties.minZoomAll, 2)
    assert.equal(distant.properties.minZoomAll, 1)
    assert.equal(leader.properties.sensorGroupAtZoom1, 'viirs')
    assert.equal(leader.properties.sensorGroupAtZoom2, 'viirs')
    assert.equal(midDist.properties.sensorGroupAtZoom2, undefined)
    assert.equal(distant.properties.sensorGroupAtZoom1, undefined)
    assert.equal(leader.properties.sensorGroupAtZoom7, undefined)

    for (const feature of featureCollection.features) {
      for (const tier of [
        feature.properties.minZoomAll,
        feature.properties.minZoomModis,
        feature.properties.minZoomViirs,
      ]) {
        assert.ok(tier >= MIN_FIRE_SPOT_ZOOM && tier <= FULL_DETAIL_FIRE_SPOT_ZOOM)
      }
    }
  })

  it('computes independent minZoomModis so MODIS spots are not hidden behind colocated higher-FRP VIIRS spots', () => {
    const payload: FirmsLiveSpotsResponse = {
      generatedAtUtc: new Date(referenceNowMs).toISOString(),
      fetchedAtUtc: new Date(referenceNowMs).toISOString(),
      latestAcquiredAtUtc: new Date(referenceNowMs).toISOString(),
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
      maxFrpMw: 260,
      attribution: 'NASA FIRMS',
      columns: ['lng', 'lat', 'timestampMs', 'frp', 'brightnessK', 'confidence', 'sourceCode', 'satellite', 'dayNight'],
      spots: [
        [101.05, 1.05, referenceNowMs - 600_000, 260, 360, 95, 1, 'NOAA-20', 'D'],
        [101.055, 1.055, referenceNowMs - 600_000, 110, 345, 90, 0, 'Terra', 'D'],
      ],
    }

    const { featureCollection } = buildFireSpotsGeoJson(payload, referenceNowMs)
    const [viirsFeature, modisFeature] = featureCollection.features

    assert.equal(viirsFeature.properties.minZoomAll, 1)
    assert.equal(viirsFeature.properties.minZoomViirs, 1)
    assert.equal(modisFeature.properties.minZoomAll, 7)
    assert.equal(modisFeature.properties.minZoomModis, 1)
    assert.equal(viirsFeature.properties.sensorGroupAtZoom1, 'both')

    const modisPayload: FirmsLiveSpotsResponse = {
      ...payload,
      spots: [[101.05, 1.05, referenceNowMs - 500_000, 260, 360, 95, 0, 'Aqua', 'D'], payload.spots[1]],
    }
    const modisLeader = buildFireSpotsGeoJson(modisPayload, referenceNowMs).featureCollection.features[0]
    assert.equal(modisLeader.properties.sensorGroupAtZoom1, 'modis')
  })

  it('expands hovered decluttered leaders into their hidden group members at z1..z6 without cross-sensor leaks', () => {
    const payload: FirmsLiveSpotsResponse = {
      generatedAtUtc: new Date(referenceNowMs).toISOString(),
      fetchedAtUtc: new Date(referenceNowMs).toISOString(),
      latestAcquiredAtUtc: new Date(referenceNowMs).toISOString(),
      stale: false,
      windowHours: 24,
      sensorFilter: 'harmonized',
      sources: [
        { code: 0, dataset: 'MODIS_NRT', label: 'MODIS 1km', instrument: 'modis', radiusMeters: 1000, count: 1 },
        { code: 1, dataset: 'VIIRS_NOAA20_NRT', label: 'VIIRS 375m / NOAA-20', instrument: 'viirs', radiusMeters: 375, count: 3 },
      ],
      count: 4,
      modisCount: 1,
      viirsCount: 3,
      maxFrpMw: 280,
      attribution: 'NASA FIRMS',
      columns: ['lng', 'lat', 'timestampMs', 'frp', 'brightnessK', 'confidence', 'sourceCode', 'satellite', 'dayNight'],
      spots: [
        // 0: Cluster leader inside z1 (100..102.5, 0..2.5)
        [101.05, 1.05, referenceNowMs - 600_000, 280, 355, 95, 1, 'NOAA-20', 'D'],
        // 1: Immediate MODIS neighbor (< 0.01° away)
        [101.055, 1.055, referenceNowMs - 500_000, 90, 330, 80, 0, 'Terra', 'D'],
        // 2: Same z1 (2.5°) cell, separate z2 (1.25°) cell (~1.35° north)
        [101.05, 2.4, referenceNowMs - 400_000, 140, 342, 85, 1, 'NOAA-20', 'D'],
        // 3: Distant spot (~8° east)
        [109.0, 1.05, referenceNowMs - 300_000, 50, 325, 75, 1, 'NOAA-20', 'D'],
      ],
    }

    const built = buildFireSpotsGeoJson(payload, referenceNowMs)

    const z1Harmonized = expandHoveredFireSpots(built, [0], 1.5, 'harmonized')
    assert.deepEqual(
      z1Harmonized.map((s) => s.frp).sort((a, b) => b - a),
      [280, 140, 90],
    )

    const z2Harmonized = expandHoveredFireSpots(built, [0], 2.2, 'harmonized')
    assert.deepEqual(
      z2Harmonized.map((s) => s.frp).sort((a, b) => b - a),
      [280, 90],
    )

    const z7Harmonized = expandHoveredFireSpots(built, [0], 7.0, 'harmonized')
    assert.deepEqual(
      z7Harmonized.map((s) => s.frp),
      [280],
    )

    // At z7 each dot renders individually, but the hit area can select several at once.
    const z7MixedHit = expandHoveredFireSpots(built, [0, 1, 0], 7, 'harmonized')
    assert.equal(classifyFireSensorGroup(deduplicateSpotMatches(z7MixedHit)), 'both')
    assert.equal(classifyFireSensorGroup(z7Harmonized), 'single')
    const z7ViirsHit = expandHoveredFireSpots(built, [0, 2], 7, 'harmonized')
    assert.equal(classifyFireSensorGroup(z7ViirsHit), 'viirs')

    // Two low-zoom markers can be close on screen. Include the hidden members of both
    // geographic groups in the color and in the details for either rendered marker.
    const projected = [
      { index: 0, x: 100, y: 100, detection: z7Harmonized[0] },
      { index: 3, x: 108, y: 104, detection: expandHoveredFireSpots(built, [3], 7, 'harmonized')[0] },
    ]
    const screenGroups = groupProjectedFireSpots(projected, (members) =>
      expandHoveredFireSpots(built, members.map((member) => member.index), 1.5, 'harmonized'),
    )
    assert.strictEqual(screenGroups.get(0), screenGroups.get(3))
    assert.equal(screenGroups.get(3)?.color, 'both')
    assert.equal(screenGroups.get(3)?.detections.length, 4)

    const sourceData = buildFireSpotSourceData(built, screenGroups)
    assert.deepEqual(sourceData.features.map(({ properties }) => properties.screenSensorGroup), [
      'both', undefined, undefined, 'both',
    ])
    assert.equal(built.featureCollection.features[0].properties.screenSensorGroup, undefined)
    assert.deepEqual(diffFireSpotScreenColors(screenGroups, new Map(screenGroups)), [])
    assert.deepEqual(diffFireSpotScreenColors(new Map([[0, screenGroups.get(0)!]]), screenGroups), [
      { id: 3, addOrUpdateProperties: [{ key: 'screenSensorGroup', value: 'both' }] },
    ])
    assert.deepEqual(diffFireSpotScreenColors(screenGroups, undefined), [
      { id: 0, removeProperties: ['screenSensorGroup'] },
      { id: 3, removeProperties: ['screenSensorGroup'] },
    ])

    const z1Modis = expandHoveredFireSpots(built, [1], 1.5, 'modis')
    assert.deepEqual(
      z1Modis.map((s) => ({ frp: s.frp, instrument: s.instrument })),
      [{ frp: 90, instrument: 'modis' }],
    )
  })
})

describe('active fire spot palette and MapLibre layers', () => {
  it('assigns a mixed sensor color to every high-zoom group member before a pointer hit', () => {
    const detection = { timestamp: 1000, frp: 80, source: 'MODIS' }
    const groups = groupProjectedFireSpots([
      { index: 0, x: 14, y: 14, detection: { ...detection, instrument: 'modis' } },
      { index: 1, x: 21, y: 21, detection: { ...detection, source: 'VIIRS', instrument: 'viirs', frp: 10 } },
      { index: 2, x: 58, y: 21, detection: { ...detection, instrument: 'modis' } },
      { index: 3, x: 77, y: 21, detection: { ...detection, instrument: 'modis' } },
      { index: 4, x: 80, y: 22, detection: { ...detection, instrument: 'modis' } },
    ], (members) => members.map((spot) => spot.detection))
    assert.equal(groups.get(0)?.color, 'both')
    assert.equal(groups.get(0)?.detections.length, 2)
    assert.strictEqual(groups.get(0), groups.get(1))
    assert.equal(groups.get(2)?.color, 'single')
    assert.equal(groups.get(3)?.color, 'modis')
  })

  it('uses uniform saturated non-pink red across core and pulse layers', () => {
    assert.equal(FIRE_SPOT_COLORS.fill, '#ff1a00')
    assert.equal(FIRE_SPOT_COLORS.pulse, '#ff1a00')

    for (const hex of [FIRE_SPOT_COLORS.fill, FIRE_SPOT_COLORS.pulse]) {
      const r = Number.parseInt(hex.slice(1, 3), 16)
      const g = Number.parseInt(hex.slice(3, 5), 16)
      const b = Number.parseInt(hex.slice(5, 7), 16)
      assert.equal(r, 0xff)
      assert.equal(b, 0x00)
      assert.ok(g <= 0x26, `expected low green channel for true red, got ${g}`)
    }

    const layers = buildFireSpotLayers('harmonized', true)
    assert.equal(layers.length, FIRMS_SPOTS_PULSE_LAYER_IDS.length + 1)

    for (const pulseId of FIRMS_SPOTS_PULSE_LAYER_IDS) {
      const pulseLayer = layers.find((layer) => layer.id === pulseId)
      assert.ok(pulseLayer, `missing pulse layer ${pulseId}`)
      assert.equal(pulseLayer.paint?.['circle-color'], FIRE_SPOT_COLORS.pulse)
    }

    const coreLayer = layers.find((layer) => layer.id === FIRMS_SPOTS_CORE_LAYER_ID)
    assert.ok(coreLayer, 'missing core layer')
    assert.deepEqual(coreLayer.paint?.['circle-opacity'], [
      'interpolate', ['linear'], ['zoom'], 0.95, 0, MIN_FIRE_SPOT_ZOOM, 1,
    ])
    assert.deepEqual(coreLayer.paint?.['circle-color'], [
      'interpolate', ['linear'], ['get', 'certainty'], 0, '#000000', 1, FIRE_SPOT_COLORS.fill,
    ])
  })
})
