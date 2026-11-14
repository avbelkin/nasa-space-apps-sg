import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { EarthMapStage, type CameraFocusRequest } from './components/EarthMapStage'
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
  type LiveSatelliteSnapshot,
  type SatelliteOrbitsResponse,
} from './utils/satelliteOrbits'

const ORBITS_REFRESH_INTERVAL_MS = 20 * 60 * 1000
const FOCUS_ZOOM = 3.6

function App() {
  const [initialResolution] = useState(resolveInitialUrlHashState)
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
  const [viewport, setViewport] = useState<MapViewportState>(() => ({
    zoom: initialResolution.state.zoom,
    lat: initialResolution.state.lat,
    lng: initialResolution.state.lng,
  }))
  const [extraParams, setExtraParams] = useState<Record<string, string> | undefined>(
    initialResolution.state.extraParams,
  )
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string | null>(null)
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

  useEffect(() => {
    lastSyncedHashRef.current = syncUrlHashAndStorage({
      ...viewport,
      viewMode,
      sensorFilter,
      projectionMode,
      selectedMonth,
      showOrbits,
      extraParams,
    })
  }, [viewport, viewMode, sensorFilter, projectionMode, selectedMonth, showOrbits, extraParams])

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
    void fetchApiStatus().then(applySuccess, applyFailure)
    void fetchSatelliteOrbits(apiBaseUrl).then(applyOrbitsSuccess, applyOrbitsFailure)
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
      void fetchSatelliteOrbits(apiBaseUrl, controller.signal).then(
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

    refreshOrbits()
    const refreshTimer = window.setInterval(refreshOrbits, ORBITS_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(refreshTimer)
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!orbitsPayload || !showOrbits) {
      return
    }
    const timer = window.setInterval(() => {
      setNowUnixMs(Date.now())
    }, 1000)
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

  const monthProfile = MONTHLY_PROFILE[selectedMonth]
  const evaluatedRegions = useMemo(
    () => evaluateRegionsForMonth(selectedMonth, sensorFilter),
    [selectedMonth, sensorFilter],
  )

  const handleSelectSatellite = (satellite: LiveSatelliteSnapshot) => {
    setSelectedSatelliteId(satellite.id)
    setShowOrbits(true)
    setNowUnixMs(Date.now())
    setCameraFocusRequest({
      lng: satellite.lng,
      lat: satellite.lat,
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

  const satelliteFeedState: SatelliteFeedState =
    isProdUnconfigured || (orbitsError && !orbitsPayload)
      ? 'unavailable'
      : orbitalState.snapshots.length === 0
        ? 'loading'
        : 'ready'

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
      </header>

      <EarthMapStage
        selectedMonth={selectedMonth}
        sensorFilter={sensorFilter}
        projectionMode={projectionMode}
        onProjectionModeChange={setProjectionMode}
        initialViewport={initialResolution.state}
        onViewportChange={setViewport}
        cameraFocusRequest={cameraFocusRequest}
        autoLocateOnMount={initialResolution.source === 'default'}
        geolocationMaxZoom={DEFAULT_GEOLOCATION_MAX_ZOOM}
        orbitalState={orbitalState}
        showOrbits={showOrbits}
        onShowOrbitsChange={(next) => {
          setShowOrbits(next)
          if (next) {
            setNowUnixMs(Date.now())
          }
        }}
        selectedSatelliteId={selectedSatelliteId}
        onSelectSatellite={handleSelectSatellite}
      />

      <MonthStrip selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />

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
      />
    </div>
  )
}

export default App
