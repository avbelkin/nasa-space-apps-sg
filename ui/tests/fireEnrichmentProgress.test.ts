import assert from 'node:assert/strict'
import test from 'node:test'
import { fireEnrichmentDelay, fireEnrichmentProgressKey } from '../src/state/fireEnrichment.ts'

test('keeps checking slowly when a weather or geometry batch stalls', () => {
  assert.deepEqual([0, 2, 3, 5, 6, 15].map(fireEnrichmentDelay), [10_000, 10_000, 30_000, 30_000, 60_000, 60_000])
})

test('counts intermediate progress even while both stage statuses stay pending', () => {
  const start = {
    fetchedAtUtc: '2026-11-15T08:00:00Z',
    landCoverPending: true,
    geometryStatus: 'pending' as const,
    geometryProgress: { status: 'pending' as const, totalCount: 20, readyCount: 5, pendingCount: 15 },
    weather: { status: 'pending' as const, sampledCount: 5, availableCount: 3, targetCount: 20, eligibleCount: 20 },
  }
  const key = fireEnrichmentProgressKey(start)
  assert.notEqual(key, fireEnrichmentProgressKey({
    ...start, geometryProgress: { ...start.geometryProgress, readyCount: 7, pendingCount: 13 },
  }))
  assert.notEqual(key, fireEnrichmentProgressKey({
    ...start, weather: { ...start.weather, sampledCount: 6 },
  }))
  assert.equal(key, fireEnrichmentProgressKey({ ...start }))
})
