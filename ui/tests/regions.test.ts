import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateRegionsForMonth,
  REGIONAL_FIRE_REGIMES,
  SINGAPORE_FOCUS_ZOOM,
  SINGAPORE_REGION_ID,
  sortRegionsForList,
  type SensorFilter,
} from '../src/data/stubSeasonalData.ts'

test('Singapore replaces Equatorial Southeast Asia and points to Singapore coordinates', () => {
  assert.equal(
    REGIONAL_FIRE_REGIMES.some((regime) => regime.region === 'Equatorial Southeast Asia'),
    false,
  )

  const singapore = REGIONAL_FIRE_REGIMES[0]
  assert.ok(singapore)
  assert.equal(singapore.id, SINGAPORE_REGION_ID)
  assert.equal(singapore.region, 'Singapore')
  assert.deepEqual(singapore.coordinates, [103.8198, 1.3521])
  assert.ok(singapore.coordinates[0] >= 103.6 && singapore.coordinates[0] <= 104.1)
  assert.ok(singapore.coordinates[1] >= 1.15 && singapore.coordinates[1] <= 1.48)
  assert.equal(singapore.focusZoom, SINGAPORE_FOCUS_ZOOM)
  assert.equal(SINGAPORE_FOCUS_ZOOM, 8.5)
})

test('sortRegionsForList keeps Singapore first across all months and sensor filters', () => {
  const sensors: readonly SensorFilter[] = ['harmonized', 'modis', 'viirs']

  for (let month = 0; month < 12; month += 1) {
    for (const sensor of sensors) {
      const evaluated = evaluateRegionsForMonth(month, sensor)
      const sorted = sortRegionsForList(evaluated)

      assert.equal(sorted.length, evaluated.length)
      assert.equal(sorted[0]?.id, SINGAPORE_REGION_ID)
      assert.equal(sorted[0]?.region, 'Singapore')

      const remaining = sorted.slice(1)
      for (let idx = 1; idx < remaining.length; idx += 1) {
        const prev = remaining[idx - 1]
        const curr = remaining[idx]
        const absDiff = Math.abs(prev.delta) - Math.abs(curr.delta)
        assert.ok(
          absDiff > 0 || (absDiff === 0 && prev.region.localeCompare(curr.region) <= 0),
          `Expected remaining regions sorted at month=${month}, sensor=${sensor}`,
        )
      }
    }
  }

  // Explicitly confirm months where another region has a larger |delta| than Singapore
  const juneSorted = sortRegionsForList(evaluateRegionsForMonth(5, 'harmonized'))
  assert.equal(juneSorted[0]?.region, 'Singapore')
  assert.equal(juneSorted[1]?.region, 'Boreal Canada')
  assert.ok(Math.abs(juneSorted[1].delta) > Math.abs(juneSorted[0].delta))

  const novemberSorted = sortRegionsForList(evaluateRegionsForMonth(10, 'harmonized'))
  assert.equal(novemberSorted[0]?.region, 'Singapore')
  assert.equal(novemberSorted[1]?.region, 'Northern Australia')
  assert.ok(Math.abs(novemberSorted[1].delta) > Math.abs(novemberSorted[0].delta))
})
