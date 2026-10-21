import { useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CitywideMap } from '../components/CitywideMap'
import { CheckIcon } from '../components/Icons'
import { MetricGrid } from '../components/MetricGrid'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { api } from '../lib/api'
import { integer, metricValue } from '../lib/format'
import { useDashboardParams } from '../lib/useUrlState'
import { CITYWIDE_SEVERITIES, type CitywideSeverity } from '../lib/severity'
import { snapshotMotion, useStatisticsFade, type StatisticsRetry } from '../lib/motion'
import styles from './CitywideAnalysis.module.css'

function yearSpan(years: number[] | undefined) {
  if (!years?.length) return 'no complete years'
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`
}

export function CitywideAnalysis() {
  const state = useDashboardParams()
  const [filtersOpen, setFiltersOpen] = useState(() => !window.matchMedia('(max-width: 600px)').matches)
  const queryKey = [state.startYear, state.endYear, state.severities]
  const summary = useQuery({ queryKey: ['citywide-summary', ...queryKey], queryFn: ({ signal }) => api.citywideSummary(state.startYear, state.endYear, state.severities, signal), placeholderData: keepPreviousData })
  const heatmap = useQuery({ queryKey: ['citywide-heatmap', ...queryKey], queryFn: ({ signal }) => api.heatmap(state.startYear, state.endYear, state.severities, signal), enabled: state.cityLayer === 'heatmap' })
  const kde = useQuery({ queryKey: ['citywide-kde', ...queryKey], queryFn: ({ signal }) => api.kde(state.startYear, state.endYear, state.severities, signal), enabled: state.cityLayer === 'kde' })
  const shift = useQuery({ queryKey: ['citywide-shift', ...queryKey], queryFn: ({ signal }) => api.spatialShift(state.startYear, state.endYear, state.severities, signal) })
  const downtown = useQuery({ queryKey: ['citywide-downtown', ...queryKey], queryFn: ({ signal }) => api.downtownComparison(state.startYear, state.endYear, state.severities, signal) })
  const layerQuery = state.cityLayer === 'heatmap' ? heatmap : kde
  const firstError = summary.error ?? layerQuery.error ?? shift.error ?? downtown.error
  const completeDowntownYears = downtown.data?.annual.filter((item) => !item.isPartial) ?? []
  const latestCompleteDowntownYear = completeDowntownYears.at(-1)
  const statisticsIdentity = JSON.stringify([state.startYear, state.endYear, [...state.severities].sort()])
  const summaryRetry = useRef<StatisticsRetry | null>(null)
  const shiftRetry = useRef<StatisticsRetry | null>(null)
  const downtownRetry = useRef<StatisticsRetry | null>(null)
  const summaryStatistics = useStatisticsFade({ identity: statisticsIdentity, revision: summary.dataUpdatedAt, ready: summary.isSuccess && !summary.isPlaceholderData, failed: summary.isError && !summary.isFetching, retry: summaryRetry.current, selector: '[data-statistics-summary] [data-statistic]' })
  const shiftStatistics = useStatisticsFade<HTMLElement>({ identity: statisticsIdentity, revision: shift.dataUpdatedAt, ready: shift.isSuccess, failed: shift.isError && !shift.isFetching, retry: shiftRetry.current })
  const downtownStatistics = useStatisticsFade<HTMLElement>({ identity: statisticsIdentity, revision: downtown.dataUpdatedAt, ready: downtown.isSuccess, failed: downtown.isError && !downtown.isFetching, retry: downtownRetry.current })

  function toggleSeverity(value: CitywideSeverity) {
    state.setSeverities(state.severities.includes(value) ? state.severities.filter((item) => item !== value) : [...state.severities, value])
  }

  return (
    <div ref={summaryStatistics} className={styles.page}>
      <section className={styles.command}>
        <div>
          <h1>Citywide Analysis</h1>
          <p>Explore collision concentrations and changes across Seattle.</p>
        </div>
        <details id="severity-filters" className={styles.filterDetails} open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}>
          <summary>Severity filters · {state.severities.length ? `${state.severities.length} selected` : 'all levels'}</summary>
          <fieldset className={styles.severity}>
            <legend className="sr-only">Severity</legend>
            {CITYWIDE_SEVERITIES.map(([value, label]) => <label key={value}><input type="checkbox" checked={state.severities.includes(value)} onChange={() => toggleSeverity(value)}/><span data-press-feedback><CheckIcon/>{label}</span></label>)}
            {state.severities.length > 0 && <button type="button" onClick={() => state.setSeverities([])}>Show all levels</button>}
          </fieldset>
        </details>
      </section>

      {summary.isLoading && <LoadingState label="Computing citywide analysis"/>}
      <p className={styles.updating} role="status">{!summary.isLoading && (summary.isFetching || layerQuery.isFetching || shift.isFetching || downtown.isFetching) ? 'Computing citywide analysis…' : ''}</p>
      {firstError && <ErrorState error={firstError} onRetry={() => {
        const stamp = snapshotMotion()
        summaryRetry.current = { identity: statisticsIdentity, stamp, afterRevision: summary.dataUpdatedAt }
        shiftRetry.current = { identity: statisticsIdentity, stamp, afterRevision: shift.dataUpdatedAt }
        downtownRetry.current = { identity: statisticsIdentity, stamp, afterRevision: downtown.dataUpdatedAt }
        void summary.refetch(); void layerQuery.refetch(); void shift.refetch(); void downtown.refetch()
      }}/>}
      {summary.data && !summary.isLoading && (
        <>
          {summary.data.warnings.map((warning) => <div className={styles.warning} key={warning}>{warning} · excluded from spatial shift and downtown comparison</div>)}
          <div data-statistics-summary aria-busy={summary.isFetching}><MetricGrid metrics={summary.data.metrics} compact variant="headline"/></div>
          <div className={styles.workspace} aria-busy={summary.isFetching || layerQuery.isFetching}>
            <section className={styles.mapColumn}>
              <div className={styles.panelBar}>
                <div><span>Collision map</span><strong>{summary.isPlaceholderData ? 'Updating…' : `${integer.format(summary.data.metrics.collisionCount)} records`}</strong></div>
                <div className={styles.tabs} role="tablist" aria-label="Density analysis layer" onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const next = event.key === 'Home' ? 'heatmap' : event.key === 'End' ? 'kde' : state.cityLayer === 'heatmap' ? 'kde' : 'heatmap'
                  state.setCityLayer(next)
                  document.getElementById(`${next}-tab`)?.focus()
                }}>
                  <button id="heatmap-tab" role="tab" aria-controls="density-panel" tabIndex={state.cityLayer === 'heatmap' ? 0 : -1} aria-selected={state.cityLayer === 'heatmap'} onClick={() => state.setCityLayer('heatmap')}>Heatmap</button>
                  <button id="kde-tab" role="tab" aria-controls="density-panel" tabIndex={state.cityLayer === 'kde' ? 0 : -1} aria-selected={state.cityLayer === 'kde'} onClick={() => state.setCityLayer('kde')}>KDE density</button>
                </div>
              </div>
              <div id="density-panel" role="tabpanel" aria-labelledby={`${state.cityLayer}-tab`} tabIndex={0}>
                {summary.data.metrics.collisionCount === 0 ? <EmptyState title="No collisions match" body="Broaden the year range or severity filters to restore the map."/> : <CitywideMap layer={state.cityLayer} heatmap={heatmap.data} kde={kde.data} shift={shift.data} downtown={downtown.data}/>}
              </div>
              <p className={styles.mapNote}>{state.cityLayer === 'kde' ? 'KDE smooths nearby collision locations into relative density. Values describe concentration, not the probability of a future collision.' : 'Each circle summarizes collisions in a grid cell. Larger circles represent more records.'}</p>
            </section>
            <aside className={styles.analysisRail}>
              <section className={styles.analysisCard}>
                <h2 className={styles.cardLabel}>Complete-year spatial shift</h2>
                <strong ref={shiftStatistics} data-statistic={shift.data?.shiftMeters != null ? '' : undefined} className={styles.shiftValue}>{shift.data?.shiftMeters == null ? '—' : `${integer.format(shift.data.shiftMeters)} m`}</strong>
                <p>{shift.data?.status === 'available' ? `${yearSpan(shift.data.before.years)} average collision location to ${yearSpan(shift.data.after.years)} average location.` : 'The selected range needs complete years on both sides of 2020.'}</p>
                {shift.data?.excludedYears.length ? <small>Excluded: {shift.data.excludedYears.join(', ')} partial</small> : null}
              </section>
              <section className={styles.analysisCard}>
                <h2 className={styles.cardLabel}>Downtown vs rest of Seattle</h2>
                <div className={styles.seriesLegend} aria-hidden="true"><span><i className={styles.downtownSwatch}/>Downtown</span><span><i className={styles.outerSwatch}/>Rest of Seattle</span></div>
                {downtown.data && (completeDowntownYears.length ? <div className={styles.chart} role="img" aria-label="Complete-year collision comparison. Amber line shows downtown collisions. Blue line shows outer Seattle collisions.">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={completeDowntownYears} margin={{ top: 10, right: 4, bottom: 0, left: -22 }}>
                      <XAxis dataKey="year" stroke="var(--text-secondary)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }}/>
                      <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(value: number) => value >= 1000 ? `${value / 1000}k` : String(value)}/>
                      <Tooltip contentStyle={{ background: 'var(--panel-raised)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', borderRadius: 0 }}/>
                      <Line dataKey="downtownCollisions" name="Downtown" stroke="var(--caution)" dot={false} isAnimationActive={false}/>
                      <Line dataKey="outerCollisions" name="Rest of Seattle" stroke="var(--selection)" dot={false} isAnimationActive={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div> : <EmptyState title="No complete years in range" body="Choose a range with a complete year for the downtown comparison."/>)}
                {completeDowntownYears.length > 0 && <details className={styles.chartData}><summary>View comparison data</summary><div><table><caption>Complete-year collision counts</caption><thead><tr><th scope="col">Year</th><th scope="col">Downtown</th><th scope="col">Rest of Seattle</th></tr></thead><tbody>{completeDowntownYears.map((row) => <tr key={row.year}><th scope="row">{row.year}</th><td>{integer.format(row.downtownCollisions)}</td><td>{integer.format(row.outerCollisions)}</td></tr>)}</tbody></table></div></details>}
              </section>
              <section className={styles.analysisCard}>
                <h2 className={styles.cardLabel}>Downtown mean severity</h2>
                <div className={styles.splitMetric}><strong ref={downtownStatistics} data-statistic={latestCompleteDowntownYear?.downtownMeanSeverity != null ? '' : undefined}>{metricValue(latestCompleteDowntownYear?.downtownMeanSeverity ?? null, 'decimal')}</strong><span>{latestCompleteDowntownYear ? `${latestCompleteDowntownYear.year} · latest complete selected year` : downtown.data ? 'no complete year in range' : 'Loading comparison'}</span></div>
              </section>
            </aside>
          </div>
          <details data-statistics-summary className={styles.secondaryMetrics}>
            <summary>More collision measures</summary>
            <MetricGrid metrics={summary.data.metrics} variant="secondary"/>
            <p className={styles.mapNote}>Severity burden = injuries + 3 × serious injuries + 5 × fatalities. Mean severity divides this total by collisions. Neighborhood Explorer always includes every severity level.</p>
          </details>
        </>
      )}
    </div>
  )
}
