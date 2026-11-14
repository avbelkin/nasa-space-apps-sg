import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import { FIRE_SPOT_COLORS } from '../src/data/dataPalette.ts'
import type { FireSpotTooltipInput } from '../src/utils/fireSpots.ts'
import {
  buildFireDetectionsTimeline,
  computeClusterCentroid,
  computePlaceSunTimeline,
  computeSolarAltitudeDeg,
  computeTimelineConfidenceOpacity,
  MIN_TIMELINE_BAR_HEIGHT_PCT,
  MIN_TIMELINE_CONFIDENCE_OPACITY,
  SUNRISE_SUNSET_ALTITUDE_DEG,
  TIMELINE_SLOT_COUNT,
  TIMELINE_SLOT_MS,
} from '../src/utils/fireTimeline.ts'

describe('place-relative sun curve with browser-local time drift', () => {
  it('places California sunrise in Singapore browser evening and sunset in Singapore morning', () => {
    const windowEndMs = Date.UTC(2026, 6, 15, 12, 0, 0)
    const windowStartMs = windowEndMs - 24 * TIMELINE_SLOT_MS

    const sun = computePlaceSunTimeline(38.7, -120.5, windowStartMs, windowEndMs, 'Asia/Singapore')

    assert.equal(sun.polarState, 'normal')
    assert.ok(sun.sunriseMs !== null && sun.sunriseLabel !== null)
    assert.ok(sun.sunsetMs !== null && sun.sunsetLabel !== null)

    const sunriseHourSg = Number(sun.sunriseLabel.split(':')[0])
    const sunsetHourSg = Number(sun.sunsetLabel.split(':')[0])
    assert.ok(
      sunriseHourSg >= 19 && sunriseHourSg <= 23,
      `expected California sunrise in SG evening, got ${sun.sunriseLabel}`,
    )
    assert.ok(
      sunsetHourSg >= 7 && sunsetHourSg <= 11,
      `expected California sunset in SG morning, got ${sun.sunsetLabel}`,
    )

    // Refined sunrise and sunset timestamps cross SUNRISE_SUNSET_ALTITUDE_DEG cleanly
    const sunriseAlt = computeSolarAltitudeDeg(sun.sunriseMs, 38.7, -120.5)
    const sunsetAlt = computeSolarAltitudeDeg(sun.sunsetMs, 38.7, -120.5)
    assert.ok(Math.abs(sunriseAlt - SUNRISE_SUNSET_ALTITUDE_DEG) < 0.1)
    assert.ok(Math.abs(sunsetAlt - SUNRISE_SUNSET_ALTITUDE_DEG) < 0.1)

    // At 12:00 UTC (04:00-05:00 local solar time in California), it is night at the fire location
    assert.equal(sun.isDaylightNow, false)
    assert.ok(sun.nowY > sun.horizonY)
  })

  it('handles polar day and polar night without invalid path coordinates', () => {
    const juneEnd = Date.UTC(2026, 5, 21, 12, 0, 0)
    const polarDay = computePlaceSunTimeline(72, 120, juneEnd - 24 * TIMELINE_SLOT_MS, juneEnd, 'UTC')
    assert.equal(polarDay.polarState, 'polar-day')
    assert.equal(polarDay.isDaylightNow, true)
    assert.equal(polarDay.sunriseLabel, null)
    assert.equal(polarDay.sunsetLabel, null)
    assert.doesNotMatch(polarDay.pathD, /NaN/)

    const decEnd = Date.UTC(2026, 11, 21, 12, 0, 0)
    const polarNight = computePlaceSunTimeline(72, 120, decEnd - 24 * TIMELINE_SLOT_MS, decEnd, 'UTC')
    assert.equal(polarNight.polarState, 'polar-night')
    assert.equal(polarNight.isDaylightNow, false)
    assert.doesNotMatch(polarNight.pathD, /NaN/)
  })

  it('averages cluster longitudes circularly across the antimeridian', () => {
    const [lng, lat] = computeClusterCentroid([
      { lng: 179.8, lat: 55.0, timestamp: 1, frp: 10, source: 'VIIRS' },
      { lng: -179.8, lat: 55.2, timestamp: 2, frp: 20, source: 'VIIRS' },
    ])
    assert.ok(Math.abs(Math.abs(lng) - 180) < 0.5, `expected near ±180°, got ${lng}`)
    assert.ok(Math.abs(lat - 55.1) < 1e-6)
  })
})

