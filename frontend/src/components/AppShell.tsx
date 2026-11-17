import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Slider from '@radix-ui/react-slider'
import { NavLink, Outlet } from 'react-router-dom'
import { api, ReleaseUnavailableError } from '../lib/api'
import { ReleaseProvider, useDatasetMeta } from '../lib/dataset'
import { useDashboardParams } from '../lib/useUrlState'
import { receivedThrough } from '../lib/format'
import { useTheme } from '../lib/theme'
import { ErrorState, LoadingState } from './States'
import { AnalysisIcon, MapIcon, OverviewIcon, SeattleMark } from './Icons'
import styles from './AppShell.module.css'

const CurrentFlow = lazy(() => import('./FlowViews').then((module) => ({ default: module.CurrentFlow })))

function YearRangeControl() {
  const { startYear, endYear, minimumYear, maximumYear, setYears } = useDashboardParams()
  const meta = useDatasetMeta()
  const [draftYears, setDraftYears] = useState<[number, number]>([startYear, endYear])
  useEffect(() => setDraftYears([startYear, endYear]), [startYear, endYear])
  const partial = meta.partialYears.includes(draftYears[1])
  const receivedThroughDate = receivedThrough(meta.dataAsOf)
  return (
    <div className={styles.yearControl} aria-label="Observed year range">
      <div className={styles.yearMeta}>
        <span>Observed years</span>
        <strong>{draftYears[0]}–{draftYears[1]}</strong>
      </div>
      <Slider.Root
        className={styles.slider}
        min={minimumYear}
        max={maximumYear}
        step={1}
        minStepsBetweenThumbs={0}
        value={draftYears}
        onValueChange={(values) => {
          const [start, end] = values
          if (values.length === 2 && start !== undefined && end !== undefined && Number.isFinite(start) && Number.isFinite(end)) setDraftYears([start, end])
        }}
        onValueCommit={(values) => {
          const [start, end] = values
          if (values.length === 2 && start !== undefined && end !== undefined && Number.isFinite(start) && Number.isFinite(end)) setYears(start, end)
        }}
        aria-label="Selected year range"
      >
        <Slider.Track className={styles.track}><Slider.Range className={styles.range}/></Slider.Track>
        <Slider.Thumb className={styles.thumb} aria-label="Start year" />
        <Slider.Thumb className={`${styles.thumb} ${styles.partialThumb}`} aria-label="End year" />
      </Slider.Root>
      {partial && <span className={styles.partial}>Partial through {receivedThroughDate}</span>}
    </div>
  )
}

function ShellContent({ dataAsOf, partialYears = [], children }: { dataAsOf?: string; partialYears?: number[]; children: ReactNode }) {
  const { theme, setTheme } = useTheme()
  return (
      <div className={styles.shell}>
        <aside className={styles.rail} aria-label="Primary navigation">
          <NavLink className={styles.brand} to="/" aria-label="Seattle Collision Dashboard">
            <SeattleMark />
            <span>Seattle Collision</span>
          </NavLink>
          <nav className={styles.nav}>
            <NavLink end aria-label="Overview" title="Overview" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`} to="/">
              <span className={styles.navIcon}><OverviewIcon/></span><span>Overview</span>
            </NavLink>
            <NavLink aria-label="Neighborhood Explorer" title="Neighborhood Explorer" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`} to="/neighborhoods">
              <span className={styles.navIcon}><MapIcon/></span><span>Neighborhoods</span>
            </NavLink>
            <NavLink aria-label="Citywide Analysis" title="Citywide Analysis" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`} to="/citywide">
              <span className={styles.navIcon}><AnalysisIcon/></span><span>Citywide</span>
            </NavLink>
          </nav>
          {dataAsOf && <section className={styles.widget} aria-label="Current flow">
            <span className="readout-label">Current flow</span>
            <Suspense fallback={null}><CurrentFlow/></Suspense>
          </section>}
          <section className={styles.widget} aria-label="Dataset">
            <span className="readout-label">Data as of</span>
            <strong className={styles.widgetValue}>{dataAsOf ?? 'Loading'}</strong>
            {partialYears.length > 0 && <span className={styles.widgetNote}>{partialYears.join(', ')} partial · excluded from comparisons</span>}
          </section>
          <section className={styles.widget} aria-label="Severity ramp, lower to higher burden">
            <span className="readout-label">Severity ramp</span>
            <ol className={styles.ramp} aria-hidden="true">{[1, 2, 3, 4, 5, 6].map((step) => <li key={step} style={{ background: `var(--ramp-${step})` }}/>)}</ol>
            <div className={styles.rampEnds} aria-hidden="true"><span>Lower burden</span><span>Higher</span></div>
          </section>
        </aside>
        <header className={styles.header}>
          <div className={styles.mobileBrand}><SeattleMark/><span className={styles.mobileBrandText}>Seattle Collision</span></div>
          <nav className={styles.mobileNav} aria-label="Mobile navigation">
            <NavLink end to="/">Overview</NavLink>
            <NavLink to="/neighborhoods">Neighborhoods</NavLink>
            <NavLink to="/citywide">Citywide</NavLink>
          </nav>
          <label className={styles.themeControl}>
            <span>Appearance</span>
            <select value={theme} onChange={(event) => {
              const value = event.target.value
              if (value === 'system' || value === 'light' || value === 'dark') setTheme(value)
            }}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          {dataAsOf && <YearRangeControl/>}
        </header>
        <main id="main-content" className={styles.main}>{children}</main>
      </div>
  )
}

export function AppShell() {
  const queryClient = useQueryClient()
  const recoveredRelease = useRef<string | null>(null)
  const release = useQuery({
    queryKey: ['release'],
    queryFn: ({ signal }) => api.release(signal),
    staleTime: 300_000,
    refetchInterval: 300_000,
  })
  const recoverRelease = useCallback((error: unknown) => {
    if (!(error instanceof ReleaseUnavailableError) || error.releaseId !== release.data?.releaseId || recoveredRelease.current === error.releaseId) return
    recoveredRelease.current = error.releaseId
    void queryClient.fetchQuery({ queryKey: ['release'], queryFn: ({ signal }) => api.release(signal), staleTime: 0 }).catch(() => {})
  }, [queryClient, release.data?.releaseId])

  useEffect(() => queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error') recoverRelease(event.query.state.error)
  }), [queryClient, recoverRelease])

  const content = <ShellContent dataAsOf={release.data?.meta.dataAsOf} partialYears={release.data?.meta.partialYears}>
    {release.error && <ErrorState error={release.error} onRetry={() => void release.refetch()}/>}
    {release.data ? <Outlet/> : !release.error && <LoadingState label="Loading dataset metadata"/>}
  </ShellContent>
  return release.data ? <ReleaseProvider release={release.data} recoverRelease={recoverRelease}>{content}</ReleaseProvider> : content
}
