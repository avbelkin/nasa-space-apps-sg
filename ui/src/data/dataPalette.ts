import type { CSSProperties } from 'react'
import type { StatusCategory } from './stubSeasonalData.ts'

// Single source of truth for every data color on the map, in the legend and in the panels.
// One hue carries one meaning: orange/neutral/blue are reserved for the status categories,
// satellites live in green (MODIS) and magenta/violet (VIIRS). The pale swath fills (SWATH_COLORS)
// are the one exception: their hues sit near "above"/"below typical", told apart by opacity and form.

export const STATUS_COLORS: Record<StatusCategory, string> = {
  'anomaly-high': '#fb923c',
  'fits-typical': '#e2e8f0',
  // Dark enough to differ from "above typical" by lightness (>= 3:1), not by hue alone.
  'below-typical': '#1e40af',
}

// Outline drawn around data marks so dark and light fills both separate from the basemap.
export const MARK_STROKE_COLOR = '#f8fafc'

// Dark edge outside the light outline, so marks also separate from bright desert and cloud;
// the "typical" ring uses it as its only outline.
export const MARK_EDGE_COLOR = '#0f172a'

export type KnownSatelliteId = 'terra' | 'aqua' | 'noaa-20' | 'noaa-21'

export const SATELLITE_COLORS: Record<KnownSatelliteId, string> = {
  // MODIS family: greens
  terra: '#a3e635',
  aqua: '#34d399',
  // VIIRS family: magenta / violet
  'noaa-20': '#f0abfc',
  'noaa-21': '#c084fc',
}

// Fallback for a spacecraft the palette does not know yet; a hue no other meaning uses.
export const DEFAULT_SATELLITE_COLOR = '#fde047'

// Instantaneous sensor swaths (the team's fixed "extremum" hues): the narrow nadir swath and the
// wide scan swath of every satellite share these two colors, whatever the spacecraft. They are
// pale and drawn at low opacity, unlike the opaque, outlined status marks.
export const SWATH_COLORS = {
  nadir: '#92b4de',
  wide: '#f49a74',
} as const

// Live NASA FIRMS fire spots (the team's colors): a warm ramp by Fire Radiative Power, or one hue
// per instrument in the 'sensors' view mode. While live spots are shown, the sample status marks
// are hidden, so the warm ramp never sits next to the 'above typical' orange on the map.
export const FIRE_SPOT_COLORS = {
  frpLow: '#fbbf24',
  frpMid: '#ff9100',
  frpHigh: '#ff1744',
  modis: '#22d3ee',
  viirs: '#fb923c',
  otherInstrument: '#f59e0b',
  stroke: 'rgba(15, 23, 42, 0.65)',
  focusRing: '#ffffff',
} as const

export const USER_LOCATION_COLORS = {
  fill: '#ffffff',
  ring: '#0f172a',
  halo: '#ffffff',
} as const

export const RAIN_CLOUD_COLORS = {
  low: '#38a8f5',
  mid: '#3b6df6',
  high: '#a855f7',
} as const

// Exposes the palette to CSS consumers (legend glyphs, satellite badges) as custom properties,
// so stylesheets never repeat a hex value. Applied once on the app root.
export const DATA_PALETTE_CSS_VARIABLES: CSSProperties & Record<`--${string}`, string> = {
  '--data-above': STATUS_COLORS['anomaly-high'],
  '--data-typical': STATUS_COLORS['fits-typical'],
  '--data-below': STATUS_COLORS['below-typical'],
  '--data-mark-stroke': MARK_STROKE_COLOR,
  '--data-sat-terra': SATELLITE_COLORS.terra,
  '--data-sat-aqua': SATELLITE_COLORS.aqua,
  '--data-sat-noaa-20': SATELLITE_COLORS['noaa-20'],
  '--data-sat-noaa-21': SATELLITE_COLORS['noaa-21'],
  '--data-sat-default': DEFAULT_SATELLITE_COLOR,
  '--data-swath-nadir': SWATH_COLORS.nadir,
  '--data-swath-wide': SWATH_COLORS.wide,
  '--data-user-fill': USER_LOCATION_COLORS.fill,
  '--data-user-ring': USER_LOCATION_COLORS.ring,
  '--data-rain-low': RAIN_CLOUD_COLORS.low,
  '--data-rain-mid': RAIN_CLOUD_COLORS.mid,
  '--data-rain-high': RAIN_CLOUD_COLORS.high,
}
