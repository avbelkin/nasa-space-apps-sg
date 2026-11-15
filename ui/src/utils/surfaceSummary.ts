import type { FirmsLiveSpotsResponse } from './fireSpots.ts'

// Classes with fewer combined detections than this fold into one "Other" row:
// single-digit strata produce noise, not signal.
export const SURFACE_CLASS_MIN_COUNT = 5

export interface SurfaceSensorRow {
  label: string
  modisCount: number
  viirsCount: number
  total: number
  kind: 'class' | 'other' | 'unclassified'
}

// Mirrors DEFAULT_SOURCE_META in fireSpots.ts for payloads without a sources list.
const FALLBACK_INSTRUMENTS: ReadonlyMap<number, 'modis' | 'viirs'> = new Map([
  [0, 'modis'],
  [1, 'viirs'],
  [2, 'viirs'],
])

function instrumentBySourceCode(payload: FirmsLiveSpotsResponse): Map<number, 'modis' | 'viirs'> {
  const map = new Map(FALLBACK_INSTRUMENTS)
  for (const source of payload.sources ?? []) {
    map.set(source.code, source.instrument)
  }
  return map
}

// Raw detections grouped by dominant land-cover class, split by sensor. Counts only:
// shares and ratios on a 24 h raw feed would invite conclusions the data cannot support.
export function summarizeSurfaceBySensor(
  payload: FirmsLiveSpotsResponse | null,
): SurfaceSensorRow[] {
  if (!payload) return []
  const labels = payload.landCoverDataset?.classLabels ?? {}
  const instruments = instrumentBySourceCode(payload)

  const byLabel = new Map<string, SurfaceSensorRow>()
  const unclassified: SurfaceSensorRow = {
    label: 'Not classified',
    modisCount: 0,
    viirsCount: 0,
    total: 0,
    kind: 'unclassified',
  }

  for (const spot of payload.spots) {
    const [, , , , , , sourceCode, , , landCover] = spot
    const instrument = instruments.get(sourceCode) ?? 'viirs'
    const label = landCover ? labels[landCover.dominantCode] : undefined
    const row = label
      ? (byLabel.get(label) ?? {
          label,
          modisCount: 0,
          viirsCount: 0,
          total: 0,
          kind: 'class' as const,
        })
      : unclassified
    if (instrument === 'modis') row.modisCount += 1
    else row.viirsCount += 1
    row.total += 1
    if (label) byLabel.set(label, row)
  }

  const classes = [...byLabel.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label, 'en'),
  )
  const kept = classes.filter((row) => row.total >= SURFACE_CLASS_MIN_COUNT)
  const folded = classes.filter((row) => row.total < SURFACE_CLASS_MIN_COUNT)
  const rows: SurfaceSensorRow[] = [...kept]
  if (folded.length > 0) {
    rows.push({
      label: `Other (${folded.length} small ${folded.length === 1 ? 'class' : 'classes'})`,
      modisCount: folded.reduce((sum, row) => sum + row.modisCount, 0),
      viirsCount: folded.reduce((sum, row) => sum + row.viirsCount, 0),
      total: folded.reduce((sum, row) => sum + row.total, 0),
      kind: 'other',
    })
  }
  if (unclassified.total > 0) rows.push(unclassified)
  return rows
}