describe('24h fire detections timeline bucketing and Stage-2 readiness', () => {
  const nowMs = Date.UTC(2026, 6, 15, 12, 0, 0)

  it('buckets into 24 1h slots, keeps strongest FRP per slot, and encodes confidence and satellite names', () => {
    const spots: FireSpotTooltipInput[] = [
      // Slot 20 (-4h to -3h): two detections -> 92 MW Terra wins over 18 MW NOAA-20
      {
        lng: 103.85,
        lat: 1.35,
        timestamp: nowMs - 3.6 * TIMELINE_SLOT_MS,
        frp: 18,
        confidence: 40,
        instrument: 'viirs',
        source: 'VIIRS 375m / NOAA-20',
        satellite: '1',
      },
      {
        lng: 103.851,
        lat: 1.351,
        timestamp: nowMs - 3.5 * TIMELINE_SLOT_MS,
        frp: 92,
        confidence: 95,
        instrument: 'modis',
        source: 'MODIS 1km',
        satellite: 'T',
      },
      // Slot 22 (-2h to -1h): Suomi NPP low confidence
      {
        lng: 103.852,
        lat: 1.352,
        timestamp: nowMs - 1.5 * TIMELINE_SLOT_MS,
        frp: 23,
        confidence: 25,
        instrument: 'viirs',
        source: 'VIIRS 375m',
        satellite: 'N',
      },
    ]

    const timeline = buildFireDetectionsTimeline(spots, {
      nowMs,
      viewMode: 'anomaly',
      timeZone: 'Asia/Singapore',
    })

    assert.equal(timeline.slots.length, TIMELINE_SLOT_COUNT)
    assert.equal(timeline.axisTicks.length, 5)
    assert.equal(timeline.detectionCount, 3)
    assert.equal(timeline.peakFrpMw, 92)
    assert.equal(timeline.totalFrpMw, 133)

    const slot20 = timeline.slots[20]
    assert.ok(slot20 && slot20.kind === 'detection')
    assert.equal(slot20.frpMw, 92)
    assert.equal(slot20.mergedCount, 2)
    assert.equal(slot20.satellite, 'Terra')
    assert.equal(slot20.shortSatellite, 'Terra')
    assert.equal(slot20.heightPct, 100)
    assert.equal(slot20.opacity, computeTimelineConfidenceOpacity(95))
    assert.equal(slot20.localTimeLabel, '16:30')

    const slot22 = timeline.slots[22]
    assert.ok(slot22 && slot22.kind === 'detection')
    assert.equal(slot22.shortSatellite, 'SNPP')
    assert.ok(slot22.heightPct > MIN_TIMELINE_BAR_HEIGHT_PCT && slot22.heightPct < 100)
    assert.ok(slot22.opacity < slot20.opacity)
    assert.ok(slot22.opacity >= MIN_TIMELINE_CONFIDENCE_OPACITY)

    // Sensor view mode uses instrument hues
    const sensorTimeline = buildFireDetectionsTimeline(spots, {
      nowMs,
      viewMode: 'sensors',
      timeZone: 'Asia/Singapore',
    })
    const sensorSlot20 = sensorTimeline.slots[20]
    const sensorSlot22 = sensorTimeline.slots[22]
    assert.ok(sensorSlot20 && sensorSlot20.kind === 'detection')
    assert.ok(sensorSlot22 && sensorSlot22.kind === 'detection')
    assert.equal(sensorSlot20.color, FIRE_SPOT_COLORS.modis)
    assert.equal(sensorSlot22.color, FIRE_SPOT_COLORS.viirs)
  })

  it('accepts Stage-2 negative satellite passes only in empty hour slots', () => {
    const spots: FireSpotTooltipInput[] = [
      {
        lng: 103.85,
        lat: 1.35,
        timestamp: nowMs - 2.5 * TIMELINE_SLOT_MS,
        frp: 50,
        confidence: 80,
        instrument: 'viirs',
        source: 'VIIRS 375m / NOAA-21',
        satellite: '2',
      },
    ]

    const timeline = buildFireDetectionsTimeline(spots, {
      nowMs,
      timeZone: 'UTC',
      negativePasses: [
        // Same slot as positive detection (slot 21): positive keeps precedence
        { timestampMs: nowMs - 2.2 * TIMELINE_SLOT_MS, satellite: 'A', instrument: 'modis', isNadir: true },
        // Empty slot (slot 15): populates as non-detection pass
        { timestampMs: nowMs - 8.5 * TIMELINE_SLOT_MS, satellite: 'N20', instrument: 'viirs', isNadir: false },
      ],
    })

    const slot21 = timeline.slots[21]
    assert.ok(slot21 && slot21.kind === 'detection')
    assert.equal(slot21.shortSatellite, 'NOAA-21')

    const slot15 = timeline.slots[15]
    assert.ok(slot15 && slot15.kind === 'non-detection')
    assert.equal(slot15.shortSatellite, 'NOAA-20')
    assert.equal(slot15.isNadir, false)
  })

  it('enforces >= 1rem minimum bar width in App.css', () => {
    const appCss = fs.readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
    const match = appCss.match(/\.fire-timeline-bars\s*\{([^}]*)\}/)
    assert.ok(match, 'expected .fire-timeline-bars CSS rule')
    assert.match(match[1], /grid-template-columns:\s*repeat\(24,\s*minmax\(1rem,\s*1fr\)\)\s*;/)
  })
})
