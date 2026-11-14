import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, Point } from 'geojson'
import { Map as MapLibreMap } from 'maplibre-gl'
import type { ErrorEvent, GeoJSONSource, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  buildStubGeoJson,
  MONTH_LABELS,
  type ProjectionMode,
  type SensorFilter,
  type ViewMode,
} from '../data/stubSeasonalData'

interface EarthMapStageProps {
  selectedMonth: number
  viewMode: ViewMode
  sensorFilter: SensorFilter
  onSensorFilterChange: (next: SensorFilter) => void
  projectionMode: ProjectionMode
  onProjectionModeChange: (next: ProjectionMode) => void
  focusCoordinates: [number, number] | null
}

const DEFAULT_CENTER: [number, number] = [108, 8]
const DEFAULT_ZOOM = 1.75

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  anomaly: 'Anomaly vs. Typical Calendar',
  seasonal: 'Seasonal Climatology Dynamic',
  sensors: 'MODIS 1km vs. VIIRS 375m Coverage',
}

function createBaseStyle(
  projection: ProjectionMode,
  initialData: FeatureCollection<Point>,
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
  focusCoordinates,
}: EarthMapStageProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<MapLibreMap | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [viewport, setViewport] = useState({
    lng: DEFAULT_CENTER[0],
    lat: DEFAULT_CENTER[1],
    zoom: DEFAULT_ZOOM,
  })

  const geoJson = useMemo(
    () => buildStubGeoJson(selectedMonth, sensorFilter),
    [selectedMonth, sensorFilter],
  )

  const latestGeoJsonRef = useRef(geoJson)
  const latestProjectionRef = useRef(projectionMode)

  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) {
      return
    }

    let map: MapLibreMap | null = null
    let resizeObserver: ResizeObserver | null = null

    try {
      map = new MapLibreMap({
        container,
        style: createBaseStyle(latestProjectionRef.current, latestGeoJsonRef.current),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: { compact: true },
      })

      mapInstanceRef.current = map

      map.on('load', () => {
        if (!map) {
          return
        }
        const source = map.getSource('fire-anomalies') as GeoJSONSource | undefined
        if (source) {
          source.setData(latestGeoJsonRef.current)
        }
        map.setProjection({ type: latestProjectionRef.current })
      })

      map.on('moveend', () => {
        if (!map) {
          return
        }
        const center = map.getCenter()
        setViewport({
          lng: Number(center.lng.toFixed(2)),
          lat: Number(center.lat.toFixed(2)),
          zoom: Number(map.getZoom().toFixed(1)),
        })
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
    latestProjectionRef.current = projectionMode
    const map = mapInstanceRef.current
    if (!map || !map.isStyleLoaded()) {
      return
    }
    map.setProjection({ type: projectionMode })
  }, [projectionMode])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !focusCoordinates) {
      return
    }
    map.flyTo({
      center: focusCoordinates,
      zoom: 3.6,
      duration: 900,
    })
  }, [focusCoordinates])

  const handleZoom = (delta: number) => {
    const map = mapInstanceRef.current
    if (!map) {
      return
    }
    map.zoomTo(map.getZoom() + delta, { duration: 250 })
  }

  const handleResetView = () => {
    const map = mapInstanceRef.current
    if (!map) {
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

      <div className="map-hud map-hud-top-end" role="group" aria-label="Map projection and zoom controls">
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
            Lat {viewport.lat}&deg;, Lon {viewport.lng}&deg; &middot; z{viewport.zoom}
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
        </ul>
      </div>
    </main>
  )
}
