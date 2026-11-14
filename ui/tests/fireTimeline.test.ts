import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import { DEFAULT_SATELLITE_COLOR, SATELLITE_COLORS } from '../src/data/dataPalette.ts'
import type { FireSpotTooltipInput } from '../src/utils/fireSpots.ts'
import {
  buildFireDetectionsTimeline,
  computeClusterCentroid,
  computePlaceSunTimeline,
  computeSolarAltitudeDeg,
  computeTimelineConfidenceOpacity,
  MIN_TIMELINE_BAR_HEIGHT_PCT,
  MIN_TIMELINE_CONFIDENCE_OPACITY,
  resolveSatellitePaletteColor,
  SUNRISE_SUNSET_ALTITUDE_DEG,
  TIMELINE_SLOT_COUNT,
  TIMELINE_SLOT_MS,
} from '../src/utils/fireTimeline.ts'
import {
  buildSatelliteOverpassIndex,
  evaluateSpotNegativePasses,
  FIRMS_SATELLITE_FLEET_DEFAULTS,
  parseSatelliteTle,
  propagateSatelliteGeodetic,
} from '../src/utils/satelliteOverpassTimeline.ts'

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

  it('renders a smoothly rounded cosine crest rather than a triangle cusp when the sun passes near or through the zenith', () => {
    const windowEndMs = Date.UTC(2026, 10, 15, 18, 0, 0)
    const windowStartMs = windowEndMs - 24 * TIMELINE_SLOT_MS

    for (const latDeg of [-14.422, -18.4]) {
      const sun = computePlaceSunTimeline(latDeg, 126.853, windowStartMs, windowEndMs, 'Australia/Darwin')
      const pts = Array.from(sun.pathD.matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g), (m) => [
        Number(m[1]),
        Number(m[2]),
      ])
      assert.equal(pts.length, 145)

      let idxNoon = 0
      for (let i = 1; i < pts.length; i++) {
        if (pts[i][1] < pts[idxNoon][1]) {
          idxNoon = i
        }
      }
      assert.ok(idxNoon > 18 && idxNoon < pts.length - 19, `unexpected noon index ${idxNoon}`)

      const dropFirstHour = pts[idxNoon + 6][1] - pts[idxNoon][1]
      const dropThirdHour = pts[idxNoon + 18][1] - pts[idxNoon + 12][1]
      assert.ok(dropThirdHour > 0)
      assert.ok(
        dropFirstHour < 0.35 * dropThirdHour,
        `expected cosine crest at lat ${latDeg}, got 1h drop ${dropFirstHour.toFixed(2)} vs 3rd-hour drop ${dropThirdHour.toFixed(2)}`,
      )

      assert.ok(sun.sunriseMs !== null && sun.sunsetMs !== null)
      const sunriseAlt = computeSolarAltitudeDeg(sun.sunriseMs, latDeg, 126.853)
      const sunsetAlt = computeSolarAltitudeDeg(sun.sunsetMs, latDeg, 126.853)
      assert.ok(Math.abs(sunriseAlt - SUNRISE_SUNSET_ALTITUDE_DEG) < 0.1)
      assert.ok(Math.abs(sunsetAlt - SUNRISE_SUNSET_ALTITUDE_DEG) < 0.1)
    }
  })
})

