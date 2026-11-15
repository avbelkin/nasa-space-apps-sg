import { useMemo } from 'react'
import type { SensorFilter } from '../../data/mapTypes'
import type { FirmsLiveSpotsResponse } from '../../utils/fireSpots'
import { summarizeSurfaceBySensor } from '../../utils/surfaceSummary'

interface SurfaceSensorTableProps {
  payload: FirmsLiveSpotsResponse | null
  sensorFilter: SensorFilter
}

// Raw detections per dominant land-cover class, split by sensor. First place in the UI where
// the surface-type hypothesis can be eyeballed; counts only, with the resolution caveat attached.
export function SurfaceSensorTable({ payload, sensorFilter }: SurfaceSensorTableProps) {
  const rows = useMemo(() => summarizeSurfaceBySensor(payload), [payload])
  if (!payload || rows.length === 0) {
    return null
  }

  return (
    <div className="panel-section" role="group" aria-labelledby="surface-sensor-heading">
      <h3 id="surface-sensor-heading" className="surface-sensor-heading">Detections by surface class</h3>
      <table className="surface-sensor-table">
        <thead>
          <tr>
            <th scope="col">Surface (ESA CCI 2019)</th>
            <th scope="col" data-dimmed={sensorFilter === 'viirs' || undefined}>MODIS</th>
            <th scope="col" data-dimmed={sensorFilter === 'modis' || undefined}>VIIRS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} data-kind={row.kind}>
              <th scope="row">{row.label}</th>
              <td data-dimmed={sensorFilter === 'viirs' || undefined}>
                {row.modisCount.toLocaleString('en-US')}
              </td>
              <td data-dimmed={sensorFilter === 'modis' || undefined}>
                {row.viirsCount.toLocaleString('en-US')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="panel-note">
        Raw detections, not harmonized. VIIRS (375 m) detects smaller fires that MODIS (1 km)
        misses — compare shares within a surface class, not raw totals.
      </p>
    </div>
  )
}
