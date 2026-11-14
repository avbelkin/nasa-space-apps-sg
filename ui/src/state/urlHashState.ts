import {
  MONTH_LABELS,
  REGIONAL_FIRE_REGIMES,
  SINGAPORE_REGION_ID,
  type ProjectionMode,
  type SensorFilter,
  type ViewMode,
} from '../data/stubSeasonalData.ts'

// Versioned: the first key was written on every load (with a hard-coded September) by earlier
// builds, so its values say nothing about a visitor's choice and are ignored.
export const URL_HASH_STORAGE_KEY = 'nasa_fire_calendar_state_v2'
export const LEGACY_URL_HASH_STORAGE_KEY = 'nasa_fire_calendar_url_hash'
export const DEFAULT_CENTER: [number, number] = [108, 8]
export const DEFAULT_ZOOM = 1.75
export const DEFAULT_GEOLOCATION_MAX_ZOOM = 7
export const MIN_ZOOM = 0
export const MAX_ZOOM = 22

export interface MapViewportState {
  zoom: number
  lat: number
  lng: number
}

export interface UrlHashState extends MapViewportState {
  viewMode: ViewMode
  sensorFilter: SensorFilter
  projectionMode: ProjectionMode
  selectedMonth: number
  showOrbits: boolean
  showClouds: boolean
  // Night-hemisphere VIIRS Black Marble blending; the hash carries only the off state (lights=0)
  showNightLights: boolean
  // Live NASA FIRMS fire spots; the hash carries only the off state (fires=0)
  showFires: boolean
  // Absent when no region is selected
  selectedRegionId?: string
  extraParams?: Record<string, string>
}

export type InitialStateSource = 'hash' | 'storage' | 'default'

export interface ResolvedInitialState {
  state: UrlHashState
  source: InitialStateSource
}

// Defaults for a first visit; the month follows the visitor's calendar, so it is built from a date.
export function createDefaultUrlHashState(now: Date = new Date()): UrlHashState {
  return {
    zoom: DEFAULT_ZOOM,
    lat: DEFAULT_CENTER[1],
    lng: DEFAULT_CENTER[0],
    viewMode: 'anomaly',
    sensorFilter: 'harmonized',
    projectionMode: 'globe',
    selectedMonth: now.getMonth(),
    showOrbits: true,
    showClouds: true,
    showNightLights: true,
    showFires: true,
  }
}

const VALID_VIEW_MODES: readonly ViewMode[] = ['anomaly', 'seasonal', 'sensors']
const VALID_SENSOR_FILTERS: readonly SensorFilter[] = ['harmonized', 'modis', 'viirs']
const VALID_PROJECTION_MODES: readonly ProjectionMode[] = ['globe', 'mercator']
const VALID_REGION_IDS: readonly string[] = REGIONAL_FIRE_REGIMES.map((regime) => regime.id)
const LEGACY_REGION_ID_ALIASES: Readonly<Record<string, string>> = {
  'sea-equatorial': SINGAPORE_REGION_ID,
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return DEFAULT_ZOOM
  }
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
  return normalizeZero(Math.round(clamped * 100) / 100)
}

export function clampLat(lat: number): number {
  if (!Number.isFinite(lat)) {
    return DEFAULT_CENTER[1]
  }
  const clamped = Math.min(90, Math.max(-90, lat))
  return normalizeZero(Math.round(clamped * 10000) / 10000)
}

export function normalizeLng(lng: number): number {
  if (!Number.isFinite(lng)) {
    return DEFAULT_CENTER[0]
  }
  let wrapped = ((((lng + 180) % 360) + 360) % 360) - 180
  if (wrapped === -180 && lng > 0) {
    wrapped = 180
  }
  return normalizeZero(Math.round(wrapped * 10000) / 10000)
}

export function clampGeolocationTargetZoom(
  candidateZoom: number | undefined,
  maxZoom = DEFAULT_GEOLOCATION_MAX_ZOOM,
): number {
  const effectiveMaxZoom = Number.isFinite(maxZoom)
    ? clampZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, maxZoom)))
    : DEFAULT_GEOLOCATION_MAX_ZOOM

  if (candidateZoom === undefined || !Number.isFinite(candidateZoom)) {
    return effectiveMaxZoom
  }

  return clampZoom(Math.min(effectiveMaxZoom, Math.max(MIN_ZOOM, candidateZoom)))
}

interface HashFeatureCodec {
  key: string
  // null leaves the key out of the hash
  serialize: (state: UrlHashState) => string | null
  parse: (raw: string, draft: UrlHashState) => boolean
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value)
}

function parseBooleanHashFlag(raw: string): boolean | null {
  const normalized = raw.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'off') {
    return false
  }
  return null
}

function parseMonthValue(raw: string): number | null {
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) {
    const monthNumber = Number(trimmed)
    if (monthNumber >= 1 && monthNumber <= 12) {
      return monthNumber - 1
    }
    return null
  }
  const monthIdx = MONTH_LABELS.findIndex(
    (label) => label.toLowerCase() === trimmed.toLowerCase(),
  )
  return monthIdx >= 0 ? monthIdx : null
}

