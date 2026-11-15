import type { SensorFilter } from '../../data/mapTypes'
import { downloadFireSlice } from '../../utils/exportSlice'
import type { FireSpotsSensorSummary, FirmsLiveSpotsResponse } from '../../utils/fireSpots'
import { SurfaceSensorTable } from './SurfaceSensorTable'

export type LiveFiresState = 'unconfigured' | 'unavailable' | 'loading' | 'ready'

export interface LiveFiresInfo {
  state: LiveFiresState
  payload: FirmsLiveSpotsResponse | null
  summary: FireSpotsSensorSummary
  sensorFilter: SensorFilter
  // A later refresh failed while an earlier snapshot is still shown
  refreshFailed: boolean
  enrichmentStopped: boolean
  onRetry?: () => void
  retrying?: boolean
}

const SENSOR_FILTER_LABELS: Record<SensorFilter, string> = {
  harmonized: 'All sensors',
  modis: 'MODIS',
  viirs: 'VIIRS',
}

const count = (value: number) => value.toLocaleString('en-US')

function formatUtcTimestamp(iso: string | null): string {
  if (!iso) {
    return 'N/A'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return 'N/A'
  }
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

// Live NASA FIRMS detections of the last 24 hours.
export function LiveFiresSection({ info }: { info: LiveFiresInfo }) {
  const { state, payload, summary, sensorFilter, refreshFailed, enrichmentStopped, onRetry, retrying } = info
  const enrichmentStatus = enrichmentStopped ? 'incomplete' : payload?.enrichmentStatus
  const classifiedCount = payload
    ? payload.spots.reduce((count, spot) => (spot[9] ? count + 1 : count), 0)
    : 0

  return (
    <section className="panel-section" aria-labelledby="live-fires-heading">
      <h2 id="live-fires-heading">Live active fire spots (NASA FIRMS &middot; 24h)</h2>
      <div className="live-fire-status" role="status" aria-label="Data service and fire enrichment">
        <span className="api-indicator" data-state={connectionState}>
          <span className="api-dot" aria-hidden="true" />
          {CONNECTION_SHORT_LABELS[connectionState]}
        </span>
        {payload && (
          <dl className="live-fire-stages">
            <div>
              <dt>Detections</dt>
              <dd>{count(payload.count)} loaded</dd>
            </div>
            <div>
              <dt>Observation geometry</dt>
              <dd>{geometry ? (
                <>
                  {count(geometry.readyCount)} ready &middot; {count(geometry.pendingCount)} pending
                  {geometry.totalCount > geometry.readyCount + geometry.pendingCount &&
                    <small>{count(geometry.totalCount - geometry.readyCount - geometry.pendingCount)} unavailable</small>}
                </>
              ) : payload.geometryStatus === 'unavailable' ? 'Unavailable' : payload.geometryStatus === 'ready' ? 'Ready' : 'Pending'}</dd>
            </div>
            <div>
              <dt>Land cover</dt>
              <dd>{payload.landCoverPending ? 'Processing' : 'Checked'}</dd>
            </div>
            <div>
              <dt title="Detections with the same coordinates and acquisition time share one weather sample">Weather</dt>
              <dd>{weather ? (
                <>
                  {count(weather.sampledCount)} of {count(weather.targetCount)} checked &middot; {count(weatherPending)} pending
                  {weather.availableCount !== undefined && <small>{count(weather.availableCount)} with data</small>}
                  {!!weather.retryCount && <small>{count(weather.retryCount)} awaiting retry</small>}
                  {weather.eligibleCount > weather.targetCount &&
                    <small>{count(weather.eligibleCount - weather.targetCount)} outside the bulk target</small>}
                </>
              ) : 'Waiting for first check'}</dd>
            </div>
          </dl>
        )}
        {enrichmentCheck && payload && (
          <small className="live-fire-status-update">
            Last checked {new Date(enrichmentCheck.checkedAt).toLocaleTimeString()}
            {enrichmentCheck.delayed && ' · Waiting for updates, checking again'}
          </small>
        )}
      </div>
      {state === 'unconfigured' ? (
        <p className="panel-note">
          Live NASA FIRMS fire spots need the data service, which this build is not connected to.
        </p>
      ) : state === 'unavailable' ? (
        <>
          <p className="panel-note">
            Live NASA FIRMS fire spots are unavailable right now.
          </p>
          {onRetry && (
            <button
              type="button"
              className="secondary-btn"
              aria-disabled={retrying}
              onClick={() => {
                if (!retrying) onRetry()
              }}
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          )}
        </>
      ) : state === 'loading' || !payload ? (
        <p className="panel-note">
          Fetching global 24h NASA FIRMS hotspots (MODIS 1 km &amp; VIIRS 375 m)&hellip;
        </p>
      ) : (
        <>
          <div className="baseline-compare live-fire-metrics">
            <div className="metric-tile">
              <span className="metric-label">Peak FRP</span>
              <span className="metric-value">
                {summary.totalCount > 0 ? `${summary.maxFrpMw.toFixed(1)} MW` : '—'}
              </span>
            </div>
            <div className="metric-tile">
              <span className="metric-label">MODIS 1 km</span>
              <span className="metric-value">{summary.modisCount.toLocaleString('en-US')}</span>
            </div>
            <div className="metric-tile">
              <span className="metric-label">VIIRS 375 m</span>
              <span className="metric-value">{summary.viirsCount.toLocaleString('en-US')}</span>
            </div>
          </div>
          <p className="panel-note">
            Latest detection: <strong>{formatUtcTimestamp(summary.latestAcquiredAtUtc)}</strong>{' '}
            &middot; Snapshot fetched {formatUtcTimestamp(payload.fetchedAtUtc)}
            {payload.stale ? ' (cached fallback)' : ''}.
          </p>
          <p className="panel-note">
            Surface classified for {classifiedCount.toLocaleString('en-US')} of{' '}
            {payload.spots.length.toLocaleString('en-US')} detections (ESA CCI Land Cover 2019)
            {payload.landCoverPending ? ' — still loading…' : ''}.
          </p>
          <p className="panel-note">
            Pulse strength reflects detection age (&lt;24h), dot scale reflects Fire Radiative Power
            (MW), and dot brightness reflects sensor confidence. Hover over a spot to preview its
            details or select it to pin them under Sensors.
          </p>
          {refreshFailed && (
            <p className="panel-note">Latest refresh failed; showing the earlier snapshot.</p>
          )}
          <div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => downloadFireSlice(payload, sensorFilter)}
            >
              Download slice (CSV)
            </button>
            <p className="panel-note">
              Raw detections as loaded, before harmonization — one row per detection with its
              surface-class fractions.
            </p>
          </div>
          <SurfaceSensorTable payload={payload} sensorFilter={sensorFilter} />
        </>
      )}
    </section>
  )
}
