import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { EarthMapStage } from './components/EarthMapStage'
import {
  evaluateRegionsForMonth,
  MONTHLY_PROFILE,
  type ProjectionMode,
  type SensorFilter,
  type ViewMode,
} from './data/stubSeasonalData'

interface ApiStatusResponse {
  service: string
  status: string
  environment: string
  framework: string
  timestampUtc: string
}

type ConnectionState = 'checking' | 'connected' | 'unreachable' | 'unconfigured'

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const apiBaseUrl = rawApiBaseUrl.trim().replace(/\/$/, '')
const statusEndpoint = apiBaseUrl ? `${apiBaseUrl}/api/status` : '/api/status'
const isProdUnconfigured = import.meta.env.PROD && !apiBaseUrl

const STATUS_LABELS: Record<ConnectionState, string> = {
  checking: 'Checking...',
  connected: 'Connected',
  unreachable: 'Unreachable',
  unconfigured: 'Not Configured',
}

async function fetchApiStatus(signal?: AbortSignal): Promise<ApiStatusResponse> {
  const response = await fetch(statusEndpoint, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as ApiStatusResponse
}

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('anomaly')
  const [sensorFilter, setSensorFilter] = useState<SensorFilter>('harmonized')
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('globe')
  const [selectedMonth, setSelectedMonth] = useState<number>(8)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [focusCoordinates, setFocusCoordinates] = useState<[number, number] | null>(null)

  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    isProdUnconfigured ? 'unconfigured' : 'checking',
  )
  const [payload, setPayload] = useState<ApiStatusResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<string>('Never')

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

  const handleCheckBackend = () => {
    if (isProdUnconfigured) {
      setConnectionState('unconfigured')
      setPayload(null)
      setErrorMessage(null)
      return
    }
    setConnectionState('checking')
    setErrorMessage(null)
    void fetchApiStatus().then(applySuccess, applyFailure)
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
    return () => controller.abort()
  }, [])

  const monthProfile = MONTHLY_PROFILE[selectedMonth]
  const evaluatedRegions = useMemo(
    () => evaluateRegionsForMonth(selectedMonth, sensorFilter),
    [selectedMonth, sensorFilter],
  )
  const monthDelta = monthProfile.currentIndex - monthProfile.typicalIndex

  return (
    <div className="app-frame">
      <header className="top-bar wrapper-surface">
        <div className="brand-group">
          <h1>NASA Space Apps SG &mdash; Earth Fire Calendar</h1>
          <p className="brand-subtitle">
            Earth-first MODIS &amp; VIIRS harmonization: seasonal dynamics vs. current calendar anomalies
          </p>
        </div>

        <nav className="mode-switch" aria-label="Earth analysis view mode">
          <button
            type="button"
            className="pill-button"
            aria-pressed={viewMode === 'anomaly'}
            onClick={() => setViewMode('anomaly')}
          >
            Anomaly vs. Typical
          </button>
          <button
            type="button"
            className="pill-button"
            aria-pressed={viewMode === 'seasonal'}
            onClick={() => setViewMode('seasonal')}
          >
            Seasonal Dynamics
          </button>
          <button
            type="button"
            className="pill-button"
            aria-pressed={viewMode === 'sensors'}
            onClick={() => setViewMode('sensors')}
          >
            Sensor Harmonization
          </button>
        </nav>

        <div className="api-health-inline">
          <span className="api-status-badge" aria-live="polite">
            API: {STATUS_LABELS[connectionState]}
          </span>
          <button
            type="button"
            className="api-check-btn"
            onClick={handleCheckBackend}
            disabled={connectionState === 'checking'}
          >
            Check API
          </button>
        </div>
      </header>

      <EarthMapStage
        selectedMonth={selectedMonth}
        viewMode={viewMode}
        sensorFilter={sensorFilter}
        onSensorFilterChange={setSensorFilter}
        projectionMode={projectionMode}
        onProjectionModeChange={setProjectionMode}
        focusCoordinates={focusCoordinates}
      />

      <section className="timeline-bar wrapper-surface" aria-labelledby="timeline-heading">
        <div className="timeline-header">
          <h2 id="timeline-heading">Seasonal &amp; Calendar Context ({monthProfile.label})</h2>
          <span className="timeline-status">
            {monthProfile.classification} ({monthDelta >= 0 ? `+${monthDelta}` : monthDelta} vs. typical baseline)
          </span>
        </div>

        <div className="month-track" role="group" aria-label="Select month on seasonal calendar">
          {MONTHLY_PROFILE.map((point) => (
            <button
              key={point.label}
              type="button"
              className="month-btn"
              aria-pressed={selectedMonth === point.monthIndex}
              onClick={() => setSelectedMonth(point.monthIndex)}
            >
              <span className="month-label">{point.label}</span>
              <span className="month-bars" aria-hidden="true">
                <span
                  className="month-bar month-bar-typical"
                  style={{ blockSize: `${Math.max(20, point.typicalIndex)}%` }}
                />
                <span
                  className="month-bar month-bar-current"
                  style={{ blockSize: `${Math.max(20, point.currentIndex)}%` }}
                />
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="side-panel wrapper-surface" aria-labelledby="inspector-heading">
        <section className="panel-section">
          <h2 id="inspector-heading">Current Fit vs. Typical Calendar</h2>
          <p className="panel-note">{monthProfile.summary}</p>
          <div className="baseline-compare">
            <div className="metric-tile">
              <span className="metric-label">Typical Baseline</span>
              <span className="metric-value">{monthProfile.typicalIndex}</span>
            </div>
            <div className="metric-tile">
              <span className="metric-label">Current Situation</span>
              <span className="metric-value">
                {monthProfile.currentIndex} ({monthDelta >= 0 ? `+${monthDelta}` : monthDelta})
              </span>
            </div>
          </div>
          <p className="panel-note">
            Illustrative stub harmonizer data across <code>{sensorFilter}</code> mode; select a region below to focus Earth.
          </p>
        </section>

        <section className="panel-section" aria-labelledby="regions-heading">
          <h3 id="regions-heading">Regional Regimes ({monthProfile.label})</h3>
          <ul className="region-list">
            {evaluatedRegions.map((regime) => (
              <li key={regime.id}>
                <button
                  type="button"
                  className="region-card-btn"
                  aria-pressed={selectedRegionId === regime.id}
                  onClick={() => {
                    setSelectedRegionId(regime.id)
                    setFocusCoordinates([...regime.coordinates])
                  }}
                >
                  <span className="region-card-top">
                    <span>{regime.region}</span>
                    <span className="region-delta">
                      {regime.delta >= 0 ? `+${regime.delta}` : regime.delta}
                    </span>
                  </span>
                  <span className="region-meta">
                    {regime.statusLabel} &middot; Current {regime.effectiveCurrent} vs. Typical {regime.effectiveTypical}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel-section" aria-labelledby="runtime-heading">
          <h3 id="runtime-heading">Backend &amp; Deployment</h3>
          <dl className="meta-list">
            <div className="meta-row">
              <dt>Mode / Base Path</dt>
              <dd>
                <code>{import.meta.env.MODE}</code> &middot; <code>{import.meta.env.BASE_URL}</code>
              </dd>
            </div>
            <div className="meta-row">
              <dt>API Endpoint</dt>
              <dd>
                <code>{apiBaseUrl ? statusEndpoint : 'Relative proxy (/api/status)'}</code>
              </dd>
            </div>
            <div className="meta-row">
              <dt>Backend Status</dt>
              <dd>
                {STATUS_LABELS[connectionState]}
                {isProdUnconfigured ? ' — set VITE_API_BASE_URL repository variable' : ''}
              </dd>
            </div>
            <div className="meta-row">
              <dt>Runtime</dt>
              <dd>
                {payload ? (
                  <>
                    <code>{payload.service}</code> ({payload.environment} &middot; {payload.framework})
                  </>
                ) : (
                  errorMessage ?? 'Unavailable'
                )}
              </dd>
            </div>
            <div className="meta-row">
              <dt>Last Checked</dt>
              <dd>{lastChecked}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  )
}

export default App
