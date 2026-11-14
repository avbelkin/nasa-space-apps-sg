import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  EarthMapStage,
  type CameraFocusRequest,
  type GeolocationLegendState,
} from './components/EarthMapStage'
import { MapLegend } from './components/MapLegend'
import type { SatelliteFeedState } from './components/panel/SatelliteDetails'
import { SidePanel } from './components/SidePanel'
import { DATA_PALETTE_CSS_VARIABLES } from './data/dataPalette'
import type { ProjectionMode, SensorFilter } from './data/mapTypes'
import {
  apiBaseUrl,
  fetchApiStatus,
  isProdUnconfigured,
  type ApiStatusResponse,
  type ConnectionState,
} from './state/apiStatus'
import {
  DEFAULT_GEOLOCATION_MAX_ZOOM,
  parseUrlHash,
  resolveInitialUrlHashState,
  syncUrlHashAndStorage,
  type MapViewportState,
} from './state/urlHashState'
import {
  computeLiveOrbitalState,
  computeSatelliteHudElapsedMinutes,
  fetchSatelliteOrbits,
  formatSatelliteHudSection,
  hasSatelliteHudCenterMoved,
  interpolateTrackAtTime,
  SATELLITE_HUD_VIEWPORT_DEBOUNCE_MS,
  SATELLITE_ORBITS_IDLE_REFRESH_INTERVAL_MS,
  SATELLITE_ORBITS_REFRESH_INTERVAL_MS,
  type LiveSatelliteSnapshot,
  type SatelliteOrbit,
  type SatelliteOrbitsResponse,
} from './utils/satelliteOrbits'
import {
  fetchLiveFireSpots,
  summarizeFireSpotsForSensor,
  type FirmsLiveSpotsResponse,
} from './utils/fireSpots'
import { formatRainLookbackLabel, type RainLayerMetadata } from './utils/rainCloudShader'
import { buildSatelliteOverpassIndex } from './utils/satelliteOverpassTimeline'

const FIRES_REFRESH_INTERVAL_MS = 15 * 60 * 1000
const FOCUS_ZOOM = 3.6
const EMPTY_SATELLITES: readonly SatelliteOrbit[] = []

