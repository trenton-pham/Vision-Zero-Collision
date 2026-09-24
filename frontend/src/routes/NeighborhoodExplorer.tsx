import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { metricValue, signedPercent } from '../lib/format'
import { useDashboardParams } from '../lib/useUrlState'
import { MetricGrid } from '../components/MetricGrid'
import { NeighborhoodMap } from '../components/NeighborhoodMap'
import { NeighborhoodPicker } from '../components/NeighborhoodPicker'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
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

  function select(id: string | null, name?: string | null) {
    queryClient.removeQueries({ queryKey: ['neighborhood-context'] })
    state.setNeighborhood(id)
    setSelectionPulse((value) => value + 1)
    setAnnouncement(id ? `${name ?? id} selected. Neighborhood statistics updated.` : 'Neighborhood selection cleared.')
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
          <aside className={`${styles.inspector} ${selectionPulse > 0 ? styles.selectionPulse : ''}`} key={`inspector-${selectionPulse}`} aria-label="Selected neighborhood context">
            {!state.neighborhood && <EmptyState title="Select a neighborhood" body="Use the map or searchable selector to open observed burden, outcomes, situational shares, and annual trends."/>}
            {state.neighborhood && context.isLoading && <LoadingState label="Loading neighborhood context"/>}
            {context.error && <ErrorState error={context.error} onRetry={() => void context.refetch()}/>} 
            {context.data && (
              <>
                <div className={styles.inspectorHead}>
                  <span>ACTIVE NEIGHBORHOOD</span>
                  <h2>{context.data.neighborhood.name}</h2>
                  <p>{state.startYear}—{state.endYear} · all severity levels</p>
                </div>
                {context.data.warnings.map((warning) => <div className={styles.warning} key={warning}>{warning}</div>)}
                <div className={styles.primaryBurden}>
                  <span>SEVERITY BURDEN</span>
                  <strong>{context.data.metrics.totalSeverity.toLocaleString()}</strong>
                  <small>Mean {metricValue(context.data.metrics.meanSeverity, 'decimal')} per collision</small>
                </div>
                <MetricGrid metrics={context.data.metrics} variant="inspector"/>
                <div className={styles.methodNote}>Neighborhood results deliberately ignore Citywide Analysis severity filters.</div>
              </>
            )}
          </aside>
        </div>
      )}

      {context.data && (
        <section className={styles.trendSection}>
          <div className={styles.trendHead}>
            <div><h2>Annual collisions and severity burden</h2></div>
            <div className={styles.comparison}>
              {context.data.comparison.status === 'available' ? <>
                <span>FIRST VS LAST COMPLETE 3-YEAR AVERAGE</span>
                <strong className={(context.data.comparison.collisionChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(context.data.comparison.collisionChangePercent)} collisions</strong>
                <strong className={(context.data.comparison.severityChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(context.data.comparison.severityChangePercent)} burden</strong>
              </> : <><span>TREND COMPARISON</span><strong>Insufficient complete years</strong></>}
            </div>
          </div>
          <TrendChart annual={context.data.annual} pulseKey={selectionPulse}/>
        </section>
      )}
    </div>
  )
}
