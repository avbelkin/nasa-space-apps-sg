export type ConnectionState = 'checking' | 'connected' | 'unreachable' | 'unconfigured'

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
export const apiBaseUrl = rawApiBaseUrl.trim().replace(/\/$/, '')
const statusEndpoint = apiBaseUrl ? `${apiBaseUrl}/api/status` : '/api/status'
export const isProdUnconfigured = import.meta.env.PROD && !apiBaseUrl

export const CONNECTION_SHORT_LABELS: Record<ConnectionState, string> = {
  checking: 'Checking data service',
  connected: 'Data service online',
  unreachable: 'Data service offline',
  unconfigured: 'Data service not connected',
}

export async function fetchApiStatus(signal?: AbortSignal): Promise<void> {
  const response = await fetch(statusEndpoint, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  await response.json()
}
