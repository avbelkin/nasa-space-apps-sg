import { CONNECTION_SHORT_LABELS, type ConnectionState } from '../../state/apiStatus'
import { ChevronDownIcon } from '../icons'

interface AttributionFooterProps {
  connectionState: ConnectionState
  // With a data service, fire spots are live NASA FIRMS detections; the regional index stays sample
  liveFiresConfigured: boolean
}

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

// One always-visible credit line plus the full text on demand, with a small API indicator.
export function AttributionFooter({ connectionState, liveFiresConfigured }: AttributionFooterProps) {
  return (
    <footer className="panel-footer">
      <p className="attribution-line">
        Data: <a href="https://firms.modaps.eosdis.nasa.gov/" {...EXTERNAL}>NASA FIRMS</a>{' '}
        {liveFiresConfigured
          ? '(live fire spots; the regional index is sample values)'
          : '(sample values)'}{' '}
        &middot; <a href="https://celestrak.org/" {...EXTERNAL}>CelesTrak</a> &middot;
        clouds <a href="https://layers.extremum.org" {...EXTERNAL}>Extremum</a> &middot; rain
        &amp; night lights <a href="https://earthdata.nasa.gov/gibs" {...EXTERNAL}>NASA GIBS</a>{' '}
        &middot; basemap <a href="https://s2maps.eu" {...EXTERNAL}>EOX</a> / Copernicus Sentinel-2.
        Not affiliated with NASA.
      </p>

      <div className="footer-meta">
        <details className="panel-details panel-details-quiet">
          <summary className="panel-details-summary">
            <span>Sources and credits</span>
            <ChevronDownIcon className="panel-details-chevron" />
          </summary>
          <div className="panel-details-body">
            <dl className="meta-list">
              <div className="meta-row">
                <dt>Fire detections</dt>
                <dd>
                  Active fires seen by MODIS (NASA EOS Terra &amp; Aqua) and VIIRS (NOAA/NASA JPSS),
                  published by{' '}
                  <a href="https://firms.modaps.eosdis.nasa.gov/" {...EXTERNAL}>
                    NASA FIRMS
                  </a>
                  .{' '}
                  {liveFiresConfigured
                    ? 'The fire spots on the map are live detections of the last 24 hours; the regional fire activity index, its map marks and the month strip remain sample values.'
                    : 'The fire activity values shown here are sample values until FIRMS data is connected.'}
                </dd>
              </div>
              <div className="meta-row">
                <dt>Satellite orbits</dt>
                <dd>
                  Orbital elements (NORAD GP / TLE) from{' '}
                  <a href="https://celestrak.org/" {...EXTERNAL}>
                    CelesTrak
                  </a>
                  .
                </dd>
              </div>
              <div className="meta-row">
                <dt>Satellite clouds</dt>
                <dd>
                  Live geostationary visible and infrared cloud images (EUMETSAT, NOAA, JMA) blended at high latitudes
                  with NOAA/NASA Suomi NPP &amp; JPSS VIIRS imagery from{' '}
                  <a href="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" {...EXTERNAL}>
                    NASA GIBS / EOSDIS Earthdata
                  </a>{' '}
                  via{' '}
                  <a href="https://layers.extremum.org" {...EXTERNAL}>
                    layers.extremum.org
                  </a>
                  .
                </dd>
              </div>
              <div className="meta-row">
                <dt>Precipitation</dt>
                <dd>
                  30-minute global rain and snow rates (GPM IMERG) from{' '}
                  <a href="https://earthdata.nasa.gov/gibs" {...EXTERNAL}>
                    NASA GIBS / Earthdata
                  </a>
                  , smoothly interpolated from z6 upward.
                </dd>
              </div>
              <div className="meta-row">
                <dt>Night lights</dt>
                <dd>
                  Gap-filled BRDF-corrected Day/Night Band radiance (NOAA-20 / JPSS-1 VIIRS Black
                  Marble) from{' '}
                  <a href="https://earthdata.nasa.gov/gibs" {...EXTERNAL}>
                    NASA GIBS / Earthdata
                  </a>
                  , shown on the night side at low zoom.
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
        <span className="api-indicator" data-state={connectionState} aria-live="polite">
          <span className="api-dot" aria-hidden="true" />
          {CONNECTION_SHORT_LABELS[connectionState]}
        </span>
      </div>
    </footer>
  )
}
