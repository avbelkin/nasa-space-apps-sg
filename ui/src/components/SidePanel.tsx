import type { SensorFilter } from '../data/mapTypes'
import type { ApiStatusResponse, ConnectionState } from '../state/apiStatus'
import type { LiveSatelliteSnapshot } from '../utils/satelliteOrbits'
import { AttributionFooter } from './panel/AttributionFooter'
import { DiagnosticsDetails } from './panel/DiagnosticsDetails'
import { LiveFiresSection, type LiveFiresInfo } from './panel/LiveFiresSection'
import { SatelliteDetails, type SatelliteFeedState } from './panel/SatelliteDetails'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'

const SENSOR_FILTER_OPTIONS: readonly SegmentedOption<SensorFilter>[] = [
  { value: 'harmonized', label: 'All sensors' },
  { value: 'modis', label: 'MODIS' },
  { value: 'viirs', label: 'VIIRS' },
]

interface SidePanelProps {
  sensorFilter: SensorFilter
  onSensorFilterChange: (next: SensorFilter) => void
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
}

export function SidePanel({
  sensorFilter,
  onSensorFilterChange,
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
}: SidePanelProps) {
  return (
    <aside className="side-panel wrapper-surface" aria-label="Fire activity details">
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

      <AttributionFooter connectionState={connectionState} />
    </aside>
  )
}
