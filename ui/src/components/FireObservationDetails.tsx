import { useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../state/apiStatus'
import { fetchPinnedFireGeometry, summarizeFireGeometry, type FireObservationGeometry } from '../utils/fireObservationGeometry'
import { summarizeFireWeather, type FireObservationWeather } from '../utils/fireObservationWeather'
import type { FireSpotTooltipInput } from '../utils/fireSpots'

export function FireObservationDetails({ inputs, feedGeometry, weatherObservations }: {
  inputs: readonly FireSpotTooltipInput[]
  feedGeometry?: readonly (FireObservationGeometry | null)[]
  weatherObservations?: readonly (FireObservationWeather | null)[]
}) {
  const [result, setResult] = useState<{
    inputs: readonly FireSpotTooltipInput[]
    feedGeometry: typeof feedGeometry
    summary: ReturnType<typeof summarizeFireGeometry>
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    void fetchPinnedFireGeometry(apiBaseUrl, inputs, signal, feedGeometry).then(
      (observations) => {
        if (!signal.aborted) setResult({ inputs, feedGeometry, summary: summarizeFireGeometry(inputs, observations) })
      },
      () => {
        if (!signal.aborted) setResult({ inputs, feedGeometry, summary: summarizeFireGeometry(inputs, feedGeometry ?? []) })
      },
    )
    return () => controller.abort()
  }, [inputs, feedGeometry])

  const settled = result?.inputs === inputs && result.feedGeometry === feedGeometry
  const summary = settled ? result.summary : summarizeFireGeometry(inputs, feedGeometry ?? [])
  const weather = useMemo(() => weatherObservations && summarizeFireWeather(inputs, weatherObservations), [inputs, weatherObservations])

  return (
    <>
      {summary ? (
        <ObservationTable label="Estimated observation geometry" summary={summary} />
      ) : (
        <p className="fire-observation-status" role="status">
          {settled ? 'Observation geometry unavailable' : 'Loading observation geometry…'}
        </p>
      )}
      <details className="fire-weather-details">
        <summary>Weather at acquisition</summary>
        {weather ? (
          <ObservationTable label="Weather at acquisition" summary={weather} />
        ) : (
          <p className="fire-observation-status" role="status">
            {weatherObservations ? 'Weather unavailable' : 'Loading weather…'}
          </p>
        )}
      </details>
    </>
  )
}

function ObservationTable({ label, summary }: {
  label: string
  summary: NonNullable<ReturnType<typeof summarizeFireGeometry>>
}) {
  return (
    <table className="fire-observation-table" aria-label={label}>
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
