import { useEffect, useState } from 'react'
import { apiBaseUrl } from '../state/apiStatus'
import { fetchPinnedFireGeometry, summarizeFireGeometry } from '../utils/fireObservationGeometry'
import { fetchPinnedFireWeather, summarizeFireWeather } from '../utils/fireObservationWeather'
import type { FireSpotTooltipInput } from '../utils/fireSpots'

export function FireObservationDetails({ inputs }: { inputs: readonly FireSpotTooltipInput[] }) {
  const [result, setResult] = useState<{
    inputs: readonly FireSpotTooltipInput[]
    summary: ReturnType<typeof summarizeFireGeometry>
  } | null>(null)
  const [weatherResult, setWeatherResult] = useState<{
    inputs: readonly FireSpotTooltipInput[]
    summary: ReturnType<typeof summarizeFireWeather>
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
    void fetchPinnedFireWeather(apiBaseUrl, inputs, signal).then(
      (observations) => {
        if (!signal.aborted) setWeatherResult({ inputs, summary: summarizeFireWeather(inputs, observations) })
      },
      () => {
        if (!signal.aborted) setWeatherResult({ inputs, summary: null })
      },
    )
    return () => controller.abort()
  }, [inputs])

  const settled = result?.inputs === inputs
  const summary = settled ? result.summary : null
  const weatherSettled = weatherResult?.inputs === inputs
  const weather = weatherSettled ? weatherResult.summary : null

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
            {weatherSettled ? 'Weather unavailable' : 'Loading weather…'}
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
