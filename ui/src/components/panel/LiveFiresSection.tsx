import type { FireSpotsSensorSummary, FirmsLiveSpotsResponse } from '../../utils/fireSpots'

export type LiveFiresState = 'unconfigured' | 'unavailable' | 'loading' | 'ready'

export interface LiveFiresInfo {
  state: LiveFiresState
  payload: FirmsLiveSpotsResponse | null
  summary: FireSpotsSensorSummary
  // A later refresh failed while an earlier snapshot is still shown
  refreshFailed: boolean
  enrichmentStopped: boolean
}

const ENRICHMENT_LABELS = {
  pending: 'Spot enrichment in progress',
  complete: 'Spot enrichment complete',
  incomplete: 'Spot enrichment incomplete',
} as const

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
  const { state, payload, summary, refreshFailed, enrichmentStopped } = info
  const enrichmentStatus = enrichmentStopped ? 'incomplete' : payload?.enrichmentStatus

  return (
    <section className="panel-section" aria-labelledby="live-fires-heading">
      <h2 id="live-fires-heading">Live active fire spots (NASA FIRMS &middot; 24h)</h2>
      {state === 'unconfigured' ? (
        <p className="panel-note">
          Live NASA FIRMS fire spots need the data service, which this build is not connected to.
        </p>
      ) : state === 'unavailable' ? (
        <p className="panel-note">
          Live NASA FIRMS fire spots are unavailable right now.
        </p>
      ) : state === 'loading' || !payload ? (
        <p className="panel-note">
          Fetching global 24h NASA FIRMS hotspots (MODIS 1 km &amp; VIIRS 375 m)&hellip;
        </p>
      ) : (
        <>
          <div className="baseline-compare">
            <div className="metric-tile">
              <span className="metric-label">Active spots (24h)</span>
              <span className="metric-value">{summary.totalCount.toLocaleString('en-US')}</span>
            </div>
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
          {enrichmentStatus && (
            <p className="panel-note" role="status"
              title="Observation geometry and land cover processing for this snapshot. Fields can be missing where source data is unavailable.">
              {ENRICHMENT_LABELS[enrichmentStatus]}
            </p>
          )}
          <p className="panel-note">
            Pulse strength reflects detection age (&lt;24h), dot scale reflects Fire Radiative Power
            (MW), and dot brightness reflects sensor confidence. Hover over a spot to preview its
            details or select it to pin them under Sensors.
          </p>
          {refreshFailed && (
            <p className="panel-note">Latest refresh failed; showing the earlier snapshot.</p>
          )}
        </>
      )}
    </section>
  )
}
