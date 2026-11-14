import { CONNECTION_SHORT_LABELS, type ConnectionState } from '../../state/apiStatus'
import { ChevronDownIcon } from '../icons'

interface AttributionFooterProps {
  connectionState: ConnectionState
}

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

// One always-visible credit line plus the full text on demand, with a small API indicator.
export function AttributionFooter({ connectionState }: AttributionFooterProps) {
  return (
    <footer className="panel-footer">
      <p className="attribution-line">
        Data: <a href="https://firms.modaps.eosdis.nasa.gov/" {...EXTERNAL}>NASA FIRMS</a> (sample
        values) &middot; <a href="https://celestrak.org/" {...EXTERNAL}>CelesTrak</a> &middot;
        basemap <a href="https://s2maps.eu" {...EXTERNAL}>EOX</a> / Copernicus Sentinel-2. Not
        affiliated with NASA.
      </p>

      <div className="footer-meta">
        <span className="api-indicator" data-state={connectionState} aria-live="polite">
          <span className="api-dot" aria-hidden="true" />
          {CONNECTION_SHORT_LABELS[connectionState]}
        </span>
        <details className="panel-details panel-details-quiet">
          <summary className="panel-details-summary">
            <span>Sources and credits</span>
            <ChevronDownIcon className="panel-details-chevron" />
          </summary>
          <div className="panel-details-body">
            <dl className="meta-list">
              <div className="meta-row">
                <dt>Active-fire &amp; sensor reference</dt>
                <dd>
                  MODIS (NASA EOS Terra &amp; Aqua) and VIIRS (NOAA/NASA JPSS) swath parameters and
                  target hotspot schema via{' '}
                  <a href="https://firms.modaps.eosdis.nasa.gov/" {...EXTERNAL}>
                    NASA FIRMS
                  </a>{' '}
                  (seasonal anomaly values shown are illustrative baselines pending live FIRMS feed
                  integration).
                </dd>
              </div>
              <div className="meta-row">
                <dt>Orbital ephemerides</dt>
                <dd>
                  NORAD GP / TLE orbital elements from{' '}
                  <a href="https://celestrak.org/" {...EXTERNAL}>
                    CelesTrak
                  </a>
                  .
                </dd>
              </div>
              <div className="meta-row">
                <dt>Earth basemap</dt>
                <dd>
                  Sentinel-2 cloudless via{' '}
                  <a href="https://s2maps.eu" {...EXTERNAL}>
                    s2maps.eu
                  </a>{' '}
                  by{' '}
                  <a href="https://eox.at" {...EXTERNAL}>
                    EOX IT Services GmbH
                  </a>{' '}
                  (contains modified Copernicus Sentinel data 2025).
                </dd>
              </div>
            </dl>
            <p className="panel-note">
              Independent project built for the 2026 NASA Space Apps Challenge. Not affiliated
              with, endorsed by, or an official product of NASA.
            </p>
          </div>
        </details>
      </div>
    </footer>
  )
}