/**
 * Declarative registry for feature parameters serialized into the URL hash.
 * Add new feature flags or controls here so hash + localStorage sync stays extensible.
 */
const HASH_FEATURE_CODECS: readonly HashFeatureCodec[] = [
  {
    key: 'mode',
    serialize: (state) => state.viewMode,
    parse: (raw, draft) => {
      if (!isOneOf(raw, VALID_VIEW_MODES)) {
        return false
      }
      draft.viewMode = raw
      return true
    },
  },
  {
    key: 'sensor',
    serialize: (state) => state.sensorFilter,
    parse: (raw, draft) => {
      if (!isOneOf(raw, VALID_SENSOR_FILTERS)) {
        return false
      }
      draft.sensorFilter = raw
      return true
    },
  },
  {
    key: 'proj',
    serialize: (state) => state.projectionMode,
    parse: (raw, draft) => {
      if (!isOneOf(raw, VALID_PROJECTION_MODES)) {
        return false
      }
      draft.projectionMode = raw
      return true
    },
  },
  {
    key: 'month',
    serialize: (state) => {
      const clampedMonth = Math.min(11, Math.max(0, Math.trunc(state.selectedMonth)))
      return String(clampedMonth + 1)
    },
    parse: (raw, draft) => {
      const parsed = parseMonthValue(raw)
      if (parsed === null) {
        return false
      }
      draft.selectedMonth = parsed
      return true
    },
  },
  {
    key: 'orbits',
    serialize: (state) => (state.showOrbits ? '1' : '0'),
    parse: (raw, draft) => {
      const parsed = parseBooleanHashFlag(raw)
      if (parsed === null) {
        return false
      }
      draft.showOrbits = parsed
      return true
    },
  },
  {
    key: 'clouds',
    serialize: (state) => (state.showClouds ? '1' : '0'),
    parse: (raw, draft) => {
      const parsed = parseBooleanHashFlag(raw)
      if (parsed === null) {
        return false
      }
      draft.showClouds = parsed
      return true
    },
  },
  {
    key: 'lights',
    serialize: (state) => (state.showNightLights ? null : '0'),
    parse: (raw, draft) => {
      const parsed = parseBooleanHashFlag(raw)
      if (parsed === null) {
        return false
      }
      draft.showNightLights = parsed
      return true
    },
  },
  {
    key: 'fires',
    serialize: (state) => (state.showFires ? null : '0'),
    parse: (raw, draft) => {
      const parsed = parseBooleanHashFlag(raw)
      if (parsed === null) {
        return false
      }
      draft.showFires = parsed
      return true
    },
  },
  {
    key: 'region',
    serialize: (state) => state.selectedRegionId ?? null,
    parse: (raw, draft) => {
      const resolved = LEGACY_REGION_ID_ALIASES[raw] ?? raw
      if (!VALID_REGION_IDS.includes(resolved)) {
        return false
      }
      draft.selectedRegionId = resolved
      return true
    },
  },
]

const RESERVED_CORE_KEYS = new Set<string>([
  'z',
  'lat',
  'lng',
  'lon',
  ...HASH_FEATURE_CODECS.map((codec) => codec.key),
])

export function serializeUrlHash(state: UrlHashState): string {
  const params = new URLSearchParams()
  params.set('z', String(clampZoom(state.zoom)))
  params.set('lat', String(clampLat(state.lat)))
  params.set('lng', String(normalizeLng(state.lng)))

  for (const codec of HASH_FEATURE_CODECS) {
    const value = codec.serialize(state)
    if (value !== null) {
      params.set(codec.key, value)
    }
  }

  if (state.extraParams) {
    const sortedKeys = Object.keys(state.extraParams).sort()
    for (const key of sortedKeys) {
      const value = state.extraParams[key]
      if (!RESERVED_CORE_KEYS.has(key) && key.length > 0 && value.length > 0) {
        params.set(key, value)
      }
    }
  }

  return `#${params.toString()}`
}

