import { MARK_EDGE_COLOR, MARK_STROKE_COLOR, STATUS_COLORS } from './dataPalette'
import type { StatusCategory } from './stubSeasonalData'

// Shape, fill and outline of each status mark. The map rasterizes these onto a canvas for
// map.addImage and the legend draws them as SVG, so both always show the same mark.

export const STATUS_CATEGORIES: readonly StatusCategory[] = [
  'anomaly-high',
  'fits-typical',
  'below-typical',
]

export interface StatusMarkStroke {
  color: string
  // Full stroke width in px, centred on the outline; the fill covers the inner half.
  width: number
}

export interface StatusMarkStyle {
  fill: string
  fillRule: 'nonzero' | 'evenodd'
  // Painted first to last, widest first, then the fill on top.
  strokes: readonly StatusMarkStroke[]
}

// Light outline with a dark edge outside it: reads on ocean, forest, desert and cloud alike.
const DIRECTION_STROKES: readonly StatusMarkStroke[] = [
  { color: MARK_EDGE_COLOR, width: 5 },
  { color: MARK_STROKE_COLOR, width: 3 },
]

export const STATUS_MARK_STYLES: Record<StatusCategory, StatusMarkStyle> = {
  'anomaly-high': {
    fill: STATUS_COLORS['anomaly-high'],
    fillRule: 'nonzero',
    strokes: DIRECTION_STROKES,
  },
  // A hollow ring with dark edges: a deliberate neutral mark that does not read as a white blob
  // and cannot be mistaken for the filled user-location dot.
  'fits-typical': {
    fill: STATUS_COLORS['fits-typical'],
    fillRule: 'evenodd',
    strokes: [{ color: MARK_EDGE_COLOR, width: 3 }],
  },
  'below-typical': {
    fill: STATUS_COLORS['below-typical'],
    fillRule: 'nonzero',
    strokes: DIRECTION_STROKES,
  },
}

// Triangle side as a multiple of the mark radius. A triangle looks larger than its area, so about
// three quarters of the circle's area gives the three marks a similar visual weight.
const TRIANGLE_SIDE = 2.3
const TRIANGLE_HEIGHT = (TRIANGLE_SIDE * Math.sqrt(3)) / 2
const RING_HOLE = 0.45

const round = (value: number) => Math.round(value * 1000) / 1000

function circlePath(radius: number): string {
  const r = round(radius)
  return `M${-r} 0A${r} ${r} 0 1 0 ${r} 0A${r} ${r} 0 1 0 ${-r} 0Z`
}

function trianglePath(radius: number, pointsUp: boolean): string {
  const halfSide = round((TRIANGLE_SIDE * radius) / 2)
  const halfHeight = round((TRIANGLE_HEIGHT * radius) / 2)
  const tip = pointsUp ? -halfHeight : halfHeight
  return `M0 ${tip}L${halfSide} ${-tip}L${-halfSide} ${-tip}Z`
}

// SVG path data centred on (0, 0) for a mark of the given radius in px.
export function statusMarkPath(category: StatusCategory, radius: number): string {
  if (category === 'fits-typical') {
    return `${circlePath(radius)}${circlePath(radius * RING_HOLE)}`
  }
  return trianglePath(radius, category === 'anomaly-high')
}

// Half the width of the square that holds the mark and its outline.
export function statusMarkExtent(category: StatusCategory, radius: number): number {
  const shapeHalf = category === 'fits-typical' ? radius : (TRIANGLE_SIDE * radius) / 2
  const widestStroke = Math.max(...STATUS_MARK_STYLES[category].strokes.map((s) => s.width))
  return shapeHalf + widestStroke / 2
}

// Farthest reach of any mark from its centre: a multiple of the radius (the triangles' corners)
// plus half the widest outline. The map's selection ring stays clear of it.
function shapeReachPerRadius(category: StatusCategory): number {
  return category === 'fits-typical' ? 1 : Math.hypot(TRIANGLE_SIDE / 2, TRIANGLE_HEIGHT / 2)
}

export const STATUS_MARK_REACH = {
  perRadius: Math.max(...STATUS_CATEGORIES.map(shapeReachPerRadius)),
  outline: Math.max(
    ...STATUS_CATEGORIES.flatMap((category) =>
      STATUS_MARK_STYLES[category].strokes.map((stroke) => stroke.width / 2),
    ),
  ),
} as const
