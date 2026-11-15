import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FIRE_TOOLTIP_EDGE_INSET, placeFireTooltip } from '../utils/fireTooltipPlacement'

interface FireHoverTooltipProps {
  pointer: { x: number; y: number }
  children: ReactNode
}

export function FireHoverTooltip({ pointer, children }: FireHoverTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!tooltip) {
      return
    }
    const positionTooltip = () => {
      const viewport = {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      }
      const inset = 2 * FIRE_TOOLTIP_EDGE_INSET
      tooltip.style.maxWidth = `${Math.max(0, viewport.width - inset)}px`
      tooltip.style.maxHeight = `${Math.max(0, viewport.height - inset)}px`
      const { width, height } = tooltip.getBoundingClientRect()
      const { x, y } = placeFireTooltip(pointer, { width, height }, viewport)
      tooltip.style.left = `${x}px`
      tooltip.style.top = `${y}px`
    }

    positionTooltip()
    const observer = new ResizeObserver(positionTooltip)
    observer.observe(tooltip)
    window.addEventListener('resize', positionTooltip)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', positionTooltip)
    }
  }, [pointer])

  return createPortal(
    <div ref={tooltipRef} className="map-hud fire-hover-tooltip" role="tooltip">
      {children}
    </div>,
    document.body,
  )
}
