import type { FireInstrument, FireSpotTooltipInput, FirmsLiveSpotsResponse } from './fireSpots.ts'

interface LightGeometry {
  elevationDeg: number
  glintAngleDeg: number | null
}

export interface FireObservationGeometry {
  orbit: { offNadirDeg: number; slantRangeKm: number } | null
  sun: LightGeometry
  moon: LightGeometry
  moonIlluminatedFraction: number
}

interface GeometryBatch {
  status: 'ready' | 'pending' | 'unavailable'
  spots: (FireObservationGeometry | null)[] | null
}

const MAX_BATCH_SIZE = 512

function detectionKey(lng: number, lat: number, timestampMs: number, satellite: string): string {
  return `${lng.toFixed(4)}|${lat.toFixed(4)}|${timestampMs}|${satellite}`
}

export function readPinnedFireGeometry(
  payload: Pick<FirmsLiveSpotsResponse, 'geometryStatus' | 'spots'> | null,
  inputs: readonly FireSpotTooltipInput[] | undefined,
): (FireObservationGeometry | null)[] | undefined {
  if (payload?.geometryStatus !== 'ready' || !inputs?.length) return undefined

  const keys = inputs.map(({ lng, lat, timestamp, satellite }) =>
    lng !== undefined && lat !== undefined && satellite
      ? detectionKey(lng, lat, timestamp, satellite)
      : null,
  )
  const wanted = new Set(keys)
  const matched = new Map<string, FireObservationGeometry>()
  for (const [lng, lat, timestamp, , , , , satellite, , , geometry] of payload.spots) {
    if (!geometry) continue
    const key = detectionKey(lng, lat, timestamp, satellite)
    if (wanted.has(key)) matched.set(key, geometry)
  }
  if (matched.size === 0) return undefined
  return keys.map((key) => key === null ? null : matched.get(key) ?? null)
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function fetchPinnedFireGeometry(
  apiBaseUrl: string,
  inputs: readonly FireSpotTooltipInput[],
  signal: AbortSignal,
  feedGeometry?: readonly (FireObservationGeometry | null)[],
): Promise<(FireObservationGeometry | null)[]> {
  const observations = inputs.map((_, index) => feedGeometry?.[index] ?? null)
  const requested = inputs.flatMap((spot, index) => {
    if (observations[index]) return []
    const { lng, lat, timestamp: timestampMs, satellite } = spot
    return Number.isFinite(lng) && Number.isFinite(lat) && Number.isSafeInteger(timestampMs) && satellite
      ? [{ index, key: { lng, lat, timestampMs, satellite } }]
      : []
  })
  for (let offset = 0; offset < requested.length; offset += MAX_BATCH_SIZE) {
    const entries = requested.slice(offset, offset + MAX_BATCH_SIZE)
    const body = JSON.stringify({ spots: entries.map(({ key }) => key) })
    let retryDelay = 1_000
    while (!signal.aborted) {
      const response = await fetch(`${apiBaseUrl}/api/fires/spots/geometry`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body,
        signal,
      })
      if (!response.ok) {
        throw new Error(`Observation geometry request failed (HTTP ${response.status})`)
      }

      const batch = (await response.json()) as GeometryBatch
      if (batch.status === 'ready' && batch.spots?.length === entries.length) {
        const spots = batch.spots
        entries.forEach(({ index }, row) => { observations[index] = spots[row] })
        break
      }
      if (batch.status !== 'pending') {
        break
      }

      await waitForRetry(retryDelay, signal)
      retryDelay = Math.min(2 * retryDelay, 10_000)
    }
  }

  return observations
}

const metrics: readonly {
  label: string
  unit: string
  read: (geometry: FireObservationGeometry) => number | null | undefined
}[] = [
  { label: 'Sat. off-nadir', unit: '°', read: (g) => g.orbit?.offNadirDeg },
  { label: 'Sat. distance', unit: ' km', read: (g) => g.orbit?.slantRangeKm },
  { label: 'Sun elevation', unit: '°', read: (g) => g.sun.elevationDeg },
  { label: 'Sun glint', unit: '°', read: (g) => g.sun.glintAngleDeg },
  { label: 'Moon elevation', unit: '°', read: (g) => g.moon.elevationDeg },
  { label: 'Moon glint', unit: '°', read: (g) => g.moon.glintAngleDeg },
  { label: 'Moon lit', unit: '%', read: (g) => g.moonIlluminatedFraction * 100 },
]

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, useGrouping: false })

export function summarizeFireGeometry(
  inputs: readonly FireSpotTooltipInput[],
  observations: readonly (FireObservationGeometry | null)[],
) {
  const detections: Record<FireInstrument, (FireObservationGeometry | null)[]> = { modis: [], viirs: [] }
  inputs.forEach(({ instrument }, index) => {
    if (instrument) {
      detections[instrument].push(observations[index] ?? null)
    }
  })
  const sensors = (['modis', 'viirs'] as const).filter((sensor) => detections[sensor].length > 0)
  if (!sensors.some((sensor) => detections[sensor].some((geometry) => geometry !== null))) {
    return null
  }

  const rows = metrics.map(({ label, unit, read }) => ({
    label,
    bySensor: sensors.map((sensor) => {
      let min = Infinity
      let max = -Infinity
      let count = 0
      for (const geometry of detections[sensor]) {
        const value = geometry && read(geometry)
        if (value == null || !Number.isFinite(value)) continue
        min = Math.min(min, value)
        max = Math.max(max, value)
        count++
      }
      const from = count > 0 ? numberFormat.format(min) : null
      const to = count > 0 ? numberFormat.format(max) : null
      return {
        text: from === null ? null : (from === to ? from : `${from}–${to}`) + unit,
        count,
        total: detections[sensor].length,
      }
    }),
  }))
  return { sensors, rows }
}
