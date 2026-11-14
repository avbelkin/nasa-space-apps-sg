import { useState } from 'react'
import type { SatelliteHudSection } from '../utils/satelliteOrbits'
import { ChevronDownIcon } from './icons'

interface SatelliteHudProps {
  section: SatelliteHudSection
  // Open by default on a wide map; once the user toggles it, their choice wins.
  defaultOpen: boolean
}

// How fresh the satellite view of the map's centre is: the latest pass of each satellite, whether
// its data is ready yet, and the next pass. Bottom-end corner, kept above MapLibre's attribution.
// Collapsible, so it never has to hide the marks underneath it (it starts folded on narrow maps).
export function SatelliteHud({ section, defaultOpen }: SatelliteHudProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? defaultOpen

  return (
    <details
      className="map-hud map-hud-bottom-end"
      data-testid="sat-hud"
      open={open}
      // Fires for user toggles and for our own prop updates; only a real mismatch is a user choice.
      onToggle={(event) => {
        const isOpen = event.currentTarget.open
        if (isOpen !== open) {
          setUserOpen(isOpen)
        }
      }}
    >
      <summary className="sat-hud-header">
        <span className="sat-hud-title">{section.title}</span>
        <ChevronDownIcon className="sat-hud-chevron" />
      </summary>
      <div className="sat-hud-body">
        <div className="sat-hud-list" role="list" aria-label="Latest pass of each satellite">
          {section.items.map((item) => (
            <div key={item.id} className="sat-hud-item" data-tone={item.tone} role="listitem">
              <span className="sat-hud-label">{item.label}</span>
              <span className="sat-hud-value">{item.value}</span>
              {item.detail && <span className="sat-hud-detail">{item.detail}</span>}
              <span className="sat-hud-badge">{item.badge}</span>
            </div>
          ))}
        </div>
        {section.summary && <div className="sat-hud-summary">{section.summary}</div>}
      </div>
    </details>
  )
}
