export const FIRE_TOOLTIP_EDGE_INSET = 8
const POINTER_GAP = 12

// All coordinates are in CSS pixels relative to the viewport.
export function placeFireTooltip(
  pointer: { x: number; y: number },
  tooltip: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const left = FIRE_TOOLTIP_EDGE_INSET
  const top = FIRE_TOOLTIP_EDGE_INSET
  const right = viewport.width - FIRE_TOOLTIP_EDGE_INSET
  const bottom = viewport.height - FIRE_TOOLTIP_EDGE_INSET
  const below = pointer.y + POINTER_GAP
  const above = pointer.y - POINTER_GAP - tooltip.height
  const preferBelow = below + tooltip.height <= bottom ||
    (above < top && bottom - below >= pointer.y - POINTER_GAP - top)

  return {
    x: Math.max(left, Math.min(pointer.x - tooltip.width / 2, right - tooltip.width)),
    y: Math.max(top, Math.min(preferBelow ? below : above, bottom - tooltip.height)),
  }
}
