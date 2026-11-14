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
  const { sun, processingCutoff } = timeline
  const horizonYPct = (sun.horizonY / sun.viewBoxHeight) * 100

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
      </div>

      <div className="fire-timeline-scroll" role="region" aria-label="24-hour detection chart" tabIndex={0}>
        <div className="fire-timeline-frame">
          <div
            className="fire-timeline-plot"
            style={{ '--horizon-y': `${horizonYPct}%` } as CSSProperties}
            aria-hidden="true"
          >
            {processingCutoff.widthPct > 0 && (
              <div
                className="fire-timeline-cutoff-zone"
                style={{ '--cutoff-width': `${processingCutoff.widthPct}%` } as CSSProperties}
                title={`NRT processing cutoff (${processingCutoff.shortLabel})`}
              />
            )}
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
                const satClassName =
                  slot.kind === 'non-detection'
                    ? 'fire-timeline-sat fire-timeline-sat-negative'
                    : slot.kind === 'pending'
                      ? 'fire-timeline-sat fire-timeline-sat-pending'
                      : 'fire-timeline-sat'

                return (
                  <div
                    key={`slot-${slot.slotIndex}`}
                    className="fire-timeline-slot"
                    data-slot-kind={slot.kind}
                    style={{ gridColumn: slot.slotIndex + 1, gridRow: 1 }}
                    title={slot.tooltipTitle}
                  >
                    <div className="fire-timeline-slot-subbars">
                      {slot.subBars.map((sub, subIdx) => {
                        if (sub.kind === 'detection') {
                          return (
                            <span
                              key={`${slot.slotIndex}-${sub.satellite}-${subIdx}`}
                              className="fire-timeline-bar"
                              style={
                                {
                                  '--bar-height': `${sub.heightPct}%`,
                                  '--bar-color': sub.color,
                                  '--bar-opacity': String(sub.opacity),
                                } as CSSProperties
                              }
                            />
                          )
                        }
                        if (sub.kind === 'pending') {
                          return (
                            <span
                              key={`${slot.slotIndex}-${sub.satellite}-${subIdx}`}
                              className="fire-timeline-bar-pending"
                              style={{ '--sat-color': sub.color } as CSSProperties}
                            />
                          )
                        }
                        return (
                          <span
                            key={`${slot.slotIndex}-${sub.satellite}-${subIdx}`}
                            className="fire-timeline-bar-negative"
                            style={{ '--sat-color': sub.color } as CSSProperties}
                          />
                        )
                      })}
                    </div>
                    <span className={satClassName}>{slot.label}</span>
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

          <div className="fire-timeline-legend" aria-hidden="true">
            <span className="fire-timeline-legend-item">
              <span className="fire-timeline-swatch fire-timeline-swatch-negative" />
              <span>Pass, no fire ({processingCutoff.nonDetectionCount})</span>
            </span>
            <span className="fire-timeline-legend-item">
              <span className="fire-timeline-swatch fire-timeline-swatch-cutoff" />
              <span>
                Processing ({processingCutoff.shortLabel}
                {processingCutoff.pendingCount > 0 ? `, ${processingCutoff.pendingCount} pending` : ''})
              </span>
            </span>
          </div>
        </div>
      </div>

      <table className="visually-hidden">
        <caption>{timeline.accessibleSummary}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Satellite</th>
            <th scope="col">Status</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {timeline.accessibleRows.map((row, index) => (
            <tr key={`${index}-${row.timeLabel}-${row.satellite}`}>
              <td>{row.timeLabel}</td>
              <td>{row.satellite}</td>
              <td>{row.status}</td>
              <td>{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
