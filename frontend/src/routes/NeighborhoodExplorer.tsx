import { useLayoutEffect, useRef, useState } from 'react'
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { MAP_METRICS, parseMapMetric } from '../lib/mapMetrics'
import { api } from '../lib/api'
import { metricValue, signedPercent } from '../lib/format'
import { useDashboardParams } from '../lib/useUrlState'
import { MetricGrid } from '../components/MetricGrid'
import { NeighborhoodMap } from '../components/NeighborhoodMap'
import { NeighborhoodPicker } from '../components/NeighborhoodPicker'
import { ErrorState, LoadingState } from '../components/States'
import { TrendChart } from '../components/TrendChart'
import styles from './NeighborhoodExplorer.module.css'

export function NeighborhoodExplorer() {
  const state = useDashboardParams()
  const queryClient = useQueryClient()
  const location = useLocation()
  const [announcement, setAnnouncement] = useState('')
  const [resolving, setResolving] = useState(false)
  const [selectionPulse, setSelectionPulse] = useState(0)
  const resolveGeneration = useRef(0)
  const resolveController = useRef<AbortController | null>(null)
  const neighborhood = state.neighborhood
  const geo = useQuery({ queryKey: ['neighborhood-geojson'], queryFn: ({ signal }) => api.neighborhoods(signal), staleTime: Infinity })
  const summary = useQuery({
    queryKey: ['neighborhood-summary', state.startYear, state.endYear],
    queryFn: ({ signal }) => api.neighborhoodSummary(state.startYear, state.endYear, signal),
  })
  const context = useQuery({
    queryKey: ['neighborhood-context', state.neighborhood, state.startYear, state.endYear],
    queryFn: neighborhood ? ({ signal }) => api.neighborhoodContext(neighborhood, state.startYear, state.endYear, signal) : skipToken,
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

  const currentSelection = useRef({ select, location })
  useLayoutEffect(() => { currentSelection.current = { select, location } })

  function invalidateResolution() {
    resolveGeneration.current += 1
    resolveController.current?.abort()
    resolveController.current = null
  }

  useLayoutEffect(() => {
    invalidateResolution()
    setResolving(false)
    return invalidateResolution
  }, [location.key])

  function selectManually(id: string | null, name?: string | null) {
    invalidateResolution()
    setResolving(false)
    select(id, name)
  }

  async function resolve(lat: number, lng: number) {
    invalidateResolution()
    const committedLocation = currentSelection.current.location
    const requestLocation = `${committedLocation.pathname}${committedLocation.search}${committedLocation.hash}`
    const matchesLocation = () => requestLocation === `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (!matchesLocation()) {
      setResolving(false)
      return
    }
    const generation = resolveGeneration.current
    const controller = new AbortController()
    resolveController.current = controller
    const isCurrent = () => generation === resolveGeneration.current && !controller.signal.aborted && matchesLocation()
    setResolving(true)
    try {
      const result = await api.resolveNeighborhood(lat, lng, controller.signal)
      if (!isCurrent()) return
      currentSelection.current.select(result.id, result.name)
      if (!result.id) setAnnouncement('That map location is outside the assigned Seattle neighborhood area.')
    } catch (error) {
      if (isCurrent()) {
        setAnnouncement(error instanceof Error ? error.message : 'Unable to resolve that location.')
      }
    } finally {
      if (isCurrent()) {
        resolveController.current = null
        setResolving(false)
      }
    }
  }

  const initialLoading = geo.isLoading || summary.isLoading
  const initialError = geo.error ?? summary.error
  const activeQuery = state.neighborhood ? context : citywideTrend
  const trendScope = context.data?.neighborhood.name ?? citywideTrend.data?.scope.name ?? (state.neighborhood ? 'Selected neighborhood' : 'Seattle citywide')
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
          selectManually(id, feature?.properties.name)
        }}/>
        <label className={styles.metricSelect}>MAP METRIC
          <select value={state.mapMetric} onChange={(event) => state.setMapMetric(parseMapMetric(event.target.value))}>
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
            <NeighborhoodMap collection={geo.data} metrics={summary.data} metricKey={state.mapMetric} selectedId={state.neighborhood} pulseKey={selectionPulse} geometryRevision={geo.dataUpdatedAt} onResolve={resolve} busy={resolving}/>
          </section>
          <aside
            className={`${styles.inspector} ${selectionPulse > 0 ? styles.selectionPulse : ''}`}
            key={`inspector-${selectionPulse}`}
            aria-label={state.neighborhood ? 'Selected neighborhood context' : 'Seattle citywide context'}
          >
            {activeQuery.isLoading && <LoadingState label={state.neighborhood ? 'Loading neighborhood context' : 'Loading Seattle citywide context'}/>}
            {activeQuery.error && <ErrorState error={activeQuery.error} onRetry={() => void activeQuery.refetch()}/>}
            {activeQuery.data && inspectorName && (
              <>
                <div className={styles.inspectorHead}>
                  <span>{state.neighborhood ? 'ACTIVE NEIGHBORHOOD' : 'CITYWIDE BASELINE'}</span>
                  <h2>{inspectorName}</h2>
                  <p>{state.startYear}—{state.endYear} · all severity levels</p>
                </div>
                {activeQuery.data.warnings.map((warning) => <div className={styles.warning} key={warning}>{warning}</div>)}
                <div className={styles.primaryBurden}>
                  <span>SEVERITY BURDEN</span>
                  <strong>{activeQuery.data.metrics.totalSeverity.toLocaleString()}</strong>
                  <small>Mean {metricValue(activeQuery.data.metrics.meanSeverity, 'decimal')} per collision</small>
                </div>
                <MetricGrid metrics={activeQuery.data.metrics} variant="inspector"/>
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
            {activeQuery.data && <div className={styles.comparison}>
              {activeQuery.data.comparison.status === 'available' ? <>
                <span>FIRST VS LAST COMPLETE 3-YEAR AVERAGE</span>
                <strong className={(activeQuery.data.comparison.collisionChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(activeQuery.data.comparison.collisionChangePercent)} collisions</strong>
                <strong className={(activeQuery.data.comparison.severityChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(activeQuery.data.comparison.severityChangePercent)} burden</strong>
              </> : <><span>TREND COMPARISON</span><strong>Insufficient complete years</strong></>}
            </div>}
          </div>
          {activeQuery.isLoading && <LoadingState label={`Loading ${trendScope} trend`}/>}
          {activeQuery.error && <ErrorState error={activeQuery.error} onRetry={() => void activeQuery.refetch()}/>}
          {activeQuery.data && <TrendChart annual={activeQuery.data.annual} monthly={activeQuery.data.monthly} grain={state.trendGrain} pulseKey={selectionPulse}/>}
        </section>
    </div>
  )
}
