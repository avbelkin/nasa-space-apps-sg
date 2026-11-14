import type { FeatureCollection, Point } from 'geojson'

export type ViewMode = 'anomaly' | 'seasonal' | 'sensors'
export type SensorFilter = 'harmonized' | 'modis' | 'viirs'
export type ProjectionMode = 'globe' | 'mercator'
export type StatusCategory = 'anomaly-high' | 'fits-typical' | 'below-typical'

export interface MonthlyBaselinePoint {
  monthIndex: number
  label: string
  typicalIndex: number
  currentIndex: number
  classification: 'Fits Typical Calendar' | 'Above-Normal Anomaly' | 'Early-Season Anomaly'
  summary: string
}

export interface RegionalFireRegime {
  id: string
  region: string
  coordinates: [number, number]
  peakMonths: number[]
  typicalIntensity: number
  currentIntensity: number
  anomalyDelta: number
  sensorAgreement: 'both' | 'viirs-led' | 'modis-baseline'
  note: string
}

export interface RegionalEvaluatedRegime extends RegionalFireRegime {
  effectiveTypical: number
  effectiveCurrent: number
  delta: number
  statusCategory: StatusCategory
  statusLabel: string
}

export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Illustrative stub seasonal/anomaly baseline until NASA FIRMS Cloud Run API endpoints are connected.
 */
export const MONTHLY_PROFILE: MonthlyBaselinePoint[] = [
  {
    monthIndex: 0,
    label: 'Jan',
    typicalIndex: 44,
    currentIndex: 47,
    classification: 'Fits Typical Calendar',
    summary: 'Northern tropical savanna burning peaks right along the multi-decade MODIS+VIIRS baseline.',
  },
  {
    monthIndex: 1,
    label: 'Feb',
    typicalIndex: 48,
    currentIndex: 52,
    classification: 'Fits Typical Calendar',
    summary: 'Mainland Southeast Asia and Sahel dry-season activity matches typical calendar quantiles.',
  },
  {
    monthIndex: 2,
    label: 'Mar',
    typicalIndex: 56,
    currentIndex: 69,
    classification: 'Above-Normal Anomaly',
    summary: 'Mainland Southeast Asia and Equatorial transition belts show an elevated thermal departure.',
  },
  {
    monthIndex: 3,
    label: 'Apr',
    typicalIndex: 52,
    currentIndex: 63,
    classification: 'Early-Season Anomaly',
    summary: 'Early-season boreal and agricultural detections appear ahead of historical calendar onset.',
  },
  {
    monthIndex: 4,
    label: 'May',
    typicalIndex: 49,
    currentIndex: 66,
    classification: 'Early-Season Anomaly',
    summary: 'Boreal high-latitude fires ignite earlier than the 2000–2024 harmonized baseline.',
  },
  {
    monthIndex: 5,
    label: 'Jun',
    typicalIndex: 61,
    currentIndex: 78,
    classification: 'Above-Normal Anomaly',
    summary: 'Boreal North America and Mediterranean edges show strong positive FRP anomalies.',
  },
  {
    monthIndex: 6,
    label: 'Jul',
    typicalIndex: 76,
    currentIndex: 82,
    classification: 'Fits Typical Calendar',
    summary: 'Peak Northern Hemisphere summer burning tracks close to expected seasonal capacity.',
  },
  {
    monthIndex: 7,
    label: 'Aug',
    typicalIndex: 88,
    currentIndex: 95,
    classification: 'Above-Normal Anomaly',
    summary: 'Concurrent Boreal, Mediterranean, and Amazon dry-season activity runs at the top of the typical range.',
  },
  {
    monthIndex: 8,
    label: 'Sep',
    typicalIndex: 84,
    currentIndex: 86,
    classification: 'Fits Typical Calendar',
    summary: 'Southern tropics and Equatorial Maritime Continent follow typical late-dry-season timing.',
  },
  {
    monthIndex: 9,
    label: 'Oct',
    typicalIndex: 64,
    currentIndex: 74,
    classification: 'Above-Normal Anomaly',
    summary: 'Extended dry conditions sustain late-season anomalies across Amazonia and Northern Australia.',
  },
  {
    monthIndex: 10,
    label: 'Nov',
    typicalIndex: 46,
    currentIndex: 43,
    classification: 'Fits Typical Calendar',
    summary: 'Transition toward wet monsoon conditions aligns closely with historical seasonal decline.',
  },
  {
    monthIndex: 11,
    label: 'Dec',
    typicalIndex: 41,
    currentIndex: 39,
    classification: 'Fits Typical Calendar',
    summary: 'Sahel dry season begins while Equatorial and Boreal basins settle into baseline low activity.',
  },
]

