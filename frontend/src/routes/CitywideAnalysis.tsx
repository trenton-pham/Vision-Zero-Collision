import { useQuery } from '@tanstack/react-query'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CitywideMap } from '../components/CitywideMap'
import { CheckIcon } from '../components/Icons'
import { MetricGrid } from '../components/MetricGrid'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { api } from '../lib/api'
import { integer, metricValue } from '../lib/format'
import { useDashboardParams } from '../lib/useUrlState'
import styles from './CitywideAnalysis.module.css'

const SEVERITIES = [
  ['property-damage', 'Property damage'],
  ['injury', 'Injury'],
  ['serious-injury', 'Serious injury'],
  ['fatal', 'Fatal'],
]

function yearSpan(years: number[] | undefined) {
  if (!years?.length) return 'no complete years'
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`
}

export function CitywideAnalysis() {
  const state = useDashboardParams()
  const queryKey = [state.startYear, state.endYear, state.severities]
  const summary = useQuery({ queryKey: ['citywide-summary', ...queryKey], queryFn: ({ signal }) => api.citywideSummary(state.startYear, state.endYear, state.severities, signal) })
  const heatmap = useQuery({ queryKey: ['citywide-heatmap', ...queryKey], queryFn: ({ signal }) => api.heatmap(state.startYear, state.endYear, state.severities, signal), enabled: state.cityLayer === 'heatmap' })
  const kde = useQuery({ queryKey: ['citywide-kde', ...queryKey], queryFn: ({ signal }) => api.kde(state.startYear, state.endYear, state.severities, signal), enabled: state.cityLayer === 'kde' })
  const shift = useQuery({ queryKey: ['citywide-shift', ...queryKey], queryFn: ({ signal }) => api.spatialShift(state.startYear, state.endYear, state.severities, signal) })
  const downtown = useQuery({ queryKey: ['citywide-downtown', ...queryKey], queryFn: ({ signal }) => api.downtownComparison(state.startYear, state.endYear, state.severities, signal) })
  const layerQuery = state.cityLayer === 'heatmap' ? heatmap : kde
  const firstError = summary.error ?? layerQuery.error ?? shift.error ?? downtown.error

  function toggleSeverity(value: string) {
    state.setSeverities(state.severities.includes(value) ? state.severities.filter((item) => item !== value) : [...state.severities, value])
  }

  return (
    <div className={styles.page}>
      <section className={styles.command}>
        <div>
          <h1>Trace the citywide signal.</h1>
          <p>Severity filters here never alter Neighborhood Explorer evidence.</p>
        </div>
        <fieldset className={styles.severity}>
          <legend>SEVERITY</legend>
          {SEVERITIES.map(([value, label]) => <label key={value}><input type="checkbox" checked={state.severities.includes(value)} onChange={() => toggleSeverity(value)}/><span><CheckIcon/>{label}</span></label>)}
        </fieldset>
      </section>

      {(summary.isLoading || layerQuery.isLoading || shift.isLoading || downtown.isLoading) && <LoadingState label="Computing citywide analysis"/>}
      {firstError && <ErrorState error={firstError} onRetry={() => { void summary.refetch(); void layerQuery.refetch(); void shift.refetch(); void downtown.refetch() }}/>} 
      {summary.data && !summary.isLoading && (
        <>
          {summary.data.warnings.map((warning) => <div className={styles.warning} key={warning}>{warning} · excluded from spatial shift</div>)}
          <MetricGrid metrics={summary.data.metrics} compact/>
          <div className={styles.workspace}>
            <section className={styles.mapColumn}>
              <div className={styles.panelBar}>
                <div><span>SPATIAL FIELD</span><strong>{integer.format(summary.data.metrics.collisionCount)} records</strong></div>
                <div className={styles.tabs} role="tablist" aria-label="Density analysis layer">
                  <button role="tab" aria-selected={state.cityLayer === 'heatmap'} onClick={() => state.setCityLayer('heatmap')}>Heatmap</button>
                  <button role="tab" aria-selected={state.cityLayer === 'kde'} onClick={() => state.setCityLayer('kde')}>KDE density</button>
                </div>
              </div>
              {summary.data.metrics.collisionCount === 0 ? <EmptyState title="No collisions match" body="Broaden the year range or severity filters to restore the spatial field."/> : <CitywideMap layer={state.cityLayer} heatmap={heatmap.data} kde={kde.data} shift={shift.data} downtown={downtown.data}/>} 
            </section>
            <aside className={styles.analysisRail}>
              <section className={styles.analysisCard}>
                <span className={styles.cardLabel}>COMPLETE-YEAR SPATIAL SHIFT</span>
                <strong className={styles.shiftValue}>{shift.data?.shiftMeters == null ? '—' : `${integer.format(shift.data.shiftMeters)} m`}</strong>
                <p>{shift.data?.status === 'available' ? `${yearSpan(shift.data.before.years)} centroid to ${yearSpan(shift.data.after.years)} centroid.` : 'The selected range needs complete years on both sides of 2020.'}</p>
                {shift.data?.excludedYears.length ? <small>Excluded: {shift.data.excludedYears.join(', ')} partial</small> : null}
              </section>
              <section className={styles.analysisCard}>
                <span className={styles.cardLabel}>DOWNTOWN VS OUTER</span>
                <div className={styles.seriesLegend} aria-hidden="true"><span><i className={styles.downtownSwatch}/>Downtown</span><span><i className={styles.outerSwatch}/>Outer Seattle</span></div>
                <div className={styles.chart} role="img" aria-label="Annual collision comparison. Amber line shows downtown collisions. Blue line shows outer Seattle collisions.">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={downtown.data?.annual ?? []} margin={{ top: 10, right: 4, bottom: 0, left: -22 }}>
                      <XAxis dataKey="year" stroke="#7890a8" tickLine={false} axisLine={false} tick={{ fontSize: 10 }}/>
                      <YAxis stroke="#7890a8" tickLine={false} axisLine={false} tick={{ fontSize: 10 }}/>
                      <Tooltip contentStyle={{ background: '#0b1927', border: '1px solid #36506a', borderRadius: 0 }}/>
                      <Line dataKey="downtownCollisions" name="Downtown" stroke="#f3a52b" dot={false} isAnimationActive={false}/>
                      <Line dataKey="outerCollisions" name="Outer" stroke="#2f84ff" dot={false} isAnimationActive={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className={styles.analysisCard}>
                <span className={styles.cardLabel}>DOWNTOWN MEAN SEVERITY</span>
                <div className={styles.splitMetric}><strong>{metricValue(downtown.data?.annual.at(-1)?.downtownMeanSeverity ?? null, 'decimal')}</strong><span>latest selected year</span></div>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
