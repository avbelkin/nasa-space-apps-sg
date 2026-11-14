import { useState } from 'react'
import { MONTH_LABELS, type StatusCategory } from '../data/stubSeasonalData'
import { STATUS_GLYPHS, STATUS_TEXT } from '../data/statusDisplay'
import { ChevronDownIcon } from './icons'

const LEGEND_STATUS_ROWS: readonly { category: StatusCategory; glyphClass: string }[] = [
  { category: 'anomaly-high', glyphClass: 'legend-glyph-anomaly' },
  { category: 'fits-typical', glyphClass: 'legend-glyph-typical' },
  { category: 'below-typical', glyphClass: 'legend-glyph-below' },
]

interface MapLegendProps {
  selectedMonth: number
  // Open by default on a wide map; once the user toggles it, their choice wins.
  defaultOpen: boolean
  showModisOrbits: boolean
  showViirsOrbits: boolean
  showUserLocation: boolean
}

export function MapLegend({
  selectedMonth,
  defaultOpen,
  showModisOrbits,
  showViirsOrbits,
  showUserLocation,
}: MapLegendProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? defaultOpen

  return (
    <details
      className="map-hud map-legend"
      open={open}
      // Fires for user toggles and for our own prop updates; only a real mismatch is a user choice.
      onToggle={(event) => {
        const isOpen = event.currentTarget.open
        if (isOpen !== open) {
          setUserOpen(isOpen)
        }
      }}
    >
      <summary className="map-legend-summary">
        <span>Legend</span>
        <ChevronDownIcon className="map-legend-chevron" />
      </summary>
      <div className="map-legend-body">
        <p className="hud-kicker">{MONTH_LABELS[selectedMonth]} &middot; fire activity</p>
        <ul className="hud-legend-list" role="list">
          {LEGEND_STATUS_ROWS.map(({ category, glyphClass }) => (
            <li key={category}>
              <span className={`legend-glyph ${glyphClass}`} aria-hidden="true">
                {STATUS_GLYPHS[category]}
              </span>
              <span>{STATUS_TEXT[category]}</span>
            </li>
          ))}
          {showModisOrbits && (
            <li>
              <span className="legend-glyph" aria-hidden="true">
                <span className="legend-glyph-terra">&#9670;</span>
                <span className="legend-glyph-aqua">&#9670;</span>
              </span>
              <span>MODIS: Terra, Aqua</span>
            </li>
          )}
          {showViirsOrbits && (
            <li>
              <span className="legend-glyph" aria-hidden="true">
                <span className="legend-glyph-noaa-20">&#9679;</span>
                <span className="legend-glyph-noaa-21">&#9679;</span>
              </span>
              <span>VIIRS: NOAA-20, NOAA-21</span>
            </li>
          )}
          {(showModisOrbits || showViirsOrbits) && (
            <li className="hud-legend-note">Tracks: solid past, dashed ahead</li>
          )}
          {showUserLocation && (
            <li>
              <span className="legend-glyph legend-glyph-user" aria-hidden="true">&#9673;</span>
              <span>Your location</span>
            </li>
          )}
        </ul>
      </div>
    </details>
  )
}
