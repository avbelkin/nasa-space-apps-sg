import type { Ref } from 'react'
import { CloseIcon } from '../icons'

interface ScopeRowProps {
  regionName: string | null
  monthName: string
  onClearRegion: () => void
  scopeRef?: Ref<HTMLDListElement>
}

// Readout of the current area and period; the future home of the area and date inputs.
export function ScopeRow({ regionName, monthName, onClearRegion, scopeRef }: ScopeRowProps) {
  return (
    <dl ref={scopeRef} className="scope-row" aria-label="Current selection">
      <div className="scope-item">
        <dt>Area</dt>
        <dd>
          <span className="scope-value">{regionName ?? 'Global'}</span>
          {regionName && (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Clear location ${regionName}`}
              title="Clear location (Esc)"
              onClick={onClearRegion}
            >
              <CloseIcon />
            </button>
          )}
        </dd>
      </div>
      <div className="scope-item">
        <dt>Period</dt>
        <dd>
          <span className="scope-value">{monthName}</span>
        </dd>
      </div>
    </dl>
  )
}
