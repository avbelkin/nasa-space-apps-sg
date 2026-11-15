import { useMemo } from 'react'
import type { SensorFilter } from '../data/mapTypes'
import {
  formatFireSpotsTooltip,
  type FireSpotLandCoverLookup,
  type FireSpotTooltipInput,
} from '../utils/fireSpots'
import type { SatelliteOverpassIndex } from '../utils/satelliteOverpassTimeline'
import type { FireObservationGeometry } from '../utils/fireObservationGeometry'
import { getSecondPassOutlook } from '../utils/secondPassOutlook'
import { FireDetectionPowerSummary, FireDetectionsTimelineCard } from './FireDetectionsTimelineCard'
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
  feedGeometry?: readonly (FireObservationGeometry | null)[]
  landCoverBySpot: FireSpotLandCoverLookup
  overpassIndex: SatelliteOverpassIndex | null
  fetchedAtUtc?: string
  onUnpin: () => void
}

export function PinnedFireDetails({ selection, feedGeometry, landCoverBySpot, overpassIndex, fetchedAtUtc, onUnpin }: PinnedFireDetailsProps) {
  const details = useMemo(
    () => formatFireSpotsTooltip(selection.inputs, selection.nowMs, {
      sensorFilter: selection.sensorFilter,
      overpassIndex,
      landCoverBySpot,
    }),
    [selection, overpassIndex, landCoverBySpot],
  )
  if (!details?.timeline) {
    return null
  }

  const { timeline } = details
  const outlook = details.count === 1 && fetchedAtUtc
    ? getSecondPassOutlook(
      selection.inputs[0],
      timeline.slots.flatMap((slot) => slot?.subBars.filter((bar) => bar.kind !== 'detection') ?? []),
      details.landCoverLabel,
      Date.parse(fetchedAtUtc),
    )
    : null

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
            {details.landCoverLabel && (
              <span className="fire-land-cover">Land cover · {details.landCoverLabel}</span>
            )}
          </p>
        </div>
        <button type="button" className="secondary-btn pinned-fire-unpin" onClick={onUnpin}>
          <CloseIcon />
          Unpin
        </button>
      </header>
      <FireDetectionsTimelineCard timeline={timeline} />
      {outlook && (
        <div className="fire-second-pass-note">
          <strong>Second-pass outlook</strong>
          <p>No matching detection for {outlook.satellite}’s predicted pass in this selection.</p>
          {outlook.fewer.length > 0 && <p>The baseline saw fewer misses with {outlook.fewer.join(' and ')}.</p>}
          {outlook.more.length > 0 && <p>The baseline saw more misses with {outlook.more.join(' and ')}.</p>}
        </div>
      )}
      <FireObservationDetails inputs={selection.inputs} feedGeometry={feedGeometry} />
    </section>
  )
}
