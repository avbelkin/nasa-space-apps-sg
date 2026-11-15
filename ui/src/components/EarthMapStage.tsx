import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, MultiLineString, Point, Polygon } from 'geojson'
import { LngLat, LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl'
import type {
  ErrorEvent,
  GeoJSONSource,
  LngLatLike,
  MapGeoJSONFeature,
  MapMovementEvent,
  PointLike,
  StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { FIRE_SPOT_COLORS, MARK_STROKE_COLOR, USER_LOCATION_COLORS } from '../data/dataPalette'
import type { ProjectionMode, SensorFilter } from '../data/mapTypes'
import {
  clampGeolocationTargetZoom,
  clampLat,
  clampZoom,
  DEFAULT_CENTER,
  DEFAULT_GEOLOCATION_MAX_ZOOM,
  DEFAULT_ZOOM,
  normalizeLng,
  shouldMoveOnInitialLocate,
  type MapViewportState,
} from '../state/urlHashState'
import {
  createNightLightsLayer,
  NIGHT_LIGHTS_LAYER_ID,
  type NightLightsLayerController,
} from '../utils/nightLightsLayer'
import {
  createSatelliteCloudLayer,
  SATELLITE_CLOUDS_LAYER_ID,
  type SatelliteCloudLayerController,
} from '../utils/satelliteCloudLayer'
import {
  createRainCloudLayer,
  RAIN_CLOUDS_LAYER_ID,
  type RainCloudLayerController,
} from '../utils/rainCloudLayer'
import {
  formatRainLookbackLabel,
  MAX_RAIN_LOOKBACK_MINUTES,
  RAIN_FADE_IN_START_ZOOM,
  RAIN_LOOKBACK_PRESETS,
  RAIN_TIME_STEP_MINUTES,
  snapRainLookbackMinutes,
  type RainLayerMetadata,
} from '../utils/rainCloudShader'
import {
  createGlobeHaloLayer,
  GLOBE_HALO_LAYER_ID,
  type GlobeHaloLayerController,
} from '../utils/globeHaloLayer'
import {
  createSpaceStarfieldController,
  DEFAULT_VERTICAL_FOV_DEG,
  type SpaceStarfieldController,
} from '../utils/spaceStarfield'
import {
  computeLiveOrbitalState,
  NADIR_SWATH_COLOR,
  NADIR_SWATH_FILL_OPACITY,
  NADIR_SWATH_STROKE_OPACITY,
  SATELLITE_TRACK_LAG_DASH_ARRAY,
  WIDE_SWATH_COLOR,
  WIDE_SWATH_DASH_ARRAY,
  WIDE_SWATH_FILL_OPACITY,
  WIDE_SWATH_STROKE_OPACITY,
  type LiveOrbitalState,
  type LiveSatelliteSnapshot,
  type SatelliteHudSection,
  type SatelliteOrbit,
} from '../utils/satelliteOrbits'
import {
  createSatelliteAnimationController,
  SATELLITE_ORBITS_SOURCE_ID,
  type SatelliteAnimationController,
} from '../utils/satelliteAnimation'
import {
  buildFireSpotsGeoJson,
  compareMatchedFireSpots,
  deduplicateSpotMatches,
  expandHoveredFireSpots,
  formatFireSpotsTooltip,
  MIN_FIRE_SPOT_ZOOM,
  type BuiltFireSpotsData,
  type FireSpotFeatureProperties,
  type FireSpotTooltipInput,
  type FirmsLiveSpotsResponse,
  type PhaseCohort,
} from '../utils/fireSpots'
import {
  buildFireSpotSourceData,
  diffFireSpotScreenColors,
  FIRE_SPOT_HIT_PADDING,
  readFireSpotScreenGroups,
  type FireSpotScreenGroup,
} from '../utils/fireSpotScreenGroups'
import type { SatelliteOverpassIndex } from '../utils/satelliteOverpassTimeline'
import {
  buildFireSpotLayers,
  buildFireSpotsCoreFilter,
  buildFireSpotsPulseFilter,
  createFireSpotsAnimationController,
  FIRMS_SPOTS_CORE_LAYER_ID,
  FIRMS_SPOTS_PULSE_LAYER_IDS,
  FIRMS_SPOTS_SOURCE_ID,
  setFireSpotSensorColors,
  type FireSpotsAnimationController,
} from '../utils/fireSpotsAnimation'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { FireDetectionPowerSummary, FireDetectionsTimelineCard } from './FireDetectionsTimelineCard'
import { FireHoverTooltip } from './FireHoverTooltip'
import { MapControls } from './MapControls'
import type { PinnedFireSelection } from './PinnedFireDetails'
import { SatelliteHud } from './SatelliteHud'

// Point MapLibre to the self-contained worker asset so Vite dev/prod bundling never breaks GeoJSON tiling.
setWorkerUrl(maplibreWorkerUrl)

export interface CameraFocusRequest {
  lng: number
  lat: number
  zoom: number
  animate: boolean
  requestId: number
}

// What the legend row outside the map needs to know about the user's location
export interface GeolocationLegendState {
  hasUserLocation: boolean
}

interface EarthMapStageProps {
  sensorFilter: SensorFilter
  colorFireSpotsBySensor: boolean
  projectionMode: ProjectionMode
  onProjectionModeChange: (next: ProjectionMode) => void
  initialViewport: MapViewportState
  onViewportChange: (next: MapViewportState) => void
  cameraFocusRequest: CameraFocusRequest | null
  autoLocateOnMount?: boolean
  geolocationMaxZoom?: number
  apiBaseUrl: string
  cloudsDisabled?: boolean
  showClouds: boolean
  onShowCloudsChange: (next: boolean) => void
  showRain: boolean
  onShowRainChange: (next: boolean) => void
  rainBackMinutes: number
  onRainBackMinutesChange: (next: number) => void
  rainMetadata: RainLayerMetadata | null
  onRainMetadataChange?: (metadata: RainLayerMetadata) => void
  showNightLights: boolean
  onShowNightLightsChange: (next: boolean) => void
  satellites: readonly SatelliteOrbit[]
  orbitalState: LiveOrbitalState
  pinnedFireSelection: PinnedFireSelection | null
  onPinFireSelection: (selection: PinnedFireSelection | null) => void
  overpassIndex: SatelliteOverpassIndex
  satelliteHudSection: SatelliteHudSection | null
  showOrbits: boolean
  onShowOrbitsChange: (next: boolean) => void
  selectedSatelliteId: string | null
  onSelectSatellite: (satellite: LiveSatelliteSnapshot) => void
  onGeolocationStateChange?: (state: GeolocationLegendState) => void
  onReducedMotionChange?: (reduced: boolean) => void
  fireSpotsPayload: FirmsLiveSpotsResponse | null
  showFires: boolean
  onShowFiresChange: (next: boolean) => void
  pulsePaused: boolean
  onPulsePausedChange: (next: boolean) => void
}

interface SatelliteMarkerEntry {
  marker: Marker
  button: HTMLButtonElement
  iconSvg: SVGSVGElement
  labelSpan: HTMLSpanElement
  lastColor: string
  lastAriaLabel: string
  lastBadgeText: string
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Syncs a satellite marker's `aria-pressed` state only when its selection changes. */
function syncSatelliteMarkerPressed(button: HTMLButtonElement, isSelected: boolean): void {
  const nextPressed = isSelected ? 'true' : 'false'
  if (button.getAttribute('aria-pressed') !== nextPressed) {
    button.setAttribute('aria-pressed', nextPressed)
  }
}

// The satellite pass card starts open only on a map at least this wide (in rem). Below that it
// starts folded: open, it covers a data mark at the default view (1024 px window) or a third of
// the map (phone). One click on its header opens it.
const WIDE_STAGE_MIN_REM = 48
const GEO_STATUS_TIMEOUT_MS = 8000

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

// MapLibre skips non-essential animations under this preference too; checking it here keeps that
// promise explicit for every camera move the app starts.
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function moveCamera(
  map: MapLibreMap,
  target: { center: LngLatLike; zoom: number },
  durationMs: number,
  mode: 'fly' | 'ease' = 'fly',
): void {
  if (prefersReducedMotion()) {
    map.jumpTo(target)
    return
  }
  if (mode === 'ease') {
    map.easeTo({ ...target, duration: durationMs })
    return
  }
  map.flyTo({ ...target, duration: durationMs })
}

const GEOLOCATION_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 300_000,
}

let inFlightGeolocationPromise: Promise<GeolocationPosition> | null = null

function requestCurrentBrowserPosition(options: PositionOptions): Promise<GeolocationPosition> {
  if (inFlightGeolocationPromise) {
    return inFlightGeolocationPromise
  }
  inFlightGeolocationPromise = new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  }).finally(() => {
    inFlightGeolocationPromise = null
  })
  return inFlightGeolocationPromise
}

