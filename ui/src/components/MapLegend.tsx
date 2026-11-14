import { useState } from 'react'
import { MONTH_LABELS } from '../data/stubSeasonalData'
import { STATUS_TEXT } from '../data/statusDisplay'
import { STATUS_CATEGORIES } from '../data/statusMarks'
import { ChevronDownIcon } from './icons'
import { StatusMark } from './StatusMark'

// Legend marks are drawn a little smaller than the smallest map mark (radius 8) to fit a text row.
const LEGEND_MARK_RADIUS = 6

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
          {STATUS_CATEGORIES.map((category) => (
            <li key={category}>
              <span className="legend-glyph" aria-hidden="true">
                <StatusMark category={category} radius={LEGEND_MARK_RADIUS} />
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
