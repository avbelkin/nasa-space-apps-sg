export interface ApiStatusResponse {
  service: string
  status: string
  environment: string
  framework: string
  timestampUtc: string
}

export type ConnectionState = 'checking' | 'connected' | 'unreachable' | 'unconfigured'

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
export const apiBaseUrl = rawApiBaseUrl.trim().replace(/\/$/, '')
export const statusEndpoint = apiBaseUrl ? `${apiBaseUrl}/api/status` : '/api/status'
export const isProdUnconfigured = import.meta.env.PROD && !apiBaseUrl

// Full labels for Diagnostics; the footer indicator uses the short ones.
export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  checking: 'Checking…',
  connected: 'Connected',
  unreachable: 'Unreachable',
  unconfigured: 'Not configured',
}

export const CONNECTION_SHORT_LABELS: Record<ConnectionState, string> = {
  checking: 'Checking data service',
  connected: 'Data service online',
  unreachable: 'Data service offline',
  unconfigured: 'Data service not connected',
}

export async function fetchApiStatus(signal?: AbortSignal): Promise<ApiStatusResponse> {
  const response = await fetch(statusEndpoint, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as ApiStatusResponse
}
