import type { CSSProperties } from 'react'

// Shared data colors for the map, legend and panels.
// Outline drawn around data marks so dark and light fills both separate from the basemap.
export const MARK_STROKE_COLOR = '#f8fafc'

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
// pale and drawn at low opacity.
export const SWATH_COLORS = {
  nadir: '#92b4de',
  wide: '#ffc078',
} as const

// Live NASA FIRMS fire spots: one high-saturation true red (zero blue channel so blurred pulses
// never drift into pink/magenta, and low green so spots stand apart from amber/gold VIIRS
// night-time lights on dark backgrounds). FRP is encoded by spot radius rather than hue.
export const FIRE_SPOT_COLORS = {
  fill: '#ff1a00',
  pulse: '#ff1a00',
  stroke: 'rgba(15, 23, 42, 0.65)',
  focusRing: '#b6ff00',
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

export const RAIN_DOT_RAINBOW_STOPS = [
  { threshold: 0.15, label: '0.15', color: '#3b82f6' },
  { threshold: 0.35, label: '0.35', color: '#06b6d4' },
  { threshold: 0.5, label: '0.50', color: '#22c55e' },
  { threshold: 0.62, label: '0.62', color: '#eab308' },
  { threshold: 0.75, label: '0.75', color: '#ef4444' },
  { threshold: 0.88, label: '0.88+', color: '#e879f9' },
] as const

export const RAIN_DOT_WHITE_COLOR = '#f8fafc'
// Experimental pure-azure dot fill (#4d96ff) for high contrast over dark basemaps and clean blue separation over green terrain.
export const RAIN_DOT_SOLID_COLOR = '#4d96ff'

// Exposes the palette to CSS consumers (legend glyphs, satellite badges) as custom properties,
// so stylesheets never repeat a hex value. Applied once on the app root.
export const DATA_PALETTE_CSS_VARIABLES: CSSProperties & Record<`--${string}`, string> = {
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
  '--data-rain-dot-solid': RAIN_DOT_SOLID_COLOR,
  '--data-rain-dot-white': RAIN_DOT_WHITE_COLOR,
}
