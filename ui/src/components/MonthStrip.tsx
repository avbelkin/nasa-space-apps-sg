import { MONTHLY_PROFILE } from '../data/stubSeasonalData'
import { formatSignedDelta } from '../data/statusDisplay'

interface MonthStripProps {
  selectedMonth: number
  onSelectMonth: (month: number) => void
}

// Timeline header and the 12-month strip: a fixed grid of 12, or 6 x 2 on a narrow strip.
export function MonthStrip({ selectedMonth, onSelectMonth }: MonthStripProps) {
  const monthProfile = MONTHLY_PROFILE[selectedMonth]
  const monthDelta = monthProfile.currentIndex - monthProfile.typicalIndex

  return (
    <section className="timeline-bar wrapper-surface" aria-labelledby="timeline-heading">
      <div className="timeline-header">
        <h2 id="timeline-heading">Seasonal &amp; Calendar Context ({monthProfile.label})</h2>
        <span className="timeline-status">
          {monthProfile.classification} ({formatSignedDelta(monthDelta)} vs. typical baseline)
        </span>
      </div>

      <div className="month-track" role="group" aria-label="Select month on seasonal calendar">
        {MONTHLY_PROFILE.map((point) => (
          <button
            key={point.label}
            type="button"
            className="month-btn"
            aria-pressed={selectedMonth === point.monthIndex}
            onClick={() => onSelectMonth(point.monthIndex)}
          >
            <span className="month-label">{point.label}</span>
            <span className="month-bars" aria-hidden="true">
              <span
                className="month-bar month-bar-typical"
                style={{ blockSize: `${Math.max(20, point.typicalIndex)}%` }}
              />
              <span
                className="month-bar month-bar-current"
                style={{ blockSize: `${Math.max(20, point.currentIndex)}%` }}
              />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
