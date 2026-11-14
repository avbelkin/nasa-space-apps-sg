import { useId } from 'react'
import type { ProjectionMode } from '../data/stubSeasonalData'
import {
  CloudIcon,
  FlameIcon,
  LocateIcon,
  MinusIcon,
  OrbitIcon,
  PauseIcon,
  PlusIcon,
  ResetViewIcon,
} from './icons'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'

const PROJECTION_OPTIONS: readonly SegmentedOption<ProjectionMode>[] = [
  { value: 'mercator', label: '2D', ariaLabel: '2D map' },
  { value: 'globe', label: '3D', ariaLabel: '3D globe' },
]

interface MapControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onLocate: () => void
  isLocating: boolean
  geoErrorMessage: string | null
  onResetView: () => void
  projectionMode: ProjectionMode
  onProjectionModeChange: (next: ProjectionMode) => void
  showOrbits: boolean
  onShowOrbitsChange: (next: boolean) => void
  showClouds: boolean
  onShowCloudsChange: (next: boolean) => void
  showFires: boolean
  onShowFiresChange: (next: boolean) => void
  // Only while live fire spots pulse (none under reduced motion)
  showPulseToggle: boolean
  pulsePaused: boolean
  onPulsePausedChange: (next: boolean) => void
}

// Top-end column of icon buttons over the map. Each button is its own surface, so the map
// stays visible in the gaps; on narrow maps the column folds into two (see App.css).
export function MapControls({
  onZoomIn,
  onZoomOut,
  onLocate,
  isLocating,
  geoErrorMessage,
  onResetView,
  projectionMode,
  onProjectionModeChange,
  showOrbits,
  onShowOrbitsChange,
  showClouds,
  onShowCloudsChange,
  showFires,
  onShowFiresChange,
  showPulseToggle,
  pulsePaused,
  onPulsePausedChange,
}: MapControlsProps) {
  const geoStatusId = useId()

  return (
    <div className="map-controls" role="group" aria-label="Map controls">
      <button type="button" className="hud-btn hud-icon-btn" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>
        <PlusIcon />
      </button>
      <button type="button" className="hud-btn hud-icon-btn" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>
        <MinusIcon />
      </button>

      <div className="map-controls-locate">
        {/* aria-disabled rather than disabled, so keyboard focus stays on the button while locating */}
        <button
          type="button"
          className="hud-btn hud-icon-btn"
          aria-label="Show my location"
          title={isLocating ? 'Finding your location…' : 'Show my location'}
          aria-disabled={isLocating}
          aria-describedby={geoErrorMessage ? geoStatusId : undefined}
          onClick={() => {
            if (!isLocating) {
              onLocate()
            }
          }}
        >
          <LocateIcon className={isLocating ? 'icon-pulse' : undefined} />
        </button>
        <div className="hud-geo-status-region" role="status">
          {geoErrorMessage && (
            <p className="hud-geo-status" id={geoStatusId}>
              {geoErrorMessage}
            </p>
          )}
        </div>
      </div>

      <button type="button" className="hud-btn hud-icon-btn" aria-label="Reset view" title="Reset view" onClick={onResetView}>
        <ResetViewIcon />
      </button>

      <SegmentedControl
        label="Map projection"
        options={PROJECTION_OPTIONS}
        value={projectionMode}
        onChange={onProjectionModeChange}
        className="map-controls-projection"
      />

      <button
        type="button"
        className="hud-btn hud-icon-btn"
        aria-label="Satellite orbits"
        title="Satellite orbits"
        aria-pressed={showOrbits}
        onClick={() => onShowOrbitsChange(!showOrbits)}
      >
        <OrbitIcon />
      </button>

      <button
        type="button"
        className="hud-btn hud-icon-btn"
        aria-label="Clouds"
        title="Clouds"
        aria-pressed={showClouds}
        onClick={() => onShowCloudsChange(!showClouds)}
      >
        <CloudIcon />
      </button>

      <button
        type="button"
        className="hud-btn hud-icon-btn"
        aria-label="Live fire spots"
        title="Live fire spots"
        aria-pressed={showFires}
        onClick={() => onShowFiresChange(!showFires)}
      >
        <FlameIcon />
      </button>

      {/* Last in the column, so its coming and going moves no other control */}
      {showPulseToggle && (
        <button
          type="button"
          className="hud-btn hud-icon-btn"
          aria-label="Pause fire pulse"
          title="Pause fire pulse"
          aria-pressed={pulsePaused}
          onClick={() => onPulsePausedChange(!pulsePaused)}
        >
          <PauseIcon />
        </button>
      )}
    </div>
  )
}
