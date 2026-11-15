import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  EarthMapStage,
  type CameraFocusRequest,
  type GeolocationLegendState,
} from './components/EarthMapStage'
import { MapLegend } from './components/MapLegend'
import { PinnedFireDetails, type PinnedFireSelection } from './components/PinnedFireDetails'
import type { SatelliteFeedState } from './components/panel/SatelliteDetails'
import { SidePanel } from './components/SidePanel'
import { DATA_PALETTE_CSS_VARIABLES } from './data/dataPalette'
import type { ProjectionMode, SensorFilter } from './data/mapTypes'
import {
  apiBaseUrl,
  fetchApiStatus,
  isProdUnconfigured,
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
  buildFireSpotLandCoverLookup,
  isFireSelectionInPayload,
  fetchLiveFireSpots,
  summarizeFireSpotsForSensor,
  type FirmsLiveSpotsResponse,
} from './utils/fireSpots'
import type { RainLayerMetadata } from './utils/rainCloudShader'
import { readPinnedFireGeometry } from './utils/fireObservationGeometry'
import { buildSatelliteOverpassIndex } from './utils/satelliteOverpassTimeline'
import { FRP_FORECAST_LOOKAHEAD_MINUTES } from './utils/frpForecast'
import { fireEnrichmentDelay, fireEnrichmentProgressKey } from './state/fireEnrichment'

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
  const [showRain, setShowRain] = useState<boolean>(initialResolution.state.showRain)
  const [rainMetadata, setRainMetadata] = useState<RainLayerMetadata>({
    latestAvailableIso: null,
    effectiveTimeIso: null,
    lookbackMinutes: 0,
  })
  const [showNightLights, setShowNightLights] = useState<boolean>(
    initialResolution.state.showNightLights,
  )
  const [showFires, setShowFires] = useState<boolean>(initialResolution.state.showFires)
  const [sensorGroupColors, setSensorGroupColors] = useState(false)
  const colorFireSpotsBySensor = sensorFilter === 'harmonized' && sensorGroupColors
  const [pinnedFireSelection, setPinnedFireSelection] = useState<PinnedFireSelection | null>(null)
  const appFrameRef = useRef<HTMLDivElement | null>(null)
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
  const [fireEnrichmentCheck, setFireEnrichmentCheck] = useState<{ checkedAt: number; delayed: boolean } | null>(null)
  const [fireSpotsLoading, setFireSpotsLoading] = useState<boolean>(!isProdUnconfigured)
  const [fireSpotsError, setFireSpotsError] = useState<string | null>(null)
  const [firesRetrying, setFiresRetrying] = useState(false)
  const retryFiresRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    lastSyncedHashRef.current = syncUrlHashAndStorage({
      ...viewport,
      sensorFilter,
      projectionMode,
      showOrbits,
      showClouds,
      showRain,
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
      setShowNightLights(parsed.showNightLights)
      setShowFires(parsed.showFires)
      setPinnedFireSelection((selection) =>
        parsed.showFires && selection?.sensorFilter === parsed.sensorFilter ? selection : null,
      )
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

  const applyFiresSuccess = (data: FirmsLiveSpotsResponse) => {
    setFireSpotsPayload(data)
    setFireSpotsError(null)
    setFireSpotsLoading(false)
    setFiresRetrying(false)
  }

  const applyFiresFailure = (error: unknown) => {
    setFireSpotsError(error instanceof Error ? error.message : 'NASA FIRMS feed unavailable')
    setFireSpotsLoading(false)
    setFiresRetrying(false)
  }

  const handleRetryFires = useCallback(() => {
    setFiresRetrying(true)
    retryFiresRef.current?.()
  }, [])

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

  useEffect(() => {
    if (isProdUnconfigured) {
      return
    }
    const controller = new AbortController()
    void fetchApiStatus(controller.signal).then(
      () => {
        if (!controller.signal.aborted) {
          setConnectionState('connected')
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setConnectionState('unreachable')
        }
      },
    )

    let firesRefreshId = 0
    let enrichmentTimer: number | undefined
    let enrichmentInProgress = false
    let landCoverPending = false
    let geometryPending = false
    let requestGeometry = false
    let weatherPending = false
    let unchangedChecks = 0
    let lastProgress = ''

    const scheduleFireEnrichment = () => {
      if ((!landCoverPending && !geometryPending && !weatherPending) || enrichmentInProgress || enrichmentTimer !== undefined ||
          document.visibilityState === 'hidden') {
        return
      }
      const refreshId = firesRefreshId
      enrichmentTimer = window.setTimeout(async () => {
        enrichmentTimer = undefined
        if (controller.signal.aborted || document.visibilityState === 'hidden') return

        enrichmentInProgress = true
        try {
          const data = await fetchLiveFireSpots(apiBaseUrl, controller.signal, {
            landCover: landCoverPending,
            geometry: requestGeometry,
            weather: true,
          })
          if (!controller.signal.aborted && refreshId === firesRefreshId) {
            setFireSpotsPayload(data)
            landCoverPending = data.landCoverPending === true
            geometryPending = data.geometryStatus === 'pending'
            weatherPending = data.weather?.status === 'pending'
            const progress = fireEnrichmentProgressKey(data)
            unchangedChecks = lastProgress === progress ? unchangedChecks + 1 : 0
            lastProgress = progress
            setFireEnrichmentCheck({ checkedAt: Date.now(), delayed: unchangedChecks >= 3 &&
              (landCoverPending || geometryPending || weatherPending) })
          }
        } catch {
          // Keep the working fire feed when a deferred request fails.
          if (!controller.signal.aborted && refreshId === firesRefreshId) {
            unchangedChecks = Math.max(3, unchangedChecks + 1)
            setFireEnrichmentCheck((previous) => previous ? { ...previous, delayed: true } : previous)
          }
        } finally {
          enrichmentInProgress = false
          if (!controller.signal.aborted) scheduleFireEnrichment()
        }
      }, fireEnrichmentDelay(unchangedChecks))
    }

    const refreshFires = () => {
      const refreshId = ++firesRefreshId
      window.clearTimeout(enrichmentTimer)
      enrichmentTimer = undefined
      landCoverPending = false
      geometryPending = false
      requestGeometry = false
      weatherPending = false
      unchangedChecks = 0
      lastProgress = ''

      void fetchLiveFireSpots(apiBaseUrl, controller.signal).then(
        (data) => {
          if (!controller.signal.aborted && refreshId === firesRefreshId) {
            applyFiresSuccess(data)
            setFireEnrichmentCheck({ checkedAt: Date.now(), delayed: false })
            landCoverPending = data.landCoverPending === true
            geometryPending = data.geometryStatus === 'pending'
            requestGeometry = geometryPending
            weatherPending = data.weather ? data.weather.status === 'pending' : data.count > 0
            lastProgress = fireEnrichmentProgressKey(data)
            scheduleFireEnrichment()
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted && refreshId === firesRefreshId) {
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
      scheduleFireEnrichment()
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

    retryFiresRef.current = refreshFires
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
      window.clearTimeout(enrichmentTimer)
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

  // Keep a pinned card's relative times honest while it stays open across feed refreshes.
  useEffect(() => {
    if (!pinnedFireSelection) {
      return
    }
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      setNowUnixMs(Date.now())
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [pinnedFireSelection])

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
    () => buildSatelliteOverpassIndex(orbitsPayload?.satellites, overpassBucketMs, FRP_FORECAST_LOOKAHEAD_MINUTES),
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

  const landCoverBySpot = useMemo(
    () => buildFireSpotLandCoverLookup(fireSpotsPayload),
    [fireSpotsPayload],
  )
  const pinnedFeedGeometry = useMemo(
    () => readPinnedFireGeometry(fireSpotsPayload, pinnedFireSelection?.inputs),
    [fireSpotsPayload, pinnedFireSelection],
  )

  const fireSummary = useMemo(
    () => summarizeFireSpotsForSensor(fireSpotsPayload, sensorFilter),
    [fireSpotsPayload, sensorFilter],
  )

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
    return `IMERG 30m${utcHhMm ? ` · ${utcHhMm}` : ''}`
  }, [rainMetadata.effectiveTimeIso])

  const unpinFireSelection = useCallback(() => {
    const appFrame = appFrameRef.current
    if (appFrame?.querySelector('.pinned-fire-details')?.contains(document.activeElement)) {
      appFrame.querySelector<HTMLCanvasElement>('.maplibregl-canvas')?.focus()
    }
    setPinnedFireSelection(null)
  }, [])

  useEffect(() => {
    if (!pinnedFireSelection) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        unpinFireSelection()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [pinnedFireSelection, unpinFireSelection])

  return (
    <div ref={appFrameRef} className="app-frame" style={DATA_PALETTE_CSS_VARIABLES}>
      <header className="top-bar wrapper-surface">
        <h1>Earth Fire Calendar</h1>
        <p className="brand-subtitle">Explore active fires detected by satellites</p>
      </header>

      <EarthMapStage
        sensorFilter={sensorFilter}
        colorFireSpotsBySensor={colorFireSpotsBySensor}
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
        onRainMetadataChange={setRainMetadata}
        showNightLights={showNightLights}
        onShowNightLightsChange={setShowNightLights}
        satellites={satellites}
        orbitalState={orbitalState}
        pinnedFireSelection={pinnedFireSelection}
        onPinFireSelection={setPinnedFireSelection}
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
        landCoverBySpot={landCoverBySpot}
        showFires={showFires}
        onShowFiresChange={(next) => {
          if (!next) {
            setPinnedFireSelection(null)
          }
          setShowFires(next)
        }}
        pulsePaused={pulsePaused}
        onPulsePausedChange={setPulsePaused}
      />

      <SidePanel
        pinnedDetails={pinnedFireSelection && (
          <PinnedFireDetails
            selection={pinnedFireSelection}
            nowMs={nowUnixMs}
            notInLatestSnapshot={
              fireSpotsPayload !== null &&
              !isFireSelectionInPayload(pinnedFireSelection.inputs, fireSpotsPayload)
            }
            feedGeometry={pinnedFeedGeometry}
            fireFeed={fireSpotsPayload}
            forecastNowMs={orbitsPayload ? nowUnixMs : undefined}
            landCoverBySpot={landCoverBySpot}
            overpassIndex={overpassIndex}
            onUnpin={unpinFireSelection}
          />
        )}
        legend={
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
            colorFireSpotsBySensor={colorFireSpotsBySensor}
            reducedMotion={reducedMotion}
          />
        }
        sensorFilter={sensorFilter}
        colorFireSpotsBySensor={colorFireSpotsBySensor}
        onFireSensorColorsChange={setSensorGroupColors}
        onSensorFilterChange={(next) => {
          if (next !== sensorFilter) {
            setPinnedFireSelection(null)
          }
          setSensorFilter(next)
        }}
        satelliteFeedState={satelliteFeedState}
        satellites={orbitalState.snapshots}
        selectedSatelliteId={selectedSatelliteId}
        onSelectSatellite={handleSelectSatellite}
        onRetrySatellites={
          isProdUnconfigured ? undefined : () => requestSatelliteOrbits(viewportRef.current)
        }
        connectionState={connectionState}
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
          sensorFilter,
          refreshFailed: fireSpotsPayload !== null && fireSpotsError !== null,
          enrichmentCheck: fireEnrichmentCheck,
          onRetry: isProdUnconfigured ? undefined : handleRetryFires,
          retrying: firesRetrying,
        }}
      />
    </div>
  )
}

export default App
