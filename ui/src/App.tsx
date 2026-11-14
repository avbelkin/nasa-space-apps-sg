import { useEffect, useState } from 'react'
import './App.css'

interface ApiStatusResponse {
  service: string
  status: string
  environment: string
  framework: string
  timestampUtc: string
}

type ConnectionState = 'checking' | 'connected' | 'unreachable' | 'unconfigured'

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const apiBaseUrl = rawApiBaseUrl.trim().replace(/\/$/, '')
const statusEndpoint = apiBaseUrl ? `${apiBaseUrl}/api/status` : '/api/status'
const isProdUnconfigured = import.meta.env.PROD && !apiBaseUrl

const STATUS_LABELS: Record<ConnectionState, string> = {
  checking: 'Checking...',
  connected: 'Connected',
  unreachable: 'Unreachable',
  unconfigured: 'Not Configured — set VITE_API_BASE_URL repository variable',
}

async function fetchApiStatus(signal?: AbortSignal): Promise<ApiStatusResponse> {
  const response = await fetch(statusEndpoint, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as ApiStatusResponse
}

function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    isProdUnconfigured ? 'unconfigured' : 'checking',
  )
  const [payload, setPayload] = useState<ApiStatusResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<string>('Never')

  const applySuccess = (data: ApiStatusResponse) => {
    setPayload(data)
    setConnectionState('connected')
    setErrorMessage(null)
    setLastChecked(new Date().toLocaleTimeString())
  }

  const applyFailure = (error: unknown) => {
    setPayload(null)
    setConnectionState('unreachable')
    setLastChecked(new Date().toLocaleTimeString())
    setErrorMessage(error instanceof Error ? error.message : 'Request failed')
  }

  const handleCheckBackend = () => {
    if (isProdUnconfigured) {
      setConnectionState('unconfigured')
      setPayload(null)
      setErrorMessage(null)
      return
    }
    setConnectionState('checking')
    setErrorMessage(null)
    void fetchApiStatus().then(applySuccess, applyFailure)
  }

  useEffect(() => {
    if (isProdUnconfigured) {
      return
    }
    const controller = new AbortController()
    void fetchApiStatus(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          applySuccess(data)
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          applyFailure(error)
        }
      },
    )
    return () => controller.abort()
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>NASA Space Apps SG</h1>
        <p className="app-subtitle">
          Starter stub: React SPA on GitHub Pages connected to an ASP.NET Core container on Google Cloud Run.
        </p>
      </header>

      <main>
        <div className="card-grid">
          <section className="status-card" aria-labelledby="frontend-heading">
            <h2 id="frontend-heading">Frontend (GitHub Pages)</h2>
            <dl className="meta-list">
              <div className="meta-row">
                <dt>Mode</dt>
                <dd>
                  <code>{import.meta.env.MODE}</code>
                </dd>
              </div>
              <div className="meta-row">
                <dt>Base Path</dt>
                <dd>
                  <code>{import.meta.env.BASE_URL}</code>
                </dd>
              </div>
              <div className="meta-row">
                <dt>API Endpoint</dt>
                <dd>
                  <code>{apiBaseUrl ? statusEndpoint : 'Relative proxy (/api/status)'}</code>
                </dd>
              </div>
            </dl>
          </section>

          <section className="status-card" aria-labelledby="backend-heading">
            <h2 id="backend-heading">Backend (Google Cloud Run)</h2>
            <dl className="meta-list">
              <div className="meta-row">
                <dt>Status</dt>
                <dd aria-live="polite">{STATUS_LABELS[connectionState]}</dd>
              </div>
              <div className="meta-row">
                <dt>Runtime</dt>
                <dd>
                  {payload ? (
                    <>
                      <code>{payload.service}</code> ({payload.environment} &middot; {payload.framework})
                    </>
                  ) : (
                    'Unavailable'
                  )}
                </dd>
              </div>
              <div className="meta-row">
                <dt>Last Checked</dt>
                <dd>{lastChecked}</dd>
              </div>
            </dl>

            {errorMessage && (
              <p className="error-note" role="status">
                Detail: {errorMessage}
              </p>
            )}

            <div className="card-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleCheckBackend}
                disabled={connectionState === 'checking'}
              >
                Check Backend
              </button>
            </div>
          </section>
        </div>
      </main>

      <footer className="app-footer">
        <p>React + Vite static frontend &bull; ASP.NET Core .NET 10 Minimal API container</p>
      </footer>
    </div>
  )
}

export default App
