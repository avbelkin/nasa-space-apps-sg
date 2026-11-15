import { useState } from 'react'
import type { LiveSatelliteSnapshot } from '../../utils/satelliteOrbits'
import { ChevronDownIcon } from '../icons'

// 'empty': the feed loaded, but has no satellite for the current sensor filter
export type SatelliteFeedState = 'unavailable' | 'loading' | 'empty' | 'ready'

interface SatelliteDetailsProps {
  feedState: SatelliteFeedState
  snapshots: readonly LiveSatelliteSnapshot[]
  selectedSatelliteId: string | null
  onSelectSatellite: (satellite: LiveSatelliteSnapshot) => void
  onRetry?: () => void
}

function formatDeg(value: number, posHemisphere: string, negHemisphere: string): string {
  const hemisphere = value >= 0 ? posHemisphere : negHemisphere
  return `${Math.abs(value).toFixed(2)}°${hemisphere}`
}

// Secondary block, closed by default; it opens when a satellite is picked on the map.
export function SatelliteDetails({
  feedState,
  snapshots,
  selectedSatelliteId,
  onSelectSatellite,
  onRetry,
}: SatelliteDetailsProps) {
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [seenFeedState, setSeenFeedState] = useState(feedState)
  if (feedState !== seenFeedState) {
    setSeenFeedState(feedState)
    if (feedState !== 'unavailable') {
      setRetrying(false)
    }
  }
  const [seenSelectionId, setSeenSelectionId] = useState(selectedSatelliteId)
  if (selectedSatelliteId !== seenSelectionId) {
    setSeenSelectionId(selectedSatelliteId)
    if (selectedSatelliteId) {
      setOpen(true)
    }
  }

  return (
    <details
      className="panel-details"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="panel-details-summary">
        <span>Satellites</span>
        <ChevronDownIcon className="panel-details-chevron" />
      </summary>
      <div className="panel-details-body">
        {feedState === 'unavailable' ? (
          <>
            <p className="panel-note">Satellite positions are unavailable right now.</p>
            {onRetry && (
              <button
                type="button"
                className="secondary-btn"
                aria-disabled={retrying}
                onClick={() => {
                  if (!retrying) {
                    setRetrying(true)
                    onRetry()
                  }
                }}
              >
                {retrying ? 'Retrying…' : 'Retry'}
              </button>
            )}
          </>
        ) : feedState === 'loading' ? (
          <p className="panel-note">Loading satellite positions…</p>
        ) : feedState === 'empty' ? (
          <p className="panel-note">No satellite positions for the selected sensor right now.</p>
        ) : (
          <>
            <p className="panel-note">
              Live positions from CelesTrak orbital data. Pick a satellite to center the map on it.
            </p>
            <ul className="satellite-list" role="list">
              {snapshots.map((sat) => {
                const isSelected = selectedSatelliteId === sat.id
                return (
                  <li key={sat.id}>
                    <button
                      type="button"
                      className="satellite-row"
                      aria-pressed={isSelected}
                      onClick={() => onSelectSatellite(sat)}
                    >
                      <span className="satellite-row-top">
                        <span className="satellite-name">
                          <span
                            className="satellite-swatch"
                            style={{ backgroundColor: sat.color }}
                            aria-hidden="true"
                          >
                            {sat.glyph}
                          </span>
                          <span>{sat.name}</span>
                        </span>
                        <span className="satellite-sensor-tag">{sat.instrumentLabel}</span>
                      </span>
                      {isSelected && (
                        <span className="satellite-coords">
                          {formatDeg(sat.lat, 'N', 'S')}, {formatDeg(sat.lng, 'E', 'W')} &middot;{' '}
                          {sat.altitudeKm.toFixed(0)} km
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </details>
  )
}