function formatGeolocationError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (code === 1) {
      return 'Location access is blocked in this browser.'
    }
    if (code === 3) {
      return 'Finding your location took too long. Try again.'
    }
  }
  return 'Your location is not available right now.'
}

function buildUserLocationGeoJson(coords: [number, number] | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: coords
      ? [
          {
            type: 'Feature',
            id: 'user-location',
            geometry: {
              type: 'Point',
              coordinates: coords,
            },
            properties: {},
          },
        ]
      : [],
  }
}

function createSpacecraftIconSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 18 18')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('sat-marker-icon')

  const makeRect = (
    x: string,
    y: string,
    width: string,
    height: string,
    className: string,
    rx?: string,
  ) => {
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', x)
    rect.setAttribute('y', y)
    rect.setAttribute('width', width)
    rect.setAttribute('height', height)
    if (rx) {
      rect.setAttribute('rx', rx)
    }
    rect.classList.add(className)
    return rect
  }

  // Solar arrays (left & right wings) + center bus + sensor crossbar
  svg.append(
    makeRect('0', '7', '6.5', '4', 'sat-svg-wing', '0.5'),
    makeRect('11.5', '7', '6.5', '4', 'sat-svg-wing', '0.5'),
    makeRect('7.8', '3.5', '2.4', '11', 'sat-svg-body', '0.6'),
    makeRect('6.5', '8', '5', '1.8', 'sat-svg-body'),
  )
  return svg
}

const EMPTY_FIRE_SPOTS: BuiltFireSpotsData = {
  featureCollection: {
    type: 'FeatureCollection',
    features: [],
  },
  cohortAgeSeconds: [0, 0, 0, 0],
  cohortCounts: [0, 0, 0, 0],
  activeSpotCount: 0,
  referenceNowMs: 0,
  declutterGroupMembers: {
    harmonized: [],
    modis: [],
    viirs: [],
  },
}

function buildFireSpotFocusGeoJson(coords: [number, number] | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: coords ? [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {},
    }] : [],
  }
}

function setFireLayerVisibility(map: MapLibreMap, layerId: string, visible: boolean): void {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
  }
}

function toFireSpotTooltipInput(feature: MapGeoJSONFeature): FireSpotTooltipInput {
  const props = (feature.properties ?? {}) as Record<string, unknown>
  const coords = feature.geometry.type === 'Point' ? feature.geometry.coordinates : null
  const lng = coords && Number.isFinite(Number(coords[0])) ? Number(coords[0]) : undefined
  const lat = coords && Number.isFinite(Number(coords[1])) ? Number(coords[1]) : undefined
  const rawInstrument = String(props.instrument ?? '')

  return {
    lng,
    lat,
    timestamp: Number(props.timestamp ?? 0),
    frp: Number(props.frp ?? 0),
    brightnessK: props.brightnessK !== undefined ? Number(props.brightnessK) : undefined,
    confidence: props.confidence !== undefined ? Number(props.confidence) : undefined,
    instrument: rawInstrument === 'modis' ? 'modis' : 'viirs',
    source: String(props.source ?? ''),
    satellite: props.satellite !== undefined ? String(props.satellite) : undefined,
    dayNight: props.dayNight !== undefined ? String(props.dayNight) : undefined,
  }
}

function queryFireSelectionAtPoint(
  map: MapLibreMap,
  point: { x: number; y: number },
  sensorFilter: SensorFilter,
  builtFireSpots: BuiltFireSpotsData,
  screenGroups: ReadonlyMap<number, FireSpotScreenGroup> | undefined,
): PinnedFireSelection | null {
  if (map.getZoom() < MIN_FIRE_SPOT_ZOOM || !map.getLayer(FIRMS_SPOTS_CORE_LAYER_ID)) {
    return null
  }
  const bbox: [PointLike, PointLike] = [
    [point.x - FIRE_SPOT_HIT_PADDING, point.y - FIRE_SPOT_HIT_PADDING],
    [point.x + FIRE_SPOT_HIT_PADDING, point.y + FIRE_SPOT_HIT_PADDING],
  ]
  const rendered = map.queryRenderedFeatures(bbox, {
    layers: [FIRMS_SPOTS_CORE_LAYER_ID],
  })
  if (rendered.length === 0) {
    return null
  }

  const hitIndices: number[] = []
  const fallbackInputs: FireSpotTooltipInput[] = []
  for (const feature of rendered) {
    const props = (feature.properties ?? {}) as Record<string, unknown>
    const rawIdx = props.spotIndex !== undefined ? Number(props.spotIndex) : Number.NaN
    if (Number.isInteger(rawIdx) && rawIdx >= 0) {
      hitIndices.push(rawIdx)
    } else {
      fallbackInputs.push(toFireSpotTooltipInput(feature))
    }
  }

  // Use the same group as the map marker when several rendered dots hit the pointer box.
  const screenGroup = screenGroups?.get(hitIndices[0])
  const inputs = screenGroup?.detections ?? deduplicateSpotMatches([
    ...expandHoveredFireSpots(builtFireSpots, hitIndices, map.getZoom(), sensorFilter),
    ...fallbackInputs,
  ])
  if (inputs.length === 0) {
    return null
  }

  const sorted = [...inputs].sort(compareMatchedFireSpots)
  const topSpot = sorted[0]
  const anchorLngLat: [number, number] | null =
    topSpot && Number.isFinite(topSpot.lng) && Number.isFinite(topSpot.lat)
      ? [topSpot.lng!, topSpot.lat!]
      : null

  return {
    inputs,
    nowMs: Date.now(),
    anchorLngLat,
    sensorFilter,
  }
}

