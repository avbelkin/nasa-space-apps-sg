import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, MultiLineString, Point, Polygon } from 'geojson'
import { LngLat, LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl'
import type {
  ErrorEvent,
  GeoJSONSource,
  MapGeoJSONFeature,
  MapMovementEvent,
  PointLike,
  StyleSpecification,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  buildStubGeoJson,
  MONTH_LABELS,
  type ProjectionMode,
  type SensorFilter,
  type ViewMode,
} from '../data/stubSeasonalData'
import {
  clampGeolocationTargetZoom,
  clampLat,
  clampZoom,
  DEFAULT_CENTER,
  DEFAULT_GEOLOCATION_MAX_ZOOM,
  DEFAULT_ZOOM,
  normalizeLng,
  type MapViewportState,
} from '../state/urlHashState'
import {
  createSatelliteCloudLayer,
  SATELLITE_CLOUDS_LAYER_ID,
  type SatelliteCloudLayerController,
} from '../utils/satelliteCloudLayer'
import type { LiveOrbitalState, LiveSatelliteSnapshot } from '../utils/satelliteOrbits'
import {
  buildFireSpotsGeoJson,
  compareMatchedFireSpots,
  formatFireSpotsTooltip,
  type BuiltFireSpotsData,
  type FireSpotFeatureProperties,
  type FireSpotTooltipInput,
  type FirmsLiveSpotsResponse,
  type FormattedFireSpotsTooltip,
  type PhaseCohort,
} from '../utils/fireSpots'
import {
  buildFireSpotLayers,
  buildFireSpotsCoreFilter,
  buildFireSpotsPulseFilter,
  createFireSpotsAnimationController,
  FIRMS_SPOTS_CORE_LAYER_ID,
  FIRMS_SPOTS_PULSE_LAYER_IDS,
  FIRMS_SPOTS_SOURCE_ID,
  getFireSpotColorExpression,
  type FireSpotsAnimationController,
} from '../utils/fireSpotsAnimation'

export interface CameraFocusRequest {
  lng: number
  lat: number
  zoom: number
  animate: boolean
  requestId: number
}

interface EarthMapStageProps {
  selectedMonth: number
  viewMode: ViewMode
  sensorFilter: SensorFilter
  onSensorFilterChange: (next: SensorFilter) => void
  projectionMode: ProjectionMode
  onProjectionModeChange: (next: ProjectionMode) => void
  initialViewport: MapViewportState
  onViewportChange: (next: MapViewportState) => void
  cameraFocusRequest: CameraFocusRequest | null
  autoLocateOnMount: boolean
  geolocationMaxZoom?: number
  apiBaseUrl: string
  cloudsDisabled?: boolean
  showClouds: boolean
  onShowCloudsChange: (next: boolean) => void
  cloudRefreshNonce?: number
  orbitalState: LiveOrbitalState
  showOrbits: boolean
  onShowOrbitsChange: (next: boolean) => void
  selectedSatelliteId: string | null
  onSelectSatellite: (satellite: LiveSatelliteSnapshot) => void
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
}

const SVG_NS = 'http://www.w3.org/2000/svg'

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  anomaly: 'Anomaly vs. Typical Calendar',
  seasonal: 'Seasonal Climatology Dynamic',
  sensors: 'MODIS 1km vs. VIIRS 375m Coverage',
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
      return 'Location permission denied.'
    }
    if (code === 3) {
      return 'Location request timed out.'
    }
  }
  return 'Current location unavailable.'
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

interface SpotTooltipCardState {
  tooltip: FormattedFireSpotsTooltip
  anchorLngLat: [number, number]
  sensorFilter: SensorFilter
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
}

function buildFireSpotFocusGeoJson(coords: [number, number] | null): FeatureCollection<Point> {
  if (!coords) {
    return {
      type: 'FeatureCollection',
      features: [],
    }
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: coords,
        },
        properties: {},
      },
    ],
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

