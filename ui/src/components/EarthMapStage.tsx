import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, MultiLineString, Point, Polygon } from 'geojson'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import type { ErrorEvent, GeoJSONSource, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  buildStubGeoJson,
  MONTH_LABELS,
  type ProjectionMode,
  type SensorFilter,
  type ViewMode,
} from '../data/stubSeasonalData'
import type { LiveOrbitalState, LiveSatelliteSnapshot } from '../utils/satelliteOrbits'

interface EarthMapStageProps {
  selectedMonth: number
  viewMode: ViewMode
  sensorFilter: SensorFilter
  onSensorFilterChange: (next: SensorFilter) => void
  projectionMode: ProjectionMode
  onProjectionModeChange: (next: ProjectionMode) => void
  focusCoordinates: [number, number] | null
  orbitalState: LiveOrbitalState
  showOrbits: boolean
  onShowOrbitsChange: (next: boolean) => void
  selectedSatelliteId: string | null
  onSelectSatellite: (satellite: LiveSatelliteSnapshot) => void
}

interface SatelliteMarkerEntry {
  marker: Marker
  button: HTMLButtonElement
  iconSvg: SVGSVGElement
  labelSpan: HTMLSpanElement
}

const DEFAULT_CENTER: [number, number] = [108, 8]
const DEFAULT_ZOOM = 1.75
const SVG_NS = 'http://www.w3.org/2000/svg'

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  anomaly: 'Anomaly vs. Typical Calendar',
  seasonal: 'Seasonal Climatology Dynamic',
  sensors: 'MODIS 1km vs. VIIRS 375m Coverage',
}

function createSpacecraftIconSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 18 18')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('sat-marker-icon')

  const makeRect = (x: string, y: string, width: string, height: string, className: string, rx?: string) => {
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
  focusCoordinates,
  orbitalState,
  showOrbits,
  onShowOrbitsChange,
  selectedSatelliteId,
  onSelectSatellite,
}: EarthMapStageProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<MapLibreMap | null>(null)
  const satMarkersRef = useRef<Map<string, SatelliteMarkerEntry>>(new Map())

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
  const latestOrbitalStateRef = useRef(orbitalState)
  const latestShowOrbitsRef = useRef(showOrbits)
  const latestSelectedSatIdRef = useRef(selectedSatelliteId)
  const onSelectSatelliteRef = useRef(onSelectSatellite)

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

    try {
      map = new MapLibreMap({
        container,
        style: createBaseStyle(
          latestProjectionRef.current,
          latestGeoJsonRef.current,
          latestOrbitalStateRef.current,
        ),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        cancelPendingTileRequestsWhileZooming: false,
        maxTileCacheZoomLevels: 8,
        attributionControl: { compact: true },
      })

      mapInstanceRef.current = map

      map.on('load', () => {
        if (!map) {
          return
        }
        setGeoJsonSourceData(map, 'fire-anomalies', latestGeoJsonRef.current)
        syncOrbitalSources(map, latestOrbitalStateRef.current)
        map.setProjection({ type: latestProjectionRef.current })
        syncSatelliteMarkers(
          map,
          latestOrbitalStateRef.current.snapshots,
          latestShowOrbitsRef.current,
          latestSelectedSatIdRef.current,
        )
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
    if (!map || !map.isStyleLoaded()) {
      return
    }
    setGeoJsonSourceData(map, 'fire-anomalies', geoJson)
  }, [geoJson])

  useEffect(() => {
    latestOrbitalStateRef.current = orbitalState
    latestShowOrbitsRef.current = showOrbits
    latestSelectedSatIdRef.current = selectedSatelliteId
    onSelectSatelliteRef.current = onSelectSatellite

    const map = mapInstanceRef.current
    if (!map) {
      return
    }
    if (map.isStyleLoaded()) {
      syncOrbitalSources(map, orbitalState)
    }
    syncSatelliteMarkers(map, orbitalState.snapshots, showOrbits, selectedSatelliteId)
  }, [orbitalState, showOrbits, selectedSatelliteId, onSelectSatellite])

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

      <div className="map-hud map-hud-top-end" role="group" aria-label="Map projection, orbits, and zoom controls">
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

      <div className="map-hud map-hud-bottom-start" aria-label="Map anomaly and orbit legend">
        <div className="hud-legend-header">
          <span className="hud-kicker">{MONTH_LABELS[selectedMonth]} &middot; {VIEW_MODE_LABELS[viewMode]}</span>
          <span className="hud-coords">
            Lat {viewport.lat}&deg;, Lon {viewport.lng}&deg; &middot; z{viewport.zoom}
          </span>
        </div>
        <ul className="hud-legend-list" role="list">
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
        </ul>
      </div>
    </main>
  )
}
