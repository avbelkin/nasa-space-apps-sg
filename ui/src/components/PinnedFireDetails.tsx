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
import { getCrossFamilyPassOutlook, getExpectedViirsMiss, getSecondPassOutlook } from '../utils/secondPassOutlook'
import { forecastNextPassFrp } from '../utils/frpForecast'
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
  forecastNowMs?: number
  onUnpin: () => void
}

const frpFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const differenceFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const passTimeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const scoreFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })

export function PinnedFireDetails({ selection, feedGeometry, landCoverBySpot, overpassIndex, fireFeed, forecastNowMs, onUnpin }: PinnedFireDetailsProps) {
  const details = useMemo(
    () => formatFireSpotsTooltip(selection.inputs, selection.nowMs, {
      sensorFilter: selection.sensorFilter,
      overpassIndex,
      landCoverBySpot,
    }),
    [selection, overpassIndex, landCoverBySpot],
  )
  const solo = useMemo(() => {
    if (details?.count !== 1 || !overpassIndex) return null
    const spot = selection.inputs[0]
    if (spot.lat === undefined || spot.lng === undefined) return null
    const row = fireFeed?.spots.find(([lng, lat, timestamp, , , , , satellite]) =>
      lng === spot.lng && lat === spot.lat && timestamp === spot.timestamp && satellite === spot.satellite)
    return { spot, passes: overpassIndex.evaluateAtLatLng(spot.lat, spot.lng), landCoverCode: row?.[9]?.dominantCode }
  }, [details?.count, fireFeed, overpassIndex, selection.inputs])
  const crossFamilyOutlook = useMemo(() => solo && fireFeed
    ? getCrossFamilyPassOutlook(solo.spot, solo.passes, fireFeed)
    : null, [solo, fireFeed])
  const expectedMiss = useMemo(() => solo && fireFeed
    ? getExpectedViirsMiss(solo.spot, solo.passes, fireFeed, feedGeometry?.[0], solo.landCoverCode)
    : null, [solo, fireFeed, feedGeometry])
  const forecast = useMemo(() => {
    if (!solo || forecastNowMs === undefined) return null
    return forecastNextPassFrp(
      solo.spot, solo.passes, forecastNowMs, feedGeometry?.[0], solo.landCoverCode,
    )
  }, [solo, feedGeometry, forecastNowMs])
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
            {!forecast && <FireDetectionPowerSummary timeline={timeline} />}
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
      {forecast && (
        <div className="fire-frp-forecast">
          <span>Predicted FRP if detected · {forecast.pass.satellite} · {passTimeFormat.format(forecast.pass.timestampMs)}</span>
          <div className="fire-frp-forecast-value">
            <strong>{frpFormat.format(forecast.predictedMw)} MW</strong>
            <span>{differenceFormat.format(forecast.differenceMw)} MW change</span>
          </div>
          <span className="fire-frp-forecast-original">Original detection {frpFormat.format(forecast.originalMw)} MW</span>
        </div>
      )}
      <FireDetectionsTimelineCard timeline={timeline} />
      {expectedMiss && (
        <div className="fire-second-pass-note">
          <strong>Expected detection, no match</strong>
          <p>{expectedMiss.pass.satellite} VIIRS · {passTimeFormat.format(expectedMiss.pass.timestampMs)} · {scoreFormat.format(expectedMiss.score)} detection score</p>
          <p>No matching FIRMS detection within 1 km of this spot.</p>
        </div>
      )}
      {!expectedMiss && outlook && (
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
