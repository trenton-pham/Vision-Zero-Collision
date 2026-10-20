import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { MAP_METRICS, parseMapMetric } from '../lib/mapMetrics'
import { api } from '../lib/api'
import { metricValue, signedPercent } from '../lib/format'
import { useDashboardParams } from '../lib/useUrlState'
import { useDatasetMeta } from '../lib/dataset'
import { MetricGrid } from '../components/MetricGrid'
import { NeighborhoodMap } from '../components/NeighborhoodMap'
import { NeighborhoodPicker } from '../components/NeighborhoodPicker'
import { ErrorState, LoadingState } from '../components/States'
import { TrendChart } from '../components/TrendChart'
import styles from './NeighborhoodExplorer.module.css'

export function NeighborhoodExplorer() {
  const state = useDashboardParams()
  const meta = useDatasetMeta()
  const location = useLocation()
  const [announcement, setAnnouncement] = useState('')
  const [resolving, setResolving] = useState(false)
  const [selectionPulse, setSelectionPulse] = useState(0)
  const [detailsOpen, setDetailsOpen] = useState(() => !window.matchMedia('(max-width: 960px)').matches)
  const resolveGeneration = useRef(0)
  const resolveController = useRef<AbortController | null>(null)
  const neighborhood = state.neighborhood
  const geo = useQuery({ queryKey: ['neighborhood-geojson'], queryFn: ({ signal }) => api.neighborhoods(signal), staleTime: Infinity })
  const summary = useQuery({
    queryKey: ['neighborhood-summary', state.startYear, state.endYear],
    queryFn: ({ signal }) => api.neighborhoodSummary(state.startYear, state.endYear, signal),
    placeholderData: keepPreviousData,
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
    state.setNeighborhood(id)
    setSelectionPulse((value) => value + 1)
    setAnnouncement(id === state.neighborhood
      ? `${name ?? id ?? 'Seattle citywide'} selected. Statistics are unchanged.`
      : id ? `${name ?? id} selected. Loading statistics.` : 'Neighborhood selection cleared. Loading Seattle citywide statistics.')
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
  const inspectorName = state.neighborhood
    ? context.data?.neighborhood.name ?? geo.data?.features.find((feature) => feature.properties.id === state.neighborhood)?.properties.name ?? 'Selected neighborhood'
    : 'Seattle citywide'
  const trendScope = inspectorName
  useEffect(() => {
    if (activeQuery.data && !activeQuery.isFetching && !activeQuery.error) {
      setAnnouncement(`${inspectorName} statistics updated for ${state.startYear} to ${state.endYear}.`)
    }
  }, [activeQuery.dataUpdatedAt, activeQuery.isFetching, activeQuery.error, inspectorName, state.startYear, state.endYear])

  function setTrendGrain(grain: 'annual' | 'monthly') {
    state.setTrendGrain(grain)
    setAnnouncement(`${grain === 'monthly' ? 'Monthly' : 'Annual'} trend displayed for ${trendScope}.`)
  }

  return (
    <div className={styles.page}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      <section className={styles.command} aria-label="Neighborhood controls">
        <div>
          <h1>Neighborhood Explorer</h1>
          <p>Explore recorded collisions across Seattle's 94 neighborhoods.</p>
        </div>
        <NeighborhoodPicker neighborhoods={geo.data} selectedId={state.neighborhood} onSelect={(id) => {
          const feature = geo.data?.features.find((item) => item.properties.id === id)
          selectManually(id, feature?.properties.name)
        }}/>
        <label className={styles.metricSelect}>Map metric
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
            <div className={styles.panelLabel}><span>{summary.isPlaceholderData ? 'Updating map for selected years…' : '94 Seattle neighborhoods'}</span><strong>{MAP_METRICS.find(([value]) => value === state.mapMetric)?.[1]}</strong></div>
            <NeighborhoodMap collection={geo.data} metrics={summary.data} metricKey={state.mapMetric} selectedId={state.neighborhood} pulseKey={selectionPulse} geometryRevision={geo.dataUpdatedAt} onResolve={resolve} busy={resolving || summary.isFetching}/>
          </section>
          <aside
            className={styles.inspector}
            aria-busy={activeQuery.isFetching}
            aria-label={state.neighborhood ? 'Selected neighborhood context' : 'Seattle citywide context'}
          >
            <div className={styles.inspectorHead}>
              <h2>{inspectorName}</h2>
              <p>{state.startYear}—{state.endYear} · all severity levels</p>
            </div>
            {activeQuery.error && <ErrorState error={activeQuery.error} onRetry={() => void activeQuery.refetch()}/>}
            <div key={activeQuery.dataUpdatedAt} className={`${styles.valuePanel} ${activeQuery.data ? styles.updated : ''}`}>
              <div className={styles.primaryBurden}>
                <span>Severity burden</span>
                <strong>{metricValue(activeQuery.data?.metrics.totalSeverity ?? null)}</strong>
                <small>{activeQuery.data ? `Mean ${metricValue(activeQuery.data.metrics.meanSeverity, 'decimal')} per collision` : <span role={activeQuery.isLoading ? 'status' : undefined}>{activeQuery.error ? 'Statistics unavailable' : `Loading ${inspectorName} statistics…`}</span>}</small>
              </div>
            </div>
            <details id="neighborhood-details" className={styles.inspectorDetails} open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
              <summary>Collision and injury details</summary>
              {activeQuery.data?.warnings.map((warning) => <div className={styles.warning} key={warning}>{warning}</div>)}
              {!activeQuery.data && meta.partialYears.some((year) => year >= state.startYear && year <= state.endYear) && <div className={styles.warning}>Partial-year observations are excluded from trend comparisons.</div>}
              <MetricGrid metrics={activeQuery.data?.metrics} variant="inspector"/>
              <details className={styles.methodNote}>
                <summary>About these measures</summary>
                <p>Severity burden = injuries + 3 × serious injuries + 5 × fatalities. It is a weighted total, not a measure of future risk.</p>
                <p>{state.neighborhood
                  ? 'Neighborhood results include all severity levels, independent of Citywide Analysis filters.'
                  : 'Seattle totals include every collision record, including records not assigned to a neighborhood. Select a neighborhood to compare local conditions.'}</p>
              </details>
            </details>
          </aside>
        </div>
      )}

      <section className={styles.trendSection} aria-label={`${trendScope} collision trend`}>
        <div className={styles.trendHead}>
          <div className={styles.trendTitle}>
            <div><h2>Collision trends</h2><p>{trendScope} · {state.trendGrain} observations</p></div>
            <div className={styles.grainControl} role="group" aria-label="Trend time interval">
              <button type="button" aria-pressed={state.trendGrain === 'annual'} onClick={() => setTrendGrain('annual')}>Annual</button>
              <button type="button" aria-pressed={state.trendGrain === 'monthly'} onClick={() => setTrendGrain('monthly')}>Monthly</button>
            </div>
          </div>
          {activeQuery.data && <div className={styles.comparison}>
            {activeQuery.data.comparison.status === 'available' ? <>
              <span>{activeQuery.data.comparison.firstPeriod.years.join(', ')} vs {activeQuery.data.comparison.lastPeriod.years.join(', ')} · annual averages</span>
              <strong className={(activeQuery.data.comparison.collisionChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(activeQuery.data.comparison.collisionChangePercent)} collisions</strong>
              <strong className={(activeQuery.data.comparison.severityChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(activeQuery.data.comparison.severityChangePercent)} burden</strong>
            </> : <><span>Trend comparison</span><strong>Insufficient complete years</strong></>}
          </div>}
        </div>
        <div className={styles.trendBody} aria-busy={activeQuery.isFetching}>
          {activeQuery.isLoading && <LoadingState label={`Loading ${trendScope} trend`}/>}
          {activeQuery.error && !activeQuery.data && <p className={styles.methodNote}>Trend unavailable. Retry the statistics request above to restore this chart.</p>}
          {activeQuery.data && <TrendChart annual={activeQuery.data.annual} monthly={activeQuery.data.monthly} grain={state.trendGrain}/>}
        </div>
      </section>
    </div>
  )
}
