import type { SensorFilter } from '../data/mapTypes.ts'
import type { FirmsLiveSpotsResponse } from './fireSpots.ts'

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

// One row per raw detection as loaded (never map declutter groups), with every surface
// feature the payload carries — the same columns a future ML dataset would start from.
export function buildFireSliceCsv(
  payload: FirmsLiveSpotsResponse,
  sensorFilter: SensorFilter,
): string {
  const classCodes = Object.keys(payload.landCoverDataset?.classLabels ?? {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const instruments = new Map((payload.sources ?? []).map((source) => [source.code, source.instrument]))

  const header = [
    'lng', 'lat', 'timestamp_utc', 'satellite', 'instrument', 'frp_mw', 'brightness_k',
    'confidence', 'day_night', 'landcover_dominant', 'landcover_coverage',
    ...classCodes.map((code) => `lc_${code}`),
  ]

  const lines = [header.join(',')]
  for (const spot of payload.spots) {
    const [lng, lat, timestampMs, frp, brightnessK, confidence, sourceCode, satellite, dayNight, landCover] = spot
    const instrument = instruments.get(sourceCode)
    if (sensorFilter !== 'harmonized' && instrument !== sensorFilter) continue
    const fractionByCode = new Map(
      (landCover?.classes ?? []).map(({ code, fraction }) => [code, fraction]),
    )
    lines.push(
      [
        csvCell(lng),
        csvCell(lat),
        csvCell(Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : ''),
        csvCell(satellite),
        csvCell(instrument ?? ''),
        csvCell(frp),
        csvCell(brightnessK),
        csvCell(confidence),
        csvCell(dayNight),
        csvCell(
          landCover ? (payload.landCoverDataset?.classLabels[landCover.dominantCode] ?? landCover.dominantCode) : '',
        ),
        csvCell(landCover ? landCover.coverage : ''),
        ...classCodes.map((code) => csvCell(fractionByCode.get(code))),
      ].join(','),
    )
  }
  return lines.join('\n') + '\n'
}

export function fireSliceFileName(payload: FirmsLiveSpotsResponse, sensorFilter: SensorFilter): string {
  const date = payload.fetchedAtUtc.slice(0, 10) || 'snapshot'
  return `fire-slice_${sensorFilter}_${date}.csv`
}

export function downloadFireSlice(
  payload: FirmsLiveSpotsResponse,
  sensorFilter: SensorFilter,
): void {
  const blob = new Blob([buildFireSliceCsv(payload, sensorFilter)], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fireSliceFileName(payload, sensorFilter)
  anchor.click()
  URL.revokeObjectURL(url)
}
