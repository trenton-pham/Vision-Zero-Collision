import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { MAP_METRICS, parseMapMetric } from '../lib/mapMetrics'
import { api } from '../lib/api'
import { combineNeighborhoods } from '../lib/combineNeighborhoods'
import { metricValue, signedPercent } from '../lib/format'
import { useDashboardParams } from '../lib/useUrlState'
import { useDatasetMeta, useRelease } from '../lib/dataset'
import { snapshotMotion, useContentEntrance, useGrainReveal, useRouteEntrance, useStatisticsFade, type MotionStamp, type StatisticsRetry } from '../lib/motion'
import { MetricGrid } from '../components/MetricGrid'
import { NeighborhoodMap } from '../components/NeighborhoodMap'
import { NeighborhoodPicker } from '../components/NeighborhoodPicker'
import { ErrorState, LoadingState } from '../components/States'
import { TrendChart } from '../components/TrendChart'
import styles from './NeighborhoodExplorer.module.css'

export function NeighborhoodExplorer() {
  const state = useDashboardParams()
  const meta = useDatasetMeta()
  const { release, recoverRelease } = useRelease()
  const location = useLocation()
  const entrance = useRouteEntrance()
  const [announcement, setAnnouncement] = useState('')
  const [resolving, setResolving] = useState(false)
  const [selectionPulse, setSelectionPulse] = useState(0)
  const [detailsOpen, setDetailsOpen] = useState(() => !window.matchMedia('(max-width: 960px)').matches)
  const normalizationNotice = useRef('')
  const resolveGeneration = useRef(0)
  const resolveController = useRef<AbortController | null>(null)
  const neighborhoods = state.neighborhoods
  const neighborhood = neighborhoods.length === 1 ? neighborhoods[0] : undefined
  const geo = useQuery({ queryKey: ['neighborhood-geojson', release.releaseId], queryFn: ({ signal }) => api.neighborhoods(release, signal), staleTime: Infinity })
  const explorer = useQuery({
    queryKey: ['explorer', release.releaseId, state.startYear, state.endYear],
    queryFn: ({ signal }) => api.explorer(release, state.startYear, state.endYear, signal),
    placeholderData: (previous, query) => query?.queryKey[1] === release.releaseId ? previous : undefined,
    staleTime: Infinity,
  })
  const summary = { ...explorer, data: explorer.data?.summary }
  const citywideTrend = {
    ...explorer,
    data: explorer.isPlaceholderData ? undefined : explorer.data?.citywideTrend,
    isSuccess: explorer.isSuccess && !explorer.isPlaceholderData,
    isLoading: explorer.isLoading || explorer.isPlaceholderData,
  }
  const context = useQuery({
    queryKey: ['neighborhood-context', release.releaseId, neighborhood, state.startYear, state.endYear],
    queryFn: neighborhood ? ({ signal }) => api.neighborhoodContext(release, neighborhood, state.startYear, state.endYear, signal) : skipToken,
    staleTime: Infinity,
  })

  const combined = useQuery({
    queryKey: ['neighborhood-series', release.releaseId],
    queryFn: neighborhoods.length > 1 ? ({ signal }) => {
      if (!Object.hasOwn(release.files, 'neighborhood-series.json')) throw new Error('Combined neighborhood statistics require a newer dataset release. Single-neighborhood results are still available.')
      return api.neighborhoodSeries(release, signal)
    } : skipToken,
    select: (series) => combineNeighborhoods(series, neighborhoods, state.startYear, state.endYear, meta),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!geo.data) return
    const known = new Set(geo.data.features.map((feature) => feature.properties.id))
    const valid = neighborhoods.filter((id) => known.has(id))
    if (valid.length === neighborhoods.length) return
    state.setNeighborhoods(valid, snapshotMotion(), true)
    normalizationNotice.current = 'Unknown neighborhoods were removed from the selection. '
    setAnnouncement(normalizationNotice.current)
  }, [geo.data, neighborhoods, state.setNeighborhoods])

  function select(id: string | null, name?: string | null, motion?: MotionStamp) {
    const removed = id !== null && neighborhoods.includes(id)
    const next = id === null ? [] : removed ? neighborhoods.filter((selected) => selected !== id) : [...neighborhoods, id]
    state.setNeighborhoods(next, motion)
    setSelectionPulse((value) => value + 1)
    setAnnouncement(next.length === 0
      ? 'Neighborhood selection cleared. Loading Seattle citywide statistics.'
      : `${name ?? id} ${removed ? 'removed' : 'selected'}. Loading statistics.`)
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
  }, [location.key, release.releaseId])

  function selectManually(id: string | null, name?: string | null) {
    invalidateResolution()
    setResolving(false)
    select(id, name)
  }

  async function resolve(lat: number, lng: number) {
    const motion = snapshotMotion()
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
      const result = await api.resolveNeighborhood(release, lat, lng, controller.signal)
      if (!isCurrent()) return
      if (result.id) currentSelection.current.select(result.id, result.name, motion)
      else setAnnouncement('That map location is outside the assigned Seattle neighborhood area.')
    } catch (error) {
      if (isCurrent()) {
        recoverRelease(error)
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
  const activeQuery = neighborhoods.length > 1 ? combined : neighborhood ? context : citywideTrend
  const statisticsIdentity = JSON.stringify([neighborhoods, state.startYear, state.endYear])
  const statisticsRetry = useRef<StatisticsRetry | null>(null)
  const statistics = useStatisticsFade({ identity: statisticsIdentity, revision: activeQuery.dataUpdatedAt, ready: activeQuery.isSuccess, failed: activeQuery.isError && !activeQuery.isFetching, retry: statisticsRetry.current })
  const mapEntrance = useContentEntrance<HTMLElement>(!!geo.data && summary.isSuccess && !summary.isPlaceholderData, entrance)
  const inspectorEntrance = useContentEntrance<HTMLDivElement>(activeQuery.isSuccess, entrance)
  const trendEntrance = useContentEntrance<HTMLDivElement>(activeQuery.isSuccess, entrance)
  const grainReveal = useGrainReveal(state.trendGrain)
  const inspectorName = neighborhoods.length > 1 ? `${neighborhoods.length} neighborhoods combined`
    : neighborhood ? context.data?.neighborhood.name ?? geo.data?.features.find((feature) => feature.properties.id === neighborhood)?.properties.name ?? 'Selected neighborhood'
    : 'Seattle citywide'
  const trendScope = inspectorName
  useEffect(() => {
    if (activeQuery.data && !activeQuery.isFetching && !activeQuery.error) {
      setAnnouncement(`${normalizationNotice.current}${inspectorName} statistics updated for ${state.startYear} to ${state.endYear}.`)
      normalizationNotice.current = ''
    }
  }, [activeQuery.dataUpdatedAt, activeQuery.isFetching, activeQuery.error, inspectorName, statisticsIdentity, state.startYear, state.endYear])

  function setTrendGrain(grain: 'annual' | 'monthly') {
    state.setTrendGrain(grain)
    setAnnouncement(`${grain === 'monthly' ? 'Monthly' : 'Annual'} trend displayed for ${trendScope}.`)
  }

  return (
    <div ref={statistics} className={styles.page}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      <section className={styles.command} aria-label="Neighborhood controls">
        <div>
          <h1>Neighborhood Explorer</h1>
          <p>Explore recorded collisions across Seattle's 94 neighborhoods.</p>
        </div>
        <NeighborhoodPicker neighborhoods={geo.data} selectedIds={neighborhoods} onSelect={(id) => {
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
          <section ref={mapEntrance} className={styles.mapPanel} aria-label="Neighborhood map">
            <div className={styles.panelLabel}><span>{summary.isPlaceholderData ? 'Updating map for selected years…' : '94 Seattle neighborhoods'}</span><strong>{MAP_METRICS.find(([value]) => value === state.mapMetric)?.[1]}</strong></div>
            <NeighborhoodMap collection={geo.data} metrics={summary.data} metricKey={state.mapMetric} selectedIds={neighborhoods} pulseKey={selectionPulse} geometryRevision={geo.dataUpdatedAt} onResolve={resolve} busy={resolving || summary.isFetching}/>
          </section>
          <aside
            className={styles.inspector}
            aria-busy={activeQuery.isFetching}
            aria-label={neighborhoods.length > 0 ? 'Selected neighborhood context' : 'Seattle citywide context'}
          >
            <div className={styles.inspectorHead}>
              <h2>{inspectorName}</h2>
              <p>{state.startYear}—{state.endYear} · all severity levels</p>
            </div>
            {activeQuery.error && <ErrorState error={activeQuery.error} onRetry={() => {
              statisticsRetry.current = { identity: statisticsIdentity, stamp: snapshotMotion(), afterRevision: activeQuery.dataUpdatedAt }
              void activeQuery.refetch()
            }}/>}
            <div ref={inspectorEntrance}>
              <div className={styles.valuePanel}>
                <div className={styles.primaryBurden}>
                  <span>Severity burden</span>
                  <strong data-statistic>{metricValue(activeQuery.data?.metrics.totalSeverity ?? null)}</strong>
                  <small data-statistic>{activeQuery.data ? `Mean ${metricValue(activeQuery.data.metrics.meanSeverity, 'decimal')} per collision` : <span role={activeQuery.isLoading ? 'status' : undefined}>{activeQuery.error ? 'Statistics unavailable' : `Loading ${inspectorName} statistics…`}</span>}</small>
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
                  <p>{neighborhoods.length > 0
                    ? 'Neighborhood results include all severity levels, independent of Citywide Analysis filters. Combined totals include only collisions assigned to the selected neighborhoods.'
                    : 'Seattle totals include every collision record, including records not assigned to a neighborhood. Select a neighborhood to compare local conditions.'}</p>
                </details>
              </details>
            </div>
          </aside>
        </div>
      )}

      <section data-motion-surface className={styles.trendSection} aria-label={`${trendScope} collision trend`}>
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
              <strong data-statistic className={(activeQuery.data.comparison.collisionChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(activeQuery.data.comparison.collisionChangePercent)} collisions</strong>
              <strong data-statistic className={(activeQuery.data.comparison.severityChangePercent ?? 0) > 0 ? styles.bad : ''}>{signedPercent(activeQuery.data.comparison.severityChangePercent)} burden</strong>
            </> : <><span>Trend comparison</span><strong>Insufficient complete years</strong></>}
          </div>}
        </div>
        <div ref={trendEntrance} className={styles.trendBody} aria-busy={activeQuery.isFetching}>
          {activeQuery.isLoading && <LoadingState label={`Loading ${trendScope} trend`}/>}
          {activeQuery.error && !activeQuery.data && <p className={styles.methodNote}>Trend unavailable. Retry the statistics request above to restore this chart.</p>}
          {activeQuery.data && <TrendChart chartRef={grainReveal} annual={activeQuery.data.annual} monthly={activeQuery.data.monthly} grain={state.trendGrain}/>}
        </div>
      </section>
    </div>
  )
}