function createBaseStyle(
  projection: ProjectionMode,
  initialOrbitalState: LiveOrbitalState,
  initialUserData: FeatureCollection<Point>,
  initialLiveFiresData: FeatureCollection<Point, FireSpotFeatureProperties>,
  initialFocusData: FeatureCollection<Point>,
  initialSensorFilter: SensorFilter,
  initialShowLiveFires: boolean,
): StyleSpecification {
  return {
    version: 8,
    projection: { type: projection },
    sources: {
      'eox-s2cloudless': {
        type: 'raster',
        tiles: [
          'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
        ],
        tileSize: 256,
        maxzoom: 15,
      },
      [SATELLITE_ORBITS_SOURCE_ID]: {
        type: 'geojson',
        maxzoom: 12,
        data: initialOrbitalState.combinedGeoJson,
      },
      [FIRMS_SPOTS_SOURCE_ID]: {
        type: 'geojson',
        promoteId: 'spotIndex',
        data: initialLiveFiresData,
      },
      'fire-spot-focus': {
        type: 'geojson',
        data: initialFocusData,
      },
      'user-geolocation': {
        type: 'geojson',
        data: initialUserData,
      },
    },
    layers: [
      {
        id: 'basemap-layer',
        type: 'raster',
        source: 'eox-s2cloudless',
        // A quieter background, so warm marks do not sink into desert and savanna
        paint: {
          'raster-saturation': -0.5,
        },
      },
      // Dual instantaneous swaths in fixed hues (SWATH_COLORS in dataPalette.ts): the wide scan
      // swath underneath, the nadir swath on top
      {
        id: 'satellite-swaths-wide-fill',
        type: 'fill',
        source: SATELLITE_ORBITS_SOURCE_ID,
        filter: ['==', ['get', 'orbitalFeatureKind'], 'wide-swath'],
        paint: {
          'fill-color': WIDE_SWATH_COLOR,
          'fill-opacity': WIDE_SWATH_FILL_OPACITY,
        },
      },
      {
        id: 'satellite-swaths-wide-outline',
        type: 'line',
        source: SATELLITE_ORBITS_SOURCE_ID,
        filter: ['==', ['get', 'orbitalFeatureKind'], 'wide-swath'],
        paint: {
          'line-color': WIDE_SWATH_COLOR,
          'line-width': 1,
          'line-opacity': WIDE_SWATH_STROKE_OPACITY,
          'line-dasharray': WIDE_SWATH_DASH_ARRAY,
        },
      },
      {
        id: 'satellite-swaths-nadir-fill',
        type: 'fill',
        source: SATELLITE_ORBITS_SOURCE_ID,
        filter: ['==', ['get', 'orbitalFeatureKind'], 'nadir-swath'],
        paint: {
          'fill-color': NADIR_SWATH_COLOR,
          'fill-opacity': NADIR_SWATH_FILL_OPACITY,
        },
      },
      {
        id: 'satellite-swaths-nadir-outline',
        type: 'line',
        source: SATELLITE_ORBITS_SOURCE_ID,
        filter: ['==', ['get', 'orbitalFeatureKind'], 'nadir-swath'],
        paint: {
          'line-color': NADIR_SWATH_COLOR,
          'line-width': 1,
          'line-opacity': NADIR_SWATH_STROKE_OPACITY,
        },
      },
      {
        id: 'satellite-tracks-past-line',
        type: 'line',
        source: SATELLITE_ORBITS_SOURCE_ID,
        filter: ['==', ['get', 'orbitalFeatureKind'], 'past-track'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.2,
          'line-opacity': 0.75,
        },
      },
      {
        id: 'satellite-tracks-lag-line',
        type: 'line',
        source: SATELLITE_ORBITS_SOURCE_ID,
        filter: ['==', ['get', 'orbitalFeatureKind'], 'past-lag-track'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.2,
          'line-opacity': 0.9,
          'line-dasharray': SATELLITE_TRACK_LAG_DASH_ARRAY,
        },
      },
      ...buildFireSpotLayers(initialSensorFilter, initialShowLiveFires),
      {
        id: 'fire-spot-focus-ring',
        type: 'circle',
        source: 'fire-spot-focus',
        layout: {
          visibility: initialShowLiveFires ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': 14,
          'circle-color': FIRE_SPOT_COLORS.focusRing,
          'circle-opacity': ['step', ['zoom'], 0, 1, 0.12],
          'circle-stroke-width': 3,
          'circle-stroke-color': FIRE_SPOT_COLORS.focusRing,
          'circle-stroke-opacity': ['step', ['zoom'], 0, 1, 1],
        },
      },
      {
        id: 'satellite-positions-halo',
        type: 'circle',
        source: SATELLITE_ORBITS_SOURCE_ID,
        filter: ['==', ['get', 'orbitalFeatureKind'], 'position'],
        paint: {
          'circle-radius': 9,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.28,
          'circle-blur': 0.4,
        },
      },
      {
        id: 'satellite-positions-core',
        type: 'circle',
        source: SATELLITE_ORBITS_SOURCE_ID,
        filter: ['==', ['get', 'orbitalFeatureKind'], 'position'],
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': MARK_STROKE_COLOR,
        },
      },
      {
        id: 'user-geolocation-halo',
        type: 'circle',
        source: 'user-geolocation',
        paint: {
          'circle-radius': 14,
          'circle-color': USER_LOCATION_COLORS.halo,
          'circle-opacity': 0.3,
        },
      },
      {
        id: 'user-geolocation-dot',
        type: 'circle',
        source: 'user-geolocation',
        paint: {
          'circle-radius': 6,
          'circle-color': USER_LOCATION_COLORS.fill,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': USER_LOCATION_COLORS.ring,
        },
      },
    ],
  }
}

function setGeoJsonSourceData(
  map: MapLibreMap,
  sourceId: string,
  data: FeatureCollection<Point | MultiLineString | Polygon>,
): void {
  try {
    const source = map.getSource(sourceId) as GeoJSONSource | undefined
    if (source && typeof source.setData === 'function') {
      source.setData(data)
    }
  } catch {
    // Style still initializing: the 'style.load' handler applies the latest data.
  }
}

function syncOrbitalSources(map: MapLibreMap, state: LiveOrbitalState): void {
  setGeoJsonSourceData(map, SATELLITE_ORBITS_SOURCE_ID, state.combinedGeoJson)
}

function isMapStyleReady(map: MapLibreMap | null, styleReady = true): map is MapLibreMap {
  return Boolean(styleReady && map && map.getSource(FIRMS_SPOTS_SOURCE_ID))
}

