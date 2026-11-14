import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ACTIVE_AGE_SECONDS,
  buildFireSpotsGeoJson,
  COHORT_PHASE_RADIANS,
  compareMatchedFireSpots,
  computeConfidenceOpacity,
  computePowerScale,
  computeWildfireActivity,
  computeWildfirePulse,
  formatFireSpotsTooltip,
  FULL_DETAIL_FIRE_SPOT_ZOOM,
  MIN_FIRE_SPOT_ZOOM,
  summarizeFireSpotsForSensor,
  type FireSpotTooltipInput,
  type FirmsLiveSpotsResponse,
} from '../src/utils/fireSpots.ts'

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

  it('scales power from FRP (1..250 MW -> 0.5..1.5) and confidence opacity (25..100 -> 0.6..1.0)', () => {
    assert.equal(computePowerScale(0), 0.5)
    assert.equal(computePowerScale(1), 0.5)
    assert.equal(computePowerScale(125.5), 1)
    assert.equal(computePowerScale(250), 1.5)
    assert.equal(computePowerScale(900), 1.5)
    assert.equal(computePowerScale(Number.NaN), 0.5)

    assert.equal(computeConfidenceOpacity(10), 0.6)
    assert.equal(computeConfidenceOpacity(25), 0.6)
    assert.ok(Math.abs(computeConfidenceOpacity(62.5) - 0.8) < 1e-12)
    assert.equal(computeConfidenceOpacity(100), 1)
    assert.equal(computeConfidenceOpacity(120), 1)
    assert.equal(computeConfidenceOpacity(Number.NaN), 0.6)
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

  it('formats 1..3 spots individually and deduplicates tile-boundary duplicates', () => {
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
          source: 'MODIS 1km',
          satellite: 'Aqua',
        },
      ],
      nowMs,
    )

    assert.ok(single)
    assert.equal(single.mode, 'individual')
    assert.equal(single.count, 1)
    assert.equal(single.header, 'NASA FIRMS Active Spot')
    assert.equal(single.lines.length, 1)
    assert.match(single.lines[0], /11:30 UTC \(30m ago\)/)
    assert.match(single.lines[0], /84\.3 MW/)
    assert.match(single.lines[0], /MODIS 1km \(Aqua\)/)
    assert.match(single.lines[0], /340\.1 K \(67°C\)|340\.2 K \(67°C\)/)
    assert.match(single.lines[0], /Conf 92%/)
  })

  it('aggregates 4 or more spots with total FRP, peak FRP, time range, and unique sources', () => {
    const spots: FireSpotTooltipInput[] = [
      { lng: 10.1, lat: 20.1, timestamp: nowMs - 3 * 3600_000, frp: 15, source: 'VIIRS 375m / NOAA-20' },
      { lng: 10.2, lat: 20.2, timestamp: nowMs - 2 * 3600_000, frp: 45, source: 'VIIRS 375m / NOAA-21' },
      { lng: 10.3, lat: 20.3, timestamp: nowMs - 1 * 3600_000, frp: 110, source: 'MODIS 1km' },
      { lng: 10.4, lat: 20.4, timestamp: nowMs - 30 * 60_000, frp: 30, source: 'VIIRS 375m / NOAA-20' },
    ]

    const aggregated = formatFireSpotsTooltip(spots, nowMs)
    assert.ok(aggregated)
    assert.equal(aggregated.mode, 'aggregated')
    assert.equal(aggregated.count, 4)
    assert.equal(aggregated.header, '4 Overlapping Fire Spots')
    assert.equal(aggregated.lines.length, 1)
    assert.match(aggregated.lines[0], /09:00–11:30 UTC \(30m ago\)/)
    assert.match(aggregated.lines[0], /4× spots/)
    assert.match(aggregated.lines[0], /200 MW total \(peak 110 MW\)/)
    assert.match(aggregated.lines[0], /MODIS 1km/)
    assert.match(aggregated.lines[0], /VIIRS 375m \/ NOAA-20/)
    assert.match(aggregated.lines[0], /VIIRS 375m \/ NOAA-21/)
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
  })
})
