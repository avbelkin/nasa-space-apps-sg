import type { MonthlyBaselinePoint, RegionalFireRegime, StatusCategory } from './stubSeasonalData'

// User-facing wording and glyphs for the status categories, shared by the map legend and the panel.
export const STATUS_GLYPHS: Record<StatusCategory, string> = {
  'anomaly-high': '▲',
  'fits-typical': '●',
  'below-typical': '▼',
}

export const STATUS_TEXT: Record<StatusCategory, string> = {
  'anomaly-high': 'Above typical',
  'fits-typical': 'Typical',
  'below-typical': 'Below typical',
}

// Panel text colors per category: theme-aware delta tokens, never the map fills.
export const STATUS_TONE_CLASS: Record<StatusCategory, string> = {
  'anomaly-high': 'tone-up',
  'fits-typical': 'tone-neutral',
  'below-typical': 'tone-down',
}

export const SENSOR_AGREEMENT_TEXT: Record<RegionalFireRegime['sensorAgreement'], string> = {
  both: 'MODIS and VIIRS agree here',
  'viirs-led': 'VIIRS sees more small fires here than MODIS',
  'modis-baseline': 'Based mainly on the long MODIS record',
}

const MONTH_NAME_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })

export const MONTH_NAMES: readonly string[] = Array.from({ length: 12 }, (_, month) =>
  MONTH_NAME_FORMAT.format(Date.UTC(2000, month, 1)),
)

const MONTH_SHORT_NAMES: readonly string[] = MONTH_NAMES.map((name) => name.slice(0, 3))

export function formatSignedDelta(delta: number): string {
  if (delta > 0) {
    return `+${delta}`
  }
  return delta < 0 ? `−${Math.abs(delta)}` : '0'
}

// Peak months as a wrapped range when contiguous ("Dec–Feb"), otherwise a list in calendar order.
export function formatPeakMonths(months: readonly number[]): string {
  const set = new Set(months.map((month) => ((month % 12) + 12) % 12))
  if (set.size === 0) {
    return '—'
  }
  if (set.size === 12) {
    return 'All year'
  }
  const sorted = [...set].sort((a, b) => a - b)
  const start = sorted.find((month) => !set.has((month + 11) % 12)) ?? sorted[0]
  const ordered = Array.from({ length: 12 }, (_, step) => (start + step) % 12).filter((month) =>
    set.has(month),
  )
  const isContiguous = ordered.every(
    (month, index) => index === 0 || month === (ordered[index - 1] + 1) % 12,
  )
  if (isContiguous && ordered.length > 2) {
    return `${MONTH_SHORT_NAMES[ordered[0]]}–${MONTH_SHORT_NAMES[ordered[ordered.length - 1]]}`
  }
  return ordered.map((month) => MONTH_SHORT_NAMES[month]).join(', ')
}

// Global month classification in the same three categories as the regions.
export function monthStatusCategory(point: MonthlyBaselinePoint): StatusCategory {
  if (point.classification !== 'Fits Typical Calendar') {
    return 'anomaly-high'
  }
  return 'fits-typical'
}
