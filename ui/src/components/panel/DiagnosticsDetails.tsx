import {
  apiBaseUrl,
  CONNECTION_LABELS,
  isProdUnconfigured,
  statusEndpoint,
  type ApiStatusResponse,
  type ConnectionState,
} from '../../state/apiStatus'
import { ChevronDownIcon } from '../icons'

interface DiagnosticsDetailsProps {
  connectionState: ConnectionState
  payload: ApiStatusResponse | null
  errorMessage: string | null
  lastChecked: string
  onCheckApi: () => void
  tleSourceSummary: string | null
  orbitsError: string | null
}

// Technical state for whoever runs the deployment; closed by default.
export function DiagnosticsDetails({
  connectionState,
  payload,
  errorMessage,
  lastChecked,
  onCheckApi,
  tleSourceSummary,
  orbitsError,
}: DiagnosticsDetailsProps) {
  const isChecking = connectionState === 'checking'

  return (
    <details className="panel-details">
      <summary className="panel-details-summary">
        <span>Diagnostics</span>
        <ChevronDownIcon className="panel-details-chevron" />
      </summary>
      <div className="panel-details-body">
        <dl className="meta-list">
          <div className="meta-row">
            <dt>API status</dt>
            <dd>
              {CONNECTION_LABELS[connectionState]}
              {isProdUnconfigured ? ' (set the VITE_API_BASE_URL repository variable)' : ''}
            </dd>
          </div>
          <div className="meta-row">
            <dt>Runtime</dt>
            <dd>
              {payload ? (
                <>
                  <code>{payload.service}</code> ({payload.environment} &middot; {payload.framework})
                </>
              ) : (
                errorMessage ?? 'Unavailable'
              )}
            </dd>
          </div>
          <div className="meta-row">
            <dt>Last checked</dt>
            <dd>{lastChecked}</dd>
          </div>
          <div className="meta-row">
            <dt>Build mode / base path</dt>
            <dd>
              <code>{import.meta.env.MODE}</code> &middot; <code>{import.meta.env.BASE_URL}</code>
            </dd>
          </div>
          <div className="meta-row">
            <dt>API endpoint</dt>
            <dd>
              <code>{apiBaseUrl ? statusEndpoint : 'Relative proxy (/api/status)'}</code>
            </dd>
          </div>
          <div className="meta-row">
            <dt>Orbit feed (TLE source)</dt>
            <dd>
              {tleSourceSummary ? (
                <code>{tleSourceSummary}</code>
              ) : orbitsError ? (
                `Unavailable: ${orbitsError}`
              ) : (
                'Not loaded'
              )}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => {
            if (!isChecking) {
              onCheckApi()
            }
          }}
          aria-disabled={isChecking}
        >
          Check API
        </button>
      </div>
    </details>
  )
}
