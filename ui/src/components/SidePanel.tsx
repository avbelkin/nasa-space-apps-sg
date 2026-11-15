import type { ReactNode } from 'react'
import { FIRE_SENSOR_GROUP_COLORS } from '../data/dataPalette'
import type { SensorFilter } from '../data/mapTypes'
import type { ConnectionState } from '../state/apiStatus'
import type { LiveSatelliteSnapshot } from '../utils/satelliteOrbits'
import { AttributionFooter } from './panel/AttributionFooter'
import { LiveFiresSection, type LiveFiresInfo } from './panel/LiveFiresSection'
import { SatelliteDetails, type SatelliteFeedState } from './panel/SatelliteDetails'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'

const SENSOR_FILTER_OPTIONS: readonly SegmentedOption<SensorFilter>[] = [
  { value: 'harmonized', label: 'All sensors' },
  { value: 'modis', label: 'MODIS' },
  { value: 'viirs', label: 'VIIRS' },
]

const FIRE_SENSOR_COLOR_LEGEND = [
  { label: 'Both sensors', color: FIRE_SENSOR_GROUP_COLORS.both },
  { label: 'Single detection', color: FIRE_SENSOR_GROUP_COLORS.single },
  { label: 'MODIS only (2+)', color: FIRE_SENSOR_GROUP_COLORS.modis },
  { label: 'VIIRS only (2+)', color: FIRE_SENSOR_GROUP_COLORS.viirs },
] as const

interface SidePanelProps {
  sensorFilter: SensorFilter
  onSensorFilterChange: (next: SensorFilter) => void
  colorFireSpotsBySensor: boolean
  onFireSensorColorsChange: (enabled: boolean) => void
  satelliteFeedState: SatelliteFeedState
  satellites: readonly LiveSatelliteSnapshot[]
  selectedSatelliteId: string | null
  onSelectSatellite: (satellite: LiveSatelliteSnapshot) => void
  connectionState: ConnectionState
  liveFires: LiveFiresInfo
  pinnedDetails: ReactNode
  legend: ReactNode
}

export function SidePanel({
  sensorFilter,
  onSensorFilterChange,
  colorFireSpotsBySensor,
  onFireSensorColorsChange,
  satelliteFeedState,
  satellites,
  selectedSatelliteId,
  onSelectSatellite,
  connectionState,
  liveFires,
  pinnedDetails,
  legend,
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

      {sensorFilter === 'harmonized' && (
        <div className="fire-sensor-colors">
          <label className="fire-sensor-colors-switch">
            <input
              type="checkbox"
              role="switch"
              checked={colorFireSpotsBySensor}
              onChange={(event) => onFireSensorColorsChange(event.target.checked)}
            />
            Color fire spots by sensor
          </label>
          {colorFireSpotsBySensor && (
            <ul className="fire-sensor-color-key" aria-label="Fire spot colors by sensor">
              {FIRE_SENSOR_COLOR_LEGEND.map(({ label, color }) => (
                <li key={label}>
                  <span className="legend-fire-dot" style={{ backgroundColor: color }} aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pinnedDetails}

      <SatelliteDetails
        feedState={satelliteFeedState}
        snapshots={satellites}
        selectedSatelliteId={selectedSatelliteId}
        onSelectSatellite={onSelectSatellite}
      />

      <div className="panel-bottom">
        <LiveFiresSection info={liveFires} />
        {legend}
        <AttributionFooter connectionState={connectionState} />
      </div>
    </aside>
  )
}
