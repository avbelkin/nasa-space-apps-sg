import { ChevronDownIcon } from '../icons'

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

export function AttributionFooter() {
  return (
    <footer className="panel-footer">
      <p className="attribution-line">
        <a href="https://firms.modaps.eosdis.nasa.gov/" {...EXTERNAL}>NASA FIRMS</a> &middot;{' '}
        <a href="https://earthdata.nasa.gov/gibs" {...EXTERNAL}>NASA GIBS</a> &middot;{' '}
        <a href="https://celestrak.org/" {...EXTERNAL}>CelesTrak</a> &middot;{' '}
        <a href="https://cloudless.eox.at" {...EXTERNAL}>EOxCloudless / Copernicus Sentinel-2</a> &middot;{' '}
        <a href="https://gis.extremum.org" {...EXTERNAL}>Extremum SAR GIS</a>. Not affiliated with NASA.
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
                  Active fire detections from MODIS (NASA EOS Terra &amp; Aqua) and VIIRS (NOAA/NASA JPSS)
                  for the rolling 24-hour map layer, published by{' '}
                  <a href="https://firms.modaps.eosdis.nasa.gov/" {...EXTERNAL}>
                    NASA FIRMS
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
                <dt>High-latitude clouds</dt>
                <dd>
                  NOAA/NASA Suomi NPP &amp; JPSS VIIRS imagery from{' '}
                  <a href="https://earthdata.nasa.gov/gibs" {...EXTERNAL}>
                    NASA GIBS / Earthdata
                  </a>
                  , blended into the satellite cloud layer.
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
                <dt>Earth basemap</dt>
                <dd>
                  EOxCloudless{' '}
                  <a href="https://cloudless.eox.at" {...EXTERNAL}>
                    cloudless.eox.at
                  </a>{' '}
                  by{' '}
                  <a href="https://eox.at" {...EXTERNAL}>
                    EOX IT Services GmbH
                  </a>{' '}
                  (Contains modified Copernicus Sentinel data 2016 &amp; 2017), licensed under{' '}
                  <a href="https://creativecommons.org/licenses/by/4.0/" {...EXTERNAL}>CC BY 4.0</a>.
                  Historical imagery, not current surface conditions.
                </dd>
              </div>
              <div className="meta-row">
                <dt>Hotspot land cover</dt>
                <dd>
                  Derived from the 2019 global land cover classification (300 m native grid, 1.2 km world overview), © ESA Climate
                  Change Initiative Land Cover project and{' '}
                  <a href="https://doi.org/10.24381/cds.006f2c9a" {...EXTERNAL}>
                    Copernicus Climate Change Service
                  </a>
                  . GeoTIFFs via{' '}
                  <a href="https://planetarycomputer.microsoft.com/dataset/esa-cci-lc" {...EXTERNAL}>
                    Microsoft Planetary Computer
                  </a>
                  .
                </dd>
              </div>
              <div className="meta-row">
                <dt>Weather at acquisition</dt>
                <dd>
                  NOAA GFS and GOES-R, NOAA CPC soil moisture, Copernicus GDO soil-moisture anomalies, and modeled weather / Copernicus CAMS aerosols via <a href="https://open-meteo.com/" {...EXTERNAL}>Open-Meteo</a>, radar and satellite
                  observations from <a href="https://www.noaa.gov/" {...EXTERNAL}>NOAA</a>, fire danger from{' '}
                  <a href="https://gwis.jrc.ec.europa.eu/" {...EXTERNAL}>Copernicus GWIS</a>, and dead fuel moisture from
                  the <a href="https://www.wfas.net/" {...EXTERNAL}>US Forest Service</a>.
                </dd>
              </div>
              <div className="meta-row">
                <dt>Star background</dt>
                <dd>Curated bright-star coordinates described in the source as Bright Star / Hipparcos;
                  additional faint stars are generated procedurally. Exact catalogue provenance and
                  redistribution terms remain under review.</dd>
              </div>
              <div className="meta-row">
                <dt>Satellite clouds</dt>
                <dd>
                  Live geostationary visible and infrared cloud images (EUMETSAT, NOAA, JMA) and
                  the high-latitude VIIRS blend are delivered by{' '}
                  <a href="https://gis.extremum.org" {...EXTERNAL}>
                    Extremum SAR GIS
                  </a>
                  .
                </dd>
              </div>
            </dl>
            <p className="panel-note">
              <a href="./third-party-notices.txt" {...EXTERNAL}>Software licence notices</a>.{' '}
              Independent project built for the 2026 NASA Space Apps Challenge. Not affiliated
              with, endorsed by, or an official product of NASA. Model estimates are Earth Fire Calendar outputs; NASA has not validated them and is not responsible for their accuracy.
            </p>
          </div>
        </details>
      </div>
    </footer>
  )
}
