import assert from 'node:assert/strict'
import test from 'node:test'
import type { NegativeTimelineSubBar } from '../src/utils/fireTimeline.ts'
import { getCrossFamilyPassOutlook, getSecondPassOutlook } from '../src/utils/secondPassOutlook.ts'
import type { FirmsSpotTuple } from '../src/utils/fireSpots.ts'
import type { ComputedOverpass } from '../src/utils/satelliteOverpassTimeline.ts'

const minute = 60_000
const spot = { timestamp: 12_000 * minute, instrument: 'viirs', satellite: 'NOAA-20', source: 'VIIRS', frp: 28 } as const
const pass: NegativeTimelineSubBar = {
  kind: 'non-detection', timestampMs: spot.timestamp + 50 * minute, satellite: 'NOAA-21',
  instrument: 'viirs', localTimeLabel: '12:50', shortSatellite: 'N21', color: '',
  ingestionLagMinutes: 90, distanceKm: 84,
}
const fetchedAt = spot.timestamp + 180 * minute

test('uses lower-miss VIIRS intensity and viewing ranges', () => {
  assert.deepEqual(getSecondPassOutlook(spot, [pass], '', fetchedAt), {
    satellite: 'NOAA-21',
    fewer: ['a first detection of 20–50 MW', 'a second ground track within 100 km'],
    more: [],
  })
})

test('preserves both directions when MODIS land cover and viewing geometry disagree', () => {
  const modis = { ...spot, instrument: 'modis', satellite: 'Terra', source: 'MODIS' } as const
  const aqua = { ...pass, instrument: 'modis', satellite: 'Aqua', distanceKm: 1080 } as const
  assert.deepEqual(getSecondPassOutlook(modis, [aqua], 'Broadleaved evergreen trees', fetchedAt), {
    satellite: 'Aqua',
    fewer: ['broadleaved evergreen cover'],
    more: ['a second ground track 1,000–1,200 km away'],
  })
})

test('requires a settled later pass from a different satellite in the same family', () => {
  assert.equal(getSecondPassOutlook(spot, [
    { ...pass, kind: 'pending' },
    { ...pass, satellite: spot.satellite },
    { ...pass, instrument: 'modis' },
    { ...pass, timestampMs: spot.timestamp - minute },
    { ...pass, timestampMs: spot.timestamp + 350 * minute },
  ], '', fetchedAt), null)
  assert.equal(getSecondPassOutlook(spot, [pass], '', fetchedAt - 20 * minute), null)
})

const anchor = { ...spot, lat: 10, lng: 35, frp: 3 }
const crossPass: ComputedOverpass = {
  satelliteId: 'aqua', satellite: 'Aqua', noradId: 27424, instrument: 'modis',
  timestampMs: anchor.timestamp + 50 * minute, distanceKm: 1060,
  isNadir: false, typicalIngestionLagMinutes: 120,
}
const feed = {
  sources: [
    { code: 0, dataset: 'MODIS_NRT', label: 'MODIS', instrument: 'modis' as const, count: 1, radiusMeters: 1000 },
    { code: 1, dataset: 'VIIRS_NOAA20_NRT', label: 'VIIRS', instrument: 'viirs' as const, count: 1, radiusMeters: 375 },
  ],
  spots: [] as FirmsSpotTuple[],
  windowStartUtc: new Date(anchor.timestamp - 900 * minute).toISOString(),
  windowEndUtc: new Date(anchor.timestamp + 300 * minute).toISOString(),
  fetchedAtUtc: new Date(anchor.timestamp + 300 * minute).toISOString(),
}

test('explains a missed MODIS pass after a weak VIIRS detection', () => {
  const outlook = getCrossFamilyPassOutlook(anchor, [crossPass], feed)
  assert.equal(outlook?.target, 'modis')
  assert.deepEqual(outlook?.more, ['a ground track at least 800 km away', 'a first detection of 2–5 MW'])
})

test('explains a missed VIIRS pass after MODIS using the VIIRS distance bands', () => {
  const modis = { ...anchor, instrument: 'modis' as const, satellite: 'Terra' }
  const viirsPass = { ...crossPass, instrument: 'viirs' as const, satellite: 'NOAA-20', distanceKm: 1_130 }
  const outlook = getCrossFamilyPassOutlook(modis, [viirsPass], feed)
  assert.equal(outlook?.target, 'viirs')
  assert.deepEqual(outlook?.more, ['a ground track at least 1,000 km away'])
})

test('checks the shared feed and ignores passes still awaiting data', () => {
  const nearby: FirmsSpotTuple = [35.004, 10, crossPass.timestampMs, 20, 350, 80, 0, 'Aqua', 'D']
  assert.equal(getCrossFamilyPassOutlook(anchor, [crossPass], { ...feed, spots: [nearby] }), null)
  const distant: FirmsSpotTuple = [35.03, 10, crossPass.timestampMs, 20, 350, 80, 0, 'Aqua', 'D']
  assert.equal(getCrossFamilyPassOutlook(anchor, [crossPass], { ...feed, spots: [distant] })?.satellite, 'Aqua')
  const fetchedAtUtc = new Date(crossPass.timestampMs + 120 * minute).toISOString()
  assert.equal(getCrossFamilyPassOutlook(anchor, [crossPass], { ...feed, fetchedAtUtc }), null)
})
