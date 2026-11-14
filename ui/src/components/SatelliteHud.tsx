import type { SatelliteHudSection } from '../utils/satelliteOrbits'

interface SatelliteHudProps {
  section: SatelliteHudSection
}

// How fresh the satellite view of the map's centre is: the latest pass of each satellite, whether
// its data is ready yet, and the next pass. Bottom-end corner, kept above MapLibre's attribution.
export function SatelliteHud({ section }: SatelliteHudProps) {
  return (
    <div
      className="map-hud map-hud-bottom-end"
      data-testid="sat-hud"
      role="group"
      aria-label="Satellite overpass freshness"
    >
      <div className="sat-hud-header">
        <span className="sat-hud-title">{section.title}</span>
      </div>
      <div className="sat-hud-list" role="list">
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
  )
}