function parseFiniteNumber(raw: string | null): number | null {
  if (raw === null) {
    return null
  }
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function cloneFallbackState(fallback: UrlHashState): UrlHashState {
  return {
    zoom: clampZoom(fallback.zoom),
    lat: clampLat(fallback.lat),
    lng: normalizeLng(fallback.lng),
    viewMode: fallback.viewMode,
    sensorFilter: fallback.sensorFilter,
    projectionMode: fallback.projectionMode,
    selectedMonth: fallback.selectedMonth,
    showOrbits: fallback.showOrbits,
    showClouds: fallback.showClouds,
    showNightLights: fallback.showNightLights,
    showFires: fallback.showFires,
    ...(fallback.selectedRegionId ? { selectedRegionId: fallback.selectedRegionId } : {}),
    ...(fallback.extraParams ? { extraParams: { ...fallback.extraParams } } : {}),
  }
}

const POSITIONAL_HASH_REGEX = /^\s*#?(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)(?:\/.*)?$/

export function parseUrlHash(
  rawHash: string,
  fallback: UrlHashState = createDefaultUrlHashState(),
): UrlHashState | null {
  const stripped = rawHash.trim().replace(/^#/, '')
  if (stripped.length === 0) {
    return null
  }

  const positionalMatch = POSITIONAL_HASH_REGEX.exec(stripped)
  if (positionalMatch) {
    const zoom = Number(positionalMatch[1])
    const lat = Number(positionalMatch[2])
    const lng = Number(positionalMatch[3])
    if (
      Number.isFinite(zoom) &&
      zoom >= MIN_ZOOM &&
      zoom <= MAX_ZOOM &&
      Number.isFinite(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      Number.isFinite(lng)
    ) {
      const draft = cloneFallbackState(fallback)
      draft.zoom = clampZoom(zoom)
      draft.lat = clampLat(lat)
      draft.lng = normalizeLng(lng)
      return draft
    }
    return null
  }

  const params = new URLSearchParams(stripped)
  const draft = cloneFallbackState(fallback)
  let recognizedCount = 0

  const zVal = parseFiniteNumber(params.get('z'))
  if (zVal !== null && zVal >= MIN_ZOOM && zVal <= MAX_ZOOM) {
    draft.zoom = clampZoom(zVal)
    recognizedCount += 1
  }

  const latVal = parseFiniteNumber(params.get('lat'))
  if (latVal !== null && latVal >= -90 && latVal <= 90) {
    draft.lat = clampLat(latVal)
    recognizedCount += 1
  }

  const lngVal = parseFiniteNumber(params.get('lng') ?? params.get('lon'))
  if (lngVal !== null) {
    draft.lng = normalizeLng(lngVal)
    recognizedCount += 1
  }

  for (const codec of HASH_FEATURE_CODECS) {
    const rawValue = params.get(codec.key)
    if (rawValue !== null && codec.parse(rawValue, draft)) {
      recognizedCount += 1
    }
  }

  if (recognizedCount === 0) {
    return null
  }

  const extraParams: Record<string, string> = { ...(draft.extraParams ?? {}) }
  let hasExtra = Object.keys(extraParams).length > 0
  for (const [key, value] of params.entries()) {
    if (!RESERVED_CORE_KEYS.has(key) && key.length > 0 && value.length > 0) {
      extraParams[key] = value
      hasExtra = true
    }
  }
  if (hasExtra) {
    draft.extraParams = extraParams
  }

  return draft
}

export function readStoredUrlHash(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : undefined,
): string | null {
  if (!storage) {
    return null
  }
  try {
    const value = storage.getItem(URL_HASH_STORAGE_KEY)
    return typeof value === 'string' && value.trim().length > 0 ? value : null
  } catch {
    return null
  }
}

export function writeUrlHashToStorage(
  hash: string,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : undefined,
): void {
  if (!storage) {
    return
  }
  try {
    storage.setItem(URL_HASH_STORAGE_KEY, hash)
  } catch {
    // Ignore storage quota or restricted browser context errors.
  }
}

export interface BrowserSyncTarget {
  location: Pick<Location, 'hash' | 'pathname' | 'search'>
  history: Pick<History, 'replaceState' | 'state'>
  localStorage: Pick<Storage, 'getItem' | 'setItem'>
}

// The stored copy leaves the month out: a returning visitor starts on the current month, and only
// an explicit link (hash) opens another one.
export function serializeStoredState(state: UrlHashState): string {
  const params = new URLSearchParams(serializeUrlHash(state).slice(1))
  params.delete('month')
  return `#${params.toString()}`
}

export function syncUrlHashAndStorage(
  state: UrlHashState,
  target: BrowserSyncTarget | undefined = typeof window !== 'undefined' ? window : undefined,
): string {
  const nextHash = serializeUrlHash(state)
  if (target) {
    if (target.location.hash !== nextHash) {
      try {
        target.history.replaceState(
          target.history.state,
          '',
          `${target.location.pathname}${target.location.search}${nextHash}`,
        )
      } catch {
        // Ignore restricted History API errors.
      }
    }
    writeUrlHashToStorage(serializeStoredState(state), target.localStorage)
  }
  return nextHash
}

export function resolveInitialUrlHashState(
  target: Pick<BrowserSyncTarget, 'location' | 'localStorage'> | undefined = typeof window !==
  'undefined'
    ? window
    : undefined,
  now: Date = new Date(),
): ResolvedInitialState {
  const defaults = createDefaultUrlHashState(now)
  if (!target) {
    return { state: defaults, source: 'default' }
  }

  // Keys missing from the hash or the stored state fall back to today's defaults
  const fromHash = parseUrlHash(target.location.hash, defaults)
  if (fromHash) {
    return { state: fromHash, source: 'hash' }
  }

  // Viewport, sensor, projection, orbits and region come back from storage; the month never does
  const storedHash = readStoredUrlHash(target.localStorage)
  if (storedHash) {
    const fromStorage = parseUrlHash(storedHash, defaults)
    if (fromStorage) {
      return {
        state: { ...fromStorage, selectedMonth: defaults.selectedMonth },
        source: 'storage',
      }
    }
  }

  return { state: defaults, source: 'default' }
}
