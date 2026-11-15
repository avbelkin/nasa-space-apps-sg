import { useMemo } from 'react'
import type { SensorFilter } from '../data/mapTypes'
import { formatFireSpotsTooltip, type FireSensorGroup, type FireSpotTooltipInput } from '../utils/fireSpots'
import type { SatelliteOverpassIndex } from '../utils/satelliteOverpassTimeline'
import { FireDetectionPowerSummary, FireDetectionsTimelineCard } from './FireDetectionsTimelineCard'
import { CloseIcon } from './icons'

export interface PinnedFireSelection {
  inputs: readonly FireSpotTooltipInput[]
  nowMs: number
  anchorLngLat: [number, number] | null
  sensorFilter: SensorFilter
  sensorGroup: FireSensorGroup | null
  peakPowerScale: number
}

interface PinnedFireDetailsProps {
  selection: PinnedFireSelection
  overpassIndex: SatelliteOverpassIndex | null
  onUnpin: () => void
}

export function PinnedFireDetails({ selection, overpassIndex, onUnpin }: PinnedFireDetailsProps) {
  const details = useMemo(
    () => formatFireSpotsTooltip(selection.inputs, selection.nowMs, {
      sensorFilter: selection.sensorFilter,
      overpassIndex,
    }),
    [selection, overpassIndex],
  )
  if (!details?.timeline) {
    return null
  }

  const { timeline } = details

  return (
    <section className="pinned-fire-details wrapper-surface" aria-labelledby="pinned-fire-heading">
      <header className="pinned-fire-header">
        <div className="pinned-fire-summary" aria-live="polite">
          <h2 id="pinned-fire-heading">
            {details.count === 1 ? 'Pinned fire detection' : `Pinned group · ${details.count} detections`}
          </h2>
          <p>
            {selection.anchorLngLat && (
              <span>
                {details.count === 1 ? 'Lat' : 'Peak detection at lat'}{' '}
                {selection.anchorLngLat[1].toFixed(3)}&deg;, lon{' '}
                {selection.anchorLngLat[0].toFixed(3)}&deg;
              </span>
            )}
            <FireDetectionPowerSummary timeline={timeline} />
          </p>
        </div>
        <button type="button" className="secondary-btn pinned-fire-unpin" onClick={onUnpin}>
          <CloseIcon />
          Unpin
        </button>
      </header>
      <FireDetectionsTimelineCard timeline={timeline} />
    </section>
  )
}
