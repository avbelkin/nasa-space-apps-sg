import assert from 'node:assert/strict'
import test from 'node:test'
import { placeFireTooltip } from '../src/utils/fireTooltipPlacement.ts'

const card = { width: 400, height: 200 }
const viewport = { width: 1000, height: 700 }

test('centers the hover card below the pointer when there is room', () => {
  assert.deepEqual(placeFireTooltip({ x: 500, y: 100 }, card, viewport), { x: 300, y: 112 })
})

test('keeps the card inside either side edge and flips it above the pointer near the bottom', () => {
  assert.deepEqual(placeFireTooltip({ x: 1, y: 100 }, card, viewport), { x: 8, y: 112 })
  assert.deepEqual(placeFireTooltip({ x: 999, y: 690 }, card, viewport), { x: 592, y: 478 })
})

test('keeps the card within the viewport when neither side has enough room', () => {
  const tallCard = { width: 400, height: 500 }
  assert.deepEqual(placeFireTooltip({ x: 500, y: 300 }, tallCard, viewport), { x: 300, y: 192 })
  assert.deepEqual(placeFireTooltip({ x: 500, y: 400 }, tallCard, viewport), { x: 300, y: 8 })
})
