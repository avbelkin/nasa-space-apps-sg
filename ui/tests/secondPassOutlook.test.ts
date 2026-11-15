import assert from 'node:assert/strict'
import test from 'node:test'
import type { NegativeTimelineSubBar } from '../src/utils/fireTimeline.ts'
import { getSecondPassOutlook } from '../src/utils/secondPassOutlook.ts'

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
