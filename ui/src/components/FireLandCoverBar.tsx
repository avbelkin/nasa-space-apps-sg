import { LAND_COVER_OTHER_COLOR, LAND_COVER_PALETTE } from '../data/dataPalette'
import type { AggregatedFireSpotLandCover } from '../utils/fireSpots'

const MAX_SEGMENTS = 4

// Surface composition of the pinned footprint(s): class shares, not just the dominant class,
// so a 95/5 mixed footprint does not read as two equal classes.
export function FireLandCoverBar({ summary }: { summary: AggregatedFireSpotLandCover }) {
  const top = summary.classes.slice(0, MAX_SEGMENTS)
  const otherFraction = summary.classes
    .slice(MAX_SEGMENTS)
    .reduce((sum, entry) => sum + entry.fraction, 0)
  const segments = [
    ...top.map((entry, index) => ({
      label: entry.label,
      fraction: entry.fraction,
      color: LAND_COVER_PALETTE[index % LAND_COVER_PALETTE.length],
    })),
    ...(otherFraction > 0
      ? [{ label: 'Other', fraction: otherFraction, color: LAND_COVER_OTHER_COLOR }]
      : []),
  ]
  if (segments.length === 0) {
    return null
  }

  const coveragePct = Math.round(summary.coverage * 100)
  return (
    <div className="fire-land-cover-block">
      <div
        className="fire-land-cover-bar"
        role="img"
        aria-label={`Surface composition: ${segments
          .map((segment) => `${segment.label} ${Math.round(segment.fraction * 100)}%`)
          .join(', ')}. Classified coverage ${coveragePct}%.`}
      >
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="fire-land-cover-segment"
            style={{
              inlineSize: `${segment.fraction * 100}%`,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </div>
      <ul className="fire-land-cover-key">
        {segments.map((segment) => (
          <li key={segment.label}>
            <span
              className="fire-land-cover-swatch"
              style={{ backgroundColor: segment.color }}
              aria-hidden="true"
            />
            {segment.label} {Math.round(segment.fraction * 100)}%
          </li>
        ))}
      </ul>
      <p className="fire-land-cover-meta">
        {summary.detectionCount > 1
          ? `Surface across ${summary.detectionCount} detections · `
          : 'Surface · '}
        Classified coverage {coveragePct}% · ESA CCI Land Cover 2019
      </p>
    </div>
  )
}