export function EarthMapStage({
  sensorFilter,
  colorFireSpotsBySensor,
  projectionMode,
  onProjectionModeChange,
  initialViewport,
  onViewportChange,
  cameraFocusRequest,
  autoLocateOnMount = false,
  geolocationMaxZoom = DEFAULT_GEOLOCATION_MAX_ZOOM,
  apiBaseUrl,
  cloudsDisabled = false,
  showClouds,
  onShowCloudsChange,
  showRain,
  onShowRainChange,
  rainBackMinutes,
  onRainBackMinutesChange,
  rainMetadata,
  onRainMetadataChange,
  showNightLights,
  onShowNightLightsChange,
  satellites,
  orbitalState,
  pinnedFireSelection,
  onPinFireSelection,
  overpassIndex,
  satelliteHudSection,
  showOrbits,
  onShowOrbitsChange,
  selectedSatelliteId,
  onSelectSatellite,
  onGeolocationStateChange,
  onReducedMotionChange,
  fireSpotsPayload,
  showFires,
  onShowFiresChange,
  pulsePaused,
  onPulsePausedChange,
}: EarthMapStageProps) {
  const stageRef = useRef<HTMLElement | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const spaceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const starfieldControllerRef = useRef<SpaceStarfieldController | null>(null)
  const mapInstanceRef = useRef<MapLibreMap | null>(null)
  const nightLightsLayerRef = useRef<NightLightsLayerController | null>(null)
  const cloudLayerRef = useRef<SatelliteCloudLayerController | null>(null)
  const rainLayerRef = useRef<RainCloudLayerController | null>(null)
  const globeHaloLayerRef = useRef<GlobeHaloLayerController | null>(null)
  const rainSelectId = useId()
  const satMarkersRef = useRef<Map<string, SatelliteMarkerEntry>>(new Map())
  const initialViewportRef = useRef<MapViewportState>(initialViewport)
  const userInteractedRef = useRef(false)
  const latestOnViewportChangeRef = useRef(onViewportChange)
  const latestOnGeolocationStateChangeRef = useRef(onGeolocationStateChange)
  const isMountedRef = useRef(false)

  const [mapError, setMapError] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [geoErrorMessage, setGeoErrorMessage] = useState<string | null>(null)
  const [isStageWide, setIsStageWide] = useState(true)
  const [viewport, setViewport] = useState<MapViewportState>(() => ({
    lng: normalizeLng(initialViewport.lng),
    lat: clampLat(initialViewport.lat),
    zoom: clampZoom(initialViewport.zoom),
  }))

  const userLocationGeoJson = useMemo(
    () => buildUserLocationGeoJson(userLocation),
    [userLocation],
  )

  const latestUserGeoJsonRef = useRef(userLocationGeoJson)
  const latestProjectionRef = useRef(projectionMode)
  const latestApiBaseUrlRef = useRef(apiBaseUrl)
  const latestCloudsDisabledRef = useRef(cloudsDisabled)
  const latestShowCloudsRef = useRef(showClouds)
  const latestShowRainRef = useRef(showRain)
  const latestRainBackMinutesRef = useRef(rainBackMinutes)
  const latestOnRainMetadataChangeRef = useRef(onRainMetadataChange)
  const latestShowNightLightsRef = useRef(showNightLights)
  const latestSatellitesRef = useRef(satellites)
  const latestOrbitalStateRef = useRef(orbitalState)
  const latestShowOrbitsRef = useRef(showOrbits)
  const latestSelectedSatIdRef = useRef(selectedSatelliteId)
  const satAnimControllerRef = useRef<SatelliteAnimationController | null>(null)
  const onSelectSatelliteRef = useRef(onSelectSatellite)

  const hasLiveFires = fireSpotsPayload !== null

  const builtFireSpots = useMemo(
    () => (fireSpotsPayload ? buildFireSpotsGeoJson(fireSpotsPayload) : EMPTY_FIRE_SPOTS),
    [fireSpotsPayload],
  )

  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)
  const [hover, setHover] = useState<{
    selection: PinnedFireSelection
    data: BuiltFireSpotsData
    pointer: { x: number; y: number }
  } | null>(null)
  const visibleHover =
    showFires && hover?.data === builtFireSpots && hover.selection.sensorFilter === sensorFilter
      ? hover
      : null
  const hoveredSelection = visibleHover?.selection
  const hoverDetails = useMemo(
    () => hoveredSelection && formatFireSpotsTooltip(hoveredSelection.inputs, hoveredSelection.nowMs, {
      sensorFilter: hoveredSelection.sensorFilter,
      overpassIndex,
    }),
    [hoveredSelection, overpassIndex],
  )
  const focusSpotGeoJson = useMemo(
    () => buildFireSpotFocusGeoJson(pinnedFireSelection?.anchorLngLat ?? null),
    [pinnedFireSelection],
  )

  const latestBuiltFireSpotsRef = useRef(builtFireSpots)
  const latestShowFiresRef = useRef(showFires)
  const latestPulsePausedRef = useRef(pulsePaused)
  const latestFocusSpotGeoJsonRef = useRef(focusSpotGeoJson)
  const latestSensorFilterRef = useRef(sensorFilter)
  const latestFireSensorColorsRef = useRef(colorFireSpotsBySensor)
  const screenGroupsRef = useRef<ReadonlyMap<number, FireSpotScreenGroup> | undefined>(undefined)
  const screenGroupsDirtyRef = useRef(true)
  const onPinFireSelectionRef = useRef(onPinFireSelection)
  const latestOnReducedMotionChangeRef = useRef(onReducedMotionChange)
  const fireAnimControllerRef = useRef<FireSpotsAnimationController | null>(null)
  const firePointerCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    latestBuiltFireSpotsRef.current = builtFireSpots
    latestShowFiresRef.current = showFires
    latestPulsePausedRef.current = pulsePaused
    latestFocusSpotGeoJsonRef.current = focusSpotGeoJson
    latestSensorFilterRef.current = sensorFilter
  }, [
    builtFireSpots,
    showFires,
    pulsePaused,
    focusSpotGeoJson,
    sensorFilter,
  ])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (map) {
      map.getCanvas().style.cursor = ''
    }
  }, [builtFireSpots, sensorFilter, showFires])

  useEffect(() => {
    screenGroupsDirtyRef.current = true
    mapInstanceRef.current?.triggerRepaint()
  }, [builtFireSpots])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!isMapStyleReady(map)) {
      return
    }
    setGeoJsonSourceData(map, 'fire-spot-focus', focusSpotGeoJson)
  }, [focusSpotGeoJson])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!isMapStyleReady(map)) {
      return
    }
    setFireLayerVisibility(map, FIRMS_SPOTS_CORE_LAYER_ID, showFires)
    for (const layerId of FIRMS_SPOTS_PULSE_LAYER_IDS) {
      setFireLayerVisibility(map, layerId, showFires)
    }
    setFireLayerVisibility(map, 'fire-spot-focus-ring', showFires)
    if (!showFires) {
      map.getCanvas().style.cursor = ''
    }
    fireAnimControllerRef.current?.sync()
  }, [showFires])

  useEffect(() => {
    fireAnimControllerRef.current?.sync()
  }, [pulsePaused])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!isMapStyleReady(map)) {
      return
    }
    if (map.getLayer(FIRMS_SPOTS_CORE_LAYER_ID)) {
      map.setFilter(FIRMS_SPOTS_CORE_LAYER_ID, buildFireSpotsCoreFilter(sensorFilter))
    }
    for (let idx = 0; idx < FIRMS_SPOTS_PULSE_LAYER_IDS.length; idx++) {
      const layerId = FIRMS_SPOTS_PULSE_LAYER_IDS[idx]
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, buildFireSpotsPulseFilter(sensorFilter, idx as PhaseCohort))
      }
    }
    fireAnimControllerRef.current?.sync()
  }, [sensorFilter])

  useEffect(() => {
    latestFireSensorColorsRef.current = colorFireSpotsBySensor
    screenGroupsDirtyRef.current = true
    const map = mapInstanceRef.current
    if (isMapStyleReady(map)) {
      setFireSpotSensorColors(map, colorFireSpotsBySensor)
    }
  }, [colorFireSpotsBySensor])

  useEffect(() => {
    screenGroupsDirtyRef.current = true
  }, [projectionMode, showFires])

  useEffect(() => {
    latestOnReducedMotionChangeRef.current = onReducedMotionChange
  }, [onReducedMotionChange])

  useEffect(() => {
    onPinFireSelectionRef.current = onPinFireSelection
  }, [onPinFireSelection])

  useEffect(() => {
    latestOnReducedMotionChangeRef.current?.(reducedMotion)
  }, [reducedMotion])

  useEffect(() => {
    latestOnViewportChangeRef.current = onViewportChange
  }, [onViewportChange])

  // A new function on every App render: keep it out of the orbit sync effect's dependencies
  useEffect(() => {
    onSelectSatelliteRef.current = onSelectSatellite
  }, [onSelectSatellite])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }
    const update = () => {
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setIsStageWide(stage.getBoundingClientRect().width >= WIDE_STAGE_MIN_REM * rootFontSize)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    latestOnGeolocationStateChangeRef.current = onGeolocationStateChange
  }, [onGeolocationStateChange])

  useEffect(() => {
    latestOnGeolocationStateChangeRef.current?.({ hasUserLocation: userLocation !== null })
  }, [userLocation])

  useEffect(() => {
    if (!geoErrorMessage) {
      return
    }
    const timer = window.setTimeout(() => setGeoErrorMessage(null), GEO_STATUS_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [geoErrorMessage])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const syncSatelliteMarkers = (
    map: MapLibreMap,
    snapshots: readonly LiveSatelliteSnapshot[],
    orbitsVisible: boolean,
    activeSatId: string | null,
  ) => {
    const entries = satMarkersRef.current

    if (!orbitsVisible || snapshots.length === 0) {
      for (const entry of entries.values()) {
        entry.marker.remove()
      }
      entries.clear()
      return
    }

    const activeIds = new Set(snapshots.map((sat) => sat.id))
    for (const [id, entry] of entries) {
      if (!activeIds.has(id)) {
        entry.marker.remove()
        entries.delete(id)
      }
    }

    for (const sat of snapshots) {
      let entry = entries.get(sat.id)
      if (!entry) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'sat-marker-badge'
        button.dataset.satId = sat.id

        const iconSvg = createSpacecraftIconSvg()
        const labelSpan = document.createElement('span')
        labelSpan.className = 'sat-marker-label'

        button.append(iconSvg, labelSpan)
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          userInteractedRef.current = true
          const current = latestOrbitalStateRef.current.snapshots.find((item) => item.id === sat.id)
          if (current) {
            onSelectSatelliteRef.current(current)
          }
        })

        const marker = new Marker({
          element: button,
          anchor: 'left',
          offset: [10, 0],
          subpixelPositioning: true,
          opacityWhenCovered: '0.12',
        })
          .setLngLat([sat.lng, sat.lat])
          .addTo(map)

        entry = {
          marker,
          button,
          iconSvg,
          labelSpan,
          lastColor: '',
          lastAriaLabel: '',
          lastBadgeText: '',
        }
        entries.set(sat.id, entry)
      }

      entry.marker.setLngLat([sat.lng, sat.lat])
      entry.iconSvg.style.rotate = `${sat.headingDeg.toFixed(2)}deg`

      if (entry.lastColor !== sat.color) {
        entry.button.style.setProperty('--sat-color', sat.color)
        entry.lastColor = sat.color
      }

      syncSatelliteMarkerPressed(entry.button, activeSatId === sat.id)

      const nextAriaLabel = `Show ${sat.name} (${sat.instrumentLabel}), now at latitude ${sat.lat.toFixed(1)}, longitude ${sat.lng.toFixed(1)}`
      if (entry.lastAriaLabel !== nextAriaLabel) {
        entry.button.setAttribute('aria-label', nextAriaLabel)
        entry.lastAriaLabel = nextAriaLabel
      }

      const nextBadgeText = `${sat.glyph} ${sat.shortBadge}`
      if (entry.lastBadgeText !== nextBadgeText) {
        entry.labelSpan.textContent = nextBadgeText
        entry.lastBadgeText = nextBadgeText
      }
    }
  }

  useEffect(() => {
    const canvas = spaceCanvasRef.current
    if (!canvas) {
      return
    }
    const controller = createSpaceStarfieldController({
      canvas,
      initialPose: {
        lngDeg: initialViewportRef.current.lng,
        latDeg: initialViewportRef.current.lat,
        bearingDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        zoom: initialViewportRef.current.zoom,
        fovDeg: DEFAULT_VERTICAL_FOV_DEG,
        unixMs: Date.now(),
        isGlobe: latestProjectionRef.current === 'globe',
      },
    })
    starfieldControllerRef.current = controller
    return () => {
      controller.dispose()
      starfieldControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) {
      return
    }

    let map: MapLibreMap | null = null
    let resizeObserver: ResizeObserver | null = null
    const startViewport = initialViewportRef.current

    try {
      map = new MapLibreMap({
        container,
        style: createBaseStyle(
          latestProjectionRef.current,
          latestOrbitalStateRef.current,
          latestUserGeoJsonRef.current,
          latestBuiltFireSpotsRef.current.featureCollection,
          latestFocusSpotGeoJsonRef.current,
          latestSensorFilterRef.current,
          latestShowFiresRef.current,
        ),
        center: [normalizeLng(startViewport.lng), clampLat(startViewport.lat)],
        zoom: clampZoom(startViewport.zoom),
        cancelPendingTileRequestsWhileZooming: false,
        maxTileCacheZoomLevels: 8,
        attributionControl: false,
      })

      mapInstanceRef.current = map

      const getScreenGroups = () =>
        latestFireSensorColorsRef.current
          ? screenGroupsRef.current
          : undefined

      const canvas = map.getCanvas()
      const handleCanvasMouseLeave = () => {
        canvas.style.cursor = ''
        setHover(null)
      }
      canvas.addEventListener('mouseleave', handleCanvasMouseLeave)
      firePointerCleanupRef.current = () => {
        canvas.removeEventListener('mouseleave', handleCanvasMouseLeave)
      }

      map.on('mousemove', (event) => {
        if (!map || !latestShowFiresRef.current || map.isMoving() || map.isZooming() || map.isRotating()) {
          return
        }
        if (latestBuiltFireSpotsRef.current.featureCollection.features.length === 0) {
          return
        }
        const hit = queryFireSelectionAtPoint(
          map,
          event.point,
          latestSensorFilterRef.current,
          latestBuiltFireSpotsRef.current,
          getScreenGroups(),
        )
        map.getCanvas().style.cursor = hit ? 'pointer' : ''
        const { clientX, clientY } = event.originalEvent
        setHover(hit ? {
          selection: hit,
          data: latestBuiltFireSpotsRef.current,
          pointer: { x: clientX, y: clientY },
        } : null)
      })

      map.on('click', (event) => {
        if (!map || !latestShowFiresRef.current) {
          return
        }
        const hit = queryFireSelectionAtPoint(
          map,
          event.point,
          latestSensorFilterRef.current,
          latestBuiltFireSpotsRef.current,
          getScreenGroups(),
        )
        if (hit) {
          userInteractedRef.current = true
          onPinFireSelectionRef.current(hit)
        }
      })

      map.on('movestart', (event: MapMovementEvent) => {
        handleCanvasMouseLeave()
        if (event.originalEvent) {
          userInteractedRef.current = true
        }
      })

      map.on('moveend', () => {
        screenGroupsDirtyRef.current = true
        if (!map) {
          return
        }
        const wrapped = map.getCenter().wrap()
        const nextViewport: MapViewportState = {
          lng: normalizeLng(wrapped.lng),
          lat: clampLat(wrapped.lat),
          zoom: clampZoom(map.getZoom()),
        }
        setViewport(nextViewport)
        latestOnViewportChangeRef.current(nextViewport)
      })

      let styleLoaded = false
      let fireSourceData: BuiltFireSpotsData | undefined
      // The style is parsed and its sources exist: re-apply whatever changed while it loaded,
      // without waiting for 'load' (which also waits for every basemap tile).
      map.once('style.load', () => {
        styleLoaded = true
        if (!map) {
          return
        }
        const activeMap = map
        if (!activeMap.getLayer(GLOBE_HALO_LAYER_ID)) {
          const globeHaloLayer = createGlobeHaloLayer()
          globeHaloLayerRef.current = globeHaloLayer
          // Render atmospheric limb glow above clouds/surface and below satellite swaths/tracks.
          activeMap.addLayer(globeHaloLayer, 'satellite-swaths-wide-fill')
        }
        setGeoJsonSourceData(activeMap, 'user-geolocation', latestUserGeoJsonRef.current)
        activeMap.setProjection({ type: latestProjectionRef.current })
        satAnimControllerRef.current?.dispose()
        satAnimControllerRef.current = createSatelliteAnimationController({
          map: activeMap,
          getSatellites: () => latestSatellitesRef.current,
          getSensorFilter: () => latestSensorFilterRef.current,
          isOrbitsVisible: () => latestShowOrbitsRef.current,
          onApplyOrbitalGeoJson: (state) => {
            latestOrbitalStateRef.current = state
            syncOrbitalSources(activeMap, state)
          },
          onCommitMarkers: (snapshots, visible) => {
            syncSatelliteMarkers(activeMap, snapshots, visible, latestSelectedSatIdRef.current)
          },
        })
        satAnimControllerRef.current.syncNow()
        screenGroupsDirtyRef.current = true
        setGeoJsonSourceData(map, 'fire-spot-focus', latestFocusSpotGeoJsonRef.current)
        if (map.getLayer(FIRMS_SPOTS_CORE_LAYER_ID)) {
          setFireLayerVisibility(map, FIRMS_SPOTS_CORE_LAYER_ID, latestShowFiresRef.current)
          map.setFilter(
            FIRMS_SPOTS_CORE_LAYER_ID,
            buildFireSpotsCoreFilter(latestSensorFilterRef.current),
          )
        }
        for (let idx = 0; idx < FIRMS_SPOTS_PULSE_LAYER_IDS.length; idx++) {
          const layerId = FIRMS_SPOTS_PULSE_LAYER_IDS[idx]
          if (map.getLayer(layerId)) {
            setFireLayerVisibility(map, layerId, latestShowFiresRef.current)
            map.setFilter(
              layerId,
              buildFireSpotsPulseFilter(latestSensorFilterRef.current, idx as PhaseCohort),
            )
          }
        }
        setFireLayerVisibility(map, 'fire-spot-focus-ring', latestShowFiresRef.current)
        setFireSpotSensorColors(map, latestFireSensorColorsRef.current)

        fireAnimControllerRef.current?.dispose()
        fireAnimControllerRef.current = createFireSpotsAnimationController({
          map,
          getCohortAgeSeconds: () => latestBuiltFireSpotsRef.current.cohortAgeSeconds,
          getReferenceNowMs: () => latestBuiltFireSpotsRef.current.referenceNowMs,
          getActiveSpotCount: () => latestBuiltFireSpotsRef.current.activeSpotCount,
          isVisible: () => latestShowFiresRef.current,
          isPaused: () => latestPulsePausedRef.current,
          onReducedMotionChange: setReducedMotion,
        })

        // Night lights and clouds sit above the basemap and below swaths, tracks and data marks
        // (night lights under clouds). Added after the marks, so a WebGL2 layer failure cannot
        // keep the marks off the map.
        if (!map.getLayer(NIGHT_LIGHTS_LAYER_ID)) {
          try {
            const nightLightsLayer = createNightLightsLayer({
              initialVisible: latestShowNightLightsRef.current,
            })
            map.addLayer(nightLightsLayer, 'satellite-swaths-wide-fill')
            nightLightsLayerRef.current = nightLightsLayer
          } catch {
            nightLightsLayerRef.current = null
          }
        }

        if (!map.getLayer(SATELLITE_CLOUDS_LAYER_ID)) {
          try {
            const cloudLayer = createSatelliteCloudLayer({
              apiBaseUrl: latestApiBaseUrlRef.current,
              disabled: latestCloudsDisabledRef.current,
              initialVisible: latestShowCloudsRef.current,
            })
            map.addLayer(cloudLayer, 'satellite-swaths-wide-fill')
            cloudLayerRef.current = cloudLayer
          } catch {
            cloudLayerRef.current = null
          }
        }

        if (!map.getLayer(RAIN_CLOUDS_LAYER_ID)) {
          try {
            const rainLayer = createRainCloudLayer({
              initialVisible: latestShowRainRef.current,
              initialLookbackMinutes: latestRainBackMinutesRef.current,
              onMetadataChange: (metadata) => latestOnRainMetadataChangeRef.current?.(metadata),
            })
            map.addLayer(rainLayer, 'satellite-swaths-wide-fill')
            rainLayerRef.current = rainLayer
          } catch {
            rainLayerRef.current = null
          }
        }

        if (!map.getLayer(GLOBE_HALO_LAYER_ID)) {
          try {
            const globeHaloLayer = createGlobeHaloLayer()
            map.addLayer(globeHaloLayer, 'satellite-swaths-wide-fill')
            globeHaloLayerRef.current = globeHaloLayer
          } catch {
            globeHaloLayerRef.current = null
          }
        }
      })

      map.on('render', () => {
        if (!map) {
          return
        }
        if (screenGroupsDirtyRef.current && styleLoaded && !map.isMoving()) {
          screenGroupsDirtyRef.current = false
          const data = latestBuiltFireSpotsRef.current
          const next = latestFireSensorColorsRef.current && latestShowFiresRef.current &&
            map.getZoom() >= MIN_FIRE_SPOT_ZOOM
            ? readFireSpotScreenGroups(map, data)
            : undefined
          const source = map.getSource<GeoJSONSource>(FIRMS_SPOTS_SOURCE_ID)
          if (fireSourceData !== data) {
            void source?.setData(buildFireSpotSourceData(data, next))
            fireSourceData = data
          } else {
            const update = diffFireSpotScreenColors(screenGroupsRef.current, next)
            if (update.length > 0) {
              void source?.updateData({ update })
            }
          }
          screenGroupsRef.current = next
        }
        const center = map.getCenter()
        starfieldControllerRef.current?.updateCamera({
          lngDeg: center.lng,
          latDeg: center.lat,
          bearingDeg: map.getBearing(),
          pitchDeg: map.getPitch(),
          rollDeg: map.getRoll(),
          zoom: map.getZoom(),
          fovDeg: map.getVerticalFieldOfView(),
          unixMs: Date.now(),
          isGlobe: latestProjectionRef.current === 'globe',
        })
      })

      map.on('error', (event: ErrorEvent & { sourceId?: string; tile?: unknown }) => {
        const message = event.error instanceof Error ? event.error.message : null
        // Errors scoped to a source or tile (e.g. a basemap tile 404/abort) are routine, whatever
        // their message says; worker and WebGL failures arrive unscoped.
        const isSourceScoped = event.sourceId !== undefined || event.tile !== undefined
        const isFatal =
          !isSourceScoped && ((message !== null && /webgl|worker/i.test(message)) || !styleLoaded)
        if (isFatal) {
          setMapError(message ?? 'Map style failed to load.')
        }
      })

      resizeObserver = new ResizeObserver(() => {
        screenGroupsDirtyRef.current = true
        map?.resize()
      })
      resizeObserver.observe(container)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to initialize MapLibre WebGL canvas.'
      queueMicrotask(() => setMapError(message))
    }

    const markerMap = satMarkersRef.current
    return () => {
      satAnimControllerRef.current?.dispose()
      satAnimControllerRef.current = null
      fireAnimControllerRef.current?.dispose()
      fireAnimControllerRef.current = null
      firePointerCleanupRef.current?.()
      firePointerCleanupRef.current = null
      for (const entry of markerMap.values()) {
        entry.marker.remove()
      }
      markerMap.clear()
      resizeObserver?.disconnect()
      map?.remove()
      nightLightsLayerRef.current = null
      cloudLayerRef.current = null
      rainLayerRef.current = null
      globeHaloLayerRef.current = null
      mapInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    latestUserGeoJsonRef.current = userLocationGeoJson
    const map = mapInstanceRef.current
    if (map) {
      setGeoJsonSourceData(map, 'user-geolocation', userLocationGeoJson)
    }
  }, [userLocationGeoJson])

  useEffect(() => {
    latestSatellitesRef.current = satellites
    latestSensorFilterRef.current = sensorFilter
    latestShowOrbitsRef.current = showOrbits

    if (satAnimControllerRef.current) {
      satAnimControllerRef.current.syncNow()
    } else {
      latestOrbitalStateRef.current = computeLiveOrbitalState(
        satellites,
        sensorFilter,
        Date.now(),
        showOrbits,
      )
    }
  }, [satellites, sensorFilter, showOrbits])

  useEffect(() => {
    latestSelectedSatIdRef.current = selectedSatelliteId
    for (const [id, entry] of satMarkersRef.current) {
      syncSatelliteMarkerPressed(entry.button, selectedSatelliteId === id)
    }
  }, [selectedSatelliteId])

  useEffect(() => {
    latestShowCloudsRef.current = showClouds
    latestCloudsDisabledRef.current = cloudsDisabled
    const cloudLayer = cloudLayerRef.current
    if (!cloudLayer) {
      return
    }
    cloudLayer.setDisabled(cloudsDisabled)
    cloudLayer.setVisible(showClouds)
  }, [showClouds, cloudsDisabled])

  useEffect(() => {
    latestOnRainMetadataChangeRef.current = onRainMetadataChange
  }, [onRainMetadataChange])

  useEffect(() => {
    latestShowRainRef.current = showRain
    rainLayerRef.current?.setVisible(showRain)
  }, [showRain])

  useEffect(() => {
    latestRainBackMinutesRef.current = rainBackMinutes
    rainLayerRef.current?.setLookbackMinutes(rainBackMinutes)
  }, [rainBackMinutes])

  useEffect(() => {
    latestShowNightLightsRef.current = showNightLights
    nightLightsLayerRef.current?.setVisible(showNightLights)
  }, [showNightLights])

  useEffect(() => {
    latestProjectionRef.current = projectionMode
    const map = mapInstanceRef.current
    if (!map) {
      return
    }
    // Not gated on isStyleLoaded(): that also waits for every tile, so it stays false right after
    // a projection change and the next switch would be dropped. setProjection only needs the
    // parsed style; before that it throws and the 'style.load' handler applies latestProjectionRef.
    try {
      map.setProjection({ type: projectionMode })
    } catch {
      // Style not parsed yet
    }
  }, [projectionMode])

  useEffect(() => {
    if (!cameraFocusRequest) {
      return
    }
    userInteractedRef.current = true
    const map = mapInstanceRef.current
    if (!map) {
      const nextViewport: MapViewportState = {
        lng: normalizeLng(cameraFocusRequest.lng),
        lat: clampLat(cameraFocusRequest.lat),
        zoom: clampZoom(cameraFocusRequest.zoom),
      }
      queueMicrotask(() => {
        setViewport(nextViewport)
        latestOnViewportChangeRef.current(nextViewport)
      })
      return
    }

    const target = {
      center: [cameraFocusRequest.lng, cameraFocusRequest.lat] as [number, number],
      zoom: cameraFocusRequest.zoom,
    }
    if (cameraFocusRequest.animate) {
      moveCamera(map, target, 900)
    } else {
      map.jumpTo(target)
    }
  }, [cameraFocusRequest])

  const runGeolocation = useCallback(
    (mode: 'initial' | 'manual', isCancelled?: () => boolean) => {
      const isManual = mode === 'manual'
      if (isManual) {
        userInteractedRef.current = true
      }

      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        if (isManual) {
          setGeoErrorMessage('Your browser cannot share your location.')
        }
        return
      }

      if (isManual) {
        setIsLocating(true)
        setGeoErrorMessage(null)
      }

      void requestCurrentBrowserPosition(GEOLOCATION_POSITION_OPTIONS)
        .then((position) => {
          if (!isMountedRef.current || isCancelled?.()) {
            return
          }

          const lng = normalizeLng(position.coords.longitude)
          const lat = clampLat(position.coords.latitude)
          setUserLocation([lng, lat])
          if (isManual) {
            setGeoErrorMessage(null)
          }

          const map = mapInstanceRef.current

          if (!isManual) {
            if (userInteractedRef.current) {
              return
            }
            const startCenter: [number, number] = [
              normalizeLng(initialViewportRef.current.lng),
              clampLat(initialViewportRef.current.lat),
            ]
            if (!shouldMoveOnInitialLocate([lng, lat], startCenter)) {
              return
            }
            if (!map) {
              const nextViewport: MapViewportState = {
                lng,
                lat,
                zoom: clampZoom(initialViewportRef.current.zoom),
              }
              setViewport(nextViewport)
              latestOnViewportChangeRef.current(nextViewport)
              return
            }
            moveCamera(
              map,
              { center: [lng, lat], zoom: clampZoom(map.getZoom()) },
              900,
              'ease',
            )
            return
          }

          if (!map) {
            const targetZoom = clampGeolocationTargetZoom(geolocationMaxZoom, geolocationMaxZoom)
            const nextViewport: MapViewportState = { lng, lat, zoom: targetZoom }
            setViewport(nextViewport)
            latestOnViewportChangeRef.current(nextViewport)
            return
          }

          const safeRadius =
            Number.isFinite(position.coords.accuracy) && position.coords.accuracy > 0
              ? position.coords.accuracy
              : 100
          const fitted = map.cameraForBounds(
            LngLatBounds.fromLngLat(new LngLat(lng, lat), safeRadius),
            {
              maxZoom: geolocationMaxZoom,
              padding: 40,
            },
          )
          const targetZoom = clampGeolocationTargetZoom(fitted?.zoom, geolocationMaxZoom)
          moveCamera(map, { center: fitted?.center ?? [lng, lat], zoom: targetZoom }, 900, 'fly')
        })
        .catch((error: unknown) => {
          if (!isMountedRef.current || isCancelled?.()) {
            return
          }
          if (isManual) {
            setGeoErrorMessage(formatGeolocationError(error))
          }
        })
        .finally(() => {
          if (isManual && isMountedRef.current && !isCancelled?.()) {
            setIsLocating(false)
          }
        })
    },
    [geolocationMaxZoom],
  )

  useEffect(() => {
    if (!autoLocateOnMount) {
      return
    }
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        runGeolocation('initial', () => cancelled)
      }
    })
    return () => {
      cancelled = true
    }
  }, [autoLocateOnMount, runGeolocation])

  const handleZoom = (delta: number) => {
    userInteractedRef.current = true
    const map = mapInstanceRef.current
    if (!map) {
      const nextViewport: MapViewportState = {
        ...viewport,
        zoom: clampZoom(viewport.zoom + delta),
      }
      setViewport(nextViewport)
      latestOnViewportChangeRef.current(nextViewport)
      return
    }
    map.zoomTo(map.getZoom() + delta, { duration: prefersReducedMotion() ? 0 : 250 })
  }

  const handleResetView = () => {
    userInteractedRef.current = true
    const map = mapInstanceRef.current
    if (!map) {
      const nextViewport: MapViewportState = {
        lng: DEFAULT_CENTER[0],
        lat: DEFAULT_CENTER[1],
        zoom: DEFAULT_ZOOM,
      }
      setViewport(nextViewport)
      latestOnViewportChangeRef.current(nextViewport)
      return
    }
    moveCamera(map, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM }, 600)
  }

  const snappedRainBack = snapRainLookbackMinutes(rainBackMinutes)
  const canStepRainOlder = snappedRainBack < MAX_RAIN_LOOKBACK_MINUTES
  const canStepRainNewer = snappedRainBack > 0
  const effectiveUtcHhMm = rainMetadata?.effectiveTimeIso
    ? `${rainMetadata.effectiveTimeIso.slice(11, 16)}Z`
    : null
  const showRainTimeBar =
    showRain && (viewport.zoom > RAIN_FADE_IN_START_ZOOM || snappedRainBack > 0)
  const rainOffsetOptions = useMemo(() => {
    const hasExactPreset = RAIN_LOOKBACK_PRESETS.some(
      (preset) => preset.minutes === snappedRainBack,
    )
    if (hasExactPreset) {
      return RAIN_LOOKBACK_PRESETS
    }
    return [
      ...RAIN_LOOKBACK_PRESETS,
      {
        minutes: snappedRainBack,
        label: formatRainLookbackLabel(snappedRainBack),
      },
    ].sort((a, b) => a.minutes - b.minutes)
  }, [snappedRainBack])

  // HUD before the canvas in DOM order, so Tab reaches the map controls before MapLibre's own.
  return (
    <main ref={stageRef} className="map-stage" aria-label="Fire activity map">
      <MapControls
        onZoomIn={() => handleZoom(1)}
        onZoomOut={() => handleZoom(-1)}
        onLocate={() => runGeolocation('manual')}
        isLocating={isLocating}
        geoErrorMessage={geoErrorMessage}
        onResetView={handleResetView}
        projectionMode={projectionMode}
        onProjectionModeChange={onProjectionModeChange}
        showOrbits={showOrbits}
        onShowOrbitsChange={onShowOrbitsChange}
        showClouds={showClouds}
        onShowCloudsChange={onShowCloudsChange}
        showRain={showRain}
        onShowRainChange={onShowRainChange}
        showNightLights={showNightLights}
        onShowNightLightsChange={onShowNightLightsChange}
        showFires={showFires}
        onShowFiresChange={(next) => {
          if (!next) {
            setHover(null)
          }
          onShowFiresChange(next)
        }}
        showPulseToggle={hasLiveFires && showFires && !reducedMotion}
        pulsePaused={pulsePaused}
        onPulsePausedChange={onPulsePausedChange}
      />

      {showRainTimeBar && (
        <div className="map-hud map-hud-rain-time" role="group" aria-label="Rain cloud time">
          <button
            type="button"
            className="hud-btn hud-icon-btn hud-rain-step-btn"
            aria-label="Step rain back 30 minutes"
            title="Older (-30m)"
            aria-disabled={!canStepRainOlder}
            onClick={() => {
              if (canStepRainOlder) {
                onRainBackMinutesChange(snappedRainBack + RAIN_TIME_STEP_MINUTES)
              }
            }}
          >
            <ChevronLeftIcon />
          </button>
          <label htmlFor={rainSelectId} className="visually-hidden">
            Rain observation time
          </label>
          <select
            id={rainSelectId}
            className="hud-rain-select"
            value={snappedRainBack}
            onChange={(event) => {
              onRainBackMinutesChange(snapRainLookbackMinutes(Number(event.target.value)))
            }}
          >
            {rainOffsetOptions.map((option) => (
              <option key={option.minutes} value={option.minutes}>
                {option.minutes === snappedRainBack && effectiveUtcHhMm
                  ? `${option.label} · ${effectiveUtcHhMm}`
                  : option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="hud-btn hud-icon-btn hud-rain-step-btn"
            aria-label="Step rain forward 30 minutes"
            title="Newer (+30m)"
            aria-disabled={!canStepRainNewer}
            onClick={() => {
              if (canStepRainNewer) {
                onRainBackMinutesChange(Math.max(0, snappedRainBack - RAIN_TIME_STEP_MINUTES))
              }
            }}
          >
            <ChevronRightIcon />
          </button>
        </div>
      )}

      {satelliteHudSection && (
        <div className="map-hud-bottom">
          <SatelliteHud section={satelliteHudSection} defaultOpen={isStageWide} />
        </div>
      )}

      {visibleHover && hoverDetails?.timeline && (
        <FireHoverTooltip pointer={visibleHover.pointer}>
          <div className="fire-hover-summary">
            <strong>{hoverDetails.header}</strong>
            {visibleHover.selection.anchorLngLat && (
              <span>
                Lat {visibleHover.selection.anchorLngLat[1].toFixed(3)}&deg;, lon{' '}
                {visibleHover.selection.anchorLngLat[0].toFixed(3)}&deg;
              </span>
            )}
            <FireDetectionPowerSummary timeline={hoverDetails.timeline} />
          </div>
          <FireDetectionsTimelineCard timeline={hoverDetails.timeline} interactive={false} />
          <p>Click spot to pin details</p>
        </FireHoverTooltip>
      )}

      <canvas ref={spaceCanvasRef} className="space-backdrop-canvas" aria-hidden="true" />
      <div ref={mapContainerRef} className="map-canvas" />

      {mapError && (
        <div className="map-fallback-banner" role="status" title={mapError}>
          <p>This browser could not draw the fire and satellite layers on the map.</p>
        </div>
      )}
    </main>
  )
}
