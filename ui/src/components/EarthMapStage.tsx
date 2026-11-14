import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, MultiLineString, Point, Polygon } from 'geojson'
import { LngLat, LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl'
import type {
  ErrorEvent,
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  LngLatLike,
  MapLayerMouseEvent,
  StyleSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  MARK_EDGE_COLOR,
  MARK_STROKE_COLOR,
  STATUS_COLORS,
  USER_LOCATION_COLORS,
} from '../data/dataPalette'
import {
  STATUS_CATEGORIES,
  STATUS_MARK_REACH,
  STATUS_MARK_STYLES,
  statusMarkExtent,
  statusMarkPath,
} from '../data/statusMarks'
import {
  buildStubGeoJson,
  type ProjectionMode,
  type SensorFilter,
  type StatusCategory,
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
import type { LiveOrbitalState, LiveSatelliteSnapshot } from '../utils/satelliteOrbits'
import { MapControls } from './MapControls'
import { MapLegend } from './MapLegend'

// MapLibre v6 is ESM-only: when bundled it resolves its worker next to the chunk via
// import.meta.url, a file Vite never emits. Point it at a Vite-emitted worker asset instead.
setWorkerUrl(maplibreWorkerUrl)

export interface CameraFocusRequest {
  lng: number
  lat: number
  zoom: number
  animate: boolean
  requestId: number
}

interface EarthMapStageProps {
  selectedMonth: number
  sensorFilter: SensorFilter
  projectionMode: ProjectionMode
  onProjectionModeChange: (next: ProjectionMode) => void
  initialViewport: MapViewportState
  onViewportChange: (next: MapViewportState) => void
  cameraFocusRequest: CameraFocusRequest | null
  geolocationMaxZoom?: number
  orbitalState: LiveOrbitalState
  showOrbits: boolean
  onShowOrbitsChange: (next: boolean) => void
  selectedSatelliteId: string | null
  onSelectSatellite: (satellite: LiveSatelliteSnapshot) => void
  selectedRegionId: string | null
  onSelectRegion: (regionId: string) => void
}

interface SatelliteMarkerEntry {
  marker: Marker
  button: HTMLButtonElement
  iconSvg: SVGSVGElement
  labelSpan: HTMLSpanElement
}

const SVG_NS = 'http://www.w3.org/2000/svg'

// The legend starts open only on a map at least this wide (in rem), matching the CSS breakpoint.
const WIDE_STAGE_MIN_REM = 36
const GEO_STATUS_TIMEOUT_MS = 8000

// MapLibre match expression: statusCategory -> palette color (below-typical is the fallback)
const STATUS_COLOR_EXPRESSION = [
  'match',
  ['get', 'statusCategory'],
  'anomaly-high' satisfies StatusCategory,
  STATUS_COLORS['anomaly-high'],
  'fits-typical' satisfies StatusCategory,
  STATUS_COLORS['fits-typical'],
  STATUS_COLORS['below-typical'],
] as ExpressionSpecification

const STATUS_MARK_LAYER_ID = 'fire-anomaly-marks'
const SELECTION_LAYER_IDS = ['fire-anomaly-selection-edge', 'fire-anomaly-selection-ring'] as const

// Marks are rasterized at a few design radii; each feature uses the nearest one, scaled by
// icon-size to its own radius (8–26 px), so outlines stay crisp and about the same width.
const MARK_DESIGN_RADII = [10, 16, 22] as const
const MARK_DESIGN_RADIUS_EXPRESSION = [
  'step',
  ['get', 'radius'],
  MARK_DESIGN_RADII[0],
  13,
  MARK_DESIGN_RADII[1],
  19,
  MARK_DESIGN_RADII[2],
] as ExpressionSpecification

const STATUS_MARK_LAYER: SymbolLayerSpecification = {
  id: STATUS_MARK_LAYER_ID,
  type: 'symbol',
  source: 'fire-anomalies',
  layout: {
    'icon-image': [
      'concat',
      'status-mark-',
      ['get', 'statusCategory'],
      '-',
      ['to-string', MARK_DESIGN_RADIUS_EXPRESSION],
    ],
    'icon-size': ['/', ['get', 'radius'], MARK_DESIGN_RADIUS_EXPRESSION],
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    // Larger marks underneath, so a smaller neighbour stays visible
    'symbol-sort-key': ['-', ['get', 'radius']],
  },
}

// Inner edge of the selection ring, a few px clear of the mark's farthest point: the triangles'
// corners plus their outline, which icon-size scales with the mark (radius / design radius).
const SELECTION_RING_GAP_PX = 4
const SELECTION_RING_RADIUS = [
  '+',
  ['*', ['get', 'radius'], STATUS_MARK_REACH.perRadius],
  ['*', STATUS_MARK_REACH.outline, ['/', ['get', 'radius'], MARK_DESIGN_RADIUS_EXPRESSION]],
  SELECTION_RING_GAP_PX,
] as ExpressionSpecification

function selectionFilter(regionId: string | null): FilterSpecification {
  return ['==', ['get', 'id'], regionId ?? '']
}

function rasterizeStatusMark(
  category: StatusCategory,
  radius: number,
  pixelRatio: number,
): ImageData | null {
  const half = Math.ceil(statusMarkExtent(category, radius)) + 1
  const side = half * 2 * pixelRatio
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  const style = STATUS_MARK_STYLES[category]
  const path = new Path2D(statusMarkPath(category, radius))
  context.scale(pixelRatio, pixelRatio)
  context.translate(half, half)
  context.lineJoin = 'round'
  for (const stroke of style.strokes) {
    context.strokeStyle = stroke.color
    context.lineWidth = stroke.width
    context.stroke(path)
  }
  context.fillStyle = style.fill
  context.fill(path, style.fillRule)
  return context.getImageData(0, 0, side, side)
}

// Must run before the symbol layer is added: in MapLibre v6 a styleimagemissing listener can no
// longer supply the image.
function addStatusMarkImages(map: MapLibreMap): void {
  // At least 2x, so marks scaled up by icon-size stay sharp on 1x screens too
  const pixelRatio = Math.max(2, Math.ceil(window.devicePixelRatio || 1))
  for (const category of STATUS_CATEGORIES) {
    for (const radius of MARK_DESIGN_RADII) {
      const imageId = `status-mark-${category}-${radius}`
      if (map.hasImage(imageId)) {
        continue
      }
      const image = rasterizeStatusMark(category, radius, pixelRatio)
      if (image) {
        map.addImage(imageId, image, { pixelRatio })
      }
    }
  }
}

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
): void {
  if (prefersReducedMotion()) {
    map.jumpTo(target)
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

function createBaseStyle(
  projection: ProjectionMode,
  initialFireData: FeatureCollection<Point>,
  initialOrbitalState: LiveOrbitalState,
  initialUserData: FeatureCollection<Point>,
  initialSelectedRegionId: string | null,
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
        // A quieter background, so warm marks do not sink into desert and savanna
        paint: {
          'raster-saturation': -0.5,
        },
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
          'circle-stroke-color': MARK_STROKE_COLOR,
        },
      },
      {
        id: 'fire-anomaly-halo',
        type: 'circle',
        source: 'fire-anomalies',
        paint: {
          'circle-radius': ['+', ['get', 'radius'], 8],
          'circle-color': STATUS_COLOR_EXPRESSION,
          'circle-opacity': 0.25,
          'circle-blur': 0.5,
        },
      },
      // Selection ring: a light ring with dark edges (circle strokes sit outside the radius).
      // The status marks themselves are a symbol layer added once their images exist.
      {
        id: SELECTION_LAYER_IDS[0],
        type: 'circle',
        source: 'fire-anomalies',
        filter: selectionFilter(initialSelectedRegionId),
        paint: {
          'circle-radius': ['-', SELECTION_RING_RADIUS, 1],
          'circle-opacity': 0,
          'circle-stroke-width': 5,
          'circle-stroke-color': MARK_EDGE_COLOR,
        },
      },
      {
        id: SELECTION_LAYER_IDS[1],
        type: 'circle',
        source: 'fire-anomalies',
        filter: selectionFilter(initialSelectedRegionId),
        paint: {
          'circle-radius': SELECTION_RING_RADIUS,
          'circle-opacity': 0,
          'circle-stroke-width': 3,
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
  sensorFilter,
  projectionMode,
  onProjectionModeChange,
  initialViewport,
  onViewportChange,
  cameraFocusRequest,
  geolocationMaxZoom = DEFAULT_GEOLOCATION_MAX_ZOOM,
  orbitalState,
  showOrbits,
  onShowOrbitsChange,
  selectedSatelliteId,
  onSelectSatellite,
  selectedRegionId,
  onSelectRegion,
}: EarthMapStageProps) {
  const stageRef = useRef<HTMLElement | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<MapLibreMap | null>(null)
  const satMarkersRef = useRef<Map<string, SatelliteMarkerEntry>>(new Map())
  const initialViewportRef = useRef<MapViewportState>(initialViewport)
  const latestOnViewportChangeRef = useRef(onViewportChange)
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

  const geoJson = useMemo(
    () => buildStubGeoJson(selectedMonth, sensorFilter),
    [selectedMonth, sensorFilter],
  )
  const userLocationGeoJson = useMemo(
    () => buildUserLocationGeoJson(userLocation),
    [userLocation],
  )

  const latestGeoJsonRef = useRef(geoJson)
  const latestUserGeoJsonRef = useRef(userLocationGeoJson)
  const latestProjectionRef = useRef(projectionMode)
  const latestOrbitalStateRef = useRef(orbitalState)
  const latestShowOrbitsRef = useRef(showOrbits)
  const latestSelectedSatIdRef = useRef(selectedSatelliteId)
  const onSelectSatelliteRef = useRef(onSelectSatellite)
  const latestSelectedRegionIdRef = useRef(selectedRegionId)
  const onSelectRegionRef = useRef(onSelectRegion)

  useEffect(() => {
    latestOnViewportChangeRef.current = onViewportChange
  }, [onViewportChange])

  useEffect(() => {
    onSelectRegionRef.current = onSelectRegion
  }, [onSelectRegion])

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
        `Show ${sat.name} (${sat.instrumentLabel}), now at latitude ${sat.lat.toFixed(1)}, longitude ${sat.lng.toFixed(1)}`,
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
      map = new MapLibreMap({
        container,
        style: createBaseStyle(
          latestProjectionRef.current,
          latestGeoJsonRef.current,
          latestOrbitalStateRef.current,
          latestUserGeoJsonRef.current,
          latestSelectedRegionIdRef.current,
        ),
        center: [normalizeLng(startViewport.lng), clampLat(startViewport.lat)],
        zoom: clampZoom(startViewport.zoom),
        cancelPendingTileRequestsWhileZooming: false,
        maxTileCacheZoomLevels: 8,
        attributionControl: {
          compact: true,
          // Kept short so the EOX/Copernicus basemap credit stays readable on small maps;
          // the side panel carries the full attribution.
          customAttribution:
            '<a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA FIRMS</a> (sample data) &middot; <a href="https://celestrak.org/" target="_blank" rel="noopener noreferrer">CelesTrak</a>',
        },
      })

      mapInstanceRef.current = map

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

      let styleLoaded = false
      // The style is parsed and its sources exist: re-apply whatever changed while it loaded,
      // without waiting for 'load' (which also waits for every basemap tile).
      map.once('style.load', () => {
        styleLoaded = true
        if (!map) {
          return
        }
        setGeoJsonSourceData(map, 'fire-anomalies', latestGeoJsonRef.current)
        syncOrbitalSources(map, latestOrbitalStateRef.current)
        setGeoJsonSourceData(map, 'user-geolocation', latestUserGeoJsonRef.current)
        map.setProjection({ type: latestProjectionRef.current })
        syncSatelliteMarkers(
          map,
          latestOrbitalStateRef.current.snapshots,
          latestShowOrbitsRef.current,
          latestSelectedSatIdRef.current,
        )
        addStatusMarkImages(map)
        map.addLayer(STATUS_MARK_LAYER, 'user-geolocation-halo')
        for (const layerId of SELECTION_LAYER_IDS) {
          map.setFilter(layerId, selectionFilter(latestSelectedRegionIdRef.current))
        }

        // A map click selects the region in place; the list stays the keyboard path to regions.
        map.on('click', STATUS_MARK_LAYER_ID, (event: MapLayerMouseEvent) => {
          const regionId: unknown = event.features?.[0]?.properties?.id
          if (typeof regionId === 'string') {
            onSelectRegionRef.current(regionId)
          }
        })
        map.on('mouseenter', STATUS_MARK_LAYER_ID, () => {
          map?.getCanvas().style.setProperty('cursor', 'pointer')
        })
        map.on('mouseleave', STATUS_MARK_LAYER_ID, () => {
          map?.getCanvas().style.removeProperty('cursor')
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
        map?.resize()
      })
      resizeObserver.observe(container)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to initialize MapLibre WebGL canvas.'
      queueMicrotask(() => setMapError(message))
    }

    const markerMap = satMarkersRef.current
    return () => {
      for (const entry of markerMap.values()) {
        entry.marker.remove()
      }
      markerMap.clear()
      resizeObserver?.disconnect()
      map?.remove()
      mapInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    latestGeoJsonRef.current = geoJson
    const map = mapInstanceRef.current
    // Not gated on isStyleLoaded(), which stays false while tiles load (e.g. during a fly-to) and
    // would drop the update; before the style is parsed the source is missing and 'style.load' syncs.
    if (map) {
      setGeoJsonSourceData(map, 'fire-anomalies', geoJson)
    }
  }, [geoJson])

  useEffect(() => {
    latestSelectedRegionIdRef.current = selectedRegionId
    const map = mapInstanceRef.current
    if (!map) {
      return
    }
    for (const layerId of SELECTION_LAYER_IDS) {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, selectionFilter(selectedRegionId))
      }
    }
  }, [selectedRegionId])

  useEffect(() => {
    latestUserGeoJsonRef.current = userLocationGeoJson
    const map = mapInstanceRef.current
    if (map) {
      setGeoJsonSourceData(map, 'user-geolocation', userLocationGeoJson)
    }
  }, [userLocationGeoJson])

  useEffect(() => {
    latestOrbitalStateRef.current = orbitalState
    latestShowOrbitsRef.current = showOrbits
    latestSelectedSatIdRef.current = selectedSatelliteId

    const map = mapInstanceRef.current
    if (!map) {
      return
    }
    // Not gated on isStyleLoaded() for the same reason as the fire layer: it stays false while
    // tiles load and would drop a second's position update; 'style.load' syncs if sources are
    // missing.
    syncOrbitalSources(map, orbitalState)
    syncSatelliteMarkers(map, orbitalState.snapshots, showOrbits, selectedSatelliteId)
  }, [orbitalState, showOrbits, selectedSatelliteId])

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

  const triggerGeolocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoErrorMessage('Your browser cannot share your location.')
      return
    }

    setIsLocating(true)
    setGeoErrorMessage(null)

    void requestCurrentBrowserPosition(GEOLOCATION_POSITION_OPTIONS)
      .then((position) => {
        if (!isMountedRef.current) {
          return
        }

        const lng = normalizeLng(position.coords.longitude)
        const lat = clampLat(position.coords.latitude)
        setUserLocation([lng, lat])
        setGeoErrorMessage(null)

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
        moveCamera(map, { center: fitted?.center ?? [lng, lat], zoom: targetZoom }, 900)
      })
      .catch((error: unknown) => {
        if (isMountedRef.current) {
          setGeoErrorMessage(formatGeolocationError(error))
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setIsLocating(false)
        }
      })
  }, [geolocationMaxZoom])

  const handleZoom = (delta: number) => {
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

  const hasOrbitSnapshots = showOrbits && orbitalState.snapshots.length > 0

  // HUD before the canvas in DOM order, so Tab reaches the map controls before MapLibre's own.
  return (
    <main ref={stageRef} className="map-stage" aria-label="Fire activity map">
      <MapLegend
        selectedMonth={selectedMonth}
        defaultOpen={isStageWide}
        showModisOrbits={hasOrbitSnapshots && sensorFilter !== 'viirs'}
        showViirsOrbits={hasOrbitSnapshots && sensorFilter !== 'modis'}
        showUserLocation={userLocation !== null}
      />

      <MapControls
        onZoomIn={() => handleZoom(1)}
        onZoomOut={() => handleZoom(-1)}
        onLocate={triggerGeolocation}
        isLocating={isLocating}
        geoErrorMessage={geoErrorMessage}
        onResetView={handleResetView}
        projectionMode={projectionMode}
        onProjectionModeChange={onProjectionModeChange}
        showOrbits={showOrbits}
        onShowOrbitsChange={onShowOrbitsChange}
      />

      <div ref={mapContainerRef} className="map-canvas" />

      {mapError && (
        <div className="map-fallback-banner" role="status" title={mapError}>
          <p>This browser could not draw the fire and satellite layers on the map.</p>
        </div>
      )}
    </main>
  )
}
