import { useMemo, type RefObject } from 'react'
import { sortRegionsForList, type RegionalEvaluatedRegime } from '../../data/stubSeasonalData'
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

// Compact rows with Singapore pinned first, and the remaining locations sorted by size of departure.
export function RegionList({ regions, selectedRegionId, onSelectRegion, rowRefs }: RegionListProps) {
  const sorted = useMemo(() => sortRegionsForList(regions), [regions])

  return (
    <section className="panel-section" aria-labelledby="locations-heading">
      <h2 id="locations-heading">Locations</h2>
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
                {/* Triangles only for above/below typical, as in the legend; the sign shows direction */}
                {region.statusCategory !== 'fits-typical' && (
                  <span className="region-delta-arrow" aria-hidden="true">
                    {STATUS_GLYPHS[region.statusCategory]}
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
