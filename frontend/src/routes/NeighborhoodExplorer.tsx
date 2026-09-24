import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { metricValue, signedPercent } from '../lib/format'
import { useDashboardParams } from '../lib/useUrlState'
import { MetricGrid } from '../components/MetricGrid'
import { NeighborhoodMap } from '../components/NeighborhoodMap'
import { NeighborhoodPicker } from '../components/NeighborhoodPicker'
import { ErrorState, LoadingState } from '../components/States'
import { TrendChart } from '../components/TrendChart'
import styles from './NeighborhoodExplorer.module.css'

const MAP_METRICS = [
  ['collisionCount', 'Collisions'],
  ['totalSeverity', 'Severity burden'],
  ['pedestrianCollisions', 'Pedestrian-involved'],
  ['fatalities', 'Fatalities'],
]

export function NeighborhoodExplorer() {
  const state = useDashboardParams()
  const queryClient = useQueryClient()
  const [announcement, setAnnouncement] = useState('')
  const [resolving, setResolving] = useState(false)
  const [selectionPulse, setSelectionPulse] = useState(0)
  const geo = useQuery({ queryKey: ['neighborhood-geojson'], queryFn: ({ signal }) => api.neighborhoods(signal), staleTime: Infinity })
  const summary = useQuery({
    queryKey: ['neighborhood-summary', state.startYear, state.endYear],
    queryFn: ({ signal }) => api.neighborhoodSummary(state.startYear, state.endYear, signal),
  })
  const context = useQuery({
    queryKey: ['neighborhood-context', state.neighborhood, state.startYear, state.endYear],
    queryFn: ({ signal }) => api.neighborhoodContext(state.neighborhood!, state.startYear, state.endYear, signal),
    enabled: Boolean(state.neighborhood),
  })
  const citywideTrend = useQuery({
    queryKey: ['citywide-neighborhood-trend', state.startYear, state.endYear],
    queryFn: ({ signal }) => api.citywideNeighborhoodTrend(state.startYear, state.endYear, signal),
    enabled: !state.neighborhood,
  })

  function select(id: string | null, name?: string | null) {
    queryClient.removeQueries({ queryKey: ['neighborhood-context'] })
    state.setNeighborhood(id)
    setSelectionPulse((value) => value + 1)
    setAnnouncement(id ? `${name ?? id} selected. Neighborhood statistics updated.` : 'Neighborhood selection cleared. Seattle citywide statistics restored.')
  }

  async function resolve(lat: number, lng: number) {
    setResolving(true)
    try {
      const result = await api.resolveNeighborhood(lat, lng)
      select(result.id, result.name)
      if (!result.id) setAnnouncement('That map location is outside the assigned Seattle neighborhood area.')
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : 'Unable to resolve that location.')
    } finally {
      setResolving(false)
    }
  }

  const initialLoading = geo.isLoading || summary.isLoading
  const initialError = geo.error ?? summary.error
  const trendData = state.neighborhood ? context.data : citywideTrend.data
  const trendLoading = state.neighborhood ? context.isLoading : citywideTrend.isLoading
  const trendError = state.neighborhood ? context.error : citywideTrend.error
  const trendScope = context.data?.neighborhood.name ?? citywideTrend.data?.scope.name ?? (state.neighborhood ? 'Selected neighborhood' : 'Seattle citywide')
  const inspectorData = state.neighborhood ? context.data : citywideTrend.data
  const inspectorLoading = state.neighborhood ? context.isLoading : citywideTrend.isLoading
  const inspectorError = state.neighborhood ? context.error : citywideTrend.error
  const inspectorName = state.neighborhood ? context.data?.neighborhood.name : citywideTrend.data?.scope.name

  function setTrendGrain(grain: 'annual' | 'monthly') {
    state.setTrendGrain(grain)
    setAnnouncement(`${grain === 'monthly' ? 'Monthly' : 'Annual'} trend displayed for ${trendScope}.`)
  }

  return (
    <div className={styles.page}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      <section className={styles.command} aria-label="Neighborhood controls">
        <div>
          <h1>Locate burden. Read context.</h1>
          <p>Observed collision context across 94 S_HOOD neighborhoods.</p>
        </div>
        <NeighborhoodPicker neighborhoods={geo.data} selectedId={state.neighborhood} onSelect={(id) => {
          const feature = geo.data?.features.find((item) => item.properties.id === id)
          select(id, feature?.properties.name)
        }}/>
        <label className={styles.metricSelect}>MAP METRIC
          <select value={state.mapMetric} onChange={(event) => state.setMapMetric(event.target.value)}>
            {MAP_METRICS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
      </section>

      {initialLoading && <LoadingState/>}
      {initialError && <ErrorState error={initialError} onRetry={() => { void geo.refetch(); void summary.refetch() }}/>} 
      {geo.data && summary.data && (
        <div className={styles.workspace}>
          <section className={styles.mapPanel} aria-label="Neighborhood map">
            <div className={styles.panelLabel}><span>94 S_HOOD POLYGONS</span><strong>{MAP_METRICS.find(([value]) => value === state.mapMetric)?.[1]}</strong></div>
            <NeighborhoodMap collection={geo.data} metrics={summary.data} metricKey={state.mapMetric} selectedId={state.neighborhood} pulseKey={selectionPulse} onResolve={resolve} busy={resolving}/>
          </section>
          <aside
            className={`${styles.inspector} ${selectionPulse > 0 ? styles.selectionPulse : ''}`}
            key={`inspector-${selectionPulse}`}
            aria-label={state.neighborhood ? 'Selected neighborhood context' : 'Seattle citywide context'}
          >
            {inspectorLoading && <LoadingState label={state.neighborhood ? 'Loading neighborhood context' : 'Loading Seattle citywide context'}/>}
            {inspectorError && <ErrorState error={inspectorError} onRetry={() => void (state.neighborhood ? context.refetch() : citywideTrend.refetch())}/>}
            {inspectorData && inspectorName && (
              <>
                <div className={styles.inspectorHead}>
                  <span>{state.neighborhood ? 'ACTIVE NEIGHBORHOOD' : 'CITYWIDE BASELINE'}</span>
                  <h2>{inspectorName}</h2>
                  <p>{state.startYear}—{state.endYear} · all severity levels</p>
                </div>
                {inspectorData.warnings.map((warning) => <div className={styles.warning} key={warning}>{warning}</div>)}
                <div className={styles.primaryBurden}>
                  <span>SEVERITY BURDEN</span>
                  <strong>{inspectorData.metrics.totalSeverity.toLocaleString()}</strong>
                  <small>Mean {metricValue(inspectorData.metrics.meanSeverity, 'decimal')} per collision</small>
                </div>
                <MetricGrid metrics={inspectorData.metrics} variant="inspector"/>
                <div className={styles.methodNote}>
                  {state.neighborhood
                    ? 'Neighborhood results deliberately ignore Citywide Analysis severity filters.'
                    : 'Seattle totals include every collision record, including records not assigned to a neighborhood. Select a neighborhood to compare local conditions.'}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <section className={styles.trendSection} aria-label={`${trendScope} collision trend`}>
          <div className={styles.trendHead}>
            <div className={styles.trendTitle}>
              <h2>{trendScope} · {state.trendGrain} collisions and severity burden</h2>
              <div className={styles.grainControl} role="group" aria-label="Trend time interval">
                <button type="button" aria-pressed={state.trendGrain === 'annual'} onClick={() => setTrendGrain('annual')}>Annual</button>
                <button type="button" aria-pressed={state.trendGrain === 'monthly'} onClick={() => setTrendGrain('monthly')}>Monthly</button>
              </div>
            </div>
            {trendData && <div className={styles.comparison}>
              {trendData.comparison.status === 'available' ? <>
                <span>FIRST VS LAST COMPLETE 3-YEAR AVERAGE</span>
                <strong className={(trendData.comparison.collisionChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(trendData.comparison.collisionChangePercent)} collisions</strong>
                <strong className={(trendData.comparison.severityChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(trendData.comparison.severityChangePercent)} burden</strong>
              </> : <><span>TREND COMPARISON</span><strong>Insufficient complete years</strong></>}
            </div>}
          </div>
          {trendLoading && <LoadingState label={`Loading ${trendScope} trend`}/>}
          {trendError && <ErrorState error={trendError} onRetry={() => void (state.neighborhood ? context.refetch() : citywideTrend.refetch())}/>}
          {trendData && <TrendChart annual={trendData.annual} monthly={trendData.monthly} grain={state.trendGrain} pulseKey={selectionPulse}/>}
        </section>
    </div>
  )
}
