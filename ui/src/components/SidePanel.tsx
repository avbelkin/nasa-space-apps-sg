import { useEffect, useRef } from 'react'
import type {
  MonthlyBaselinePoint,
  RegionalEvaluatedRegime,
  SensorFilter,
} from '../data/stubSeasonalData'
import { MONTH_NAMES } from '../data/statusDisplay'
import type { ApiStatusResponse, ConnectionState } from '../state/apiStatus'
import type { LiveSatelliteSnapshot } from '../utils/satelliteOrbits'
import { AttributionFooter } from './panel/AttributionFooter'
import { DiagnosticsDetails } from './panel/DiagnosticsDetails'
import { LiveFiresSection, type LiveFiresInfo } from './panel/LiveFiresSection'
import { PanelSummary } from './panel/PanelSummary'
import { RegionList } from './panel/RegionList'
import { SatelliteDetails, type SatelliteFeedState } from './panel/SatelliteDetails'
import { ScopeRow } from './panel/ScopeRow'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'

const SENSOR_FILTER_OPTIONS: readonly SegmentedOption<SensorFilter>[] = [
  // The challenge's own term; the accessible name says what is harmonized
  { value: 'harmonized', label: 'Harmonized', ariaLabel: 'Harmonized MODIS and VIIRS' },
  { value: 'modis', label: 'MODIS' },
  { value: 'viirs', label: 'VIIRS' },
]

interface SidePanelProps {
  selectedMonth: number
  monthProfile: MonthlyBaselinePoint
  sensorFilter: SensorFilter
  onSensorFilterChange: (next: SensorFilter) => void
  regions: readonly RegionalEvaluatedRegime[]
  selectedRegionId: string | null
  onSelectRegion: (region: RegionalEvaluatedRegime) => void
  onClearRegion: () => void
  satelliteFeedState: SatelliteFeedState
  satellites: readonly LiveSatelliteSnapshot[]
  selectedSatelliteId: string | null
  onSelectSatellite: (satellite: LiveSatelliteSnapshot) => void
  connectionState: ConnectionState
  apiPayload: ApiStatusResponse | null
  apiErrorMessage: string | null
  lastChecked: string
  onCheckApi: () => void
  tleSourceSummary: string | null
  orbitsError: string | null
  liveFires: LiveFiresInfo
  liveFiresConfigured: boolean
}

export function SidePanel({
  selectedMonth,
  monthProfile,
  sensorFilter,
  onSensorFilterChange,
  regions,
  selectedRegionId,
  onSelectRegion,
  onClearRegion,
  satelliteFeedState,
  satellites,
  selectedSatelliteId,
  onSelectSatellite,
  connectionState,
  apiPayload,
  apiErrorMessage,
  lastChecked,
  onCheckApi,
  tleSourceSummary,
  orbitsError,
  liveFires,
  liveFiresConfigured,
}: SidePanelProps) {
  const scopeRef = useRef<HTMLDListElement | null>(null)
  const regionRowRefs = useRef(new Map<string, HTMLButtonElement>())
  const selectedRegion = regions.find((region) => region.id === selectedRegionId) ?? null

  // The clear button disappears with the selection: hand focus to the region's row instead.
  const clearRegion = (restoreFocus: boolean) => {
    const rowButton = selectedRegionId ? regionRowRefs.current.get(selectedRegionId) : undefined
    onClearRegion()
    if (restoreFocus) {
      rowButton?.focus()
    }
  }
  const clearRegionRef = useRef(clearRegion)
  useEffect(() => {
    clearRegionRef.current = clearRegion
  })

  useEffect(() => {
    if (!selectedRegionId) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      clearRegionRef.current(scopeRef.current?.contains(document.activeElement) ?? false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedRegionId])

  return (
    <aside className="side-panel wrapper-surface" aria-label="Fire activity details">
      <ScopeRow
        scopeRef={scopeRef}
        regionName={selectedRegion?.region ?? null}
        monthName={MONTH_NAMES[selectedMonth]}
        onClearRegion={() => clearRegion(true)}
      />

      <div className="sensor-row">
        <span className="sensor-row-label" aria-hidden="true">
          Sensors
        </span>
        <SegmentedControl
          label="Sensors"
          options={SENSOR_FILTER_OPTIONS}
          value={sensorFilter}
          onChange={onSensorFilterChange}
        />
      </div>

      <PanelSummary monthProfile={monthProfile} selectedRegion={selectedRegion} />

      <RegionList
        regions={regions}
        selectedRegionId={selectedRegionId}
        onSelectRegion={onSelectRegion}
        rowRefs={regionRowRefs}
      />

      <LiveFiresSection info={liveFires} />

      <div className="panel-details-group">
        <SatelliteDetails
          feedState={satelliteFeedState}
          snapshots={satellites}
          selectedSatelliteId={selectedSatelliteId}
          onSelectSatellite={onSelectSatellite}
        />
        <DiagnosticsDetails
          connectionState={connectionState}
          payload={apiPayload}
          errorMessage={apiErrorMessage}
          lastChecked={lastChecked}
          onCheckApi={onCheckApi}
          tleSourceSummary={tleSourceSummary}
          orbitsError={orbitsError}
        />
      </div>

      <AttributionFooter
        connectionState={connectionState}
        liveFiresConfigured={liveFiresConfigured}
      />
    </aside>
  )
}