export const REGIONAL_FIRE_REGIMES: RegionalFireRegime[] = [
  {
    id: 'sea-equatorial',
    region: 'Equatorial Southeast Asia',
    coordinates: [103.8, 1.35],
    peakMonths: [7, 8, 9],
    typicalIntensity: 68,
    currentIntensity: 84,
    anomalyDelta: 16,
    sensorAgreement: 'both',
    note: 'Peatland and plantation edge hotspots; VIIRS 375 m resolves smaller smoldering clusters.',
  },
  {
    id: 'amazon-arc',
    region: 'Amazon Basin',
    coordinates: [-60.0, -8.5],
    peakMonths: [7, 8, 9],
    typicalIntensity: 78,
    currentIntensity: 91,
    anomalyDelta: 13,
    sensorAgreement: 'both',
    note: 'Dry-season deforestation arc where harmonized FRP normalizes post-2012 VIIRS sensitivity jumps.',
  },
  {
    id: 'subsaharan-savanna',
    region: 'Sub-Saharan Savanna',
    coordinates: [21.5, 6.2],
    peakMonths: [0, 1, 11],
    typicalIntensity: 86,
    currentIntensity: 84,
    anomalyDelta: -2,
    sensorAgreement: 'modis-baseline',
    note: 'High-frequency seasonal savanna burning closely matching the 20-year MODIS baseline.',
  },
  {
    id: 'boreal-canada',
    region: 'Boreal Canada',
    coordinates: [-114.4, 58.6],
    peakMonths: [5, 6, 7],
    typicalIntensity: 54,
    currentIntensity: 82,
    anomalyDelta: 28,
    sensorAgreement: 'both',
    note: 'Early-onset and high-intensity crown fire plumes exceeding historical seasonal percentiles.',
  },
  {
    id: 'mediterranean',
    region: 'Mediterranean Basin',
    coordinates: [14.2, 39.8],
    peakMonths: [6, 7, 8],
    typicalIntensity: 58,
    currentIntensity: 61,
    anomalyDelta: 3,
    sensorAgreement: 'viirs-led',
    note: 'Coastal brushfire detections where VIIRS captures short-duration ignitions between MODIS overpasses.',
  },
  {
    id: 'northern-australia',
    region: 'Northern Australia',
    coordinates: [132.5, -14.5],
    peakMonths: [8, 9, 10],
    typicalIntensity: 72,
    currentIntensity: 59,
    anomalyDelta: -13,
    sensorAgreement: 'modis-baseline',
    note: 'Prescribed and late-dry savanna fires tracking slightly below long-term calendar baseline.',
  },
]

const SENSOR_MULTIPLIERS: Record<SensorFilter, number> = {
  harmonized: 1.0,
  modis: 0.82,
  viirs: 1.28,
}

function circularMonthDistance(a: number, b: number): number {
  const diff = Math.abs(a - b)
  return Math.min(diff, 12 - diff)
}

// A departure of at least this many index points reads as above or below typical; anything smaller
// is typical. One rule for the regions and for the worldwide month.
export const STATUS_DELTA_THRESHOLD = 8

export function classifyStatus(delta: number): { category: StatusCategory; label: string } {
  if (delta >= STATUS_DELTA_THRESHOLD) {
    return { category: 'anomaly-high', label: 'Positive Anomaly' }
  }
  if (delta <= -STATUS_DELTA_THRESHOLD) {
    return { category: 'below-typical', label: 'Below Typical' }
  }
  return { category: 'fits-typical', label: 'Fits Typical Season' }
}

export function evaluateRegionsForMonth(
  monthIndex: number,
  sensorFilter: SensorFilter,
): RegionalEvaluatedRegime[] {
  const sensorMultiplier = SENSOR_MULTIPLIERS[sensorFilter]

  return REGIONAL_FIRE_REGIMES.map((regime) => {
    const minDistance = Math.min(
      ...regime.peakMonths.map((peak) => circularMonthDistance(monthIndex, peak)),
    )
    const seasonalFactor = minDistance === 0 ? 1.0 : minDistance === 1 ? 0.62 : 0.28

    const sensorBias =
      sensorFilter === 'viirs' && regime.sensorAgreement === 'viirs-led'
        ? 1.12
        : sensorFilter === 'modis' && regime.sensorAgreement === 'viirs-led'
          ? 0.88
          : 1.0

    const effectiveTypical = Math.round(regime.typicalIntensity * seasonalFactor * sensorMultiplier)
    const effectiveCurrent = Math.round(
      regime.currentIntensity * seasonalFactor * sensorMultiplier * sensorBias,
    )
    const delta = effectiveCurrent - effectiveTypical
    const status = classifyStatus(delta)

    return {
      ...regime,
      effectiveTypical,
      effectiveCurrent,
      delta,
      statusCategory: status.category,
      statusLabel: status.label,
    }
  })
}

export function buildStubGeoJson(
  monthIndex: number,
  sensorFilter: SensorFilter,
): FeatureCollection<Point> {
  const evaluated = evaluateRegionsForMonth(monthIndex, sensorFilter)

  return {
    type: 'FeatureCollection',
    features: evaluated.map((item) => ({
      type: 'Feature',
      id: item.id,
      geometry: {
        type: 'Point',
        coordinates: item.coordinates,
      },
      properties: {
        id: item.id,
        region: item.region,
        typicalIntensity: item.effectiveTypical,
        currentIntensity: item.effectiveCurrent,
        delta: item.delta,
        statusCategory: item.statusCategory,
        statusLabel: item.statusLabel,
        sensorAgreement: item.sensorAgreement,
        radius: Math.max(8, Math.min(26, Math.round(item.effectiveCurrent / 3.8))),
      },
    })),
  }
}
