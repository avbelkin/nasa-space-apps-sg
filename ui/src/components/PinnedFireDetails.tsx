import { useMemo } from 'react'
import type { SensorFilter } from '../data/mapTypes'
import {
  formatFireSpotsTooltip,
  type FireSpotLandCoverLookup,
  type FireSpotTooltipInput,
  type FirmsLiveSpotsResponse,
} from '../utils/fireSpots'
import type { SatelliteOverpassIndex } from '../utils/satelliteOverpassTimeline'
import type { FireObservationGeometry } from '../utils/fireObservationGeometry'
import { getCrossFamilyPassOutlook, getSecondPassOutlook } from '../utils/secondPassOutlook'
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
  fireFeed: FirmsLiveSpotsResponse | null
  onUnpin: () => void
}

export function PinnedFireDetails({ selection, feedGeometry, landCoverBySpot, overpassIndex, fireFeed, onUnpin }: PinnedFireDetailsProps) {
  const details = useMemo(
    () => formatFireSpotsTooltip(selection.inputs, selection.nowMs, {
      sensorFilter: selection.sensorFilter,
      overpassIndex,
      landCoverBySpot,
    }),
    [selection, overpassIndex, landCoverBySpot],
  )
  const crossFamilyOutlook = useMemo(() => {
    if (details?.count !== 1 || !fireFeed || !overpassIndex) return null
    const spot = selection.inputs[0]
    if (spot.lat === undefined || spot.lng === undefined) return null
    return getCrossFamilyPassOutlook(spot, overpassIndex.evaluateAtLatLng(spot.lat, spot.lng), fireFeed)
  }, [details?.count, fireFeed, overpassIndex, selection.inputs])
  if (!details?.timeline) {
    return null
  }

  const { timeline } = details
  const outlook = details.count === 1 && fireFeed
    ? getSecondPassOutlook(
      selection.inputs[0],
      timeline.slots.flatMap((slot) => slot?.subBars.filter((bar) => bar.kind !== 'detection') ?? []),
      details.landCoverLabel,
      Date.parse(fireFeed.fetchedAtUtc),
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
          <strong>No matching detection for {outlook.satellite}’s predicted pass in this selection.</strong>
          {outlook.fewer.length > 0 && <p>The baseline saw fewer misses with {outlook.fewer.join(' and ')}.</p>}
          {outlook.more.length > 0 && <p>The baseline saw more misses with {outlook.more.join(' and ')}.</p>}
        </div>
      )}
      {crossFamilyOutlook && (
        <div className="fire-second-pass-note">
          <strong>No matching {crossFamilyOutlook.target.toUpperCase()} detection for {crossFamilyOutlook.satellite}’s predicted pass.</strong>
          <p>The predicted ground track passed {Math.round(crossFamilyOutlook.distanceKm).toLocaleString('en-US')} km from this spot.</p>
          {crossFamilyOutlook.fewer.length > 0 && <p>The cross-family baseline saw fewer misses with {crossFamilyOutlook.fewer.join(' and ')}.</p>}
          {crossFamilyOutlook.more.length > 0 && <p>The cross-family baseline saw more misses with {crossFamilyOutlook.more.join(' and ')}.</p>}
        </div>
      )}
      <FireObservationDetails inputs={selection.inputs} feedGeometry={feedGeometry} />
    </section>
  )
}
