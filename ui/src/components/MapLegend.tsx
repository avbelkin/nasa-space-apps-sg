import {
  FIRE_SPOT_COLORS,
  RAIN_DOT_RAINBOW_STOPS,
  RAIN_DOT_WHITE_COLOR,
  SATELLITE_COLORS,
  USER_LOCATION_COLORS,
} from '../data/dataPalette'
import { MONTH_LABELS, type ViewMode } from '../data/stubSeasonalData'
import { STATUS_TEXT } from '../data/statusDisplay'
import { STATUS_CATEGORIES } from '../data/statusMarks'
import type { MapViewportState } from '../state/urlHashState'
import { RAIN_DOT_COLOR_MODE, RAIN_FADE_IN_START_ZOOM } from '../utils/rainCloudShader'
import { StatusMark } from './StatusMark'

// Legend marks are drawn a little smaller than the smallest map mark (radius 8) to fit a text row.
const LEGEND_MARK_RADIUS = 6

interface MapLegendProps {
  selectedMonth: number
  viewport: MapViewportState
  showSwaths: boolean
  showModisOrbits: boolean
  showViirsOrbits: boolean
  showUserLocation: boolean
  // Live NASA FIRMS spots replace the sample status marks on the map while they are loaded
  hasLiveFires: boolean
  showFires: boolean
  showRain: boolean
  rainSummaryLabel: string | null
  viewMode: ViewMode
  reducedMotion: boolean
}

function FireDot({ color }: { color: string }) {
  return <span className="legend-fire-dot" style={{ backgroundColor: color }} />
}

function SatelliteSwatch({ color, glyph }: { color: string; glyph: string }) {
  return (
    <span className="satellite-swatch legend-sat-swatch" style={{ backgroundColor: color }}>
      {glyph}
    </span>
  )
}

// The map's legend as a row below the panels (outside the map, so it never covers map content).
// Status marks are the map's own shapes; satellite and swath keys come from the data palette.
export function MapLegend({
  selectedMonth,
  viewport,
  showSwaths,
  showModisOrbits,
  showViirsOrbits,
  showUserLocation,
  hasLiveFires,
  showFires,
  showRain,
  rainSummaryLabel,
  viewMode,
  reducedMotion,
}: MapLegendProps) {
  return (
    <section className="legend-bar wrapper-surface" data-testid="map-legend" aria-labelledby="legend-heading">
      <h2 id="legend-heading" className="legend-heading">
        {MONTH_LABELS[selectedMonth]} &middot; fire activity
        {hasLiveFires && reducedMotion ? ' · reduced motion' : ''}
      </h2>
      <ul className="legend-list" role="list">
        {!hasLiveFires ? (
          STATUS_CATEGORIES.map((category) => (
            <li key={category}>
              <span className="legend-glyph" aria-hidden="true">
                <StatusMark category={category} radius={LEGEND_MARK_RADIUS} />
              </span>
              <span>{STATUS_TEXT[category]}</span>
            </li>
          ))
        ) : !showFires ? (
          <li className="legend-note">Fire spots hidden (flame button on the map shows them)</li>
        ) : viewMode === 'sensors' ? (
          <>
            <li>
              <span className="legend-glyph" aria-hidden="true">
                <FireDot color={FIRE_SPOT_COLORS.modis} />
              </span>
              <span>MODIS 1 km spot (Terra / Aqua)</span>
            </li>
            <li>
              <span className="legend-glyph" aria-hidden="true">
                <FireDot color={FIRE_SPOT_COLORS.viirs} />
              </span>
              <span>VIIRS 375 m spot (NOAA-20 / 21)</span>
            </li>
          </>
        ) : (
          // One key for the FRP ramp keeps the row at two lines on a laptop
          <li>
            <span>Active spots by FRP:</span>
            <span className="legend-ramp">
              <FireDot color={FIRE_SPOT_COLORS.frpLow} />
              &lt;20
              <FireDot color={FIRE_SPOT_COLORS.frpMid} />
              ~20
              <FireDot color={FIRE_SPOT_COLORS.frpHigh} />
              &ge;100 MW
            </span>
          </li>
        )}
        {showSwaths && (
          <>
            <li>
              <span className="legend-glyph legend-glyph-swath-nadir" aria-hidden="true" />
              <span>Nadir swath (400 km)</span>
            </li>
            <li>
              <span className="legend-glyph legend-glyph-swath-wide" aria-hidden="true" />
              <span>Wide swath (2,330&ndash;3,040 km, dashed)</span>
            </li>
          </>
        )}
        {showRain && viewport.zoom > RAIN_FADE_IN_START_ZOOM &&
          (RAIN_DOT_COLOR_MODE === 'rainbow' ? (
            <li className="legend-rain-item">
              <span>Rain ({rainSummaryLabel ?? 'IMERG 30m'}):</span>
              <span className="legend-rain-ramp">
                {RAIN_DOT_RAINBOW_STOPS.map((stop) => (
                  <span key={stop.label} className="legend-rain-stop">
                    <span
                      className="legend-rain-dot"
                      style={{ backgroundColor: stop.color }}
                      aria-hidden="true"
                    />
                    {stop.label}
                  </span>
                ))}
              </span>
            </li>
          ) : (
            <li className="legend-rain-item">
              <span
                className="legend-rain-dot"
                style={{ backgroundColor: RAIN_DOT_WHITE_COLOR }}
                aria-hidden="true"
              />
              <span>Intense rain ({rainSummaryLabel ?? 'IMERG 30m'})</span>
            </li>
          ))}
        {showModisOrbits && (
          <li>
            <span className="legend-glyph" aria-hidden="true">
              <SatelliteSwatch color={SATELLITE_COLORS.terra} glyph="&#9670;" />
              <SatelliteSwatch color={SATELLITE_COLORS.aqua} glyph="&#9670;" />
            </span>
            <span>MODIS tracks (Terra, Aqua)</span>
          </li>
        )}
        {showViirsOrbits && (
          <li>
            <span className="legend-glyph" aria-hidden="true">
              <SatelliteSwatch color={SATELLITE_COLORS['noaa-20']} glyph="&#9679;" />
              <SatelliteSwatch color={SATELLITE_COLORS['noaa-21']} glyph="&#9679;" />
            </span>
            <span>VIIRS tracks (NOAA-20, NOAA-21)</span>
          </li>
        )}
        {(showModisOrbits || showViirsOrbits) && (
          <li className="legend-note">Tracks: solid past, dashed next 90 min</li>
        )}
        {showUserLocation && (
          <li>
            <span className="legend-glyph" aria-hidden="true">
              <svg className="legend-user-mark" width="14" height="14" viewBox="-7 -7 14 14">
                <circle
                  r="5"
                  fill={USER_LOCATION_COLORS.fill}
                  stroke={USER_LOCATION_COLORS.ring}
                  strokeWidth="2"
                />
              </svg>
            </span>
            <span>Your location</span>
          </li>
        )}
      </ul>
      <p className="legend-coords">
        <span className="visually-hidden">Map centre: </span>
        Lat {viewport.lat.toFixed(2)}&deg;, Lon {viewport.lng.toFixed(2)}&deg; &middot; z
        {viewport.zoom}
      </p>
    </section>
  )
}
