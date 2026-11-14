import type {
  MonthlyBaselinePoint,
  RegionalEvaluatedRegime,
  StatusCategory,
} from '../../data/stubSeasonalData'
import {
  formatPeakMonths,
  formatSignedDelta,
  monthStatusCategory,
  SENSOR_AGREEMENT_TEXT,
  STATUS_GLYPHS,
  STATUS_TEXT,
  STATUS_TONE_CLASS,
} from '../../data/statusDisplay'

const MONTH_STATUS_TEXT: Record<MonthlyBaselinePoint['classification'], string> = {
  'Fits Typical Calendar': 'Typical for the month',
  'Above-Normal Anomaly': 'Above typical',
  'Early-Season Anomaly': 'Above typical: the season started early',
}

interface PanelSummaryProps {
  monthProfile: MonthlyBaselinePoint
  selectedRegion: RegionalEvaluatedRegime | null
}

function DeltaValue({ delta, category }: { delta: number; category: StatusCategory }) {
  return (
    <span className={`metric-delta ${STATUS_TONE_CLASS[category]}`}>
      {delta !== 0 && (
        <span aria-hidden="true">{delta > 0 ? STATUS_GLYPHS['anomaly-high'] : STATUS_GLYPHS['below-typical']}</span>
      )}
      {formatSignedDelta(delta)}
      <span className="visually-hidden"> vs. typical</span>
    </span>
  )
}

// Global numbers for the month, or the selected region's details.
export function PanelSummary({ monthProfile, selectedRegion }: PanelSummaryProps) {
  const typical = selectedRegion ? selectedRegion.effectiveTypical : monthProfile.typicalIndex
  const current = selectedRegion ? selectedRegion.effectiveCurrent : monthProfile.currentIndex
  const delta = current - typical
  const category = selectedRegion ? selectedRegion.statusCategory : monthStatusCategory(monthProfile)
  const statusText = selectedRegion
    ? STATUS_TEXT[selectedRegion.statusCategory]
    : MONTH_STATUS_TEXT[monthProfile.classification]

  return (
    <section className="panel-section panel-summary" aria-labelledby="summary-heading">
      <div className="summary-header">
        <h2 id="summary-heading">{selectedRegion ? selectedRegion.region : 'Global'}</h2>
        <span
          className="sample-badge"
          title="Illustrative values until live NASA FIRMS data is connected"
        >
          Sample data
        </span>
      </div>

      <p className={`status-line ${STATUS_TONE_CLASS[category]}`}>
        <span className="status-glyph" aria-hidden="true">
          {STATUS_GLYPHS[category]}
        </span>
        {statusText}
      </p>

      <div className="baseline-compare">
        <div className="metric-tile">
          <span className="metric-label">Typical</span>
          <span className="metric-value">{typical}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-label">This year</span>
          <span className="metric-value">
            {current} <DeltaValue delta={delta} category={category} />
          </span>
        </div>
      </div>
      <p className="metric-unit">Fire activity index, 0&ndash;100</p>

      {selectedRegion ? (
        <>
          <dl className="summary-facts">
            <div>
              <dt>Peak months</dt>
              <dd>{formatPeakMonths(selectedRegion.peakMonths)}</dd>
            </div>
            <div>
              <dt>Sensors</dt>
              <dd>{SENSOR_AGREEMENT_TEXT[selectedRegion.sensorAgreement]}</dd>
            </div>
          </dl>
          <p className="panel-note">{selectedRegion.note}</p>
        </>
      ) : (
        <p className="panel-note">{monthProfile.summary}</p>
      )}
    </section>
  )
}
