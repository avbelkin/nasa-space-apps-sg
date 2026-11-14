import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  EarthMapStage,
  type CameraFocusRequest,
  type GeolocationLegendState,
} from './components/EarthMapStage'
import { MapLegend } from './components/MapLegend'
import { MonthStrip } from './components/MonthStrip'
import type { SatelliteFeedState } from './components/panel/SatelliteDetails'
import { SidePanel } from './components/SidePanel'
import { DATA_PALETTE_CSS_VARIABLES } from './data/dataPalette'
import {
  evaluateRegionsForMonth,
  MONTHLY_PROFILE,
  type ProjectionMode,
  type RegionalEvaluatedRegime,
  type SensorFilter,
  type ViewMode,
} from './data/stubSeasonalData'
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
  fetchSatelliteOrbits,
  formatSatelliteHudSection,
  interpolateTrackAtTime,
  SATELLITE_ANIMATION_INTERVAL_MS,
  type LiveSatelliteSnapshot,
  type SatelliteOrbitsResponse,
} from './utils/satelliteOrbits'
import {
  fetchLiveFireSpots,
  summarizeFireSpotsForSensor,
  type FirmsLiveSpotsResponse,
} from './utils/fireSpots'

const ORBITS_REFRESH_INTERVAL_MS = 20 * 60 * 1000
const FIRES_REFRESH_INTERVAL_MS = 15 * 60 * 1000
const FOCUS_ZOOM = 3.6

