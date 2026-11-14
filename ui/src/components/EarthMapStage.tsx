import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, Point } from 'geojson'
import { LngLat, LngLatBounds, Map as MapLibreMap } from 'maplibre-gl'
import type { ErrorEvent, GeoJSONSource, MapMovementEvent, StyleSpecification } from 'maplibre-gl'
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
}

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

function createBaseStyle(
  projection: ProjectionMode,
  initialData: FeatureCollection<Point>,
  initialUserData: FeatureCollection<Point>,
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
      'fire-anomalies': {
        type: 'geojson',
        data: initialData,
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
        id: 'fire-anomaly-halo',
        type: 'circle',
        source: 'fire-anomalies',
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
          'circle-color': '#22d3ee',
          'circle-opacity': 0.28,
        },
      },
      {
        id: 'user-geolocation-dot',
        type: 'circle',
        source: 'user-geolocation',
        paint: {
          'circle-radius': 6,
          'circle-color': '#22d3ee',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      },
    ],
  }
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
}: EarthMapStageProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<MapLibreMap | null>(null)
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

  useEffect(() => {
    latestOnViewportChangeRef.current = onViewportChange
  }, [onViewportChange])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
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
          latestGeoJsonRef.current,
          latestUserGeoJsonRef.current,
        ),
        center: [normalizeLng(startViewport.lng), clampLat(startViewport.lat)],
        zoom: clampZoom(startViewport.zoom),
        cancelPendingTileRequestsWhileZooming: false,
        maxTileCacheZoomLevels: 8,
        attributionControl: { compact: true },
      })

      mapInstanceRef.current = map

      map.on('load', () => {
        if (!map) {
          return
        }
        const fireSource = map.getSource('fire-anomalies') as GeoJSONSource | undefined
        if (fireSource) {
          fireSource.setData(latestGeoJsonRef.current)
        }
        const userSource = map.getSource('user-geolocation') as GeoJSONSource | undefined
        if (userSource) {
          userSource.setData(latestUserGeoJsonRef.current)
        }
        map.setProjection({ type: latestProjectionRef.current })
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

    return () => {
      resizeObserver?.disconnect()
      map?.remove()
      mapInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    latestGeoJsonRef.current = geoJson
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
      return
    }
    const source = map.getSource('fire-anomalies') as GeoJSONSource | undefined
    if (source) {
      source.setData(geoJson)
    }
  }, [geoJson])

  useEffect(() => {
    latestUserGeoJsonRef.current = userLocationGeoJson
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
      return
    }
    const source = map.getSource('user-geolocation') as GeoJSONSource | undefined
    if (source) {
      source.setData(userLocationGeoJson)
    }
  }, [userLocationGeoJson])

  useEffect(() => {
    latestProjectionRef.current = projectionMode
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
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
        aria-label="Map projection, location, and zoom controls"
      >
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

      <div className="map-hud map-hud-bottom-start" aria-label="Map anomaly legend and coordinates">
        <div className="hud-legend-header">
          <span className="hud-kicker">{MONTH_LABELS[selectedMonth]} &middot; {VIEW_MODE_LABELS[viewMode]}</span>
          <span className="hud-coords">
            Lat {viewport.lat.toFixed(2)}&deg;, Lon {viewport.lng.toFixed(2)}&deg; &middot; z{viewport.zoom}
          </span>
        </div>
        <ul className="hud-legend-list">
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
    </main>
  )
}
