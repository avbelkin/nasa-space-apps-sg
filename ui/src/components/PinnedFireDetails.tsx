import { useMemo } from 'react'
import type { SensorFilter } from '../data/mapTypes'
import {
  formatFireSpotsTooltip,
  type FireSpotLandCoverLookup,
  type FireSpotTooltipInput,
} from '../utils/fireSpots'
import type { SatelliteOverpassIndex } from '../utils/satelliteOverpassTimeline'
import type { FireObservationGeometry } from '../utils/fireObservationGeometry'
import { FireDetectionPowerSummary, FireDetectionsTimelineCard } from './FireDetectionsTimelineCard'
import { FireLandCoverBar } from './FireLandCoverBar'
import { FireObservationDetails } from './FireObservationDetails'
import { CloseIcon } from './icons'

export interface PinnedFireSelection {
  inputs: readonly FireSpotTooltipInput[]
  nowMs: number
  anchorLngLat: [number, number] | null
  sensorFilter: SensorFilter
}

interface PinnedFireDetailsProps {
  selection: PinnedFireSelection
  // Live clock from App while a pin is open; falls back to the click time.
  nowMs?: number
  // True when the pinned detections no longer appear in the latest feed snapshot.
  notInLatestSnapshot?: boolean
  feedGeometry?: readonly (FireObservationGeometry | null)[]
  landCoverBySpot: FireSpotLandCoverLookup
  overpassIndex: SatelliteOverpassIndex | null
  onUnpin: () => void
}

export function PinnedFireDetails({ selection, nowMs, notInLatestSnapshot, feedGeometry, landCoverBySpot, overpassIndex, onUnpin }: PinnedFireDetailsProps) {
  const details = useMemo(
    () => formatFireSpotsTooltip(selection.inputs, nowMs ?? selection.nowMs, {
      sensorFilter: selection.sensorFilter,
      overpassIndex,
      landCoverBySpot,
    }),
    [selection, nowMs, overpassIndex, landCoverBySpot],
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
          {notInLatestSnapshot && (
            <p className="pinned-fire-stale-badge">Not in latest snapshot</p>
          )}
        </div>
        <button type="button" className="secondary-btn pinned-fire-unpin" onClick={onUnpin}>
          <CloseIcon />
          Unpin
        </button>
      </header>
      {details.landCoverSummary && (
        <FireLandCoverBar summary={details.landCoverSummary} />
      )}
      <FireDetectionsTimelineCard timeline={timeline} />
      <FireObservationDetails inputs={selection.inputs} feedGeometry={feedGeometry} />
    </section>
  )
}