function querySpotTooltipAtPoint(
  map: MapLibreMap,
  point: { x: number; y: number },
  sensorFilter: SensorFilter,
): SpotTooltipCardState | null {
  if (!map.isStyleLoaded() || !map.getLayer(FIRMS_SPOTS_CORE_LAYER_ID)) {
    return null
  }
  const bbox: [PointLike, PointLike] = [
    [point.x - 8, point.y - 8],
    [point.x + 8, point.y + 8],
  ]
  const rendered = map.queryRenderedFeatures(bbox, {
    layers: [FIRMS_SPOTS_CORE_LAYER_ID],
  })
  if (rendered.length === 0) {
    return null
  }

  const inputs = rendered.map(toFireSpotTooltipInput)
  const tooltip = formatFireSpotsTooltip(inputs, Date.now())
  if (!tooltip) {
    return null
  }

  const sorted = [...inputs].sort(compareMatchedFireSpots)
  const topSpot = sorted[0]
  const anchorLngLat: [number, number] =
    topSpot && Number.isFinite(topSpot.lng) && Number.isFinite(topSpot.lat)
      ? [topSpot.lng!, topSpot.lat!]
      : [0, 0]

  return { tooltip, anchorLngLat, sensorFilter }
}

function createBaseStyle(
  projection: ProjectionMode,
  initialFireData: FeatureCollection<Point>,
  initialOrbitalState: LiveOrbitalState,
  initialUserData: FeatureCollection<Point>,
  initialLiveFiresData: FeatureCollection<Point, FireSpotFeatureProperties>,
  initialFocusData: FeatureCollection<Point>,
  initialViewMode: ViewMode,
  initialSensorFilter: SensorFilter,
  initialShowLiveFires: boolean,
  initialShowStubAnomalies: boolean,
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
        attribution:
          'Sentinel-2 cloudless — <a href="https://s2maps.eu" target="_blank" rel="noopener noreferrer">s2maps.eu</a> by <a href="https://eox.at" target="_blank" rel="noopener noreferrer">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2025)',
      },
      'satellite-swaths': {
        type: 'geojson',
        data: initialOrbitalState.swathsGeoJson,
      },
      'satellite-tracks-past': {
        type: 'geojson',
        data: initialOrbitalState.pastTracksGeoJson,
      },
      'satellite-tracks-future': {
        type: 'geojson',
        data: initialOrbitalState.futureTracksGeoJson,
      },
      'satellite-positions': {
        type: 'geojson',
        data: initialOrbitalState.positionsGeoJson,
      },
      [FIRMS_SPOTS_SOURCE_ID]: {
        type: 'geojson',
        data: initialLiveFiresData,
      },
      'fire-spot-focus': {
        type: 'geojson',
        data: initialFocusData,
      },
      'fire-anomalies': {
        type: 'geojson',
        data: initialFireData,
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
      },
      {
        id: 'satellite-swaths-fill',
        type: 'fill',
        source: 'satellite-swaths',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['match', ['get', 'swathRole'], 'nadir', 0.14, 0.045],
        },
      },
      {
        id: 'satellite-swaths-wide-outline',
        type: 'line',
        source: 'satellite-swaths',
        filter: ['==', ['get', 'swathRole'], 'wide'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1,
          'line-opacity': 0.28,
          'line-dasharray': [3, 4],
        },
      },
      {
        id: 'satellite-swaths-nadir-outline',
        type: 'line',
        source: 'satellite-swaths',
        filter: ['==', ['get', 'swathRole'], 'nadir'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.1,
          'line-opacity': 0.45,
        },
      },
      {
        id: 'satellite-tracks-past-line',
        type: 'line',
        source: 'satellite-tracks-past',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.55,
        },
      },
      {
        id: 'satellite-tracks-future-line',
        type: 'line',
        source: 'satellite-tracks-future',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.2,
          'line-opacity': 0.9,
          'line-dasharray': [2, 2],
        },
      },
      ...buildFireSpotLayers(initialViewMode, initialSensorFilter, initialShowLiveFires),
      {
        id: 'fire-spot-focus-ring',
        type: 'circle',
        source: 'fire-spot-focus',
        layout: {
          visibility: initialShowLiveFires ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': 14,
          'circle-color': 'rgba(255, 255, 255, 0.12)',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      },
      {
        id: 'satellite-positions-halo',
        type: 'circle',
        source: 'satellite-positions',
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
        source: 'satellite-positions',
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#f8fafc',
        },
      },
      {
        id: 'fire-anomaly-halo',
        type: 'circle',
        source: 'fire-anomalies',
        layout: {
          visibility: initialShowStubAnomalies ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': ['+', ['get', 'radius'], 8],
          'circle-color': [
            'match',
            ['get', 'statusCategory'],
            'anomaly-high',
            '#ef4444',
            'fits-typical',
            '#f59e0b',
            '#38bdf8',
          ],
          'circle-opacity': 0.25,
          'circle-blur': 0.5,
        },
      },
      {
        id: 'fire-anomaly-core',
        type: 'circle',
        source: 'fire-anomalies',
        layout: {
          visibility: initialShowStubAnomalies ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': [
            'match',
            ['get', 'statusCategory'],
            'anomaly-high',
            '#f97316',
            'fits-typical',
            '#facc15',
            '#38bdf8',
          ],
          'circle-opacity': 0.9,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#f8fafc',
        },
      },
      {
        id: 'user-geolocation-halo',
        type: 'circle',
        source: 'user-geolocation',
        paint: {
          'circle-radius': 14,
          'circle-color': '#3b82f6',
          'circle-opacity': 0.28,
        },
      },
      {
        id: 'user-geolocation-dot',
        type: 'circle',
        source: 'user-geolocation',
        paint: {
          'circle-radius': 6,
          'circle-color': '#60a5fa',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
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
  const source = map.getSource(sourceId) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
  }
}

