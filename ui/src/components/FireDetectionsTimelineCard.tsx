import { useId, type CSSProperties } from 'react'
import type { FireDetectionsTimeline } from '../utils/fireTimeline'
import { SunriseIcon, SunsetIcon } from './icons'

interface FireDetectionsTimelineCardProps {
  timeline: FireDetectionsTimeline
}

export function FireDetectionsTimelineCard({ timeline }: FireDetectionsTimelineCardProps) {
  const clipBaseId = useId()
  const dayClipId = `${clipBaseId}-day`
  const nightClipId = `${clipBaseId}-night`
  const { sun } = timeline

  const sunEvents: Array<{ kind: 'sunrise' | 'sunset'; ms: number; label: string }> = []
  if (sun.sunriseMs !== null && sun.sunriseLabel !== null) {
    sunEvents.push({ kind: 'sunrise', ms: sun.sunriseMs, label: sun.sunriseLabel })
  }
  if (sun.sunsetMs !== null && sun.sunsetLabel !== null) {
    sunEvents.push({ kind: 'sunset', ms: sun.sunsetMs, label: sun.sunsetLabel })
  }
  sunEvents.sort((a, b) => a.ms - b.ms)

  return (
    <div className="fire-timeline">
      <div className="fire-timeline-meta" aria-hidden="true">
        <div className="fire-timeline-sun-events">
          {sun.polarState === 'polar-day' ? (
            <span className="fire-timeline-sun-item">
              <SunriseIcon />
              <span>Polar day</span>
            </span>
          ) : sun.polarState === 'polar-night' ? (
            <span className="fire-timeline-sun-item">
              <SunsetIcon />
              <span>Polar night</span>
            </span>
          ) : (
            sunEvents.map((event) => (
              <span key={event.kind} className="fire-timeline-sun-item">
                {event.kind === 'sunrise' ? <SunriseIcon /> : <SunsetIcon />}
                <span>
                  {event.kind === 'sunrise' ? 'Sunrise' : 'Sunset'} {event.label}
                </span>
              </span>
            ))
          )}
        </div>
        <span className="fire-timeline-peak">
          Peak {timeline.peakFrpMw.toLocaleString('en-US')} MW (
          {timeline.totalFrpMw.toLocaleString('en-US')} MW total)
        </span>
      </div>

      <div className="fire-timeline-scroll">
        <div className="fire-timeline-frame">
          <div className="fire-timeline-plot" aria-hidden="true">
            <svg
              className="fire-timeline-sun-svg"
              viewBox={`0 0 ${sun.viewBoxWidth} ${sun.viewBoxHeight}`}
              preserveAspectRatio="none"
            >
              <defs>
                <clipPath id={dayClipId}>
                  <rect x="0" y="0" width={sun.viewBoxWidth} height={sun.horizonY} />
                </clipPath>
                <clipPath id={nightClipId}>
                  <rect
                    x="0"
                    y={sun.horizonY}
                    width={sun.viewBoxWidth}
                    height={sun.viewBoxHeight - sun.horizonY}
                  />
                </clipPath>
              </defs>
              <line
                className="fire-timeline-horizon"
                x1="0"
                y1={sun.horizonY}
                x2={sun.viewBoxWidth}
                y2={sun.horizonY}
                vectorEffect="non-scaling-stroke"
              />
              <path
                className="fire-timeline-sun-night"
                d={sun.pathD}
                clipPath={`url(#${nightClipId})`}
                vectorEffect="non-scaling-stroke"
              />
              <path
                className="fire-timeline-sun-day"
                d={sun.pathD}
                clipPath={`url(#${dayClipId})`}
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <span
              className="fire-timeline-sun-dot"
              data-daylight={sun.isDaylightNow ? 'true' : 'false'}
              style={{ '--sun-now-y': `${sun.nowYPct}%` } as CSSProperties}
            />

            <div className="fire-timeline-bars">
              {timeline.slots.map((slot) => {
                if (!slot) {
                  return null
                }
                if (slot.kind === 'non-detection') {
                  return (
                    <div
                      key={`slot-${slot.slotIndex}`}
                      className="fire-timeline-slot fire-timeline-slot-negative"
                      style={{ gridColumn: slot.slotIndex + 1, gridRow: 1 }}
                      title={`${slot.localTimeLabel} · ${slot.satellite} overpass (no detection)`}
                    >
                      <span className="fire-timeline-negative-tick" />
                      <span className="fire-timeline-sat fire-timeline-sat-negative">
                        {slot.shortSatellite}
                      </span>
                    </div>
                  )
                }

                const mergedLabel = slot.mergedCount > 1 ? ` · ${slot.mergedCount} spots` : ''
                return (
                  <div
                    key={`slot-${slot.slotIndex}`}
                    className="fire-timeline-slot"
                    style={{ gridColumn: slot.slotIndex + 1, gridRow: 1 }}
                    title={`${slot.localTimeLabel} · ${slot.satellite} · ${slot.frpMw} MW · Conf ${Math.round(slot.confidence)}%${mergedLabel}`}
                  >
                    <span
                      className="fire-timeline-bar"
                      style={
                        {
                          '--bar-height': `${slot.heightPct}%`,
                          '--bar-color': slot.color,
                          '--bar-opacity': String(slot.opacity),
                        } as CSSProperties
                      }
                    />
                    <span className="fire-timeline-sat">{slot.shortSatellite}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="fire-timeline-axis" aria-hidden="true">
            {timeline.axisTicks.map((tick) => (
              <span key={tick.relativeLabel}>
                {tick.relativeLabel === 'Now' ? `${tick.label} (now)` : tick.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="visually-hidden">{timeline.accessibleSummary}</p>
    </div>
  )
}
