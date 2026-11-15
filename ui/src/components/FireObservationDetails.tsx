import { useEffect, useState } from 'react'
import { apiBaseUrl } from '../state/apiStatus'
import { fetchPinnedFireGeometry, summarizeFireGeometry } from '../utils/fireObservationGeometry'
import type { FireSpotTooltipInput } from '../utils/fireSpots'

export function FireObservationDetails({ inputs }: { inputs: readonly FireSpotTooltipInput[] }) {
  const [result, setResult] = useState<{
    inputs: readonly FireSpotTooltipInput[]
    summary: ReturnType<typeof summarizeFireGeometry>
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    void fetchPinnedFireGeometry(apiBaseUrl, inputs, signal).then(
      (observations) => {
        if (!signal.aborted) setResult({ inputs, summary: summarizeFireGeometry(inputs, observations) })
      },
      () => {
        if (!signal.aborted) setResult({ inputs, summary: null })
      },
    )
    return () => controller.abort()
  }, [inputs])

  const settled = result?.inputs === inputs
  const summary = settled ? result.summary : null
  if (!summary) {
    return (
      <p className="fire-observation-status" role="status">
        {settled ? 'Observation geometry unavailable' : 'Loading observation geometry…'}
      </p>
    )
  }

  return (
    <table className="fire-observation-table" aria-label="Estimated observation geometry">
      {summary.sensors.length > 1 && (
        <thead>
          <tr>
            <th scope="col">Observation</th>
            {summary.sensors.map((sensor) => <th key={sensor} scope="col">{sensor.toUpperCase()}</th>)}
          </tr>
        </thead>
      )}
      <tbody>
        {summary.rows.map(({ label, bySensor }) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            {bySensor.map(({ text, count, total }, index) => (
              <td key={summary.sensors[index]} title={count < total ? `${count} of ${total} detections available` : undefined}>
                {text ?? <span aria-label="Unavailable">—</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
