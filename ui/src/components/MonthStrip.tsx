import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { MONTHLY_PROFILE, type MonthlyBaselinePoint } from '../data/stubSeasonalData'
import {
  formatSignedDelta,
  MONTH_NAMES,
  monthStatusCategory,
  STATUS_GLYPHS,
  STATUS_TEXT,
  STATUS_TONE_CLASS,
} from '../data/statusDisplay'

interface MonthStripProps {
  selectedMonth: number
  // The visitor's current month, marked on the strip
  todayMonth: number
  onSelectMonth: (month: number) => void
}

// Shared 0-100 scale for every month: a bar's height is its index, as a share of the bar area.
function barHeight(index: number): string {
  return `${Math.min(100, Math.max(0, index))}%`
}

function describeMonth(point: MonthlyBaselinePoint, isToday: boolean): string {
  const delta = point.currentIndex - point.typicalIndex
  const status = STATUS_TEXT[monthStatusCategory(point)].toLowerCase()
  const today = isToday ? ', current month' : ''
  return `${MONTH_NAMES[point.monthIndex]}${today}: this year ${point.currentIndex}, typical ${point.typicalIndex}, ${formatSignedDelta(delta)}, ${status}`
}

// Worldwide index by month: a gray band for the typical level and a bar for this year on one scale.
// The body is a grid of "row label | months" with one row today; earlier years will add rows.
export function MonthStrip({ selectedMonth, todayMonth, onSelectMonth }: MonthStripProps) {
  // Escape hides the hover/focus tooltip until the pointer or focus moves on
  const [tooltipsHidden, setTooltipsHidden] = useState(false)
  // Whether the focused month got focus from the keyboard, i.e. shows its focus tooltip
  const keyboardFocusRef = useRef(false)
  const selected = MONTHLY_PROFILE[selectedMonth]
  const selectedCategory = monthStatusCategory(selected)
  const selectedDelta = selected.currentIndex - selected.typicalIndex

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') {
      return
    }
    // Not read from the styles: Chrome turns on :focus-visible for a clicked month at this very key
    // press, so its tooltip would look visible although the user never saw it.
    const hovered =
      window.matchMedia('(hover: hover)').matches &&
      event.currentTarget.querySelector('.month-btn:hover') !== null
    const tooltipShowing = !tooltipsHidden && (keyboardFocusRef.current || hovered)
    // Hidden either way, so the key press itself never reveals a tooltip
    setTooltipsHidden(true)
    if (tooltipShowing) {
      // Consumed only then, so the same press does not also clear the selected region
      event.preventDefault()
    }
  }

  return (
    <section className="timeline-bar wrapper-surface" aria-labelledby="timeline-heading">
      <div className="timeline-header">
        <h2 id="timeline-heading">Worldwide fire activity by month</h2>
        <p className="timeline-status" aria-live="polite">
          <strong>{MONTH_NAMES[selectedMonth]}:</strong>{' '}
          <span className={STATUS_TONE_CLASS[selectedCategory]}>
            <span aria-hidden="true">{STATUS_GLYPHS[selectedCategory]} </span>
            {STATUS_TEXT[selectedCategory]}
          </span>
          {' '}&middot;{' '}
          <span className="timeline-status-part">
            this year {selected.currentIndex} ({formatSignedDelta(selectedDelta)}),
          </span>{' '}
          <span className="timeline-status-part">typical {selected.typicalIndex}</span>
        </p>
        {/* Reserved for the period selector and CSV export; empty until they exist */}
        <div className="timeline-tools" />
      </div>

      <div className="timeline-grid">
        <div className="timeline-row-label" id="timeline-row-current">
          This year
          <span className="timeline-key" aria-hidden="true">
            <span className="timeline-key-item">
              <span className="timeline-key-swatch timeline-key-typical" />
              Typical
            </span>
            <span className="timeline-key-item">
              <span className="timeline-key-swatch timeline-key-today" />
              This month
            </span>
          </span>
        </div>

        <div
          className="month-track"
          role="group"
          aria-labelledby="timeline-heading timeline-row-current"
          data-tooltips-hidden={tooltipsHidden || undefined}
          onKeyDown={handleKeyDown}
          onPointerMove={() => setTooltipsHidden(false)}
          onFocus={(event) => {
            keyboardFocusRef.current = event.target.matches(':focus-visible')
            setTooltipsHidden(false)
          }}
          onBlur={() => {
            keyboardFocusRef.current = false
          }}
        >
          {MONTHLY_PROFILE.map((point) => {
            const category = monthStatusCategory(point)
            const isSelected = point.monthIndex === selectedMonth
            const isToday = point.monthIndex === todayMonth
            const delta = point.currentIndex - point.typicalIndex
            const bars = {
              '--typical-height': barHeight(point.typicalIndex),
              '--current-height': barHeight(point.currentIndex),
            } as CSSProperties
            return (
              <button
                key={point.label}
                type="button"
                className="month-btn"
                data-status={category}
                aria-pressed={isSelected}
                aria-label={describeMonth(point, isToday)}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => onSelectMonth(point.monthIndex)}
              >
                <span className="month-value" aria-hidden="true">
                  {category !== 'fits-typical' && STATUS_GLYPHS[category]}
                  {isSelected && ` ${point.currentIndex}`}
                </span>
                <span className="month-bars" style={bars} aria-hidden="true">
                  <span className="month-bar-typical" />
                  <span className="month-bar-current" />
                  <span className="month-typical-line" />
                </span>
                <span className="month-label" aria-hidden="true">
                  {point.label}
                  {isToday && <span className="month-today" />}
                </span>
                <span className="month-tooltip" aria-hidden="true">
                  <span>
                    <strong>{MONTH_NAMES[point.monthIndex]}</strong>
                    {isToday && ' (this month)'}
                  </span>
                  <span>
                    {STATUS_GLYPHS[category]} {STATUS_TEXT[category]}
                  </span>
                  <span>
                    This year {point.currentIndex} ({formatSignedDelta(delta)})
                  </span>
                  <span>Typical {point.typicalIndex}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