describe('24h fire detections timeline bucketing and Stage-2 readiness', () => {
  const nowMs = Date.UTC(2026, 6, 15, 12, 0, 0)

  it('buckets into 24 1h slots, splits multiple satellites side-by-side with +1 labels, and merges same-satellite spots', () => {
    const spots: FireSpotTooltipInput[] = [
      // Slot 20 (-4h to -3h): two different satellites -> side-by-side half-width sub-bars, Terra wins label
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
      // Slot 19 (-5h to -4h): two Terra pixels in same hour -> merge into 1 sub-bar (label stays "Terra")
      {
        lng: 103.85,
        lat: 1.35,
        timestamp: nowMs - 4.7 * TIMELINE_SLOT_MS,
        frp: 20,
        confidence: 70,
        instrument: 'modis',
        source: 'MODIS 1km',
        satellite: 'T',
      },
      {
        lng: 103.851,
        lat: 1.351,
        timestamp: nowMs - 4.3 * TIMELINE_SLOT_MS,
        frp: 46,
        confidence: 85,
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
      timeZone: 'Asia/Singapore',
    })

    assert.equal(timeline.slots.length, TIMELINE_SLOT_COUNT)
    assert.equal(timeline.axisTicks.length, 5)
    assert.equal(timeline.detectionCount, 5)
    assert.equal(timeline.peakFrpMw, 92)
    assert.equal(timeline.totalFrpMw, 199)

    const slot19 = timeline.slots[19]
    assert.ok(slot19 && slot19.kind === 'detection')
    assert.equal(slot19.frpMw, 46)
    assert.equal(slot19.mergedCount, 2)
    assert.equal(slot19.subBars.length, 1)
    assert.equal(slot19.label, 'Terra')

    const slot20 = timeline.slots[20]
    assert.ok(slot20 && slot20.kind === 'detection')
    assert.equal(slot20.frpMw, 92)
    assert.equal(slot20.satellite, 'Terra')
    assert.equal(slot20.shortSatellite, 'Terra')
    assert.equal(slot20.label, 'Terra +1')
    assert.equal(slot20.subBars.length, 2)
    assert.equal(slot20.subBars[0].shortSatellite, 'NOAA-20')
    assert.equal(slot20.subBars[1].shortSatellite, 'Terra')
    assert.equal(slot20.heightPct, 100)
    assert.equal(slot20.opacity, computeTimelineConfidenceOpacity(95))
    assert.equal(slot20.localTimeLabel, '16:30')

    const slot22 = timeline.slots[22]
    assert.ok(slot22 && slot22.kind === 'detection')
    assert.equal(slot22.shortSatellite, 'SNPP')
    assert.equal(slot22.label, 'SNPP')
    assert.ok(slot22.heightPct > MIN_TIMELINE_BAR_HEIGHT_PCT && slot22.heightPct < 100)
    assert.ok(slot22.opacity < slot20.opacity)
    assert.ok(slot22.opacity >= MIN_TIMELINE_CONFIDENCE_OPACITY)

    // Satellite colors match SATELLITE_COLORS / DEFAULT_SATELLITE_COLOR across all satellites
    assert.equal(resolveSatellitePaletteColor('T', undefined, 'modis'), SATELLITE_COLORS.terra)
    assert.equal(resolveSatellitePaletteColor('A', undefined, 'modis'), SATELLITE_COLORS.aqua)
    assert.equal(resolveSatellitePaletteColor('1', undefined, 'viirs'), SATELLITE_COLORS['noaa-20'])
    assert.equal(resolveSatellitePaletteColor('2', undefined, 'viirs'), SATELLITE_COLORS['noaa-21'])
    assert.equal(resolveSatellitePaletteColor('N', undefined, 'viirs'), DEFAULT_SATELLITE_COLOR)

    assert.equal(slot20.color, SATELLITE_COLORS.terra)
    assert.equal(slot22.color, DEFAULT_SATELLITE_COLOR)
  })

  it('places negative/pending passes side-by-side in 1h slots, configures processing cutoff, and builds accessible rows', () => {
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
      sensorFilter: 'harmonized',
      negativePasses: [
        // Same slot as positive NOAA-21 detection (slot 21): shares half-width with Aqua negative pass
        {
          timestampMs: nowMs - 2.2 * TIMELINE_SLOT_MS,
          satellite: 'A',
          instrument: 'modis',
          isNadir: true,
          distanceKm: 40,
        },
        // Same-satellite duplicate negative in slot 21 must not override positive NOAA-21
        {
          timestampMs: nowMs - 2.4 * TIMELINE_SLOT_MS,
          satellite: '2',
          instrument: 'viirs',
          isNadir: true,
        },
        // Empty slot (slot 15): two distinct negative passes (NOAA-20 wide vs Aqua nadir)
        {
          timestampMs: nowMs - 8.7 * TIMELINE_SLOT_MS,
          satellite: 'N20',
          instrument: 'viirs',
          isNadir: false,
          distanceKm: 650,
        },
        {
          timestampMs: nowMs - 8.4 * TIMELINE_SLOT_MS,
          satellite: 'A',
          instrument: 'modis',
          isNadir: true,
          distanceKm: 55,
        },
        // Processing-cutoff pending pass (slot 23): within ingestion lag
        {
          timestampMs: nowMs - 0.5 * TIMELINE_SLOT_MS,
          satellite: 'N20',
          instrument: 'viirs',
          isNadir: true,
          ingestionLagMinutes: 90,
          status: 'pending',
        },
      ],
    })

    const slot21 = timeline.slots[21]
    assert.ok(slot21 && slot21.kind === 'detection')
    assert.equal(slot21.shortSatellite, 'NOAA-21')
    assert.equal(slot21.label, 'NOAA-21 +1')
    assert.equal(slot21.subBars.length, 2)
    assert.equal(slot21.subBars[0].kind, 'detection')
    assert.equal(slot21.subBars[1].kind, 'non-detection')
    assert.equal(slot21.subBars[1].shortSatellite, 'Aqua')
    assert.equal(slot21.color, SATELLITE_COLORS['noaa-21'])

    const slot15 = timeline.slots[15]
    assert.ok(slot15 && slot15.kind === 'non-detection')
    assert.equal(slot15.shortSatellite, 'Aqua')
    assert.equal(slot15.label, 'Aqua +1')
    assert.equal(slot15.subBars.length, 2)
    assert.equal(slot15.subBars[0].shortSatellite, 'NOAA-20')
    assert.equal(slot15.subBars[1].shortSatellite, 'Aqua')
    assert.equal(slot15.isNadir, true)

    const slot23 = timeline.slots[23]
    assert.ok(slot23 && slot23.kind === 'pending')
    assert.equal(slot23.label, 'NOAA-20')

    assert.equal(timeline.processingCutoff.lagMinutes, 120)
    assert.equal(timeline.processingCutoff.widthPct, 8.33)
    assert.equal(timeline.processingCutoff.nonDetectionCount, 3)
    assert.equal(timeline.processingCutoff.pendingCount, 1)
    assert.equal(timeline.accessibleRows.length, 5)
    assert.match(timeline.accessibleSummary, /3 negative passes/)
    assert.match(timeline.accessibleSummary, /1 pass in processing/)

    const viirsCutoff = buildFireDetectionsTimeline(spots, { nowMs, sensorFilter: 'viirs' }).processingCutoff
    assert.equal(viirsCutoff.lagMinutes, 90)
    assert.equal(viirsCutoff.widthPct, 6.25)
    assert.equal(viirsCutoff.shortLabel, '~1.5h lag')
  })

  it('propagates 24h J2 tracks, caches spatial cells, filters sensors, and suppresses ±25m positive passes across slot boundaries', () => {
    const noaa20 = FIRMS_SATELLITE_FLEET_DEFAULTS.find((s) => s.noradId === 43013)!
    const parsedTle = parseSatelliteTle(noaa20.name, noaa20.defaultTleLine1, noaa20.defaultTleLine2)
    assert.ok(parsedTle)

    // Evaluate right around NOAA-20's own TLE epoch so its nadir crossing occurs at an exact known place/time
    const epochMs = parsedTle.epochMs
    const evalNowMs = epochMs + 3 * 3_600_000
    const subsatelliteAtEpoch = propagateSatelliteGeodetic(parsedTle, epochMs)

    const index = buildSatelliteOverpassIndex(undefined, evalNowMs)
    const rawOverpasses = index.evaluateAtLatLng(subsatelliteAtEpoch.latDeg, subsatelliteAtEpoch.lngDeg)
    const noaa20EpochPass = rawOverpasses.find(
      (p) => p.noradId === 43013 && Math.abs(p.timestampMs - epochMs) <= 60_000,
    )
    assert.ok(noaa20EpochPass, 'expected NOAA-20 swath pass near TLE epoch subsatellite point')
    assert.ok(noaa20EpochPass.distanceKm < 25)
    assert.equal(noaa20EpochPass.isNadir, true)

    // Two points within the same 0.05° spatial cell hit identical cached overpasses
    const cachedA = index.evaluateAtLatLng(subsatelliteAtEpoch.latDeg + 0.004, subsatelliteAtEpoch.lngDeg - 0.004)
    const cachedB = index.evaluateAtLatLng(subsatelliteAtEpoch.latDeg + 0.005, subsatelliteAtEpoch.lngDeg - 0.005)
    assert.equal(cachedA, cachedB)

    // Positive detection within ±25m of NOAA-20's pass (even if straddling an hour boundary) suppresses that negative pass
    const positiveMatchNearEpoch: FireSpotTooltipInput[] = [
      {
        lng: subsatelliteAtEpoch.lngDeg,
        lat: subsatelliteAtEpoch.latDeg,
        timestamp: noaa20EpochPass.timestampMs + 20 * 60_000,
        frp: 65,
        confidence: 90,
        instrument: 'viirs',
        source: 'VIIRS 375m / NOAA-20',
        satellite: 'NOAA-20',
      },
    ]

    const negativesAll = evaluateSpotNegativePasses(index, positiveMatchNearEpoch, {
      nowMs: evalNowMs,
      sensorFilter: 'harmonized',
    })
    assert.equal(
      negativesAll.some(
        (n) => n.satellite === 'NOAA-20' && Math.abs(n.timestampMs - noaa20EpochPass.timestampMs) <= 60_000,
      ),
      false,
    )
    assert.ok(negativesAll.some((n) => n.status === 'non-detection'))

    const negativesModis = evaluateSpotNegativePasses(index, positiveMatchNearEpoch, {
      nowMs: evalNowMs,
      sensorFilter: 'modis',
    })
    assert.ok(negativesModis.every((n) => n.instrument === 'modis'))

    // Pending pass detection right inside ingestion lag
    const pendingNowMs = epochMs + 20 * 60_000
    const pendingIndex = buildSatelliteOverpassIndex(undefined, pendingNowMs)
    const distantSpot: FireSpotTooltipInput[] = [
      {
        lng: subsatelliteAtEpoch.lngDeg,
        lat: subsatelliteAtEpoch.latDeg,
        timestamp: epochMs - 8 * 3_600_000,
        frp: 30,
        confidence: 80,
        instrument: 'modis',
        source: 'MODIS 1km',
        satellite: 'Terra',
      },
    ]
    const pendingResults = evaluateSpotNegativePasses(pendingIndex, distantSpot, {
      nowMs: pendingNowMs,
      sensorFilter: 'viirs',
    })
    const recentNoaa20 = pendingResults.find(
      (n) => n.satellite === 'NOAA-20' && Math.abs(n.timestampMs - epochMs) <= 60_000,
    )
    assert.ok(recentNoaa20)
    assert.equal(recentNoaa20.status, 'pending')
  })

  it('enforces >= 1rem minimum bar width, clip overflow, horizon day/night split, negative stripes, cutoff overlay, and forced-colors borders in App.css', () => {
    const appCss = fs.readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
    const plotMatch = appCss.match(/\.fire-timeline-plot\s*\{([^}]*)\}/)
    assert.ok(plotMatch, 'expected .fire-timeline-plot CSS rule')
    assert.match(plotMatch[1], /--timeline-day-bg:\s*var\(--surface-subtle-dark,\s*#1e293b\)\s*;/)
    assert.match(plotMatch[1], /--timeline-night-bg:\s*#000000\s*;/)
    assert.match(plotMatch[1], /background-image:\s*linear-gradient\([\s\S]*var\(--horizon-y,\s*52%\)/)

    const barsMatch = appCss.match(/\.fire-timeline-bars\s*\{([^}]*)\}/)
    assert.ok(barsMatch, 'expected .fire-timeline-bars CSS rule')
    assert.match(barsMatch[1], /grid-template-columns:\s*repeat\(24,\s*minmax\(1rem,\s*1fr\)\)\s*;/)

    const scrollMatch = appCss.match(/\.fire-timeline-scroll\s*\{([^}]*)\}/)
    assert.ok(scrollMatch, 'expected .fire-timeline-scroll CSS rule')
    assert.match(scrollMatch[1], /overflow:\s*clip\s*;/)
    assert.doesNotMatch(scrollMatch[1], /overflow(-[xy])?:\s*(auto|scroll)\b/)

    const negMatch = appCss.match(/\.fire-timeline-bar-negative\s*\{([^}]*)\}/)
    assert.ok(negMatch, 'expected .fire-timeline-bar-negative CSS rule')
    assert.match(negMatch[1], /repeating-linear-gradient\(\s*-45deg\b/)

    const subbarsMatch = appCss.match(/\.fire-timeline-slot-subbars\s*\{([^}]*)\}/)
    assert.ok(subbarsMatch, 'expected .fire-timeline-slot-subbars CSS rule')
    assert.match(subbarsMatch[1], /grid-auto-flow:\s*column\s*;/)

    const cutoffMatch = appCss.match(/\.fire-timeline-cutoff-zone\s*\{([^}]*)\}/)
    assert.ok(cutoffMatch, 'expected .fire-timeline-cutoff-zone CSS rule')
    assert.match(cutoffMatch[1], /inset-inline-end:\s*0\s*;/)
    assert.match(cutoffMatch[1], /var\(--cutoff-width/)

    assert.match(appCss, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.fire-timeline-plot/)
    assert.match(appCss, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.fire-timeline-bar-negative/)
    assert.match(appCss, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.fire-timeline-cutoff-zone/)
  })
})
