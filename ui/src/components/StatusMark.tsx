import type { StatusCategory } from '../data/stubSeasonalData'
import {
  STATUS_CATEGORIES,
  STATUS_MARK_STYLES,
  statusMarkExtent,
  statusMarkPath,
} from '../data/statusMarks'

interface StatusMarkProps {
  category: StatusCategory
  radius: number
  className?: string
}

// The map's status mark as inline SVG. Every category gets the same square box, so legend rows align.
export function StatusMark({ category, radius, className }: StatusMarkProps) {
  const half = Math.ceil(Math.max(...STATUS_CATEGORIES.map((item) => statusMarkExtent(item, radius))))
  const style = STATUS_MARK_STYLES[category]
  const d = statusMarkPath(category, radius)

  return (
    <svg
      className={className ? `status-mark ${className}` : 'status-mark'}
      width={half * 2}
      height={half * 2}
      viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
      aria-hidden="true"
      focusable="false"
    >
      {style.strokes.map((stroke) => (
        <path
          key={`${stroke.color}-${stroke.width}`}
          d={d}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinejoin="round"
        />
      ))}
      <path d={d} fill={style.fill} fillRule={style.fillRule} />
    </svg>
  )
}
