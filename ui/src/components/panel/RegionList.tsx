import { useMemo, type RefObject } from 'react'
import type { RegionalEvaluatedRegime } from '../../data/stubSeasonalData'
import {
  formatSignedDelta,
  STATUS_GLYPHS,
  STATUS_TEXT,
  STATUS_TONE_CLASS,
} from '../../data/statusDisplay'

interface RegionListProps {
  regions: readonly RegionalEvaluatedRegime[]
  selectedRegionId: string | null
  onSelectRegion: (region: RegionalEvaluatedRegime) => void
  rowRefs: RefObject<Map<string, HTMLButtonElement>>
}

// Compact rows sorted by the size of the departure, so the largest change reads first.
export function RegionList({ regions, selectedRegionId, onSelectRegion, rowRefs }: RegionListProps) {
  const sorted = useMemo(
    () =>
      [...regions].sort(
        (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.region.localeCompare(b.region),
      ),
    [regions],
  )

  return (
    <section className="panel-section" aria-labelledby="regions-heading">
      <h2 id="regions-heading">Regions</h2>
      <ul className="region-list" role="list">
        {sorted.map((region) => (
          <li key={region.id}>
            <button
              ref={(node) => {
                if (node) {
                  rowRefs.current.set(region.id, node)
                } else {
                  rowRefs.current.delete(region.id)
                }
              }}
              type="button"
              className="region-row"
              aria-pressed={selectedRegionId === region.id}
              onClick={() => onSelectRegion(region)}
            >
              <span className="region-row-name">{region.region}</span>{' '}
              <span className={`region-delta ${STATUS_TONE_CLASS[region.statusCategory]}`}>
                {region.delta !== 0 && (
                  <span className="region-delta-arrow" aria-hidden="true">
                    {region.delta > 0 ? STATUS_GLYPHS['anomaly-high'] : STATUS_GLYPHS['below-typical']}
                  </span>
                )}
                {formatSignedDelta(region.delta)}
                <span className="visually-hidden">
                  {' '}vs. typical, {STATUS_TEXT[region.statusCategory].toLowerCase()}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