function App() {
  const [initialResolution] = useState(() => resolveInitialUrlHashState())
  const [sensorFilter, setSensorFilter] = useState<SensorFilter>(
    initialResolution.state.sensorFilter,
  )
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>(
    initialResolution.state.projectionMode,
  )
  const [showOrbits, setShowOrbits] = useState<boolean>(initialResolution.state.showOrbits)
  const [showClouds, setShowClouds] = useState<boolean>(initialResolution.state.showClouds)
  const [cloudRefreshNonce, setCloudRefreshNonce] = useState<number>(0)
  const [showRain, setShowRain] = useState<boolean>(initialResolution.state.showRain)
  const [rainBackMinutes, setRainBackMinutes] = useState<number>(
    initialResolution.state.rainBackMinutes,
  )
  const [rainMetadata, setRainMetadata] = useState<RainLayerMetadata>({
    latestAvailableIso: null,
    effectiveTimeIso: null,
    lookbackMinutes: initialResolution.state.rainBackMinutes,
  })
  const [showNightLights, setShowNightLights] = useState<boolean>(
    initialResolution.state.showNightLights,
  )
  const [showFires, setShowFires] = useState<boolean>(initialResolution.state.showFires)
  const [pulsePaused, setPulsePaused] = useState<boolean>(false)
  const [reducedMotion, setReducedMotion] = useState<boolean>(false)
  const [viewport, setViewport] = useState<MapViewportState>(() => ({
    zoom: initialResolution.state.zoom,
    lat: initialResolution.state.lat,
    lng: initialResolution.state.lng,
  }))
  const [extraParams, setExtraParams] = useState<Record<string, string> | undefined>(
    initialResolution.state.extraParams,
  )
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string | null>(null)
  const [geolocationState, setGeolocationState] = useState<GeolocationLegendState>({
    hasUserLocation: false,
  })
  const [cameraFocusRequest, setCameraFocusRequest] = useState<CameraFocusRequest | null>(null)
  const focusRequestSeqRef = useRef(0)
  const lastSyncedHashRef = useRef('')

  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    isProdUnconfigured ? 'unconfigured' : 'checking',
  )
  const [payload, setPayload] = useState<ApiStatusResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<string>('Never')

  const [orbitsPayload, setOrbitsPayload] = useState<SatelliteOrbitsResponse | null>(null)
  const [orbitsError, setOrbitsError] = useState<string | null>(null)
  const [nowUnixMs, setNowUnixMs] = useState<number>(() => Date.now())
  // Map centre for the satellite overpass request, read when the request is made
  const viewportRef = useRef<{ lat: number; lng: number }>({
    lat: initialResolution.state.lat,
    lng: initialResolution.state.lng,
  })
  const showOrbitsRef = useRef<boolean>(showOrbits)
  const orbitsAbortRef = useRef<AbortController | null>(null)
  const orbitsRequestIdRef = useRef(0)
  const lastHudCenterRef = useRef<{ lat: number; lng: number } | null>(null)
  const lastOrbitsFetchedAtMsRef = useRef<number>(0)

  useEffect(() => {
    viewportRef.current = { lat: viewport.lat, lng: viewport.lng }
  }, [viewport])

  useEffect(() => {
    showOrbitsRef.current = showOrbits
  }, [showOrbits])

  const [fireSpotsPayload, setFireSpotsPayload] = useState<FirmsLiveSpotsResponse | null>(null)
  const [fireSpotsLoading, setFireSpotsLoading] = useState<boolean>(!isProdUnconfigured)
  const [fireSpotsError, setFireSpotsError] = useState<string | null>(null)

  useEffect(() => {
    lastSyncedHashRef.current = syncUrlHashAndStorage({
      ...viewport,
      sensorFilter,
      projectionMode,
      showOrbits,
      showClouds,
      showRain,
      rainBackMinutes,
      showNightLights,
      showFires,
      extraParams,
    })
  }, [
    viewport,
    sensorFilter,
    projectionMode,
    showOrbits,
    showClouds,
    showRain,
    rainBackMinutes,
    showNightLights,
    showFires,
    extraParams,
  ])

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === lastSyncedHashRef.current) {
        return
      }
      const parsed = parseUrlHash(window.location.hash)
      if (!parsed) {
        return
      }
      setSensorFilter(parsed.sensorFilter)
      setProjectionMode(parsed.projectionMode)
      setShowOrbits(parsed.showOrbits)
      setShowClouds(parsed.showClouds)
      setShowRain(parsed.showRain)
      setRainBackMinutes(parsed.rainBackMinutes)
      setShowNightLights(parsed.showNightLights)
      setShowFires(parsed.showFires)
      setExtraParams(parsed.extraParams)
      setViewport({
        zoom: parsed.zoom,
        lat: parsed.lat,
        lng: parsed.lng,
      })
      setCameraFocusRequest({
        lng: parsed.lng,
        lat: parsed.lat,
        zoom: parsed.zoom,
        animate: false,
        requestId: ++focusRequestSeqRef.current,
      })
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const applySuccess = (data: ApiStatusResponse) => {
    setPayload(data)
    setConnectionState('connected')
    setErrorMessage(null)
    setLastChecked(new Date().toLocaleTimeString())
  }

  const applyFailure = (error: unknown) => {
    setPayload(null)
    setConnectionState('unreachable')
    setLastChecked(new Date().toLocaleTimeString())
    setErrorMessage(error instanceof Error ? error.message : 'Request failed')
  }

  const applyFiresSuccess = (data: FirmsLiveSpotsResponse) => {
    setFireSpotsPayload(data)
    setFireSpotsError(null)
    setFireSpotsLoading(false)
  }

  const applyFiresFailure = (error: unknown) => {
    setFireSpotsError(error instanceof Error ? error.message : 'NASA FIRMS feed unavailable')
    setFireSpotsLoading(false)
  }

  const requestSatelliteOrbits = useCallback((center: { lat: number; lng: number }) => {
    if (isProdUnconfigured) {
      return
    }
    orbitsAbortRef.current?.abort()
    const controller = new AbortController()
    orbitsAbortRef.current = controller
    const requestId = ++orbitsRequestIdRef.current
    const targetCenter = { lat: center.lat, lng: center.lng }
    lastHudCenterRef.current = targetCenter

    void fetchSatelliteOrbits(apiBaseUrl, controller.signal, targetCenter).then(
      (data) => {
        if (controller.signal.aborted || requestId !== orbitsRequestIdRef.current) {
          return
        }
        lastOrbitsFetchedAtMsRef.current = Date.now()
        setOrbitsPayload(data)
        setOrbitsError(null)
        setNowUnixMs(Date.now())
      },
      (error: unknown) => {
        if (controller.signal.aborted || requestId !== orbitsRequestIdRef.current) {
          return
        }
        lastHudCenterRef.current = null
        setOrbitsError(error instanceof Error ? error.message : 'Orbit feed unavailable')
      },
    )
  }, [])

  const handleCheckBackend = () => {
    if (isProdUnconfigured) {
      setConnectionState('unconfigured')
      setPayload(null)
      setErrorMessage(null)
      return
    }
    setConnectionState('checking')
    setErrorMessage(null)
    setOrbitsError(null)
    setCloudRefreshNonce((value) => value + 1)
    setFireSpotsError(null)
    setFireSpotsLoading(true)
    void fetchApiStatus().then(applySuccess, applyFailure)
    requestSatelliteOrbits(viewportRef.current)
    void fetchLiveFireSpots(apiBaseUrl).then(applyFiresSuccess, applyFiresFailure)
  }

  useEffect(() => {
    if (isProdUnconfigured) {
      return
    }
    const controller = new AbortController()
    void fetchApiStatus(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          applySuccess(data)
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          applyFailure(error)
        }
      },
    )

    const refreshFires = () => {
      void fetchLiveFireSpots(apiBaseUrl, controller.signal).then(
        (data) => {
          if (!controller.signal.aborted) {
            applyFiresSuccess(data)
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            applyFiresFailure(error)
          }
        },
      )
    }

    const maybeRefreshOrbitsOnSchedule = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      const targetIntervalMs = showOrbitsRef.current
        ? SATELLITE_ORBITS_REFRESH_INTERVAL_MS
        : SATELLITE_ORBITS_IDLE_REFRESH_INTERVAL_MS
      if (Date.now() - lastOrbitsFetchedAtMsRef.current >= targetIntervalMs - 1_000) {
        requestSatelliteOrbits(viewportRef.current)
      }
    }

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'hidden') {
        return
      }
      const now = Date.now()
      setNowUnixMs(now)
      const targetIntervalMs = showOrbitsRef.current
        ? SATELLITE_ORBITS_REFRESH_INTERVAL_MS
        : SATELLITE_ORBITS_IDLE_REFRESH_INTERVAL_MS
      const movedWhileHidden =
        showOrbitsRef.current &&
        hasSatelliteHudCenterMoved(lastHudCenterRef.current, viewportRef.current)
      if (movedWhileHidden || now - lastOrbitsFetchedAtMsRef.current >= targetIntervalMs) {
        requestSatelliteOrbits(viewportRef.current)
      }
    }

    requestSatelliteOrbits(viewportRef.current)
    refreshFires()
    const orbitsTimer = window.setInterval(
      maybeRefreshOrbitsOnSchedule,
      SATELLITE_ORBITS_REFRESH_INTERVAL_MS,
    )
    const firesTimer = window.setInterval(refreshFires, FIRES_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(orbitsTimer)
      window.clearInterval(firesTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      controller.abort()
      orbitsAbortRef.current?.abort()
    }
  }, [requestSatelliteOrbits])

  useEffect(() => {
    if (isProdUnconfigured || !showOrbits) {
      return
    }
    const center = { lat: viewport.lat, lng: viewport.lng }
    if (!hasSatelliteHudCenterMoved(lastHudCenterRef.current, center)) {
      return
    }
    const timer = window.setTimeout(() => {
      requestSatelliteOrbits(center)
    }, SATELLITE_HUD_VIEWPORT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [viewport.lat, viewport.lng, showOrbits, requestSatelliteOrbits])

  useEffect(() => {
    if (!orbitsPayload || !showOrbits) {
      return
    }
    const panelClockIntervalMs = selectedSatelliteId ? 1_000 : 15_000
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      setNowUnixMs(Date.now())
    }, panelClockIntervalMs)
    return () => window.clearInterval(timer)
  }, [orbitsPayload, showOrbits, selectedSatelliteId])

  const satellites = orbitsPayload?.satellites ?? EMPTY_SATELLITES

  const orbitalState = useMemo(
    () => computeLiveOrbitalState(satellites, sensorFilter, nowUnixMs, showOrbits),
    [satellites, sensorFilter, nowUnixMs, showOrbits],
  )

  const overpassBucketMs = Math.floor(nowUnixMs / 300_000) * 300_000
  const overpassIndex = useMemo(
    () => buildSatelliteOverpassIndex(orbitsPayload?.satellites, overpassBucketMs),
    [orbitsPayload, overpassBucketMs],
  )

  const hudElapsedMinutes = computeSatelliteHudElapsedMinutes(
    orbitsPayload?.generatedAtUtc,
    nowUnixMs,
  )

  const satelliteHudSection = useMemo(
    () =>
      formatSatelliteHudSection(orbitsPayload?.satelliteHud ?? [], {
        sensorFilter,
        showOrbits,
        elapsedMinutes: hudElapsedMinutes,
      }),
    [orbitsPayload, sensorFilter, showOrbits, hudElapsedMinutes],
  )

  const hasOrbitSnapshots = showOrbits && orbitalState.snapshots.length > 0

  const handleSelectSatellite = (satellite: LiveSatelliteSnapshot) => {
    // The snapshot can be minutes old (positions only tick while orbits are shown): fly to where
    // the satellite is now.
    const now = Date.now()
    const orbit = orbitsPayload?.satellites.find((sat) => sat.id === satellite.id)
    const position = orbit ? interpolateTrackAtTime(orbit, now) : satellite
    setSelectedSatelliteId(satellite.id)
    setShowOrbits(true)
    setNowUnixMs(now)
    setCameraFocusRequest({
      lng: position.lng,
      lat: position.lat,
      zoom: FOCUS_ZOOM,
      animate: true,
      requestId: ++focusRequestSeqRef.current,
    })
  }

  const satelliteFeedState: SatelliteFeedState =
    isProdUnconfigured || (orbitsError && !orbitsPayload)
      ? 'unavailable'
      : !orbitsPayload
        ? 'loading'
        : orbitalState.snapshots.length === 0
          ? 'empty'
          : 'ready'

  const fireSummary = useMemo(
    () => summarizeFireSpotsForSensor(fireSpotsPayload, sensorFilter),
    [fireSpotsPayload, sensorFilter],
  )

  const tleSourceSummary = useMemo(() => {
    if (!orbitsPayload || orbitsPayload.satellites.length === 0) {
      return null
    }
    const sources = new Set(orbitsPayload.satellites.map((sat) => sat.tleSource))
    return [...sources].join(', ')
  }, [orbitsPayload])

  const rainSummaryLabel = useMemo(() => {
    let utcHhMm = ''
    if (rainMetadata.effectiveTimeIso) {
      const parsed = new Date(rainMetadata.effectiveTimeIso)
      if (!Number.isNaN(parsed.getTime())) {
        const hh = String(parsed.getUTCHours()).padStart(2, '0')
        const mm = String(parsed.getUTCMinutes()).padStart(2, '0')
        utcHhMm = `${hh}:${mm} UTC`
      }
    }
    return `IMERG 30m · ${formatRainLookbackLabel(rainBackMinutes)}${utcHhMm ? ` · ${utcHhMm}` : ''}`
  }, [rainBackMinutes, rainMetadata.effectiveTimeIso])

  return (
    <div className="app-frame" style={DATA_PALETTE_CSS_VARIABLES}>
      <header className="top-bar wrapper-surface">
        <h1>Earth Fire Calendar</h1>
        <p className="brand-subtitle">Explore active fires detected by satellites</p>
      </header>

      <EarthMapStage
        sensorFilter={sensorFilter}
        projectionMode={projectionMode}
        onProjectionModeChange={setProjectionMode}
        initialViewport={initialResolution.state}
        onViewportChange={setViewport}
        cameraFocusRequest={cameraFocusRequest}
        autoLocateOnMount={initialResolution.source === 'default'}
        geolocationMaxZoom={DEFAULT_GEOLOCATION_MAX_ZOOM}
        apiBaseUrl={apiBaseUrl}
        cloudsDisabled={isProdUnconfigured}
        showClouds={showClouds}
        onShowCloudsChange={setShowClouds}
        showRain={showRain}
        onShowRainChange={setShowRain}
        rainBackMinutes={rainBackMinutes}
        onRainBackMinutesChange={setRainBackMinutes}
        rainMetadata={rainMetadata}
        onRainMetadataChange={setRainMetadata}
        cloudRefreshNonce={cloudRefreshNonce}
        showNightLights={showNightLights}
        onShowNightLightsChange={setShowNightLights}
        satellites={satellites}
        orbitalState={orbitalState}
        overpassIndex={overpassIndex}
        satelliteHudSection={satelliteHudSection}
        showOrbits={showOrbits}
        onShowOrbitsChange={(next) => {
          setShowOrbits(next)
          if (next) {
            setNowUnixMs(Date.now())
          }
        }}
        selectedSatelliteId={selectedSatelliteId}
        onSelectSatellite={handleSelectSatellite}
        onGeolocationStateChange={setGeolocationState}
        onReducedMotionChange={setReducedMotion}
        fireSpotsPayload={fireSpotsPayload}
        showFires={showFires}
        onShowFiresChange={setShowFires}
        pulsePaused={pulsePaused}
        onPulsePausedChange={setPulsePaused}
      />

      <SidePanel
        sensorFilter={sensorFilter}
        onSensorFilterChange={setSensorFilter}
        satelliteFeedState={satelliteFeedState}
        satellites={orbitalState.snapshots}
        selectedSatelliteId={selectedSatelliteId}
        onSelectSatellite={handleSelectSatellite}
        connectionState={connectionState}
        apiPayload={payload}
        apiErrorMessage={errorMessage}
        lastChecked={lastChecked}
        onCheckApi={handleCheckBackend}
        tleSourceSummary={tleSourceSummary}
        orbitsError={orbitsError}
        liveFires={{
          state: isProdUnconfigured
            ? 'unconfigured'
            : fireSpotsError && !fireSpotsPayload
              ? 'unavailable'
              : fireSpotsLoading && !fireSpotsPayload
                ? 'loading'
                : fireSpotsPayload
                  ? 'ready'
                  : 'loading',
          payload: fireSpotsPayload,
          summary: fireSummary,
          refreshFailed: fireSpotsPayload !== null && fireSpotsError !== null,
        }}
      />

      <MapLegend
        viewport={viewport}
        showSwaths={hasOrbitSnapshots}
        showModisOrbits={hasOrbitSnapshots && sensorFilter !== 'viirs'}
        showViirsOrbits={hasOrbitSnapshots && sensorFilter !== 'modis'}
        showRain={showRain}
        rainSummaryLabel={rainSummaryLabel}
        showUserLocation={geolocationState.hasUserLocation}
        hasLiveFires={fireSpotsPayload !== null}
        showFires={showFires}
        reducedMotion={reducedMotion}
      />
    </div>
  )
}

export default App
