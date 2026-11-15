import { fireObservationKeys, summarizeObservations } from './fireObservationGeometry.ts'
import type { FireSpotTooltipInput } from './fireSpots.ts'

export interface FireObservationWeather {
  acquiredAtUtc: string
  sources: { values: Record<string, { value: number | null; unit: string }> }[]
}

const MAX_BATCH_SIZE = 16

export async function fetchPinnedFireWeather(
  apiBaseUrl: string,
  inputs: readonly FireSpotTooltipInput[],
  signal: AbortSignal,
): Promise<(FireObservationWeather | null)[]> {
  const observations = Array<FireObservationWeather | null>(inputs.length).fill(null)
  const requested = fireObservationKeys(inputs)
  for (let offset = 0; offset < requested.length; offset += MAX_BATCH_SIZE) {
    signal.throwIfAborted()
    const entries = requested.slice(offset, offset + MAX_BATCH_SIZE)
    try {
      const response = await fetch(`${apiBaseUrl}/api/fires/spots/weather`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ spots: entries.map(({ key }) => key) }),
        signal,
      })
      if (!response.ok) continue
      const { spots } = (await response.json()) as { spots?: (FireObservationWeather | null)[] }
      if (!Array.isArray(spots) || spots.length !== entries.length) continue
      entries.forEach(({ index, key }, row) => {
        const weather = spots[row]
        if (weather && Date.parse(weather.acquiredAtUtc) === key.timestampMs) observations[index] = weather
      })
    } catch {
      signal.throwIfAborted()
    }
  }
  return observations
}

const metrics = [
  { field: 'temperature_2m', label: 'Air temperature', sourceUnit: 'K', unit: ' °C', offset: -273.15 },
  { field: 'dew_point_2m', label: 'Dew point', sourceUnit: 'K', unit: ' °C', offset: -273.15 },
  { field: 'relative_humidity_2m', label: 'Relative humidity', sourceUnit: '%', unit: '%' },
  { field: 'vapour_pressure_deficit', label: 'Vapor pressure deficit', sourceUnit: 'kPa', unit: ' kPa' },
  { field: 'wind_speed_10m', label: 'Wind at 10 m', sourceUnit: 'm/s', unit: ' m/s' },
  { field: 'wind_gusts_10m', label: 'Gusts', sourceUnit: 'm/s', unit: ' m/s' },
  { field: 'cloud_cover', label: 'Modeled cloud cover', sourceUnit: '%', unit: '%' },
  { field: 'satellite_cloud_fraction', label: 'Cloud over footprint', sourceUnit: '1', unit: '%', scale: 100 },
  { field: 'satellite_infrared_brightness_temperature', label: 'Satellite IR brightness', sourceUnit: 'K', unit: ' K' },
  { field: 'visibility', label: 'Visibility', sourceUnit: 'm', unit: ' km', scale: 0.001 },
  { field: 'precipitation_3h', label: 'Precipitation · 3 h', sourceUnit: 'mm', unit: ' mm' },
  { field: 'precipitation_24h', label: 'Precipitation · 24 h', sourceUnit: 'mm', unit: ' mm' },
  { field: 'radar_reflectivity', label: 'Radar reflectivity', sourceUnit: 'dBZ', unit: ' dBZ' },
  { field: 'observed_lightning_flash_count_50km', label: 'Lightning · 50 km', sourceUnit: 'flashes', unit: '' },
  { field: 'snow_depth', label: 'Snow depth', sourceUnit: 'cm', unit: ' cm' },
  { field: 'snow_cover_percent', label: 'Snow cover', sourceUnit: '%', unit: '%' },
  { field: 'shortwave_radiation_instant', label: 'Solar irradiance', sourceUnit: 'W/m²', unit: ' W/m²' },
  { field: 'aerosol_optical_depth', label: 'Aerosol optical depth', sourceUnit: '1', unit: '' },
  { field: 'soil_moisture_anomaly_0_to_100cm', label: 'Soil moisture anomaly · 0–100 cm', sourceUnit: 'mm', unit: ' mm' },
  { field: 'fire_weather_index', label: 'Fire Weather Index', sourceUnit: '1', unit: '' },
  { field: 'dead_fuel_moisture_10h', label: 'Dead fuel moisture · 10 h', sourceUnit: '%', unit: '%' },
  { field: 'dead_fuel_moisture_100h', label: 'Dead fuel moisture · 100 h', sourceUnit: '%', unit: '%' },
  { field: 'dead_fuel_moisture_1000h', label: 'Dead fuel moisture · 1,000 h', sourceUnit: '%', unit: '%' },
].map(({ field, label, sourceUnit, unit, scale = 1, offset = 0 }) => ({
  label,
  unit,
  read: (weather: FireObservationWeather) => {
    for (const source of weather.sources) {
      const measurement = source.values[field]
      if (measurement?.unit === sourceUnit && measurement.value != null && Number.isFinite(measurement.value)) {
        return measurement.value * scale + offset
      }
    }
    return null
  },
}))

export function summarizeFireWeather(
  inputs: readonly FireSpotTooltipInput[],
  observations: readonly (FireObservationWeather | null)[],
) {
  const summary = summarizeObservations(inputs, observations, metrics)
  const rows = summary?.rows.filter(({ bySensor }) => bySensor.some(({ count }) => count > 0))
  return summary && rows?.length ? { ...summary, rows } : null
}