function App() {
  const [todayMonth] = useState(() => new Date().getMonth())
  const [initialResolution] = useState(() => resolveInitialUrlHashState())
  // No UI for the view mode any more; kept so the `mode` key in old links still round-trips.
  const [viewMode, setViewMode] = useState<ViewMode>(initialResolution.state.viewMode)
  const [sensorFilter, setSensorFilter] = useState<SensorFilter>(
    initialResolution.state.sensorFilter,
  )
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>(
    initialResolution.state.projectionMode,
  )
  const [selectedMonth, setSelectedMonth] = useState<number>(
    initialResolution.state.selectedMonth,
  )
  const [showOrbits, setShowOrbits] = useState<boolean>(initialResolution.state.showOrbits)
  const [showClouds, setShowClouds] = useState<boolean>(initialResolution.state.showClouds)
  const [cloudRefreshNonce, setCloudRefreshNonce] = useState<number>(0)
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
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(
    initialResolution.state.selectedRegionId ?? null,
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

  useEffect(() => {
    viewportRef.current = { lat: viewport.lat, lng: viewport.lng }
  }, [viewport])

  const [fireSpotsPayload, setFireSpotsPayload] = useState<FirmsLiveSpotsResponse | null>(null)
  const [fireSpotsLoading, setFireSpotsLoading] = useState<boolean>(!isProdUnconfigured)
  const [fireSpotsError, setFireSpotsError] = useState<string | null>(null)

  useEffect(() => {
    lastSyncedHashRef.current = syncUrlHashAndStorage({
      ...viewport,
      viewMode,
      sensorFilter,
      projectionMode,
      selectedMonth,
      showOrbits,
      showClouds,
      showFires,
      ...(selectedRegionId ? { selectedRegionId } : {}),
      extraParams,
    })
  }, [
    viewport,
    viewMode,
    sensorFilter,
    projectionMode,
    selectedMonth,
    showOrbits,
    showClouds,
    showFires,
    selectedRegionId,
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
      setViewMode(parsed.viewMode)
      setSensorFilter(parsed.sensorFilter)
      setProjectionMode(parsed.projectionMode)
      setSelectedMonth(parsed.selectedMonth)
      setShowOrbits(parsed.showOrbits)
      setShowClouds(parsed.showClouds)
      setShowFires(parsed.showFires)
      setSelectedRegionId(parsed.selectedRegionId ?? null)
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

  const applyOrbitsSuccess = (data: SatelliteOrbitsResponse) => {
    setOrbitsPayload(data)
    setOrbitsError(null)
    setNowUnixMs(Date.now())
  }

  const applyOrbitsFailure = (error: unknown) => {
    setOrbitsError(error instanceof Error ? error.message : 'Orbit feed unavailable')
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
    void fetchSatelliteOrbits(apiBaseUrl, undefined, viewportRef.current).then(
      applyOrbitsSuccess,
      applyOrbitsFailure,
    )
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

    const refreshOrbits = () => {
      void fetchSatelliteOrbits(apiBaseUrl, controller.signal, viewportRef.current).then(
        (data) => {
          if (!controller.signal.aborted) {
            applyOrbitsSuccess(data)
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            applyOrbitsFailure(error)
          }
        },
      )
    }

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

    refreshOrbits()
    refreshFires()
    const orbitsTimer = window.setInterval(refreshOrbits, ORBITS_REFRESH_INTERVAL_MS)
    const firesTimer = window.setInterval(refreshFires, FIRES_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(orbitsTimer)
      window.clearInterval(firesTimer)
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!orbitsPayload || !showOrbits) {
      return
    }
    const timer = window.setInterval(() => {
      setNowUnixMs(Date.now())
    }, SATELLITE_ANIMATION_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [orbitsPayload, showOrbits])

  const orbitalState = useMemo(
    () =>
      computeLiveOrbitalState(
        orbitsPayload?.satellites ?? [],
        sensorFilter,
        nowUnixMs,
        showOrbits,
      ),
    [orbitsPayload, sensorFilter, nowUnixMs, showOrbits],
  )

  const satelliteHudSection = useMemo(
    () =>
      formatSatelliteHudSection(orbitsPayload?.satelliteHud ?? [], { sensorFilter, showOrbits }),
    [orbitsPayload, sensorFilter, showOrbits],
  )

  const hasOrbitSnapshots = showOrbits && orbitalState.snapshots.length > 0

  const monthProfile = MONTHLY_PROFILE[selectedMonth]
  const evaluatedRegions = useMemo(
    () => evaluateRegionsForMonth(selectedMonth, sensorFilter),
    [selectedMonth, sensorFilter],
  )

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

  const handleSelectRegion = (region: RegionalEvaluatedRegime) => {
    setSelectedRegionId(region.id)
    setCameraFocusRequest({
      lng: region.coordinates[0],
      lat: region.coordinates[1],
      zoom: FOCUS_ZOOM,
      animate: true,
      requestId: ++focusRequestSeqRef.current,
    })
  }

  // A map click selects in place: the user is already looking at the mark, so the camera stays.
  const handleSelectRegionOnMap = (regionId: string) => {
    setSelectedRegionId(regionId)
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

  return (
    <div className="app-frame" style={DATA_PALETTE_CSS_VARIABLES}>
      <header className="top-bar wrapper-surface">
        <h1>Earth Fire Calendar</h1>
        <p className="brand-subtitle">See where fire activity is above or below typical</p>
        <p className="sample-badge top-bar-badge">
          {/* Fire spots are live NASA FIRMS detections; the regional index is not, yet */}
          Sample index
          <span className="visually-hidden">
            : the regional fire activity index and the month strip use illustrative values
          </span>
        </p>
      </header>

      <EarthMapStage
        selectedMonth={selectedMonth}
        viewMode={viewMode}
        sensorFilter={sensorFilter}
        projectionMode={projectionMode}
        onProjectionModeChange={setProjectionMode}
        initialViewport={initialResolution.state}
        onViewportChange={setViewport}
        cameraFocusRequest={cameraFocusRequest}
        geolocationMaxZoom={DEFAULT_GEOLOCATION_MAX_ZOOM}
        apiBaseUrl={apiBaseUrl}
        cloudsDisabled={isProdUnconfigured}
        showClouds={showClouds}
        onShowCloudsChange={setShowClouds}
        cloudRefreshNonce={cloudRefreshNonce}
        orbitalState={orbitalState}
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
        selectedRegionId={selectedRegionId}
        onSelectRegion={handleSelectRegionOnMap}
        onGeolocationStateChange={setGeolocationState}
        onReducedMotionChange={setReducedMotion}
        fireSpotsPayload={fireSpotsPayload}
        liveFiresConfigured={!isProdUnconfigured}
        showFires={showFires}
        onShowFiresChange={setShowFires}
        pulsePaused={pulsePaused}
        onPulsePausedChange={setPulsePaused}
      />

      <MonthStrip
        selectedMonth={selectedMonth}
        todayMonth={todayMonth}
        onSelectMonth={setSelectedMonth}
      />

      <SidePanel
        selectedMonth={selectedMonth}
        monthProfile={monthProfile}
        sensorFilter={sensorFilter}
        onSensorFilterChange={setSensorFilter}
        regions={evaluatedRegions}
        selectedRegionId={selectedRegionId}
        onSelectRegion={handleSelectRegion}
        onClearRegion={() => setSelectedRegionId(null)}
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
        liveFiresConfigured={!isProdUnconfigured}
      />

      <MapLegend
        selectedMonth={selectedMonth}
        viewport={viewport}
        showSwaths={hasOrbitSnapshots}
        showModisOrbits={hasOrbitSnapshots && sensorFilter !== 'viirs'}
        showViirsOrbits={hasOrbitSnapshots && sensorFilter !== 'modis'}
        showUserLocation={geolocationState.hasUserLocation}
        hasLiveFires={fireSpotsPayload !== null}
        showFires={showFires}
        viewMode={viewMode}
        reducedMotion={reducedMotion}
      />
    </div>
  )
}

export default App