function syncOrbitalSources(map: MapLibreMap, state: LiveOrbitalState): void {
  setGeoJsonSourceData(map, 'satellite-swaths', state.swathsGeoJson)
  setGeoJsonSourceData(map, 'satellite-tracks-past', state.pastTracksGeoJson)
  setGeoJsonSourceData(map, 'satellite-tracks-future', state.futureTracksGeoJson)
  setGeoJsonSourceData(map, 'satellite-positions', state.positionsGeoJson)
}

export function EarthMapStage({
  selectedMonth,
  viewMode,
  sensorFilter,
  onSensorFilterChange,
  projectionMode,
  onProjectionModeChange,
  initialViewport,
  onViewportChange,
  cameraFocusRequest,
  autoLocateOnMount,
  geolocationMaxZoom = DEFAULT_GEOLOCATION_MAX_ZOOM,
  apiBaseUrl,
  cloudsDisabled = false,
  showClouds,
  onShowCloudsChange,
  cloudRefreshNonce = 0,
  orbitalState,
  showOrbits,
  onShowOrbitsChange,
  selectedSatelliteId,
  onSelectSatellite,
  fireSpotsPayload,
  showFires,
  onShowFiresChange,
  pulsePaused,
  onPulsePausedChange,
}: EarthMapStageProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<MapLibreMap | null>(null)
  const styleReadyRef = useRef(false)
  const cloudLayerRef = useRef<SatelliteCloudLayerController | null>(null)
  const satMarkersRef = useRef<Map<string, SatelliteMarkerEntry>>(new Map())
  const initialViewportRef = useRef<MapViewportState>(initialViewport)
  const latestOnViewportChangeRef = useRef(onViewportChange)
  const userInteractedRef = useRef(false)
  const isMountedRef = useRef(false)

  const [mapError, setMapError] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [geoErrorMessage, setGeoErrorMessage] = useState<string | null>(null)
  const [viewport, setViewport] = useState<MapViewportState>(() => ({
    lng: normalizeLng(initialViewport.lng),
    lat: clampLat(initialViewport.lat),
    zoom: clampZoom(initialViewport.zoom),
  }))

  const hasLiveFires = fireSpotsPayload !== null
  const showStubAnomalies = !hasLiveFires

  const builtFireSpots = useMemo(
    () => (fireSpotsPayload ? buildFireSpotsGeoJson(fireSpotsPayload) : EMPTY_FIRE_SPOTS),
    [fireSpotsPayload],
  )

  const [hoverSpotCard, setHoverSpotCard] = useState<SpotTooltipCardState | null>(null)
  const [pinnedSpotCard, setPinnedSpotCard] = useState<SpotTooltipCardState | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const visibleHoverSpotCard =
    showFires && hoverSpotCard && hoverSpotCard.sensorFilter === sensorFilter
      ? hoverSpotCard
      : null
  const visiblePinnedSpotCard =
    showFires && pinnedSpotCard && pinnedSpotCard.sensorFilter === sensorFilter
      ? pinnedSpotCard
      : null
  const activeSpotCard = visiblePinnedSpotCard ?? visibleHoverSpotCard
  const isPinned = visiblePinnedSpotCard !== null

  const geoJson = useMemo(
    () => buildStubGeoJson(selectedMonth, sensorFilter),
    [selectedMonth, sensorFilter],
  )
  const userLocationGeoJson = useMemo(
    () => buildUserLocationGeoJson(userLocation),
    [userLocation],
  )
  const focusSpotGeoJson = useMemo(
    () =>
      buildFireSpotFocusGeoJson(visiblePinnedSpotCard ? visiblePinnedSpotCard.anchorLngLat : null),
    [visiblePinnedSpotCard],
  )

  const latestGeoJsonRef = useRef(geoJson)
  const latestUserGeoJsonRef = useRef(userLocationGeoJson)
  const latestProjectionRef = useRef(projectionMode)
  const latestApiBaseUrlRef = useRef(apiBaseUrl)
  const latestCloudsDisabledRef = useRef(cloudsDisabled)
  const latestShowCloudsRef = useRef(showClouds)
  const latestOrbitalStateRef = useRef(orbitalState)
  const latestShowOrbitsRef = useRef(showOrbits)
  const latestSelectedSatIdRef = useRef(selectedSatelliteId)
  const onSelectSatelliteRef = useRef(onSelectSatellite)
  const lastCloudRefreshNonceRef = useRef(cloudRefreshNonce)
  const latestBuiltFireSpotsRef = useRef(builtFireSpots)
  const latestShowFiresRef = useRef(showFires)
  const latestPulsePausedRef = useRef(pulsePaused)
  const latestFocusSpotGeoJsonRef = useRef(focusSpotGeoJson)
  const latestViewModeRef = useRef(viewMode)
  const latestSensorFilterRef = useRef(sensorFilter)
  const latestShowStubAnomaliesRef = useRef(showStubAnomalies)
  const fireAnimControllerRef = useRef<FireSpotsAnimationController | null>(null)
  const firePointerCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    latestBuiltFireSpotsRef.current = builtFireSpots
    latestShowFiresRef.current = showFires
    latestPulsePausedRef.current = pulsePaused
    latestFocusSpotGeoJsonRef.current = focusSpotGeoJson
    latestViewModeRef.current = viewMode
    latestSensorFilterRef.current = sensorFilter
    latestShowStubAnomaliesRef.current = showStubAnomalies
  }, [
    builtFireSpots,
    showFires,
    pulsePaused,
    focusSpotGeoJson,
    viewMode,
    sensorFilter,
    showStubAnomalies,
  ])

  useEffect(() => {
    if (!visiblePinnedSpotCard) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinnedSpotCard(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visiblePinnedSpotCard])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
      return
    }
    setGeoJsonSourceData(map, FIRMS_SPOTS_SOURCE_ID, builtFireSpots.featureCollection)
    fireAnimControllerRef.current?.sync()
  }, [builtFireSpots])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
      return
    }
    setGeoJsonSourceData(map, 'fire-spot-focus', focusSpotGeoJson)
  }, [focusSpotGeoJson])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
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
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
      return
    }
    setFireLayerVisibility(map, 'fire-anomaly-halo', showStubAnomalies)
    setFireLayerVisibility(map, 'fire-anomaly-core', showStubAnomalies)
  }, [showStubAnomalies])

  useEffect(() => {
    fireAnimControllerRef.current?.sync()
  }, [pulsePaused])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
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
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
      return
    }
    const colorExpr = getFireSpotColorExpression(viewMode)
    for (const layerId of [FIRMS_SPOTS_CORE_LAYER_ID, ...FIRMS_SPOTS_PULSE_LAYER_IDS]) {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'circle-color', colorExpr)
      }
    }
  }, [viewMode])

  useEffect(() => {
    latestOnViewportChangeRef.current = onViewportChange
  }, [onViewportChange])

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

        entry = { marker, button, iconSvg, labelSpan }
        entries.set(sat.id, entry)
      }

      entry.marker.setLngLat([sat.lng, sat.lat])
      entry.button.style.setProperty('--sat-color', sat.color)
      entry.button.setAttribute('aria-pressed', activeSatId === sat.id ? 'true' : 'false')
      entry.button.setAttribute(
        'aria-label',
        `Focus ${sat.name} (${sat.instrumentLabel}) at ${sat.lat.toFixed(1)} degrees latitude, ${sat.lng.toFixed(1)} degrees longitude`,
      )
      entry.iconSvg.style.transform = `rotate(${sat.headingDeg.toFixed(1)}deg)`
      entry.labelSpan.textContent = `${sat.glyph} ${sat.shortBadge}`
    }
  }

  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) {
      return
    }

    let map: MapLibreMap | null = null
    let resizeObserver: ResizeObserver | null = null
    const startViewport = initialViewportRef.current

    try {
      setWorkerUrl(maplibreWorkerUrl)
      styleReadyRef.current = false
      map = new MapLibreMap({
        container,
        style: createBaseStyle(
          latestProjectionRef.current,
          latestGeoJsonRef.current,
          latestOrbitalStateRef.current,
          latestUserGeoJsonRef.current,
          latestBuiltFireSpotsRef.current.featureCollection,
          latestFocusSpotGeoJsonRef.current,
          latestViewModeRef.current,
          latestSensorFilterRef.current,
          latestShowFiresRef.current,
          latestShowStubAnomaliesRef.current,
        ),
        center: [normalizeLng(startViewport.lng), clampLat(startViewport.lat)],
        zoom: clampZoom(startViewport.zoom),
        cancelPendingTileRequestsWhileZooming: false,
        maxTileCacheZoomLevels: 8,
        attributionControl: {
          compact: true,
          customAttribution: [
            'Active fire hotspots (24h): <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA FIRMS</a> (MODIS 1 km, NOAA/NASA VIIRS 375 m)',
            'Orbits: <a href="https://celestrak.org/" target="_blank" rel="noopener noreferrer">CelesTrak</a>',
            'Clouds: <a href="https://layers.extremum.org" target="_blank" rel="noopener noreferrer">Extremum</a> (EUMETSAT / NOAA / JMA VIS-IR)',
          ],
        },
      })

      mapInstanceRef.current = map

      const canvas = map.getCanvas()
      const handleCanvasMouseLeave = () => {
        canvas.style.cursor = ''
        setHoverSpotCard((prev) => (prev === null ? prev : null))
      }
      canvas.addEventListener('mouseleave', handleCanvasMouseLeave)
      firePointerCleanupRef.current = () => {
        canvas.removeEventListener('mouseleave', handleCanvasMouseLeave)
      }

      map.on('mousemove', (event) => {
        if (!map || !latestShowFiresRef.current || map.isMoving() || map.isZooming() || map.isRotating()) {
          return
        }
        const hit = querySpotTooltipAtPoint(map, event.point, latestSensorFilterRef.current)
        map.getCanvas().style.cursor = hit ? 'pointer' : ''
        setHoverSpotCard((prev) => {
          if (!prev && !hit) {
            return prev
          }
          return hit
        })
      })

      map.on('click', (event) => {
        if (!map || !latestShowFiresRef.current) {
          return
        }
        const hit = querySpotTooltipAtPoint(map, event.point, latestSensorFilterRef.current)
        setPinnedSpotCard(hit)
      })

      map.on('style.load', () => {
        if (!map) {
          return
        }
        styleReadyRef.current = true
        if (!map.getLayer(SATELLITE_CLOUDS_LAYER_ID)) {
          const cloudLayer = createSatelliteCloudLayer({
            apiBaseUrl: latestApiBaseUrlRef.current,
            disabled: latestCloudsDisabledRef.current,
            initialVisible: latestShowCloudsRef.current,
          })
          cloudLayerRef.current = cloudLayer
          // Insert directly below satellite swaths/tracks so spacecraft & swaths stay above clouds.
          map.addLayer(cloudLayer, 'satellite-swaths-fill')
        }
        setGeoJsonSourceData(map, 'fire-anomalies', latestGeoJsonRef.current)
        syncOrbitalSources(map, latestOrbitalStateRef.current)
        setGeoJsonSourceData(map, 'user-geolocation', latestUserGeoJsonRef.current)
        setGeoJsonSourceData(
          map,
          FIRMS_SPOTS_SOURCE_ID,
          latestBuiltFireSpotsRef.current.featureCollection,
        )
        setGeoJsonSourceData(map, 'fire-spot-focus', latestFocusSpotGeoJsonRef.current)

        setFireLayerVisibility(map, 'fire-anomaly-halo', latestShowStubAnomaliesRef.current)
        setFireLayerVisibility(map, 'fire-anomaly-core', latestShowStubAnomaliesRef.current)

        const colorExpr = getFireSpotColorExpression(latestViewModeRef.current)
        if (map.getLayer(FIRMS_SPOTS_CORE_LAYER_ID)) {
          setFireLayerVisibility(map, FIRMS_SPOTS_CORE_LAYER_ID, latestShowFiresRef.current)
          map.setFilter(
            FIRMS_SPOTS_CORE_LAYER_ID,
            buildFireSpotsCoreFilter(latestSensorFilterRef.current),
          )
          map.setPaintProperty(FIRMS_SPOTS_CORE_LAYER_ID, 'circle-color', colorExpr)
        }
        for (let idx = 0; idx < FIRMS_SPOTS_PULSE_LAYER_IDS.length; idx++) {
          const layerId = FIRMS_SPOTS_PULSE_LAYER_IDS[idx]
          if (map.getLayer(layerId)) {
            setFireLayerVisibility(map, layerId, latestShowFiresRef.current)
            map.setFilter(
              layerId,
              buildFireSpotsPulseFilter(latestSensorFilterRef.current, idx as PhaseCohort),
            )
            map.setPaintProperty(layerId, 'circle-color', colorExpr)
          }
        }
        setFireLayerVisibility(map, 'fire-spot-focus-ring', latestShowFiresRef.current)

        map.setProjection({ type: latestProjectionRef.current })
        syncSatelliteMarkers(
          map,
          latestOrbitalStateRef.current.snapshots,
          latestShowOrbitsRef.current,
          latestSelectedSatIdRef.current,
        )

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
      })

      map.on('movestart', (event: MapMovementEvent) => {
        if (event.originalEvent) {
          userInteractedRef.current = true
        }
      })

      map.on('moveend', () => {
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

      map.on('error', (event: ErrorEvent) => {
        const message = event.error instanceof Error ? event.error.message : null
        if (message && /webgl/i.test(message)) {
          setMapError(message)
        }
      })

      resizeObserver = new ResizeObserver(() => {
        map?.resize()
      })
      resizeObserver.observe(container)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to initialize MapLibre WebGL canvas.'
      queueMicrotask(() => setMapError(message))
    }

    const markerMap = satMarkersRef.current
    return () => {
      styleReadyRef.current = false
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
      cloudLayerRef.current = null
      mapInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    latestGeoJsonRef.current = geoJson
    const map = mapInstanceRef.current
    if (!map || !styleReadyRef.current) {
      return
    }
    setGeoJsonSourceData(map, 'fire-anomalies', geoJson)
  }, [geoJson])

  useEffect(() => {
    latestUserGeoJsonRef.current = userLocationGeoJson
    const map = mapInstanceRef.current
    if (!map || !styleReadyRef.current) {
      return
    }
    setGeoJsonSourceData(map, 'user-geolocation', userLocationGeoJson)
  }, [userLocationGeoJson])

  useEffect(() => {
    latestOrbitalStateRef.current = orbitalState
    latestShowOrbitsRef.current = showOrbits
    latestSelectedSatIdRef.current = selectedSatelliteId
    onSelectSatelliteRef.current = onSelectSatellite

    const map = mapInstanceRef.current
    if (!map) {
      return
    }
    if (styleReadyRef.current) {
      syncOrbitalSources(map, orbitalState)
    }
    syncSatelliteMarkers(map, orbitalState.snapshots, showOrbits, selectedSatelliteId)
  }, [orbitalState, showOrbits, selectedSatelliteId, onSelectSatellite])

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
    if (cloudRefreshNonce === lastCloudRefreshNonceRef.current) {
      return
    }
    lastCloudRefreshNonceRef.current = cloudRefreshNonce
    cloudLayerRef.current?.refreshNow()
  }, [cloudRefreshNonce])

  useEffect(() => {
    latestProjectionRef.current = projectionMode
    const map = mapInstanceRef.current
    if (!map || !styleReadyRef.current) {
      return
    }
    map.setProjection({ type: projectionMode })
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

    if (cameraFocusRequest.animate) {
      map.flyTo({
        center: [cameraFocusRequest.lng, cameraFocusRequest.lat],
        zoom: cameraFocusRequest.zoom,
        duration: 900,
      })
    } else {
      map.jumpTo({
        center: [cameraFocusRequest.lng, cameraFocusRequest.lat],
        zoom: cameraFocusRequest.zoom,
      })
    }
  }, [cameraFocusRequest])

  const triggerGeolocation = useCallback(
    (silentError: boolean, isCancelled?: () => boolean) => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        if (!silentError) {
          setGeoErrorMessage('Geolocation is not supported by this browser.')
        }
        return
      }

      setIsLocating(true)
      if (!silentError) {
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
          setGeoErrorMessage(null)

          if (silentError && userInteractedRef.current) {
            return
          }

          const map = mapInstanceRef.current
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
          map.flyTo({
            center: fitted?.center ?? [lng, lat],
            zoom: targetZoom,
            duration: 900,
          })
        })
        .catch((error: unknown) => {
          if (!isMountedRef.current || isCancelled?.()) {
            return
          }
          if (!silentError) {
            setGeoErrorMessage(formatGeolocationError(error))
          }
        })
        .finally(() => {
          if (isMountedRef.current && !isCancelled?.()) {
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
        triggerGeolocation(true, () => cancelled)
      }
    })
    return () => {
      cancelled = true
    }
  }, [autoLocateOnMount, triggerGeolocation])

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
    map.zoomTo(map.getZoom() + delta, { duration: 250 })
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
    map.flyTo({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      duration: 600,
    })
  }

  return (
    <main className="map-stage" aria-label="Interactive Earth fire and seasonal anomaly map">
      <div ref={mapContainerRef} className="map-canvas" />

      {mapError && (
        <div className="map-fallback-banner" role="status">
          <p>MapLibre WebGL preview unavailable here ({mapError}).</p>
        </div>
      )}

      <div className="map-hud map-hud-top-start" role="group" aria-label="Sensor layer filter">
        <span className="hud-kicker">Sensor Feed</span>
        <div className="hud-pill-row">
          <button
            type="button"
            className="hud-btn"
            aria-pressed={sensorFilter === 'harmonized'}
            onClick={() => onSensorFilterChange('harmonized')}
          >
            Harmonized
          </button>
          <button
            type="button"
            className="hud-btn"
            aria-pressed={sensorFilter === 'modis'}
            onClick={() => onSensorFilterChange('modis')}
          >
            MODIS 1km
          </button>
          <button
            type="button"
            className="hud-btn"
            aria-pressed={sensorFilter === 'viirs'}
            onClick={() => onSensorFilterChange('viirs')}
          >
            VIIRS 375m
          </button>
        </div>
      </div>

      <div
        className="map-hud map-hud-top-end"
        role="group"
        aria-label="Map active fires, clouds, orbits, projection, location, and zoom controls"
      >
        <button
          type="button"
          className="hud-btn"
          aria-pressed={showFires}
          onClick={() => {
            if (showFires) {
              setHoverSpotCard(null)
              setPinnedSpotCard(null)
            }
            onShowFiresChange(!showFires)
          }}
        >
          Fires
        </button>
        {hasLiveFires && showFires && !reducedMotion && (
          <button
            type="button"
            className="hud-btn"
            onClick={() => onPulsePausedChange(!pulsePaused)}
          >
            {pulsePaused ? 'Resume Pulse' : 'Pause Pulse'}
          </button>
        )}
        <button
          type="button"
          className="hud-btn"
          aria-pressed={showClouds}
          onClick={() => onShowCloudsChange(!showClouds)}
        >
          Clouds
        </button>
        <button
          type="button"
          className="hud-btn"
          aria-pressed={showOrbits}
          onClick={() => onShowOrbitsChange(!showOrbits)}
        >
          Orbits
        </button>
        <button
          type="button"
          className="hud-btn"
          aria-pressed={projectionMode === 'globe'}
          onClick={() =>
            onProjectionModeChange(projectionMode === 'globe' ? 'mercator' : 'globe')
          }
        >
          {projectionMode === 'globe' ? '3D Globe' : '2D Map'}
        </button>
        <button
          type="button"
          className="hud-btn"
          onClick={() => triggerGeolocation(false)}
          disabled={isLocating}
        >
          {isLocating ? 'Locating…' : 'My Location'}
        </button>
        <button type="button" className="hud-btn" aria-label="Zoom in" onClick={() => handleZoom(1)}>
          +
        </button>
        <button type="button" className="hud-btn" aria-label="Zoom out" onClick={() => handleZoom(-1)}>
          &minus;
        </button>
        <button type="button" className="hud-btn" onClick={handleResetView}>
          Reset Earth
        </button>
      </div>

      <div className="map-hud map-hud-bottom-start" aria-label="Map fire activity and orbit legend">
        <div className="hud-legend-header">
          <span className="hud-kicker">
            {MONTH_LABELS[selectedMonth]} &middot; {VIEW_MODE_LABELS[viewMode]}
            {hasLiveFires && reducedMotion ? ' \u00b7 Reduced Motion' : ''}
          </span>
          <span className="hud-coords">
            Lat {viewport.lat.toFixed(2)}&deg;, Lon {viewport.lng.toFixed(2)}&deg; &middot; z{viewport.zoom}
          </span>
        </div>
        <ul className="hud-legend-list" role="list">
          {hasLiveFires ? (
            !showFires ? (
              <li>
                <span className="legend-glyph legend-glyph-frp-mid" aria-hidden="true">&#9675;</span>
                <span>Active Fire Spots Hidden (toggle Fires above)</span>
              </li>
            ) : viewMode === 'sensors' ? (
              <>
                <li>
                  <span className="legend-glyph legend-glyph-modis-fire" aria-hidden="true">&#9679;</span>
                  <span>MODIS 1 km Spot (Terra / Aqua)</span>
                </li>
                <li>
                  <span className="legend-glyph legend-glyph-viirs-fire" aria-hidden="true">&#9679;</span>
                  <span>VIIRS 375 m Spot (NOAA-20 / 21)</span>
                </li>
              </>
            ) : (
              <>
                <li>
                  <span className="legend-glyph legend-glyph-frp-high" aria-hidden="true">&#9679;</span>
                  <span>Active Spot &middot; High FRP (&ge;100 MW)</span>
                </li>
                <li>
                  <span className="legend-glyph legend-glyph-frp-mid" aria-hidden="true">&#9679;</span>
                  <span>Active Spot &middot; Moderate FRP (~20 MW)</span>
                </li>
                <li>
                  <span className="legend-glyph legend-glyph-frp-low" aria-hidden="true">&#9679;</span>
                  <span>Active Spot &middot; Low FRP (&lt;20 MW)</span>
                </li>
              </>
            )
          ) : (
            <>
              <li>
                <span className="legend-glyph legend-glyph-anomaly" aria-hidden="true">&#9650;</span>
                <span>Positive Anomaly (above typical)</span>
              </li>
              <li>
                <span className="legend-glyph legend-glyph-typical" aria-hidden="true">&#9679;</span>
                <span>Fits Typical Season</span>
              </li>
              <li>
                <span className="legend-glyph legend-glyph-below" aria-hidden="true">&#9660;</span>
                <span>Below Typical</span>
              </li>
            </>
          )}
          {showOrbits && orbitalState.snapshots.length > 0 && sensorFilter !== 'viirs' && (
            <li>
              <span className="legend-glyph legend-glyph-modis" aria-hidden="true">&#9670;</span>
              <span>MODIS Orbits (Terra, Aqua &middot; 2,330 km swath)</span>
            </li>
          )}
          {showOrbits && orbitalState.snapshots.length > 0 && sensorFilter !== 'modis' && (
            <li>
              <span className="legend-glyph legend-glyph-viirs" aria-hidden="true">&#9679;</span>
              <span>VIIRS Orbits (NOAA-20, NOAA-21 &middot; Solid past / Dashed +90m)</span>
            </li>
          )}
          {userLocation && (
            <li>
              <span className="legend-glyph legend-glyph-user" aria-hidden="true">&#9673;</span>
              <span>Your Location</span>
            </li>
          )}
        </ul>
        {geoErrorMessage && (
          <p className="hud-geo-status" role="status">
            {geoErrorMessage}
          </p>
        )}
      </div>

      {showFires && activeSpotCard && (
        <div
          className="map-hud map-hud-bottom-end fire-tooltip-card"
          data-pinned={isPinned ? 'true' : 'false'}
          role={isPinned ? 'region' : undefined}
          aria-label={isPinned ? 'Pinned fire spot details' : undefined}
        >
          <div className="fire-tooltip-header">
            <div className="fire-tooltip-title-group">
              <span className="hud-kicker">{activeSpotCard.tooltip.header}</span>
              <span className="fire-tooltip-coords">
                Lat {activeSpotCard.anchorLngLat[1].toFixed(3)}&deg;, Lon{' '}
                {activeSpotCard.anchorLngLat[0].toFixed(3)}&deg;
              </span>
            </div>
            {isPinned && (
              <button
                type="button"
                className="hud-close-btn"
                aria-label="Unpin fire spot details"
                onClick={() => setPinnedSpotCard(null)}
              >
                &times;
              </button>
            )}
          </div>
          <ul className="fire-tooltip-list" role="list">
            {activeSpotCard.tooltip.lines.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
          {!isPinned && <p className="fire-tooltip-hint">Click spot to pin details</p>}
        </div>
      )}
    </main>
  )
}
